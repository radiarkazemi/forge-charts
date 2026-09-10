//+------------------------------------------------------------------+
//| Apex_Engine.mqh — APEX Brain v1                                  |
//| Unique realtime thesis: RAID → SHIFT → POCKET → CONFIRM → STRIKE |
//| Fixed geometry: ENTRY=proximal · SL=distal · TP=1:3 R:R          |
//+------------------------------------------------------------------+
#ifndef APEX_ENGINE_MQH
#define APEX_ENGINE_MQH

#define APEX_ENGINE_VERSION 100
#define APEX_MAX_SETUPS     6
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
   double   raidPx;       // swept liquidity
   double   prox;         // ENTRY
   double   dist;         // SL
   double   entry;
   double   sl;
   double   tp;           // always 1:3 from risk
   int      score;        // 0–100 confirm score
   int      grade;        // 0=D 1=C 2=B 3=A
   bool     frozen;
   bool     dead;
   datetime raidTime;
   datetime shiftTime;
   datetime birthTime;
   int      age;
   string   story;        // human label for dashboard
};

struct ApexConfig
{
   bool   allowLong;
   bool   allowShort;
   int    swingPivot;         // bars each side for swing
   double raidTolAtr;         // equal LQ tolerance
   double minDispAtr;         // displacement body
   double minZonePts;
   double maxZoneAtr;
   int    pocketLook;         // OB lookback after shift
   int    confirmMinScore;    // arm threshold
   double riskReward;         // fixed 3.0
   int    maxAgeBars;
   int    cooldownBars;
   bool   requireLeave;       // leave pocket then return
   bool   invalidateThru;
};

void ApexDefaultConfig(ApexConfig &c)
{
   c.allowLong = true;
   c.allowShort = true;
   c.swingPivot = 3;
   c.raidTolAtr = 0.12;
   c.minDispAtr = 0.55;
   c.minZonePts = 1.0;
   c.maxZoneAtr = 2.8;
   c.pocketLook = 12;
   c.confirmMinScore = 70;
   c.riskReward = 3.0;
   c.maxAgeBars = 120;
   c.cooldownBars = 8;
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
      double tr = MathMax(high[i] - low[i],
                   MathMax(MathAbs(high[i] - close[i + 1]), MathAbs(low[i] - close[i + 1])));
      sum += tr;
   }
   return sum / APEX_ATR_LEN;
}

bool ApexZoneOk(const ApexConfig &c, const double prox, const double dist, const double atr)
{
   double h = MathAbs(dist - prox);
   if(h < c.minZonePts || h <= _Point) return false;
   if(atr > 0 && h > atr * c.maxZoneAtr) return false;
   return true;
}

void ApexApplyRR(ApexSetup &s, const double rr)
{
   s.entry = s.prox;
   s.sl = s.dist;
   double risk = MathAbs(s.entry - s.sl);
   if(risk <= 0) { s.tp = s.entry; return; }
   s.tp = (s.dir == 1) ? (s.entry + risk * rr) : (s.entry - risk * rr);
   s.frozen = true;
}

// Confirm score — synthesizes raid + shift + pocket quality + space for 1:3
int ApexScoreSetup(const ApexConfig &c, const ApexSetup &s, const double atr,
                   const double body, const double &high[], const double &low[], const int rates)
{
   int sc = 50;
   if(s.raidPx > 0) sc += 12;
   if(s.shiftTime > 0) sc += 12;

   double risk = MathAbs(s.dist - s.prox);
   double atrX = (atr > 0) ? risk / atr : 1.0;
   if(atrX >= 0.20 && atrX <= 1.20) sc += 14;
   else if(atrX < 0.10 || atrX > 2.40) sc -= 18;
   else sc -= 6;

   // Room toward 1:3 (no major opposing swing inside TP runway)
   double tp = (s.dir == 1) ? s.prox + risk * c.riskReward : s.prox - risk * c.riskReward;
   bool clear = true;
   int lim = MathMin(40, rates - 2);
   for(int i = 1; i <= lim; i++)
   {
      if(s.dir == 1 && high[i] >= tp) { clear = false; break; }
      if(s.dir == -1 && low[i] <= tp) { clear = false; break; }
   }
   if(clear) sc += 12;
   else sc -= 8;

   if(body >= atr * c.minDispAtr) sc += 8;
   else if(body < atr * 0.25) sc -= 6;

   // Freshness: younger raids score higher
   if(s.age <= 12) sc += 6;
   else if(s.age > 60) sc -= 8;

   return MathMax(0, MathMin(100, sc));
}

bool ApexIsSwingHigh(const double &high[], const int rates, const int i, const int piv)
{
   if(i - piv < 0 || i + piv >= rates) return false;
   for(int k = 1; k <= piv; k++)
   {
      if(high[i] <= high[i - k] || high[i] < high[i + k]) return false;
   }
   return true;
}

bool ApexIsSwingLow(const double &low[], const int rates, const int i, const int piv)
{
   if(i - piv < 0 || i + piv >= rates) return false;
   for(int k = 1; k <= piv; k++)
   {
      if(low[i] >= low[i - k] || low[i] > low[i + k]) return false;
   }
   return true;
}

// Find most recent confirmed swing high/low (index >= piv)
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
   return (outHiBar >= 0 && outLoBar >= 0);
}

// Origin pocket: last opposing candle before bar 1 impulse
bool ApexFindPocket(const int dir, const int look,
                    const double &open[], const double &high[], const double &low[], const double &close[],
                    const int rates, double &prox, double &dist)
{
   prox = 0; dist = 0;
   int lim = MathMin(look, rates - 2);
   if(lim < 2) return false;
   for(int k = 2; k <= lim; k++)
   {
      bool opp = (dir == -1) ? (close[k] > open[k]) : (close[k] < open[k]);
      if(!opp) continue;
      if(dir == -1) { prox = low[k]; dist = high[k]; }
      else { prox = high[k]; dist = low[k]; }
      // Expand small consolidation pocket
      for(int j = k + 1; j <= MathMin(k + 3, lim); j++)
      {
         bool same = (dir == -1) ? (close[j] > open[j]) : (close[j] < open[j]);
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
   int n = ArraySize(arr);
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

//+------------------------------------------------------------------+
//| Main realtime brain tick (call on new bar / timer)               |
//+------------------------------------------------------------------+
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
   if(rates < 80) return 0;
   double atr = ApexAtr(high, low, close, rates, 1);
   if(atr <= 0) return 0;

   double body = MathAbs(close[1] - open[1]);
   bool bearDisp = (close[1] < open[1]) && body >= atr * c.minDispAtr;
   bool bullDisp = (close[1] > open[1]) && body >= atr * c.minDispAtr;

   double lastHi, lastLo;
   int lastHiB, lastLoB;
   if(!ApexLastSwing(high, low, rates, c.swingPivot, lastHi, lastHiB, lastLo, lastLoB))
      return 0;

   int born = 0;
   bool canBirth = (lastBirthBar < 0) || ((rates - 1 - lastBirthBar) >= c.cooldownBars);

   // --- RAID detection (sweep of swing then reclaim) ---
   bool raidShort = false, raidLong = false;
   double raidPx = 0;
   // Short raid: wick above swing high, close back below
   if(c.allowShort && high[1] > lastHi && close[1] < lastHi && close[1] < open[1])
   {
      raidShort = true;
      raidPx = high[1];
   }
   // Long raid: wick below swing low, close back above
   if(c.allowLong && low[1] < lastLo && close[1] > lastLo && close[1] > open[1])
   {
      raidLong = true;
      raidPx = low[1];
   }

   // --- SHIFT (MSS) after raid memory within look window ---
   // We birth a full setup when: (recent raid OR strong disp) + MSS + pocket
   bool mssShort = c.allowShort && bearDisp && lastHiB < lastLoB && close[1] < lastLo;
   bool mssLong  = c.allowLong  && bullDisp && lastLoB < lastHiB && close[1] > lastHi;

   // Also allow SHIFT on pure displacement break of structure without same-bar raid
   // if a raid happened recently inside open setups — handled in manage loop.

   if(canBirth && (mssShort || mssLong))
   {
      int dir = mssShort ? -1 : 1;
      double prox, dist;
      if(ApexFindPocket(dir, c.pocketLook, open, high, low, close, rates, prox, dist))
      {
         // Anchor SL beyond raid if present on this bar
         if(dir == -1 && raidShort) dist = MathMax(dist, raidPx);
         if(dir == 1 && raidLong) dist = MathMin(dist, raidPx);
         // Anchor to swing extreme
         if(dir == -1) dist = MathMax(dist, lastHi);
         else dist = MathMin(dist, lastLo);

         if(ApexZoneOk(c, prox, dist, atr))
         {
            // Must have left pocket on the shift bar
            bool left = (dir == -1) ? (close[1] < prox) : (close[1] > prox);
            if(left || !c.requireLeave)
            {
               ApexSetup s;
               ZeroMemory(s);
               s.dir = dir;
               s.phase = APEX_CONFIRM;
               s.raidPx = (dir == -1 && raidShort) ? raidPx : ((dir == 1 && raidLong) ? raidPx : lastHi);
               if(dir == 1 && !raidLong) s.raidPx = lastLo;
               s.prox = prox;
               s.dist = dist;
               s.raidTime = (raidShort || raidLong) ? time[1] : time[lastHiB];
               s.shiftTime = time[1];
               s.birthTime = time[1];
               s.age = 0;
               s.story = (dir == -1)
                  ? "RAID→SHIFT→SUPPLY POCKET"
                  : "RAID→SHIFT→DEMAND POCKET";
               ApexApplyRR(s, c.riskReward);
               s.score = ApexScoreSetup(c, s, atr, body, high, low, rates);
               s.grade = ApexGradeFromScore(s.score);
               if(s.score >= c.confirmMinScore)
                  s.phase = APEX_ARMED;
               else
                  s.phase = APEX_CONFIRM;
               ApexPushSetup(setups, s);
               lastBirthBar = rates - 1;
               born++;
            }
         }
      }
   }

   // Pure displacement pocket (S1-style) as secondary path when no MSS
   if(canBirth && born == 0 && (bearDisp || bullDisp))
   {
      int dir = bearDisp ? -1 : 1;
      if((dir == 1 && c.allowLong) || (dir == -1 && c.allowShort))
      {
         double prox, dist;
         if(ApexFindPocket(dir, c.pocketLook, open, high, low, close, rates, prox, dist)
            && ApexZoneOk(c, prox, dist, atr))
         {
            bool left = (dir == -1) ? (close[1] < prox) : (close[1] > prox);
            if(left)
            {
               ApexSetup s;
               ZeroMemory(s);
               s.dir = dir;
               s.prox = prox;
               s.dist = dist;
               s.raidPx = (dir == -1) ? lastHi : lastLo;
               s.raidTime = time[1];
               s.shiftTime = time[1];
               s.birthTime = time[1];
               s.story = "DISP→ORIGIN POCKET";
               ApexApplyRR(s, c.riskReward);
               s.score = ApexScoreSetup(c, s, atr, body, high, low, rates);
               s.grade = ApexGradeFromScore(s.score);
               s.phase = (s.score >= c.confirmMinScore) ? APEX_ARMED : APEX_CONFIRM;
               ApexPushSetup(setups, s);
               lastBirthBar = rates - 1;
               born++;
            }
         }
      }
   }

   return born;
}

void ApexManage(ApexSetup &setups[], const ApexConfig &c,
                const double &open[], const double &high[], const double &low[],
                const double &close[], const int rates)
{
   double atr = ApexAtr(high, low, close, rates, 1);
   for(int i = ArraySize(setups) - 1; i >= 0; i--)
   {
      if(setups[i].dead) continue;
      setups[i].age++;

      // Refresh score while confirming; promote on score + optional return touch
      if(setups[i].phase == APEX_CONFIRM || setups[i].phase == APEX_POCKET)
      {
         double body = MathAbs(close[1] - open[1]);
         setups[i].score = ApexScoreSetup(c, setups[i], atr, body, high, low, rates);
         setups[i].grade = ApexGradeFromScore(setups[i].score);
         if(setups[i].score >= c.confirmMinScore)
            setups[i].phase = APEX_ARMED;
      }

      // Invalidate
      if(c.invalidateThru)
      {
         bool blown = (setups[i].dir == -1) ? (close[1] > setups[i].dist)
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

      // TP hit while armed/live → done
      if(setups[i].phase == APEX_ARMED || setups[i].phase == APEX_LIVE)
      {
         bool hitTp = (setups[i].dir == -1) ? (low[1] <= setups[i].tp)
                                             : (high[1] >= setups[i].tp);
         if(hitTp)
         {
            setups[i].phase = APEX_DONE;
            setups[i].dead = true;
         }
      }
   }
   ApexDropDead(setups);

   // Cap
   while(ArraySize(setups) > APEX_MAX_SETUPS)
   {
      int drop = 0, worst = 999;
      for(int i = 0; i < ArraySize(setups); i++)
         if(setups[i].score < worst) { worst = setups[i].score; drop = i; }
      for(int k = drop; k < ArraySize(setups) - 1; k++)
         setups[k] = setups[k + 1];
      ArrayResize(setups, ArraySize(setups) - 1);
   }
}

int ApexBestArmed(const ApexSetup &setups[], const ApexConfig &c)
{
   int best = -1, bestSc = -1;
   for(int i = 0; i < ArraySize(setups); i++)
   {
      if(setups[i].dead) continue;
      if(setups[i].phase != APEX_ARMED && setups[i].phase != APEX_LIVE) continue;
      if(setups[i].score < c.confirmMinScore) continue;
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

// Lot size from % equity risk to SL
double ApexLotsFromRisk(const double riskPct, const double entry, const double sl)
{
   double bal = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = bal * riskPct / 100.0;
   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal <= 0 || tickSize <= 0) return 0;
   double slPts = MathAbs(entry - sl);
   if(slPts <= 0) return 0;
   double moneyPerLot = (slPts / tickSize) * tickVal;
   if(moneyPerLot <= 0) return 0;
   double lots = riskMoney / moneyPerLot;
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) lots = 0;
   if(lots > vmax) lots = vmax;
   return lots;
}

#endif // APEX_ENGINE_MQH
