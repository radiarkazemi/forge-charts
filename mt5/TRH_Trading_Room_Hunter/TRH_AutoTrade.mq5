//+------------------------------------------------------------------+
//| TRH_AutoTrade.mq5                                                |
//| Classic SWEEP autotrade — same detector as Pine / indicator      |
//| On setup: Buy/Sell LIMIT at ENTRY, or MARKET if price is there   |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "2.00"
#property description "TRH SWEEP EA: limit at ENTRY, or market if already there"
#property strict

#include <Trade/Trade.mqh>
#include "TRH_Engine.mqh"

input group "Trading"
input bool   InpAutoTrade         = true;   // Enable AutoTrade (needs Algo Trading ON)
input bool   InpAlertOnSetup      = true;   // Alert on new setup
input ulong  InpMagic             = 260825; // Magic number
input int    InpMaxSlippagePts    = 30;     // Max slippage (points)
input int    InpPendingExpiryBars = 40;     // Cancel unfilled limit after N bars
input int    InpLookbackBars      = 2000;   // History bars to scan

input group "TRH Detection (= Pine)"
input int    InpPivotPeriod     = 5;      // Pivot Period
input double InpMinContextAtr   = 1.2;    // Min Selloff/Rally Into Sweep (ATR×)
input double InpMinSweepAtr     = 0.05;   // Min Sweep Beyond Pivot (ATR×)
input int    InpBaseConfirmBars = 8;      // Min Base Bars After Sweep
input int    InpMaxBaseBars     = 40;     // Max Bars To Confirm Room
input double InpMinRoomAtr      = 0.8;    // Min Room Width (ATR×)
input double InpMaxRoomAtr      = 3.5;    // Max Room Width (ATR×)
input int    InpCooldownBars    = 50;     // Cooldown Between Setups

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;   // SL Pad (ATR×)
input double InpRiskReward      = 2.4;    // Risk-Reward Ratio
input bool   InpUseLiquidityTP  = true;   // Prefer Opposing Pivot As TP
input double InpMarketTolAtr    = 0.15;   // Market if price within this ATR of ENTRY
input int    InpFreshMaxAgeBars = 3;      // Only trade setups this fresh (bars)

input group "Risk"
input double InpRiskPercent     = 0.5;    // Risk % of equity (if FixedLots=0)
input double InpFixedLots       = 0.0;    // Fixed lots (0 = use risk %)
input int    InpMaxOpenTrades   = 1;      // Max open positions + pendings

CTrade   g_trade;
datetime g_lastBarTime   = 0;
datetime g_lastSetupTime = 0;

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
   double volMin     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double volumeStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(volumeStep <= 0) volumeStep = 0.01;

   double lots;
   if(InpFixedLots > 0.0)
      lots = InpFixedLots;
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

// LONG:  ask near/through ENTRY → MARKET buy, else BUY LIMIT at ENTRY
// SHORT: bid near/through ENTRY → MARKET sell, else SELL LIMIT at ENTRY
bool PlaceSetupTrade(const TrhSetup &s, const double atrNow)
{
   if(!InpAutoTrade)
   {
      Print("TRH: AutoTrade disabled — skip order");
      return false;
   }
   if(CountOurOrders() >= InpMaxOpenTrades)
   {
      Print("TRH: skip — already at MaxOpenTrades");
      return false;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl    = NormalizeDouble(s.sl, _Digits);
   double tp    = NormalizeDouble(s.tp, _Digits);
   if(!AdjustStops(s.dir, entry, sl, tp)) return false;

   double lots = CalcLots(entry, sl);
   double tol  = MathMax(atrNow * InpMarketTolAtr, SymbolInfoDouble(_Symbol, SYMBOL_POINT) * 10.0);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   string comment = StringFormat("TRH %s", s.dir == 1 ? "LONG" : "SHORT");
   bool ok = false;
   string mode = "";

   if(s.dir == 1)
   {
      // Price already at/through mid-room → open now
      if(ask <= entry + tol)
      {
         mode = "MARKET BUY";
         ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
      }
      else
      {
         // Price above ENTRY → wait for pullback with Buy Limit
         mode = "BUY LIMIT";
         ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      }
   }
   else
   {
      if(bid >= entry - tol)
      {
         mode = "MARKET SELL";
         ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      }
      else
      {
         mode = "SELL LIMIT";
         ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      }
   }

   if(ok)
   {
      PrintFormat("TRH %s %s lots=%s E=%s SL=%s TP=%s ask=%s bid=%s",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(lots, 2),
         DoubleToString(entry, _Digits),
         DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits),
         DoubleToString(ask, _Digits),
         DoubleToString(bid, _Digits));
   }
   else
   {
      PrintFormat("TRH ORDER FAIL %s %s ret=%d %s",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         g_trade.ResultRetcode(),
         g_trade.ResultRetcodeDescription());
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
      {
         PrintFormat("TRH: expire pending #%I64u after %d bars", ticket, ageBars);
         g_trade.OrderDelete(ticket);
      }
   }
}

int OnInit()
{
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   PrintFormat("TRH AutoTrade v2 | AutoTrade=%s | %s %s | magic=%I64u",
      InpAutoTrade ? "ON" : "OFF",
      _Symbol, EnumToString(_Period), InpMagic);

   Comment(InpAutoTrade
      ? "TRH EA: AutoTrade ON\nLimit at ENTRY, or market if price is there.\nEnable Algo Trading toolbar button."
      : "TRH EA: AutoTrade OFF — detection only.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

void OnTick()
{
   ExpireStalePendings();

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0) return;

   // New-bar only — same bar-close confirm model as Pine
   if(barTime == g_lastBarTime) return;
   g_lastBarTime = barTime;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, 0, InpLookbackBars, rates);
   if(copied < 120)
   {
      Print("TRH: not enough bars (", copied, ")");
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
   int n = TrhScanSetups(copied, t, o, h, l, c, cfg, setups);

   if(n <= 0)
   {
      Comment(InpAutoTrade ? "TRH EA ON — scanning…" : "TRH EA OFF — scanning…");
      return;
   }

   TrhSetup last = setups[n - 1];
   int ageBars = (copied - 1) - last.barIndex;

   Comment(StringFormat(
      "TRH %s · SWEEP\nENTRY %s\nSL %s\nTP %s\nBar %s (age %d)\nAutoTrade %s | orders %d",
      last.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      ageBars,
      InpAutoTrade ? "ON" : "OFF",
      CountOurOrders()));

   // Only act on a fresh confirm (just closed / current forming bar)
   datetime closedBar = (copied >= 2) ? t[copied - 2] : last.barTime;
   bool isFreshBar = (last.barTime == closedBar || last.barTime == t[copied - 1]);
   if(!isFreshBar) return;
   if(ageBars > InpFreshMaxAgeBars) return;
   if(last.barTime == g_lastSetupTime) return;

   g_lastSetupTime = last.barTime;

   PrintFormat("TRH SETUP %s E=%s SL=%s TP=%s @ %s age=%d",
      last.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      ageBars);

   if(InpAlertOnSetup)
   {
      Alert(StringFormat("TRH %s SETUP\nENTRY %s\nSL %s\nTP %s\nAutoTrade=%s",
         last.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits),
         InpAutoTrade ? "ON" : "OFF"));
   }

   if(!InpAutoTrade) return;

   double atrNow = TrhCalcATR(copied - 1, h, l, c);
   PlaceSetupTrade(last, atrNow);
}
//+------------------------------------------------------------------+
