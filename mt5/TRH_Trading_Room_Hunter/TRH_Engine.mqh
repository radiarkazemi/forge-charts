//+------------------------------------------------------------------+
//| TRH_Engine.mqh - Classic SWEEP + FVG + Pro BTB                   |
//| Used by indicator (draw) and EA (optional autotrade).            |
//+------------------------------------------------------------------+
#ifndef TRH_ENGINE_MQH
#define TRH_ENGINE_MQH

#define TRH_ENGINE_VERSION 227
#define TRH_MAX_PIVOTS 30
#define TRH_ATR_LEN    14

#define TRH_MODE_CLASSIC 0   // Mode A - classic room SWEEP (setup tag)
#define TRH_MODE_FVG     1   // Mode B - sweep + displacement + FVG
#define TRH_MODE_BTB     2   // Mode C - Pro BTB breakout + retest
// Scan modes (InpTradeMode): 0 Classic, 1 FVG, 2 Both A+B, 3 BTB (legacy off), 4 All(=A+B)
#define TRH_SCAN_CLASSIC 0
#define TRH_SCAN_FVG     1
#define TRH_SCAN_BOTH_AB 2
#define TRH_SCAN_BTB     3   // legacy — not used in default trading
#define TRH_SCAN_ALL     4   // A + B only (BTB removed from live model)

struct TrhPivot
{
   double price;
   int    bar;
};

struct TrhSetup
{
   int      dir;       // 1 long, -1 short
   double   entry;
   double   sl;
   double   tp;
   double   distal;
   double   proximal;
   datetime barTime;
   int      barIndex;
   int      setupMode; // TRH_MODE_CLASSIC / FVG / BTB
};

struct TrhConfig
{
   int    pivotPeriod;
   double minContextAtr;
   double minSweepAtr;
   int    baseConfirmBars;
   int    maxBaseBars;
   double minRoomAtr;
   double maxRoomAtr;
   int    cooldownBars;
   double slPadAtr;
   double riskReward;
   bool   useLiquidityTP;
   // Mode B - Sweep + displacement + FVG
   double minDispAtr;
   int    maxDispBars;
   int    maxFvgBars;
   double minFvgAtr;
   bool   requireFvgRetest;
   int    maxRetestBars;
   double fvgSlExtraAtr;
   // Mode C - Pro BTB (breakout -> back to breakeven) — quality filters
   double minBreakAtr;
   double minBreakBodyAtr;
   int    maxBtbRetestBars;
   double btbRiskReward;
   double btbSlExtraAtr;
   bool   btbRequireConfirm;
   double btbMinRiskAtr;       // reject tiny SL (GOLD M1 noise)
   double btbMinConfirmBodyAtr;// confirm candle min body
   bool   btbRequireWickReject;// wick tags BE, close rejects away
   double btbMaxPastEntryAtr;  // skip if close already past BE toward TP
   int    btbMinBarsAfterBreak;// wait at least N bars before first retest entry
};

void TrhDefaultConfig(TrhConfig &cfg)
{
   cfg.pivotPeriod     = 5;
   cfg.minContextAtr   = 1.2;
   cfg.minSweepAtr     = 0.05;
   cfg.baseConfirmBars = 8;
   cfg.maxBaseBars     = 40;
   cfg.minRoomAtr      = 0.8;
   cfg.maxRoomAtr      = 3.5;
   cfg.cooldownBars    = 50;
   cfg.slPadAtr        = 0.02;
   cfg.riskReward      = 2.4;
   cfg.useLiquidityTP  = true;
   cfg.minDispAtr      = 0.55;
   cfg.maxDispBars     = 6;
   cfg.maxFvgBars      = 10;
   cfg.minFvgAtr       = 0.12;
   cfg.requireFvgRetest= true;
   cfg.maxRetestBars   = 8;
   cfg.fvgSlExtraAtr   = 0.20;
   cfg.minBreakAtr     = 0.20;
   cfg.minBreakBodyAtr = 0.45;
   cfg.maxBtbRetestBars= 10;
   cfg.btbRiskReward   = 2.0;
   cfg.btbSlExtraAtr   = 0.15;
   cfg.btbRequireConfirm = true;
   cfg.btbMinRiskAtr       = 0.50;
   cfg.btbMinConfirmBodyAtr= 0.28;
   cfg.btbRequireWickReject= true;
   cfg.btbMaxPastEntryAtr  = 0.20;
   cfg.btbMinBarsAfterBreak= 2;
}

// Short labels on chart tags / panel
string TrhModeLabel(const int mode)
{
   if(mode == TRH_MODE_FVG) return "B · FVG";
   if(mode == TRH_MODE_BTB) return "C · BTB";
   return "A · SWEEP";
}

// Full names for alerts / EA comments
string TrhModeFullName(const int mode)
{
   if(mode == TRH_MODE_FVG) return "Mode B FVG";
   if(mode == TRH_MODE_BTB) return "Mode C BTB";
   return "Mode A SWEEP";
}

color TrhModeAccent(const int mode, const int dir)
{
   if(mode == TRH_MODE_FVG)
      return (dir == 1) ? clrDodgerBlue : clrMediumOrchid;
   if(mode == TRH_MODE_BTB)
      return (dir == 1) ? clrDarkOrange : clrOrangeRed;
   // Mode A SWEEP
   return (dir == 1) ? clrTeal : clrCrimson;
}

// Pine ta.atr(14) = Wilder RMA of True Range (NOT SMA of last 14).
// After a big selloff SMA ATR spikes harder and can fail minRoom — miss setups Pine finds.
double TrhCalcATR(const int i, const double &h[], const double &l[], const double &c[])
{
   if(i < 1)
      return MathMax(h[i] - l[i], 0.0001);

   // Not enough bars for a full seed → SMA of available TR
   if(i < TRH_ATR_LEN)
   {
      double sum = 0.0;
      int n = 0;
      for(int j = 1; j <= i; j++)
      {
         double tr = MathMax(h[j] - l[j],
                      MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
         sum += tr;
         n++;
      }
      return (n > 0) ? (sum / n) : MathMax(h[i] - l[i], 0.0001);
   }

   // Seed at bar TRH_ATR_LEN = SMA(TR, 14), then Wilder forward to i
   double sum = 0.0;
   for(int j = 1; j <= TRH_ATR_LEN; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      sum += tr;
   }
   double atr = sum / TRH_ATR_LEN;
   for(int j = TRH_ATR_LEN + 1; j <= i; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      atr = (atr * (TRH_ATR_LEN - 1) + tr) / TRH_ATR_LEN;
   }
   return atr;
}

// Precompute Wilder ATR for a full scan (oldest→newest) — O(n) once
void TrhBuildAtrSeries(const int rates,
                       const double &h[], const double &l[], const double &c[],
                       double &atrOut[])
{
   ArrayResize(atrOut, rates);
   if(rates <= 0) return;
   atrOut[0] = MathMax(h[0] - l[0], 0.0001);
   if(rates == 1) return;

   double sum = 0.0;
   int n = 0;
   for(int j = 1; j < rates; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      if(j <= TRH_ATR_LEN)
      {
         sum += tr;
         n++;
         atrOut[j] = sum / n;
         if(j == TRH_ATR_LEN)
            atrOut[j] = sum / TRH_ATR_LEN;
      }
      else
      {
         atrOut[j] = (atrOut[j - 1] * (TRH_ATR_LEN - 1) + tr) / TRH_ATR_LEN;
      }
   }
}

bool TrhIsPivotLow(const int i, const int p, const double &l[], const int rates)
{
   if(i < p || i >= rates - p) return false;
   double v = l[i];
   for(int j = i - p; j <= i + p; j++)
      if(j != i && l[j] <= v) return false;
   return true;
}

bool TrhIsPivotHigh(const int i, const int p, const double &h[], const int rates)
{
   if(i < p || i >= rates - p) return false;
   double v = h[i];
   for(int j = i - p; j <= i + p; j++)
      if(j != i && h[j] >= v) return false;
   return true;
}

void TrhPushPivot(TrhPivot &arr[], int &n, const double price, const int bar)
{
   if(n < TRH_MAX_PIVOTS)
   {
      arr[n].price = price;
      arr[n].bar   = bar;
      n++;
   }
   else
   {
      for(int i = 1; i < TRH_MAX_PIVOTS; i++)
         arr[i - 1] = arr[i];
      arr[TRH_MAX_PIVOTS - 1].price = price;
      arr[TRH_MAX_PIVOTS - 1].bar   = bar;
   }
}

bool TrhLastPivot(const TrhPivot &arr[], const int n, const int i, const int maxAge,
                  const int p, const bool lowSide, double &outPrice)
{
   bool found = false;
   double best = 0.0;
   for(int k = 0; k < n; k++)
   {
      int age = i - arr[k].bar;
      if(age >= p && age <= maxAge)
      {
         if(!found || (lowSide ? arr[k].price <= best : arr[k].price >= best))
         {
            best  = arr[k].price;
            found = true;
         }
      }
   }
   if(found) outPrice = best;
   return found;
}

bool TrhNextLiqHigh(const TrhPivot &arr[], const int n, const double from,
                    const double minDist, double &out)
{
   bool found = false;
   double best = 0.0;
   for(int k = 0; k < n; k++)
   {
      if(arr[k].price >= from + minDist)
      {
         if(!found || arr[k].price < best)
         {
            best  = arr[k].price;
            found = true;
         }
      }
   }
   if(found) out = best;
   return found;
}

bool TrhNextLiqLow(const TrhPivot &arr[], const int n, const double from,
                   const double minDist, double &out)
{
   bool found = false;
   double best = 0.0;
   for(int k = 0; k < n; k++)
   {
      if(arr[k].price <= from - minDist)
      {
         if(!found || arr[k].price > best)
         {
            best  = arr[k].price;
            found = true;
         }
      }
   }
   if(found) out = best;
   return found;
}

// Bars must be oldest->newest (index 0 = oldest).
int TrhScanSetups(const int rates,
                  const datetime &time[],
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[],
                  const TrhConfig &cfg,
                  TrhSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(rates < 120) return 0;

   TrhPivot pivHi[TRH_MAX_PIVOTS];
   TrhPivot pivLo[TRH_MAX_PIVOTS];
   int nHi = 0, nLo = 0;

   int    pendDir = 0;
   double pendDistal = 0, pendHunt = 0, pendBaseHigh = 0, pendBaseLow = 0;
   int    pendBar = -1;
   int    lastSetupBar = -9999;
   int    nSetups = 0;
   int    p = cfg.pivotPeriod;
   int    lastClosed = rates - 2; // never confirm on forming tip (rates-1)
   if(lastClosed < 50) return 0;

   double atrSeries[];
   TrhBuildAtrSeries(rates, high, low, close, atrSeries);

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = atrSeries[i];
      if(a <= 0) a = TrhCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && TrhIsPivotLow(pivI, p, low, rates))
         TrhPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && TrhIsPivotHigh(pivI, p, high, rates))
         TrhPushPivot(pivHi, nHi, high[pivI], pivI);

      double huntLo = 0, huntHi = 0;
      bool hasLo = TrhLastPivot(pivLo, nLo, i, 80, p, true, huntLo);
      bool hasHi = TrhLastPivot(pivHi, nHi, i, 80, p, false, huntHi);

      // Pine: ta.highest(high[1], 40) / ta.lowest(low[1], 40) - exclude current bar
      double priorHigh = 0, priorLow = 0;
      bool   hasPrior  = false;
      int    from = MathMax(0, i - 40);
      for(int k = from; k < i; k++)
      {
         if(!hasPrior)
         {
            priorHigh = high[k];
            priorLow  = low[k];
            hasPrior  = true;
         }
         else
         {
            if(high[k] > priorHigh) priorHigh = high[k];
            if(low[k]  < priorLow)  priorLow  = low[k];
         }
      }
      if(!hasPrior)
      {
         priorHigh = high[i];
         priorLow  = low[i];
      }

      bool bullSweep = hasLo &&
         low[i] < huntLo - a * cfg.minSweepAtr &&
         close[i] > huntLo && close[i] > open[i] &&
         (priorHigh - low[i]) >= a * cfg.minContextAtr;

      bool bearSweep = hasHi &&
         high[i] > huntHi + a * cfg.minSweepAtr &&
         close[i] < huntHi && close[i] < open[i] &&
         (high[i] - priorLow) >= a * cfg.minContextAtr;

      bool canStart = (pendDir == 0) && (i - lastSetupBar >= cfg.cooldownBars);

      if(canStart && bullSweep)
      {
         pendDir      = 1;
         pendDistal   = low[i];
         pendHunt     = huntLo;
         pendBar      = i;
         pendBaseHigh = high[i];
         pendBaseLow  = low[i];
      }
      else if(canStart && bearSweep)
      {
         pendDir      = -1;
         pendDistal   = high[i];
         pendHunt     = huntHi;
         pendBar      = i;
         pendBaseHigh = high[i];
         pendBaseLow  = low[i];
      }

      if(pendDir == 0) continue;

      // Pine uses pendBaseHigh[1] after update - save pre-bar base before extending
      double prevBaseHigh = pendBaseHigh;
      double prevBaseLow  = pendBaseLow;

      pendBaseHigh = MathMax(pendBaseHigh, high[i]);
      pendBaseLow  = MathMin(pendBaseLow, low[i]);
      if(pendDir == 1 && low[i] < pendDistal)   pendDistal = low[i];
      if(pendDir == -1 && high[i] > pendDistal) pendDistal = high[i];

      int age = i - pendBar;
      if(age > cfg.maxBaseBars)
      {
         pendDir = 0;
         continue;
      }
      if(age < cfg.baseConfirmBars) continue;

      TrhSetup s;
      bool fired = false;

      if(pendDir == 1)
      {
         double distal    = pendDistal;
         double proximal  = pendBaseHigh;
         double width     = proximal - distal;
         bool   microBreak = close[i] > open[i] &&
            (high[i] >= prevBaseHigh || close[i] >= distal + width * 0.7);

         if(width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr && microBreak)
         {
            double entry = (distal + proximal) * 0.5;
            double sl    = distal - a * cfg.slPadAtr;
            double risk  = entry - sl;
            double tp    = entry + risk * cfg.riskReward;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqHigh(pivHi, nHi, entry, risk * 1.5, liq))
               tp = MathMax(tp, liq);

            s.dir = 1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = distal; s.proximal = proximal;
            s.barIndex = i; s.barTime = time[i];
            s.setupMode = TRH_MODE_CLASSIC;
            fired = true;
         }
      }
      else
      {
         double distal    = pendDistal;
         double proximal  = pendBaseLow;
         double width     = distal - proximal;
         bool   microBreak = close[i] < open[i] &&
            (low[i] <= prevBaseLow || close[i] <= distal - width * 0.7);

         if(width >= a * cfg.minRoomAtr && width <= a * cfg.maxRoomAtr && microBreak)
         {
            double entry = (distal + proximal) * 0.5;
            double sl    = distal + a * cfg.slPadAtr;
            double risk  = sl - entry;
            double tp    = entry - risk * cfg.riskReward;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqLow(pivLo, nLo, entry, risk * 1.5, liq))
               tp = MathMin(tp, liq);

            s.dir = -1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = distal; s.proximal = proximal;
            s.barIndex = i; s.barTime = time[i];
            s.setupMode = TRH_MODE_CLASSIC;
            fired = true;
         }
      }

      if(fired)
      {
         ArrayResize(outSetups, nSetups + 1);
         outSetups[nSetups] = s;
         nSetups++;
         lastSetupBar = i;
         pendDir = 0;
      }
   }

   return nSetups;
}

// Mode B: sweep -> displacement -> FVG -> optional retest -> mid-gap ENTRY
// Never confirms on the forming tip bar (rates-1).
int TrhScanFvgSetups(const int rates,
                     const datetime &time[],
                     const double &open[],
                     const double &high[],
                     const double &low[],
                     const double &close[],
                     const TrhConfig &cfg,
                     TrhSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(rates < 120) return 0;

   TrhPivot pivHi[TRH_MAX_PIVOTS];
   TrhPivot pivLo[TRH_MAX_PIVOTS];
   int nHi = 0, nLo = 0;

   // phase: 0 idle, 1 wait disp, 2 wait FVG form, 3 wait retest
   int    phase = 0;
   int    pendDir = 0;
   double pendDistal = 0;
   double pendHunt = 0;
   double gapBot = 0, gapTop = 0;
   int    sweepBar = -1;
   int    dispBar = -1;
   int    fvgBar = -1;
   int    lastSetupBar = -9999;
   int    nSetups = 0;
   int    p = cfg.pivotPeriod;
   int    lastClosed = rates - 2; // never signal on forming tip (rates-1)
   if(lastClosed < 50) return 0;

   double atrSeries[];
   TrhBuildAtrSeries(rates, high, low, close, atrSeries);

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = atrSeries[i];
      if(a <= 0) a = TrhCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && TrhIsPivotLow(pivI, p, low, rates))
         TrhPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && TrhIsPivotHigh(pivI, p, high, rates))
         TrhPushPivot(pivHi, nHi, high[pivI], pivI);

      double huntLo = 0, huntHi = 0;
      bool hasLo = TrhLastPivot(pivLo, nLo, i, 80, p, true, huntLo);
      bool hasHi = TrhLastPivot(pivHi, nHi, i, 80, p, false, huntHi);

      double priorHigh = 0, priorLow = 0;
      bool   hasPrior  = false;
      int    from = MathMax(0, i - 40);
      for(int k = from; k < i; k++)
      {
         if(!hasPrior)
         {
            priorHigh = high[k];
            priorLow  = low[k];
            hasPrior  = true;
         }
         else
         {
            if(high[k] > priorHigh) priorHigh = high[k];
            if(low[k]  < priorLow)  priorLow  = low[k];
         }
      }
      if(!hasPrior)
      {
         priorHigh = high[i];
         priorLow  = low[i];
      }

      bool bullSweep = hasLo &&
         low[i] < huntLo - a * cfg.minSweepAtr &&
         close[i] > huntLo && close[i] > open[i] &&
         (priorHigh - low[i]) >= a * cfg.minContextAtr;

      bool bearSweep = hasHi &&
         high[i] > huntHi + a * cfg.minSweepAtr &&
         close[i] < huntHi && close[i] < open[i] &&
         (high[i] - priorLow) >= a * cfg.minContextAtr;

      if(phase == 1 && (i - sweepBar) > cfg.maxDispBars) { phase = 0; pendDir = 0; }
      if(phase == 2 && (i - dispBar) > cfg.maxFvgBars)  { phase = 0; pendDir = 0; }
      if(phase == 3 && (i - fvgBar) > cfg.maxRetestBars) { phase = 0; pendDir = 0; }

      bool canStart = (phase == 0) && (i - lastSetupBar >= cfg.cooldownBars);
      if(canStart && bullSweep)
      {
         phase = 1; pendDir = 1; pendDistal = low[i]; pendHunt = huntLo;
         sweepBar = i; dispBar = -1; fvgBar = -1;
      }
      else if(canStart && bearSweep)
      {
         phase = 1; pendDir = -1; pendDistal = high[i]; pendHunt = huntHi;
         sweepBar = i; dispBar = -1; fvgBar = -1;
      }

      if(phase == 0) continue;

      if(pendDir == 1 && low[i] < pendDistal) pendDistal = low[i];
      if(pendDir == -1 && high[i] > pendDistal) pendDistal = high[i];

      double body = MathAbs(close[i] - open[i]);

      // Phase 1 -> displacement
      if(phase == 1 && i > sweepBar)
      {
         bool bullDisp = pendDir == 1 && close[i] > open[i] &&
            body >= a * cfg.minDispAtr && close[i] > pendHunt;
         bool bearDisp = pendDir == -1 && close[i] < open[i] &&
            body >= a * cfg.minDispAtr && close[i] < pendHunt;
         if(bullDisp || bearDisp)
         {
            phase = 2;
            dispBar = i;
         }
         continue;
      }

      // Phase 2 -> detect FVG box (do not enter yet if retest required)
      if(phase == 2 && i >= 2 && i > dispBar)
      {
         bool found = false;
         if(pendDir == 1)
         {
            double bot = high[i - 2];
            double top = low[i];
            if(top - bot >= a * cfg.minFvgAtr)
            {
               gapBot = bot; gapTop = top; found = true;
            }
         }
         else
         {
            double top = low[i - 2];
            double bot = high[i];
            if(top - bot >= a * cfg.minFvgAtr)
            {
               gapBot = bot; gapTop = top; found = true;
            }
         }

         if(found)
         {
            fvgBar = i;
            if(cfg.requireFvgRetest)
            {
               phase = 3; // wait for retest on a later closed bar
               continue;
            }

            // Immediate entry at FVG mid (retest disabled)
            double entry = (gapTop + gapBot) * 0.5;
            double pad = a * (cfg.slPadAtr + cfg.fvgSlExtraAtr);
            TrhSetup s;
            bool ok = false;
            if(pendDir == 1)
            {
               double sl = pendDistal - pad;
               if(entry > sl)
               {
                  double risk = entry - sl;
                  double tp = entry + risk * cfg.riskReward;
                  double liq;
                  if(cfg.useLiquidityTP && TrhNextLiqHigh(pivHi, nHi, entry, risk * 1.5, liq))
                     tp = MathMax(tp, liq);
                  s.dir = 1; s.entry = entry; s.sl = sl; s.tp = tp;
                  s.distal = gapBot; s.proximal = gapTop;
                  ok = true;
               }
            }
            else
            {
               double sl = pendDistal + pad;
               if(sl > entry)
               {
                  double risk = sl - entry;
                  double tp = entry - risk * cfg.riskReward;
                  double liq;
                  if(cfg.useLiquidityTP && TrhNextLiqLow(pivLo, nLo, entry, risk * 1.5, liq))
                     tp = MathMin(tp, liq);
                  s.dir = -1; s.entry = entry; s.sl = sl; s.tp = tp;
                  s.distal = gapTop; s.proximal = gapBot;
                  ok = true;
               }
            }
            if(ok)
            {
               s.barIndex = i; s.barTime = time[i];
               s.setupMode = TRH_MODE_FVG;
               ArrayResize(outSetups, nSetups + 1);
               outSetups[nSetups] = s;
               nSetups++;
               lastSetupBar = i;
            }
            phase = 0;
            pendDir = 0;
         }
         continue;
      }

      // Phase 3 -> retest FVG then confirm close back in trade direction
      if(phase == 3 && i > fvgBar)
      {
         bool confirmed = false;
         if(pendDir == 1)
         {
            bool retested = (low[i] <= gapTop && low[i] >= gapBot - a * 0.05);
            confirmed = retested && close[i] > open[i] && close[i] >= (gapBot + gapTop) * 0.5;
         }
         else
         {
            bool retested = (high[i] >= gapBot && high[i] <= gapTop + a * 0.05);
            confirmed = retested && close[i] < open[i] && close[i] <= (gapBot + gapTop) * 0.5;
         }
         if(!confirmed) continue;

         double entry = (gapTop + gapBot) * 0.5;
         double pad = a * (cfg.slPadAtr + cfg.fvgSlExtraAtr);
         TrhSetup s;
         if(pendDir == 1)
         {
            double sl = pendDistal - pad;
            if(entry <= sl) { phase = 0; pendDir = 0; continue; }
            double risk = entry - sl;
            double tp = entry + risk * cfg.riskReward;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqHigh(pivHi, nHi, entry, risk * 1.5, liq))
               tp = MathMax(tp, liq);
            s.dir = 1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = gapBot; s.proximal = gapTop;
         }
         else
         {
            double sl = pendDistal + pad;
            if(sl <= entry) { phase = 0; pendDir = 0; continue; }
            double risk = sl - entry;
            double tp = entry - risk * cfg.riskReward;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqLow(pivLo, nLo, entry, risk * 1.5, liq))
               tp = MathMin(tp, liq);
            s.dir = -1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = gapTop; s.proximal = gapBot;
         }

         s.barIndex = i; s.barTime = time[i];
         s.setupMode = TRH_MODE_FVG;
         ArrayResize(outSetups, nSetups + 1);
         outSetups[nSetups] = s;
         nSetups++;
         lastSetupBar = i;
         phase = 0;
         pendDir = 0;
      }
   }

   return nSetups;
}

// Mode C: Pro BTB — break key pivot -> return to breakout BE -> confirm -> ENTRY
// ENTRY = breakout candle close (breakeven). SL behind breakout extreme. RR >= 2.
int TrhScanBtbSetups(const int rates,
                     const datetime &time[],
                     const double &open[],
                     const double &high[],
                     const double &low[],
                     const double &close[],
                     const TrhConfig &cfg,
                     TrhSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(rates < 120) return 0;

   TrhPivot pivHi[TRH_MAX_PIVOTS];
   TrhPivot pivLo[TRH_MAX_PIVOTS];
   int nHi = 0, nLo = 0;

   // phase: 0 idle, 1 wait retest after breakout
   int    phase = 0;
   int    pendDir = 0;
   double breakLevel = 0;   // key pivot that was broken
   double beLevel = 0;      // breakout candle close (BTB entry)
   double breakExt = 0;     // breakout candle extreme for SL
   int    breakBar = -1;
   int    lastSetupBar = -9999;
   int    nSetups = 0;
   int    p = cfg.pivotPeriod;
   int    lastClosed = rates - 2;
   if(lastClosed < 50) return 0;

   double rr = cfg.btbRiskReward;
   if(rr < 2.0) rr = 2.0;

   double atrSeries[];
   TrhBuildAtrSeries(rates, high, low, close, atrSeries);

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = atrSeries[i];
      if(a <= 0) a = TrhCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && TrhIsPivotLow(pivI, p, low, rates))
         TrhPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && TrhIsPivotHigh(pivI, p, high, rates))
         TrhPushPivot(pivHi, nHi, high[pivI], pivI);

      if(phase == 1 && (i - breakBar) > cfg.maxBtbRetestBars)
      {
         phase = 0;
         pendDir = 0;
      }

      double huntLo = 0, huntHi = 0;
      bool hasLo = TrhLastPivot(pivLo, nLo, i, 80, p, true, huntLo);
      bool hasHi = TrhLastPivot(pivHi, nHi, i, 80, p, false, huntHi);

      double body = MathAbs(close[i] - open[i]);
      bool canStart = (phase == 0) && (i - lastSetupBar >= cfg.cooldownBars);

      // Bullish breakout of resistance (pivot high)
      if(canStart && hasHi)
      {
         bool broke = close[i] > huntHi + a * cfg.minBreakAtr &&
                      close[i] > open[i] &&
                      body >= a * cfg.minBreakBodyAtr;
         if(broke)
         {
            phase = 1;
            pendDir = 1;
            breakLevel = huntHi;
            beLevel = close[i];
            breakExt = low[i];
            breakBar = i;
         }
      }
      // Bearish breakout of support (pivot low)
      if(canStart && hasLo && phase == 0)
      {
         bool broke = close[i] < huntLo - a * cfg.minBreakAtr &&
                      close[i] < open[i] &&
                      body >= a * cfg.minBreakBodyAtr;
         if(broke)
         {
            phase = 1;
            pendDir = -1;
            breakLevel = huntLo;
            beLevel = close[i];
            breakExt = high[i];
            breakBar = i;
         }
      }

      if(phase != 1 || i <= breakBar) continue;
      if((i - breakBar) < cfg.btbMinBarsAfterBreak) continue;

      // Track worse extreme during retest wait (for SL)
      if(pendDir == 1 && low[i] < breakExt) breakExt = low[i];
      if(pendDir == -1 && high[i] > breakExt) breakExt = high[i];

      // Retest: price returns to BE (breakout close) or broken pivot level
      double touchHi = MathMax(beLevel, breakLevel) + a * 0.05;
      double touchLo = MathMin(beLevel, breakLevel) - a * 0.05;
      bool touched = (low[i] <= touchHi && high[i] >= touchLo);
      if(!touched) continue;

      double confBody = MathAbs(close[i] - open[i]);
      bool confirmed = true;
      if(cfg.btbRequireConfirm)
      {
         if(pendDir == 1)
            confirmed = close[i] > open[i] && close[i] >= MathMin(beLevel, breakLevel);
         else
            confirmed = close[i] < open[i] && close[i] <= MathMax(beLevel, breakLevel);
         // Stronger confirm body (filters tiny M1 noise candles)
         if(confirmed && confBody < a * cfg.btbMinConfirmBodyAtr)
            confirmed = false;
      }
      if(!confirmed) continue;

      // Wick must tag the BE zone; close must reject away from it
      if(cfg.btbRequireWickReject)
      {
         double midZone = (touchHi + touchLo) * 0.5;
         if(pendDir == 1)
         {
            // Long: wick down into zone, close in upper half / above mid
            if(!(low[i] <= midZone && close[i] >= midZone))
               continue;
         }
         else
         {
            // Short: wick up into zone, close in lower half / below mid
            if(!(high[i] >= midZone && close[i] <= midZone))
               continue;
         }
      }

      // Invalidate if retest blew through BE too far against us
      if(pendDir == 1 && close[i] < breakExt) { phase = 0; pendDir = 0; continue; }
      if(pendDir == -1 && close[i] > breakExt) { phase = 0; pendDir = 0; continue; }

      double entry = beLevel; // Back To Breakeven = breakout candle close

      // Skip if already past ENTRY toward TP (expired BTB — no chase)
      if(cfg.btbMaxPastEntryAtr > 0)
      {
         if(pendDir == 1 && close[i] > entry + a * cfg.btbMaxPastEntryAtr)
            continue;
         if(pendDir == -1 && close[i] < entry - a * cfg.btbMaxPastEntryAtr)
            continue;
      }

      double pad = a * (cfg.slPadAtr + cfg.btbSlExtraAtr);
      TrhSetup s;
      bool ok = false;

      if(pendDir == 1)
      {
         double sl = breakExt - pad;
         if(entry > sl)
         {
            double risk = entry - sl;
            if(risk < a * cfg.btbMinRiskAtr)
               continue; // SL too tight for GOLD M1
            double tp = entry + risk * rr;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqHigh(pivHi, nHi, entry, risk * 1.5, liq))
               tp = MathMax(tp, liq);
            s.dir = 1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = sl; s.proximal = breakLevel;
            ok = true;
         }
      }
      else
      {
         double sl = breakExt + pad;
         if(sl > entry)
         {
            double risk = sl - entry;
            if(risk < a * cfg.btbMinRiskAtr)
               continue;
            double tp = entry - risk * rr;
            double liq;
            if(cfg.useLiquidityTP && TrhNextLiqLow(pivLo, nLo, entry, risk * 1.5, liq))
               tp = MathMin(tp, liq);
            s.dir = -1; s.entry = entry; s.sl = sl; s.tp = tp;
            s.distal = sl; s.proximal = breakLevel;
            ok = true;
         }
      }

      if(ok)
      {
         s.barIndex = i;
         s.barTime = time[i];
         s.setupMode = TRH_MODE_BTB;
         ArrayResize(outSetups, nSetups + 1);
         outSetups[nSetups] = s;
         nSetups++;
         lastSetupBar = i;
      }
      phase = 0;
      pendDir = 0;
   }

   return nSetups;
}

// Priority: Mode A (0) > Mode B (1) > Mode C (2). Lower id = preferred.
bool TrhModePreferred(const int modeA, const int modeB)
{
   return modeA < modeB;
}

void TrhSortSetupsByBar(TrhSetup &arr[], const int n)
{
   for(int i = 0; i < n; i++)
   {
      for(int j = i + 1; j < n; j++)
      {
         // Chronological, then A > B > C on the same bar
         if(arr[j].barIndex < arr[i].barIndex ||
            (arr[j].barIndex == arr[i].barIndex &&
             TrhModePreferred(arr[j].setupMode, arr[i].setupMode)))
         {
            TrhSetup tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
         }
      }
   }
}

int TrhMergeScans(TrhSetup &a[], const int na,
                  TrhSetup &b[], const int nb,
                  const TrhConfig &cfg,
                  TrhSetup &outSetups[])
{
   TrhSetup merged[];
   int nm = 0;
   ArrayResize(merged, na + nb);
   for(int i = 0; i < na; i++) merged[nm++] = a[i];
   for(int i = 0; i < nb; i++) merged[nm++] = b[i];
   TrhSortSetupsByBar(merged, nm);

   ArrayResize(outSetups, 0);
   int nOut = 0;
   int lastBar = -9999;
   for(int i = 0; i < nm; i++)
   {
      if(merged[i].barIndex - lastBar < cfg.cooldownBars && lastBar >= 0)
      {
         // Inside cooldown: keep / upgrade to higher priority (A > B > C).
         // Lets a later Mode A replace an earlier Mode C (BTB confirms faster).
         if(nOut > 0 && TrhModePreferred(merged[i].setupMode, outSetups[nOut - 1].setupMode))
         {
            outSetups[nOut - 1] = merged[i];
            lastBar = merged[i].barIndex;
         }
         continue;
      }
      ArrayResize(outSetups, nOut + 1);
      outSetups[nOut] = merged[i];
      lastBar = merged[i].barIndex;
      nOut++;
   }
   return nOut;
}

// Scan by mode: Classic / FVG / Both A+B / BTB / All
int TrhScanByMode(const int rates,
                  const datetime &time[],
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[],
                  const TrhConfig &cfg,
                  const int tradeMode,
                  TrhSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   if(tradeMode == TRH_SCAN_CLASSIC)
      return TrhScanSetups(rates, time, open, high, low, close, cfg, outSetups);
   if(tradeMode == TRH_SCAN_FVG)
      return TrhScanFvgSetups(rates, time, open, high, low, close, cfg, outSetups);
   if(tradeMode == TRH_SCAN_BTB)
      return TrhScanBtbSetups(rates, time, open, high, low, close, cfg, outSetups);

   TrhSetup a[], b[];
   int na = 0, nb = 0;
   // BOTH and ALL = Mode A + Mode B only (BTB removed from live model)
   if(tradeMode == TRH_SCAN_BOTH_AB || tradeMode == TRH_SCAN_ALL)
   {
      na = TrhScanSetups(rates, time, open, high, low, close, cfg, a);
      nb = TrhScanFvgSetups(rates, time, open, high, low, close, cfg, b);
      return TrhMergeScans(a, na, b, nb, cfg, outSetups);
   }

   ArrayResize(outSetups, 0);
   return 0;
}

// Copy MT5 series (newest-first or oldest-first) into oldest->newest buffers.
void TrhNormalizeBars(const int rates,
                      const datetime &time[],
                      const double &open[],
                      const double &high[],
                      const double &low[],
                      const double &close[],
                      datetime &t[],
                      double &o[],
                      double &h[],
                      double &l[],
                      double &c[])
{
   ArrayResize(t, rates);
   ArrayResize(o, rates);
   ArrayResize(h, rates);
   ArrayResize(l, rates);
   ArrayResize(c, rates);

   bool asSeries = (rates > 1 && time[0] > time[rates - 1]);
   for(int i = 0; i < rates; i++)
   {
      int src = asSeries ? (rates - 1 - i) : i;
      t[i] = time[src];
      o[i] = open[src];
      h[i] = high[src];
      l[i] = low[src];
      c[i] = close[src];
   }
}

#endif
//+------------------------------------------------------------------+
