//+------------------------------------------------------------------+
//| LH_Engine.mqh                                                    |
//| Exact Pine parity: LH · Liquidity Hunter                         |
//| 1 RAID → 2 CISD → 3 MSS → 4 FVG → ENTRY / SL / TP                 |
//@version source: indicators/LH_Liquidity_Hunter.pine               |
//+------------------------------------------------------------------+
#ifndef LH_ENGINE_MQH
#define LH_ENGINE_MQH

#define LH_ENGINE_VERSION 120
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
   int      dir;
   double   entry;
   double   sl;
   double   tp;
   double   fvgTop;
   double   fvgBot;
   double   raidPx;
   double   raidExt;
   double   cisdPx;
   double   mssPx;
   int      raidBar;
   int      cisdBar;
   int      mssBar;
   int      structType; // MSS / BOS
   datetime barTime;
   int      barIndex;
   string   tag;
};

struct LhConfig
{
   int    pivotPeriod;
   double minSweepAtr;
   double minDispAtr;
   double minFvgAtr;
   int    maxCisdBars;
   int    maxStructBars;
   int    maxFvgBars;
   bool   requireCisd;
   bool   allowBos;
   bool   requireFvgRetest;
   int    maxRetestBars;
   int    cooldownBars;
   double slPadAtr;
   double minRiskAtr;
   double riskReward;
   bool   useOpposingLiq;
   double liqExtendAtr;
   double minTpR;
};

// Exact Pine defaults from user script
void LhDefaultConfig(LhConfig &cfg)
{
   cfg.pivotPeriod      = 5;
   cfg.minSweepAtr      = 0.08;
   cfg.minDispAtr       = 0.55;
   cfg.minFvgAtr        = 0.12;
   cfg.maxCisdBars      = 6;
   cfg.maxStructBars    = 10;
   cfg.maxFvgBars       = 8;
   cfg.requireCisd      = true;
   cfg.allowBos         = false; // MSS only
   cfg.requireFvgRetest = true;
   cfg.maxRetestBars    = 8;
   cfg.cooldownBars     = 50;
   cfg.slPadAtr         = 0.20;
   cfg.minRiskAtr       = 0.35;
   cfg.riskReward       = 2.5;
   cfg.useOpposingLiq   = true;
   cfg.liqExtendAtr     = 1.2;
   cfg.minTpR           = 1.5;
}

// Pine ta.atr(14) = Wilder RMA
double LhCalcATR(const int i, const double &h[], const double &l[], const double &c[])
{
   if(i < 1)
      return MathMax(h[i] - l[i], 0.0001);

   if(i < LH_ATR_LEN)
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

   double sum = 0.0;
   for(int j = 1; j <= LH_ATR_LEN; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      sum += tr;
   }
   double atr = sum / LH_ATR_LEN;
   for(int j = LH_ATR_LEN + 1; j <= i; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      atr = (atr * (LH_ATR_LEN - 1) + tr) / LH_ATR_LEN;
   }
   return atr;
}

void LhBuildAtrSeries(const int rates,
                      const double &h[], const double &l[], const double &c[],
                      double &atr[])
{
   ArrayResize(atr, rates);
   for(int i = 0; i < rates; i++)
      atr[i] = LhCalcATR(i, h, l, c);
}

bool LhIsPivotLow(const int i, const int p, const double &l[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
      if(l[i] > l[i - k] || l[i] >= l[i + k]) return false;
   return true;
}

bool LhIsPivotHigh(const int i, const int p, const double &h[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
      if(h[i] < h[i - k] || h[i] <= h[i + k]) return false;
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

// Pine f_lastPivot
bool LhLastPivot(const LhPivot &arr[], const int n, const int before,
                 const int lookback, const int minAge, double &outPrice)
{
   outPrice = 0;
   for(int i = n - 1; i >= 0; i--)
   {
      int b = arr[i].bar;
      int age = before - b;
      if(b < before && age >= minAge)
      {
         if(age > lookback) return false;
         outPrice = arr[i].price;
         return true;
      }
   }
   return false;
}

bool LhNextHi(const LhPivot &arr[], const int n, const double from,
              const double minDist, double &outPrice)
{
   outPrice = 0;
   bool found = false;
   for(int i = 0; i < n; i++)
   {
      double p = arr[i].price;
      if(p > from + minDist)
      {
         if(!found || p < outPrice) { outPrice = p; found = true; }
      }
   }
   return found;
}

bool LhNextLo(const LhPivot &arr[], const int n, const double from,
              const double minDist, double &outPrice)
{
   outPrice = 0;
   bool found = false;
   for(int i = 0; i < n; i++)
   {
      double p = arr[i].price;
      if(p < from - minDist)
      {
         if(!found || p > outPrice) { outPrice = p; found = true; }
      }
   }
   return found;
}

bool LhValidRisk(const double entry, const double sl, const double a, const LhConfig &cfg)
{
   return MathAbs(entry - sl) >= a * cfg.minRiskAtr;
}

double LhBuildTp(const int dir, const double entry, const double sl, const double a,
                 const LhConfig &cfg,
                 const LhPivot &pivHi[], const int nHi,
                 const LhPivot &pivLo[], const int nLo)
{
   double risk = MathAbs(entry - sl);
   double tp = (dir == 1) ? (entry + risk * cfg.riskReward) : (entry - risk * cfg.riskReward);
   if(cfg.useOpposingLiq)
   {
      double liq = 0;
      if(dir == 1 && LhNextHi(pivHi, nHi, entry, a * cfg.liqExtendAtr, liq))
         tp = MathMax(tp, liq);
      if(dir == -1 && LhNextLo(pivLo, nLo, entry, a * cfg.liqExtendAtr, liq))
         tp = MathMin(tp, liq);
   }
   double minDist = risk * cfg.minTpR;
   tp = (dir == 1) ? MathMax(tp, entry + minDist) : MathMin(tp, entry - minDist);
   return tp;
}

string LhStructLabel(const int t)
{
   return (t == LH_STRUCT_BOS) ? "BOS" : "MSS";
}

bool LhEmit(const int dir, const double entry, const double sl, const double tp,
            const double ft, const double fb,
            const double raidPx, const double raidExt, const double cisdPx, const double mssPx,
            const int raidBar, const int cisdBar, const int mssBar,
            const int bar, const datetime barTime, const int structType,
            LhSetup &outSetups[], int &nSetups)
{
   LhSetup s;
   ZeroMemory(s);
   s.dir = dir;
   s.entry = entry; s.sl = sl; s.tp = tp;
   s.fvgTop = ft; s.fvgBot = fb;
   s.raidPx = raidPx; s.raidExt = raidExt;
   s.cisdPx = cisdPx; s.mssPx = mssPx;
   s.raidBar = raidBar; s.cisdBar = cisdBar; s.mssBar = mssBar;
   s.structType = structType;
   s.barIndex = bar; s.barTime = barTime;
   s.tag = LhStructLabel(structType);
   ArrayResize(outSetups, nSetups + 1);
   outSetups[nSetups] = s;
   nSetups++;
   return true;
}

// Exact Pine state machine on chronological closed bars
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

   double atrSeries[];
   LhBuildAtrSeries(rates, high, low, close, atrSeries);

   bool hasMssLevel = false;

   for(int i = 0; i <= lastClosed; i++)
   {
      double a = atrSeries[i];
      if(a <= 0) a = LhCalcATR(i, high, low, close);

      int pivI = i - p;
      if(pivI >= p && LhIsPivotLow(pivI, p, low, rates))
         LhPushPivot(pivLo, nLo, low[pivI], pivI);
      if(pivI >= p && LhIsPivotHigh(pivI, p, high, rates))
         LhPushPivot(pivHi, nHi, high[pivI], pivI);

      if(phase == 1 && sweepBar >= 0 && (i - sweepBar) > cfg.maxCisdBars) { phase = 0; pendDir = 0; }
      if(phase == 2 && cisdBar >= 0 && (i - cisdBar) > cfg.maxStructBars) { phase = 0; pendDir = 0; }
      if(phase == 3 && mssBar >= 0 && (i - mssBar) > cfg.maxFvgBars) { phase = 0; pendDir = 0; }
      if(phase == 4 && fvgBar >= 0 && (i - fvgBar) > cfg.maxRetestBars) { phase = 0; pendDir = 0; }

      double huntLo = 0, huntHi = 0;
      bool hasLo = LhLastPivot(pivLo, nLo, i, 100, p, huntLo);
      bool hasHi = LhLastPivot(pivHi, nHi, i, 100, p, huntHi);
      bool canStart = (phase == 0) && (i - lastSetupBar >= cfg.cooldownBars);

      bool sslRaid = canStart && hasLo &&
         low[i] < huntLo - a * cfg.minSweepAtr && close[i] > huntLo;
      bool bslRaid = canStart && hasHi &&
         high[i] > huntHi + a * cfg.minSweepAtr && close[i] < huntHi;

      if(sslRaid)
      {
         phase = cfg.requireCisd ? 1 : 2;
         pendDir = LH_DIR_LONG;
         sweepPx = huntLo;
         sweepExt = low[i];
         sweepBar = i;
         cisdLevel = open[i];
         cisdBar = cfg.requireCisd ? -1 : i;
         mssLevel = hasHi ? huntHi : 0;
         hasMssLevel = hasHi;
         mssBar = -1; fvgBar = -1; structType = 0;
      }
      else if(bslRaid)
      {
         phase = cfg.requireCisd ? 1 : 2;
         pendDir = LH_DIR_SHORT;
         sweepPx = huntHi;
         sweepExt = high[i];
         sweepBar = i;
         cisdLevel = open[i];
         cisdBar = cfg.requireCisd ? -1 : i;
         mssLevel = hasLo ? huntLo : 0;
         hasMssLevel = hasLo;
         mssBar = -1; fvgBar = -1; structType = 0;
      }

      if(phase == 0) continue;

      if(pendDir == LH_DIR_LONG) sweepExt = MathMin(sweepExt, low[i]);
      else                       sweepExt = MathMax(sweepExt, high[i]);

      double body = MathAbs(close[i] - open[i]);

      // Phase 1 CISD
      if(phase == 1)
      {
         bool cisdOk = (pendDir == 1)
            ? (close[i] > cisdLevel && close[i] > open[i])
            : (close[i] < cisdLevel && close[i] < open[i]);
         if(cisdOk)
         {
            cisdBar = i;
            phase = 2;
         }
      }

      // Phase 2 MSS / optional BOS
      if(phase == 2 && (cisdBar < 0 ? (i > sweepBar) : (i > cisdBar)))
      {
         double mssRef = 0, bosRef = 0;
         bool hitMss = false, hitBos = false;
         int barsBack = MathMin(i - sweepBar, 30);

         if(pendDir == 1)
         {
            double mx = high[i];
            if(barsBack > 0)
               for(int k = 0; k <= barsBack; k++)
                  mx = MathMax(mx, high[i - k]);
            mssRef = hasMssLevel ? mssLevel : mx;
            hitMss = close[i] > mssRef && close[i] > open[i] && body >= a * cfg.minDispAtr;
            int bosLook = MathMax(i - sweepBar + 2, 5);
            hitBos = cfg.allowBos &&
               LhLastPivot(pivHi, nHi, i, bosLook, 1, bosRef) &&
               bosRef > sweepPx && close[i] > bosRef && close[i] > open[i] &&
               body >= a * cfg.minDispAtr * 0.85;
         }
         else
         {
            double mn = low[i];
            if(barsBack > 0)
               for(int k = 0; k <= barsBack; k++)
                  mn = MathMin(mn, low[i - k]);
            mssRef = hasMssLevel ? mssLevel : mn;
            hitMss = close[i] < mssRef && close[i] < open[i] && body >= a * cfg.minDispAtr;
            int bosLook = MathMax(i - sweepBar + 2, 5);
            hitBos = cfg.allowBos &&
               LhLastPivot(pivLo, nLo, i, bosLook, 1, bosRef) &&
               bosRef < sweepPx && close[i] < bosRef && close[i] < open[i] &&
               body >= a * cfg.minDispAtr * 0.85;
         }

         if(hitMss || hitBos)
         {
            mssLevel = hitMss ? mssRef : bosRef;
            structType = hitMss ? LH_STRUCT_MSS : LH_STRUCT_BOS;
            mssBar = i;
            phase = 3;
         }
      }

      // Phase 3 FVG
      if(phase == 3 && i >= mssBar && i >= 2)
      {
         bool found = false;
         double ft = 0, fb = 0;
         if(pendDir == 1)
         {
            double bot = high[i - 2];
            double top = low[i];
            if(top - bot >= a * cfg.minFvgAtr) { fb = bot; ft = top; found = true; }
         }
         else
         {
            double top2 = low[i - 2];
            double bot2 = high[i];
            if(top2 - bot2 >= a * cfg.minFvgAtr) { fb = bot2; ft = top2; found = true; }
         }

         if(found)
         {
            fvgTop = ft; fvgBot = fb; fvgBar = i;
            if(cfg.requireFvgRetest)
            {
               phase = 4;
            }
            else
            {
               double entry = (ft + fb) * 0.5;
               if(cisdLevel >= fb && cisdLevel <= ft) entry = cisdLevel;
               double pad = a * cfg.slPadAtr;
               int cBar = (cisdBar < 0) ? sweepBar : cisdBar;
               if(pendDir == 1)
               {
                  double sl = sweepExt - pad;
                  if(entry > sl && LhValidRisk(entry, sl, a, cfg))
                  {
                     double tp = LhBuildTp(1, entry, sl, a, cfg, pivHi, nHi, pivLo, nLo);
                     LhEmit(1, entry, sl, tp, ft, fb, sweepPx, sweepExt, cisdLevel, mssLevel,
                            sweepBar, cBar, mssBar, i, time[i], structType, outSetups, nSetups);
                     lastSetupBar = i;
                  }
               }
               else
               {
                  double sl2 = sweepExt + pad;
                  if(sl2 > entry && LhValidRisk(entry, sl2, a, cfg))
                  {
                     double tp2 = LhBuildTp(-1, entry, sl2, a, cfg, pivHi, nHi, pivLo, nLo);
                     LhEmit(-1, entry, sl2, tp2, ft, fb, sweepPx, sweepExt, cisdLevel, mssLevel,
                            sweepBar, cBar, mssBar, i, time[i], structType, outSetups, nSetups);
                     lastSetupBar = i;
                  }
               }
               phase = 0; pendDir = 0;
            }
         }
      }

      // Phase 4 retest
      if(phase == 4 && i > fvgBar)
      {
         bool confirmed = false;
         if(pendDir == 1)
            confirmed = low[i] <= fvgTop && low[i] >= fvgBot - a * 0.05 &&
                        close[i] > open[i] && close[i] >= (fvgBot + fvgTop) * 0.5;
         else
            confirmed = high[i] >= fvgBot && high[i] <= fvgTop + a * 0.05 &&
                        close[i] < open[i] && close[i] <= (fvgBot + fvgTop) * 0.5;

         if(confirmed)
         {
            double entry = (fvgTop + fvgBot) * 0.5;
            if(cisdLevel >= fvgBot && cisdLevel <= fvgTop) entry = cisdLevel;
            double pad = a * cfg.slPadAtr;
            int cBar = (cisdBar < 0) ? sweepBar : cisdBar;
            if(pendDir == 1)
            {
               double sl = sweepExt - pad;
               if(entry > sl && LhValidRisk(entry, sl, a, cfg))
               {
                  double tp = LhBuildTp(1, entry, sl, a, cfg, pivHi, nHi, pivLo, nLo);
                  LhEmit(1, entry, sl, tp, fvgTop, fvgBot, sweepPx, sweepExt, cisdLevel, mssLevel,
                         sweepBar, cBar, mssBar, i, time[i], structType, outSetups, nSetups);
                  lastSetupBar = i;
               }
            }
            else
            {
               double sl2 = sweepExt + pad;
               if(sl2 > entry && LhValidRisk(entry, sl2, a, cfg))
               {
                  double tp2 = LhBuildTp(-1, entry, sl2, a, cfg, pivHi, nHi, pivLo, nLo);
                  LhEmit(-1, entry, sl2, tp2, fvgTop, fvgBot, sweepPx, sweepExt, cisdLevel, mssLevel,
                         sweepBar, cBar, mssBar, i, time[i], structType, outSetups, nSetups);
                  lastSetupBar = i;
               }
            }
            phase = 0; pendDir = 0;
         }
      }
   }
   return nSetups;
}

void LhNormalizeBars(const int rates,
                     const datetime &time[],
                     const double &open[], const double &high[],
                     const double &low[], const double &close[],
                     datetime &t[], double &o[], double &h[], double &l[], double &c[])
{
   ArrayResize(t, rates); ArrayResize(o, rates); ArrayResize(h, rates);
   ArrayResize(l, rates); ArrayResize(c, rates);
   bool asSeries = (rates > 1 && time[0] > time[rates - 1]);
   if(!asSeries)
   {
      for(int i = 0; i < rates; i++)
      { t[i]=time[i]; o[i]=open[i]; h[i]=high[i]; l[i]=low[i]; c[i]=close[i]; }
      return;
   }
   for(int i = 0; i < rates; i++)
   {
      int src = rates - 1 - i;
      t[i]=time[src]; o[i]=open[src]; h[i]=high[src]; l[i]=low[src]; c[i]=close[src];
   }
}

#endif
//+------------------------------------------------------------------+
