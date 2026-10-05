//+------------------------------------------------------------------+
//| LH_AutoTrade.mq5                                                 |
//| Exact Pine parity EA — LH · Liquidity Hunter                     |
//| 1 RAID → 2 CISD → 3 MSS → 4 FVG → ENTRY / SL / TP                 |
//+------------------------------------------------------------------+
#property copyright "LH Liquidity Hunter"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.21"
#property description "LH EA v1.21 fast: O(n) ATR · capped lookback"
#property strict

#include <Trade/Trade.mqh>
#include "LH_Engine.mqh"

#ifndef LH_ENGINE_VERSION
#define LH_ENGINE_VERSION 0
#endif

input group "Trading"
input bool   InpAutoTrade         = true;
input bool   InpAlertOnSetup      = false;
input ulong  InpMagic             = 270827;
input int    InpMaxSlippagePts    = 30;
input int    InpPendingExpiryBars = 40;
input int    InpLookbackBars      = 2500;
input int    InpFreshMaxAgeBars   = 3;
input int    InpMaxOpenTrades     = 1;

input group "Filters"
input bool   InpUseSpreadFilter   = true;
input int    InpMaxSpreadPoints   = 50;
input bool   InpUseSessionFilter  = false; // OFF — match indicator (Pine has no session)
input int    InpSessionStartHour  = 0;
input int    InpSessionEndHour    = 24;
input bool   InpUseDailyLimits    = true;
input double InpMaxDailyLossPct   = 4.0;
input int    InpMaxDailyTrades    = 5;

input group "Break-even"
input bool   InpUseBreakEven      = false;
input double InpBreakEvenAtR      = 1.50;
input double InpBreakEvenLockR    = 0.10;

input group "Chase"
input double InpMarketTolAtr      = 0.15;
input bool   InpFarOpenMarket     = true;

input group "Detection (exact Pine)"
input int    InpPivotPeriod      = 5;
input double InpMinSweepAtr      = 0.08;
input double InpMinDispAtr       = 0.55;
input double InpMinFvgAtr        = 0.12;
input int    InpMaxCisdBars      = 6;
input int    InpMaxStructBars    = 10;
input int    InpMaxFvgBars       = 8;
input bool   InpRequireCisd      = true;
input bool   InpAllowBos         = false;
input bool   InpRequireFvgRetest = true;
input int    InpMaxRetestBars    = 8;
input int    InpCooldownBars     = 50;

input group "Entry / SL / TP (exact Pine)"
input double InpSlPadAtr         = 0.20;
input double InpMinRiskAtr       = 0.35;
input double InpRiskReward       = 2.5;
input bool   InpUseOpposingLiq   = true;
input double InpLiqExtendAtr     = 1.2;
input double InpMinTpR           = 1.5;

input group "Lots"
input bool   InpUseDynamicLots  = true;
input double InpRiskPercent     = 1.0;
input double InpFixedLots       = 0.0;
input double InpMinLots         = 0.0;
input double InpMaxLots         = 0.0;

CTrade   g_trade;
datetime g_lastBarTime   = 0;
datetime g_lastSetupTime = 0;
datetime g_dayStamp      = 0;
double   g_dayStartEquity = 0;
int      g_dayTrades     = 0;

void BuildConfig(LhConfig &cfg)
{
   cfg.pivotPeriod      = InpPivotPeriod;
   cfg.minSweepAtr      = InpMinSweepAtr;
   cfg.minDispAtr       = InpMinDispAtr;
   cfg.minFvgAtr        = InpMinFvgAtr;
   cfg.maxCisdBars      = InpMaxCisdBars;
   cfg.maxStructBars    = InpMaxStructBars;
   cfg.maxFvgBars       = InpMaxFvgBars;
   cfg.requireCisd      = InpRequireCisd;
   cfg.allowBos         = InpAllowBos;
   cfg.requireFvgRetest = InpRequireFvgRetest;
   cfg.maxRetestBars    = InpMaxRetestBars;
   cfg.cooldownBars     = InpCooldownBars;
   cfg.slPadAtr         = InpSlPadAtr;
   cfg.minRiskAtr       = InpMinRiskAtr;
   cfg.riskReward       = InpRiskReward;
   cfg.useOpposingLiq   = InpUseOpposingLiq;
   cfg.liqExtendAtr     = InpLiqExtendAtr;
   cfg.minTpR           = InpMinTpR;
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

bool SpreadOk()
{
   if(!InpUseSpreadFilter) return true;
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   return (spread <= InpMaxSpreadPoints);
}

bool SessionOk()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   if(InpSessionStartHour == InpSessionEndHour) return true;
   if(InpSessionStartHour < InpSessionEndHour)
      return (h >= InpSessionStartHour && h < InpSessionEndHour);
   return (h >= InpSessionStartHour || h < InpSessionEndHour);
}

bool DailyLimitsOk()
{
   if(!InpUseDailyLimits) return true;
   ResetDayIfNeeded();
   if(InpMaxDailyTrades > 0 && g_dayTrades >= InpMaxDailyTrades) return false;
   if(InpMaxDailyLossPct > 0.0 && g_dayStartEquity > 0.0)
   {
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      double lossPct = 100.0 * (g_dayStartEquity - eq) / g_dayStartEquity;
      if(lossPct >= InpMaxDailyLossPct) return false;
   }
   return true;
}

double CalcLots(const double entry, const double sl)
{
   if(InpFixedLots > 0) return InpFixedLots;
   if(!InpUseDynamicLots) return SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = bal * InpRiskPercent / 100.0;
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double volMin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(tickSize <= 0 || tickValue <= 0) return volMin;

   double dist = MathAbs(entry - sl);
   if(dist <= 0) return volMin;
   double ticks = dist / tickSize;
   double lots = riskMoney / (ticks * tickValue);
   if(InpMinLots > 0) lots = MathMax(lots, InpMinLots);
   if(InpMaxLots > 0) lots = MathMin(lots, InpMaxLots);
   lots = MathMax(volMin, MathMin(volMax, lots));
   lots = MathFloor(lots / volStep) * volStep;
   return NormalizeDouble(lots, 2);
}

bool AdjustStops(const int dir, const double entry, double &sl, double &tp)
{
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0) return false;
   double minDist = MathMax(stopsLevel * point, point);

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

bool PlaceSetupTrade(const LhSetup &s, const double atrNow)
{
   if(!InpAutoTrade) return false;
   if(!SpreadOk() || !SessionOk() || !DailyLimitsOk()) return false;
   if(CountOurOrders() >= InpMaxOpenTrades) return false;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl    = NormalizeDouble(s.sl, _Digits);
   double tp    = NormalizeDouble(s.tp, _Digits);
   if(!AdjustStops(s.dir, entry, sl, tp)) return false;

   double fillPx = (s.dir == 1) ? ask : bid;
   double dist = MathAbs(fillPx - entry);
   double nearTol = MathMax(atrNow * InpMarketTolAtr, _Point);
   bool near = (dist <= nearTol);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   string comment = StringFormat("LH %s %s", s.dir == 1 ? "LONG" : "SHORT", s.tag);
   bool ok = false;
   string mode = "";

   if(InpFarOpenMarket && !near)
   {
      double useEntry = NormalizeDouble(fillPx, _Digits);
      double useSL = sl, useTP = tp;
      if(!AdjustStops(s.dir, useEntry, useSL, useTP)) return false;
      if(s.dir == 1 && useSL >= bid) return false;
      if(s.dir == -1 && useSL <= ask) return false;
      double lots = CalcLots(useEntry, useSL);
      mode = (s.dir == 1) ? "MARKET BUY (far)" : "MARKET SELL (far)";
      ok = (s.dir == 1)
         ? g_trade.Buy(lots, _Symbol, 0, useSL, useTP, comment)
         : g_trade.Sell(lots, _Symbol, 0, useSL, useTP, comment);
   }
   else
   {
      double lots = CalcLots(entry, sl);
      if(s.dir == 1)
      {
         if(entry <= ask)
         {
            mode = (ask - entry <= nearTol) ? "MARKET BUY (near)" : "BUY LIMIT @ ENTRY";
            ok = (ask - entry <= nearTol)
               ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
               : g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
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
            mode = (entry - bid <= nearTol) ? "MARKET SELL (near)" : "SELL LIMIT @ ENTRY";
            ok = (entry - bid <= nearTol)
               ? g_trade.Sell(lots, _Symbol, 0, sl, tp, comment)
               : g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else
         {
            mode = "SELL STOP @ ENTRY";
            ok = g_trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
      }
   }

   if(ok)
   {
      g_dayTrades++;
      PrintFormat("LH %s %s E=%s SL=%s TP=%s",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(entry, _Digits),
         DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits));
   }
   else
   {
      PrintFormat("LH ORDER FAIL %s ret=%d %s",
         mode, g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription());
   }
   return ok;
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

      double risk = (type == POSITION_TYPE_BUY)
         ? ((sl > 0 && sl < entry) ? (entry - sl) : 0)
         : ((sl > 0 && sl > entry) ? (sl - entry) : 0);
      if(risk <= 0)
      {
         if(tp > 0) risk = MathAbs(tp - entry) / MathMax(InpRiskReward, 0.1);
         else continue;
      }

      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double favor = (type == POSITION_TYPE_BUY) ? (bid - entry) : (entry - ask);
      if(favor / risk < InpBreakEvenAtR) continue;

      double lock = risk * InpBreakEvenLockR;
      double newSL;
      if(type == POSITION_TYPE_BUY)
      {
         newSL = NormalizeDouble(entry + lock, _Digits);
         if(sl >= newSL || bid <= newSL) continue;
      }
      else
      {
         newSL = NormalizeDouble(entry - lock, _Digits);
         if((sl <= newSL && sl > 0) || ask >= newSL) continue;
      }
      g_trade.PositionModify(ticket, newSL, tp);
   }
}

int OnInit()
{
   if(LH_ENGINE_VERSION < 121)
   {
      Alert("LH EA v1.21: Engine outdated (v", IntegerToString(LH_ENGINE_VERSION),
            "). Copy NEW LH_Engine.mqh into THIS folder and recompile. Need >= 121.");
      return INIT_FAILED;
   }
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   ResetDayIfNeeded();
   PrintFormat("LH AutoTrade v1.21 Eng%d | AutoTrade=%s | %s %s | fast lookback",
      LH_ENGINE_VERSION, InpAutoTrade ? "ON" : "OFF", _Symbol, EnumToString(_Period));
   Comment("LH EA v1.21 Eng" + IntegerToString(LH_ENGINE_VERSION) +
           "\n1 RAID → 2 CISD → 3 MSS → 4 FVG");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { Comment(""); }

void OnTick()
{
   ResetDayIfNeeded();
   ExpireStalePendings();
   ManageBreakEven();

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0) return;
   if(barTime == g_lastBarTime) return;
   g_lastBarTime = barTime;

   int lookback = InpLookbackBars;
   if(lookback < 500) lookback = 500;
   if(lookback > 8000) lookback = 8000;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, 0, lookback, rates);
   if(copied < 120) return;

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

   LhConfig cfg;
   BuildConfig(cfg);
   LhSetup setups[];
   int n = LhScanSetups(copied, t, o, h, l, c, cfg, setups);
   if(n <= 0)
   {
      Comment(StringFormat("LH EA v1.21 %s — scanning...\nday %d",
         InpAutoTrade ? "ON" : "OFF", g_dayTrades));
      return;
   }

   LhSetup last = setups[n - 1];
   int ageBars = (copied >= 2) ? ((copied - 2) - last.barIndex) : 0;
   if(ageBars < 0) ageBars = 0;
   int openNow = CountOurOrders();

   Comment(StringFormat(
      "LH EA v1.21 | %s · %s\nENTRY %s  SL %s  TP %s\nBar %s (age %d) | orders %d\n1 RAID → 2 CISD → 3 %s → 4 FVG",
      last.dir == 1 ? "LONG" : "SHORT", last.tag,
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      ageBars, openNow, last.tag));

   datetime closedBar = (copied >= 2) ? t[copied - 2] : 0;
   if(closedBar == 0 || last.barTime != closedBar) return;
   if(ageBars > InpFreshMaxAgeBars) return;
   if(last.barTime == g_lastSetupTime) return;
   if(openNow > 0) return;

   g_lastSetupTime = last.barTime;

   PrintFormat("LH SETUP %s · %s E=%s SL=%s TP=%s raid=%s",
      last.dir == 1 ? "LONG" : "SHORT", last.tag,
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      DoubleToString(last.raidPx, _Digits));

   if(InpAlertOnSetup)
   {
      Alert(StringFormat("LH %s SETUP · %s\nENTRY %s\nSL %s\nTP %s",
         last.dir == 1 ? "LONG" : "SHORT", last.tag,
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits)));
   }

   if(!InpAutoTrade) return;
   double atrNow = LhCalcATR(copied - 2, h, l, c);
   PlaceSetupTrade(last, atrNow);
}
//+------------------------------------------------------------------+
