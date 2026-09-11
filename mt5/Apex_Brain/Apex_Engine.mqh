//+------------------------------------------------------------------+
//| Apex_Engine.mqh — APEX Brain v1.1                                |
//| Thesis: RAID → SHIFT → POCKET → CONFIRM → STRIKE                 |
//| Geometry: ENTRY=prox · SL=dist · TP=1:3 R:R                      |
//+------------------------------------------------------------------+
#ifndef APEX_ENGINE_MQH
#define APEX_ENGINE_MQH

#define APEX_ENGINE_VERSION 110
#define APEX_MAX_SETUPS     8
#define APEX_ATR_LEN        14

enum ApexPhase
{
   APEX_SCOUT = 0,
   APEX_RAID,
   APEX_SHIFT,
   APEX_POCKET,
   APEX_CONFIRM,
   APEX_ARMED,
   APEX_LIVE,
   APEX_DONE,
   APEX_DEAD
};

struct ApexSetup
{
   int      dir;          // 1 long, -1 short
   ApexPhase phase;
   double   raidPx;
   double   prox;         // ENTRY
   double   dist;         // SL
   double   entry;
   double   sl;
   double   tp;
   int      score;
   int      grade;        // 0=D..3=A
   bool     frozen;
   bool     dead;
   datetime raidTime;
   datetime shiftTime;
   datetime birthTime;
   int      age;
   string   story;
};

struct ApexConfig
{
   bool   allowLong;
   bool   allowShort;
   int    swingPivot;
   double raidTolAtr;
   double minDispAtr;
   double minZonePts;
   double maxZoneAtr;
   int    pocketLook;
   int    confirmMinScore;
   double riskReward;
   int    maxAgeBars;
   int    cooldownBars;
   bool   requireLeave;
   bool   invalidateThru;
};

void ApexDefaultConfig(ApexConfig &c)
{
   c.allowLong = true;
   c.allowShort = true;
   c.swingPivot = 2;
   c.raidTolAtr = 0.15;
   c.minDispAtr = 0.30;
   c.minZonePts = 0.5;
   c.maxZoneAtr = 3.5;
   c.pocketLook = 16;
   c.confirmMinScore = 55;
   c.riskReward = 3.0;
   c.maxAgeBars = 160;
   c.cooldownBars = 3;
   c.requireLeave = true;
   c.invalidateThru = true;
}

string ApexPhaseName(const ApexPhase p)
{
   switch(p)
   {
      case APEX_SCOUT:   return "SCOUT";
      case APEX_RAID:    return "RAID";
      case APEX_SHIFT:   return "SHIFT";
      case APEX_POCKET:  return "POCKET";
      case APEX_CONFIRM: return "CONFIRM";
      case APEX_ARMED:   return "ARMED";
      case APEX_LIVE:    return "LIVE";
      case APEX_DONE:    return "DONE";
      default:           return "DEAD";
   }
}

string ApexGradeLetter(const int g)
{
   if(g >= 3) return "A";
   if(g == 2) return "B";
   if(g == 1) return "C";
   return "D";
}

int ApexGradeFromScore(const int sc)
{
   if(sc >= 85) return 3;
   if(sc >= 70) return 2;
   if(sc >= 55) return 1;
   return 0;
}

double ApexAtr(const double &high[], const double &low[], const double &close[],
               const int rates, const int shift)
{
   if(rates < APEX_ATR_LEN + shift + 2) return 0;
   double sum = 0;
   for(int i = shift; i < shift + APEX_ATR_LEN; i++)
   {
      const double tr = MathMax(high[i] - low[i],
                         MathMax(MathAbs(high[i] - close[i + 1]),
                                 MathAbs(low[i] - close[i + 1])));
      sum += tr;
   }
   return sum / APEX_ATR_LEN;
}

bool ApexZoneOk(const ApexConfig &c, const double prox, const double dist, const double atr)
{
   const double h = MathAbs(dist - prox);
   if(h < c.minZonePts || h <= _Point) return false;
   if(atr > 0 && h > atr * c.maxZoneAtr) return false;
   return true;
}

void ApexApplyRR(ApexSetup &s, const double rr)
{
   s.entry = s.prox;
   s.sl = s.dist;
   const double risk = MathAbs(s.entry - s.sl);
   if(risk <= 0) { s.tp = s.entry; return; }
   s.tp = (s.dir == 1) ? (s.entry + risk * rr) : (s.entry - risk * rr);
   s.frozen = true;
}

int ApexScoreSetup(const ApexConfig &c, const ApexSetup &s, const double atr,
                   const double body, const double &high[], const double &low[], const int rates)
{
   int sc = 52;
   if(s.raidPx > 0) sc += 10;
   if(s.shiftTime > 0) sc += 10;

   const double risk = MathAbs(s.dist - s.prox);
   const double atrX = (atr > 0) ? risk / atr : 1.0;
   if(atrX >= 0.15 && atrX <= 1.40) sc += 14;
   else if(atrX < 0.08 || atrX > 2.60) sc -= 14;
   else sc -= 4;

   const double tp = (s.dir == 1) ? s.prox + risk * c.riskReward : s.prox - risk * c.riskReward;
   bool clear = true;
   const int lim = MathMin(36, rates - 2);
   for(int i = 1; i <= lim; i++)
   {
      if(s.dir == 1 && high[i] >= tp) { clear = false; break; }
      if(s.dir == -1 && low[i] <= tp) { clear = false; break; }
   }
   if(clear) sc += 12;
   else sc -= 6;

   if(body >= atr * c.minDispAtr) sc += 8;
   else if(body < atr * 0.20) sc -= 4;

   if(s.age <= 16) sc += 6;
   else if(s.age > 80) sc -= 6;

   return MathMax(0, MathMin(100, sc));
}

bool ApexIsSwingHigh(const double &high[], const int rates, const int i, const int piv)
{
   if(i - piv < 0 || i + piv >= rates) return false;
   for(int k = 1; k <= piv; k++)
      if(high[i] <= high[i - k] || high[i] < high[i + k]) return false;
   return true;
}

bool ApexIsSwingLow(const double &low[], const int rates, const int i, const int piv)
{
   if(i - piv < 0 || i + piv >= rates) return false;
   for(int k = 1; k <= piv; k++)
      if(low[i] >= low[i - k] || low[i] > low[i + k]) return false;
   return true;
}

bool ApexLastSwing(const double &high[], const double &low[], const int rates,
                   const int piv, double &outHi, int &outHiBar, double &outLo, int &outLoBar)
{
   outHi = 0; outLo = 0; outHiBar = -1; outLoBar = -1;
   for(int i = piv; i < rates - piv - 1; i++)
   {
      if(outHiBar < 0 && ApexIsSwingHigh(high, rates, i, piv))
      { outHi = high[i]; outHiBar = i; }
      if(outLoBar < 0 && ApexIsSwingLow(low, rates, i, piv))
      { outLo = low[i]; outLoBar = i; }
      if(outHiBar >= 0 && outLoBar >= 0) break;
   }
   return (outHiBar >= 0 || outLoBar >= 0);
}

bool ApexLastSwingFrom(const double &high[], const double &low[], const int rates,
                       const int piv, const int fromBar,
                       double &outHi, int &outHiBar, double &outLo, int &outLoBar)
{
   outHi = 0; outLo = 0; outHiBar = -1; outLoBar = -1;
   const int start = MathMax(piv, fromBar + piv);
   for(int i = start; i < rates - piv - 1; i++)
   {
      if(outHiBar < 0 && ApexIsSwingHigh(high, rates, i, piv))
      { outHi = high[i]; outHiBar = i; }
      if(outLoBar < 0 && ApexIsSwingLow(low, rates, i, piv))
      { outLo = low[i]; outLoBar = i; }
      if(outHiBar >= 0 && outLoBar >= 0) break;
   }
   return (outHiBar >= 0 || outLoBar >= 0);
}

bool ApexFindPocketFrom(const int dir, const int look, const int bar,
                        const double &open[], const double &high[],
                        const double &low[], const double &close[],
                        const int rates, double &prox, double &dist)
{
   prox = 0; dist = 0;
   const int lim = MathMin(bar + look, rates - 2);
   if(lim < bar + 2) return false;
   for(int k = bar + 1; k <= lim; k++)
   {
      const bool opp = (dir == -1) ? (close[k] > open[k]) : (close[k] < open[k]);
      if(!opp) continue;
      if(dir == -1) { prox = low[k]; dist = high[k]; }
      else { prox = high[k]; dist = low[k]; }
      for(int j = k + 1; j <= MathMin(k + 3, lim); j++)
      {
         const bool same = (dir == -1) ? (close[j] > open[j]) : (close[j] < open[j]);
         if(!same) break;
         if(dir == -1)
         {
            if(low[j] < prox - MathAbs(dist - prox)) break;
            prox = MathMin(prox, low[j]);
            dist = MathMax(dist, high[j]);
         }
         else
         {
            if(high[j] > prox + MathAbs(dist - prox)) break;
            prox = MathMax(prox, high[j]);
            dist = MathMin(dist, low[j]);
         }
      }
      return true;
   }
   return false;
}

void ApexPushSetup(ApexSetup &arr[], const ApexSetup &s)
{
   const int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n] = s;
}

void ApexDropDead(ApexSetup &arr[])
{
   for(int i = ArraySize(arr) - 1; i >= 0; i--)
   {
      if(!arr[i].dead) continue;
      for(int k = i; k < ArraySize(arr) - 1; k++)
         arr[k] = arr[k + 1];
      ArrayResize(arr, ArraySize(arr) - 1);
   }
}

int ApexScanAt(const int rates,
               const datetime &time[],
               const double &open[],
               const double &high[],
               const double &low[],
               const double &close[],
               const ApexConfig &c,
               ApexSetup &setups[],
               int &lastBirthBar,
               const int bar)
{
   if(rates < 80 || bar < 1 || bar + 20 >= rates) return 0;
   const double atr = ApexAtr(high, low, close, rates, bar);
   if(atr <= 0) return 0;

   const double body = MathAbs(close[bar] - open[bar]);
   const bool bearDisp = (close[bar] < open[bar]) && body >= atr * c.minDispAtr;
   const bool bullDisp = (close[bar] > open[bar]) && body >= atr * c.minDispAtr;

   double lastHi = 0, lastLo = 0;
   int lastHiB = -1, lastLoB = -1;
   if(!ApexLastSwingFrom(high, low, rates, c.swingPivot, bar, lastHi, lastHiB, lastLo, lastLoB))
      return 0;

   int born = 0;
   const bool canBirth = (lastBirthBar < 0) || ((lastBirthBar - bar) >= c.cooldownBars);

   bool raidShort = false, raidLong = false;
   double raidPx = 0;
   if(c.allowShort && lastHiB >= 0 && high[bar] > lastHi && close[bar] < lastHi && close[bar] < open[bar])
   {
      raidShort = true;
      raidPx = high[bar];
   }
   if(c.allowLong && lastLoB >= 0 && low[bar] < lastLo && close[bar] > lastLo && close[bar] > open[bar])
   {
      raidLong = true;
      raidPx = low[bar];
   }

   const bool mssShort = c.allowShort && bearDisp && lastHiB >= 0 && lastLoB >= 0
                         && lastHiB < lastLoB && close[bar] < lastLo;
   const bool mssLong  = c.allowLong  && bullDisp && lastHiB >= 0 && lastLoB >= 0
                         && lastLoB < lastHiB && close[bar] > lastHi;

   if(canBirth && (mssShort || mssLong))
   {
      const int dir = mssShort ? -1 : 1;
      double prox, dist;
      if(ApexFindPocketFrom(dir, c.pocketLook, bar, open, high, low, close, rates, prox, dist))
      {
         if(dir == -1 && raidShort) dist = MathMax(dist, raidPx);
         if(dir == 1 && raidLong) dist = MathMin(dist, raidPx);
         if(dir == -1 && lastHiB >= 0) dist = MathMax(dist, lastHi);
         if(dir == 1 && lastLoB >= 0) dist = MathMin(dist, lastLo);

         if(ApexZoneOk(c, prox, dist, atr))
         {
            const bool left = (dir == -1) ? (close[bar] < prox) : (close[bar] > prox);
            if(left || !c.requireLeave)
            {
               ApexSetup s;
               ZeroMemory(s);
               s.dir = dir;
               s.raidPx = (dir == -1 && raidShort) ? raidPx : ((dir == 1 && raidLong) ? raidPx : ((dir == -1) ? lastHi : lastLo));
               s.prox = prox;
               s.dist = dist;
               s.raidTime = (raidShort || raidLong) ? time[bar] : ((lastHiB >= 0) ? time[lastHiB] : time[bar]);
               s.shiftTime = time[bar];
               s.birthTime = time[bar];
               s.age = 0;
               s.story = (dir == -1) ? "RAID→SHIFT→SUPPLY" : "RAID→SHIFT→DEMAND";
               ApexApplyRR(s, c.riskReward);
               s.score = ApexScoreSetup(c, s, atr, body, high, low, rates);
               s.grade = ApexGradeFromScore(s.score);
               s.phase = (s.score >= c.confirmMinScore) ? APEX_ARMED : APEX_CONFIRM;
               ApexPushSetup(setups, s);
               lastBirthBar = bar;
               born++;
            }
         }
      }
   }

   if(canBirth && born == 0 && (bearDisp || bullDisp))
   {
      const int dir = bearDisp ? -1 : 1;
      if((dir == 1 && c.allowLong) || (dir == -1 && c.allowShort))
      {
         double prox, dist;
         if(ApexFindPocketFrom(dir, c.pocketLook, bar, open, high, low, close, rates, prox, dist)
            && ApexZoneOk(c, prox, dist, atr))
         {
            const bool left = (dir == -1) ? (close[bar] < prox) : (close[bar] > prox);
            if(left)
            {
               ApexSetup s;
               ZeroMemory(s);
               s.dir = dir;
               s.prox = prox;
               s.dist = dist;
               s.raidPx = (dir == -1) ? ((lastHiB >= 0) ? lastHi : high[bar]) : ((lastLoB >= 0) ? lastLo : low[bar]);
               s.raidTime = time[bar];
               s.shiftTime = time[bar];
               s.birthTime = time[bar];
               s.story = "DISP→ORIGIN POCKET";
               ApexApplyRR(s, c.riskReward);
               s.score = ApexScoreSetup(c, s, atr, body, high, low, rates);
               s.grade = ApexGradeFromScore(s.score);
               s.phase = (s.score >= c.confirmMinScore) ? APEX_ARMED : APEX_CONFIRM;
               ApexPushSetup(setups, s);
               lastBirthBar = bar;
               born++;
            }
         }
      }
   }

   return born;
}

int ApexScan(const int rates,
             const datetime &time[],
             const double &open[],
             const double &high[],
             const double &low[],
             const double &close[],
             const ApexConfig &c,
             ApexSetup &setups[],
             int &lastBirthBar)
{
   return ApexScanAt(rates, time, open, high, low, close, c, setups, lastBirthBar, 1);
}

int ApexReplay(const int rates,
               const datetime &time[],
               const double &open[],
               const double &high[],
               const double &low[],
               const double &close[],
               const ApexConfig &c,
               ApexSetup &setups[],
               int &lastBirthBar,
               const int depth)
{
   ArrayResize(setups, 0);
   lastBirthBar = -1;
   const int start = MathMin(rates - 25, MathMax(2, depth));
   int born = 0;
   for(int bar = start; bar >= 1; bar--)
      born += ApexScanAt(rates, time, open, high, low, close, c, setups, lastBirthBar, bar);

   for(int i = ArraySize(setups) - 1; i >= 0; i--)
   {
      if(setups[i].dead) continue;
      setups[i].age = 0;
      if(c.invalidateThru)
      {
         const bool blown = (setups[i].dir == -1) ? (close[1] > setups[i].dist)
                                                  : (close[1] < setups[i].dist);
         if(blown)
         {
            setups[i].phase = APEX_DEAD;
            setups[i].dead = true;
         }
      }
   }
   ApexDropDead(setups);

   while(ArraySize(setups) > APEX_MAX_SETUPS)
   {
      int drop = 0, worst = 999;
      for(int i = 0; i < ArraySize(setups); i++)
         if(setups[i].score < worst) { worst = setups[i].score; drop = i; }
      for(int k = drop; k < ArraySize(setups) - 1; k++)
         setups[k] = setups[k + 1];
      ArrayResize(setups, ArraySize(setups) - 1);
   }
   return born;
}

void ApexManage(ApexSetup &setups[], const ApexConfig &c,
                const double &open[], const double &high[], const double &low[],
                const double &close[], const int rates)
{
   const double atr = ApexAtr(high, low, close, rates, 1);
   for(int i = ArraySize(setups) - 1; i >= 0; i--)
   {
      if(setups[i].dead) continue;
      setups[i].age++;

      if(setups[i].phase == APEX_CONFIRM || setups[i].phase == APEX_POCKET)
      {
         const double body = MathAbs(close[1] - open[1]);
         setups[i].score = ApexScoreSetup(c, setups[i], atr, body, high, low, rates);
         setups[i].grade = ApexGradeFromScore(setups[i].score);
         if(setups[i].score >= c.confirmMinScore)
            setups[i].phase = APEX_ARMED;
      }

      if(c.invalidateThru)
      {
         const bool blown = (setups[i].dir == -1) ? (close[1] > setups[i].dist)
                                                  : (close[1] < setups[i].dist);
         if(blown)
         {
            setups[i].phase = APEX_DEAD;
            setups[i].dead = true;
            continue;
         }
      }
      if(setups[i].age >= c.maxAgeBars && setups[i].phase != APEX_LIVE)
      {
         setups[i].phase = APEX_DEAD;
         setups[i].dead = true;
         continue;
      }

      if(setups[i].phase == APEX_ARMED || setups[i].phase == APEX_LIVE)
      {
         const bool hitTp = (setups[i].dir == -1) ? (low[1] <= setups[i].tp)
                                                   : (high[1] >= setups[i].tp);
         if(hitTp)
         {
            setups[i].phase = APEX_DONE;
            setups[i].dead = true;
         }
      }
   }
   ApexDropDead(setups);
}

int ApexBestArmed(const ApexSetup &setups[], const ApexConfig &c)
{
   int best = -1, bestSc = -1;
   for(int i = 0; i < ArraySize(setups); i++)
   {
      if(setups[i].dead) continue;
      if(setups[i].phase != APEX_ARMED && setups[i].phase != APEX_LIVE
         && setups[i].phase != APEX_CONFIRM) continue;
      if(setups[i].score > bestSc)
      {
         bestSc = setups[i].score;
         best = i;
      }
   }
   return best;
}

bool ApexTouchedEntry(const ApexSetup &s, const double &high[], const double &low[])
{
   return (low[1] <= s.entry && high[1] >= s.entry);
}

double ApexLotsFromRisk(const double riskPct, const double entry, const double sl)
{
   const double bal = AccountInfoDouble(ACCOUNT_EQUITY);
   const double riskMoney = bal * riskPct / 100.0;
   const double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   const double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0 || tickSize <= 0) return 0;
   const double slPts = MathAbs(entry - sl);
   if(slPts <= 0) return 0;
   const double moneyPerLot = (slPts / tickSize) * tickVal;
   if(moneyPerLot <= 0) return 0;
   double lots = riskMoney / moneyPerLot;
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   const double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   const double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) lots = 0;
   if(lots > vmax) lots = vmax;
   return lots;
}

#endif // APEX_ENGINE_MQH
