//+------------------------------------------------------------------+
//| NabzProp.mqh — prop-firm style live analysis                     |
//+------------------------------------------------------------------+
#ifndef NABZ_PROP_MQH
#define NABZ_PROP_MQH

struct NabzPropConfig
{
   double maxTotalDD;    // % hard limit display
   double maxDailyDD;    // %
   double profitTarget;  // % from start balance
   double startBalance;  // challenge start (0 = use current as baseline)
};

struct NabzPropSnapshot
{
   double totalDD;       // % from peak equity or start
   double dailyDD;       // % from day start equity
   double targetPct;     // current progress toward target
   double floatingRisk;  // open risk % of equity
   double peakEquity;
   double dayStartEquity;
   datetime dayStamp;
};

void NabzPropDefaults(NabzPropConfig &c)
{
   c.maxTotalDD = 10.0;
   c.maxDailyDD = 5.0;
   c.profitTarget = 8.0;
   c.startBalance = 0.0;
}

void NabzPropResetDay(NabzPropSnapshot &s)
{
   s.dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   s.dayStamp = StructToTime(dt);
}

void NabzPropInit(NabzPropConfig &c, NabzPropSnapshot &s)
{
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   if(c.startBalance <= 0.0)
      c.startBalance = bal;
   s.peakEquity = MathMax(eq, c.startBalance);
   s.totalDD = 0.0;
   s.dailyDD = 0.0;
   s.targetPct = 0.0;
   s.floatingRisk = 0.0;
   NabzPropResetDay(s);
}

void NabzPropUpdate(const NabzPropConfig &c, NabzPropSnapshot &s)
{
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq > s.peakEquity)
      s.peakEquity = eq;

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime today = StructToTime(dt);
   if(today != s.dayStamp)
      NabzPropResetDay(s);

   // Total DD from peak
   if(s.peakEquity > 0.0)
      s.totalDD = MathMax(0.0, (s.peakEquity - eq) / s.peakEquity * 100.0);

   // Daily DD from day-start equity
   if(s.dayStartEquity > 0.0)
      s.dailyDD = MathMax(0.0, (s.dayStartEquity - eq) / s.dayStartEquity * 100.0);

   // Target progress from start balance
   if(c.startBalance > 0.0 && c.profitTarget > 0.0)
   {
      double gainPct = (eq - c.startBalance) / c.startBalance * 100.0;
      s.targetPct = MathMax(0.0, MathMin(100.0, gainPct / c.profitTarget * 100.0));
   }

   // Floating risk = sum of open SL risk
   double riskMoney = 0.0;
   for(int i = 0; i < PositionsTotal(); ++i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double vol = PositionGetDouble(POSITION_VOLUME);
      if(sl <= 0.0) continue;
      double dist = MathAbs(open - sl);
      double tickSize  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      if(tickSize <= 0.0) continue;
      riskMoney += vol * dist * (tickValue / tickSize);
   }
   if(eq > 0.0)
      s.floatingRisk = riskMoney / eq * 100.0;
   else
      s.floatingRisk = 0.0;
}

#endif
//+------------------------------------------------------------------+
