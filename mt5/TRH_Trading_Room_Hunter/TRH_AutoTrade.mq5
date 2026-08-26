//+------------------------------------------------------------------+
//| TRH_AutoTrade.mq5                                                |
//| Classic SWEEP EA — same detector as indicator / TradingView Pine |
//| AutoTrade is OFF by default. Validate levels vs TV first.        |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>
#include "TRH_Engine.mqh"

input group "⚠ Safety"
input bool   InpAutoTrade       = false;  // Enable live trading (OFF until validated)
input bool   InpAlertOnSetup    = true;   // Alert when setup fires (even if AutoTrade OFF)
input ulong  InpMagic           = 260825; // Magic number
input int    InpMaxSlippagePts  = 30;     // Max slippage (points)
input int    InpPendingExpiryBars = 40;   // Cancel pending after N bars

input group "TRH Detection (match Pine / indicator)"
input int    InpPivotPeriod     = 5;
input double InpMinContextAtr   = 1.2;
input double InpMinSweepAtr     = 0.05;
input int    InpBaseConfirmBars = 8;
input int    InpMaxBaseBars     = 40;
input double InpMinRoomAtr      = 0.8;
input double InpMaxRoomAtr      = 3.5;
input int    InpCooldownBars    = 50;

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;
input double InpRiskReward      = 2.4;
input bool   InpUseLiquidityTP  = true;
input double InpMarketTolAtr    = 0.15;   // Market fill if price within this ATR of ENTRY

input group "Risk"
input double InpRiskPercent     = 0.5;    // Risk % of equity per trade
input double InpFixedLots       = 0.0;    // Fixed lots (0 = use risk %)
input int    InpMaxOpenTrades   = 1;      // Max concurrent TRH positions/orders

CTrade   g_trade;
datetime g_lastBarTime   = 0;
datetime g_lastSetupTime = 0;
datetime g_pendingPlaced = 0;

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
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      n++;
   }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      n++;
   }
   return n;
}

void CancelOurPendings()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(!OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      g_trade.OrderDelete(ticket);
   }
}

double CalcLots(const double entry, const double sl)
{
   if(InpFixedLots > 0.0)
      return InpFixedLots;

   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * (InpRiskPercent / 100.0);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double volumeStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double volMin    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);

   if(tickSize <= 0 || tickValue <= 0) return volMin;

   double dist = MathAbs(entry - sl);
   if(dist <= 0) return volMin;

   double ticks = dist / tickSize;
   double lots  = riskMoney / (ticks * tickValue);
   lots = MathFloor(lots / volumeStep) * volumeStep;
   if(lots < volMin) lots = volMin;
   if(lots > volMax) lots = volMax;
   return NormalizeDouble(lots, 2);
}

bool PlaceSetupTrade(const TrhSetup &s, const double atrNow)
{
   if(CountOurOrders() >= InpMaxOpenTrades)
   {
      Print("TRH: skip trade — already at MaxOpenTrades");
      return false;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl    = NormalizeDouble(s.sl, _Digits);
   double tp    = NormalizeDouble(s.tp, _Digits);
   double lots  = CalcLots(entry, sl);
   double tol   = atrNow * InpMarketTolAtr;

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   string comment = StringFormat("TRH %s", s.dir == 1 ? "LONG" : "SHORT");
   bool ok = false;

   if(s.dir == 1)
   {
      // Near entry → market buy; otherwise buy limit at mid-room
      if(ask <= entry + tol)
         ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
      else if(ask > entry)
         ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      else
         ok = g_trade.BuyStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   else
   {
      if(bid >= entry - tol)
         ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      else if(bid < entry)
         ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
      else
         ok = g_trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }

   if(ok)
   {
      g_pendingPlaced = TimeCurrent();
      PrintFormat("TRH ORDER %s lots=%.2f E=%.2f SL=%.2f TP=%.2f ret=%d",
         s.dir == 1 ? "LONG" : "SHORT", lots, entry, sl, tp, g_trade.ResultRetcode());
   }
   else
   {
      PrintFormat("TRH ORDER FAIL %s ret=%d %s",
         s.dir == 1 ? "LONG" : "SHORT",
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
      if(ticket == 0) continue;
      if(!OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;

      datetime setup = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      int ageBars = (int)((TimeCurrent() - setup) / periodSec);
      if(ageBars >= InpPendingExpiryBars)
      {
         PrintFormat("TRH: expire pending #%d after %d bars", ticket, ageBars);
         g_trade.OrderDelete(ticket);
      }
   }
}

int OnInit()
{
   g_trade.SetExpertMagicNumber(InpMagic);
   PrintFormat("TRH AutoTrade EA init | AutoTrade=%s | symbol=%s tf=%s",
      InpAutoTrade ? "ON" : "OFF (validate first)",
      _Symbol, EnumToString(_Period));
   if(!InpAutoTrade)
      Comment("TRH EA: AutoTrade OFF — detection only. Match ENTRY/SL/TP vs TradingView, then enable.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

void OnTick()
{
   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0) return;

   ExpireStalePendings();

   // New-bar only (setup confirmation is bar-close model, same as Pine)
   if(barTime == g_lastBarTime) return;
   g_lastBarTime = barTime;

   MqlRates rates[];
   int copied = CopyRates(_Symbol, _Period, 0, 2000, rates);
   if(copied < 120)
   {
      Print("TRH: not enough bars (", copied, ")");
      return;
   }

   // CopyRates returns oldest→newest when ArraySetAsSeries is false
   ArraySetAsSeries(rates, false);

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
      Comment(InpAutoTrade
         ? "TRH EA: AutoTrade ON — scanning…"
         : "TRH EA: AutoTrade OFF — scanning…");
      return;
   }

   TrhSetup last = setups[n - 1];
   string status = StringFormat(
      "TRH %s · SWEEP\nENTRY %s\nSL %s\nTP %s\nBar %s\nAutoTrade %s",
      last.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      InpAutoTrade ? "ON" : "OFF");
   Comment(status);

   // Fire only when the newest setup is on the bar that just closed
   // (index copied-2 is previous completed bar after new bar opens)
   datetime closedBar = (copied >= 2) ? t[copied - 2] : last.barTime;
   bool isFresh = (last.barTime == closedBar || last.barTime == t[copied - 1]);

   if(!isFresh || last.barTime == g_lastSetupTime)
      return;

   g_lastSetupTime = last.barTime;

   PrintFormat("TRH SETUP %s E=%.2f SL=%.2f TP=%.2f @ %s",
      last.dir == 1 ? "LONG" : "SHORT",
      last.entry, last.sl, last.tp,
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES));

   if(InpAlertOnSetup)
   {
      Alert(StringFormat("TRH %s SETUP\nENTRY %s\nSL %s\nTP %s\nAutoTrade=%s",
         last.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits),
         InpAutoTrade ? "ON" : "OFF"));
   }

   if(!InpAutoTrade)
   {
      Print("TRH: AutoTrade OFF — would have traded this setup. Enable after TV match.");
      return;
   }

   double atrNow = TrhCalcATR(copied - 1, h, l, c);
   PlaceSetupTrade(last, atrNow);
}
//+------------------------------------------------------------------+
