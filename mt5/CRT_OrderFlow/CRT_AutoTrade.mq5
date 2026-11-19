//+------------------------------------------------------------------+
//| CRT_AutoTrade.mq5                                                |
//| Standalone CRT OrderFlow EA                                      |
//+------------------------------------------------------------------+
#property copyright "CRT OrderFlow"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.00"
#property description "CRT EA: 2+ CRT bias + HTF FVG + entry in AOI"
#property strict

#include <Trade/Trade.mqh>
#include "CRT_Engine.mqh"

#ifndef CRT_ENGINE_VERSION
#define CRT_ENGINE_VERSION 0
#endif

input group "Trading"
input bool   InpAutoTrade         = true;
input bool   InpAlertOnSetup      = false;
input ulong  InpMagic             = 280827;
input int    InpMaxSlippagePts    = 30;
input int    InpPendingExpiryBars = 40;
input int    InpLookbackBars      = 2000;
input int    InpFreshMaxAgeBars   = 3;
input int    InpMaxOpenTrades     = 1;

input group "Filters"
input bool   InpUseSpreadFilter   = true;
input int    InpMaxSpreadPoints   = 50;
input bool   InpUseSessionFilter  = true;
input int    InpSessionStartHour  = 7;
input int    InpSessionEndHour    = 21;
input bool   InpUseDailyLimits    = true;
input double InpMaxDailyLossPct   = 4.0;
input int    InpMaxDailyTrades    = 5;

input group "Break-even"
input bool   InpUseBreakEven      = true;
input double InpBreakEvenAtR      = 1.0;
input double InpBreakEvenLockR    = 0.05;

input group "Chase"
input double InpMarketTolAtr      = 0.15;
input double InpMaxChaseAtr       = 0.40;
input bool   InpAllowLimitAlways  = true;

input group "CRT Model"
input int    InpRcLookback       = 8;
input double InpMinSweepAtr      = 0.02;
input bool   InpRequireCloseBack = true;
input int    InpMinBiasModels    = 2;
input int    InpBiasLookbackBars = 80;
input int    InpCooldownBars     = 15;

input group "HTF FVG"
input ENUM_TIMEFRAMES InpHtf     = PERIOD_M15;
input double InpMinHtfFvgAtr     = 0.08;
input bool   InpRequireHtfFvg    = true;
input bool   InpEntryInsideFvg   = true;
input int    InpHtfBars          = 500;

input group "Entry / SL / TP"
input double InpSlPadAtr         = 0.06;
input double InpRiskReward       = 2.5;
input bool   InpUseStructureTp   = true;

input group "Lots"
input bool   InpUseDynamicLots  = true;
input double InpRiskPercent     = 1.0;
input double InpFixedLots       = 0.0;

CTrade g_trade;
datetime g_lastBarTime = 0, g_lastSetupTime = 0, g_dayStamp = 0;
double g_dayStartEquity = 0;
int g_dayTrades = 0;

void BuildConfig(CrtConfig &cfg)
{
   CrtDefaultConfig(cfg);
   cfg.rcLookback = InpRcLookback;
   cfg.minSweepAtr = InpMinSweepAtr;
   cfg.requireCloseBack = InpRequireCloseBack;
   cfg.minBiasModels = InpMinBiasModels;
   cfg.biasLookbackBars = InpBiasLookbackBars;
   cfg.htf = InpHtf;
   cfg.minHtfFvgAtr = InpMinHtfFvgAtr;
   cfg.requireHtfFvg = InpRequireHtfFvg;
   cfg.entryInsideFvg = InpEntryInsideFvg;
   cfg.slPadAtr = InpSlPadAtr;
   cfg.riskReward = InpRiskReward;
   cfg.useStructureTp = InpUseStructureTp;
   cfg.cooldownBars = InpCooldownBars;
}

void ResetDayIfNeeded()
{
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
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
   return SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) <= InpMaxSpreadPoints;
}

bool SessionOk()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   if(InpSessionStartHour == InpSessionEndHour) return true;
   if(InpSessionStartHour < InpSessionEndHour)
      return (h >= InpSessionStartHour && h < InpSessionEndHour);
   return (h >= InpSessionStartHour || h < InpSessionEndHour);
}

bool DailyOk()
{
   if(!InpUseDailyLimits) return true;
   ResetDayIfNeeded();
   if(InpMaxDailyTrades > 0 && g_dayTrades >= InpMaxDailyTrades) return false;
   if(InpMaxDailyLossPct > 0 && g_dayStartEquity > 0)
   {
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      if(100.0 * (g_dayStartEquity - eq) / g_dayStartEquity >= InpMaxDailyLossPct)
         return false;
   }
   return true;
}

double CalcLots(double entry, double sl)
{
   if(InpFixedLots > 0) return InpFixedLots;
   double volMin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   if(!InpUseDynamicLots) return volMin;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = bal * InpRiskPercent / 100.0;
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double volMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double dist = MathAbs(entry - sl);
   if(tickSize <= 0 || tickValue <= 0 || dist <= 0) return volMin;
   double lots = riskMoney / ((dist / tickSize) * tickValue);
   lots = MathMax(volMin, MathMin(volMax, lots));
   lots = MathFloor(lots / volStep) * volStep;
   return NormalizeDouble(lots, 2);
}

bool AdjustStops(int dir, double entry, double &sl, double &tp)
{
   long stops = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0) return false;
   double minDist = MathMax(stops * point, point);
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

bool PlaceTrade(const CrtSetup &s, double atrNow)
{
   if(!InpAutoTrade || !SpreadOk() || !SessionOk() || !DailyOk()) return false;
   if(CountOurOrders() >= InpMaxOpenTrades) return false;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl = NormalizeDouble(s.sl, _Digits);
   double tp = NormalizeDouble(s.tp, _Digits);
   if(!AdjustStops(s.dir, entry, sl, tp)) return false;
   double lots = CalcLots(entry, sl);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double tol = MathMax(atrNow * InpMarketTolAtr, point * 10);
   double maxChase = atrNow * InpMaxChaseAtr;
   string comment = StringFormat("CRT %s", s.dir == 1 ? "LONG" : "SHORT");
   bool ok = false;

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   if(s.dir == 1)
   {
      double past = ask - entry;
      if(ask <= entry + tol)
      {
         if(past > maxChase && maxChase > 0)
         {
            if(!InpAllowLimitAlways) return false;
            ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
      }
      else ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   else
   {
      double past = entry - bid;
      if(bid >= entry - tol)
      {
         if(past > maxChase && maxChase > 0)
         {
            if(!InpAllowLimitAlways) return false;
            ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
         }
         else ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   if(ok) { g_dayTrades++; PrintFormat("CRT order ok lots=%s E=%s", DoubleToString(lots, 2), DoubleToString(entry, _Digits)); }
   else PrintFormat("CRT order fail %d %s", g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription());
   return ok;
}

void ExpirePendings()
{
   if(InpPendingExpiryBars <= 0) return;
   int sec = PeriodSeconds(_Period);
   if(sec <= 0) return;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      int age = (int)((TimeCurrent() - (datetime)OrderGetInteger(ORDER_TIME_SETUP)) / sec);
      if(age >= InpPendingExpiryBars) g_trade.OrderDelete(ticket);
   }
}

void ManageBE()
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
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double risk = 0;
      if(type == POSITION_TYPE_BUY) risk = (sl > 0 && sl < entry) ? entry - sl : 0;
      else risk = (sl > 0 && sl > entry) ? sl - entry : 0;
      if(risk <= 0)
      {
         if(tp > 0) risk = MathAbs(tp - entry) / MathMax(InpRiskReward, 0.1);
         else continue;
      }
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double fav = (type == POSITION_TYPE_BUY) ? (bid - entry) : (entry - ask);
      if(fav / risk < InpBreakEvenAtR) continue;
      double lock = risk * InpBreakEvenLockR;
      double newSL = (type == POSITION_TYPE_BUY) ? NormalizeDouble(entry + lock, _Digits)
                                                 : NormalizeDouble(entry - lock, _Digits);
      if(type == POSITION_TYPE_BUY && (sl >= newSL || bid <= newSL)) continue;
      if(type == POSITION_TYPE_SELL && ((sl <= newSL && sl > 0) || ask >= newSL)) continue;
      g_trade.PositionModify(ticket, newSL, tp);
   }
}

int OnInit()
{
   if(CRT_ENGINE_VERSION < 100)
   {
      Alert("CRT EA: put CRT_Engine.mqh next to this file and recompile.");
      return INIT_FAILED;
   }
   g_trade.SetExpertMagicNumber(InpMagic);
   ResetDayIfNeeded();
   Comment("CRT OrderFlow EA v1.00\n2+ CRT bias + HTF FVG AOI");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { Comment(""); }

void OnTick()
{
   ResetDayIfNeeded();
   ExpirePendings();
   ManageBE();

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0 || barTime == g_lastBarTime) return;
   g_lastBarTime = barTime;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, 0, InpLookbackBars, rates);
   if(copied < 120) return;

   datetime t[]; double o[], h[], l[], c[];
   ArrayResize(t, copied); ArrayResize(o, copied); ArrayResize(h, copied);
   ArrayResize(l, copied); ArrayResize(c, copied);
   for(int i = 0; i < copied; i++)
   {
      t[i] = rates[i].time; o[i] = rates[i].open; h[i] = rates[i].high;
      l[i] = rates[i].low; c[i] = rates[i].close;
   }

   CrtConfig cfg; BuildConfig(cfg);
   datetime ht[]; double ho[], hh[], hl[], hc[];
   CrtFvg fvgs[];
   int nFvg = 0;
   if(CrtCopyHtf(_Symbol, InpHtf, InpHtfBars, ht, ho, hh, hl, hc))
      nFvg = CrtScanHtfFvgs(ArraySize(ht), ht, hh, hl, hc, cfg, fvgs);

   CrtSetup setups[];
   int n = CrtScanSetups(copied, t, o, h, l, c, cfg, fvgs, nFvg, setups);
   if(n <= 0)
   {
      Comment(StringFormat("CRT EA %s scanning... day %d", InpAutoTrade ? "ON" : "OFF", g_dayTrades));
      return;
   }

   CrtSetup last = setups[n - 1];
   int age = (copied >= 2) ? ((copied - 2) - last.barIndex) : 0;
   if(age < 0) age = 0;
   Comment(StringFormat("CRT %s bias x%d\nE %s SL %s TP %s\nage %d orders %d",
      last.dir == 1 ? "LONG" : "SHORT", last.biasCount,
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      age, CountOurOrders()));

   datetime closedBar = (copied >= 2) ? t[copied - 2] : 0;
   if(closedBar == 0 || last.barTime != closedBar) return;
   if(age > InpFreshMaxAgeBars) return;
   if(last.barTime == g_lastSetupTime) return;
   if(CountOurOrders() > 0) return;

   g_lastSetupTime = last.barTime;
   if(InpAlertOnSetup)
      Alert(StringFormat("CRT %s SETUP\nENTRY %s\nSL %s\nTP %s",
         last.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits)));

   if(!InpAutoTrade) return;
   PlaceTrade(last, CrtATR(copied - 2, h, l, c));
}
//+------------------------------------------------------------------+
