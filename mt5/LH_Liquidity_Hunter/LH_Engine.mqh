//+------------------------------------------------------------------+
//| LH_Engine.mqh                                                    |
//| Liquidity Hunter — our strategy (standalone, not TRH / not ICT)  |
//|                                                                  |
//| Model:                                                           |
//|   1) Map BSL / SSL (swing liquidity)                             |
//|   2) Raid — market hunts that liquidity                          |
//|   3) CISD — change in state of delivery                          |
//|   4) MSS / BOS — structure confirms the shift                    |
//|   5) FVG — imbalance = entry zone                                |
//|   6) SL beyond raided liquidity · TP = opposing liquidity        |
//+------------------------------------------------------------------+
#ifndef LH_ENGINE_MQH
#define LH_ENGINE_MQH

#define LH_ENGINE_VERSION 100
#define LH_MAX_PIVOTS 40
#define LH_ATR_LEN    14

#define LH_DIR_LONG  1
#define LH_DIR_SHORT -1

#define LH_STRUCT_MSS 1
#define LH_STRUCT_BOS 2

struct LhPivot
{
   double price;
   int    bar;
};

struct LhSetup
{
   int      dir;         // 1 long, -1 short
   double   entry;
   double   sl;
   double   tp;
   double   sweepPrice;  // raided BSL/SSL
   double   sweepExt;    // wick extreme of the hunt
   double   fvgTop;
   double   fvgBot;
   double   mssLevel;    // structure level broken
   double   cisdLevel;   // delivery open that flipped
   int      structType;  // LH_STRUCT_MSS / BOS
   datetime barTime;
   int      barIndex;
};

struct LhConfig
{
   int    pivotPeriod;
   double minSweepAtr;
   double minDispAtr;
   double minFvgAtr;
   int    maxCisdBars;       // bars after raid for CISD
   int    maxStructBars;     // bars after CISD for MSS/BOS
   int    maxFvgBars;        // bars after structure for FVG
   bool   requireFvgRetest;
   int    maxRetestBars;
   bool   requireCisd;       // CISD required before structure
   bool   allowBos;          // allow internal BOS as structure (else MSS only)
   double slPadAtr;
   double riskReward;
   bool   useOpposingLiq;
   double liqExtendAtr;
   int    cooldownBars;
};

void LhDefaultConfig(LhConfig &cfg)
{
   cfg.pivotPeriod      = 5;
   cfg.minSweepAtr      = 0.05;
   cfg.minDispAtr       = 0.40;
   cfg.minFvgAtr        = 0.10;
   cfg.maxCisdBars      = 8;
   cfg.maxStructBars    = 12;
   cfg.maxFvgBars       = 10;
   cfg.requireFvgRetest = true;
   cfg.maxRetestBars    = 10;
   cfg.requireCisd      = true;
   cfg.allowBos         = true;
   cfg.slPadAtr         = 0.08;
   cfg.riskReward       = 3.0;
   cfg.useOpposingLiq   = true;
   cfg.liqExtendAtr     = 1.5;
   cfg.cooldownBars     = 40;
}

double LhCalcATR(const int i, const double &h[], const double &l[], const double &c[])
{
   if(i < 1) return h[i] - l[i];
   int start = MathMax(1, i - LH_ATR_LEN + 1);
   double sum = 0.0;
   for(int j = start; j <= i; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      sum += tr;
   }
   return sum / (i - start + 1);
}

bool LhIsPivotLow(const int i, const int p, const double &l[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
   {
      if(l[i] > l[i - k] || l[i] >= l[i + k]) return false;
   }
   return true;
}

bool LhIsPivotHigh(const int i, const int p, const double &h[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
   {
      if(h[i] < h[i - k] || h[i] <= h[i + k]) return false;
   }
   return true;
}

void LhPushPivot(LhPivot &arr[], int &n, const double price, const int bar)
{
   if(n < LH_MAX_PIVOTS)
   {
      arr[n].price = price;
      arr[n].bar = bar;
      n++;
      return;
   }
   for(int i = 1; i < LH_MAX_PIVOTS; i++) arr[i - 1] = arr[i];
   arr[LH_MAX_PIVOTS - 1].price = price;
   arr[LH_MAX_PIVOTS - 1].bar = bar;
}

bool LhLastPivot(const LhPivot &arr[], const int n, const int beforeBar,
                 const int lookback, const int minAge, double &outPrice)
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

bool LhNextLiqHigh(const LhPivot &arr[], const int n, const double from,
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

bool LhNextLiqLow(const LhPivot &arr[], const int n, const double from,
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

bool LhEmitSetup(const int pendDir,
                 const double entry, const double sweepExt, const double sweepPx,
                 const double fvgTop, const double fvgBot, const double mssLevel,
                 const double cisdLevel, const int structType,
                 const int i, const datetime barTime,
                 const double a, const LhConfig &cfg,
                 const LhPivot &pivHi[], const int nHi,
                 const LhPivot &pivLo[], const int nLo,
                 LhSetup &outSetups[], int &nSetups)
{
   double pad = a * cfg.slPadAtr;
   LhSetup s;
   ZeroMemory(s);

   if(pendDir == LH_DIR_LONG)
   {
      double sl = sweepExt - pad;
      if(entry <= sl) return false;
      double risk = entry - sl;
      double tp = entry + risk * cfg.riskReward;
      double liq;
      if(cfg.useOpposingLiq &&
         LhNextLiqHigh(pivHi, nHi, entry, a * cfg.liqExtendAtr, liq))
         tp = MathMax(tp, liq);
      s.dir = LH_DIR_LONG;
      s.entry = entry; s.sl = sl; s.tp = tp;
   }
   else
   {
      double sl = sweepExt + pad;
      if(sl <= entry) return false;
      double risk = sl - entry;
      double tp = entry - risk * cfg.riskReward;
      double liq;
      if(cfg.useOpposingLiq &&
         LhNextLiqLow(pivLo, nLo, entry, a * cfg.liqExtendAtr, liq))
         tp = MathMin(tp, liq);
      s.dir = LH_DIR_SHORT;
      s.entry = entry; s.sl = sl; s.tp = tp;
   }

   s.sweepPrice = sweepPx;
   s.sweepExt   = sweepExt;
   s.fvgTop = fvgTop; s.fvgBot = fvgBot;
   s.mssLevel = mssLevel;
   s.cisdLevel = cisdLevel;
   s.structType = structType;
   s.barIndex = i;
   s.barTime = barTime;
   ArrayResize(outSetups, nSetups + 1);
   outSetups[nSetups] = s;
   nSetups++;
   return true;
}

// Liquidity Hunter scan — closed bars only (never tip bar rates-1)
int LhScanSetups(const int rates,
                 const datetime &time[],
                 const double &open[],
                 const double &high[],
                 const double &low[],
                 const double &close[],
                 const LhConfig &cfg,
                 LhSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(rates < 120) return 0;

   LhPivot pivHi[LH_MAX_PIVOTS];
   LhPivot pivLo[LH_MAX_PIVOTS];
   int nHi = 0, nLo = 0;

   // 0 idle · 1 wait CISD · 2 wait MSS/BOS · 3 wait FVG · 4 wait retest
   int    phase = 0;
   int    pendDir = 0;
   double sweepPx = 0, sweepExt = 0, cisdLevel = 0, mssLevel = 0;
   double fvgTop = 0, fvgBot = 0;
   int    sweepBar = -1, cisdBar = -1, mssBar = -1, fvgBar = -1;
   int    structType = 0;
   int    lastSetupBar = -9999;
   int    nSetups = 0;
   int    p = cfg.pivotPeriod;
   int    lastClosed = rates - 2;
   if(lastClosed < 50) return 0;

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = LhCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && LhIsPivotLow(pivI, p, low, rates))
         LhPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && LhIsPivotHigh(pivI, p, high, rates))
         LhPushPivot(pivHi, nHi, high[pivI], pivI);

      if(phase == 1 && (i - sweepBar) > cfg.maxCisdBars)   { phase = 0; pendDir = 0; }
      if(phase == 2 && (i - cisdBar)  > cfg.maxStructBars) { phase = 0; pendDir = 0; }
      if(phase == 3 && (i - mssBar)   > cfg.maxFvgBars)    { phase = 0; pendDir = 0; }
      if(phase == 4 && (i - fvgBar)   > cfg.maxRetestBars) { phase = 0; pendDir = 0; }

      double huntLo = 0, huntHi = 0;
      bool hasLo = LhLastPivot(pivLo, nLo, i, 100, p, huntLo);
      bool hasHi = LhLastPivot(pivHi, nHi, i, 100, p, huntHi);
      bool canStart = (phase == 0) && (i - lastSetupBar >= cfg.cooldownBars);

      // --- Liquidity raid -------------------------------------------------
      // SSL raid → bullish (hunts sell-side stops, then expands up)
      bool sslRaid = canStart && hasLo &&
         low[i] < huntLo - a * cfg.minSweepAtr &&
         close[i] > huntLo;
      // BSL raid → bearish
      bool bslRaid = canStart && hasHi &&
         high[i] > huntHi + a * cfg.minSweepAtr &&
         close[i] < huntHi;

      if(sslRaid)
      {
         phase = cfg.requireCisd ? 1 : 2;
         pendDir = LH_DIR_LONG;
         sweepPx = huntLo; sweepExt = low[i]; sweepBar = i;
         // CISD reference = open of the delivery candle that swept (sell delivery)
         cisdLevel = open[i];
         cisdBar = cfg.requireCisd ? -1 : i;
         mssLevel = hasHi ? huntHi : 0;
         mssBar = -1; fvgBar = -1; structType = 0;
         if(!cfg.requireCisd) { /* jump to structure */ }
      }
      else if(bslRaid)
      {
         phase = cfg.requireCisd ? 1 : 2;
         pendDir = LH_DIR_SHORT;
         sweepPx = huntHi; sweepExt = high[i]; sweepBar = i;
         cisdLevel = open[i];
         cisdBar = cfg.requireCisd ? -1 : i;
         mssLevel = hasLo ? huntLo : 0;
         mssBar = -1; fvgBar = -1; structType = 0;
      }

      if(phase == 0) continue;

      if(pendDir == LH_DIR_LONG && low[i] < sweepExt) sweepExt = low[i];
      if(pendDir == LH_DIR_SHORT && high[i] > sweepExt) sweepExt = high[i];

      double body = MathAbs(close[i] - open[i]);

      // --- Phase 1: CISD (change in state of delivery) --------------------
      // Bull: close back above the raid candle open (buyers take delivery)
      // Bear: close back below the raid candle open
      if(phase == 1 && i >= sweepBar)
      {
         bool cisd = false;
         if(pendDir == LH_DIR_LONG)
            cisd = (close[i] > cisdLevel && close[i] > open[i]);
         else
            cisd = (close[i] < cisdLevel && close[i] < open[i]);

         if(cisd)
         {
            cisdBar = i;
            phase = 2;
         }
         if(phase == 1) continue;
      }

      // --- Phase 2: MSS (preferred) or internal BOS -----------------------
      if(phase == 2 && i > (cisdBar >= 0 ? cisdBar : sweepBar))
      {
         if(pendDir == LH_DIR_LONG)
         {
            // Prefer pre-raid swing high as MSS; else internal post-raid high = BOS
            double mssRef = mssLevel;
            double bosRef = 0;
            for(int k = nHi - 1; k >= 0; k--)
            {
               if(pivHi[k].bar <= sweepBar) break;
               if(pivHi[k].bar < i) { bosRef = pivHi[k].price; break; }
            }
            if(mssRef <= 0)
            {
               double mx = high[sweepBar];
               for(int k = sweepBar; k < i; k++) if(high[k] > mx) mx = high[k];
               mssRef = mx;
            }

            bool hitMss = close[i] > mssRef && close[i] > open[i] && body >= a * cfg.minDispAtr;
            bool hitBos = cfg.allowBos && bosRef > 0 &&
                          close[i] > bosRef && close[i] > open[i] && body >= a * cfg.minDispAtr * 0.75;

            if(hitMss || hitBos)
            {
               mssLevel = hitMss ? mssRef : bosRef;
               structType = hitMss ? LH_STRUCT_MSS : LH_STRUCT_BOS;
               mssBar = i;
               phase = 3;
            }
         }
         else
         {
            double mssRef = mssLevel;
            double bosRef = 0;
            for(int k = nLo - 1; k >= 0; k--)
            {
               if(pivLo[k].bar <= sweepBar) break;
               if(pivLo[k].bar < i) { bosRef = pivLo[k].price; break; }
            }
            if(mssRef <= 0)
            {
               double mn = low[sweepBar];
               for(int k = sweepBar; k < i; k++) if(low[k] < mn) mn = low[k];
               mssRef = mn;
            }

            bool hitMss = close[i] < mssRef && close[i] < open[i] && body >= a * cfg.minDispAtr;
            bool hitBos = cfg.allowBos && bosRef > 0 &&
                          close[i] < bosRef && close[i] < open[i] && body >= a * cfg.minDispAtr * 0.75;

            if(hitMss || hitBos)
            {
               mssLevel = hitMss ? mssRef : bosRef;
               structType = hitMss ? LH_STRUCT_MSS : LH_STRUCT_BOS;
               mssBar = i;
               phase = 3;
            }
         }
         if(phase == 2) continue;
      }

      // --- Phase 3: FVG after displacement --------------------------------
      if(phase == 3 && i >= 2 && i >= mssBar)
      {
         bool found = false;
         if(pendDir == LH_DIR_LONG)
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
               phase = 4;
               continue;
            }

            double entry = (fvgTop + fvgBot) * 0.5;
            // Prefer CISD level if it sits inside the FVG (cleaner entry)
            if(cisdLevel >= fvgBot && cisdLevel <= fvgTop)
               entry = cisdLevel;

            if(LhEmitSetup(pendDir, entry, sweepExt, sweepPx, fvgTop, fvgBot,
                           mssLevel, cisdLevel, structType, i, time[i], a, cfg,
                           pivHi, nHi, pivLo, nLo, outSetups, nSetups))
               lastSetupBar = i;
            phase = 0; pendDir = 0;
         }
         continue;
      }

      // --- Phase 4: FVG retest confirm ------------------------------------
      if(phase == 4 && i > fvgBar)
      {
         bool confirmed = false;
         if(pendDir == LH_DIR_LONG)
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
         if(cisdLevel >= fvgBot && cisdLevel <= fvgTop)
            entry = cisdLevel;

         if(LhEmitSetup(pendDir, entry, sweepExt, sweepPx, fvgTop, fvgBot,
                        mssLevel, cisdLevel, structType, i, time[i], a, cfg,
                        pivHi, nHi, pivLo, nLo, outSetups, nSetups))
            lastSetupBar = i;
         phase = 0; pendDir = 0;
      }
   }

   return nSetups;
}

string LhStructLabel(const int t)
{
   if(t == LH_STRUCT_BOS) return "BOS";
   return "MSS";
}

#endif
//+------------------------------------------------------------------+
