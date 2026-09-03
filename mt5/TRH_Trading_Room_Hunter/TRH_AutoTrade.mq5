//+------------------------------------------------------------------+
//| TRH_AutoTrade.mq5                                                |
//| Smart fill: active setup manager · pullback limits · tick retry  |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "3.50"
#property description "TRH EA v3.50: trailing TP — if near TP2 pullback, close at TP1"
#property strict

#include <Trade/Trade.mqh>
#include "TRH_Engine.mqh"

#ifndef TRH_ENGINE_VERSION
#define TRH_ENGINE_VERSION 0
#endif

enum ENUM_TRH_TRADE_MODE
{
   TRH_TM_CLASSIC = 0,
   TRH_TM_FVG     = 1,
   TRH_TM_BOTH    = 2, // A + B (default)
   TRH_TM_BTB     = 3, // legacy off
   TRH_TM_ALL     = 4  // A + B (BTB removed)
};

enum ENUM_TRH_BE_STYLE
{
   TRH_BE_OFF    = 0, // No break-even
   TRH_BE_EARLY  = 1, // Old: BE at 0.5R (kills pullback-to-TP)
   TRH_BE_SMART  = 2, // Late BE + closed-bar confirm + mode-aware
   TRH_BE_STEP   = 3  // Reduce risk first, full BE later
};

input group "Trading"
input bool   InpAutoTrade         = true;
input bool   InpAlertOnSetup      = false;
input ulong  InpMagic             = 260825;
input int    InpMaxSlippagePts    = 50;
input int    InpPendingExpiryBars = 20;
input int    InpLookbackBars      = 2000;

input group "Strategy mode"
input ENUM_TRH_TRADE_MODE InpTradeMode = TRH_TM_BOTH; // A · SWEEP + B · FVG (autotrade both)

input group "1) Spread filter"
input bool   InpUseSpreadFilter   = true;
input int    InpMaxSpreadPoints   = 120;
input double InpMaxSpreadAtr      = 0.45;

input group "2) Session filter (broker server time)"
input bool   InpUseSessionFilter  = false; // OFF = trade all sessions (Asian dumps included)
input int    InpSessionStartHour  = 0;
input int    InpSessionEndHour    = 24;

input group "3) Daily limits"
input bool   InpUseDailyLimits    = true;
input double InpMaxDailyLossPct   = 4.0;
input int    InpMaxDailyTrades    = 8;

input group "4) Break-even / risk-free (OFF = leave setup SL alone)"
// Renamed vs old InpUseBreakEven / InpBeStyle so MT5 does not remap saved "true" → EARLY
input ENUM_TRH_BE_STYLE InpSLProtectStyle = TRH_BE_OFF; // OFF recommended — no risk-free
input double InpBreakEvenAtR              = 1.20;  // Smart/Step: full BE trigger (R)
input double InpBreakEvenLockR            = 0.10;  // Lock this R past entry after BE
input double InpBeModeAExtraR             = 0.30;  // Mode A needs more room (+R on trigger)
input double InpBeModeBAtR                = 1.00;  // Mode B full BE trigger (R)
input double InpBeStepReduceAtR           = 0.80;  // Step style: first move SL to cut risk at this R
input double InpBeStepKeepRiskR           = 0.50;  // Step style: keep this fraction of original risk
input bool   InpBeRequireClosedBar        = true;  // Only BE if last CLOSED bar reached trigger
input int    InpBeMinBarsOpen             = 3;     // Min bars after open before any BE/step

input group "5) Trailing TP — close at TP1 when TP2 pullback"
input bool   InpTrailingTP        = true;  // Enable trailing TP (pullback close at TP1)
input double InpTp1RR             = 2.0;   // TP1 level in R (first target, fallback)
input double InpTpNearPct         = 0.85;  // Reached this % of TP before pullback triggers
input double InpTpPullbackPct     = 0.40;  // Pullback this fraction of remaining-to-TP = trigger
input int    InpTpTrailMinBars    = 3;     // Min bars after crossing near threshold

input group "6) ENTRY fill (far = market now · near = pending)"
input double InpMarketTolAtr      = 0.25; // Near band (ATR): within this → pending @ ENTRY
input double InpMaxChaseAtr       = 0.40; // legacy (unused when far-market-now is on)
input double InpExpireAtR         = 1.20; // Abort only if this far toward TP (R) — was 0.90
input bool   InpFarOpenMarket     = true; // Far from ENTRY → open market immediately
input bool   InpUsePullbackLimit  = true; // Near + past ENTRY → Limit back to ENTRY
input bool   InpLimitBeforeEntry  = true; // Near + before ENTRY → Stop into ENTRY
input bool   InpMarketOnTouch     = true; // If pending sits, market when bar touches ENTRY
input bool   InpCancelRunThrough  = true;
input int    InpAdoptMaxAgeBars   = 20;   // Was 8 — gold dumps age out too fast
input int    InpRetryEveryTicks   = 1;
input bool   InpFixLiveStops      = true; // Auto-pad SL/TP when live market would reject

input group "TRH Detection (= Pine Mode A)"
input int    InpPivotPeriod     = 5;
input double InpMinContextAtr   = 1.2;
input double InpMinSweepAtr     = 0.05;
input int    InpBaseConfirmBars = 8;
input int    InpMaxBaseBars     = 40;
input double InpMinRoomAtr      = 0.8;
input double InpMaxRoomAtr      = 3.5;
input int    InpCooldownBars    = 50;

input group "Mode B - Sweep + Displacement + FVG"
input double InpMinDispAtr      = 0.55;
input int    InpMaxDispBars     = 6;
input int    InpMaxFvgBars      = 18;
input double InpMinFvgAtr       = 0.45;
input double InpMinFvgPoints    = 1.50;
input bool   InpRequireFvgRetest= true;
input int    InpMaxRetestBars   = 12;
input double InpFvgSlExtraAtr   = 0.45;
input double InpFvgMinRiskAtr   = 1.55;

input group "Mode C - Pro BTB (Break + Retest)"
input double InpMinBreakAtr     = 0.20;
input double InpMinBreakBodyAtr = 0.45;
input int    InpMaxBtbRetestBars= 10;
input double InpBtbRiskReward   = 2.0;
input double InpBtbSlExtraAtr   = 0.15;
input bool   InpBtbRequireConfirm = true;
input double InpBtbMinRiskAtr   = 0.50;
input double InpBtbMinConfirmBody= 0.28;
input bool   InpBtbWickReject   = true;
input double InpBtbMaxPastEntry = 0.20;
input int    InpBtbMinBarsBreak = 2;

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;
input double InpRiskReward      = 2.4;
input bool   InpUseLiquidityTP  = true;

input group "Dynamic lot size (balance-based)"
input bool   InpUseDynamicLots  = true;
input double InpRiskPercent     = 1.5;
input double InpBalanceBase     = 0;
input double InpLotScale        = 1.0;
input double InpFixedLots       = 0.0;
input double InpMinLots         = 0.0;
input double InpMaxLots         = 0.0;
input int    InpMaxOpenTrades   = 1;

CTrade   g_trade;
datetime g_lastBarTime    = 0;
datetime g_dayStamp       = 0;
double   g_dayStartEquity = 0;
int      g_dayTrades      = 0;
int      g_tickCounter    = 0;

bool     g_workActive     = false;
TrhSetup g_work;
datetime g_workAdopted    = 0;
int      g_workTries      = 0;
string   g_workStatus     = "";
datetime g_doneSetupTime  = 0;

void BuildConfig(TrhConfig &cfg)
{
   cfg.pivotPeriod     = InpPivotPeriod;
   cfg.minContextAtr   = InpMinContextAtr;
   cfg.minSweepAtr     = InpMinSweepAtr;
   cfg.baseConfirmBars = InpBaseConfirmBars;
   cfg.maxBaseBars     = InpMaxBaseBars;
   cfg.minRoomAtr      = InpMinRoomAtr;
   cfg.maxRoomAtr      = InpMaxRoomAtr;
   cfg.cooldownBars    = InpCooldownBars;
   cfg.slPadAtr        = InpSlPadAtr;
   cfg.riskReward      = InpRiskReward;
   cfg.useLiquidityTP  = InpUseLiquidityTP;
   cfg.minDispAtr      = InpMinDispAtr;
   cfg.maxDispBars     = InpMaxDispBars;
   cfg.maxFvgBars      = InpMaxFvgBars;
   cfg.minFvgAtr       = InpMinFvgAtr;
   cfg.minFvgPoints    = InpMinFvgPoints;
   cfg.requireFvgRetest= InpRequireFvgRetest;
   cfg.maxRetestBars   = InpMaxRetestBars;
   cfg.fvgSlExtraAtr   = InpFvgSlExtraAtr;
   cfg.fvgMinRiskAtr   = InpFvgMinRiskAtr;
   cfg.minBreakAtr     = InpMinBreakAtr;
   cfg.minBreakBodyAtr = InpMinBreakBodyAtr;
   cfg.maxBtbRetestBars= InpMaxBtbRetestBars;
   cfg.btbRiskReward   = InpBtbRiskReward;
   cfg.btbSlExtraAtr   = InpBtbSlExtraAtr;
   cfg.btbRequireConfirm = InpBtbRequireConfirm;
   cfg.btbMinRiskAtr       = InpBtbMinRiskAtr;
   cfg.btbMinConfirmBodyAtr= InpBtbMinConfirmBody;
   cfg.btbRequireWickReject= InpBtbWickReject;
   cfg.btbMaxPastEntryAtr  = InpBtbMaxPastEntry;
   cfg.btbMinBarsAfterBreak= InpBtbMinBarsBreak;
}

void ResetDayIfNeeded()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime day = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   if(day != g_dayStamp)
   {
      g_dayStamp = day;
      g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
      g_dayTrades = 0;
   }
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

int CountOurPositions()
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
   return n;
}

int CountOurPendings()
{
   int n = 0;
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

bool SpreadOk(const double atrNow)
{
   if(!InpUseSpreadFilter) return true;
   long spreadPts = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spreadPts > InpMaxSpreadPoints)
   {
      g_workStatus = StringFormat("wait spread %d>%d", (int)spreadPts, InpMaxSpreadPoints);
      return false;
   }
   if(InpMaxSpreadAtr > 0 && atrNow > 0)
   {
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double spreadPrice = (double)spreadPts * point;
      if(spreadPrice > atrNow * InpMaxSpreadAtr)
      {
         g_workStatus = "wait spread ATR";
         return false;
      }
   }
   return true;
}

bool SessionOk()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   bool ok;
   if(InpSessionStartHour == InpSessionEndHour) ok = true;
   else if(InpSessionStartHour < InpSessionEndHour)
      ok = (h >= InpSessionStartHour && h < InpSessionEndHour);
   else
      ok = (h >= InpSessionStartHour || h < InpSessionEndHour);
   if(!ok)
      g_workStatus = StringFormat("outside session %d-%d", InpSessionStartHour, InpSessionEndHour);
   return ok;
}

bool TradeAllowedOk()
{
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
   {
      g_workStatus = "Algo Trading OFF (toolbar)";
      return false;
   }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      g_workStatus = "EA trading disabled in properties";
      return false;
   }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
   {
      g_workStatus = "account trade not allowed";
      return false;
   }
   long mode = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
   if(mode == SYMBOL_TRADE_MODE_DISABLED)
   {
      g_workStatus = "symbol trade disabled";
      return false;
   }
   return true;
}

bool DailyLimitsOk()
{
   if(!InpUseDailyLimits) return true;
   ResetDayIfNeeded();
   if(InpMaxDailyTrades > 0 && g_dayTrades >= InpMaxDailyTrades)
   {
      g_workStatus = "daily trade cap";
      return false;
   }
   if(InpMaxDailyLossPct > 0.0 && g_dayStartEquity > 0.0)
   {
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      double lossPct = 100.0 * (g_dayStartEquity - eq) / g_dayStartEquity;
      if(lossPct >= InpMaxDailyLossPct)
      {
         g_workStatus = "daily loss cap";
         return false;
      }
   }
   return true;
}

double CalcLots(const double entry, const double sl)
{
   double volMin     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double volumeStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(volumeStep <= 0) volumeStep = 0.01;
   if(InpMinLots > 0) volMin = MathMax(volMin, InpMinLots);
   if(InpMaxLots > 0) volMax = MathMin(volMax, InpMaxLots);

   double lots;
   if(InpFixedLots > 0.0)
      lots = InpFixedLots;
   else if(InpUseDynamicLots)
   {
      double balance = (InpBalanceBase > 0.0) ? InpBalanceBase : AccountInfoDouble(ACCOUNT_BALANCE);
      double riskMoney = balance * (InpRiskPercent / 100.0) * InpLotScale;
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dist = MathAbs(entry - sl);
      if(tickSize <= 0 || tickValue <= 0 || dist <= 0 || riskMoney <= 0)
         return volMin;
      lots = riskMoney / ((dist / tickSize) * tickValue);
   }
   else
   {
      double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * (InpRiskPercent / 100.0);
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dist = MathAbs(entry - sl);
      if(tickSize <= 0 || tickValue <= 0 || dist <= 0) return volMin;
      lots = riskMoney / ((dist / tickSize) * tickValue);
   }

   lots = MathFloor(lots / volumeStep) * volumeStep;
   if(lots < volMin) lots = volMin;
   if(lots > volMax) lots = volMax;

   int digits = 0;
   double step = volumeStep;
   while(step < 1.0 && digits < 8) { step *= 10.0; digits++; }
   return NormalizeDouble(lots, digits);
}

bool AdjustStops(const int dir, const double entry, double &sl, double &tp)
{
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0) return false;
   double minDist = stopsLevel * point;
   if(minDist <= 0) minDist = point;

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
   return true;
}

double PastEntryDist(const TrhSetup &s)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   return (s.dir == 1) ? (ask - s.entry) : (s.entry - bid);
}

bool SetupTooDeepToTP(const TrhSetup &s)
{
   double risk = MathAbs(s.entry - s.sl);
   if(risk <= 0 || InpExpireAtR <= 0) return false;
   return PastEntryDist(s) >= risk * InpExpireAtR;
}

bool SetupSlHitBeforeFill(const TrhSetup &s)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(s.dir == 1) return (bid <= s.sl);
   return (ask >= s.sl);
}

bool BarTouchedEntry(const TrhSetup &s)
{
   double hi = iHigh(_Symbol, _Period, 0);
   double lo = iLow(_Symbol, _Period, 0);
   if(hi <= 0 || lo <= 0) return false;
   return (lo <= s.entry && hi >= s.entry);
}

void ClearWork(const string why)
{
   PrintFormat("TRH work CLEAR %s @ %s — %s",
      TrhModeLabel(g_work.setupMode),
      TimeToString(g_work.barTime, TIME_DATE|TIME_MINUTES),
      why);
   g_doneSetupTime = g_work.barTime;
   g_workActive = false;
   g_workTries = 0;
   g_workStatus = why;
}

void AdoptWork(const TrhSetup &s)
{
   g_work = s;
   g_workActive = true;
   g_workAdopted = TimeCurrent();
   g_workTries = 0;
   g_workStatus = "adopted — placing";
   PrintFormat("TRH work ADOPT %s %s E=%s SL=%s TP=%s @ %s",
      TrhModeLabel(s.setupMode),
      s.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(s.entry, _Digits),
      DoubleToString(s.sl, _Digits),
      DoubleToString(s.tp, _Digits),
      TimeToString(s.barTime, TIME_DATE|TIME_MINUTES));
}

int PlaceSetupTrade(const TrhSetup &s, const double atrNow, const bool forceMarket)
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
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl    = NormalizeDouble(s.sl, _Digits);
   double tp    = NormalizeDouble(s.tp, _Digits);
   if(!AdjustStops(s.dir, entry, sl, tp))
   {
      g_workStatus = "bad stops";
      return 0; // retryable — broker stops level can change
   }

   if(SetupSlHitBeforeFill(s))
   {
      g_workStatus = "SL hit before fill — abort";
      return -1;
   }
   if(SetupTooDeepToTP(s))
   {
      // Still allow market if far-open and enough room left to extend TP
      if(!(InpFarOpenMarket || forceMarket))
      {
         g_workStatus = "too deep toward TP — abort";
         return -1;
      }
   }

   double fillPx    = (s.dir == 1) ? ask : bid;
   double pastEntry = (s.dir == 1) ? (ask - entry) : (entry - bid);
   double distEntry = MathAbs(fillPx - entry);
   double nearTol   = MathMax(atrNow * InpMarketTolAtr, _Point);
   bool   nearEntry = (distEntry <= nearTol);

   // Far from ENTRY → market NOW. Near ENTRY → pending at exact ENTRY.
   // forceMarket (bar touch) always markets. Too-deep → market with live geometry.
   bool openMarketNow = forceMarket || (InpFarOpenMarket && !nearEntry) || SetupTooDeepToTP(s);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   bool ok = false;
   string mode = "";
   double lots = 0;

   if(openMarketNow)
   {
      // MARKET at current price (far from setup ENTRY, or forced)
      double useEntry = NormalizeDouble(fillPx, _Digits);
      double useSL = sl;
      double useTP = tp;
      double risk = MathAbs(entry - sl);
      if(risk <= 0) risk = atrNow > 0 ? atrNow : _Point * 100;

      // Keep geometry from live fill when price has moved
      if(s.dir == 1)
      {
         useSL = useEntry - risk;
         useTP = useEntry + risk * InpRiskReward;
      }
      else
      {
         useSL = useEntry + risk;
         useTP = useEntry - risk * InpRiskReward;
      }

      if(!AdjustStops(s.dir, useEntry, useSL, useTP))
      {
         g_workStatus = "bad stops @ market";
         return 0;
      }

      // Pad SL beyond live quote if broker would reject
      long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double minDist = MathMax(stopsLevel * point, point * 10);
      if(InpFixLiveStops)
      {
         if(s.dir == 1 && useSL >= bid - minDist)
            useSL = NormalizeDouble(bid - minDist, _Digits);
         if(s.dir == -1 && useSL <= ask + minDist)
            useSL = NormalizeDouble(ask + minDist, _Digits);
         if(s.dir == 1 && useTP <= ask + minDist)
            useTP = NormalizeDouble(ask + minDist + risk * InpRiskReward, _Digits);
         if(s.dir == -1 && useTP >= bid - minDist)
            useTP = NormalizeDouble(bid - minDist - risk * InpRiskReward, _Digits);
      }

      if(s.dir == 1 && useSL >= bid)
      {
         g_workStatus = "SL invalid vs bid — retry";
         return 0;
      }
      if(s.dir == -1 && useSL <= ask)
      {
         g_workStatus = "SL invalid vs ask — retry";
         return 0;
      }

      lots = CalcLots(useEntry, useSL);
      double origRisk = MathAbs(useEntry - useSL);
      string comment = StringFormat("%s %s |R=%.2f",
         TrhModeLabel(s.setupMode),
         s.dir == 1 ? "LONG" : "SHORT",
         origRisk);

      mode = StringFormat("MARKET %s (far %.2fATR)",
         s.dir == 1 ? "BUY" : "SELL",
         (atrNow > 0 ? distEntry / atrNow : 0));
      if(forceMarket)
         mode = (s.dir == 1) ? "MARKET BUY (touch)" : "MARKET SELL (touch)";
      if(SetupTooDeepToTP(s))
         mode = (s.dir == 1) ? "MARKET BUY (chase)" : "MARKET SELL (chase)";

      ok = (s.dir == 1)
         ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
         : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);

      // Retry with alternate filling if broker rejected filling mode
      if(!ok)
      {
         uint ret = g_trade.ResultRetcode();
         if(ret == TRADE_RETCODE_INVALID_FILL)
         {
            g_trade.SetTypeFilling(ORDER_FILLING_IOC);
            ok = (s.dir == 1)
               ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
               : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);
            if(!ok)
            {
               g_trade.SetTypeFilling(ORDER_FILLING_FOK);
               ok = (s.dir == 1)
                  ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
                  : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);
            }
            if(!ok)
            {
               g_trade.SetTypeFilling(ORDER_FILLING_RETURN);
               ok = (s.dir == 1)
                  ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
                  : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);
            }
         }
      }

      g_workTries++;
      if(ok)
      {
         if(CountOurOrders() > 0)
            g_dayTrades++;
         g_workStatus = mode + " OK";
         PrintFormat("TRH %s %s lots=%s fill=%s Esetup=%s SL=%s TP=%s dist=%.2f try=%d",
            mode, s.dir == 1 ? "LONG" : "SHORT",
            DoubleToString(lots, 2),
            DoubleToString(useEntry, _Digits),
            DoubleToString(entry, _Digits),
            DoubleToString(useSL, _Digits),
            DoubleToString(useTP, _Digits),
            distEntry, g_workTries);
         return 1;
      }

      uint retFail = g_trade.ResultRetcode();
      g_workStatus = StringFormat("order fail %d %s", retFail, g_trade.ResultRetcodeDescription());
      PrintFormat("TRH ORDER FAIL %s %s ret=%d %s try=%d",
         mode, s.dir == 1 ? "LONG" : "SHORT", retFail, g_trade.ResultRetcodeDescription(), g_workTries);
      return 0; // retryable
   }

   // NEAR ENTRY → pending order at exact setup ENTRY
   lots = CalcLots(entry, sl);
   double origRisk = MathAbs(entry - sl);
   string comment = StringFormat("%s %s |R=%.2f",
      TrhModeLabel(s.setupMode),
      s.dir == 1 ? "LONG" : "SHORT",
      origRisk);

   if(pastEntry > nearTol * 0.15)
   {
      // Slightly past ENTRY toward TP → Limit for pullback to ENTRY
      if(!InpUsePullbackLimit)
      {
         // No limit → market at current
         mode = (s.dir == 1) ? "MARKET BUY (near-past)" : "MARKET SELL (near-past)";
         ok = (s.dir == 1)
            ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
            : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else if(s.dir == 1)
      {
         if(entry >= ask)
         {
            mode = "MARKET BUY (no room for BuyLimit)";
            ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "BUY LIMIT @ ENTRY";
            ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
      else
      {
         if(entry <= bid)
         {
            mode = "MARKET SELL (no room for SellLimit)";
            ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "SELL LIMIT @ ENTRY";
            ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
   }
   else
   {
      // At / before ENTRY → Stop into ENTRY (or market if already through)
      if(!InpLimitBeforeEntry)
      {
         mode = (s.dir == 1) ? "MARKET BUY (near)" : "MARKET SELL (near)";
         ok = (s.dir == 1)
            ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
            : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else if(s.dir == 1)
      {
         if(entry <= ask)
         {
            mode = "MARKET BUY (at ENTRY)";
            ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "BUY STOP @ ENTRY";
            ok = g_trade.BuyStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
      else
      {
         if(entry >= bid)
         {
            mode = "MARKET SELL (at ENTRY)";
            ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "SELL STOP @ ENTRY";
            ok = g_trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
   }

   g_workTries++;

   if(ok)
   {
      if(CountOurOrders() > 0)
         g_dayTrades++;
      g_workStatus = mode + " OK";
      PrintFormat("TRH %s %s lots=%s E=%s SL=%s TP=%s dist=%.2f try=%d",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(lots, 2),
         DoubleToString(entry, _Digits),
         DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits),
         distEntry, g_workTries);
      return 1;
   }

   uint ret = g_trade.ResultRetcode();
   g_workStatus = StringFormat("order fail %d %s", ret, g_trade.ResultRetcodeDescription());
   PrintFormat("TRH ORDER FAIL %s %s ret=%d %s try=%d",
      mode, s.dir == 1 ? "LONG" : "SHORT", ret, g_trade.ResultRetcodeDescription(), g_workTries);

   if(ret == TRADE_RETCODE_INVALID_PRICE || ret == TRADE_RETCODE_INVALID_STOPS)
   {
      if(StringFind(mode, "LIMIT") >= 0 || StringFind(mode, "STOP") >= 0)
      {
         bool mok = (s.dir == 1)
            ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
            : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
         if(mok)
         {
            g_dayTrades++;
            g_workStatus = "MARKET fallback OK";
            PrintFormat("TRH MARKET FALLBACK OK after pending reject");
            return 1;
         }
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
      {
         PrintFormat("TRH: expire pending #%I64u after %d bars", ticket, ageBars);
         g_trade.OrderDelete(ticket);
      }
   }
}

void CancelRunThroughPendings(const double atrNow)
{
   if(!InpCancelRunThrough) return;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;

      long type = OrderGetInteger(ORDER_TYPE);
      double px = OrderGetDouble(ORDER_PRICE_OPEN);
      double osl = OrderGetDouble(ORDER_SL);
      double risk = MathAbs(px - osl);
      if(risk <= 0)
         risk = MathMax(atrNow * 0.5, _Point * 10);
      double expireDist = risk * InpExpireAtR;
      if(expireDist <= 0) continue;

      bool runThrough = false;
      // Limits: price ran toward TP away from pending
      if(type == ORDER_TYPE_BUY_LIMIT && ask >= px + expireDist)
         runThrough = true;
      if(type == ORDER_TYPE_SELL_LIMIT && bid <= px - expireDist)
         runThrough = true;
      // Stops: price ran the wrong way to SL, or too far past without us managing
      if(type == ORDER_TYPE_BUY_STOP && bid <= px - expireDist)
         runThrough = true;
      if(type == ORDER_TYPE_SELL_STOP && ask >= px + expireDist)
         runThrough = true;

      if(runThrough)
      {
         PrintFormat("TRH: cancel run-through pending #%I64u @ %s",
            ticket, DoubleToString(px, _Digits));
         g_trade.OrderDelete(ticket);
         if(g_workActive && MathAbs(g_work.entry - px) < _Point * 5)
            ClearWork("run-through canceled");
      }
   }
}

int CommentModeId(const string cmt)
{
   if(StringFind(cmt, "B · FVG") >= 0 || StringFind(cmt, "B·FVG") >= 0 || StringFind(cmt, "FVG") >= 0)
      return TRH_MODE_FVG;
   if(StringFind(cmt, "C · BTB") >= 0 || StringFind(cmt, "BTB") >= 0)
      return TRH_MODE_BTB;
   return TRH_MODE_CLASSIC;
}

double CommentOrigRisk(const string cmt, const double fallback)
{
   int p = StringFind(cmt, "|R=");
   if(p < 0) return fallback;
   string tail = StringSubstr(cmt, p + 3);
   double v = StringToDouble(tail);
   return (v > 0) ? v : fallback;
}

double BeTriggerR(const int modeId)
{
   if(InpSLProtectStyle == TRH_BE_EARLY) return 0.50;
   if(modeId == TRH_MODE_FVG) return MathMax(InpBeModeBAtR, 0.8);
   // Mode A SWEEP — often revisits near SL before TP
   return MathMax(InpBreakEvenAtR + InpBeModeAExtraR, InpBreakEvenAtR);
}

bool ClosedBarReachedR(const int dir, const double entry, const double risk, const double needR)
{
   if(!InpBeRequireClosedBar) return true;
   if(risk <= 0) return false;
   double c1 = iClose(_Symbol, _Period, 1);
   if(c1 <= 0) return false;
   double favor = (dir == 1) ? (c1 - entry) : (entry - c1);
   return (favor / risk) >= needR;
}

void ManageBreakEven()
{
   if(InpSLProtectStyle == TRH_BE_OFF) return;

   int periodSec = PeriodSeconds(_Period);
   if(periodSec <= 0) periodSec = 60;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      int dir = (type == POSITION_TYPE_BUY) ? 1 : -1;
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      string cmt   = PositionGetString(POSITION_COMMENT);
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      if(entry <= 0) continue;

      int barsOpen = (int)((TimeCurrent() - opened) / periodSec);
      if(barsOpen < InpBeMinBarsOpen) continue;

      int modeId = CommentModeId(cmt);

      // Original risk from comment (stable after SL moves) or current adverse SL
      double riskNow = 0;
      if(dir == 1) riskNow = (sl > 0 && sl < entry) ? (entry - sl) : 0;
      else         riskNow = (sl > 0 && sl > entry) ? (sl - entry) : 0;
      double risk0 = CommentOrigRisk(cmt, 0);
      if(risk0 <= 0)
      {
         if(riskNow > 0) risk0 = riskNow;
         else if(tp > 0) risk0 = MathAbs(tp - entry) / MathMax(InpRiskReward, 0.1);
         else continue;
      }

      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double favor = (dir == 1) ? (bid - entry) : (entry - ask);
      double rNow = favor / risk0;

      double fullBeR = BeTriggerR(modeId);

      // Step 1: only cut risk (keep room for near-SL → TP paths)
      if(InpSLProtectStyle == TRH_BE_STEP && rNow >= InpBeStepReduceAtR && riskNow > risk0 * InpBeStepKeepRiskR + _Point)
      {
         if(ClosedBarReachedR(dir, entry, risk0, InpBeStepReduceAtR))
         {
            double keep = risk0 * MathMax(MathMin(InpBeStepKeepRiskR, 0.9), 0.2);
            double newSL = (dir == 1)
               ? NormalizeDouble(entry - keep, _Digits)
               : NormalizeDouble(entry + keep, _Digits);
            bool better = (dir == 1) ? (newSL > sl) : (sl == 0 || newSL < sl);
            bool safe = (dir == 1) ? (bid > newSL) : (ask < newSL);
            if(better && safe && g_trade.PositionModify(ticket, newSL, tp))
               PrintFormat("TRH BE-STEP: #%I64u SL→%s keepRisk=%.2fR (live %.2fR, mode=%d)",
                  ticket, DoubleToString(newSL, _Digits), InpBeStepKeepRiskR, rNow, modeId);
         }
      }

      // Full BE — late + closed-bar confirm so wicks near SL can still reach TP
      if(rNow < fullBeR) continue;
      if(!ClosedBarReachedR(dir, entry, risk0, fullBeR)) continue;

      double lock = risk0 * InpBreakEvenLockR;
      double newSL = (dir == 1)
         ? NormalizeDouble(entry + lock, _Digits)
         : NormalizeDouble(entry - lock, _Digits);

      if(dir == 1)
      {
         if(sl >= newSL) continue;
         if(bid <= newSL) continue;
      }
      else
      {
         if(sl > 0 && sl <= newSL) continue;
         if(ask >= newSL) continue;
      }

      if(g_trade.PositionModify(ticket, newSL, tp))
         PrintFormat("TRH BE-SMART: #%I64u newSL=%s at %.2fR (trigger %.2fR, mode=%d, style=%d)",
            ticket, DoubleToString(newSL, _Digits), rNow, fullBeR, modeId, (int)InpSLProtectStyle);
   }
}

//+------------------------------------------------------------------+
//| Trailing TP — close at TP1 when price reached near TP2 then      |
//| pulled back without hitting it.                                   |
//+------------------------------------------------------------------+
void ManageTrailingTP()
{
   if(!InpTrailingTP) return;

   int periodSec = PeriodSeconds(_Period);
   if(periodSec <= 0) periodSec = 60;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      int dir = (type == POSITION_TYPE_BUY) ? 1 : -1;
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      if(entry <= 0 || tp <= 0) continue;

      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double price = (dir == 1) ? bid : ask;

      // Original risk from comment or SL
      string cmt = PositionGetString(POSITION_COMMENT);
      double risk0 = CommentOrigRisk(cmt, 0);
      if(risk0 <= 0)
      {
         if(dir == 1 && sl > 0 && sl < entry) risk0 = entry - sl;
         else if(dir == -1 && sl > 0 && sl > entry) risk0 = sl - entry;
         else continue;
      }

      // TP1 = first target (fallback RR level)
      double tp1 = (dir == 1) ? (entry + risk0 * InpTp1RR) : (entry - risk0 * InpTp1RR);

      // Only act if TP is beyond TP1 (i.e. liquidity TP is farther)
      double fullDist = MathAbs(tp - entry);
      double tp1Dist = MathAbs(tp1 - entry);
      if(tp1Dist >= fullDist * 0.95) continue; // TP1 is already near TP2, nothing to trail

      // How far has price gone toward TP?
      double favor = (dir == 1) ? (price - entry) : (entry - price);
      double pctToTP = favor / fullDist;

      // MFE tracking: check if previous bars reached near-TP threshold
      // Use bar high/low as proxy for MFE
      double mfe = favor;
      int lookback = MathMin(InpTpTrailMinBars + 5, 20);
      for(int k = 1; k <= lookback; k++)
      {
         double barH = iHigh(_Symbol, _Period, k);
         double barL = iLow(_Symbol, _Period, k);
         if(barH <= 0) continue;
         double barFavor = (dir == 1) ? (barH - entry) : (entry - barL);
         if(barFavor > mfe) mfe = barFavor;
      }

      double mfePct = mfe / fullDist;
      if(mfePct < InpTpNearPct) continue; // never got close enough to TP

      // Price has now pulled back — check if pullback is significant
      double pullback = mfe - favor;
      double remainAtMfe = fullDist - mfe;
      if(remainAtMfe <= 0) continue; // actually hit TP, broker should fill

      // Trigger: pullback from MFE exceeds threshold fraction of remaining distance
      // OR price has come back below TP1
      bool pullbackTrigger = (pullback >= (fullDist - mfe + pullback) * InpTpPullbackPct);
      bool belowTp1 = (dir == 1) ? (price <= tp1) : (price >= tp1);

      if(!pullbackTrigger && !belowTp1) continue;

      // Check min bars since crossing the near threshold
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      int barsOpen = (int)((TimeCurrent() - opened) / periodSec);
      if(barsOpen < InpTpTrailMinBars) continue;

      // Tighten TP to TP1 if it's better than current price (still profitable)
      bool tp1Profitable = (dir == 1) ? (tp1 > entry) : (tp1 < entry);
      if(!tp1Profitable) continue;

      // Close at market — TP1 was the intermediate target
      bool ok = (dir == 1)
         ? g_trade.Sell(PositionGetDouble(POSITION_VOLUME), _Symbol)
         : g_trade.Buy(PositionGetDouble(POSITION_VOLUME), _Symbol);

      if(ok)
         PrintFormat("TRH TRAIL-TP: #%I64u closed at %.2fR — near TP2 (%.1f%%) pulled back to TP1 %s",
            ticket, favor / risk0, mfePct * 100.0, DoubleToString(tp1, _Digits));
   }
}

double EstimateAtr()
{
   MqlRates tip[];
   if(CopyRates(_Symbol, _Period, 1, 20, tip) < 15) return 0;
   ArraySetAsSeries(tip, true);
   double sum = 0;
   for(int k = 1; k <= 14; k++)
   {
      double tr = MathMax(tip[k].high - tip[k].low,
                   MathMax(MathAbs(tip[k].high - tip[k + 1].close),
                           MathAbs(tip[k].low - tip[k + 1].close)));
      sum += tr;
   }
   return sum / 14.0;
}

void UpdateComment(const TrhSetup &last, const int ageBars, const double lots)
{
   int pos = CountOurPositions();
   int pend = CountOurPendings();
   string work = g_workActive
      ? StringFormat("WORKING %s %s tries=%d\n%s",
           TrhModeLabel(g_work.setupMode),
           g_work.dir == 1 ? "LONG" : "SHORT",
           g_workTries, g_workStatus)
      : ("idle: " + g_workStatus);

   string beName = "BE-OFF";
   if(InpSLProtectStyle == TRH_BE_EARLY) beName = "BE-EARLY";
   else if(InpSLProtectStyle == TRH_BE_SMART) beName = "BE-SMART";
   else if(InpSLProtectStyle == TRH_BE_STEP) beName = "BE-STEP";

   Comment(StringFormat(
      "TRH EA v3.50 | %s | %s\nLatest %s %s age=%d\nE %s  SL %s  TP %s\npos=%d pend=%d day=%d lots~%s\n%s",
      InpAutoTrade ? "ON" : "OFF",
      beName,
      last.dir == 1 ? "LONG" : "SHORT",
      TrhModeFullName(last.setupMode),
      ageBars,
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      pos, pend, g_dayTrades,
      DoubleToString(lots, 2),
      work));
}

int OnInit()
{
   if(TRH_ENGINE_VERSION < 233)
   {
      Alert("TRH EA v3.40: Engine outdated (v", IntegerToString(TRH_ENGINE_VERSION),
            "). Copy NEW TRH_Engine.mqh into THIS EA folder and recompile. Need Engine >= 233.");
      return INIT_FAILED;
   }

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   ResetDayIfNeeded();
   g_workActive = false;
   g_workStatus = "boot";

   if(!TradeAllowedOk())
      PrintFormat("TRH WARN: trading blocked — %s", g_workStatus);

   PrintFormat("TRH AutoTrade v3.50 | Eng%d | Mode B mid-FVG | BE=%d | trailTP=%s | farMarket=%s | session=%s | adoptAge<=%d | %s %s",
      TRH_ENGINE_VERSION,
      (int)InpSLProtectStyle,
      InpTrailingTP ? "Y" : "N",
      InpFarOpenMarket ? "Y" : "N",
      InpUseSessionFilter ? "ON" : "OFF",
      InpAdoptMaxAgeBars,
      _Symbol, EnumToString(_Period));

   Comment("TRH EA v3.50 Eng" + IntegerToString(TRH_ENGINE_VERSION) +
           "\nTrailing TP: close @ TP1 on TP2 pullback\nfar→market · near→pending @ ENTRY");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

void OnTick()
{
   ResetDayIfNeeded();
   ExpireStalePendings();
   ManageBreakEven();
   ManageTrailingTP();

   double atrNow = EstimateAtr();
   if(atrNow > 0)
      CancelRunThroughPendings(atrNow);

   if(CountOurPositions() > 0)
   {
      if(g_workActive)
         ClearWork("position open");
      g_workStatus = "in position";
   }

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0) return;

   bool newBar = (barTime != g_lastBarTime);
   if(newBar)
      g_lastBarTime = barTime;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, 0, InpLookbackBars, rates);
   if(copied < 120)
   {
      g_workStatus = "not enough bars";
      return;
   }

   datetime t[];
   double o[], h[], l[], c[];
   ArrayResize(t, copied);
   ArrayResize(o, copied);
   ArrayResize(h, copied);
   ArrayResize(l, copied);
   ArrayResize(c, copied);
   for(int i = 0; i < copied; i++)
   {
      t[i] = rates[i].time;
      o[i] = rates[i].open;
      h[i] = rates[i].high;
      l[i] = rates[i].low;
      c[i] = rates[i].close;
   }

   TrhConfig cfg;
   BuildConfig(cfg);
   TrhSetup setups[];
   int n = TrhScanByMode(copied, t, o, h, l, c, cfg, (int)InpTradeMode, setups);
   if(n <= 0)
   {
      Comment(StringFormat("TRH EA v3.40 %s — scanning...\nday %d | %s",
         InpAutoTrade ? "ON" : "OFF", g_dayTrades, g_workStatus));
      return;
   }

   TrhSetup last = setups[n - 1];
   int ageBars = (copied >= 2) ? ((copied - 2) - last.barIndex) : ((copied - 1) - last.barIndex);
   if(ageBars < 0) ageBars = 0;
   double previewLots = CalcLots(last.entry, last.sl);
   atrNow = TrhCalcATR(copied - 2, h, l, c);

   if(InpAutoTrade &&
      last.barTime != g_doneSetupTime &&
      (!g_workActive || last.barTime != g_work.barTime) &&
      ageBars <= InpAdoptMaxAgeBars &&
      CountOurOrders() == 0)
   {
      bool replace = false;
      if(!g_workActive)
         replace = true;
      else if(last.barTime > g_work.barTime)
         replace = true;
      else if(last.barTime == g_work.barTime && TrhModePreferred(last.setupMode, g_work.setupMode))
         replace = true;

      if(replace)
         AdoptWork(last);
   }

   g_tickCounter++;
   if(g_workActive && InpAutoTrade)
   {
      int workAge = (copied >= 2) ? ((copied - 2) - g_work.barIndex) : ageBars;
      if(workAge < 0) workAge = 0;

      if(CountOurPositions() > 0)
      {
         ClearWork("filled → position");
      }
      else if(CountOurPendings() > 0)
      {
         g_workStatus = "pending parked @ ENTRY";
         if(InpMarketOnTouch && BarTouchedEntry(g_work) && (g_tickCounter % MathMax(InpRetryEveryTicks, 1) == 0))
         {
            for(int i = OrdersTotal() - 1; i >= 0; i--)
            {
               ulong ticket = OrderGetTicket(i);
               if(ticket == 0 || !OrderSelect(ticket)) continue;
               if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
               if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
               g_trade.OrderDelete(ticket);
            }
            int rcTouch = PlaceSetupTrade(g_work, atrNow, true);
            if(rcTouch == 1)
               ClearWork("market on touch");
            else if(rcTouch < 0)
               ClearWork(g_workStatus);
         }
      }
      else if(workAge > InpPendingExpiryBars)
      {
         ClearWork("work expired (age)");
      }
      else if(SetupSlHitBeforeFill(g_work))
      {
         ClearWork("SL before fill");
      }
      else if(g_tickCounter % MathMax(InpRetryEveryTicks, 1) == 0)
      {
         int rc = PlaceSetupTrade(g_work, atrNow, false);
         if(rc == 1)
         {
            if(CountOurPositions() > 0)
               ClearWork("placed position");
            else if(CountOurPendings() > 0)
               g_workStatus = "pending parked @ ENTRY";
         }
         else if(rc < 0)
         {
            ClearWork(g_workStatus);
         }
         // rc == 0 → retry next tick (spread / session / order fail / SL pad)
      }
   }

   UpdateComment(last, ageBars, previewLots);

   if(InpAlertOnSetup && newBar && g_workActive && g_workTries <= 1 && g_work.barTime == last.barTime)
   {
      Alert(StringFormat("TRH %s %s SETUP\nENTRY %s\nSL %s\nTP %s",
         last.dir == 1 ? "LONG" : "SHORT",
         TrhModeLabel(last.setupMode),
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits)));
   }
}
//+------------------------------------------------------------------+
