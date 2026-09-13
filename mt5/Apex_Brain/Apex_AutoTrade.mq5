//+------------------------------------------------------------------+
//| Apex_AutoTrade.mq5                                               |
//| Apex Brain — RAID→SHIFT→POCKET→CONFIRM→STRIKE · fixed 1:3 R:R    |
//| Risk-% money management · WatchBridge → web dashboard            |
//+------------------------------------------------------------------+
#property copyright "Apex Brain"
#property version   "1.00"
#property strict

#include "Apex_Engine.mqh"
#include "../MT5_WatchBridge/WatchBridge.mqh"

input group "=== APEX BRAIN ==="
input ENUM_TIMEFRAMES InpTF           = PERIOD_M5;
input int             InpLookback     = 220;
input int             InpMagic        = 992501;
input string          InpComment      = "APEX";
input bool            InpAllowBuy     = true;
input bool            InpAllowSell    = true;
input bool            InpOneTrade     = true;
input int             InpMinScore     = 70;
input double          InpRiskReward   = 3.0;   // fixed geometry target

input group "=== RISK / MONEY ==="
input double          InpRiskPct      = 0.75;  // % equity per strike
input double          InpMaxDailyLossPct = 3.0;
input bool            InpMoveBEAt1R   = true;
input double          InpBEOffsetPts  = 2.0;

input group "=== SCAN ==="
input int             InpScanSec      = 2;
input int             InpManageSec    = 1;

ApexConfig  g_cfg;
ApexSetup   g_setups[];
int         g_lastBirthBar = -1;
datetime    g_lastBarTime  = 0;
datetime    g_lastScan     = 0;
datetime    g_lastManage   = 0;
double      g_dayStartEquity = 0;
int         g_dayYMD = 0;
bool        g_dayLocked = false;
ulong       g_ticket = 0;
string      g_lastPhaseFp = "";

//+------------------------------------------------------------------+
int OnInit()
{
   ApexDefaultConfig(g_cfg);
   g_cfg.allowLong = InpAllowBuy;
   g_cfg.allowShort = InpAllowSell;
   g_cfg.confirmMinScore = InpMinScore;
   g_cfg.riskReward = InpRiskReward;
   ArrayResize(g_setups, 0);
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   g_dayYMD = DayKey();
   EventSetTimer(1);
   WatchEmit("APEX", "info", "", "BOOT", 0, 0, 0, "brain",
             "Apex Brain online · thesis RAID→SHIFT→POCKET→CONFIRM→STRIKE · RR 1:" +
             DoubleToString(InpRiskReward, 1));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   WatchEmit("APEX", "info", "", "HALT", 0, 0, 0, "brain", "Apex Brain stopped");
}

void OnTick()
{
   MaybeResetDay();
   const datetime now = TimeCurrent();
   if(now - g_lastManage >= InpManageSec)
   {
      g_lastManage = now;
      ManageOpen();
   }
   if(now - g_lastScan >= InpScanSec)
   {
      g_lastScan = now;
      ScanAndMaybeStrike();
   }
   WatchHeartbeat("APEX", ApexPhaseLabel(), HeartbeatMsg());
}

void OnTimer() { OnTick(); }

//+------------------------------------------------------------------+
int DayKey()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return dt.year * 10000 + dt.mon * 100 + dt.day;
}

void MaybeResetDay()
{
   const int k = DayKey();
   if(k == g_dayYMD) return;
   g_dayYMD = k;
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   g_dayLocked = false;
}

bool DayLossBreached()
{
   if(InpMaxDailyLossPct <= 0) return g_dayLocked;
   const double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   const double dd = (g_dayStartEquity - eq) / MathMax(g_dayStartEquity, 1.0) * 100.0;
   if(dd >= InpMaxDailyLossPct)
      g_dayLocked = true;
   return g_dayLocked;
}

int CountOurs()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      const ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      n++;
   }
   return n;
}

ulong FindOurs()
{
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      const ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      return t;
   }
   return 0;
}

string ApexPhaseLabel()
{
   const int bi = ApexBestArmed(g_setups, g_cfg);
   if(CountOurs() > 0) return "LIVE";
   if(bi >= 0) return ApexPhaseName(g_setups[bi].phase);
   if(ArraySize(g_setups) > 0) return ApexPhaseName(g_setups[ArraySize(g_setups) - 1].phase);
   return "SCOUT";
}

string HeartbeatMsg()
{
   const int bi = ApexBestArmed(g_setups, g_cfg);
   string thesis = "scanning";
   if(bi >= 0)
      thesis = g_setups[bi].story + " · grade " + ApexGradeLetter(g_setups[bi].grade) +
               " · score " + IntegerToString(g_setups[bi].score);
   return StringFormat("eq %.2f | open %d | setups %d | %s | dayLock %s",
                       AccountInfoDouble(ACCOUNT_EQUITY),
                       CountOurs(),
                       ArraySize(g_setups),
                       thesis,
                       (g_dayLocked ? "YES" : "no"));
}

// Arrays as series: index 0 = current forming bar, 1 = last closed
bool LoadSeries(datetime &time[], double &open[], double &high[], double &low[], double &close[], int &n)
{
   ArraySetAsSeries(time, true);
   ArraySetAsSeries(open, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);
   n = CopyTime(_Symbol, InpTF, 0, InpLookback, time);
   if(n < 80) return false;
   if(CopyOpen(_Symbol, InpTF, 0, n, open) < n) return false;
   if(CopyHigh(_Symbol, InpTF, 0, n, high) < n) return false;
   if(CopyLow(_Symbol, InpTF, 0, n, low) < n) return false;
   if(CopyClose(_Symbol, InpTF, 0, n, close) < n) return false;
   return true;
}

void EmitBestStatus(const bool forceSetup)
{
   const int bi = ApexBestArmed(g_setups, g_cfg);
   int idx = bi;
   if(idx < 0 && ArraySize(g_setups) > 0)
      idx = ArraySize(g_setups) - 1;
   if(idx < 0)
   {
      WatchEmit("APEX", "status", "", "SCOUT", 0, 0, 0, "scan", "No thesis — scouting liquidity raids");
      return;
   }

   ApexSetup s = g_setups[idx];
   const string side = (s.dir == 1) ? "LONG" : (s.dir == -1) ? "SHORT" : "";
   const string status = ApexPhaseName(s.phase);
   const string mode = "RR1:" + DoubleToString(InpRiskReward, 1) + "|G" + ApexGradeLetter(s.grade);
   const string msg = StringFormat("%s | %s | score %d | E=%s SL=%s TP=%s",
                                   s.story, status, s.score,
                                   DoubleToString(s.entry, _Digits),
                                   DoubleToString(s.sl, _Digits),
                                   DoubleToString(s.tp, _Digits));

   const string fp = status + "|" + side + "|" + DoubleToString(s.entry, _Digits) + "|" + IntegerToString(s.score);
   if(forceSetup || s.phase == APEX_ARMED || s.phase == APEX_CONFIRM)
   {
      if(forceSetup || fp != g_lastPhaseFp)
      {
         g_lastPhaseFp = fp;
         if(s.phase == APEX_ARMED || s.phase == APEX_CONFIRM)
            WatchSetup("APEX", s.dir, s.entry, s.sl, s.tp, mode, s.birthTime, msg);
         else
            WatchStatus("APEX", s.dir, s.entry, s.sl, s.tp, mode, status, s.birthTime);
      }
   }
   else
      WatchStatus("APEX", s.dir, s.entry, s.sl, s.tp, mode, status, s.birthTime);
}

void ScanAndMaybeStrike()
{
   if(DayLossBreached())
   {
      WatchEmit("APEX", "status", "", "LOCK", 0, 0, 0, "risk", "Daily loss lock — no new strikes");
      return;
   }

   datetime time[];
   double open[], high[], low[], close[];
   int n = 0;
   if(!LoadSeries(time, open, high, low, close, n)) return;

   const bool newBar = (time[1] != g_lastBarTime);
   if(newBar)
   {
      g_lastBarTime = time[1];
      ApexScan(n, time, open, high, low, close, g_cfg, g_setups, g_lastBirthBar);
      ApexManage(g_setups, g_cfg, open, high, low, close, n);
      EmitBestStatus(true);
   }
   else
   {
      // soft manage score/invalidation on timer without rebirthing
      ApexManage(g_setups, g_cfg, open, high, low, close, n);
      EmitBestStatus(false);
   }

   const int bi = ApexBestArmed(g_setups, g_cfg);
   if(bi < 0) return;
   if(g_setups[bi].phase != APEX_ARMED) return;
   if(InpOneTrade && CountOurs() > 0) return;
   if(g_setups[bi].dir > 0 && !InpAllowBuy) return;
   if(g_setups[bi].dir < 0 && !InpAllowSell) return;
   if(!ApexTouchedEntry(g_setups[bi], high, low)) return;

   StrikeNow(g_setups[bi], bi);
}

ENUM_ORDER_TYPE_FILLING PickFilling()
{
   const int fill = (int)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((fill & SYMBOL_FILLING_IOC) == SYMBOL_FILLING_IOC) return ORDER_FILLING_IOC;
   if((fill & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK) return ORDER_FILLING_FOK;
   return ORDER_FILLING_RETURN;
}

void StrikeNow(ApexSetup &s, const int idx)
{
   const double lots = ApexLotsFromRisk(InpRiskPct, s.entry, s.sl);
   if(lots <= 0)
   {
      WatchEmit("APEX", "error", "", "REJECT", s.entry, s.sl, s.tp, "risk", "Lot size zero / risk reject");
      return;
   }

   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);
   req.action       = TRADE_ACTION_DEAL;
   req.symbol       = _Symbol;
   req.magic        = InpMagic;
   req.volume       = lots;
   req.deviation    = 30;
   req.comment      = InpComment;
   req.type_filling = PickFilling();

   if(s.dir > 0)
   {
      req.type  = ORDER_TYPE_BUY;
      req.price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      req.sl    = NormalizeDouble(s.sl, _Digits);
      req.tp    = NormalizeDouble(s.tp, _Digits);
   }
   else
   {
      req.type  = ORDER_TYPE_SELL;
      req.price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      req.sl    = NormalizeDouble(s.sl, _Digits);
      req.tp    = NormalizeDouble(s.tp, _Digits);
   }

   ResetLastError();
   if(!OrderSend(req, res))
   {
      WatchEmit("APEX", "error", (s.dir > 0 ? "LONG" : "SHORT"), "REJECT",
                s.entry, s.sl, s.tp, "order",
                StringFormat("OrderSend fail ret=%d err=%d %s", res.retcode, GetLastError(), res.comment));
      return;
   }
   if(res.retcode != TRADE_RETCODE_DONE && res.retcode != TRADE_RETCODE_DONE_PARTIAL &&
      res.retcode != TRADE_RETCODE_PLACED)
   {
      WatchEmit("APEX", "error", (s.dir > 0 ? "LONG" : "SHORT"), "REJECT",
                s.entry, s.sl, s.tp, "order",
                StringFormat("OrderSend ret=%d %s", res.retcode, res.comment));
      return;
   }

   g_ticket = (res.deal > 0) ? res.deal : res.order;
   g_setups[idx].phase = APEX_LIVE;
   const string side = (s.dir > 0) ? "LONG" : "SHORT";
   WatchEmit("APEX", "entry", side, "LIVE", req.price, s.sl, s.tp,
             "RR1:" + DoubleToString(InpRiskReward, 1),
             StringFormat("STRIKE %s @%s SL%s TP%s lots%s score%d %s",
                          side,
                          DoubleToString(req.price, _Digits),
                          DoubleToString(s.sl, _Digits),
                          DoubleToString(s.tp, _Digits),
                          DoubleToString(lots, 2),
                          s.score,
                          s.story));
}

void ManageOpen()
{
   g_ticket = FindOurs();
   if(g_ticket == 0)
   {
      // mark live setups done if flat
      for(int i = 0; i < ArraySize(g_setups); i++)
      {
         if(g_setups[i].phase == APEX_LIVE)
         {
            g_setups[i].phase = APEX_DONE;
            g_setups[i].dead = true;
            WatchEmit("APEX", "exit", "", "FLAT", g_setups[i].entry, g_setups[i].sl, g_setups[i].tp,
                      "manage", "Position closed");
         }
      }
      ApexDropDead(g_setups);
      return;
   }
   if(!PositionSelectByTicket(g_ticket)) return;
   if(!InpMoveBEAt1R) return;

   const long typ = PositionGetInteger(POSITION_TYPE);
   const double openPx = PositionGetDouble(POSITION_PRICE_OPEN);
   const double sl = PositionGetDouble(POSITION_SL);
   const double tp = PositionGetDouble(POSITION_TP);
   const double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   const double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   const double risk = MathAbs(openPx - sl);
   if(risk <= _Point) return;

   const double be = (typ == POSITION_TYPE_BUY)
                     ? openPx + InpBEOffsetPts * _Point
                     : openPx - InpBEOffsetPts * _Point;

   bool hit1R = false;
   if(typ == POSITION_TYPE_BUY) hit1R = (bid >= openPx + risk);
   else hit1R = (ask <= openPx - risk);
   if(!hit1R) return;
   if(typ == POSITION_TYPE_BUY && sl >= be - _Point) return;
   if(typ == POSITION_TYPE_SELL && sl > 0 && sl <= be + _Point) return;

   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);
   req.action   = TRADE_ACTION_SLTP;
   req.position = g_ticket;
   req.symbol   = _Symbol;
   req.sl       = NormalizeDouble(be, _Digits);
   req.tp       = tp;
   if(OrderSend(req, res))
      WatchEmit("APEX", "info", "", "BE", openPx, be, tp, "manage",
                StringFormat("Break-even lock @%s after +1R", DoubleToString(be, _Digits)));
}
//+------------------------------------------------------------------+
