//+------------------------------------------------------------------+
//| NABZ_Quantum.mq5                                                 |
//| Obsidian Gold trade panel · risk · prop · journal · sessions     |
//| Forge Charts — creative MT5 Expert Advisor                       |
//+------------------------------------------------------------------+
#property copyright "Forge Charts / NABZ"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "2.60"
#property description "NABZ Quantum v2.6 — MOVE bar drag, sample Prop/News, no click-race"

#include <NABZ_Quantum/NabzUI.mqh>

//--- Inputs
input group "═══ Identity ═══"
input ulong  InpMagic           = 20261104;   // Magic number
input int    InpDeviation       = 30;         // Max slippage (points)

input group "═══ Risk defaults ═══"
input ENUM_NABZ_RISK_MODE InpRiskMode = NABZ_RISK_PCT; // Risk mode
input double InpRiskValue       = 0.50;       // Risk value
input double InpDefaultRR       = 2.0;        // Default reward (R)
input bool   InpAutoRR          = true;       // Auto R:R on market orders
input bool   InpBlockM1         = true;       // Block trading on M1

input group "═══ Prop firm ═══"
input double InpMaxTotalDD      = 10.0;       // Max total DD % (display)
input double InpMaxDailyDD      = 5.0;        // Max daily DD %
input double InpProfitTarget    = 8.0;        // Profit target %
input double InpStartBalance    = 0.0;        // Start balance (0 = auto)

input group "═══ Sessions (broker hours) ═══"
input bool   InpShowSessions    = true;       // Draw session boxes
input bool   InpSessionBorder   = true;       // Border-only (not filled)
input int    InpAsiaStart       = 0;
input int    InpAsiaEnd         = 9;
input int    InpLonStart        = 8;
input int    InpLonEnd          = 17;
input int    InpNyStart         = 13;
input int    InpNyEnd           = 22;
input int    InpSessionDays     = 3;          // Lookback days

input group "═══ Links ═══"
input string InpUrlSignal       = "https://github.com/radiarkazemi/forge-charts";
input string InpUrlEducation    = "https://github.com/radiarkazemi/forge-charts";
input string InpUrlWebsite      = "https://github.com/radiarkazemi/forge-charts";

input group "═══ UI ═══"
input bool   InpCandleTimer     = true;       // Show candle countdown in panel header
input bool   InpStartMinimized  = false;      // Start with panel minimized
input int    InpBottomReserve   = 160;        // Pixels kept clear above MT5 terminal bars
input bool   InpOnlyThisSymbol  = true;       // Journal filter: chart symbol

//--- Global state
NabzUIState g_ui;
datetime    g_lastNewsFetch = 0;
datetime    g_lastJournal = 0;

void NabzOpenLink(const string url);

//+------------------------------------------------------------------+
int OnInit()
{
   NabzRiskDefaults(g_ui.risk);
   g_ui.risk.mode = InpRiskMode;
   g_ui.risk.value = InpRiskValue;
   g_ui.risk.defaultRR = InpDefaultRR;
   g_ui.risk.autoRR = InpAutoRR;
   g_ui.risk.blockM1 = InpBlockM1;
   g_ui.risk.showCandleTimer = InpCandleTimer;

   NabzPropDefaults(g_ui.propCfg);
   g_ui.propCfg.maxTotalDD = InpMaxTotalDD;
   g_ui.propCfg.maxDailyDD = InpMaxDailyDD;
   g_ui.propCfg.profitTarget = InpProfitTarget;
   g_ui.propCfg.startBalance = InpStartBalance;
   NabzPropInit(g_ui.propCfg, g_ui.prop);

   NabzSessionDefaults(g_ui.sessions);
   g_ui.sessions.asiaStart = InpAsiaStart;
   g_ui.sessions.asiaEnd = InpAsiaEnd;
   g_ui.sessions.lonStart = InpLonStart;
   g_ui.sessions.lonEnd = InpLonEnd;
   g_ui.sessions.nyStart = InpNyStart;
   g_ui.sessions.nyEnd = InpNyEnd;
   g_ui.sessions.lookbackDays = InpSessionDays;
   g_ui.sessions.enabled = InpShowSessions;
   g_ui.sessions.borderOnly = InpSessionBorder;
   g_ui.showSessions = InpShowSessions;

   g_ui.view = NABZ_VIEW_NONE;
   g_ui.eaActive = true;
   g_ui.minimized = InpStartMinimized;
   g_ui.panelH = 720;
   g_ui.pulse = 0;
   g_ui.settingsTab = 3;
   g_ui.drag.active = false;
   g_ui.lastLossPauseUntil = 0;
   g_ui.journal.weekMode = true;
   g_ui.candleLeft = "00:00";
   g_ui.panelDragging = false;
   g_ui.panelHoldDrag = false;
   g_ui.dragOffX = 0;
   g_ui.dragOffY = 0;
   g_ui.lastMouseX = 40;
   g_ui.lastMouseY = 40;
   g_ui.moveBarX = 0;
   g_ui.moveBarY = 0;
   g_ui.moveBarW = 0;
   g_ui.moveBarH = 0;
   g_ui.dragToggleMs = 0;
   g_ui.savePosOpen = false;
   g_ui.savePosTicket = 0;
   g_ui.bottomReserve = InpBottomReserve;
   g_ui.compactMode = false;
   g_ui.layout.panelX = 14;
   g_ui.layout.panelY = 24;
   NabzLayoutCompute(g_ui.layout, g_ui.bottomReserve);
   NabzUI_PickCoachTip(g_ui);

   NabzTradeInit(InpMagic, InpDeviation);
   NabzNewsFetchToday(g_ui.news);
   g_lastNewsFetch = TimeCurrent();
   NabzJournalCompute(g_ui.journal, g_ui.sessions, true, InpOnlyThisSymbol);
   g_lastJournal = TimeCurrent();

   if(g_ui.showSessions)
      NabzSessionsRedraw(g_ui.sessions);

   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);
   EventSetTimer(1);
   NabzUI_Redraw(g_ui);

   Print("NABZ Quantum v", NABZ_VERSION, " ready on ", _Symbol, " / ", EnumToString(_Period));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ChartSetInteger(0, CHART_MOUSE_SCROLL, true);
   NabzUI_DeleteAll();
   NabzSessionsClear();
   Comment("");
}

void OnTimer()
{
   g_ui.pulse = 1 - g_ui.pulse;
   NabzPropUpdate(g_ui.propCfg, g_ui.prop);

   if(TimeCurrent() - g_lastNewsFetch > 300)
   {
      NabzNewsFetchToday(g_ui.news);
      g_lastNewsFetch = TimeCurrent();
   }
   if(TimeCurrent() - g_lastJournal > 60)
   {
      NabzJournalCompute(g_ui.journal, g_ui.sessions, g_ui.journal.weekMode, InpOnlyThisSymbol);
      g_lastJournal = TimeCurrent();
   }

   // Auto risk-free at configured R1/R2/R3
   NabzAutoRiskFreeByR(g_ui.risk, _Symbol);

   NabzUI_SyncDragFromChart(g_ui);
   // Do not fight active panel drag with a timer redraw
   if(!g_ui.panelDragging && !g_ui.panelHoldDrag)
      NabzUI_Redraw(g_ui);

   // Prop DD soft alert
   static datetime lastAlert = 0;
   if(TimeCurrent() - lastAlert > 120)
   {
      if(g_ui.prop.dailyDD >= g_ui.propCfg.maxDailyDD * 0.85)
      {
         Alert("NABZ: Daily DD near limit (", DoubleToString(g_ui.prop.dailyDD, 2), "%)");
         lastAlert = TimeCurrent();
      }
      else if(g_ui.prop.totalDD >= g_ui.propCfg.maxTotalDD * 0.85)
      {
         Alert("NABZ: Total DD near limit (", DoubleToString(g_ui.prop.totalDD, 2), "%)");
         lastAlert = TimeCurrent();
      }
   }
}

void OnTick()
{
   // light — timer drives UI; tick keeps drag labels fresh while dragging
   if(g_ui.drag.active)
   {
      NabzUI_SyncDragFromChart(g_ui);
      NabzUI_DrawDragLines(g_ui);
   }
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      NabzJournalCompute(g_ui.journal, g_ui.sessions, g_ui.journal.weekMode, InpOnlyThisSymbol);
      NabzPropUpdate(g_ui.propCfg, g_ui.prop);

      // pause after loss
      if(g_ui.risk.pauseAfterLoss && HistoryDealSelect(trans.deal))
      {
         long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
         {
            double p = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
            if(p < 0)
            {
               g_ui.lastLossPauseUntil = TimeCurrent() + 15 * 60;
               g_ui.eaActive = false;
               Print("NABZ: 15-min pause after loss armed");
            }
         }
      }
      NabzUI_Redraw(g_ui);
   }
}

//+------------------------------------------------------------------+
bool NabzPausedGuard()
{
   if(g_ui.lastLossPauseUntil > TimeCurrent())
   {
      Alert("NABZ: paused after loss until ", TimeToString(g_ui.lastLossPauseUntil, TIME_MINUTES));
      return true;
   }
   if(!g_ui.eaActive)
   {
      Alert("NABZ: EA is PAUSED — press ACTIVE to resume");
      return true;
   }
   return false;
}

void NabzReadRiskEdit()
{
   string n = NABZ_PREFIX + "risk_val";
   if(ObjectFind(0, n) >= 0)
   {
      double v = StringToDouble(ObjectGetString(0, n, OBJPROP_TEXT));
      if(v > 0) g_ui.risk.value = v;
   }
}

void NabzApplySettingsEdits()
{
   string names[5] = {"set_rr_v", "set_mtdd", "set_mddd", "set_pt", "set_sb"};
   for(int i = 0; i < 5; ++i)
   {
      string n = NABZ_PREFIX + names[i];
      if(ObjectFind(0, n) < 0) continue;
      double v = StringToDouble(ObjectGetString(0, n, OBJPROP_TEXT));
      if(names[i] == "set_rr_v" && v > 0) g_ui.risk.defaultRR = v;
      if(names[i] == "set_mtdd" && v > 0) g_ui.propCfg.maxTotalDD = v;
      if(names[i] == "set_mddd" && v > 0) g_ui.propCfg.maxDailyDD = v;
      if(names[i] == "set_pt" && v > 0) g_ui.propCfg.profitTarget = v;
      if(names[i] == "set_sb" && v >= 0) g_ui.propCfg.startBalance = v;
   }
   for(int i = 0; i < 3; ++i)
   {
      string n = NABZ_PREFIX + "set_prv" + IntegerToString(i);
      if(ObjectFind(0, n) >= 0)
      {
         double v = StringToDouble(ObjectGetString(0, n, OBJPROP_TEXT));
         if(v > 0) g_ui.risk.partialR[i] = v;
      }
   }
}

//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   // Resize only — never wipe on pan/scroll (that caused the chart-move glitch)
   if(id == CHARTEVENT_CHART_CHANGE)
   {
      static int s_lastW = 0, s_lastH = 0;
      int w = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
      int h = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
      if(w != s_lastW || h != s_lastH)
      {
         s_lastW = w;
         s_lastH = h;
         NabzLayoutCompute(g_ui.layout, g_ui.bottomReserve);
         int maxBottom = h - g_ui.bottomReserve;
         if(g_ui.layout.panelX > w - g_ui.layout.panelW - 4)
            g_ui.layout.panelX = MathMax(4, w - g_ui.layout.panelW - 4);
         if(g_ui.layout.panelY > maxBottom - 100)
            g_ui.layout.panelY = MathMax(4, maxBottom - 100);
         if(!g_ui.panelDragging)
            NabzUI_Redraw(g_ui);
      }
      return;
   }

   if(id == CHARTEVENT_MOUSE_MOVE)
   {
      uint state = (uint)StringToInteger(sparam);
      if(NabzUI_HandleMouseMove(g_ui, (int)lparam, (int)dparam, state))
      {
         // Rebuild at new XY (objects update in place — no wipe)
         NabzUI_Redraw(g_ui);
         return;
      }
   }

   // Chart click can race OBJECT_CLICK on MOVE — handler debounces
   if(id == CHARTEVENT_CLICK)
   {
      if(NabzUI_HandleChartClick(g_ui, (int)lparam, (int)dparam))
      {
         NabzUI_Redraw(g_ui);
         return;
      }
   }

   if(id == CHARTEVENT_OBJECT_ENDEDIT)
   {
      if(StringFind(sparam, NABZ_PREFIX + "risk_val") == 0)
         NabzReadRiskEdit();
      if(StringFind(sparam, NABZ_PREFIX + "rr_val") == 0)
         NabzUI_ReadRREdit(g_ui);
      if(StringFind(sparam, NABZ_PREFIX + "set_") == 0)
      {
         NabzApplySettingsEdits();
         NabzUI_ReadSessionEdits(g_ui);
      }
      NabzUI_Redraw(g_ui);
      return;
   }

   if(id == CHARTEVENT_OBJECT_DRAG)
   {
      NabzUI_SyncDragFromChart(g_ui);
      NabzUI_DrawDragLines(g_ui);
      return;
   }

   if(id != CHARTEVENT_OBJECT_CLICK)
      return;
   if(StringFind(sparam, NABZ_PREFIX) != 0)
      return;

   string key = StringSubstr(sparam, StringLen(NABZ_PREFIX));
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);

   if(NabzUI_HandleClick(g_ui, key))
   {
      NabzUI_Redraw(g_ui);
      return;
   }

   //--- Risk
   if(key == "risk_minus")
   {
      NabzReadRiskEdit();
      g_ui.risk.value = MathMax(0.01, g_ui.risk.value - (g_ui.risk.mode == NABZ_RISK_LOT ? 0.01 : 0.10));
   }
   else if(key == "risk_plus")
   {
      NabzReadRiskEdit();
      g_ui.risk.value += (g_ui.risk.mode == NABZ_RISK_LOT ? 0.01 : 0.10);
   }
   else if(StringFind(key, "risk_mode_") == 0)
   {
      int m = (int)StringToInteger(StringSubstr(key, 10));
      g_ui.risk.mode = (ENUM_NABZ_RISK_MODE)m;
   }
   //--- Execution
   else if(key == "btn_buy")
   {
      if(!NabzPausedGuard())
      {
         NabzReadRiskEdit();
         if(g_ui.drag.active)
         {
            NabzUI_SyncDragFromChart(g_ui);
            NabzMarketOrder(true, g_ui.risk, g_ui.drag.sl, g_ui.drag.tp);
            g_ui.drag.active = false;
         }
         else
            NabzMarketOrder(true, g_ui.risk, 0, 0);
      }
   }
   else if(key == "btn_sell")
   {
      if(!NabzPausedGuard())
      {
         NabzReadRiskEdit();
         if(g_ui.drag.active)
         {
            NabzUI_SyncDragFromChart(g_ui);
            NabzMarketOrder(false, g_ui.risk, g_ui.drag.sl, g_ui.drag.tp);
            g_ui.drag.active = false;
         }
         else
            NabzMarketOrder(false, g_ui.risk, 0, 0);
      }
   }
   else if(key == "btn_pbuy")
   {
      if(!NabzPausedGuard())
      {
         NabzReadRiskEdit();
         if(!g_ui.drag.active) NabzInitDrag(g_ui.drag, true);
         NabzUI_SyncDragFromChart(g_ui);
         NabzPendingOrder(true, g_ui.risk, g_ui.drag.entry, g_ui.drag.sl, g_ui.drag.tp);
      }
   }
   else if(key == "btn_psell")
   {
      if(!NabzPausedGuard())
      {
         NabzReadRiskEdit();
         if(!g_ui.drag.active) NabzInitDrag(g_ui.drag, false);
         NabzUI_SyncDragFromChart(g_ui);
         NabzPendingOrder(false, g_ui.risk, g_ui.drag.entry, g_ui.drag.sl, g_ui.drag.tp);
      }
   }
   else if(key == "btn_drag")
   {
      if(g_ui.drag.active)
         g_ui.drag.active = false;
      else
         NabzInitDrag(g_ui.drag, true);
   }
   else if(key == "btn_cancelp")
      NabzCancelPendings(_Symbol);
   else if(key == "btn_minmax")
   {
      NabzUI_ToggleMinimize(g_ui);
   }
   else if(key == "btn_active")
   {
      g_ui.eaActive = !g_ui.eaActive;
      if(g_ui.eaActive) g_ui.lastLossPauseUntil = 0;
   }
   else if(key == "btn_sos" || key == "btn_closeall")
   {
      NabzCloseAll(_Symbol);
      NabzCancelPendings(_Symbol);
      g_ui.drag.active = false;
      if(key == "btn_sos")
         Alert("NABZ SOS — flattened ", _Symbol);
   }
   else if(key == "btn_cancel")
   {
      g_ui.drag.active = false;
   }
   else if(key == "btn_riskfree")
      NabzRiskFreeAll(_Symbol);
   else if(key == "btn_savepos")
   {
      g_ui.savePosTicket = 0; // all symbol positions
      g_ui.savePosOpen = true;
   }
   //--- Per-position buttons: $ Save · R Risk Free · X Close
   else if(StringFind(key, "pos_sv_") == 0 || StringFind(key, "pos_rf_") == 0 || StringFind(key, "pos_x_") == 0)
   {
      string tip = ObjectGetString(0, sparam, OBJPROP_TOOLTIP);
      ulong ticket = NabzUI_TipTicket(tip);
      if(ticket > 0)
      {
         if(StringFind(key, "pos_sv_") == 0)
         {
            g_ui.savePosTicket = ticket;
            g_ui.savePosOpen = true;
         }
         else if(StringFind(key, "pos_rf_") == 0)
            NabzRiskFreePosition(ticket);
         else
            g_nabzTrade.PositionClose(ticket);
      }
   }
   //--- News nav
   else if(key == "news_prev")
      g_ui.news.offset = MathMax(0, g_ui.news.offset - 1);
   else if(key == "news_next")
      g_ui.news.offset = MathMin(MathMax(0, g_ui.news.count - 1), g_ui.news.offset + 1);
   //--- Nav modules
   else if(key == "nav_0")
   {
      g_ui.view = (g_ui.view == NABZ_VIEW_JOURNAL ? NABZ_VIEW_NONE : NABZ_VIEW_JOURNAL);
      if(g_ui.view == NABZ_VIEW_JOURNAL)
         NabzJournalCompute(g_ui.journal, g_ui.sessions, g_ui.journal.weekMode, InpOnlyThisSymbol);
   }
   else if(key == "nav_1")
   {
      // SESS — open settings Sessions tab + redraw boxes
      g_ui.view = NABZ_VIEW_SETTINGS;
      g_ui.settingsTab = 5;
      if(!g_ui.sessions.enabled)
      {
         g_ui.sessions.enabled = true;
         g_ui.showSessions = true;
      }
      NabzSessionsRedraw(g_ui.sessions);
   }
   else if(key == "nav_2")
   {
      NabzNewsFetchToday(g_ui.news);
      g_ui.view = (g_ui.view == NABZ_VIEW_ECO ? NABZ_VIEW_NONE : NABZ_VIEW_ECO);
   }
   else if(key == "nav_3")
   {
      NabzUI_PickCoachTip(g_ui);
      g_ui.view = (g_ui.view == NABZ_VIEW_COACH ? NABZ_VIEW_NONE : NABZ_VIEW_COACH);
   }
   else if(key == "nav_4")
      g_ui.view = (g_ui.view == NABZ_VIEW_PCT ? NABZ_VIEW_NONE : NABZ_VIEW_PCT);
   else if(key == "nav_5")
      g_ui.view = (g_ui.view == NABZ_VIEW_SETTINGS ? NABZ_VIEW_NONE : NABZ_VIEW_SETTINGS);
   //--- Links
   else if(key == "lnk_signal")
      NabzOpenLink(InpUrlSignal);
   else if(key == "lnk_edu")
      NabzOpenLink(InpUrlEducation);
   else if(key == "lnk_web")
      NabzOpenLink(InpUrlWebsite);
   //--- Journal
   else if(key == "jou_close" || key == "coach_close" || key == "pct_close" || key == "set_close")
      g_ui.view = NABZ_VIEW_NONE;
   else if(key == "jou_week")
   {
      g_ui.journal.weekMode = true;
      NabzJournalCompute(g_ui.journal, g_ui.sessions, true, InpOnlyThisSymbol);
   }
   else if(key == "jou_month")
   {
      g_ui.journal.weekMode = false;
      NabzJournalCompute(g_ui.journal, g_ui.sessions, false, InpOnlyThisSymbol);
   }
   //--- Settings
   else if(StringFind(key, "set_tab_") == 0)
      g_ui.settingsTab = (int)StringToInteger(StringSubstr(key, 8));
   else if(key == "set_arr") g_ui.risk.autoRR = !g_ui.risk.autoRR;
   else if(key == "set_asp") g_ui.risk.autoSaveProfit = !g_ui.risk.autoSaveProfit;
   else if(key == "set_timer") g_ui.risk.showCandleTimer = !g_ui.risk.showCandleTimer;
   else if(key == "set_m1") g_ui.risk.blockM1 = !g_ui.risk.blockM1;
   else if(key == "set_pause") g_ui.risk.pauseAfterLoss = !g_ui.risk.pauseAfterLoss;
   else if(key == "set_rrlive") g_ui.risk.showRRLive = !g_ui.risk.showRRLive;
   else if(key == "set_detail") g_ui.risk.showTpSlDetail = !g_ui.risk.showTpSlDetail;
   else if(key == "set_news_ref") NabzNewsFetchToday(g_ui.news);
   else if(key == "set_reset_peak")
   {
      g_ui.prop.peakEquity = AccountInfoDouble(ACCOUNT_EQUITY);
      NabzPropResetDay(g_ui.prop);
   }
   else if(StringFind(key, "set_pc25_") == 0)
      g_ui.risk.partialClose[(int)StringToInteger(StringSubstr(key, 9))] = 0.25;
   else if(StringFind(key, "set_pc50_") == 0)
      g_ui.risk.partialClose[(int)StringToInteger(StringSubstr(key, 9))] = 0.50;
   else if(StringFind(key, "set_pc75_") == 0)
      g_ui.risk.partialClose[(int)StringToInteger(StringSubstr(key, 9))] = 0.75;

   NabzUI_Redraw(g_ui);
}

void NabzOpenLink(const string url)
{
   Print("NABZ open: ", url);
   Alert("NABZ link → ", url);
}

//+------------------------------------------------------------------+
