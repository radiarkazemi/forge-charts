//+------------------------------------------------------------------+
//| NabzTrade.mqh — execution helpers                                |
//+------------------------------------------------------------------+
#ifndef NABZ_TRADE_MQH
#define NABZ_TRADE_MQH

#include <Trade/Trade.mqh>
#include <NABZ_Quantum/NabzRisk.mqh>

CTrade g_nabzTrade;

struct NabzDragPlan
{
   bool     active;
   bool     isBuy;
   double   entry;
   double   sl;
   double   tp;
};

bool NabzFillingOk(ENUM_ORDER_TYPE_FILLING &fill)
{
   uint modes = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((modes & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC) { fill = ORDER_FILLING_IOC; return true; }
   if((modes & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK) { fill = ORDER_FILLING_FOK; return true; }
   fill = ORDER_FILLING_RETURN;
   return true;
}

void NabzTradeInit(const ulong magic, const int deviation)
{
   g_nabzTrade.SetExpertMagicNumber(magic);
   g_nabzTrade.SetDeviationInPoints(deviation);
   ENUM_ORDER_TYPE_FILLING fill;
   NabzFillingOk(fill);
   g_nabzTrade.SetTypeFilling(fill);
}

bool NabzMarketOrder(const bool isBuy, const NabzRiskState &risk, const double slPrice, const double tpPrice)
{
   if(risk.blockM1 && PeriodSeconds(_Period) == 60)
   {
      Alert("NABZ: trading blocked on M1");
      return false;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = isBuy ? ask : bid;
   double sl = slPrice;
   double tp = tpPrice;

   if(sl <= 0.0)
   {
      // default SL ~ 0.5% of price if none set
      double pad = entry * 0.005;
      sl = isBuy ? entry - pad : entry + pad;
   }
   if(risk.autoRR && tp <= 0.0 && sl > 0.0)
   {
      double r = MathAbs(entry - sl);
      tp = isBuy ? entry + r * risk.defaultRR : entry - r * risk.defaultRR;
   }

   double lots = NabzCalcLots(risk, _Symbol, entry, sl);
   ENUM_ORDER_TYPE_FILLING fill;
   NabzFillingOk(fill);
   g_nabzTrade.SetTypeFilling(fill);

   bool ok = isBuy
      ? g_nabzTrade.Buy(lots, _Symbol, 0.0, sl, tp, "NABZ")
      : g_nabzTrade.Sell(lots, _Symbol, 0.0, sl, tp, "NABZ");

   if(!ok)
      Print("NABZ order fail: ", g_nabzTrade.ResultRetcode(), " ", g_nabzTrade.ResultRetcodeDescription());
   return ok;
}

bool NabzPendingOrder(const bool isBuy, const NabzRiskState &risk,
                      const double entry, const double sl, const double tp)
{
   if(risk.blockM1 && PeriodSeconds(_Period) == 60)
   {
      Alert("NABZ: trading blocked on M1");
      return false;
   }

   double price = entry;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double lots = NabzCalcLots(risk, _Symbol, price, sl);

   ENUM_ORDER_TYPE_FILLING fill;
   NabzFillingOk(fill);
   g_nabzTrade.SetTypeFilling(fill);

   bool ok = false;
   if(isBuy)
   {
      if(price >= ask)
         ok = g_nabzTrade.BuyStop(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NABZ-P");
      else
         ok = g_nabzTrade.BuyLimit(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NABZ-P");
   }
   else
   {
      if(price <= bid)
         ok = g_nabzTrade.SellStop(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NABZ-P");
      else
         ok = g_nabzTrade.SellLimit(lots, price, _Symbol, sl, tp, ORDER_TIME_GTC, 0, "NABZ-P");
   }
   return ok;
}

int NabzCloseAll(const string symbolFilter = "")
{
   int closed = 0;
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(symbolFilter != "" && PositionGetString(POSITION_SYMBOL) != symbolFilter) continue;
      if(g_nabzTrade.PositionClose(ticket))
         closed++;
   }
   return closed;
}

int NabzCancelPendings(const string symbolFilter = "")
{
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; --i)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(symbolFilter != "" && OrderGetString(ORDER_SYMBOL) != symbolFilter) continue;
      if(g_nabzTrade.OrderDelete(ticket))
         n++;
   }
   return n;
}

bool NabzRiskFreePosition(const ulong ticket, const double bePadPoints = 2.0)
{
   if(!PositionSelectByTicket(ticket)) return false;
   double open = PositionGetDouble(POSITION_PRICE_OPEN);
   long type = PositionGetInteger(POSITION_TYPE);
   double point = SymbolInfoDouble(PositionGetString(POSITION_SYMBOL), SYMBOL_POINT);
   double pad = bePadPoints * point;
   double newSL = (type == POSITION_TYPE_BUY) ? open + pad : open - pad;
   double tp = PositionGetDouble(POSITION_TP);
   return g_nabzTrade.PositionModify(ticket, newSL, tp);
}

int NabzRiskFreeAll(const string symbolFilter = "")
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(symbolFilter != "" && PositionGetString(POSITION_SYMBOL) != symbolFilter) continue;
      double profit = PositionGetDouble(POSITION_PROFIT);
      if(profit <= 0) continue;
      if(NabzRiskFreePosition(ticket)) n++;
   }
   return n;
}

void NabzInitDrag(NabzDragPlan &d, const bool isBuy)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double mid = (ask + bid) * 0.5;
   double atr = 0.0;
   int h = iATR(_Symbol, PERIOD_CURRENT, 14);
   if(h != INVALID_HANDLE)
   {
      double buf[];
      if(CopyBuffer(h, 0, 0, 1, buf) > 0)
         atr = buf[0];
      IndicatorRelease(h);
   }
   if(atr <= 0.0) atr = mid * 0.003;

   d.active = true;
   d.isBuy = isBuy;
   d.entry = mid;
   d.sl = isBuy ? mid - atr : mid + atr;
   d.tp = isBuy ? mid + atr * 2.0 : mid - atr * 2.0;
}

#endif
//+------------------------------------------------------------------+
