//+------------------------------------------------------------------+
//| NabzUI.mqh — Obsidian Gold interactive panel                     |
//+------------------------------------------------------------------+
#ifndef NABZ_UI_MQH
#define NABZ_UI_MQH

#include "NabzTheme.mqh"
#include "NabzRisk.mqh"
#include "NabzTrade.mqh"
#include "NabzProp.mqh"
#include "NabzNews.mqh"
#include "NabzJournal.mqh"
#include "NabzSessions.mqh"

//--- Shared UI state
struct NabzUIState
{
   NabzRiskState   risk;
   NabzPropConfig  propCfg;
   NabzPropSnapshot prop;
   NabzNewsState   news;
   NabzJournalStats journal;
   NabzSessionHours sessions;
   NabzDragPlan    drag;
   ENUM_NABZ_VIEW  view;
   bool            eaActive;
   bool            showSessions;
   int             panelH;
   int             pulse;          // 0/1 for ACTIVE glow
   datetime        lastLossPauseUntil;
   string          coachTip;
   int             settingsTab;    // 0 RISK 1 Account 2 NEWS 3 MANAGE 4 ALERT
};

//+------------------------------------------------------------------+
void NabzUI_DeleteAll()
{
   ObjectsDeleteAll(0, NABZ_PREFIX);
}

bool NabzUI_Rect(const string name, const int x, const int y, const int w, const int h,
                 const color bg, const color border, const int z = 0)
{
   string n = NABZ_PREFIX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   return true;
}

bool NabzUI_Label(const string name, const int x, const int y, const string text,
                  const color clr, const int size = 9, const string font = "Segoe UI",
                  const ENUM_ANCHOR_POINT anchor = ANCHOR_LEFT_UPPER, const int z = 1)
{
   string n = NABZ_PREFIX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, anchor);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, font);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   return true;
}

bool NabzUI_Button(const string name, const int x, const int y, const int w, const int h,
                   const string text, const color bg, const color fg, const int z = 2)
{
   string n = NABZ_PREFIX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI Semibold");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, NabzMix(bg, COL_BORDER_HI, 35));
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   return true;
}

bool NabzUI_Edit(const string name, const int x, const int y, const int w, const int h,
                 const string text, const color bg, const color fg)
{
   string n = NABZ_PREFIX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, COL_GOLD_DIM);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 3);
   return true;
}

void NabzUI_Progress(const string name, const int x, const int y, const int w, const int h,
                     const double pct01, const color fill, const color track)
{
   double p = MathMax(0.0, MathMin(1.0, pct01));
   NabzUI_Rect(name + "_trk", x, y, w, h, track, track, 1);
   int fw = (int)MathMax(2, w * p);
   NabzUI_Rect(name + "_fil", x, y, fw, h, fill, fill, 2);
}

void NabzUI_Chip(const string name, const int x, const int y, const int w, const int h,
                 const string text, const color bg, const color fg)
{
   NabzUI_Rect(name + "_bg", x, y, w, h, bg, NabzMix(bg, COL_BORDER_HI, 40), 1);
   NabzUI_Label(name + "_tx", x + w / 2, y + h / 2 - 6, text, fg, 8, "Segoe UI Semibold", ANCHOR_CENTER, 2);
}

//+------------------------------------------------------------------+
void NabzUI_DrawHeader(NabzUIState &ui, const int x, int &y)
{
   double spread = (SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID))
                   / SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   // Gold accent bar under title
   NabzUI_Rect("hdr_accent", x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 3, COL_GOLD, COL_GOLD, 2);
   y += 8;

   NabzUI_Label("hdr_title", x, y, NABZ_TITLE, COL_GOLD_GLOW, 14, "Segoe UI Semibold");
   NabzUI_Label("hdr_ver", x + 62, y + 4, "v" + NABZ_VERSION, COL_MUTED, 8, "Segoe UI");

   string sp = StringFormat("SP %.1f", spread);
   color spCol = (spread > 50 ? COL_WARN : COL_INFO);
   NabzUI_Chip("hdr_sp", x + NABZ_PANEL_W - 2 * NABZ_PAD - 72, y - 2, 72, 22, sp, COL_BG3, spCol);
   y += 28;
}

void NabzUI_DrawRisk(NabzUIState &ui, const int x, int &y)
{
   NabzUI_Label("risk_lab", x, y, "RISK ENGINE", COL_MUTED, 8, "Segoe UI Semibold");
   y += 16;

   NabzUI_Button("risk_minus", x, y, 30, NABZ_BTN_H, "−", COL_BG3, COL_TEXT);
   NabzUI_Edit("risk_val", x + 34, y, 70, NABZ_BTN_H, DoubleToString(ui.risk.value, 2), COL_BG3, COL_GOLD);
   NabzUI_Button("risk_plus", x + 108, y, 30, NABZ_BTN_H, "+", COL_BG3, COL_TEXT);

   int bx = x + 144;
   int bw = 26;
   for(int i = 0; i < 4; ++i)
   {
      ENUM_NABZ_RISK_MODE m = (ENUM_NABZ_RISK_MODE)i;
      bool on = (ui.risk.mode == m);
      color bg = on ? COL_GOLD : COL_BG3;
      color fg = on ? COL_BG0 : COL_MUTED;
      NabzUI_Button("risk_mode_" + IntegerToString(i), bx + i * (bw + 3), y, bw, NABZ_BTN_H,
                    NabzRiskModeLabel(m), bg, fg);
   }
   y += NABZ_BTN_H + NABZ_GAP;
}

void NabzUI_DrawExec(NabzUIState &ui, const int x, int &y)
{
   int bw = (NABZ_PANEL_W - 2 * NABZ_PAD - 2 * NABZ_GAP) / 3;
   int h = NABZ_BTN_H + 2;

   // Row 1
   NabzUI_Button("btn_buy",  x, y, bw, h, "BUY", COL_BUY, COL_BG0);
   NabzUI_Button("btn_sell", x + bw + NABZ_GAP, y, bw, h, "SELL", COL_SELL, COL_BG0);
   NabzUI_Button("btn_drag", x + 2 * (bw + NABZ_GAP), y, bw, h,
                 ui.drag.active ? "DRAG ●" : "DRAG",
                 ui.drag.active ? COL_GOLD : COL_BG3,
                 ui.drag.active ? COL_BG0 : COL_TEXT);
   y += h + NABZ_GAP;

   // Row 2
   NabzUI_Button("btn_pbuy",  x, y, bw, h, "P.Buy", NabzMix(COL_BUY, COL_BG2, 55), COL_TEXT);
   NabzUI_Button("btn_psell", x + bw + NABZ_GAP, y, bw, h, "P.Sell", NabzMix(COL_SELL, COL_BG2, 55), COL_TEXT);
   NabzUI_Button("btn_cancelp", x + 2 * (bw + NABZ_GAP), y, bw, h, "CancelP", COL_BG3, COL_MUTED);
   y += h + NABZ_GAP;

   // Row 3
   color actBg = ui.eaActive ? (ui.pulse ? COL_GOLD : COL_GOLD_DIM) : COL_BG3;
   color actFg = ui.eaActive ? COL_BG0 : COL_MUTED;
   NabzUI_Button("btn_active", x, y, bw, h, ui.eaActive ? "ACTIVE" : "PAUSED", actBg, actFg);
   NabzUI_Button("btn_sos", x + bw + NABZ_GAP, y, bw, h, "SOS", COL_SOS, COL_TEXT);
   NabzUI_Button("btn_cancel", x + 2 * (bw + NABZ_GAP), y, bw, h, "CANCEL", COL_BG3, COL_MUTED);
   y += h + NABZ_GAP;

   // Row 4
   NabzUI_Button("btn_closeall", x, y, bw, h, "CLOSE ALL", NabzMix(COL_INFO, COL_BG2, 40), COL_TEXT);
   NabzUI_Button("btn_savepos", x + bw + NABZ_GAP, y, bw, h, "Save Pos", COL_BG3, COL_TEXT);
   NabzUI_Button("btn_riskfree", x + 2 * (bw + NABZ_GAP), y, bw, h, "RISK FREE", COL_WARN, COL_BG0);
   y += h + NABZ_SECTION_GAP;
}

void NabzUI_DrawPositions(NabzUIState &ui, const int x, int &y)
{
   NabzUI_Label("pos_lab", x, y, "POSITIONS", COL_MUTED, 8, "Segoe UI Semibold");
   y += 16;

   int shown = 0;
   double totRisk = 0, totPl = 0;
   int openN = 0;

   for(int i = 0; i < PositionsTotal(); ++i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      if(sym != _Symbol) continue;
      openN++;
      long type = PositionGetInteger(POSITION_TYPE);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double profit = PositionGetDouble(POSITION_PROFIT)
                    + PositionGetDouble(POSITION_SWAP);
      double riskPct = (sl > 0) ? NabzPositionRiskPct(sym, vol, open, sl) : 0;
      double plPct = NabzProfitPct(profit);
      totRisk += riskPct;
      totPl += plPct;

      if(shown < 3)
      {
         string side = (type == POSITION_TYPE_BUY ? "BUY" : "SELL");
         color sideCol = (type == POSITION_TYPE_BUY ? COL_BUY : COL_SELL);
         NabzUI_Rect("posr_" + IntegerToString(shown), x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 24, COL_BG2, COL_BORDER, 1);
         NabzUI_Label("pos_side_" + IntegerToString(shown), x + 6, y + 5,
                      side, sideCol, 8, "Segoe UI Semibold");
         NabzUI_Label("pos_info_" + IntegerToString(shown), x + 42, y + 5,
                      StringFormat("%s  %.2f%%", sym, riskPct), COL_TEXT, 8);
         NabzUI_Label("pos_pl_" + IntegerToString(shown), x + 150, y + 5,
                      NabzPctFmt(plPct, 2), (plPct >= 0 ? COL_BUY : COL_SELL), 8);
         NabzUI_Button("pos_rf_" + IntegerToString(shown), x + 198, y + 2, 20, 20, "R", COL_WARN, COL_BG0);
         NabzUI_Button("pos_x_" + IntegerToString(shown), x + 220, y + 2, 20, 20, "✕", COL_SELL_DIM, COL_TEXT);
         // store ticket mapping via object tooltip
         ObjectSetString(0, NABZ_PREFIX + "pos_rf_" + IntegerToString(shown), OBJPROP_TOOLTIP, IntegerToString(ticket));
         ObjectSetString(0, NABZ_PREFIX + "pos_x_" + IntegerToString(shown), OBJPROP_TOOLTIP, IntegerToString(ticket));
         y += 26;
         shown++;
      }
   }

   if(openN == 0)
   {
      NabzUI_Label("pos_empty", x, y, "No open positions — ready.", COL_DIM, 8);
      y += 18;
   }

   NabzUI_Label("pos_sum", x, y,
                StringFormat("Open %d   Risk %s   P/L %s", openN, NabzPctFmt(totRisk, 2), NabzPctFmt(totPl, 2)),
                COL_MUTED, 8);
   y += 18;
}

void NabzUI_DrawProp(NabzUIState &ui, const int x, int &y)
{
   NabzUI_Label("prop_lab", x, y, "LIVE ANALYSIS  ·  PROP", COL_MUTED, 8, "Segoe UI Semibold");
   NabzUI_Chip("prop_live", x + NABZ_PANEL_W - 2 * NABZ_PAD - 48, y - 2, 48, 16, "LIVE",
               NabzMix(COL_INFO, COL_BG1, 70), COL_INFO);
   y += 18;

   // Total DD
   NabzUI_Label("dd_t_l", x, y, "Total DD", COL_MUTED, 8);
   NabzUI_Label("dd_t_v", x + NABZ_PANEL_W - 2 * NABZ_PAD, y,
                StringFormat("%.2f%%", ui.prop.totalDD), COL_TEXT, 8, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 14;
   NabzUI_Progress("dd_t", x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 5,
                   ui.prop.totalDD / MathMax(0.01, ui.propCfg.maxTotalDD),
                   (ui.prop.totalDD > ui.propCfg.maxTotalDD * 0.7 ? COL_DANGER : COL_WARN), COL_PROGRESS_BG);
   y += 10;

   // Daily DD
   NabzUI_Label("dd_d_l", x, y, "Daily DD", COL_MUTED, 8);
   NabzUI_Label("dd_d_v", x + NABZ_PANEL_W - 2 * NABZ_PAD, y,
                StringFormat("%.2f%%", ui.prop.dailyDD), COL_TEXT, 8, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 14;
   NabzUI_Progress("dd_d", x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 5,
                   ui.prop.dailyDD / MathMax(0.01, ui.propCfg.maxDailyDD),
                   (ui.prop.dailyDD > ui.propCfg.maxDailyDD * 0.7 ? COL_DANGER : COL_INFO), COL_PROGRESS_BG);
   y += 10;

   // Target
   NabzUI_Label("tgt_l", x, y, "Target", COL_MUTED, 8);
   NabzUI_Label("tgt_v", x + NABZ_PANEL_W - 2 * NABZ_PAD, y,
                StringFormat("%.1f%%", ui.prop.targetPct), COL_BUY, 8, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 14;
   NabzUI_Progress("tgt", x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 6,
                   ui.prop.targetPct / 100.0, COL_GOLD, COL_PROGRESS_BG);
   y += 12;

   NabzUI_Label("frisk", x, y,
                StringFormat("Floating risk  %s", NabzPctFmt(-ui.prop.floatingRisk, 2)),
                COL_MUTED, 8);
   y += 18;
}

void NabzUI_DrawNews(NabzUIState &ui, const int x, int &y)
{
   NabzUI_Label("news_lab", x, y, "ECONOMIC NEWS  ·  TODAY", COL_MUTED, 8, "Segoe UI Semibold");
   NabzUI_Button("news_prev", x + NABZ_PANEL_W - 2 * NABZ_PAD - 48, y - 4, 22, 20, "‹", COL_BG3, COL_TEXT);
   NabzUI_Button("news_next", x + NABZ_PANEL_W - 2 * NABZ_PAD - 24, y - 4, 22, 20, "›", COL_BG3, COL_TEXT);
   y += 18;

   NabzUI_Rect("news_box", x, y, NABZ_PANEL_W - 2 * NABZ_PAD, 54, COL_BG2, COL_BORDER, 1);
   for(int i = 0; i < 3; ++i)
   {
      int idx = ui.news.offset + i;
      string line = (idx < ui.news.count) ? NabzNewsLine(ui.news, idx) : (i == 0 ? "No events loaded" : "");
      color c = COL_MUTED;
      if(idx < ui.news.count)
         c = ui.news.items[idx].released ? COL_DIM : COL_TEXT;
      NabzUI_Label("news_l" + IntegerToString(i), x + 6, y + 4 + i * 16, line, c, 7, "Segoe UI");
   }
   y += 60;
}

void NabzUI_DrawNav(NabzUIState &ui, const int x, int &y)
{
   string tabs[6] = {"JOU", "SESS", "ECO", "Coach", "%", "Sett"};
   ENUM_NABZ_VIEW views[6] = {NABZ_VIEW_JOURNAL, NABZ_VIEW_SESSIONS, NABZ_VIEW_ECO,
                              NABZ_VIEW_COACH, NABZ_VIEW_PCT, NABZ_VIEW_SETTINGS};
   int bw = (NABZ_PANEL_W - 2 * NABZ_PAD - 5 * 4) / 6;
   for(int i = 0; i < 6; ++i)
   {
      bool on = (ui.view == views[i]);
      NabzUI_Button("nav_" + IntegerToString(i), x + i * (bw + 4), y, bw, 26,
                    tabs[i], on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += 32;

   int fw = (NABZ_PANEL_W - 2 * NABZ_PAD - 2 * NABZ_GAP) / 3;
   NabzUI_Button("lnk_signal", x, y, fw, 24, "SIGNAL", COL_BG2, COL_INFO);
   NabzUI_Button("lnk_edu", x + fw + NABZ_GAP, y, fw, 24, "EDUCATION", COL_BG2, COL_MUTED);
   NabzUI_Button("lnk_web", x + 2 * (fw + NABZ_GAP), y, fw, 24, "WEBSITE", COL_BG2, COL_MUTED);
   y += 30;
}

//+------------------------------------------------------------------+
void NabzUI_DrawMainPanel(NabzUIState &ui)
{
   int x0 = NABZ_PANEL_X;
   int y0 = NABZ_PANEL_Y;
   int x = x0 + NABZ_PAD;
   int y = y0 + NABZ_PAD;

   // Soft outer glow frame
   NabzUI_Rect("panel_glow", x0 - 2, y0 - 2, NABZ_PANEL_W + 4, ui.panelH + 4,
               NabzMix(COL_GOLD, COL_BG0, 88), NabzMix(COL_GOLD, COL_BG0, 75), 0);
   NabzUI_Rect("panel_body", x0, y0, NABZ_PANEL_W, ui.panelH, COL_BG1, COL_BORDER, 1);
   // Left gold rail
   NabzUI_Rect("panel_rail", x0, y0, 3, ui.panelH, COL_GOLD, COL_GOLD, 2);

   NabzUI_DrawHeader(ui, x, y);
   NabzUI_DrawRisk(ui, x, y);
   NabzUI_DrawExec(ui, x, y);
   NabzUI_DrawPositions(ui, x, y);
   NabzUI_DrawProp(ui, x, y);
   NabzUI_DrawNews(ui, x, y);
   NabzUI_DrawNav(ui, x, y);

   ui.panelH = (y - y0) + NABZ_PAD;
   // resize body to measured height
   ObjectSetInteger(0, NABZ_PREFIX + "panel_body", OBJPROP_YSIZE, ui.panelH);
   ObjectSetInteger(0, NABZ_PREFIX + "panel_glow", OBJPROP_YSIZE, ui.panelH + 4);
   ObjectSetInteger(0, NABZ_PREFIX + "panel_rail", OBJPROP_YSIZE, ui.panelH);
}

//+------------------------------------------------------------------+
void NabzUI_DrawJournal(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_JOURNAL)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "jou_");
      return;
   }

   ObjectsDeleteAll(0, NABZ_PREFIX + "jou_");

   int x0 = NABZ_PANEL_X + NABZ_PANEL_W + 16;
   int y0 = NABZ_PANEL_Y;
   int w = 420;
   int h = 460;
   int x = x0 + 14;
   int y = y0 + 12;

   NabzUI_Rect("jou_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_INFO, COL_BG0, 90), COL_BORDER, 0);
   NabzUI_Rect("jou_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("jou_rail", x0, y0, 3, h, COL_INFO, COL_INFO, 2);

   NabzUI_Label("jou_title", x, y, "TRADING JOURNAL", COL_GOLD_GLOW, 12, "Segoe UI Semibold");
   NabzUI_Button("jou_close", x0 + w - 36, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);

   y += 26;
   NabzUI_Button("jou_week", x, y, 70, 24, "WEEK",
                 ui.journal.weekMode ? COL_GOLD : COL_BG3,
                 ui.journal.weekMode ? COL_BG0 : COL_MUTED);
   NabzUI_Button("jou_month", x + 76, y, 70, 24, "MONTH",
                 !ui.journal.weekMode ? COL_GOLD : COL_BG3,
                 !ui.journal.weekMode ? COL_BG0 : COL_MUTED);
   NabzUI_Chip("jou_cal", x + 160, y, 100, 24, "CAL · Gregorian", COL_BG3, COL_MUTED);
   NabzUI_Chip("jou_plu", x + 268, y, 60, 24, "P/L · $", COL_BG3, COL_MUTED);
   y += 32;

   string range = TimeToString(ui.journal.rangeFrom, TIME_DATE) + "  →  " +
                  TimeToString(ui.journal.rangeTo, TIME_DATE);
   NabzUI_Label("jou_range", x, y, range, COL_MUTED, 8);
   y += 18;

   // Day strip
   int dw = 72;
   int shown = 0;
   for(int i = 0; i < ui.journal.dayCount && shown < 5; ++i)
   {
      NabzDayStat ds = ui.journal.days[i];
      MqlDateTime dt; TimeToStruct(ds.day, dt);
      string names[7] = {"SUN","MON","TUE","WED","THU","FRI","SAT"};
      bool profit = ds.net > 0;
      color bg = profit ? NabzMix(COL_BUY, COL_BG1, 70) : COL_BG2;
      NabzUI_Rect("jou_d" + IntegerToString(shown), x + shown * (dw + 6), y, dw, 52, bg, COL_BORDER, 1);
      NabzUI_Label("jou_dn" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 4,
                   StringFormat("%s %d/%02d", names[dt.day_of_week], dt.mon, dt.day), COL_MUTED, 7);
      NabzUI_Label("jou_dp" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 18,
                   NabzMoneyFmt(ds.net), profit ? COL_BUY : COL_SELL, 9, "Segoe UI Semibold");
      NabzUI_Label("jou_dw" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 34,
                   StringFormat("WR %.0f%%  N %d", ds.winRate, ds.trades), COL_DIM, 7);
      shown++;
   }
   if(shown == 0)
   {
      NabzUI_Label("jou_empty", x, y + 10, "No closed trades in this range yet.", COL_DIM, 9);
   }
   y += 64;

   // Stats grid
   NabzUI_Rect("jou_stats", x, y, w - 28, 120, COL_BG2, COL_BORDER, 1);
   int cx = x + 10, cy = y + 8;
   NabzUI_Label("jou_net_l", cx, cy, "NET", COL_MUTED, 7);
   NabzUI_Label("jou_net_v", cx, cy + 14, NabzMoneyFmt(ui.journal.net),
                ui.journal.net >= 0 ? COL_BUY : COL_SELL, 12, "Segoe UI Semibold");
   NabzUI_Label("jou_wr_l", cx + 130, cy, "WIN RATE", COL_MUTED, 7);
   NabzUI_Label("jou_wr_v", cx + 130, cy + 14, StringFormat("%.1f%%", ui.journal.winRate), COL_TEXT, 12, "Segoe UI Semibold");
   NabzUI_Label("jou_tr_l", cx + 250, cy, "TRADES", COL_MUTED, 7);
   NabzUI_Label("jou_tr_v", cx + 250, cy + 14, IntegerToString(ui.journal.trades), COL_TEXT, 12, "Segoe UI Semibold");

   cy += 42;
   NabzUI_Label("jou_pf_l", cx, cy, "PROFIT FACTOR", COL_MUTED, 7);
   NabzUI_Label("jou_pf_v", cx, cy + 14, DoubleToString(ui.journal.profitFactor, 2), COL_GOLD, 11, "Segoe UI Semibold");
   NabzUI_Label("jou_avg_l", cx + 130, cy, "AVG / TRADE", COL_MUTED, 7);
   NabzUI_Label("jou_avg_v", cx + 130, cy + 14, NabzMoneyFmt(ui.journal.avgTrade), COL_TEXT, 11, "Segoe UI Semibold");
   NabzUI_Label("jou_st_l", cx + 250, cy, "STREAKS", COL_MUTED, 7);
   NabzUI_Label("jou_st_v", cx + 250, cy + 14,
                StringFormat("W%d / L%d", ui.journal.winStreak, ui.journal.lossStreak), COL_TEXT, 11);

   cy += 42;
   NabzUI_Label("jou_best", cx, cy,
                "BEST  " + (ui.journal.bestDay > 0 ? TimeToString(ui.journal.bestDay, TIME_DATE) : "—") +
                "  " + NabzMoneyFmt(ui.journal.bestDayNet), COL_MUTED, 8);
   NabzUI_Label("jou_sess", cx + 200, cy,
                "BEST SESSION  " + ui.journal.bestSession + "  " + NabzMoneyFmt(ui.journal.bestSessionNet),
                COL_MUTED, 8);
   y += 132;

   // Equity curve (ASCII-ish spark via labels + mini bars)
   NabzUI_Label("jou_curve_t", x, y, "BALANCE  /  EQUITY CURVE", COL_MUTED, 8, "Segoe UI Semibold");
   y += 16;
   NabzUI_Rect("jou_curve_bg", x, y, w - 28, 110, COL_BG0, COL_BORDER, 1);

   if(ui.journal.curveN > 1)
   {
      double mn = ui.journal.curve[0], mx = ui.journal.curve[0];
      for(int i = 1; i < ui.journal.curveN; ++i)
      {
         if(ui.journal.curve[i] < mn) mn = ui.journal.curve[i];
         if(ui.journal.curve[i] > mx) mx = ui.journal.curve[i];
      }
      double span = MathMax(1.0, mx - mn);
      int plotW = w - 40;
      int plotH = 90;
      int samples = MathMin(ui.journal.curveN, 40);
      for(int i = 0; i < samples; ++i)
      {
         int src = i * (ui.journal.curveN - 1) / MathMax(1, samples - 1);
         double v = ui.journal.curve[src];
         int barH = (int)((v - mn) / span * plotH);
         if(barH < 2) barH = 2;
         int bx = x + 8 + i * (plotW / samples);
         int by = y + 100 - barH;
         NabzUI_Rect("jou_bar_" + IntegerToString(i), bx, by, MathMax(2, plotW / samples - 2), barH,
                     (i == samples - 1 ? COL_WARN : COL_BUY), (i == samples - 1 ? COL_WARN : COL_BUY), 2);
      }
      NabzUI_Label("jou_cmin", x + 8, y + 96, DoubleToString(mn, 0), COL_DIM, 7);
      NabzUI_Label("jou_cmax", x + 8, y + 4, DoubleToString(mx, 0), COL_DIM, 7);
   }
   else
   {
      NabzUI_Label("jou_cnodata", x + 12, y + 40, "Curve appears after closed trades.", COL_DIM, 9);
   }
   y += 118;
   NabzUI_Button("jou_bal", x, y, 60, 22, "BAL", COL_BG3, COL_BUY);
   NabzUI_Button("jou_eq", x + 66, y, 70, 22, "EQUITY", COL_BG3, COL_WARN);
   NabzUI_Button("jou_both", x + 142, y, 60, 22, "BOTH", COL_GOLD, COL_BG0);
   NabzUI_Chip("jou_xaxis", x + 220, y, 90, 22, "X · TRADES", COL_BG3, COL_MUTED);
}

//+------------------------------------------------------------------+
void NabzUI_DrawSettings(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_SETTINGS)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "set_");
      return;
   }

   ObjectsDeleteAll(0, NABZ_PREFIX + "set_");

   int x0 = NABZ_PANEL_X + NABZ_PANEL_W + 16;
   int y0 = NABZ_PANEL_Y;
   int w = 360;
   int h = 420;
   int x = x0 + 14;
   int y = y0 + 12;

   NabzUI_Rect("set_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_GOLD, COL_BG0, 90), COL_BORDER, 0);
   NabzUI_Rect("set_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("set_rail", x0, y0, 3, h, COL_GOLD, COL_GOLD, 2);

   NabzUI_Label("set_title", x, y, "NABZ  /  SETTINGS", COL_GOLD_GLOW, 12, "Segoe UI Semibold");
   NabzUI_Button("set_close", x0 + w - 36, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);
   y += 28;

   string tabs[5] = {"RISK", "Account", "NEWS", "MANAGE", "ALERT"};
   int tw = 62;
   for(int i = 0; i < 5; ++i)
   {
      bool on = (ui.settingsTab == i);
      NabzUI_Button("set_tab_" + IntegerToString(i), x + i * (tw + 4), y, tw, 24,
                    tabs[i], on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += 36;

   if(ui.settingsTab == 3) // MANAGE
   {
      NabzUI_Label("set_auto_h", x, y, "AUTOMATION", COL_MUTED, 8, "Segoe UI Semibold");
      y += 18;
      NabzUI_Button("set_arf", x, y, 150, 26,
                    ui.risk.autoRiskFree ? "Auto Risk Free  ON" : "Auto Risk Free  OFF",
                    ui.risk.autoRiskFree ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Button("set_arr", x + 160, y, 150, 26,
                    ui.risk.autoRR ? "Auto R:R  ON" : "Auto R:R  OFF",
                    ui.risk.autoRR ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 32;
      NabzUI_Label("set_rr_l", x, y + 4, "Default Reward (R)", COL_MUTED, 8);
      NabzUI_Edit("set_rr_v", x + 140, y, 60, 24, DoubleToString(ui.risk.defaultRR, 2), COL_BG3, COL_GOLD);
      NabzUI_Button("set_asp", x + 210, y, 100, 24,
                    ui.risk.autoSaveProfit ? "Save Profit ON" : "Save Profit OFF",
                    ui.risk.autoSaveProfit ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 36;

      NabzUI_Label("set_part_h", x, y, "PARTIAL SCALE-OUT", COL_MUTED, 8, "Segoe UI Semibold");
      y += 18;
      for(int i = 0; i < 3; ++i)
      {
         NabzUI_Label("set_prl" + IntegerToString(i), x, y + 4,
                      StringFormat("Reward %d", i + 1), COL_TEXT, 8);
         NabzUI_Edit("set_prv" + IntegerToString(i), x + 70, y, 50, 24,
                     DoubleToString(ui.risk.partialR[i], 2), COL_BG3, COL_TEXT);
         NabzUI_Button("set_pc25_" + IntegerToString(i), x + 130, y, 44, 24, "0.25",
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc50_" + IntegerToString(i), x + 178, y, 44, 24, "0.50",
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc75_" + IntegerToString(i), x + 226, y, 44, 24, "0.75",
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_BG0 : COL_MUTED);
         y += 30;
      }

      NabzUI_Label("set_vis_h", x, y, "VISUAL  &  DISCIPLINE", COL_MUTED, 8, "Segoe UI Semibold");
      y += 18;
      NabzUI_Button("set_timer", x, y, 150, 26,
                    ui.risk.showCandleTimer ? "Candle Timer  ON" : "Candle Timer  OFF",
                    ui.risk.showCandleTimer ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Button("set_m1", x + 160, y, 150, 26,
                    ui.risk.blockM1 ? "Block M1  ON" : "Block M1  OFF",
                    ui.risk.blockM1 ? COL_WARN : COL_BG3, COL_BG0);
      y += 30;
      NabzUI_Button("set_pause", x, y, 150, 26,
                    ui.risk.pauseAfterLoss ? "15m Pause  ON" : "15m Pause  OFF",
                    ui.risk.pauseAfterLoss ? COL_WARN : COL_BG3, ui.risk.pauseAfterLoss ? COL_BG0 : COL_MUTED);
      NabzUI_Button("set_rrlive", x + 160, y, 150, 26,
                    ui.risk.showRRLive ? "RR Live  ON" : "RR Live  OFF",
                    ui.risk.showRRLive ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 30;
      NabzUI_Button("set_detail", x, y, 150, 26,
                    ui.risk.showTpSlDetail ? "TP/SL Detail  ON" : "TP/SL Detail  OFF",
                    ui.risk.showTpSlDetail ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Chip("set_unit", x + 160, y, 150, 26,
                  ui.risk.detailUnit == NABZ_UNIT_PERCENT ? "Unit · PERCENT" :
                  (ui.risk.detailUnit == NABZ_UNIT_MONEY ? "Unit · MONEY" : "Unit · POINTS"),
                  COL_BG3, COL_MUTED);
   }
   else if(ui.settingsTab == 1) // Account / Prop
   {
      NabzUI_Label("set_acc_h", x, y, "PROP LIMITS", COL_MUTED, 8, "Segoe UI Semibold");
      y += 18;
      NabzUI_Label("set_mtdd_l", x, y + 4, "Max Total DD %", COL_TEXT, 8);
      NabzUI_Edit("set_mtdd", x + 140, y, 70, 24, DoubleToString(ui.propCfg.maxTotalDD, 1), COL_BG3, COL_TEXT);
      y += 30;
      NabzUI_Label("set_mddd_l", x, y + 4, "Max Daily DD %", COL_TEXT, 8);
      NabzUI_Edit("set_mddd", x + 140, y, 70, 24, DoubleToString(ui.propCfg.maxDailyDD, 1), COL_BG3, COL_TEXT);
      y += 30;
      NabzUI_Label("set_pt_l", x, y + 4, "Profit Target %", COL_TEXT, 8);
      NabzUI_Edit("set_pt", x + 140, y, 70, 24, DoubleToString(ui.propCfg.profitTarget, 1), COL_BG3, COL_GOLD);
      y += 30;
      NabzUI_Label("set_sb_l", x, y + 4, "Start Balance", COL_TEXT, 8);
      NabzUI_Edit("set_sb", x + 140, y, 100, 24, DoubleToString(ui.propCfg.startBalance, 2), COL_BG3, COL_TEXT);
      y += 36;
      NabzUI_Button("set_reset_peak", x, y, 160, 28, "Reset Peak Equity", COL_BG3, COL_WARN);
   }
   else if(ui.settingsTab == 0)
   {
      NabzUI_Label("set_risk_h", x, y, "Default risk value & mode live on the main panel.", COL_MUTED, 9);
      y += 24;
      NabzUI_Label("set_risk_n", x, y, "Tip: switch % / $ / LOT / BAL from the RISK ENGINE row.", COL_DIM, 8);
   }
   else if(ui.settingsTab == 2)
   {
      NabzUI_Label("set_news_h", x, y, "News uses the MetaTrader economic calendar.", COL_MUTED, 9);
      y += 24;
      NabzUI_Button("set_news_ref", x, y, 140, 28, "Refresh News", COL_INFO, COL_BG0);
   }
   else
   {
      NabzUI_Label("set_alert_h", x, y, "Alerts fire on SOS, DD breach, and news soon.", COL_MUTED, 9);
      y += 24;
      NabzUI_Label("set_alert_n", x, y, "Enable push alerts in terminal options for mobile.", COL_DIM, 8);
   }
}

//+------------------------------------------------------------------+
void NabzUI_DrawCoach(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_COACH)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "coach_");
      return;
   }
   int x0 = NABZ_PANEL_X + NABZ_PANEL_W + 16;
   int y0 = NABZ_PANEL_Y;
   int w = 320, h = 200;
   NabzUI_Rect("coach_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("coach_rail", x0, y0, 3, h, COL_WARN, COL_WARN, 2);
   NabzUI_Label("coach_t", x0 + 14, y0 + 12, "COACH", COL_WARN, 12, "Segoe UI Semibold");
   NabzUI_Button("coach_close", x0 + w - 36, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);
   NabzUI_Label("coach_tip", x0 + 14, y0 + 48, ui.coachTip, COL_TEXT, 9);
   NabzUI_Label("coach_sub", x0 + 14, y0 + 100,
                "Protect process over outcome.\nOne risk unit. One plan. Journal every exit.",
                COL_MUTED, 8);
}

void NabzUI_DrawPctTool(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_PCT)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "pct_");
      return;
   }
   int x0 = NABZ_PANEL_X + NABZ_PANEL_W + 16;
   int y0 = NABZ_PANEL_Y;
   int w = 280, h = 160;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   NabzUI_Rect("pct_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Label("pct_t", x0 + 14, y0 + 12, "% CALCULATOR", COL_INFO, 12, "Segoe UI Semibold");
   NabzUI_Button("pct_close", x0 + w - 36, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);
   NabzUI_Label("pct_b", x0 + 14, y0 + 48, "Balance  " + DoubleToString(bal, 2), COL_TEXT, 9);
   NabzUI_Label("pct_e", x0 + 14, y0 + 70, "Equity   " + DoubleToString(eq, 2), COL_TEXT, 9);
   NabzUI_Label("pct_r", x0 + 14, y0 + 100,
                StringFormat("1%% of equity = %.2f %s", eq * 0.01, AccountInfoString(ACCOUNT_CURRENCY)),
                COL_GOLD, 9);
}

//+------------------------------------------------------------------+
void NabzUI_DrawCandleTimer(NabzUIState &ui)
{
   ObjectsDeleteAll(0, NABZ_PREFIX + "timer_");
   if(!ui.risk.showCandleTimer) return;

   datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   int sec = PeriodSeconds(_Period);
   int left = (int)(t0 + sec - TimeCurrent());
   if(left < 0) left = 0;
   string txt = StringFormat("%02d:%02d", left / 60, left % 60);

   // Place near right price scale using chart pixel size
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int chartH = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   int tx = chartW - 90;
   int ty = chartH / 2 - 20;
   NabzUI_Rect("timer_bg", tx, ty, 70, 28, COL_BG1, COL_GOLD_DIM, 5);
   NabzUI_Label("timer_tx", tx + 35, ty + 6, txt, COL_GOLD_GLOW, 12, "Consolas", ANCHOR_UPPER);
}

void NabzUI_DrawDragLines(NabzUIState &ui)
{
   ObjectsDeleteAll(0, NABZ_PREFIX + "drag_");
   if(!ui.drag.active) return;

   string e = NABZ_PREFIX + "drag_entry";
   string s = NABZ_PREFIX + "drag_sl";
   string t = NABZ_PREFIX + "drag_tp";
   ObjectCreate(0, e, OBJ_HLINE, 0, 0, ui.drag.entry);
   ObjectCreate(0, s, OBJ_HLINE, 0, 0, ui.drag.sl);
   ObjectCreate(0, t, OBJ_HLINE, 0, 0, ui.drag.tp);
   ObjectSetInteger(0, e, OBJPROP_COLOR, COL_TEXT);
   ObjectSetInteger(0, s, OBJPROP_COLOR, COL_SELL);
   ObjectSetInteger(0, t, OBJPROP_COLOR, COL_BUY);
   ObjectSetInteger(0, e, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, s, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, t, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, e, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, s, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, t, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, e, OBJPROP_SELECTED, true);
   ObjectSetInteger(0, s, OBJPROP_SELECTED, true);
   ObjectSetInteger(0, t, OBJPROP_SELECTED, true);

   if(ui.risk.showTpSlDetail)
   {
      double risk = MathAbs(ui.drag.entry - ui.drag.sl);
      double reward = MathAbs(ui.drag.tp - ui.drag.entry);
      double rr = (risk > 0 ? reward / risk : 0);
      double riskPct = 0;
      // approximate using 1 lot then scale — show price %
      double mid = ui.drag.entry;
      if(mid > 0) riskPct = risk / mid * 100.0;
      string lab = NABZ_PREFIX + "drag_lab";
      ObjectCreate(0, lab, OBJ_TEXT, 0, TimeCurrent(), ui.drag.sl);
      ObjectSetString(0, lab, OBJPROP_TEXT,
                      StringFormat("SL %s | Risk %.2f%% | %.1fR",
                                   (ui.drag.isBuy ? "-" : "+") + DoubleToString(riskPct, 2),
                                   riskPct, rr));
      ObjectSetInteger(0, lab, OBJPROP_COLOR, COL_TEXT);
      ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 8);
      ObjectSetString(0, lab, OBJPROP_FONT, "Segoe UI");
   }

   // RR box
   string box = NABZ_PREFIX + "drag_box";
   ObjectCreate(0, box, OBJ_RECTANGLE, 0, iTime(_Symbol, PERIOD_CURRENT, 20), ui.drag.sl,
                iTime(_Symbol, PERIOD_CURRENT, 0), ui.drag.tp);
   ObjectSetInteger(0, box, OBJPROP_COLOR, ui.drag.isBuy ? COL_BUY_DIM : COL_SELL_DIM);
   ObjectSetInteger(0, box, OBJPROP_FILL, true);
   ObjectSetInteger(0, box, OBJPROP_BACK, true);
   ObjectSetInteger(0, box, OBJPROP_SELECTABLE, false);
}

void NabzUI_SyncDragFromChart(NabzUIState &ui)
{
   if(!ui.drag.active) return;
   string e = NABZ_PREFIX + "drag_entry";
   string s = NABZ_PREFIX + "drag_sl";
   string t = NABZ_PREFIX + "drag_tp";
   if(ObjectFind(0, e) >= 0) ui.drag.entry = ObjectGetDouble(0, e, OBJPROP_PRICE);
   if(ObjectFind(0, s) >= 0) ui.drag.sl = ObjectGetDouble(0, s, OBJPROP_PRICE);
   if(ObjectFind(0, t) >= 0) ui.drag.tp = ObjectGetDouble(0, t, OBJPROP_PRICE);
}

//+------------------------------------------------------------------+
void NabzUI_Redraw(NabzUIState &ui)
{
   NabzUI_DrawMainPanel(ui);
   NabzUI_DrawJournal(ui);
   NabzUI_DrawSettings(ui);
   NabzUI_DrawCoach(ui);
   NabzUI_DrawPctTool(ui);
   NabzUI_DrawCandleTimer(ui);
   NabzUI_DrawDragLines(ui);
   ChartRedraw(0);
}

void NabzUI_PickCoachTip(NabzUIState &ui)
{
   string tips[6];
   tips[0] = "Size first. Story second. Never reverse that order.";
   tips[1] = "If Daily DD > 50% of limit — stop. Tomorrow exists.";
   tips[2] = "RISK FREE is a gift. Take it when price gives +1R.";
   tips[3] = "News window: flat or tiny size. Ego is expensive.";
   tips[4] = "Journal the WHY, not just the P/L.";
   tips[5] = "ASIA/EU overlap is a scalpel — not a hammer.";
   int idx = (int)(TimeCurrent() % 6);
   ui.coachTip = tips[idx];
}

#endif
//+------------------------------------------------------------------+
