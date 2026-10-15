//+------------------------------------------------------------------+
//| Forge_AutoBots.mq5                                               |
//| ONE EA that runs TRH + ICT + CRT together on the same chart      |
//| (MT5 allows only one Expert per chart — this is the fix)         |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.00"
#property description "Triple AutoBot: TRH + ICT + CRT on one chart"
#property strict

#include <Trade/Trade.mqh>
#include "TRH_Engine.mqh"
#include "ICT_Engine.mqh"
#include "CRT_Engine.mqh"
#include "WatchBridge.mqh"

#ifndef TRH_ENGINE_VERSION
#define TRH_ENGINE_VERSION 0
#endif
#ifndef ICT_ENGINE_VERSION
#define ICT_ENGINE_VERSION 0
#endif
#ifndef CRT_ENGINE_VERSION
#define CRT_ENGINE_VERSION 0
#endif

enum ENUM_TRH_SCAN
{
   FAB_TRH_CLASSIC = 0,
   FAB_TRH_FVG     = 1,
   FAB_TRH_BOTH_AB = 2,
   FAB_TRH_BTB     = 3,
   FAB_TRH_ALL     = 4
};

input group "Which bots run (same chart)"
input bool InpEnableTRH = true;   // Run TRH
input bool InpEnableICT = true;   // Run ICT
input bool InpEnableCRT = true;   // Run CRT

input group "Trading"
input bool   InpAutoTrade       = true;
input int    InpMaxSlippagePts  = 30;
input int    InpPendingExpiry   = 40;
input int    InpLookbackBars    = 2000;
input int    InpFreshMaxAgeBars = 3;
input int    InpMaxOpenPerBot   = 1;     // Max positions+pendings per bot magic
input bool   InpAllowMultiBots  = true;  // Allow TRH+ICT+CRT open together

input group "Magic numbers (keep unique)"
input ulong InpMagicTRH = 260825;
input ulong InpMagicICT = 270827;
input ulong InpMagicCRT = 280827;

input group "Risk (shared)"
input bool   InpUseDynamicLots = true;
input double InpRiskPercent    = 0.5;    // % balance per new trade
input double InpMinLots        = 0.01;
input double InpMaxLots        = 1.0;
input double InpBreakEvenAtR   = 0.5;
input int    InpMaxSpreadPts   = 80;

input group "TRH"
input ENUM_TRH_SCAN InpTrhMode = FAB_TRH_ALL;
input double InpTrhRR          = 2.4;
input double InpTrhSlPadAtr    = 0.10;

input group "ICT"
input double InpIctRR       = 3.0;
input double InpIctSlPadAtr = 0.10;
input bool   InpIctRetest   = true;

input group "CRT"
input ENUM_TIMEFRAMES InpCrtHtf = PERIOD_M5; // AOI HTF (use M5 when chart is M1)
input double InpCrtRR           = 2.5;
input double InpCrtSlPadAtr     = 0.06;
input int    InpCrtMinBias      = 2;
input int    InpCrtHtfBars      = 500;

CTrade g_trade;
datetime g_lastBar = 0;
datetime g_lastTRH = 0, g_lastICT = 0, g_lastCRT = 0;
datetime g_dayStamp = 0;
int      g_dayTrades = 0;

void ResetDay()
{
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
   datetime day = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   if(day != g_dayStamp) { g_dayStamp = day; g_dayTrades = 0; }
}

int CountMagic(const ulong magic)
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)magic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      n++;
   }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong t = OrderGetTicket(i);
      if(t == 0 || !OrderSelect(t)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)magic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      n++;
   }
   return n;
}

int CountAllBots()
{
   return CountMagic(InpMagicTRH) + CountMagic(InpMagicICT) + CountMagic(InpMagicCRT);
}

double CalcLots(const double entry, const double sl)
{
   double volMin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0) step = 0.01;
   if(InpMinLots > 0) volMin = MathMax(volMin, InpMinLots);
   if(InpMaxLots > 0) volMax = MathMin(volMax, InpMaxLots);

   double lots = volMin;
   if(InpUseDynamicLots)
   {
      double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * (InpRiskPercent / 100.0);
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dist = MathAbs(entry - sl);
      if(tickSize > 0 && tickValue > 0 && dist > 0)
      {
         double ticks = dist / tickSize;
         lots = riskMoney / (ticks * tickValue);
      }
   }
   lots = MathFloor(lots / step) * step;
   if(lots < volMin) lots = volMin;
   if(lots > volMax) lots = volMax;
   return NormalizeDouble(lots, 2);
}

bool SpreadOk()
{
   return SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) <= InpMaxSpreadPts;
}

bool NormalizeStops(const int dir, double &entry, double &sl, double &tp)
{
   long stops = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double minDist = stops * point;
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
   return true;
}

bool PlaceBotTrade(const string bot, const ulong magic, const int dir,
                   double entry, double sl, double tp, const string comment)
{
   if(!InpAutoTrade) return false;
   if(!SpreadOk()) return false;
   if(CountMagic(magic) >= InpMaxOpenPerBot) return false;
   if(!InpAllowMultiBots && CountAllBots() > 0) return false;

   NormalizeStops(dir, entry, sl, tp);
   double lots = CalcLots(entry, sl);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   g_trade.SetExpertMagicNumber(magic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   bool ok = false;
   if(dir == 1)
   {
      bool through = ask <= entry + point;
      if(through) ok = g_trade.Buy(lots, _Symbol, 0, sl, tp, comment);
      else ok = g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   else
   {
      bool through = bid >= entry - point;
      if(through) ok = g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
      else ok = g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   if(ok) g_dayTrades++;
   else PrintFormat("%s place fail: %s", bot, g_trade.ResultRetcodeDescription());
   return ok;
}

void ExpirePendings(const ulong magic)
{
   datetime now = TimeCurrent();
   int periodSec = PeriodSeconds(_Period);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong t = OrderGetTicket(i);
      if(t == 0 || !OrderSelect(t)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)magic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      datetime setup = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      int age = (int)((now - setup) / periodSec);
      if(age >= InpPendingExpiry) g_trade.OrderDelete(t);
   }
}

void ManageBE(const ulong magic)
{
   if(InpBreakEvenAtR <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)magic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double risk = MathAbs(entry - sl);
      if(risk <= 0) continue;
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double newSL = entry;
      if(type == POSITION_TYPE_BUY)
      {
         if((bid - entry) / risk < InpBreakEvenAtR) continue;
         if(sl >= newSL) continue;
      }
      else
      {
         if((entry - ask) / risk < InpBreakEvenAtR) continue;
         if(sl > 0 && sl <= newSL) continue;
      }
      g_trade.SetExpertMagicNumber(magic);
      g_trade.PositionModify(ticket, newSL, tp);
   }
}

void BuildTrhCfg(TrhConfig &cfg)
{
   TrhDefaultConfig(cfg);
   cfg.riskReward = InpTrhRR;
   cfg.slPadAtr = InpTrhSlPadAtr;
   cfg.fvgSlExtraAtr = InpTrhSlPadAtr;
}

void BuildIctCfg(IctConfig &cfg)
{
   IctDefaultConfig(cfg);
   cfg.riskReward = InpIctRR;
   cfg.slPadAtr = InpIctSlPadAtr;
   cfg.requireFvgRetest = InpIctRetest;
}

void BuildCrtCfg(CrtConfig &cfg)
{
   CrtDefaultConfig(cfg);
   cfg.riskReward = InpCrtRR;
   cfg.slPadAtr = InpCrtSlPadAtr;
   cfg.minBiasModels = InpCrtMinBias;
   cfg.htf = InpCrtHtf;
}

string Side(const int dir) { return dir == 1 ? "LONG" : "SHORT"; }

int OnInit()
{
   if(TRH_ENGINE_VERSION < 222 && InpEnableTRH)
   {
      Alert("Forge AutoBots: TRH_Engine.mqh missing/outdated in SAME folder");
      return INIT_FAILED;
   }
   if(ICT_ENGINE_VERSION < 100 && InpEnableICT)
   {
      Alert("Forge AutoBots: ICT_Engine.mqh missing in SAME folder");
      return INIT_FAILED;
   }
   if(CRT_ENGINE_VERSION < 100 && InpEnableCRT)
   {
      Alert("Forge AutoBots: CRT_Engine.mqh missing in SAME folder");
      return INIT_FAILED;
   }
   if(!InpEnableTRH && !InpEnableICT && !InpEnableCRT)
   {
      Alert("Forge AutoBots: enable at least one bot");
      return INIT_FAILED;
   }

   ResetDay();
   Comment(StringFormat(
      "Forge AutoBots v1.00\nTRH:%s ICT:%s CRT:%s\nAutoTrade %s | multi %s",
      InpEnableTRH ? "ON" : "off",
      InpEnableICT ? "ON" : "off",
      InpEnableCRT ? "ON" : "off",
      InpAutoTrade ? "ON" : "OFF",
      InpAllowMultiBots ? "yes" : "no"));

   WatchEmit("TRH", "info", "", InpEnableTRH ? "INIT" : "DISABLED", 0, 0, 0, "TripleBot",
             InpEnableTRH ? "TRH enabled in Forge_AutoBots" : "TRH disabled", 0);
   WatchEmit("ICT", "info", "", InpEnableICT ? "INIT" : "DISABLED", 0, 0, 0, "TripleBot",
             InpEnableICT ? "ICT enabled in Forge_AutoBots" : "ICT disabled", 0);
   WatchEmit("CRT", "info", "", InpEnableCRT ? "INIT" : "DISABLED", 0, 0, 0, "TripleBot",
             InpEnableCRT ? "CRT enabled in Forge_AutoBots" : "CRT disabled", 0);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { Comment(""); }

void OnTick()
{
   ResetDay();
   ExpirePendings(InpMagicTRH);
   ExpirePendings(InpMagicICT);
   ExpirePendings(InpMagicCRT);
   ManageBE(InpMagicTRH);
   ManageBE(InpMagicICT);
   ManageBE(InpMagicCRT);

   if(InpEnableTRH) WatchHeartbeat("TRH", "alive", "Forge_AutoBots");
   if(InpEnableICT) WatchHeartbeat("ICT", "alive", "Forge_AutoBots");
   if(InpEnableCRT) WatchHeartbeat("CRT", "alive", "Forge_AutoBots");

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0 || barTime == g_lastBar) return;
   g_lastBar = barTime;

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
   datetime closedBar = (copied >= 2) ? t[copied - 2] : 0;

   string lineTRH = "TRH off", lineICT = "ICT off", lineCRT = "CRT off";

   // ── TRH ──────────────────────────────────────────────────────────
   if(InpEnableTRH)
   {
      TrhConfig cfg; BuildTrhCfg(cfg);
      TrhSetup setups[];
      int n = TrhScanByMode(copied, t, o, h, l, c, cfg, (int)InpTrhMode, setups);
      if(n <= 0)
      {
         lineTRH = "TRH scanning";
         WatchStatus("TRH", 0, 0, 0, 0, "", "SCANNING", 0);
      }
      else
      {
         TrhSetup s = setups[n - 1];
         int age = (copied >= 2) ? ((copied - 2) - s.barIndex) : 0;
         if(age < 0) age = 0;
         lineTRH = StringFormat("TRH %s %s E%s", Side(s.dir), TrhModeLabel(s.setupMode),
                                DoubleToString(s.entry, _Digits));
         WatchStatus("TRH", s.dir, s.entry, s.sl, s.tp, TrhModeLabel(s.setupMode),
                     StringFormat("LIVE age=%d", age), s.barTime);

         if(closedBar != 0 && s.barTime == closedBar && age <= InpFreshMaxAgeBars &&
            s.barTime != g_lastTRH && CountMagic(InpMagicTRH) == 0)
         {
            g_lastTRH = s.barTime;
            WatchSetup("TRH", s.dir, s.entry, s.sl, s.tp, TrhModeLabel(s.setupMode), s.barTime, "TripleBot");
            PlaceBotTrade("TRH", InpMagicTRH, s.dir, s.entry, s.sl, s.tp,
                          StringFormat("TRH %s %s", TrhModeLabel(s.setupMode), Side(s.dir)));
         }
      }
   }

   // ── ICT ──────────────────────────────────────────────────────────
   if(InpEnableICT)
   {
      IctConfig cfg; BuildIctCfg(cfg);
      IctSetup setups[];
      int n = IctScanSetups(copied, t, o, h, l, c, cfg, setups);
      if(n <= 0)
      {
         lineICT = "ICT scanning";
         WatchStatus("ICT", 0, 0, 0, 0, "", "SCANNING", 0);
      }
      else
      {
         IctSetup s = setups[n - 1];
         int age = (copied >= 2) ? ((copied - 2) - s.barIndex) : 0;
         if(age < 0) age = 0;
         lineICT = StringFormat("ICT %s E%s", Side(s.dir), DoubleToString(s.entry, _Digits));
         WatchStatus("ICT", s.dir, s.entry, s.sl, s.tp, "RAID-MSS-FVG",
                     StringFormat("LIVE age=%d", age), s.barTime);

         if(closedBar != 0 && s.barTime == closedBar && age <= InpFreshMaxAgeBars &&
            s.barTime != g_lastICT && CountMagic(InpMagicICT) == 0)
         {
            g_lastICT = s.barTime;
            WatchSetup("ICT", s.dir, s.entry, s.sl, s.tp, "RAID-MSS-FVG", s.barTime, "TripleBot");
            PlaceBotTrade("ICT", InpMagicICT, s.dir, s.entry, s.sl, s.tp,
                          StringFormat("ICT %s", Side(s.dir)));
         }
      }
   }

   // ── CRT ──────────────────────────────────────────────────────────
   if(InpEnableCRT)
   {
      CrtConfig cfg; BuildCrtCfg(cfg);
      datetime ht[]; double ho[], hh[], hl[], hc[];
      CrtFvg fvgs[];
      int nFvg = 0;
      if(CrtCopyHtf(_Symbol, InpCrtHtf, InpCrtHtfBars, ht, ho, hh, hl, hc))
         nFvg = CrtScanHtfFvgs(ArraySize(ht), ht, hh, hl, hc, cfg, fvgs);

      CrtSetup setups[];
      int n = CrtScanSetups(copied, t, o, h, l, c, cfg, fvgs, nFvg, setups);
      if(n <= 0)
      {
         lineCRT = "CRT scanning";
         WatchStatus("CRT", 0, 0, 0, 0, "", "SCANNING", 0);
      }
      else
      {
         CrtSetup s = setups[n - 1];
         int age = (copied >= 2) ? ((copied - 2) - s.barIndex) : 0;
         if(age < 0) age = 0;
         lineCRT = StringFormat("CRT %s bias%d E%s", Side(s.dir), s.biasCount,
                                DoubleToString(s.entry, _Digits));
         WatchStatus("CRT", s.dir, s.entry, s.sl, s.tp, StringFormat("bias x%d", s.biasCount),
                     StringFormat("LIVE age=%d", age), s.barTime);

         if(closedBar != 0 && s.barTime == closedBar && age <= InpFreshMaxAgeBars &&
            s.barTime != g_lastCRT && CountMagic(InpMagicCRT) == 0)
         {
            g_lastCRT = s.barTime;
            WatchSetup("CRT", s.dir, s.entry, s.sl, s.tp, StringFormat("bias x%d", s.biasCount),
                       s.barTime, "TripleBot");
            PlaceBotTrade("CRT", InpMagicCRT, s.dir, s.entry, s.sl, s.tp,
                          StringFormat("CRT %s", Side(s.dir)));
         }
      }
   }

   Comment(StringFormat(
      "Forge AutoBots | %s %s | day %d\n%s | orders %d\n%s | orders %d\n%s | orders %d",
      _Symbol, EnumToString(_Period), g_dayTrades,
      lineTRH, CountMagic(InpMagicTRH),
      lineICT, CountMagic(InpMagicICT),
      lineCRT, CountMagic(InpMagicCRT)));
}
//+------------------------------------------------------------------+
