//+------------------------------------------------------------------+
//| NabzRisk.mqh — risk → lot sizing + manage automations            |
//+------------------------------------------------------------------+
#ifndef NABZ_RISK_MQH
#define NABZ_RISK_MQH

#include <NABZ_Quantum/NabzTheme.mqh>

struct NabzRiskState
{
   ENUM_NABZ_RISK_MODE mode;
   double              value;
   double              defaultRR;
   bool                autoRR;
   bool                autoRiskFree;      // legacy on/off
   int                 autoRiskFreeAt;    // 0=OFF 1=R1 2=R2 3=R3
   bool                autoSaveProfit;
   double              partialR[3];       // R multiples for levels
   double              partialClose[3];   // fraction to close at that R
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
   s.autoRiskFreeAt = 0; // OFF — set to 1/2/3 for R1/R2/R3
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
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   if(bal <= 0.0) bal = AccountInfoDouble(ACCOUNT_EQUITY);
   if(bal <= 0.0) return 0.0;
   return profitMoney / bal * 100.0;
}

// Current open R-multiple vs SL distance (positive when in profit direction)
double NabzPositionOpenR(const ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return 0.0;
   double open = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl   = PositionGetDouble(POSITION_SL);
   if(sl <= 0.0) return 0.0;
   double risk = MathAbs(open - sl);
   if(risk <= 0.0) return 0.0;
   long type = PositionGetInteger(POSITION_TYPE);
   string sym = PositionGetString(POSITION_SYMBOL);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double px = (type == POSITION_TYPE_BUY) ? bid : ask;
   double move = (type == POSITION_TYPE_BUY) ? (px - open) : (open - px);
   return move / risk;
}

#endif
//+------------------------------------------------------------------+
