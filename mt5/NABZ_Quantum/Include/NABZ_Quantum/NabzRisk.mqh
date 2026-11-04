//+------------------------------------------------------------------+
//| NabzRisk.mqh — risk → lot sizing                                 |
//+------------------------------------------------------------------+
#ifndef NABZ_RISK_MQH
#define NABZ_RISK_MQH

#include <NABZ_Quantum/NabzTheme.mqh>

struct NabzRiskState
{
   ENUM_NABZ_RISK_MODE mode;
   double              value;       // user risk input
   double              defaultRR;   // take-profit R multiple
   bool                autoRR;
   bool                autoRiskFree;
   bool                autoSaveProfit;
   double              partialR[3];
   double              partialClose[3]; // 0..1 fraction
   ENUM_NABZ_DETAIL_UNIT detailUnit;
   bool                blockM1;
   bool                pauseAfterLoss;
   bool                showCandleTimer;
   bool                showRRLive;
   bool                showTpSlDetail;
};

void NabzRiskDefaults(NabzRiskState &s)
{
   s.mode = NABZ_RISK_PCT;
   s.value = 0.50;
   s.defaultRR = 2.0;
   s.autoRR = true;
   s.autoRiskFree = false;
   s.autoSaveProfit = false;
   s.partialR[0] = 1.0; s.partialClose[0] = 0.25;
   s.partialR[1] = 2.0; s.partialClose[1] = 0.50;
   s.partialR[2] = 3.0; s.partialClose[2] = 0.75;
   s.detailUnit = NABZ_UNIT_PERCENT;
   s.blockM1 = true;
   s.pauseAfterLoss = false;
   s.showCandleTimer = true;
   s.showRRLive = true;
   s.showTpSlDetail = true;
}

double NabzNormalizeLot(const string symbol, double lots)
{
   double minLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step    = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step + 1e-9) * step;
   if(lots < minLot) lots = minLot;
   if(lots > maxLot) lots = maxLot;
   int digits = 0;
   double s = step;
   while(s < 1.0 - 1e-9 && digits < 8) { s *= 10.0; digits++; }
   return NormalizeDouble(lots, digits);
}

double NabzMoneyPerLotPerPrice(const string symbol)
{
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0)
      return 0.0;
   return tickValue / tickSize;
}

double NabzRiskMoney(const NabzRiskState &s)
{
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   switch(s.mode)
   {
      case NABZ_RISK_PCT: return equity  * s.value / 100.0;
      case NABZ_RISK_BAL: return balance * s.value / 100.0;
      case NABZ_RISK_USD: return s.value;
      case NABZ_RISK_LOT: return 0.0;
   }
   return 0.0;
}

double NabzCalcLots(const NabzRiskState &s, const string symbol, const double entry, const double sl)
{
   if(s.mode == NABZ_RISK_LOT)
      return NabzNormalizeLot(symbol, s.value);

   double riskMoney = NabzRiskMoney(s);
   if(riskMoney <= 0.0)
      return NabzNormalizeLot(symbol, SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN));

   double dist = MathAbs(entry - sl);
   if(dist <= 0.0)
      return NabzNormalizeLot(symbol, SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN));

   double mpp = NabzMoneyPerLotPerPrice(symbol);
   if(mpp <= 0.0)
      return NabzNormalizeLot(symbol, SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN));

   double lots = riskMoney / (dist * mpp);
   return NabzNormalizeLot(symbol, lots);
}

double NabzPositionRiskPct(const string symbol, const double volume, const double entry, const double sl)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity <= 0.0) return 0.0;
   double dist = MathAbs(entry - sl);
   if(dist <= 0.0) return 0.0;
   double mpp = NabzMoneyPerLotPerPrice(symbol);
   if(mpp <= 0.0) return 0.0;
   return (volume * dist * mpp) / equity * 100.0;
}

double NabzProfitPct(const double profitMoney)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity <= 0.0) return 0.0;
   // approximate vs balance for display stability
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   if(bal <= 0.0) bal = equity;
   return profitMoney / bal * 100.0;
}

#endif
//+------------------------------------------------------------------+
