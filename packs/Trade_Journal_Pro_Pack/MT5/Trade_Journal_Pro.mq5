//+------------------------------------------------------------------+
//| Trade_Journal_Pro.mq5                                            |
//| Watches your trades and builds a professional day/week/month    |
//| trading journal with entry context + SL/TP exit analysis.       |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.00"
#property description "Professional trade journal EA — daily / weekly / monthly reports"

#include <Trade/Trade.mqh>

//--- Inputs
input string InpFolder          = "TradeJournal";   // Report folder (under MQL5/Files)
input bool   InpOnlyThisSymbol  = false;            // Journal only chart symbol
input bool   InpOnlyThisMagic   = false;            // Filter by magic
input long   InpMagic           = 0;                // Magic number (if filter on)
input bool   InpMarkChart       = true;             // Draw entry/exit markers on chart
input bool   InpAutoDayReport   = true;             // Auto HTML report at day end
input int    InpDayEndHour      = 23;               // Day-end hour (broker time)
input int    InpDayEndMinute    = 55;               // Day-end minute
input bool   InpAlsoWeekMonth   = true;             // Build week + month rollups
input int    InpAsiaStart       = 19;               // Asia start hour (broker)
input int    InpLonStart        = 3;                // London start
input int    InpNyStart         = 8;                // New York start
input int    InpNyEnd           = 17;               // New York end
input int    InpSwingLookback   = 20;               // Swing lookback bars for context
input int    InpAtrPeriod       = 14;               // ATR period
input string InpTraderName      = "Trader";         // Name on report cover
input bool   InpWriteCsv        = true;             // Also write CSV rows
input bool   InpVerboseLog      = true;             // Print journal events to Experts

//--- Constants
#define TJ_MAX 512
#define TJ_PREFIX "TJPRO_"

//--- Trade record
struct TradeRec
{
   ulong    ticket;       // position identifier / deal pair key
   ulong    dealIn;
   ulong    dealOut;
   string   symbol;
   int      type;         // 0 buy, 1 sell
   double   volume;
   double   priceOpen;
   double   priceClose;
   double   sl;
   double   tp;
   double   profit;
   double   commission;
   double   swap;
   datetime timeOpen;
   datetime timeClose;
   string   comment;
   string   session;
   string   trendBias;    // BULL / BEAR / RANGE
   string   structureNote;
   string   triggerNote;
   string   exitReason;   // TP / SL / MANUAL / STOPOUT / OTHER
   string   exitWhy;
   double   atr;
   double   spreadPts;
   double   plannedR;
   double   realizedR;
   double   mfePts;       // best excursion (approx from deals only = 0 if unknown)
   double   maePts;
   bool     closed;
   bool     used;
};

TradeRec g_tr[TJ_MAX];
int      g_n = 0;
datetime g_lastDayStamp = 0;
bool     g_dayReportDone = false;

void InitRec(TradeRec &t)
{
   t.ticket = 0;
   t.dealIn = 0;
   t.dealOut = 0;
   t.symbol = "";
   t.type = 0;
   t.volume = 0;
   t.priceOpen = 0;
   t.priceClose = 0;
   t.sl = 0;
   t.tp = 0;
   t.profit = 0;
   t.commission = 0;
   t.swap = 0;
   t.timeOpen = 0;
   t.timeClose = 0;
   t.comment = "";
   t.session = "";
   t.trendBias = "";
   t.structureNote = "";
   t.triggerNote = "";
   t.exitReason = "";
   t.exitWhy = "";
   t.atr = 0;
   t.spreadPts = 0;
   t.plannedR = 0;
   t.realizedR = 0;
   t.mfePts = 0;
   t.maePts = 0;
   t.closed = false;
   t.used = false;
}

//+------------------------------------------------------------------+
int OnInit()
{
   Print("Trade Journal Pro started → folder: ", InpFolder);
   FolderEnsure();
   LoadOpenPositionsSnapshot();
   EventSetTimer(30);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(InpMarkChart)
      ObjectsDeleteAll(0, TJ_PREFIX);
}

void OnTimer()
{
   CheckDayEnd();
}

void OnTick()
{
   // light — heavy work on trade events / timer
}

//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   const ulong deal = trans.deal;
   if(deal == 0 || !HistoryDealSelect(deal))
      return;

   if(!DealPassesFilter(deal))
      return;

   const long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
   if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
      HandleDealIn(deal);
   if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
      HandleDealOut(deal);
}

//+------------------------------------------------------------------+
bool DealPassesFilter(const ulong deal)
{
   const string sym = HistoryDealGetString(deal, DEAL_SYMBOL);
   if(InpOnlyThisSymbol && sym != _Symbol)
      return false;
   if(InpOnlyThisMagic)
   {
      const long mag = HistoryDealGetInteger(deal, DEAL_MAGIC);
      if(mag != InpMagic)
         return false;
   }
   const long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);
   if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
      return false;
   return true;
}

//+------------------------------------------------------------------+
void HandleDealIn(const ulong deal)
{
   const ulong posId = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   if(FindByPosId(posId) >= 0)
      return; // already tracked

   const int idx = AllocSlot();
   if(idx < 0)
      return;

   TradeRec t;
   InitRec(t);
   t.used = true;
   t.closed = false;
   t.ticket = posId;
   t.dealIn = deal;
   t.symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
   const long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);
   t.type = (dtype == DEAL_TYPE_BUY ? 0 : 1);
   t.volume = HistoryDealGetDouble(deal, DEAL_VOLUME);
   t.priceOpen = HistoryDealGetDouble(deal, DEAL_PRICE);
   t.timeOpen = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
   t.comment = HistoryDealGetString(deal, DEAL_COMMENT);
   t.commission = HistoryDealGetDouble(deal, DEAL_COMMISSION);
   t.sl = 0;
   t.tp = 0;

   // SL/TP from position if still open
   if(PositionSelectByTicket(posId))
   {
      t.sl = PositionGetDouble(POSITION_SL);
      t.tp = PositionGetDouble(POSITION_TP);
   }
   else
   {
      // try from order history comment/levels later
      t.sl = 0;
      t.tp = 0;
   }

   FillEntryContext(t);
   g_tr[idx] = t;

   if(InpVerboseLog)
      PrintFormat("TJ IN  #%I64u %s %s @ %.5f  SL=%.5f TP=%.5f  [%s | %s]",
                  posId, t.symbol, (t.type == 0 ? "BUY" : "SELL"),
                  t.priceOpen, t.sl, t.tp, t.session, t.trendBias);

   if(InpMarkChart)
      MarkEntry(t);

   AppendMasterCsv(t, false);
}

//+------------------------------------------------------------------+
void HandleDealOut(const ulong deal)
{
   const ulong posId = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   int idx = FindByPosId(posId);
   if(idx < 0)
   {
      // late attach — reconstruct minimal from history
      ReconstructClosed(deal);
      idx = FindByPosId(posId);
      if(idx < 0)
         return;
   }

   TradeRec t = g_tr[idx];
   t.dealOut = deal;
   t.priceClose = HistoryDealGetDouble(deal, DEAL_PRICE);
   t.timeClose = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
   t.profit += HistoryDealGetDouble(deal, DEAL_PROFIT);
   t.swap += HistoryDealGetDouble(deal, DEAL_SWAP);
   t.commission += HistoryDealGetDouble(deal, DEAL_COMMISSION);
   t.closed = true;

   // refresh SL/TP if we missed them
   if(t.sl == 0 || t.tp == 0)
      GuessSlTpFromHistory(t);

   ClassifyExit(t);
   ComputeR(t);
   g_tr[idx] = t;

   if(InpVerboseLog)
      PrintFormat("TJ OUT #%I64u %s  P/L=%.2f  %s | %s",
                  posId, t.symbol, t.profit + t.swap + t.commission,
                  t.exitReason, t.exitWhy);

   if(InpMarkChart)
      MarkExit(t);

   AppendMasterCsv(t, true);
}

//+------------------------------------------------------------------+
void ReconstructClosed(const ulong dealOut)
{
   const ulong posId = (ulong)HistoryDealGetInteger(dealOut, DEAL_POSITION_ID);
   if(!HistorySelectByPosition(posId))
      return;

   datetime tOpen = 0;
   double pOpen = 0, vol = 0, comm = 0;
   string sym = "";
   int typ = 0;
   ulong dealIn = 0;
   string cmt = "";

   const int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      const ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      const long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN)
      {
         dealIn = d;
         tOpen = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         pOpen = HistoryDealGetDouble(d, DEAL_PRICE);
         vol = HistoryDealGetDouble(d, DEAL_VOLUME);
         sym = HistoryDealGetString(d, DEAL_SYMBOL);
         cmt = HistoryDealGetString(d, DEAL_COMMENT);
         typ = (HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY ? 0 : 1);
         comm += HistoryDealGetDouble(d, DEAL_COMMISSION);
      }
   }
   if(dealIn == 0)
      return;

   const int idx = AllocSlot();
   if(idx < 0)
      return;

   TradeRec t;
   InitRec(t);
   t.used = true;
   t.closed = false;
   t.ticket = posId;
   t.dealIn = dealIn;
   t.symbol = sym;
   t.type = typ;
   t.volume = vol;
   t.priceOpen = pOpen;
   t.timeOpen = tOpen;
   t.comment = cmt;
   t.commission = comm;
   FillEntryContext(t);
   g_tr[idx] = t;
}

//+------------------------------------------------------------------+
void GuessSlTpFromHistory(TradeRec &t)
{
   // Best-effort: use current symbol digits; leave 0 if unknown
   // (MT5 does not always store SL/TP on deals)
}

//+------------------------------------------------------------------+
void FillEntryContext(TradeRec &t)
{
   t.session = SessionName(t.timeOpen);
   t.atr = AtrValue(t.symbol, PERIOD_CURRENT, InpAtrPeriod);
   t.spreadPts = (double)SymbolInfoInteger(t.symbol, SYMBOL_SPREAD);

   // Trend bias via EMA20/EMA50 on chart TF at open time
   const int sh = iBarShift(t.symbol, PERIOD_CURRENT, t.timeOpen, false);
   const int shift = (sh < 0 ? 0 : sh);
   const double emaF = EmaAt(t.symbol, PERIOD_CURRENT, 20, shift);
   const double emaS = EmaAt(t.symbol, PERIOD_CURRENT, 50, shift);
   const double px = t.priceOpen;
   if(emaF > emaS && px >= emaF)
      t.trendBias = "BULL";
   else if(emaF < emaS && px <= emaF)
      t.trendBias = "BEAR";
   else
      t.trendBias = "RANGE";

   // Structure: relative to recent swing
   double swingHi = 0, swingLo = 0;
   Swings(t.symbol, PERIOD_CURRENT, shift, InpSwingLookback, swingHi, swingLo);
   const double pt = SymbolInfoDouble(t.symbol, SYMBOL_POINT);
   string near = "";
   if(swingHi > 0 && MathAbs(swingHi - px) / pt < 150)
      near = StringFormat("near swing high %.5f", swingHi);
   else if(swingLo > 0 && MathAbs(px - swingLo) / pt < 150)
      near = StringFormat("near swing low %.5f", swingLo);
   else
      near = StringFormat("mid-range (H %.5f / L %.5f)", swingHi, swingLo);

   t.structureNote = StringFormat("%s structure, %s", t.trendBias, near);

   // Trigger note — candle character at entry bar
   const double o = iOpen(t.symbol, PERIOD_CURRENT, shift);
   const double h = iHigh(t.symbol, PERIOD_CURRENT, shift);
   const double l = iLow(t.symbol, PERIOD_CURRENT, shift);
   const double c = iClose(t.symbol, PERIOD_CURRENT, shift);
   const bool bullish = c > o;
   const double body = MathAbs(c - o);
   const double range = MathMax(h - l, pt);
   const double bodyPct = 100.0 * body / range;
   string candle = (bullish ? "bullish" : "bearish");
   if(bodyPct > 60)
      candle += " impulse candle";
   else if(bodyPct < 25)
      candle += " doji/indecision";
   else
      candle += " continuation candle";

   if(t.type == 0)
      t.triggerNote = StringFormat("BUY trigger: %s during %s session; price reacted while bias=%s. Comment: %s",
                                   candle, t.session, t.trendBias, (t.comment == "" ? "(none)" : t.comment));
   else
      t.triggerNote = StringFormat("SELL trigger: %s during %s session; price reacted while bias=%s. Comment: %s",
                                   candle, t.session, t.trendBias, (t.comment == "" ? "(none)" : t.comment));

   // Planned R
   if(t.sl > 0)
   {
      const double risk = MathAbs(t.priceOpen - t.sl);
      if(risk > 0 && t.tp > 0)
         t.plannedR = MathAbs(t.tp - t.priceOpen) / risk;
      else
         t.plannedR = 0;
   }
}

//+------------------------------------------------------------------+
void ClassifyExit(TradeRec &t)
{
   long reason = 0;
   if(HistoryDealSelect(t.dealOut))
      reason = HistoryDealGetInteger(t.dealOut, DEAL_REASON);

   const double pt = SymbolInfoDouble(t.symbol, SYMBOL_POINT);
   const double tol = pt * 30; // tolerance for SL/TP touch

   bool nearSl = (t.sl > 0 && MathAbs(t.priceClose - t.sl) <= tol);
   bool nearTp = (t.tp > 0 && MathAbs(t.priceClose - t.tp) <= tol);

   if(reason == DEAL_REASON_SL || nearSl)
   {
      t.exitReason = "SL";
      if(t.type == 0)
         t.exitWhy = StringFormat("Stop loss hit at %.5f. Buy thesis invalidated — price traded through protective SL (structure/volatility against the long).", t.priceClose);
      else
         t.exitWhy = StringFormat("Stop loss hit at %.5f. Sell thesis invalidated — price traded through protective SL (structure/volatility against the short).", t.priceClose);
   }
   else if(reason == DEAL_REASON_TP || nearTp)
   {
      t.exitReason = "TP";
      t.exitWhy = StringFormat("Take profit filled at %.5f. Target reached as planned (RR≈%.2fR). Entry idea played out.", t.priceClose, t.plannedR);
   }
   else if(reason == DEAL_REASON_SO)
   {
      t.exitReason = "STOPOUT";
      t.exitWhy = "Broker stop-out / margin call closed the position — risk size or equity was insufficient.";
   }
   else if(reason == DEAL_REASON_CLIENT || reason == DEAL_REASON_MOBILE || reason == DEAL_REASON_WEB)
   {
      t.exitReason = "MANUAL";
      if(t.profit >= 0)
         t.exitWhy = StringFormat("Manual close in profit at %.5f. You banked the trade before TP/SL.", t.priceClose);
      else
         t.exitWhy = StringFormat("Manual close in loss at %.5f. You cut the trade before SL — review if early exit was discipline or fear.", t.priceClose);
   }
   else
   {
      t.exitReason = "OTHER";
      t.exitWhy = StringFormat("Closed at %.5f (deal reason code %d).", t.priceClose, (int)reason);
   }

   // Enrich with session of exit
   t.exitWhy += " Exit session: " + SessionName(t.timeClose) + ".";
}

//+------------------------------------------------------------------+
void ComputeR(TradeRec &t)
{
   if(t.sl > 0)
   {
      const double risk = MathAbs(t.priceOpen - t.sl);
      if(risk > 0)
      {
         double move = (t.type == 0 ? (t.priceClose - t.priceOpen) : (t.priceOpen - t.priceClose));
         t.realizedR = move / risk;
      }
   }
   else
      t.realizedR = 0;
}

//+------------------------------------------------------------------+
// Context helpers
//+------------------------------------------------------------------+
string SessionName(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   const int h = dt.hour;
   // NY-style windows on broker clock (same defaults as Session Daylight)
   bool asia = (h >= InpAsiaStart || h < InpLonStart);
   bool lon  = (h >= InpLonStart && h < InpNyEnd);
   bool ny   = (h >= InpNyStart && h < InpNyEnd);
   if(lon && ny)
      return "LONDON×NY";
   if(ny)
      return "NEW YORK";
   if(lon)
      return "LONDON";
   if(asia)
      return "ASIA";
   return "OFF";
}

double AtrValue(const string sym, const ENUM_TIMEFRAMES tf, const int period)
{
   const int h = iATR(sym, tf, period);
   if(h == INVALID_HANDLE)
      return 0;
   double buf[];
   ArraySetAsSeries(buf, true);
   double v = 0;
   if(CopyBuffer(h, 0, 0, 1, buf) == 1)
      v = buf[0];
   IndicatorRelease(h);
   return v;
}

double EmaAt(const string sym, const ENUM_TIMEFRAMES tf, const int period, const int shift)
{
   const int h = iMA(sym, tf, period, 0, MODE_EMA, PRICE_CLOSE);
   if(h == INVALID_HANDLE)
      return 0;
   double buf[];
   ArraySetAsSeries(buf, true);
   double v = 0;
   if(CopyBuffer(h, 0, shift, 1, buf) == 1)
      v = buf[0];
   IndicatorRelease(h);
   return v;
}

void Swings(const string sym, const ENUM_TIMEFRAMES tf, const int shift,
            const int lookback, double &hi, double &lo)
{
   hi = 0;
   lo = 0;
   for(int i = shift; i < shift + lookback; i++)
   {
      const double h = iHigh(sym, tf, i);
      const double l = iLow(sym, tf, i);
      if(h <= 0 || l <= 0)
         continue;
      if(hi == 0 || h > hi)
         hi = h;
      if(lo == 0 || l < lo)
         lo = l;
   }
}

//+------------------------------------------------------------------+
// Storage helpers
//+------------------------------------------------------------------+
int AllocSlot()
{
   for(int i = 0; i < g_n; i++)
      if(!g_tr[i].used)
         return i;
   if(g_n < TJ_MAX)
   {
      g_n++;
      return g_n - 1;
   }
   return -1;
}

int FindByPosId(const ulong posId)
{
   for(int i = 0; i < g_n; i++)
      if(g_tr[i].used && g_tr[i].ticket == posId)
         return i;
   return -1;
}

void FolderEnsure()
{
   FolderCreate(InpFolder, 0);
}

string DayKey(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);
}

string PathHtml(const string key)  { return InpFolder + "\\" + key + ".html"; }
string PathCsv(const string key)   { return InpFolder + "\\" + key + ".csv"; }
string PathMaster()                { return InpFolder + "\\trades_master.csv"; }

//+------------------------------------------------------------------+
void AppendMasterCsv(const TradeRec &t, const bool isClose)
{
   if(!InpWriteCsv)
      return;
   FolderEnsure();
   const bool exists = FileIsExist(PathMaster(), 0);
   const int fh = FileOpen(PathMaster(), FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_SHARE_READ|FILE_SHARE_WRITE, ',');
   if(fh == INVALID_HANDLE)
      return;
   FileSeek(fh, 0, SEEK_END);
   if(!exists || FileSize(fh) == 0)
   {
      FileWrite(fh, "event","pos_id","symbol","side","volume","open_time","open_price","sl","tp",
                "close_time","close_price","profit","commission","swap","session","trend",
                "structure","trigger","exit_reason","exit_why","planned_R","realized_R","comment");
   }
   FileWrite(fh,
             (isClose ? "CLOSE" : "OPEN"),
             (long)t.ticket,
             t.symbol,
             (t.type == 0 ? "BUY" : "SELL"),
             t.volume,
             TimeToString(t.timeOpen, TIME_DATE|TIME_SECONDS),
             t.priceOpen,
             t.sl,
             t.tp,
             (t.closed ? TimeToString(t.timeClose, TIME_DATE|TIME_SECONDS) : ""),
             (t.closed ? t.priceClose : 0.0),
             (t.closed ? t.profit + t.swap + t.commission : 0.0),
             t.commission,
             t.swap,
             t.session,
             t.trendBias,
             t.structureNote,
             t.triggerNote,
             t.exitReason,
             t.exitWhy,
             t.plannedR,
             t.realizedR,
             t.comment);
   FileClose(fh);
}

//+------------------------------------------------------------------+
void LoadOpenPositionsSnapshot()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      const ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(InpOnlyThisSymbol && PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;
      if(InpOnlyThisMagic && PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(FindByPosId(ticket) >= 0)
         continue;

      const int idx = AllocSlot();
      if(idx < 0)
         continue;

      TradeRec t;
      InitRec(t);
      t.used = true;
      t.closed = false;
      t.ticket = ticket;
      t.symbol = PositionGetString(POSITION_SYMBOL);
      t.type = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 0 : 1);
      t.volume = PositionGetDouble(POSITION_VOLUME);
      t.priceOpen = PositionGetDouble(POSITION_PRICE_OPEN);
      t.sl = PositionGetDouble(POSITION_SL);
      t.tp = PositionGetDouble(POSITION_TP);
      t.timeOpen = (datetime)PositionGetInteger(POSITION_TIME);
      t.comment = PositionGetString(POSITION_COMMENT);
      FillEntryContext(t);
      g_tr[idx] = t;
      if(InpMarkChart)
         MarkEntry(t);
   }
}

//+------------------------------------------------------------------+
// Chart markers
//+------------------------------------------------------------------+
void MarkEntry(const TradeRec &t)
{
   if(t.symbol != _Symbol)
      return;
   const string name = TJ_PREFIX + "IN_" + IntegerToString((long)t.ticket);
   ObjectDelete(0, name);
   ObjectCreate(0, name, OBJ_ARROW, 0, t.timeOpen, t.priceOpen);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, (t.type == 0 ? 233 : 234));
   ObjectSetInteger(0, name, OBJPROP_COLOR, (t.type == 0 ? clrDodgerBlue : clrOrangeRed));
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   const string lab = TJ_PREFIX + "INL_" + IntegerToString((long)t.ticket);
   ObjectDelete(0, lab);
   ObjectCreate(0, lab, OBJ_TEXT, 0, t.timeOpen, t.priceOpen);
   ObjectSetString(0, lab, OBJPROP_TEXT, (t.type == 0 ? "BUY" : "SELL") + " #" + IntegerToString((long)t.ticket));
   ObjectSetInteger(0, lab, OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, lab, OBJPROP_FONT, "Consolas");
}

void MarkExit(const TradeRec &t)
{
   if(t.symbol != _Symbol)
      return;
   const string name = TJ_PREFIX + "OUT_" + IntegerToString((long)t.ticket);
   ObjectDelete(0, name);
   ObjectCreate(0, name, OBJ_ARROW, 0, t.timeClose, t.priceClose);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, 251);
   ObjectSetInteger(0, name, OBJPROP_COLOR, (t.exitReason == "TP" ? clrLime : (t.exitReason == "SL" ? clrRed : clrGold)));
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   const string lab = TJ_PREFIX + "OUTL_" + IntegerToString((long)t.ticket);
   ObjectDelete(0, lab);
   ObjectCreate(0, lab, OBJ_TEXT, 0, t.timeClose, t.priceClose);
   ObjectSetString(0, lab, OBJPROP_TEXT, t.exitReason + "  " + DoubleToString(t.profit + t.swap + t.commission, 2));
   ObjectSetInteger(0, lab, OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, lab, OBJPROP_FONT, "Consolas");
}

//+------------------------------------------------------------------+
// Day end + reports
//+------------------------------------------------------------------+
void CheckDayEnd()
{
   if(!InpAutoDayReport)
      return;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   const string today = DayKey(TimeCurrent());
   if(g_lastDayStamp == 0)
      g_lastDayStamp = StringToTime(today);

   // New calendar day → finalize previous
   const datetime dayStart = StringToTime(today);
   if(dayStart > g_lastDayStamp)
   {
      BuildReportsForDay(DayKey(g_lastDayStamp));
      g_lastDayStamp = dayStart;
      g_dayReportDone = false;
   }

   if(!g_dayReportDone && (dt.hour > InpDayEndHour || (dt.hour == InpDayEndHour && dt.min >= InpDayEndMinute)))
   {
      BuildReportsForDay(today);
      g_dayReportDone = true;
   }
}

void BuildReportsForDay(const string dayKey)
{
   // Pull closed deals for that day from history (authoritative)
   TradeRec list[];
   int n = CollectDayTrades(dayKey, list);
   WriteDayHtml(dayKey, list, n);
   if(InpWriteCsv)
      WriteDayCsv(dayKey, list, n);
   if(InpAlsoWeekMonth)
   {
      WriteWeekHtml(dayKey);
      WriteMonthHtml(dayKey);
   }
   Print("Trade Journal Pro: report written → Files\\", InpFolder, "\\", dayKey, ".html  (", n, " trades)");
}

// Collect from account history for the day (so restart-safe)
int CollectDayTrades(const string dayKey, TradeRec &list[])
{
   ArrayResize(list, 0);
   const datetime from = StringToTime(dayKey);
   const datetime to = from + 24 * 3600 - 1;
   if(!HistorySelect(from - 7 * 24 * 3600, to)) // look back a week for opens
      return 0;

   // Map position id → aggregate
   ulong posIds[];
   ArrayResize(posIds, 0);

   const int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
   {
      const ulong d = HistoryDealGetTicket(i);
      if(d == 0 || !DealPassesFilter(d))
         continue;
      if(HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_OUT &&
         HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_OUT_BY)
         continue;
      const datetime tc = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      if(tc < from || tc > to)
         continue;
      const ulong posId = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
      const int sz = ArraySize(posIds);
      ArrayResize(posIds, sz + 1);
      posIds[sz] = posId;
   }

   for(int p = 0; p < ArraySize(posIds); p++)
   {
      TradeRec t;
      if(!BuildRecFromPositionHistory(posIds[p], t))
         continue;
      // prefer in-memory richer context if available
      const int mem = FindByPosId(posIds[p]);
      if(mem >= 0 && g_tr[mem].triggerNote != "")
      {
         t.session = g_tr[mem].session;
         t.trendBias = g_tr[mem].trendBias;
         t.structureNote = g_tr[mem].structureNote;
         t.triggerNote = g_tr[mem].triggerNote;
         t.sl = (g_tr[mem].sl > 0 ? g_tr[mem].sl : t.sl);
         t.tp = (g_tr[mem].tp > 0 ? g_tr[mem].tp : t.tp);
         t.plannedR = g_tr[mem].plannedR;
         if(t.exitReason == "" || t.exitReason == "OTHER")
         {
            ClassifyExit(t);
            ComputeR(t);
         }
      }
      else
      {
         FillEntryContext(t);
         ClassifyExit(t);
         ComputeR(t);
      }
      const int n = ArraySize(list);
      ArrayResize(list, n + 1);
      list[n] = t;
   }
   return ArraySize(list);
}

bool BuildRecFromPositionHistory(const ulong posId, TradeRec &t)
{
   InitRec(t);
   if(!HistorySelectByPosition(posId))
      return false;
   t.used = true;
   t.ticket = posId;
   t.closed = true;
   const int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      const ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      const long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN)
      {
         t.dealIn = d;
         t.symbol = HistoryDealGetString(d, DEAL_SYMBOL);
         t.type = (HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY ? 0 : 1);
         t.volume = HistoryDealGetDouble(d, DEAL_VOLUME);
         t.priceOpen = HistoryDealGetDouble(d, DEAL_PRICE);
         t.timeOpen = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         t.comment = HistoryDealGetString(d, DEAL_COMMENT);
         t.commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      }
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
      {
         t.dealOut = d;
         t.priceClose = HistoryDealGetDouble(d, DEAL_PRICE);
         t.timeClose = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
         t.profit += HistoryDealGetDouble(d, DEAL_PROFIT);
         t.swap += HistoryDealGetDouble(d, DEAL_SWAP);
         t.commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      }
   }
   // SL/TP from memory if any; else 0
   const int mem = FindByPosId(posId);
   if(mem >= 0)
   {
      t.sl = g_tr[mem].sl;
      t.tp = g_tr[mem].tp;
   }
   return (t.dealIn != 0 && t.dealOut != 0);
}

//+------------------------------------------------------------------+
// HTML writers
//+------------------------------------------------------------------+
string HEsc(string s)
{
   StringReplace(s, "&", "&amp;");
   StringReplace(s, "<", "&lt;");
   StringReplace(s, ">", "&gt;");
   StringReplace(s, "\"", "&quot;");
   return s;
}

string MoneyClass(const double v) { return (v >= 0 ? "win" : "loss"); }

void StatsFromList(const TradeRec &list[], const int n,
                   int &wins, int &losses, double &net, double &grossWin, double &grossLoss, double &sumR)
{
   wins = losses = 0;
   net = grossWin = grossLoss = sumR = 0;
   for(int i = 0; i < n; i++)
   {
      const double p = list[i].profit + list[i].swap + list[i].commission;
      net += p;
      sumR += list[i].realizedR;
      if(p >= 0)
      {
         wins++;
         grossWin += p;
      }
      else
      {
         losses++;
         grossLoss += -p;
      }
   }
}

void WriteDayHtml(const string dayKey, const TradeRec &list[], const int n)
{
   FolderEnsure();
   const int fh = FileOpen(PathHtml(dayKey), FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   // Prefer terminal Files; fallback without COMMON
   int f = fh;
   if(f == INVALID_HANDLE)
      f = FileOpen(PathHtml(dayKey), FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(f == INVALID_HANDLE)
   {
      Print("TJ: cannot write HTML, error ", GetLastError());
      return;
   }

   int wins, losses;
   double net, gw, gl, sumR;
   StatsFromList(list, n, wins, losses, net, gw, gl, sumR);
   const double wr = (n > 0 ? 100.0 * wins / n : 0);
   const double pf = (gl > 0 ? gw / gl : (gw > 0 ? 999 : 0));
   const double avgR = (n > 0 ? sumR / n : 0);

   FileWriteString(f,
      "<!DOCTYPE html><html><head><meta charset='utf-8'>"
      "<title>Trade Journal — " + dayKey + "</title><style>"
      "body{font-family:Segoe UI,Arial,sans-serif;background:#0b1220;color:#e5eef7;margin:0;padding:24px;}"
      "h1,h2,h3{margin:0 0 8px 0;} .muted{color:#94a3b8;} .card{background:#121a27;border:1px solid #243044;border-radius:10px;padding:16px;margin:12px 0;}"
      ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;}"
      ".stat{background:#0f1724;border:1px solid #243044;border-radius:8px;padding:12px;} .stat b{display:block;font-size:20px;margin-top:4px;}"
      ".win{color:#34d399;} .loss{color:#f87171;} .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#1e293b;font-size:12px;margin-right:6px;}"
      "table{width:100%;border-collapse:collapse;margin-top:8px;} th,td{border-bottom:1px solid #243044;padding:8px;text-align:left;font-size:13px;vertical-align:top;}"
      "th{color:#94a3b8;font-weight:600;} .section{margin-top:28px;}"
      "</style></head><body>");

   FileWriteString(f, "<h1>Trade Journal Pro</h1>");
   FileWriteString(f, "<p class='muted'>" + HEsc(InpTraderName) + " · Daily report · " + dayKey +
                      " · Account " + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + "</p>");

   FileWriteString(f, "<div class='grid'>"
      "<div class='stat'>Trades<b>" + IntegerToString(n) + "</b></div>"
      "<div class='stat'>Win rate<b>" + DoubleToString(wr, 1) + "%</b></div>"
      "<div class='stat'>Net P/L<b class='" + MoneyClass(net) + "'>" + DoubleToString(net, 2) + "</b></div>"
      "<div class='stat'>Profit factor<b>" + DoubleToString(pf, 2) + "</b></div>"
      "<div class='stat'>Avg R<b class='" + MoneyClass(avgR) + "'>" + DoubleToString(avgR, 2) + "R</b></div>"
      "<div class='stat'>Wins / Losses<b>" + IntegerToString(wins) + " / " + IntegerToString(losses) + "</b></div>"
      "</div>");

   FileWriteString(f, "<div class='section'><h2>Day narrative</h2><div class='card'>");
   if(n == 0)
      FileWriteString(f, "<p class='muted'>No closed trades this day. Discipline is also a result.</p>");
   else
   {
      FileWriteString(f, "<p>You closed <b>" + IntegerToString(n) + "</b> trades with net <b class='" + MoneyClass(net) + "'>" +
                         DoubleToString(net, 2) + "</b>. Win rate <b>" + DoubleToString(wr, 1) +
                         "%</b>, average realized R <b>" + DoubleToString(avgR, 2) + "R</b>.</p>");
      FileWriteString(f, "<p class='muted'>Each card below reconstructs what the chart looked like at entry (session, trend bias, structure) and explains why the trade exited via SL, TP, or manual close.</p>");
   }
   FileWriteString(f, "</div></div>");

   FileWriteString(f, "<div class='section'><h2>Trades</h2>");
   for(int i = 0; i < n; i++)
   {
      const TradeRec t = list[i];
      const double pnl = t.profit + t.swap + t.commission;
      FileWriteString(f, "<div class='card'>");
      FileWriteString(f, "<h3>#" + IntegerToString((long)t.ticket) + " · " + HEsc(t.symbol) + " · " +
                         (t.type == 0 ? "BUY" : "SELL") + " · <span class='" + MoneyClass(pnl) + "'>" +
                         DoubleToString(pnl, 2) + "</span></h3>");
      FileWriteString(f, "<p>"
         "<span class='pill'>" + HEsc(t.session) + "</span>"
         "<span class='pill'>" + HEsc(t.trendBias) + "</span>"
         "<span class='pill'>" + HEsc(t.exitReason) + "</span>"
         "<span class='pill'>" + DoubleToString(t.realizedR, 2) + "R</span>"
         "</p>");
      FileWriteString(f, "<table>"
         "<tr><th>Open</th><td>" + TimeToString(t.timeOpen, TIME_DATE|TIME_SECONDS) + " @ " + DoubleToString(t.priceOpen, (int)SymbolInfoInteger(t.symbol, SYMBOL_DIGITS)) + "</td>"
         "<th>Close</th><td>" + TimeToString(t.timeClose, TIME_DATE|TIME_SECONDS) + " @ " + DoubleToString(t.priceClose, (int)SymbolInfoInteger(t.symbol, SYMBOL_DIGITS)) + "</td></tr>"
         "<tr><th>SL / TP</th><td>" + DoubleToString(t.sl, (int)SymbolInfoInteger(t.symbol, SYMBOL_DIGITS)) + " / " + DoubleToString(t.tp, (int)SymbolInfoInteger(t.symbol, SYMBOL_DIGITS)) +
         "</td><th>Planned RR</th><td>" + DoubleToString(t.plannedR, 2) + "R</td></tr>"
         "<tr><th>Volume</th><td>" + DoubleToString(t.volume, 2) + "</td><th>Comment</th><td>" + HEsc(t.comment) + "</td></tr>"
         "</table>");

      FileWriteString(f, "<h3 style='margin-top:14px;font-size:14px;color:#94a3b8;'>What you saw (chart analysis)</h3>");
      FileWriteString(f, "<p>" + HEsc(t.structureNote) + "</p>");
      FileWriteString(f, "<p>" + HEsc(t.triggerNote) + "</p>");

      FileWriteString(f, "<h3 style='margin-top:14px;font-size:14px;color:#94a3b8;'>Why it exited</h3>");
      FileWriteString(f, "<p>" + HEsc(t.exitWhy) + "</p>");
      FileWriteString(f, "</div>");
   }
   FileWriteString(f, "</div>");

   FileWriteString(f, "<div class='section'><h2>Coaching notes</h2><div class='card'>");
   FileWriteString(f, CoachingHtml(list, n, wins, losses, net, avgR));
   FileWriteString(f, "</div></div>");

   FileWriteString(f, "<p class='muted' style='margin-top:24px;'>Generated by Trade Journal Pro · Forge Charts</p>");
   FileWriteString(f, "</body></html>");
   FileClose(f);
}

string CoachingHtml(const TradeRec &list[], const int n, const int wins, const int losses,
                    const double net, const double avgR)
{
   if(n == 0)
      return "<p>No trades — good if the day had no A+ setup.</p>";

   int slN = 0, tpN = 0, manN = 0;
   int asia = 0, lon = 0, ny = 0;
   for(int i = 0; i < n; i++)
   {
      if(list[i].exitReason == "SL") slN++;
      else if(list[i].exitReason == "TP") tpN++;
      else if(list[i].exitReason == "MANUAL") manN++;
      if(StringFind(list[i].session, "ASIA") >= 0) asia++;
      if(StringFind(list[i].session, "LONDON") >= 0) lon++;
      if(StringFind(list[i].session, "NEW YORK") >= 0 || StringFind(list[i].session, "NY") >= 0) ny++;
   }

   string s = "<ul>";
   s += "<li>Exits: <b>" + IntegerToString(tpN) + "</b> TP · <b>" + IntegerToString(slN) + "</b> SL · <b>" + IntegerToString(manN) + "</b> manual.</li>";
   s += "<li>Session mix: Asia " + IntegerToString(asia) + ", London " + IntegerToString(lon) + ", New York " + IntegerToString(ny) + ".</li>";
   if(avgR < 0)
      s += "<li>Average R is negative — tighten entry criteria or cut size on RANGE bias days.</li>";
   else
      s += "<li>Average R is positive — protect process; avoid revenge size after winners.</li>";
   if(slN > tpN && n >= 3)
      s += "<li>More SLs than TPs today — review whether SL placement was inside noise or thesis was late.</li>";
   if(manN > 0 && net < 0)
      s += "<li>Manual losers present — check if you cut winners too early or held losers emotionally.</li>";
   s += "<li>Tip: put your setup name in the order <b>comment</b> (e.g. TRH-SWEEP, OB-RETEST) — the journal will quote it in the trigger section.</li>";
   s += "</ul>";
   return s;
}

void WriteDayCsv(const string dayKey, const TradeRec &list[], const int n)
{
   const int f = FileOpen(PathCsv(dayKey), FILE_WRITE|FILE_CSV|FILE_ANSI, ',');
   if(f == INVALID_HANDLE)
      return;
   FileWrite(f, "pos_id","symbol","side","volume","open_time","open","sl","tp","close_time","close",
             "pnl","session","trend","structure","trigger","exit_reason","exit_why","planned_R","realized_R","comment");
   for(int i = 0; i < n; i++)
   {
      const TradeRec t = list[i];
      FileWrite(f, (long)t.ticket, t.symbol, (t.type == 0 ? "BUY" : "SELL"), t.volume,
                TimeToString(t.timeOpen, TIME_DATE|TIME_SECONDS), t.priceOpen, t.sl, t.tp,
                TimeToString(t.timeClose, TIME_DATE|TIME_SECONDS), t.priceClose,
                t.profit + t.swap + t.commission, t.session, t.trendBias, t.structureNote,
                t.triggerNote, t.exitReason, t.exitWhy, t.plannedR, t.realizedR, t.comment);
   }
   FileClose(f);
}

//+------------------------------------------------------------------+
void WriteWeekHtml(const string dayKey)
{
   // Aggregate last 7 calendar days including dayKey
   const datetime end = StringToTime(dayKey) + 24 * 3600 - 1;
   const datetime start = StringToTime(dayKey) - 6 * 24 * 3600;
   TradeRec all[];
   ArrayResize(all, 0);
   for(int d = 0; d < 7; d++)
   {
      const string k = DayKey(start + d * 24 * 3600);
      TradeRec day[];
      const int n = CollectDayTrades(k, day);
      for(int i = 0; i < n; i++)
      {
         const int sz = ArraySize(all);
         ArrayResize(all, sz + 1);
         all[sz] = day[i];
      }
   }
   MqlDateTime dt;
   TimeToStruct(StringToTime(dayKey), dt);
   const string weekName = StringFormat("week_%04d-%02d-%02d", dt.year, dt.mon, dt.day);
   WritePeriodHtml(weekName, "Weekly report (7 days ending " + dayKey + ")", all, ArraySize(all));
}

void WriteMonthHtml(const string dayKey)
{
   MqlDateTime dt;
   TimeToStruct(StringToTime(dayKey), dt);
   const datetime start = StringToTime(StringFormat("%04d-%02d-01", dt.year, dt.mon));
   const datetime end = StringToTime(dayKey);
   TradeRec all[];
   ArrayResize(all, 0);
   for(datetime t = start; t <= end; t += 24 * 3600)
   {
      TradeRec day[];
      const int n = CollectDayTrades(DayKey(t), day);
      for(int i = 0; i < n; i++)
      {
         const int sz = ArraySize(all);
         ArrayResize(all, sz + 1);
         all[sz] = day[i];
      }
   }
   const string monthName = StringFormat("month_%04d-%02d", dt.year, dt.mon);
   WritePeriodHtml(monthName, "Monthly report — " + StringFormat("%04d-%02d", dt.year, dt.mon), all, ArraySize(all));
}

void WritePeriodHtml(const string fileKey, const string title, const TradeRec &list[], const int n)
{
   FolderEnsure();
   int f = FileOpen(InpFolder + "\\" + fileKey + ".html", FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(f == INVALID_HANDLE)
      return;
   int wins, losses;
   double net, gw, gl, sumR;
   StatsFromList(list, n, wins, losses, net, gw, gl, sumR);
   const double wr = (n > 0 ? 100.0 * wins / n : 0);
   const double pf = (gl > 0 ? gw / gl : (gw > 0 ? 999 : 0));
   const double avgR = (n > 0 ? sumR / n : 0);

   FileWriteString(f,
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + HEsc(title) + "</title><style>"
      "body{font-family:Segoe UI,Arial,sans-serif;background:#0b1220;color:#e5eef7;margin:0;padding:24px;}"
      ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;}"
      ".stat{background:#0f1724;border:1px solid #243044;border-radius:8px;padding:12px;} .stat b{display:block;font-size:20px;margin-top:4px;}"
      ".win{color:#34d399;} .loss{color:#f87171;} table{width:100%;border-collapse:collapse;} th,td{border-bottom:1px solid #243044;padding:8px;text-align:left;font-size:13px;}"
      "th{color:#94a3b8;} .muted{color:#94a3b8;}</style></head><body>");
   FileWriteString(f, "<h1>" + HEsc(title) + "</h1>");
   FileWriteString(f, "<p class='muted'>" + HEsc(InpTraderName) + " · Trade Journal Pro</p>");
   FileWriteString(f, "<div class='grid'>"
      "<div class='stat'>Trades<b>" + IntegerToString(n) + "</b></div>"
      "<div class='stat'>Win rate<b>" + DoubleToString(wr, 1) + "%</b></div>"
      "<div class='stat'>Net P/L<b class='" + MoneyClass(net) + "'>" + DoubleToString(net, 2) + "</b></div>"
      "<div class='stat'>PF<b>" + DoubleToString(pf, 2) + "</b></div>"
      "<div class='stat'>Avg R<b class='" + MoneyClass(avgR) + "'>" + DoubleToString(avgR, 2) + "R</b></div>"
      "</div>");

   FileWriteString(f, "<h2 style='margin-top:24px;'>Trade log</h2><table><tr>"
      "<th>Time out</th><th>Symbol</th><th>Side</th><th>P/L</th><th>R</th><th>Exit</th><th>Session</th><th>Bias</th><th>Why exit</th></tr>");
   for(int i = 0; i < n; i++)
   {
      const TradeRec t = list[i];
      const double pnl = t.profit + t.swap + t.commission;
      FileWriteString(f, "<tr><td>" + TimeToString(t.timeClose, TIME_DATE|TIME_MINUTES) + "</td><td>" + HEsc(t.symbol) +
         "</td><td>" + (t.type == 0 ? "BUY" : "SELL") + "</td><td class='" + MoneyClass(pnl) + "'>" + DoubleToString(pnl, 2) +
         "</td><td>" + DoubleToString(t.realizedR, 2) + "</td><td>" + HEsc(t.exitReason) + "</td><td>" + HEsc(t.session) +
         "</td><td>" + HEsc(t.trendBias) + "</td><td>" + HEsc(t.exitWhy) + "</td></tr>");
   }
   FileWriteString(f, "</table>");
   FileWriteString(f, "<div style='margin-top:20px;'>" + CoachingHtml(list, n, wins, losses, net, avgR) + "</div>");
   FileWriteString(f, "</body></html>");
   FileClose(f);
}

//+------------------------------------------------------------------+
// Manual chart command: type in Experts or use chart event comment
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   // Press 'J' to force rebuild today's journal
   if(id == CHARTEVENT_KEYDOWN && lparam == 'J')
   {
      BuildReportsForDay(DayKey(TimeCurrent()));
      Alert("Trade Journal Pro: report refreshed for ", DayKey(TimeCurrent()));
   }
}
//+------------------------------------------------------------------+
