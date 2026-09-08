//+------------------------------------------------------------------+
//| SMM_Engine.mqh — TRH Supply MM Pack (Setups 1–5 + Clean Score)   |
//| Port of indicators/TRH_Supply_MM.pine for MT5 indicator + EA.    |
//+------------------------------------------------------------------+
#ifndef SMM_ENGINE_MQH
#define SMM_ENGINE_MQH

#define SMM_ENGINE_VERSION 101
#define SMM_MAX_ZONES      8
#define SMM_MAX_PIVOTS     24
#define SMM_ATR_LEN        14

#define SMM_KIND_MM        0   // Setup 1 — Displacement → OB/FVG
#define SMM_KIND_MSS       1   // Setup 2 — MSS Fresh
#define SMM_KIND_HTF_LQ    2   // Setup 3 — HTF + LQ
#define SMM_KIND_BB_FVG    3   // Setup 4 — Sweep → MSS → BB+FVG
#define SMM_KIND_FS        4   // Setup 5 — Fractal Sweep

struct SmmPivot
{
   double price;
   int    bar;
};

struct SmmZone
{
   int      dir;       // 1 long, -1 short
   int      kind;      // SMM_KIND_*
   double   proximal;  // ENTRY
   double   distal;    // SL
   double   entry;
   double   sl;
   double   tp;
   int      score;     // 0–100
   int      grade;     // 0=D 1=C 2=B 3=A
   bool     left;
   bool     armed;
   bool     frozen;    // ENTRY/SL/TP locked — no mid-trade rewrite
   bool     dead;
   double   lq;
   int      lqN;
   double   impulse;   // birth body for score refresh
   datetime barTime;
   int      barIndex;
   int      age;
};

struct SmmConfig
{
   bool   useMM;
   bool   useMss;
   bool   useHtf;
   bool   useBb;
   bool   useFs;
   bool   allowLong;
   bool   allowShort;

   double minDispAtr;
   double minCtxAtr;
   int    maxLookback;
   double minFvgAtr;
   double minFvgPts;
   double minZonePts;
   double maxZoneAtr;
   int    cooldownBars;

   int    mssPivot;
   double mssBodyAtr;
   int    structBars;
   double minStructR;
   double lqTolAtr;
   int    minLqTouches;
   int    lqFallbackBars;

   int    sweepLookback;
   double bbFvgPadAtr;

   int    fsPivot;
   double fsMaxDepthAtr;
   double fsMinDepthPts;
   int    fsCooldown;

   bool   requireLeave;
   bool   invalidateThru;
   int    maxZoneAge;
   int    maxLiveZones;
   bool   dedupeOverlap;

   bool   useCleanScore;
   bool   rejectLowScore;
   int    minScoreKeep;
   int    minScoreArm;
   bool   hideFsNoise;

   double riskReward;   // fallback TP if no structure
};

void SmmDefaultConfig(SmmConfig &c)
{
   c.useMM = true; c.useMss = true; c.useHtf = true; c.useBb = true; c.useFs = true;
   c.allowLong = true; c.allowShort = true;
   c.minDispAtr = 0.70; c.minCtxAtr = 0.40; c.maxLookback = 8;
   c.minFvgAtr = 0.25; c.minFvgPts = 1.50; c.minZonePts = 2.0; c.maxZoneAtr = 2.5;
   c.cooldownBars = 25;
   c.mssPivot = 3; c.mssBodyAtr = 0.35; c.structBars = 120; c.minStructR = 1.5;
   c.lqTolAtr = 0.12; c.minLqTouches = 2; c.lqFallbackBars = 20;
   c.sweepLookback = 18; c.bbFvgPadAtr = 0.35;
   c.fsPivot = 2; c.fsMaxDepthAtr = 0.85; c.fsMinDepthPts = 0.10; c.fsCooldown = 8;
   c.requireLeave = true; c.invalidateThru = true; c.maxZoneAge = 80;
   c.maxLiveZones = 3; c.dedupeOverlap = true;
   c.useCleanScore = true; c.rejectLowScore = true;
   c.minScoreKeep = 70; c.minScoreArm = 70; c.hideFsNoise = true;
   c.riskReward = 2.5;
}

string SmmKindName(const int kind)
{
   if(kind == SMM_KIND_MM)     return "S1-MM";
   if(kind == SMM_KIND_MSS)    return "S2-MSS";
   if(kind == SMM_KIND_HTF_LQ) return "S3-HTF/LQ";
   if(kind == SMM_KIND_BB_FVG) return "S4-BB+FVG";
   if(kind == SMM_KIND_FS)     return "S5-fs";
   return "S?-";
}

string SmmGradeLetter(const int grade)
{
   if(grade >= 3) return "A";
   if(grade == 2) return "B";
   if(grade == 1) return "C";
   return "D";
}

int SmmGradeFromScore(const int sc)
{
   if(sc >= 80) return 3;
   if(sc >= 70) return 2;
   if(sc >= 55) return 1;
   return 0;
}

double SmmAtr(const double &high[], const double &low[], const double &close[],
              const int rates, const int shift)
{
   if(rates < SMM_ATR_LEN + 2 || shift < 0) return 0;
   double sum = 0;
   int n = 0;
   for(int i = shift; i < shift + SMM_ATR_LEN && i < rates - 1; i++)
   {
      double tr = high[i] - low[i];
      double a = MathAbs(high[i] - close[i + 1]);
      double b = MathAbs(low[i] - close[i + 1]);
      if(a > tr) tr = a;
      if(b > tr) tr = b;
      sum += tr;
      n++;
   }
   return (n > 0) ? sum / n : 0;
}

bool SmmZoneOk(const SmmConfig &c, const double prox, const double dist, const double atr)
{
   double h = MathAbs(dist - prox);
   if(h < c.minZonePts) return false;
   if(atr > 0 && h > atr * c.maxZoneAtr) return false;
   return h > _Point;
}

double SmmStructTp(const SmmConfig &c, const int dir, const double entry, const double sl,
                   const double &high[], const double &low[], const int rates)
{
   double risk = MathAbs(entry - sl);
   double tp = (dir == 1) ? entry + risk * c.riskReward : entry - risk * c.riskReward;
   int look = MathMin(c.structBars, rates - 2);
   if(look < 5 || risk <= 0) return tp;

   if(dir == -1)
   {
      double ssl = low[1];
      for(int i = 1; i <= look; i++)
         if(low[i] < ssl) ssl = low[i];
      if(ssl < entry && (entry - ssl) >= risk * c.minStructR)
         tp = ssl;
   }
   else
   {
      double bsl = high[1];
      for(int i = 1; i <= look; i++)
         if(high[i] > bsl) bsl = high[i];
      if(bsl > entry && (bsl - entry) >= risk * c.minStructR)
         tp = bsl;
   }
   return tp;
}

int SmmScoreZone(const SmmConfig &c, const int dir, const double prox, const double dist,
                 const int kind, const int lqN, const double atr,
                 const double body, const double &high[], const double &low[], const int rates)
{
   int sc = 56;
   if(kind == SMM_KIND_BB_FVG) sc = 74;
   else if(kind == SMM_KIND_HTF_LQ) sc = 70;
   else if(kind == SMM_KIND_MSS) sc = 60;
   else if(kind == SMM_KIND_MM) sc = 56;
   else sc = 36;
   if(c.hideFsNoise && kind == SMM_KIND_FS) sc -= 8;

   double risk = MathAbs(dist - prox);
   double atrX = (atr > 0) ? risk / atr : 1.0;
   if(atrX >= 0.22 && atrX <= 1.10) sc += 14;
   else if(atrX < 0.12 || atrX > 2.20) sc -= 22;
   else if(atrX > 1.50 || atrX < 0.18) sc -= 10;

   double tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
   double reward = MathAbs(tp - prox);
   double rr = (risk > 0) ? reward / risk : 0;
   if(rr >= 3.0) sc += 14;
   else if(rr >= 2.0) sc += 9;
   else if(rr >= 1.5) sc += 3;
   else sc -= 14;

   if(atr > 0 && body >= atr * c.minDispAtr) sc += 6;
   else if(atr > 0 && body < atr * 0.20) sc -= 6;

   if(kind == SMM_KIND_HTF_LQ && lqN >= c.minLqTouches) sc += 12;

   // Mid-chop penalty
   int look = MathMin(30, rates - 2);
   if(look > 5 && atr > 0)
   {
      double hiN = high[1], loN = low[1];
      for(int i = 1; i <= look; i++)
      {
         if(high[i] > hiN) hiN = high[i];
         if(low[i] < loN) loN = low[i];
      }
      double mid = (hiN + loN) * 0.5;
      double rng = hiN - loN;
      if(rng > atr && MathAbs(prox - mid) < rng * 0.18)
         sc -= 8;
   }

   if(sc > 100) sc = 100;
   if(sc < 0) sc = 0;
   return sc;
}

bool SmmIsPivotHigh(const double &high[], const int rates, const int bar, const int left, const int right)
{
   if(bar - right < 0 || bar + left >= rates) return false;
   double p = high[bar];
   for(int i = 1; i <= left; i++)
      if(high[bar + i] >= p) return false;
   for(int i = 1; i <= right; i++)
      if(high[bar - i] > p) return false;
   return true;
}

bool SmmIsPivotLow(const double &low[], const int rates, const int bar, const int left, const int right)
{
   if(bar - right < 0 || bar + left >= rates) return false;
   double p = low[bar];
   for(int i = 1; i <= left; i++)
      if(low[bar + i] <= p) return false;
   for(int i = 1; i <= right; i++)
      if(low[bar - i] < p) return false;
   return true;
}

int SmmCollectPivots(const double &high[], const double &low[], const int rates,
                     const int pivLen, SmmPivot &hiOut[], SmmPivot &loOut[])
{
   ArrayResize(hiOut, 0);
   ArrayResize(loOut, 0);
   int start = pivLen;
   int end = rates - pivLen - 1;
   for(int bar = end; bar >= start; bar--)
   {
      if(SmmIsPivotHigh(high, rates, bar, pivLen, pivLen))
      {
         int n = ArraySize(hiOut);
         if(n < SMM_MAX_PIVOTS)
         {
            ArrayResize(hiOut, n + 1);
            hiOut[n].price = high[bar];
            hiOut[n].bar = bar;
         }
      }
      if(SmmIsPivotLow(low, rates, bar, pivLen, pivLen))
      {
         int n = ArraySize(loOut);
         if(n < SMM_MAX_PIVOTS)
         {
            ArrayResize(loOut, n + 1);
            loOut[n].price = low[bar];
            loOut[n].bar = bar;
         }
      }
   }
   return ArraySize(hiOut) + ArraySize(loOut);
}

bool SmmFindOb(const int dir, const int maxLook,
               const double &open[], const double &close[],
               const double &high[], const double &low[],
               double &prox, double &dist)
{
   for(int k = 1; k <= maxLook; k++)
   {
      bool opp = (dir == -1) ? (close[k] > open[k]) : (close[k] < open[k]);
      if(!opp) continue;
      if(dir == -1) { prox = low[k]; dist = high[k]; }
      else          { prox = high[k]; dist = low[k]; }
      return true;
   }
   return false;
}

bool SmmFindFvg(const int dir, const int look, const SmmConfig &c, const double atr,
                const double &high[], const double &low[],
                double &gTop, double &gBot)
{
   for(int k = 0; k <= look; k++)
   {
      if(dir == 1 && high[k + 2] < low[k])
      {
         double gap = low[k] - high[k + 2];
         if(gap >= MathMax(atr * c.minFvgAtr, c.minFvgPts))
         {
            gTop = low[k]; gBot = high[k + 2];
            return true;
         }
      }
      if(dir == -1 && low[k + 2] > high[k])
      {
         double gap = low[k + 2] - high[k];
         if(gap >= MathMax(atr * c.minFvgAtr, c.minFvgPts))
         {
            gTop = low[k + 2]; gBot = high[k];
            return true;
         }
      }
   }
   return false;
}

bool SmmBbFvgConfluence(const int dir, const double bbProx, const double bbDist,
                        const double gTop, const double gBot, const SmmConfig &c, const double atr,
                        double &prox, double &dist)
{
   double zTop = MathMax(bbProx, bbDist);
   double zBot = MathMin(bbProx, bbDist);
   double oTop = MathMin(zTop, gTop);
   double oBot = MathMax(zBot, gBot);
   if(oTop > oBot)
   {
      if(dir == 1) { prox = oTop; dist = oBot; }
      else         { prox = oBot; dist = oTop; }
      return true;
   }
   double gap = oBot - oTop;
   if(atr > 0 && gap <= atr * c.bbFvgPadAtr)
   {
      double mTop = MathMax(zTop, gTop);
      double mBot = MathMin(zBot, gBot);
      if(dir == 1) { prox = mTop; dist = mBot; }
      else         { prox = mBot; dist = mTop; }
      return true;
   }
   return false;
}

void SmmPushZone(SmmZone &zones[], const SmmConfig &c,
                 const int dir, const int kind, const double prox, const double dist,
                 const datetime t, const int barIndex,
                 const double atr, const double body,
                 const double &high[], const double &low[], const int rates)
{
   if(!SmmZoneOk(c, prox, dist, atr)) return;
   int sc = c.useCleanScore
      ? SmmScoreZone(c, dir, prox, dist, kind, 0, atr, body, high, low, rates)
      : 75;
   // Confluence: another live zone same direction nearby
   if(c.useCleanScore && atr > 0)
   {
      for(int j = 0; j < ArraySize(zones); j++)
      {
         if(zones[j].dead || zones[j].dir != dir || zones[j].kind == kind) continue;
         if(MathAbs(zones[j].proximal - prox) <= atr * 0.55)
         {
            sc += 10;
            break;
         }
      }
      if(sc > 100) sc = 100;
   }
   if(c.useCleanScore && c.rejectLowScore && sc < c.minScoreKeep)
      return;

   int n = ArraySize(zones);
   ArrayResize(zones, n + 1);
   zones[n].dir = dir;
   zones[n].kind = kind;
   zones[n].proximal = prox;
   zones[n].distal = dist;
   zones[n].entry = prox;
   zones[n].sl = dist;
   zones[n].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
   zones[n].score = sc;
   zones[n].grade = SmmGradeFromScore(sc);
   zones[n].left = (kind == SMM_KIND_FS) ? true : !c.requireLeave;
   zones[n].armed = (kind == SMM_KIND_FS) && (!c.useCleanScore || sc >= c.minScoreArm);
   zones[n].frozen = zones[n].armed; // fs armed at birth → lock immediately
   zones[n].dead = false;
   zones[n].lq = 0;
   zones[n].lqN = 0;
   zones[n].impulse = body;
   zones[n].barTime = t;
   zones[n].barIndex = barIndex;
   zones[n].age = 0;
}

int SmmFindZoneIndex(const SmmZone &zones[], const SmmZone &needle)
{
   for(int i = 0; i < ArraySize(zones); i++)
   {
      if(zones[i].dead) continue;
      if(zones[i].barTime == needle.barTime &&
         zones[i].kind == needle.kind &&
         zones[i].dir == needle.dir &&
         MathAbs(zones[i].proximal - needle.proximal) <= _Point * 2.0)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Main scan — births new zones on bar 1 (last closed)              |
//+------------------------------------------------------------------+
int SmmScanBirths(const int rates,
                  const datetime &time[],
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[],
                  const SmmConfig &c,
                  SmmZone &zones[],
                  int &lastBirthBar,
                  int &lastFsBirthBar,
                  int &bullSweepUntil,
                  int &bearSweepUntil,
                  double &lastBullSweepLo,
                  double &lastBearSweepHi)
{
   if(rates < 80) return 0;
   // Arrays are series: index 0 = current forming, 1 = last closed
   double atr = SmmAtr(high, low, close, rates, 1);
   if(atr <= 0) return 0;
   double body = MathAbs(close[1] - open[1]);
   double impulse = high[1] - low[1];
   int born = 0;
   bool canBirth = (lastBirthBar < 0) || ((rates - 1 - lastBirthBar) >= c.cooldownBars);

   // Pivots for MSS / fs
   SmmPivot hiPx[], loPx[];
   SmmCollectPivots(high, low, rates, c.mssPivot, hiPx, loPx);
   double lastHi = (ArraySize(hiPx) > 0) ? hiPx[0].price : 0;
   double lastLo = (ArraySize(loPx) > 0) ? loPx[0].price : 0;
   int lastHiB = (ArraySize(hiPx) > 0) ? hiPx[0].bar : -1;
   int lastLoB = (ArraySize(loPx) > 0) ? loPx[0].bar : -1;

   // --- Setup 1: Displacement → OB ---
   bool bearDisp = (close[1] < open[1] && body >= atr * c.minDispAtr && impulse >= atr * c.minCtxAtr);
   bool bullDisp = (close[1] > open[1] && body >= atr * c.minDispAtr && impulse >= atr * c.minCtxAtr);

   if(c.useMM && canBirth && bearDisp && c.allowShort)
   {
      double p, d;
      if(SmmFindOb(-1, c.maxLookback, open, close, high, low, p, d) && p > close[1])
      {
         int before = ArraySize(zones);
         SmmPushZone(zones, c, -1, SMM_KIND_MM, p, d, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }
   if(c.useMM && canBirth && bullDisp && c.allowLong)
   {
      double p, d;
      if(SmmFindOb(1, c.maxLookback, open, close, high, low, p, d) && p < close[1])
      {
         int before = ArraySize(zones);
         SmmPushZone(zones, c, 1, SMM_KIND_MM, p, d, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }

   // Setup 1 FVG path
   bool bearFvg = (rates > 3 && low[3] > high[1] && (low[3] - high[1]) >= MathMax(atr * c.minFvgAtr, c.minFvgPts));
   bool bullFvg = (rates > 3 && high[3] < low[1] && (low[1] - high[3]) >= MathMax(atr * c.minFvgAtr, c.minFvgPts));
   if(c.useMM && canBirth && bearFvg && c.allowShort && bearDisp)
   {
      int before = ArraySize(zones);
      SmmPushZone(zones, c, -1, SMM_KIND_MM, high[1], low[3], time[1], rates - 1, atr, body, high, low, rates);
      if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
   }
   if(c.useMM && canBirth && bullFvg && c.allowLong && bullDisp)
   {
      int before = ArraySize(zones);
      SmmPushZone(zones, c, 1, SMM_KIND_MM, low[1], high[3], time[1], rates - 1, atr, body, high, low, rates);
      if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
   }

   // Wick sweep memory for Setup 4
   if(c.useBb && lastLo > 0 && low[1] < lastLo && close[1] > lastLo)
   {
      bullSweepUntil = (rates - 1) + c.sweepLookback;
      lastBullSweepLo = low[1];
   }
   if(c.useBb && lastHi > 0 && high[1] > lastHi && close[1] < lastHi)
   {
      bearSweepUntil = (rates - 1) + c.sweepLookback;
      lastBearSweepHi = high[1];
   }

   // --- Setup 2/3: MSS ---
   bool mssShort = (c.useMss || c.useHtf) && c.allowShort && lastLo > 0 && lastHi > 0
      && lastHiB >= 0 && lastLoB >= 0 && lastHiB < lastLoB // hi more recent in series? wait: smaller bar index = more recent
      ;
   // In series arrays, smaller index = newer. So lastHiB < lastLoB means hi is newer than lo.
   // Pine: lastHiB > lastLoB with bar_index growing — opposite indexing.
   // Our pivots: bar is series index, smaller = newer. For short MSS: last swing was high then break low.
   // Need: most recent pivot before break is a high that came after a low (upswing then break down).
   // Recompute: hiPx[0] and loPx[0] are most recent of each type.
   mssShort = (c.useMss || c.useHtf) && c.allowShort && lastLo > 0 && lastHi > 0
      && lastHiB < lastLoB // high is more recent than low → then we break the low
      && close[1] < lastLo && body >= atr * c.mssBodyAtr && close[1] < open[1];
   bool mssLong = (c.useMss || c.useHtf) && c.allowLong && lastHi > 0 && lastLo > 0
      && lastLoB < lastHiB
      && close[1] > lastHi && body >= atr * c.mssBodyAtr && close[1] > open[1];

   if(canBirth && mssShort)
   {
      double p, d;
      if(SmmFindOb(-1, c.maxLookback, open, close, high, low, p, d) && p > close[1])
      {
         int kind = c.useHtf ? SMM_KIND_HTF_LQ : SMM_KIND_MSS;
         int before = ArraySize(zones);
         SmmPushZone(zones, c, -1, kind, p, d, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }
   if(canBirth && mssLong)
   {
      double p, d;
      if(SmmFindOb(1, c.maxLookback, open, close, high, low, p, d) && p < close[1])
      {
         int kind = c.useHtf ? SMM_KIND_HTF_LQ : SMM_KIND_MSS;
         int before = ArraySize(zones);
         SmmPushZone(zones, c, 1, kind, p, d, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }

   // --- Setup 4: Sweep → MSS → BB+FVG ---
   bool bbLong = c.useBb && c.allowLong && (rates - 1) <= bullSweepUntil
      && lastHi > 0 && close[1] > lastHi && body >= atr * c.mssBodyAtr && close[1] > open[1];
   bool bbShort = c.useBb && c.allowShort && (rates - 1) <= bearSweepUntil
      && lastLo > 0 && close[1] < lastLo && body >= atr * c.mssBodyAtr && close[1] < open[1];

   if(canBirth && bbLong)
   {
      double bp, bd, gt, gb, zp, zd;
      if(SmmFindOb(1, c.maxLookback, open, close, high, low, bp, bd)
         && SmmFindFvg(1, 10, c, atr, high, low, gt, gb)
         && SmmBbFvgConfluence(1, bp, bd, gt, gb, c, atr, zp, zd)
         && zp < close[1])
      {
         if(lastBullSweepLo > 0) zd = MathMin(zd, lastBullSweepLo);
         int before = ArraySize(zones);
         SmmPushZone(zones, c, 1, SMM_KIND_BB_FVG, zp, zd, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }
   if(canBirth && bbShort)
   {
      double bp, bd, gt, gb, zp, zd;
      if(SmmFindOb(-1, c.maxLookback, open, close, high, low, bp, bd)
         && SmmFindFvg(-1, 10, c, atr, high, low, gt, gb)
         && SmmBbFvgConfluence(-1, bp, bd, gt, gb, c, atr, zp, zd)
         && zp > close[1])
      {
         if(lastBearSweepHi > 0) zd = MathMax(zd, lastBearSweepHi);
         int before = ArraySize(zones);
         SmmPushZone(zones, c, -1, SMM_KIND_BB_FVG, zp, zd, time[1], rates - 1, atr, body, high, low, rates);
         if(ArraySize(zones) > before) { lastBirthBar = rates - 1; born++; canBirth = false; }
      }
   }

   // --- Setup 5: Fractal Sweep ---
   bool canFs = (lastFsBirthBar < 0) || ((rates - 1 - lastFsBirthBar) >= c.fsCooldown);
   if(c.useFs && canFs)
   {
      SmmPivot fsHi[], fsLo[];
      SmmCollectPivots(high, low, rates, c.fsPivot, fsHi, fsLo);
      if(c.allowLong && ArraySize(fsLo) > 0)
      {
         for(int i = 0; i < ArraySize(fsLo) && i < 6; i++)
         {
            double fsLv = fsLo[i].price;
            int fsB = fsLo[i].bar;
            if(fsB <= 1 + c.fsPivot) continue;
            if(!(low[1] < fsLv && close[1] >= fsLv)) continue;
            double depth = fsLv - low[1];
            if(depth < c.fsMinDepthPts || depth > atr * c.fsMaxDepthAtr) continue;
            int before = ArraySize(zones);
            SmmPushZone(zones, c, 1, SMM_KIND_FS, fsLv, low[1], time[1], rates - 1, atr, body, high, low, rates);
            if(ArraySize(zones) > before) { lastFsBirthBar = rates - 1; born++; break; }
         }
      }
      if(c.allowShort && ArraySize(fsHi) > 0)
      {
         for(int i = 0; i < ArraySize(fsHi) && i < 6; i++)
         {
            double fsLv = fsHi[i].price;
            int fsB = fsHi[i].bar;
            if(fsB <= 1 + c.fsPivot) continue;
            if(!(high[1] > fsLv && close[1] <= fsLv)) continue;
            double depth = high[1] - fsLv;
            if(depth < c.fsMinDepthPts || depth > atr * c.fsMaxDepthAtr) continue;
            int before = ArraySize(zones);
            SmmPushZone(zones, c, -1, SMM_KIND_FS, fsLv, high[1], time[1], rates - 1, atr, body, high, low, rates);
            if(ArraySize(zones) > before) { lastFsBirthBar = rates - 1; born++; break; }
         }
      }
   }

   return born;
}

//+------------------------------------------------------------------+
//| Manage live zones: leave / LQ / arm / expire / dedupe            |
//+------------------------------------------------------------------+
void SmmManageZones(SmmZone &zones[], const SmmConfig &c,
                    const double &high[], const double &low[], const double &close[],
                    const int rates)
{
   double atr = SmmAtr(high, low, close, rates, 0);
   if(atr <= 0) atr = _Point * 10;

   for(int i = ArraySize(zones) - 1; i >= 0; i--)
   {
      if(zones[i].dead) continue;
      zones[i].age++;
      double prox = zones[i].proximal;
      double dist = zones[i].distal;
      double loZ = MathMin(prox, dist);
      double hiZ = MathMax(prox, dist);
      int dir = zones[i].dir;
      int kind = zones[i].kind;

      if(!zones[i].left)
      {
         bool left = (dir == -1) ? (close[1] < loZ) : (close[1] > hiZ);
         if(left)
         {
            zones[i].left = true;
            // Snapshot TP at leave so reward does not drift while HUNT runs
            if(!zones[i].frozen)
               zones[i].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
         }
      }

      if(zones[i].left && !zones[i].armed && kind != SMM_KIND_FS)
      {
         bool scoreOk = !c.useCleanScore || zones[i].score >= c.minScoreArm;
         if(kind == SMM_KIND_HTF_LQ)
         {
            if(dir == -1)
            {
               if(high[1] >= prox - atr * c.lqTolAtr * 2.0)
               {
                  if(zones[i].lqN == 0) { zones[i].lq = high[1]; zones[i].lqN = 1; }
                  else if(MathAbs(high[1] - zones[i].lq) <= atr * c.lqTolAtr)
                  {
                     zones[i].lq = (zones[i].lq * zones[i].lqN + high[1]) / (zones[i].lqN + 1.0);
                     zones[i].lqN++;
                  }
                  else if(high[1] > zones[i].lq + atr * c.lqTolAtr)
                  { zones[i].lq = high[1]; zones[i].lqN = 1; }
               }
               // Hunt wick beyond OB → widen SL only before freeze
               if(!zones[i].frozen && high[1] > dist)
               {
                  zones[i].distal = high[1];
                  dist = high[1];
                  hiZ = MathMax(prox, dist);
               }
               zones[i].score = SmmScoreZone(c, dir, prox, dist, kind, zones[i].lqN, atr,
                                             zones[i].impulse, high, low, rates);
               zones[i].grade = SmmGradeFromScore(zones[i].score);
               scoreOk = !c.useCleanScore || zones[i].score >= c.minScoreArm;
               bool swept = zones[i].lqN >= c.minLqTouches && high[1] > zones[i].lq;
               bool inZn = high[1] >= prox && low[1] <= hiZ;
               bool fallback = zones[i].age >= c.lqFallbackBars && inZn && zones[i].lqN >= 1;
               // First return into zone → lock levels
               if(inZn)
               {
                  zones[i].frozen = true;
                  zones[i].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
                  if(scoreOk && (swept || fallback))
                     zones[i].armed = true;
               }
            }
            else
            {
               if(low[1] <= prox + atr * c.lqTolAtr * 2.0)
               {
                  if(zones[i].lqN == 0) { zones[i].lq = low[1]; zones[i].lqN = 1; }
                  else if(MathAbs(low[1] - zones[i].lq) <= atr * c.lqTolAtr)
                  {
                     zones[i].lq = (zones[i].lq * zones[i].lqN + low[1]) / (zones[i].lqN + 1.0);
                     zones[i].lqN++;
                  }
                  else if(low[1] < zones[i].lq - atr * c.lqTolAtr)
                  { zones[i].lq = low[1]; zones[i].lqN = 1; }
               }
               if(!zones[i].frozen && low[1] < dist)
               {
                  zones[i].distal = low[1];
                  dist = low[1];
                  loZ = MathMin(prox, dist);
               }
               zones[i].score = SmmScoreZone(c, dir, prox, dist, kind, zones[i].lqN, atr,
                                             zones[i].impulse, high, low, rates);
               zones[i].grade = SmmGradeFromScore(zones[i].score);
               scoreOk = !c.useCleanScore || zones[i].score >= c.minScoreArm;
               bool swept = zones[i].lqN >= c.minLqTouches && low[1] < zones[i].lq;
               bool inZn = low[1] <= prox && high[1] >= loZ;
               bool fallback = zones[i].age >= c.lqFallbackBars && inZn && zones[i].lqN >= 1;
               if(inZn)
               {
                  zones[i].frozen = true;
                  zones[i].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
                  if(scoreOk && (swept || fallback))
                     zones[i].armed = true;
               }
            }
         }
         else
         {
            bool touched = (dir == -1) ? (high[1] >= prox && low[1] <= hiZ) : (low[1] <= prox && high[1] >= loZ);
            bool atProx = (dir == -1) ? (high[1] >= prox) : (low[1] <= prox);
            if(touched && atProx)
            {
               zones[i].frozen = true;
               zones[i].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
               if(scoreOk) zones[i].armed = true;
            }
         }
      }

      if(c.invalidateThru)
      {
         bool blown = (dir == -1) ? (close[1] > dist) : (close[1] < dist);
         if(blown) zones[i].dead = true;
      }
      // Never age-kill an armed/frozen in-trade setup
      if(!zones[i].armed && !zones[i].frozen && zones[i].age >= c.maxZoneAge)
         zones[i].dead = true;
      if(zones[i].armed || zones[i].frozen)
      {
         bool hitTp = (dir == -1) ? (low[1] <= zones[i].tp) : (high[1] >= zones[i].tp);
         if(hitTp) zones[i].dead = true;
      }

      // Refresh TP only while still scouting (not left / not frozen)
      if(!zones[i].left && !zones[i].frozen && !zones[i].armed)
         zones[i].tp = SmmStructTp(c, dir, prox, dist, high, low, rates);
      zones[i].entry = zones[i].proximal;
      zones[i].sl = zones[i].distal;
   }

   // Dedupe overlap — keep higher score (never drop active HUNT / frozen trade)
   if(c.dedupeOverlap)
   {
      for(int i = ArraySize(zones) - 1; i >= 1; i--)
      {
         if(zones[i].dead) continue;
         for(int j = i - 1; j >= 0; j--)
         {
            if(zones[j].dead || zones[i].dir != zones[j].dir) continue;
            double loI = MathMin(zones[i].proximal, zones[i].distal);
            double hiI = MathMax(zones[i].proximal, zones[i].distal);
            double loJ = MathMin(zones[j].proximal, zones[j].distal);
            double hiJ = MathMax(zones[j].proximal, zones[j].distal);
            bool overlap = (loI <= hiJ && loJ <= hiI);
            bool near = MathAbs(zones[i].proximal - zones[j].proximal) <= atr * 0.4;
            if(overlap || near)
            {
               bool actI = zones[i].left || zones[i].armed || zones[i].frozen;
               bool actJ = zones[j].left || zones[j].armed || zones[j].frozen;
               if(actI && !actJ) zones[j].dead = true;
               else if(actJ && !actI) zones[i].dead = true;
               else if(!actI && !actJ)
               {
                  if(zones[i].score >= zones[j].score) zones[j].dead = true;
                  else zones[i].dead = true;
               }
            }
         }
      }
   }

   // Compact dead
   for(int i = ArraySize(zones) - 1; i >= 0; i--)
   {
      if(zones[i].dead)
      {
         for(int k = i; k < ArraySize(zones) - 1; k++)
            zones[k] = zones[k + 1];
         ArrayResize(zones, ArraySize(zones) - 1);
      }
   }

   // Cap live — never drop active HUNT / frozen trade
   while(ArraySize(zones) > c.maxLiveZones)
   {
      int drop = -1, worst = 999;
      for(int i = 0; i < ArraySize(zones); i++)
      {
         if(zones[i].left || zones[i].armed || zones[i].frozen) continue;
         if(zones[i].score < worst) { worst = zones[i].score; drop = i; }
      }
      if(drop < 0) break;
      for(int k = drop; k < ArraySize(zones) - 1; k++)
         zones[k] = zones[k + 1];
      ArrayResize(zones, ArraySize(zones) - 1);
   }
}

int SmmBestArmedIndex(const SmmZone &zones[], const SmmConfig &c)
{
   int best = -1, bestSc = -1;
   for(int i = 0; i < ArraySize(zones); i++)
   {
      if(!zones[i].armed || zones[i].dead) continue;
      if(c.useCleanScore && zones[i].score < c.minScoreArm) continue;
      if(zones[i].score > bestSc)
      {
         bestSc = zones[i].score;
         best = i;
      }
   }
   return best;
}

int SmmBestLiveIndex(const SmmZone &zones[])
{
   // Prefer frozen/armed, then left HUNT, then highest score — stops cockpit jump mid-trade
   int best = -1, bestBoost = -1;
   for(int i = 0; i < ArraySize(zones); i++)
   {
      if(zones[i].dead) continue;
      int boost = zones[i].score;
      if(zones[i].armed || zones[i].frozen) boost += 2000;
      else if(zones[i].left) boost += 1000;
      if(boost > bestBoost)
      {
         bestBoost = boost;
         best = i;
      }
   }
   return best;
}

#endif // SMM_ENGINE_MQH
