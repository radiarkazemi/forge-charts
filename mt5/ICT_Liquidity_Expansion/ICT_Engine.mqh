//+------------------------------------------------------------------+
//| ICT_Engine.mqh                                                   |
//| Standalone ICT: Sweep SSL/BSL -> MSS -> FVG -> opposing liquidity|
//| NOT part of TRH.                                                 |
//+------------------------------------------------------------------+
#ifndef ICT_ENGINE_MQH
#define ICT_ENGINE_MQH

#define ICT_ENGINE_VERSION 100
#define ICT_MAX_PIVOTS 40
#define ICT_ATR_LEN    14

#define ICT_DIR_LONG  1
#define ICT_DIR_SHORT -1

struct IctPivot
{
   double price;
   int    bar;
};

struct IctSetup
{
   int      dir;        // 1 long, -1 short
   double   entry;
   double   sl;
   double   tp;
   double   sweepPrice; // raided liquidity
   double   fvgTop;
   double   fvgBot;
   double   mssLevel;
   datetime barTime;
   int      barIndex;
};

struct IctConfig
{
   int    pivotPeriod;
   double minSweepAtr;      // how far beyond pivot counts as raid
   double minDispAtr;       // min MSS displacement body (ATRx)
   double minFvgAtr;        // min FVG size (ATRx)
   int    maxMssBars;       // bars after sweep to find MSS
   int    maxFvgBars;       // bars after MSS to find FVG
   bool   requireFvgRetest;
   int    maxRetestBars;
   double slPadAtr;
   double riskReward;       // fallback if no opposing liq
   bool   useOpposingLiq;   // TP = next opposing swing
   double liqExtendAtr;     // min distance for opposing liq
   int    cooldownBars;
};

void IctDefaultConfig(IctConfig &cfg)
{
   cfg.pivotPeriod      = 5;
   cfg.minSweepAtr      = 0.05;
   cfg.minDispAtr       = 0.40;
   cfg.minFvgAtr        = 0.10;
   cfg.maxMssBars       = 12;
   cfg.maxFvgBars       = 10;
   cfg.requireFvgRetest = true;
   cfg.maxRetestBars    = 10;
   cfg.slPadAtr         = 0.08;
   cfg.riskReward       = 3.0;
   cfg.useOpposingLiq   = true;
   cfg.liqExtendAtr     = 1.5;
   cfg.cooldownBars     = 40;
}

double IctCalcATR(const int i, const double &h[], const double &l[], const double &c[])
{
   if(i < 1) return h[i] - l[i];
   int start = MathMax(1, i - ICT_ATR_LEN + 1);
   double sum = 0.0;
   for(int j = start; j <= i; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      sum += tr;
   }
   return sum / (i - start + 1);
}

bool IctIsPivotLow(const int i, const int p, const double &l[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
   {
      if(l[i] > l[i - k] || l[i] >= l[i + k]) return false;
   }
   return true;
}

bool IctIsPivotHigh(const int i, const int p, const double &h[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
   {
      if(h[i] < h[i - k] || h[i] <= h[i + k]) return false;
   }
   return true;
}

void IctPushPivot(IctPivot &arr[], int &n, const double price, const int bar)
{
   if(n < ICT_MAX_PIVOTS)
   {
      arr[n].price = price;
      arr[n].bar = bar;
      n++;
      return;
   }
   for(int i = 1; i < ICT_MAX_PIVOTS; i++) arr[i - 1] = arr[i];
   arr[ICT_MAX_PIVOTS - 1].price = price;
   arr[ICT_MAX_PIVOTS - 1].bar = bar;
}

bool IctLastPivot(const IctPivot &arr[], const int n, const int beforeBar,
                  const int lookback, const int minAge, const bool wantLow, double &outPrice)
{
   outPrice = 0;
   bool found = false;
   for(int i = n - 1; i >= 0; i--)
   {
      if(arr[i].bar >= beforeBar) continue;
      if(beforeBar - arr[i].bar < minAge) continue;
      if(beforeBar - arr[i].bar > lookback) break;
      outPrice = arr[i].price;
      found = true;
      break;
   }
   return found;
}

bool IctNextLiqHigh(const IctPivot &arr[], const int n, const double from,
                    const double minDist, double &outPrice)
{
   outPrice = 0;
   bool found = false;
   for(int i = 0; i < n; i++)
   {
      if(arr[i].price <= from + minDist) continue;
      if(!found || arr[i].price < outPrice)
      {
         outPrice = arr[i].price;
         found = true;
      }
   }
   return found;
}

bool IctNextLiqLow(const IctPivot &arr[], const int n, const double from,
                   const double minDist, double &outPrice)
{
   outPrice = 0;
   bool found = false;
   for(int i = 0; i < n; i++)
   {
      if(arr[i].price >= from - minDist) continue;
      if(!found || arr[i].price > outPrice)
      {
         outPrice = arr[i].price;
         found = true;
      }
   }
   return found;
}

// ICT model: raid liquidity -> MSS -> FVG (-> optional retest) -> TP opposing liq
// Never confirms on forming tip bar (rates-1).
int IctScanSetups(const int rates,
                  const datetime &time[],
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[],
                  const IctConfig &cfg,
                  IctSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(rates < 120) return 0;

   IctPivot pivHi[ICT_MAX_PIVOTS];
   IctPivot pivLo[ICT_MAX_PIVOTS];
   int nHi = 0, nLo = 0;

   // phase: 0 idle, 1 wait MSS, 2 wait FVG, 3 wait retest
   int    phase = 0;
   int    pendDir = 0;
   double sweepPx = 0;
   double mssLevel = 0;
   double fvgTop = 0, fvgBot = 0;
   double sweepExt = 0;
   int    sweepBar = -1;
   int    mssBar = -1;
   int    fvgBar = -1;
   int    lastSetupBar = -9999;
   int    nSetups = 0;
   int    p = cfg.pivotPeriod;
   int    lastClosed = rates - 2;
   if(lastClosed < 50) return 0;

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = IctCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && IctIsPivotLow(pivI, p, low, rates))
         IctPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && IctIsPivotHigh(pivI, p, high, rates))
         IctPushPivot(pivHi, nHi, high[pivI], pivI);

      if(phase == 1 && (i - sweepBar) > cfg.maxMssBars) { phase = 0; pendDir = 0; }
      if(phase == 2 && (i - mssBar) > cfg.maxFvgBars)  { phase = 0; pendDir = 0; }
      if(phase == 3 && (i - fvgBar) > cfg.maxRetestBars){ phase = 0; pendDir = 0; }

      double huntLo = 0, huntHi = 0;
      bool hasLo = IctLastPivot(pivLo, nLo, i, 100, p, true, huntLo);
      bool hasHi = IctLastPivot(pivHi, nHi, i, 100, p, false, huntHi);

      bool canStart = (phase == 0) && (i - lastSetupBar >= cfg.cooldownBars);

      // SSL raid (bullish setup): take out swing low, close back above
      bool sslRaid = canStart && hasLo &&
         low[i] < huntLo - a * cfg.minSweepAtr &&
         close[i] > huntLo;

      // BSL raid (bearish setup): take out swing high, close back below
      bool bslRaid = canStart && hasHi &&
         high[i] > huntHi + a * cfg.minSweepAtr &&
         close[i] < huntHi;

      if(sslRaid)
      {
         phase = 1; pendDir = ICT_DIR_LONG;
         sweepPx = huntLo; sweepExt = low[i]; sweepBar = i;
         mssLevel = 0; mssBar = -1; fvgBar = -1;
         // interim MSS reference: most recent swing high before raid
         if(hasHi) mssLevel = huntHi;
      }
      else if(bslRaid)
      {
         phase = 1; pendDir = ICT_DIR_SHORT;
         sweepPx = huntHi; sweepExt = high[i]; sweepBar = i;
         mssLevel = 0; mssBar = -1; fvgBar = -1;
         if(hasLo) mssLevel = huntLo;
      }

      if(phase == 0) continue;

      if(pendDir == ICT_DIR_LONG && low[i] < sweepExt) sweepExt = low[i];
      if(pendDir == ICT_DIR_SHORT && high[i] > sweepExt) sweepExt = high[i];

      double body = MathAbs(close[i] - open[i]);

      // Phase 1: Market Structure Shift (displacement through mssLevel)
      if(phase == 1 && i > sweepBar)
      {
         // Update local structure: track post-sweep swing for tighter MSS
         if(pendDir == ICT_DIR_LONG)
         {
            // any higher pivot high after sweep becomes better MSS level
            for(int k = nHi - 1; k >= 0; k--)
            {
               if(pivHi[k].bar <= sweepBar) break;
               if(pivHi[k].bar < i) { mssLevel = pivHi[k].price; break; }
            }
            // fallback: use max high between sweep and now-1 as structure
            if(mssLevel <= 0)
            {
               double mx = high[sweepBar];
               for(int k = sweepBar; k < i; k++) if(high[k] > mx) mx = high[k];
               mssLevel = mx;
            }

            bool mss = close[i] > mssLevel && close[i] > open[i] &&
                       body >= a * cfg.minDispAtr;
            if(mss)
            {
               phase = 2;
               mssBar = i;
            }
         }
         else
         {
            for(int k = nLo - 1; k >= 0; k--)
            {
               if(pivLo[k].bar <= sweepBar) break;
               if(pivLo[k].bar < i) { mssLevel = pivLo[k].price; break; }
            }
            if(mssLevel <= 0)
            {
               double mn = low[sweepBar];
               for(int k = sweepBar; k < i; k++) if(low[k] < mn) mn = low[k];
               mssLevel = mn;
            }

            bool mss = close[i] < mssLevel && close[i] < open[i] &&
                       body >= a * cfg.minDispAtr;
            if(mss)
            {
               phase = 2;
               mssBar = i;
            }
         }
         continue;
      }

      // Phase 2: FVG in displacement direction
      if(phase == 2 && i >= 2 && i >= mssBar)
      {
         bool found = false;
         if(pendDir == ICT_DIR_LONG)
         {
            double bot = high[i - 2];
            double top = low[i];
            if(top - bot >= a * cfg.minFvgAtr)
            {
               fvgBot = bot; fvgTop = top; found = true;
            }
         }
         else
         {
            double top = low[i - 2];
            double bot = high[i];
            if(top - bot >= a * cfg.minFvgAtr)
            {
               fvgBot = bot; fvgTop = top; found = true;
            }
         }

         if(found)
         {
            fvgBar = i;
            if(cfg.requireFvgRetest)
            {
               phase = 3;
               continue;
            }
            // fire immediately at FVG mid
            double entry = (fvgTop + fvgBot) * 0.5;
            double pad = a * cfg.slPadAtr;
            IctSetup s;
            bool ok = false;
            if(pendDir == ICT_DIR_LONG)
            {
               double sl = sweepExt - pad;
               if(entry > sl)
               {
                  double risk = entry - sl;
                  double tp = entry + risk * cfg.riskReward;
                  double liq;
                  if(cfg.useOpposingLiq &&
                     IctNextLiqHigh(pivHi, nHi, entry, a * cfg.liqExtendAtr, liq))
                     tp = MathMax(tp, liq);
                  s.dir = ICT_DIR_LONG; s.entry = entry; s.sl = sl; s.tp = tp;
                  ok = true;
               }
            }
            else
            {
               double sl = sweepExt + pad;
               if(sl > entry)
               {
                  double risk = sl - entry;
                  double tp = entry - risk * cfg.riskReward;
                  double liq;
                  if(cfg.useOpposingLiq &&
                     IctNextLiqLow(pivLo, nLo, entry, a * cfg.liqExtendAtr, liq))
                     tp = MathMin(tp, liq);
                  s.dir = ICT_DIR_SHORT; s.entry = entry; s.sl = sl; s.tp = tp;
                  ok = true;
               }
            }
            if(ok)
            {
               s.sweepPrice = sweepPx;
               s.fvgTop = fvgTop; s.fvgBot = fvgBot;
               s.mssLevel = mssLevel;
               s.barIndex = i; s.barTime = time[i];
               ArrayResize(outSetups, nSetups + 1);
               outSetups[nSetups] = s;
               nSetups++;
               lastSetupBar = i;
            }
            phase = 0; pendDir = 0;
         }
         continue;
      }

      // Phase 3: retest FVG then confirm
      if(phase == 3 && i > fvgBar)
      {
         bool confirmed = false;
         if(pendDir == ICT_DIR_LONG)
         {
            bool retested = (low[i] <= fvgTop && low[i] >= fvgBot - a * 0.05);
            confirmed = retested && close[i] > open[i] &&
                        close[i] >= (fvgBot + fvgTop) * 0.5;
         }
         else
         {
            bool retested = (high[i] >= fvgBot && high[i] <= fvgTop + a * 0.05);
            confirmed = retested && close[i] < open[i] &&
                        close[i] <= (fvgBot + fvgTop) * 0.5;
         }
         if(!confirmed) continue;

         double entry = (fvgTop + fvgBot) * 0.5;
         double pad = a * cfg.slPadAtr;
         IctSetup s;
         if(pendDir == ICT_DIR_LONG)
         {
            double sl = sweepExt - pad;
            if(entry <= sl) { phase = 0; pendDir = 0; continue; }
            double risk = entry - sl;
            double tp = entry + risk * cfg.riskReward;
            double liq;
            if(cfg.useOpposingLiq &&
               IctNextLiqHigh(pivHi, nHi, entry, a * cfg.liqExtendAtr, liq))
               tp = MathMax(tp, liq);
            s.dir = ICT_DIR_LONG; s.entry = entry; s.sl = sl; s.tp = tp;
         }
         else
         {
            double sl = sweepExt + pad;
            if(sl <= entry) { phase = 0; pendDir = 0; continue; }
            double risk = sl - entry;
            double tp = entry - risk * cfg.riskReward;
            double liq;
            if(cfg.useOpposingLiq &&
               IctNextLiqLow(pivLo, nLo, entry, a * cfg.liqExtendAtr, liq))
               tp = MathMin(tp, liq);
            s.dir = ICT_DIR_SHORT; s.entry = entry; s.sl = sl; s.tp = tp;
         }

         s.sweepPrice = sweepPx;
         s.fvgTop = fvgTop; s.fvgBot = fvgBot;
         s.mssLevel = mssLevel;
         s.barIndex = i; s.barTime = time[i];
         ArrayResize(outSetups, nSetups + 1);
         outSetups[nSetups] = s;
         nSetups++;
         lastSetupBar = i;
         phase = 0; pendDir = 0;
      }
   }

   return nSetups;
}

#endif
//+------------------------------------------------------------------+
