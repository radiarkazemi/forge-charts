//+------------------------------------------------------------------+
//| TRH_AutoTrade.mq5                                                |
//| Smart fill: active setup manager · pullback limits · tick retry  |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "3.30"
#property description "TRH EA v3.30: unified A+B Pine coolOk · catch SWEEPs after FVG"
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
input bool   InpUseSessionFilter  = true;
input int    InpSessionStartHour  = 7;
input int    InpSessionEndHour    = 21;

input group "3) Daily limits"
input bool   InpUseDailyLimits    = true;
input double InpMaxDailyLossPct   = 4.0;
input int    InpMaxDailyTrades    = 8;

input group "4) Break-even"
input bool   InpUseBreakEven      = true;
input double InpBreakEvenAtR      = 0.5;
input double InpBreakEvenLockR    = 0.05;

input group "5) Smart ENTRY fill"
input double InpMarketTolAtr      = 0.25;
input double InpMaxChaseAtr       = 0.40;
input double InpExpireAtR         = 0.90;
input bool   InpUsePullbackLimit  = true;
input bool   InpLimitBeforeEntry  = true;
input bool   InpMarketOnTouch     = true;
input bool   InpCancelRunThrough  = true;
input int    InpAdoptMaxAgeBars   = 8;
input int    InpRetryEveryTicks   = 1;

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
input int    InpMaxFvgBars      = 10;
input double InpMinFvgAtr       = 0.12;
input bool   InpRequireFvgRetest= true;
input int    InpMaxRetestBars   = 8;
input double InpFvgSlExtraAtr   = 0.20;

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
   cfg.requireFvgRetest= InpRequireFvgRetest;
   cfg.maxRetestBars   = InpMaxRetestBars;
   cfg.fvgSlExtraAtr   = InpFvgSlExtraAtr;
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
      return -1;
   }

   if(SetupSlHitBeforeFill(s))
   {
      g_workStatus = "SL hit before fill — abort";
      return -1;
   }
   if(SetupTooDeepToTP(s))
   {
      g_workStatus = "too deep toward TP — abort";
      return -1;
   }

   double lots = CalcLots(entry, sl);
   double marketTol = atrNow * InpMarketTolAtr;
   double maxChase  = atrNow * InpMaxChaseAtr;
   double pastEntry = (s.dir == 1) ? (ask - entry) : (entry - bid);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   string comment = StringFormat("%s %s", TrhModeLabel(s.setupMode), s.dir == 1 ? "LONG" : "SHORT");
   bool ok = false;
   string mode = "";

   bool nearEntry = (MathAbs(pastEntry) <= marketTol);
   bool smallChase = (pastEntry > 0 && pastEntry <= maxChase);
   bool touched = InpMarketOnTouch && BarTouchedEntry(s);

   if(forceMarket || nearEntry || smallChase || touched)
   {
      mode = (s.dir == 1) ? "MARKET BUY" : "MARKET SELL";
      ok = (s.dir == 1)
         ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
         : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
   }
   else if(pastEntry > maxChase)
   {
      // Already past ENTRY toward TP → LIMIT for pullback back to ENTRY
      if(!InpUsePullbackLimit)
      {
         g_workStatus = "past ENTRY, pullback OFF";
         return -1;
      }
      if(s.dir == 1)
      {
         // Long pullback: need BuyLimit below ask
         if(entry >= ask)
         {
            mode = "MARKET BUY (no room for BuyLimit)";
            ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "BUY LIMIT (pullback)";
            ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
      else
      {
         // Short pullback: need SellLimit above bid
         if(entry <= bid)
         {
            mode = "MARKET SELL (no room for SellLimit)";
            ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
         }
         else
         {
            mode = "SELL LIMIT (pullback)";
            ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
   }
   else
   {
      // Still BEFORE ENTRY (price has not reached mid/BE yet) → STOP into ENTRY
      // Long below entry → BuyStop; Short above entry → SellStop
      if(InpLimitBeforeEntry)
      {
         if(s.dir == 1)
         {
            if(entry <= ask)
            {
               mode = "MARKET BUY (at/through ENTRY)";
               ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
            }
            else
            {
               mode = "BUY STOP (wait ENTRY)";
               ok = g_trade.BuyStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
            }
         }
         else
         {
            if(entry >= bid)
            {
               mode = "MARKET SELL (at/through ENTRY)";
               ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
            }
            else
            {
               mode = "SELL STOP (wait ENTRY)";
               ok = g_trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
            }
         }
      }
      else
      {
         mode = (s.dir == 1) ? "MARKET BUY" : "MARKET SELL";
         ok = (s.dir == 1)
            ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
            : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
   }

   g_workTries++;

   if(ok)
   {
      if(CountOurOrders() > 0)
         g_dayTrades++;
      g_workStatus = mode + " OK";
      PrintFormat("TRH %s %s lots=%s E=%s SL=%s TP=%s pastE=%.2f try=%d",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(lots, 2),
         DoubleToString(entry, _Digits),
         DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits),
         pastEntry, g_workTries);
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
            PrintFormat("TRH MARKET FALLBACK OK after limit reject");
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

void ManageBreakEven()
{
   if(!InpUseBreakEven) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      if(entry <= 0) continue;

      double risk = 0;
      if(type == POSITION_TYPE_BUY)
         risk = (sl > 0 && sl < entry) ? (entry - sl) : 0;
      else
         risk = (sl > 0 && sl > entry) ? (sl - entry) : 0;

      if(risk <= 0)
      {
         if(tp > 0)
            risk = MathAbs(tp - entry) / MathMax(InpRiskReward, 0.1);
         else
            continue;
      }

      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double favor = (type == POSITION_TYPE_BUY) ? (bid - entry) : (entry - ask);
      double rNow = favor / risk;
      if(rNow < InpBreakEvenAtR) continue;

      double lock = risk * InpBreakEvenLockR;
      double newSL;
      if(type == POSITION_TYPE_BUY)
      {
         newSL = NormalizeDouble(entry + lock, _Digits);
         if(sl >= newSL) continue;
         if(bid <= newSL) continue;
      }
      else
      {
         newSL = NormalizeDouble(entry - lock, _Digits);
         if(sl <= newSL && sl > 0) continue;
         if(ask >= newSL) continue;
      }

      if(g_trade.PositionModify(ticket, newSL, tp))
         PrintFormat("TRH BE: ticket=%I64u newSL=%s at %.2fR", ticket, DoubleToString(newSL, _Digits), rNow);
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

   Comment(StringFormat(
      "TRH EA v3.30 | %s\nLatest %s %s age=%d\nE %s  SL %s  TP %s\npos=%d pend=%d day=%d lots~%s\n%s",
      InpAutoTrade ? "ON" : "OFF",
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
   if(TRH_ENGINE_VERSION < 228)
   {
      Alert("TRH EA: Engine outdated (v", IntegerToString(TRH_ENGINE_VERSION),
            "). Put NEW TRH_Engine.mqh in the SAME folder as this .mq5 and recompile.");
      return INIT_FAILED;
   }

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   ResetDayIfNeeded();
   g_workActive = false;
   g_workStatus = "boot";

   PrintFormat("TRH AutoTrade v3.30 | mode=A+B | pullback=%s | touchMarket=%s | adoptAge<=%d | workBars=%d | %s %s",
      InpUsePullbackLimit ? "Y" : "N",
      InpMarketOnTouch ? "Y" : "N",
      InpAdoptMaxAgeBars,
      InpPendingExpiryBars,
      _Symbol, EnumToString(_Period));

   Comment("TRH EA v3.30\nA·SWEEP + B·FVG autotrade both\nBTB removed · pullback LIMIT");
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
      Comment(StringFormat("TRH EA v3.30 %s — scanning...\nday %d | %s",
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
      else if(SetupTooDeepToTP(g_work))
      {
         ClearWork("too deep to TP");
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
