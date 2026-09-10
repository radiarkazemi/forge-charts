//+------------------------------------------------------------------+
//| TRH_Supply_MM_AutoTrade.mq5                                      |
//| Entire Supply MM Pack — Setups 1–5 · Clean Score · Smart fill    |
//| LIVE SL = structural distal (widen-only broker pad)              |
//+------------------------------------------------------------------+
#property copyright "TRH Forge"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.01"
#property description "TRH Supply MM Pack EA: S1–S5 + A/B score gate + smart autotrade"
#property strict

#include <Trade/Trade.mqh>
#include "SMM_Engine.mqh"

input group "══ Trading ══"
input bool   InpAutoTrade         = true;
input bool   InpAlertOnArm        = true;
input ulong  InpMagic             = 290825;
input int    InpMaxSlippagePts    = 50;
input int    InpPendingExpiryBars = 20;
input int    InpLookbackBars      = 1500;
input int    InpMaxOpenTrades     = 1;

input group "══ Which Setups ══"
input bool   InpUseS1_MM          = true;  // Setup 1 — Supply MM
input bool   InpUseS2_MSS         = true;  // Setup 2 — MSS Fresh
input bool   InpUseS3_HTF         = true;  // Setup 3 — HTF + LQ
input bool   InpUseS4_BB          = true;  // Setup 4 — BB + FVG
input bool   InpUseS5_FS          = false; // Setup 5 — fs (noisy; off by default for autotrade)
input bool   InpAllowLong         = true;
input bool   InpAllowShort        = true;

input group "══ Smart Score Gate ══"
input bool   InpUseCleanScore     = true;
input int    InpMinScoreKeep      = 70;    // Reject C/D
input int    InpMinScoreArm       = 70;    // Arm / trade B+
input int    InpPreferGradeA      = 80;    // Prefer A when available
input bool   InpOnlyBestZone      = true;  // Trade only highest-score armed zone
input bool   InpRequireArmed      = true;  // Must be armed (leave→return / LQ / fs)

input group "══ Filters ══"
input bool   InpUseSpreadFilter   = true;
input int    InpMaxSpreadPoints   = 120;
input double InpMaxSpreadAtr      = 0.45;
input bool   InpUseSessionFilter  = false;
input int    InpSessionStartHour  = 0;
input int    InpSessionEndHour    = 24;
input bool   InpUseDailyLimits    = true;
input double InpMaxDailyLossPct   = 4.0;
input int    InpMaxDailyTrades    = 8;

input group "══ ENTRY fill (smart) ══"
input double InpMarketTolAtr      = 0.25;  // Near band → pending @ ENTRY
input double InpExpireAtR         = 1.20;  // Abort if this far toward TP
input bool   InpFarOpenMarket     = true;  // Far from ENTRY → market now
input bool   InpUsePullbackLimit  = true;  // Near + past ENTRY → Limit
input bool   InpLimitBeforeEntry  = true;  // Near + before ENTRY → Stop
input bool   InpMarketOnTouch     = true;
input int    InpAdoptMaxAgeBars   = 25;
input bool   InpFixLiveStops      = true;  // LIVE SL never inside structural distal

input group "══ Risk ══"
input bool   InpUseDynamicLots    = true;
input double InpRiskPercent       = 1.0;
input double InpFixedLots         = 0.0;
input double InpRiskReward        = 2.5;   // Fallback if no structure TP

input group "══ Detection (= Pine) ══"
input double InpMinDispAtr        = 0.70;
input double InpMinCtxAtr         = 0.40;
input int    InpMaxLookback       = 8;
input double InpMinFvgAtr         = 0.25;
input double InpMinFvgPts         = 1.50;
input double InpMinZonePts        = 2.0;
input int    InpCooldownBars      = 25;
input int    InpMssPivot          = 3;
input double InpMssBodyAtr        = 0.35;
input int    InpStructBars        = 120;
input double InpMinStructR        = 1.5;
input double InpLqTolAtr          = 0.12;
input int    InpMinLqTouches      = 2;
input int    InpLqFallbackBars    = 20;
input int    InpMaxZoneAge        = 80;
input int    InpMaxLiveZones      = 3;

CTrade   g_trade;
SmmConfig g_cfg;
SmmZone  g_zones[];
int      g_lastBirthBar = -1;
int      g_lastFsBirthBar = -1;
int      g_bullSweepUntil = -1;
int      g_bearSweepUntil = -1;
double   g_lastBullSweepLo = 0;
double   g_lastBearSweepHi = 0;
datetime g_lastBarTime = 0;
datetime g_doneSetupTime = 0;
int      g_dayStamp = 0;
int      g_dayTrades = 0;
double   g_dayStartEquity = 0;

bool     g_workActive = false;
SmmZone  g_work;
datetime g_workAdopted = 0;
int      g_workTries = 0;
string   g_workStatus = "idle";

//+------------------------------------------------------------------+
void BuildConfig()
{
   SmmDefaultConfig(g_cfg);
   g_cfg.useMM = InpUseS1_MM;
   g_cfg.useMss = InpUseS2_MSS;
   g_cfg.useHtf = InpUseS3_HTF;
   g_cfg.useBb = InpUseS4_BB;
   g_cfg.useFs = InpUseS5_FS;
   g_cfg.allowLong = InpAllowLong;
   g_cfg.allowShort = InpAllowShort;
   g_cfg.minDispAtr = InpMinDispAtr;
   g_cfg.minCtxAtr = InpMinCtxAtr;
   g_cfg.maxLookback = InpMaxLookback;
   g_cfg.minFvgAtr = InpMinFvgAtr;
   g_cfg.minFvgPts = InpMinFvgPts;
   g_cfg.minZonePts = InpMinZonePts;
   g_cfg.cooldownBars = InpCooldownBars;
   g_cfg.mssPivot = InpMssPivot;
   g_cfg.mssBodyAtr = InpMssBodyAtr;
   g_cfg.structBars = InpStructBars;
   g_cfg.minStructR = InpMinStructR;
   g_cfg.lqTolAtr = InpLqTolAtr;
   g_cfg.minLqTouches = InpMinLqTouches;
   g_cfg.lqFallbackBars = InpLqFallbackBars;
   g_cfg.maxZoneAge = InpMaxZoneAge;
   g_cfg.maxLiveZones = InpMaxLiveZones;
   g_cfg.useCleanScore = InpUseCleanScore;
   g_cfg.rejectLowScore = true;
   g_cfg.minScoreKeep = InpMinScoreKeep;
   g_cfg.minScoreArm = InpMinScoreArm;
   g_cfg.riskReward = InpRiskReward;
}

int OnInit()
{
   BuildConfig();
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   ArrayResize(g_zones, 0);
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   Comment("TRH Supply MM Pack EA v1.01 — waiting…");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

bool SpreadOk(const double atr)
{
   if(!InpUseSpreadFilter) return true;
   long spreadPts = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spreadPts > InpMaxSpreadPoints)
   {
      g_workStatus = StringFormat("wait spread %d", (int)spreadPts);
      return false;
   }
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double spreadPrice = spreadPts * point;
   if(atr > 0 && spreadPrice > atr * InpMaxSpreadAtr)
   {
      g_workStatus = "wait spread ATR";
      return false;
   }
   return true;
}

bool SessionOk()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   if(InpSessionStartHour < InpSessionEndHour)
      return (dt.hour >= InpSessionStartHour && dt.hour < InpSessionEndHour);
   return (dt.hour >= InpSessionStartHour || dt.hour < InpSessionEndHour);
}

void ResetDayIfNeeded()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int stamp = dt.year * 10000 + dt.mon * 100 + dt.day;
   if(stamp != g_dayStamp)
   {
      g_dayStamp = stamp;
      g_dayTrades = 0;
      g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   }
}

bool DailyLimitsOk()
{
   if(!InpUseDailyLimits) return true;
   ResetDayIfNeeded();
   if(g_dayTrades >= InpMaxDailyTrades)
   {
      g_workStatus = "daily trade cap";
      return false;
   }
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(g_dayStartEquity > 0)
   {
      double lossPct = 100.0 * (g_dayStartEquity - eq) / g_dayStartEquity;
      if(lossPct >= InpMaxDailyLossPct)
      {
         g_workStatus = "daily loss cap";
         return false;
      }
   }
   return true;
}

bool TradeAllowedOk()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) { g_workStatus = "Algo Trading OFF"; return false; }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) { g_workStatus = "EA trade disabled"; return false; }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) { g_workStatus = "account trade blocked"; return false; }
   long mode = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
   if(mode == SYMBOL_TRADE_MODE_DISABLED) { g_workStatus = "symbol trade disabled"; return false; }
   return true;
}

int CountOurOrders()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      n++;
   }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      n++;
   }
   return n;
}

double CalcLots(const double entry, const double sl)
{
   if(!InpUseDynamicLots || InpFixedLots > 0)
   {
      double lots = (InpFixedLots > 0) ? InpFixedLots : SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      return NormalizeDouble(lots, 2);
   }
   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double riskPts = MathAbs(entry - sl);
   if(tickVal <= 0 || tickSize <= 0 || riskPts <= 0) return SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double lossPerLot = (riskPts / tickSize) * tickVal;
   if(lossPerLot <= 0) return SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double lots = riskMoney / lossPerLot;
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(lots < vmin) lots = vmin;
   if(lots > vmax) lots = vmax;
   lots = MathFloor(lots / step) * step;
   return NormalizeDouble(lots, 2);
}

bool AdjustStops(const int dir, double &entry, double &sl, double &tp)
{
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double minDist = stopsLevel * point;
   if(dir == 1)
   {
      if(entry - sl < minDist) sl = entry - minDist;
      if(tp - entry < minDist) tp = entry + minDist;
   }
   else
   {
      if(sl - entry < minDist) sl = entry + minDist;
      if(entry - tp < minDist) tp = entry - minDist;
   }
   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);
   entry = NormalizeDouble(entry, _Digits);
   return (MathAbs(entry - sl) > point);
}

double PastEntryDist(const SmmZone &s)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   return (s.dir == 1) ? (ask - s.entry) : (s.entry - bid);
}

bool SetupTooDeepToTP(const SmmZone &s)
{
   double risk = MathAbs(s.entry - s.sl);
   if(risk <= 0 || InpExpireAtR <= 0) return false;
   return PastEntryDist(s) >= risk * InpExpireAtR;
}

bool SetupSlHitBeforeFill(const SmmZone &s)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(s.dir == 1) return (bid <= s.sl);
   return (ask >= s.sl);
}

bool BarTouchedEntry(const SmmZone &s)
{
   double hi = iHigh(_Symbol, _Period, 0);
   double lo = iLow(_Symbol, _Period, 0);
   return (lo <= s.entry && hi >= s.entry);
}

void ClearWork(const string why)
{
   PrintFormat("SMM CLEAR %s %s — %s", SmmKindName(g_work.kind),
      TimeToString(g_work.barTime, TIME_DATE|TIME_MINUTES), why);
   g_doneSetupTime = g_work.barTime;
   g_workActive = false;
   g_workTries = 0;
   g_workStatus = why;
}

void AdoptWork(const SmmZone &s)
{
   g_work = s;
   g_work.frozen = true;
   g_workActive = true;
   g_workAdopted = TimeCurrent();
   g_workTries = 0;
   g_workStatus = "adopted — levels locked";
   PrintFormat("SMM ADOPT %s %s grade=%s score=%d E=%s SL=%s TP=%s (LOCKED)",
      SmmKindName(s.kind), s.dir == 1 ? "LONG" : "SHORT",
      SmmGradeLetter(s.grade), s.score,
      DoubleToString(s.entry, _Digits),
      DoubleToString(s.sl, _Digits),
      DoubleToString(s.tp, _Digits));
   if(InpAlertOnArm)
      Alert(StringFormat("TRH SMM %s %s %s%d ENTRY %s",
         SmmKindName(s.kind), s.dir == 1 ? "LONG" : "SHORT",
         SmmGradeLetter(s.grade), s.score, DoubleToString(s.entry, _Digits)));
}

int PlaceSetupTrade(const SmmZone &s, const double atrNow, const bool forceMarket)
{
   if(!InpAutoTrade) return -1;
   if(!TradeAllowedOk()) return 0;
   if(!SessionOk() || !DailyLimitsOk()) return 0;
   if(!SpreadOk(atrNow)) return 0;
   if(CountOurOrders() >= InpMaxOpenTrades)
   {
      g_workStatus = "max open trades";
      return 0;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = s.entry;
   double sl = s.sl;
   double tp = s.tp;
   if(!AdjustStops(s.dir, entry, sl, tp))
   {
      g_workStatus = "bad stops";
      return 0;
   }
   if(SetupSlHitBeforeFill(s))
   {
      g_workStatus = "SL hit before fill — abort";
      return -1;
   }
   if(SetupTooDeepToTP(s) && !(InpFarOpenMarket || forceMarket))
   {
      g_workStatus = "too deep toward TP — abort";
      return -1;
   }

   double distEntry = (s.dir == 1) ? MathAbs(ask - entry) : MathAbs(bid - entry);
   bool nearEntry = (atrNow > 0) ? (distEntry <= atrNow * InpMarketTolAtr) : false;
   bool openMarketNow = forceMarket || (InpFarOpenMarket && !nearEntry) || SetupTooDeepToTP(s);

   double lots = CalcLots(entry, sl);
   string comment = StringFormat("SMM %s %s%d", SmmKindName(s.kind), SmmGradeLetter(s.grade), s.score);
   string mode = "";
   bool ok = false;

   if(openMarketNow)
   {
      // LIVE SL clamp: keep structural distal; broker pad may only WIDEN
      double structuralSL = sl;
      double useSL = structuralSL;
      long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double minDist = stopsLevel * point;

      if(InpFixLiveStops)
      {
         if(s.dir == -1)
         {
            // Short: structural SL above price. Broker needs SL >= bid+minDist.
            // Keep structural; only widen (move further up) if broker forces it.
            double brokerFloor = bid + minDist;
            useSL = MathMax(structuralSL, brokerFloor);
         }
         else
         {
            // Long: structural SL below price. Broker needs SL <= ask-minDist.
            // Keep structural; only widen (move further down) if broker forces it.
            double brokerCeil = ask - minDist;
            useSL = MathMin(structuralSL, brokerCeil);
         }
      }

      // Rebuild TP from live entry → structural risk so R stays honest
      double liveEntry = (s.dir == 1) ? ask : bid;
      double risk = MathAbs(liveEntry - structuralSL);
      if(risk <= 0)
      {
         g_workStatus = "zero risk @ market";
         return 0;
      }
      double useTP = (s.dir == 1) ? liveEntry + risk * (MathAbs(s.tp - s.entry) / MathMax(MathAbs(s.entry - s.sl), point))
                                  : liveEntry - risk * (MathAbs(s.tp - s.entry) / MathMax(MathAbs(s.entry - s.sl), point));
      // Prefer structure TP when further than 1R
      if(s.dir == 1 && s.tp > useTP) useTP = s.tp;
      if(s.dir == -1 && s.tp < useTP) useTP = s.tp;

      useSL = NormalizeDouble(useSL, _Digits);
      useTP = NormalizeDouble(useTP, _Digits);
      if(!AdjustStops(s.dir, liveEntry, useSL, useTP))
      {
         g_workStatus = "bad stops @ market";
         return 0;
      }
      // Re-clamp so AdjustStops cannot pull SL inside distal
      if(s.dir == -1) useSL = MathMax(useSL, structuralSL);
      else            useSL = MathMin(useSL, structuralSL);

      mode = (s.dir == 1) ? "MARKET BUY" : "MARKET SELL";
      ok = (s.dir == 1) ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
                        : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);
   }
   else if(nearEntry && ((s.dir == 1 && ask > entry) || (s.dir == -1 && bid < entry)))
   {
      // Past ENTRY → Limit back
      if(!InpUsePullbackLimit)
      {
         mode = (s.dir == 1) ? "MARKET BUY (near)" : "MARKET SELL (near)";
         ok = (s.dir == 1) ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
                           : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else if(s.dir == 1)
      {
         mode = "BUY LIMIT @ ENTRY";
         ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      }
      else
      {
         mode = "SELL LIMIT @ ENTRY";
         ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      }
   }
   else
   {
      // Before ENTRY → Stop into ENTRY
      if(!InpLimitBeforeEntry)
      {
         mode = (s.dir == 1) ? "MARKET BUY (near)" : "MARKET SELL (near)";
         ok = (s.dir == 1) ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
                           : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else if(s.dir == 1)
      {
         if(entry <= ask) { mode = "MARKET BUY (at ENTRY)"; ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment); }
         else { mode = "BUY STOP @ ENTRY"; ok = g_trade.BuyStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment); }
      }
      else
      {
         if(entry >= bid) { mode = "MARKET SELL (at ENTRY)"; ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment); }
         else { mode = "SELL STOP @ ENTRY"; ok = g_trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment); }
      }
   }

   g_workTries++;
   if(ok)
   {
      if(CountOurOrders() > 0) g_dayTrades++;
      g_workStatus = mode + " OK";
      PrintFormat("SMM %s %s lots=%s E=%s SL=%s TP=%s try=%d",
         mode, s.dir == 1 ? "LONG" : "SHORT", DoubleToString(lots, 2),
         DoubleToString(entry, _Digits), DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits), g_workTries);
      return 1;
   }

   uint ret = g_trade.ResultRetcode();
   g_workStatus = StringFormat("order fail %d", ret);
   if(ret == TRADE_RETCODE_INVALID_PRICE || ret == TRADE_RETCODE_INVALID_STOPS)
   {
      if(StringFind(mode, "LIMIT") >= 0 || StringFind(mode, "STOP") >= 0)
      {
         bool mok = (s.dir == 1) ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
                                 : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
         if(mok) { g_dayTrades++; g_workStatus = "MARKET fallback OK"; return 1; }
      }
   }
   return 0;
}

void ExpireStalePendings()
{
   if(InpPendingExpiryBars <= 0) return;
   int periodSec = PeriodSeconds(_Period);
   if(periodSec <= 0) return;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      datetime setup = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      int ageBars = (int)((TimeCurrent() - setup) / periodSec);
      if(ageBars >= InpPendingExpiryBars)
         g_trade.OrderDelete(ticket);
   }
}

void UpdatePanel(const double atr)
{
   int best = SmmBestLiveIndex(g_zones);
   int armed = SmmBestArmedIndex(g_zones, g_cfg);
   string line1 = StringFormat("TRH Supply MM Pack  ·  zones %d  ·  %s",
      ArraySize(g_zones), g_workActive ? "WORKING" : "idle");
   string line2 = g_workStatus;
   string line3 = "—";
   if(armed >= 0)
      line3 = StringFormat("ARMED %s %s %s%d  ENTRY %s  SL %s",
         SmmKindName(g_zones[armed].kind),
         g_zones[armed].dir == 1 ? "LONG" : "SHORT",
         SmmGradeLetter(g_zones[armed].grade), g_zones[armed].score,
         DoubleToString(g_zones[armed].entry, _Digits),
         DoubleToString(g_zones[armed].sl, _Digits));
   else if(best >= 0)
      line3 = StringFormat("BEST %s %s%d  wait arm  ENTRY %s",
         SmmKindName(g_zones[best].kind),
         SmmGradeLetter(g_zones[best].grade), g_zones[best].score,
         DoubleToString(g_zones[best].entry, _Digits));
   Comment(line1, "\n", line2, "\n", line3,
      "\nS1=", InpUseS1_MM, " S2=", InpUseS2_MSS, " S3=", InpUseS3_HTF,
      " S4=", InpUseS4_BB, " S5=", InpUseS5_FS,
      "  arm≥", InpMinScoreArm, "  atr=", DoubleToString(atr, _Digits));
}

void OnTick()
{
   BuildConfig();
   ResetDayIfNeeded();
   ExpireStalePendings();

   datetime t0 = iTime(_Symbol, _Period, 0);
   bool newBar = (t0 != 0 && t0 != g_lastBarTime);
   if(newBar) g_lastBarTime = t0;

   MqlRates rates[];
   int copied = CopyRates(_Symbol, _Period, 0, InpLookbackBars, rates);
   if(copied < 100) return;
   ArraySetAsSeries(rates, true);

   datetime time[];
   double open[], high[], low[], close[];
   ArrayResize(time, copied);
   ArrayResize(open, copied);
   ArrayResize(high, copied);
   ArrayResize(low, copied);
   ArrayResize(close, copied);
   for(int i = 0; i < copied; i++)
   {
      time[i] = rates[i].time;
      open[i] = rates[i].open;
      high[i] = rates[i].high;
      low[i] = rates[i].low;
      close[i] = rates[i].close;
   }

   double atr = SmmAtr(high, low, close, copied, 1);

   if(newBar)
   {
      SmmScanBirths(copied, time, open, high, low, close, g_cfg, g_zones,
                    g_lastBirthBar, g_lastFsBirthBar,
                    g_bullSweepUntil, g_bearSweepUntil,
                    g_lastBullSweepLo, g_lastBearSweepHi);
      SmmManageZones(g_zones, g_cfg, high, low, close, copied);
   }

   // Keep work slot alive — NEVER rewrite adopted ENTRY/SL/TP mid-trade
   if(g_workActive)
   {
      int wi = SmmFindZoneIndex(g_zones, g_work);
      if(wi < 0)
         ClearWork("zone expired");
      else
      {
         g_zones[wi].frozen = true;
         g_work.age = g_zones[wi].age;
         g_work.armed = g_zones[wi].armed;
         g_work.frozen = true;
         g_work.dead = g_zones[wi].dead;
         g_work.score = g_zones[wi].score;
         g_work.grade = g_zones[wi].grade;
         g_work.lq = g_zones[wi].lq;
         g_work.lqN = g_zones[wi].lqN;
         // entry / sl / tp stay at AdoptWork values
      }
   }

   // Adopt best armed setup (prefer Grade A over any B)
   if(InpAutoTrade && !g_workActive && CountOurOrders() == 0)
   {
      int idx = SmmBestArmedIndex(g_zones, g_cfg);
      if(idx >= 0)
      {
         int prefer = idx;
         bool preferIsA = (g_zones[prefer].score >= InpPreferGradeA);
         for(int i = 0; i < ArraySize(g_zones); i++)
         {
            if(!g_zones[i].armed || g_zones[i].dead) continue;
            if(g_cfg.useCleanScore && g_zones[i].score < g_cfg.minScoreArm) continue;
            bool isA = (g_zones[i].score >= InpPreferGradeA);
            if(isA && !preferIsA)
            {
               prefer = i;
               preferIsA = true;
            }
            else if(isA == preferIsA && g_zones[i].score > g_zones[prefer].score)
               prefer = i;
         }
         SmmZone s = g_zones[prefer];
         if(InpRequireArmed && !s.armed) { /* skip */ }
         else if(s.barTime != g_doneSetupTime && s.age <= InpAdoptMaxAgeBars)
            AdoptWork(s);
      }
   }

   // Work the adopted setup
   if(g_workActive)
   {
      if(CountOurOrders() > 0)
      {
         ClearWork("filled / in market");
      }
      else if(g_work.age > InpAdoptMaxAgeBars + 5)
      {
         ClearWork("adopt expired");
      }
      else
      {
         bool force = InpMarketOnTouch && BarTouchedEntry(g_work);
         int rc = PlaceSetupTrade(g_work, atr, force);
         if(rc < 0) ClearWork(g_workStatus);
         else if(rc > 0 && CountOurOrders() > 0) ClearWork("order placed");
      }
   }

   UpdatePanel(atr);
}
