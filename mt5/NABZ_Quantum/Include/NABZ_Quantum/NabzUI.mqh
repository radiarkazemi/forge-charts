//+------------------------------------------------------------------+
//| NabzUI.mqh — Obsidian Gold interactive panel (v2.1)              |
//+------------------------------------------------------------------+
#ifndef NABZ_UI_MQH
#define NABZ_UI_MQH

#include <NABZ_Quantum/NabzTheme.mqh>
#include <NABZ_Quantum/NabzRisk.mqh>
#include <NABZ_Quantum/NabzTrade.mqh>
#include <NABZ_Quantum/NabzProp.mqh>
#include <NABZ_Quantum/NabzNews.mqh>
#include <NABZ_Quantum/NabzJournal.mqh>
#include <NABZ_Quantum/NabzSessions.mqh>

struct NabzUIState
{
   NabzRiskState    risk;
   NabzPropConfig   propCfg;
   NabzPropSnapshot prop;
   NabzNewsState    news;
   NabzJournalStats journal;
   NabzSessionHours sessions;
   NabzDragPlan     drag;
   NabzLayout       layout;
   ENUM_NABZ_VIEW   view;
   bool             eaActive;
   bool             showSessions;
   bool             minimized;
   int              panelH;
   int              pulse;
   datetime         lastLossPauseUntil;
   string           coachTip;
   int              settingsTab;
   string           candleLeft;   // mm:ss shown in header
};

void NabzUI_DeleteAll()
{
   ObjectsDeleteAll(0, NABZ_PREFIX);
}

void NabzUI_EnsureVis(const string n)
{
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, false);
   ObjectSetInteger(0, n, OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
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
   ObjectSetInteger(0, n, OBJPROP_XSIZE, MathMax(1, w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, MathMax(1, h));
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   NabzUI_EnsureVis(n);
   return true;
}

bool NabzUI_Label(const string name, const int x, const int y, const string text,
                  const color clr, const int size = 10, const string font = "Segoe UI",
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
   NabzUI_EnsureVis(n);
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
   ObjectSetInteger(0, n, OBJPROP_XSIZE, MathMax(1, w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, MathMax(1, h));
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI Semibold");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, NabzMix(bg, COL_BORDER_HI, 35));
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, z);
   NabzUI_EnsureVis(n);
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
   ObjectSetInteger(0, n, OBJPROP_XSIZE, MathMax(1, w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, MathMax(1, h));
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 11);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, COL_GOLD_DIM);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 3);
   NabzUI_EnsureVis(n);
   return true;
}

void NabzUI_Progress(const string name, const int x, const int y, const int w, const int h,
                     const double pct01, const color fill, const color track)
{
   double p = MathMax(0.0, MathMin(1.0, pct01));
   NabzUI_Rect(name + "_trk", x, y, w, h, track, track, 1);
   int fw = (int)MathMax(3, w * p);
   NabzUI_Rect(name + "_fil", x, y, fw, h, fill, fill, 2);
}

void NabzUI_Chip(const string name, const int x, const int y, const int w, const int h,
                 const string text, const color bg, const color fg, const int fontSize = 9)
{
   NabzUI_Rect(name + "_bg", x, y, w, h, bg, NabzMix(bg, COL_BORDER_HI, 40), 1);
   NabzUI_Label(name + "_tx", x + w / 2, y + h / 2, text, fg, fontSize, "Segoe UI Semibold", ANCHOR_CENTER, 2);
}

string NabzUI_CandleLeftText()
{
   datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   int sec = PeriodSeconds(_Period);
   int left = (int)(t0 + sec - TimeCurrent());
   if(left < 0) left = 0;
   return StringFormat("%02d:%02d", left / 60, left % 60);
}

//+------------------------------------------------------------------+
void NabzUI_DrawMiniBar(NabzUIState &ui)
{
   NabzLayout L = ui.layout;
   int x0 = L.panelX;
   int y0 = L.panelY;
   int w  = L.panelW;
   int h  = L.miniH;

   NabzUI_Rect("panel_glow", x0 - 2, y0 - 2, w + 4, h + 4,
               NabzMix(COL_GOLD, COL_BG0, 88), NabzMix(COL_GOLD, COL_BG0, 75), 0);
   NabzUI_Rect("panel_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("panel_rail", x0, y0, 3, h, COL_GOLD, COL_GOLD, 2);

   NabzUI_Label("hdr_title", x0 + L.pad, y0 + 14, NABZ_TITLE, COL_GOLD_GLOW, L.fontTitle, "Segoe UI Semibold");
   NabzUI_Label("hdr_ver", x0 + L.pad + 58, y0 + 18, "v" + NABZ_VERSION, COL_MUTED, L.fontTiny);

   double spread = (SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID))
                   / SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   NabzUI_Chip("hdr_sp", x0 + w - L.pad - 148, y0 + 12, 70, 28,
               StringFormat("SP %.1f", spread), COL_BG3, (spread > 50 ? COL_WARN : COL_INFO), 9);

   if(ui.risk.showCandleTimer)
      NabzUI_Chip("hdr_timer", x0 + w - L.pad - 74, y0 + 12, 40, 28,
                  ui.candleLeft, COL_BG3, COL_GOLD_GLOW, 9);

   // Expand button
   NabzUI_Button("btn_minmax", x0 + w - L.pad - 28, y0 + 12, 28, 28, "▢", COL_GOLD, COL_BG0);
   ObjectSetString(0, NABZ_PREFIX + "btn_minmax", OBJPROP_TOOLTIP, "Expand NABZ panel");

   ui.panelH = h;
}

void NabzUI_DrawHeader(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   double spread = (SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID))
                   / SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   NabzUI_Rect("hdr_accent", x, y, L.panelW - 2 * L.pad, 3, COL_GOLD, COL_GOLD, 2);
   y += 10;

   NabzUI_Label("hdr_title", x, y, NABZ_TITLE, COL_GOLD_GLOW, L.fontTitle, "Segoe UI Semibold");
   NabzUI_Label("hdr_ver", x + 64, y + 5, "v" + NABZ_VERSION, COL_MUTED, L.fontTiny);

   int right = x + L.panelW - 2 * L.pad;
   NabzUI_Button("btn_minmax", right - 30, y - 2, 30, 28, "—", COL_BG3, COL_TEXT);
   ObjectSetString(0, NABZ_PREFIX + "btn_minmax", OBJPROP_TOOLTIP, "Minimize NABZ panel");

   if(ui.risk.showCandleTimer)
   {
      NabzUI_Chip("hdr_timer", right - 108, y - 2, 72, 28, ui.candleLeft, COL_BG3, COL_GOLD_GLOW, 10);
      NabzUI_Chip("hdr_sp", right - 186, y - 2, 72, 28,
                  StringFormat("SP %.1f", spread), COL_BG3, (spread > 50 ? COL_WARN : COL_INFO), 9);
   }
   else
   {
      NabzUI_Chip("hdr_sp", right - 108, y - 2, 72, 28,
                  StringFormat("SP %.1f", spread), COL_BG3, (spread > 50 ? COL_WARN : COL_INFO), 9);
   }
   y += 34;
}

void NabzUI_DrawRisk(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   NabzUI_Label("risk_lab", x, y, "RISK ENGINE", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   y += 18;

   int inner = L.panelW - 2 * L.pad;
   int modeW = 34;
   int modes = 4 * modeW + 3 * 4;
   int leftW = inner - modes - L.gap;
   int minusW = 34;
   int plusW = 34;
   int editW = leftW - minusW - plusW - 8;

   NabzUI_Button("risk_minus", x, y, minusW, L.btnH, "−", COL_BG3, COL_TEXT);
   NabzUI_Edit("risk_val", x + minusW + 4, y, editW, L.btnH, DoubleToString(ui.risk.value, 2), COL_BG3, COL_GOLD);
   NabzUI_Button("risk_plus", x + minusW + 4 + editW + 4, y, plusW, L.btnH, "+", COL_BG3, COL_TEXT);

   int bx = x + leftW + L.gap;
   for(int i = 0; i < 4; ++i)
   {
      ENUM_NABZ_RISK_MODE m = (ENUM_NABZ_RISK_MODE)i;
      bool on = (ui.risk.mode == m);
      NabzUI_Button("risk_mode_" + IntegerToString(i), bx + i * (modeW + 4), y, modeW, L.btnH,
                    NabzRiskModeLabel(m), on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += L.btnH + L.gap + 2;
}

void NabzUI_DrawExec(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   int bw = (L.panelW - 2 * L.pad - 2 * L.gap) / 3;
   int h = L.btnH + 2;

   NabzUI_Button("btn_buy",  x, y, bw, h, "BUY", COL_BUY, COL_BG0);
   NabzUI_Button("btn_sell", x + bw + L.gap, y, bw, h, "SELL", COL_SELL, COL_BG0);
   NabzUI_Button("btn_drag", x + 2 * (bw + L.gap), y, bw, h,
                 ui.drag.active ? "DRAG ●" : "DRAG",
                 ui.drag.active ? COL_GOLD : COL_BG3,
                 ui.drag.active ? COL_BG0 : COL_TEXT);
   y += h + L.gap;

   NabzUI_Button("btn_pbuy",  x, y, bw, h, "P.Buy", NabzMix(COL_BUY, COL_BG2, 55), COL_TEXT);
   NabzUI_Button("btn_psell", x + bw + L.gap, y, bw, h, "P.Sell", NabzMix(COL_SELL, COL_BG2, 55), COL_TEXT);
   NabzUI_Button("btn_cancelp", x + 2 * (bw + L.gap), y, bw, h, "CancelP", COL_BG3, COL_MUTED);
   y += h + L.gap;

   color actBg = ui.eaActive ? (ui.pulse ? COL_GOLD : COL_GOLD_DIM) : COL_BG3;
   color actFg = ui.eaActive ? COL_BG0 : COL_MUTED;
   NabzUI_Button("btn_active", x, y, bw, h, ui.eaActive ? "ACTIVE" : "PAUSED", actBg, actFg);
   NabzUI_Button("btn_sos", x + bw + L.gap, y, bw, h, "SOS", COL_SOS, COL_TEXT);
   NabzUI_Button("btn_cancel", x + 2 * (bw + L.gap), y, bw, h, "CANCEL", COL_BG3, COL_MUTED);
   y += h + L.gap;

   NabzUI_Button("btn_closeall", x, y, bw, h, "CLOSE ALL", NabzMix(COL_INFO, COL_BG2, 40), COL_TEXT);
   NabzUI_Button("btn_savepos", x + bw + L.gap, y, bw, h, "Save Pos", COL_BG3, COL_TEXT);
   NabzUI_Button("btn_riskfree", x + 2 * (bw + L.gap), y, bw, h, "RISK FREE", COL_WARN, COL_BG0);
   y += h + L.section;
}

void NabzUI_DrawPositions(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   NabzUI_Label("pos_lab", x, y, "POSITIONS", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   y += 18;

   int shown = 0;
   double totRisk = 0, totPl = 0;
   int openN = 0;
   int rowH = 28;

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
      double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      double riskPct = (sl > 0) ? NabzPositionRiskPct(sym, vol, open, sl) : 0;
      double plPct = NabzProfitPct(profit);
      totRisk += riskPct;
      totPl += plPct;

      if(shown < 3)
      {
         string side = (type == POSITION_TYPE_BUY ? "BUY" : "SELL");
         color sideCol = (type == POSITION_TYPE_BUY ? COL_BUY : COL_SELL);
         int pw = L.panelW - 2 * L.pad;
         NabzUI_Rect("posr_" + IntegerToString(shown), x, y, pw, rowH, COL_BG2, COL_BORDER, 1);
         NabzUI_Label("pos_side_" + IntegerToString(shown), x + 8, y + 7, side, sideCol, L.fontSec, "Segoe UI Semibold");
         NabzUI_Label("pos_info_" + IntegerToString(shown), x + 48, y + 7,
                      StringFormat("%s  %.2f%%", sym, riskPct), COL_TEXT, L.fontSec);
         NabzUI_Label("pos_pl_" + IntegerToString(shown), x + pw - 78, y + 7,
                      NabzPctFmt(plPct, 2), (plPct >= 0 ? COL_BUY : COL_SELL), L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
         NabzUI_Button("pos_rf_" + IntegerToString(shown), x + pw - 52, y + 3, 22, 22, "R", COL_WARN, COL_BG0);
         NabzUI_Button("pos_x_" + IntegerToString(shown), x + pw - 26, y + 3, 22, 22, "✕", COL_SELL_DIM, COL_TEXT);
         ObjectSetString(0, NABZ_PREFIX + "pos_rf_" + IntegerToString(shown), OBJPROP_TOOLTIP, IntegerToString(ticket));
         ObjectSetString(0, NABZ_PREFIX + "pos_x_" + IntegerToString(shown), OBJPROP_TOOLTIP, IntegerToString(ticket));
         y += rowH + 4;
         shown++;
      }
   }

   if(openN == 0)
   {
      NabzUI_Label("pos_empty", x, y, "No open positions — ready.", COL_DIM, L.fontBody);
      y += 20;
   }

   NabzUI_Label("pos_sum", x, y,
                StringFormat("Open %d    Risk %s    P/L %s", openN, NabzPctFmt(totRisk, 2), NabzPctFmt(totPl, 2)),
                COL_MUTED, L.fontSec);
   y += 22;
}

void NabzUI_DrawProp(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   int pw = L.panelW - 2 * L.pad;
   NabzUI_Label("prop_lab", x, y, "LIVE ANALYSIS  ·  PROP", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   NabzUI_Chip("prop_live", x + pw - 52, y - 2, 52, 18, "LIVE",
               NabzMix(COL_INFO, COL_BG1, 70), COL_INFO, 8);
   y += 20;

   NabzUI_Label("dd_t_l", x, y, "Total DD", COL_MUTED, L.fontSec);
   NabzUI_Label("dd_t_v", x + pw, y, StringFormat("%.2f%%", ui.prop.totalDD), COL_TEXT, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 16;
   NabzUI_Progress("dd_t", x, y, pw, 7, ui.prop.totalDD / MathMax(0.01, ui.propCfg.maxTotalDD),
                   (ui.prop.totalDD > ui.propCfg.maxTotalDD * 0.7 ? COL_DANGER : COL_WARN), COL_PROGRESS_BG);
   y += 14;

   NabzUI_Label("dd_d_l", x, y, "Daily DD", COL_MUTED, L.fontSec);
   NabzUI_Label("dd_d_v", x + pw, y, StringFormat("%.2f%%", ui.prop.dailyDD), COL_TEXT, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 16;
   NabzUI_Progress("dd_d", x, y, pw, 7, ui.prop.dailyDD / MathMax(0.01, ui.propCfg.maxDailyDD),
                   (ui.prop.dailyDD > ui.propCfg.maxDailyDD * 0.7 ? COL_DANGER : COL_INFO), COL_PROGRESS_BG);
   y += 14;

   NabzUI_Label("tgt_l", x, y, "Target", COL_MUTED, L.fontSec);
   NabzUI_Label("tgt_v", x + pw, y, StringFormat("%.1f%%", ui.prop.targetPct), COL_BUY, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 16;
   NabzUI_Progress("tgt", x, y, pw, 8, ui.prop.targetPct / 100.0, COL_GOLD, COL_PROGRESS_BG);
   y += 14;

   NabzUI_Label("frisk", x, y, StringFormat("Floating risk   %s", NabzPctFmt(-ui.prop.floatingRisk, 2)), COL_MUTED, L.fontSec);
   y += 20;
}

void NabzUI_DrawNews(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   int pw = L.panelW - 2 * L.pad;
   NabzUI_Label("news_lab", x, y, "ECONOMIC NEWS  ·  TODAY", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   NabzUI_Button("news_prev", x + pw - 56, y - 4, 26, 24, "‹", COL_BG3, COL_TEXT);
   NabzUI_Button("news_next", x + pw - 26, y - 4, 26, 24, "›", COL_BG3, COL_TEXT);
   y += 22;

   int boxH = 72;
   NabzUI_Rect("news_box", x, y, pw, boxH, COL_BG2, COL_BORDER, 1);
   for(int i = 0; i < 3; ++i)
   {
      int idx = ui.news.offset + i;
      string line = (idx < ui.news.count) ? NabzNewsLine(ui.news, idx) : (i == 0 ? "No events loaded" : "");
      color c = COL_MUTED;
      if(idx < ui.news.count)
         c = ui.news.items[idx].released ? COL_DIM : COL_TEXT;
      NabzUI_Label("news_l" + IntegerToString(i), x + 8, y + 8 + i * 20, line, c, L.fontSec, "Segoe UI");
   }
   y += boxH + L.section;
}

void NabzUI_DrawNav(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   string tabs[6] = {"JOU", "SESS", "ECO", "Coach", "%", "Sett"};
   ENUM_NABZ_VIEW views[6] = {NABZ_VIEW_JOURNAL, NABZ_VIEW_SESSIONS, NABZ_VIEW_ECO,
                              NABZ_VIEW_COACH, NABZ_VIEW_PCT, NABZ_VIEW_SETTINGS};
   int bw = (L.panelW - 2 * L.pad - 5 * 5) / 6;
   int bh = 30;
   for(int i = 0; i < 6; ++i)
   {
      bool on = (ui.view == views[i]);
      NabzUI_Button("nav_" + IntegerToString(i), x + i * (bw + 5), y, bw, bh,
                    tabs[i], on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += bh + L.gap + 2;

   int fw = (L.panelW - 2 * L.pad - 2 * L.gap) / 3;
   NabzUI_Button("lnk_signal", x, y, fw, 28, "SIGNAL", COL_BG2, COL_INFO);
   NabzUI_Button("lnk_edu", x + fw + L.gap, y, fw, 28, "EDUCATION", COL_BG2, COL_MUTED);
   NabzUI_Button("lnk_web", x + 2 * (fw + L.gap), y, fw, 28, "WEBSITE", COL_BG2, COL_MUTED);
   y += 34;
}

void NabzUI_DrawMainPanel(NabzUIState &ui)
{
   NabzLayoutCompute(ui.layout);
   ui.candleLeft = NabzUI_CandleLeftText();

   if(ui.minimized)
   {
      NabzUI_DrawMiniBar(ui);
      return;
   }

   NabzLayout L = ui.layout;
   int x0 = L.panelX;
   int y0 = L.panelY;
   int x = x0 + L.pad;
   int y = y0 + L.pad;

   NabzUI_Rect("panel_glow", x0 - 2, y0 - 2, L.panelW + 4, ui.panelH + 4,
               NabzMix(COL_GOLD, COL_BG0, 88), NabzMix(COL_GOLD, COL_BG0, 75), 0);
   NabzUI_Rect("panel_body", x0, y0, L.panelW, ui.panelH, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("panel_rail", x0, y0, 3, ui.panelH, COL_GOLD, COL_GOLD, 2);

   NabzUI_DrawHeader(ui, x, y);
   NabzUI_DrawRisk(ui, x, y);
   NabzUI_DrawExec(ui, x, y);
   NabzUI_DrawPositions(ui, x, y);
   NabzUI_DrawProp(ui, x, y);
   NabzUI_DrawNews(ui, x, y);
   NabzUI_DrawNav(ui, x, y);

   ui.panelH = (y - y0) + L.pad;
   ObjectSetInteger(0, NABZ_PREFIX + "panel_body", OBJPROP_YSIZE, ui.panelH);
   ObjectSetInteger(0, NABZ_PREFIX + "panel_glow", OBJPROP_YSIZE, ui.panelH + 4);
   ObjectSetInteger(0, NABZ_PREFIX + "panel_rail", OBJPROP_YSIZE, ui.panelH);
}

//+------------------------------------------------------------------+
void NabzUI_DrawJournal(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_JOURNAL || ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "jou_");
      return;
   }
   ObjectsDeleteAll(0, NABZ_PREFIX + "jou_");

   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 16;
   int y0 = L.panelY;
   int w = 440;
   int h = 480;
   int x = x0 + 16;
   int y = y0 + 14;

   NabzUI_Rect("jou_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_INFO, COL_BG0, 90), COL_BORDER, 0);
   NabzUI_Rect("jou_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("jou_rail", x0, y0, 3, h, COL_INFO, COL_INFO, 2);

   NabzUI_Label("jou_title", x, y, "TRADING JOURNAL", COL_GOLD_GLOW, 13, "Segoe UI Semibold");
   NabzUI_Button("jou_close", x0 + w - 40, y0 + 12, 28, 28, "✕", COL_BG3, COL_MUTED);
   y += 30;

   NabzUI_Button("jou_week", x, y, 78, 28, "WEEK",
                 ui.journal.weekMode ? COL_GOLD : COL_BG3, ui.journal.weekMode ? COL_BG0 : COL_MUTED);
   NabzUI_Button("jou_month", x + 86, y, 78, 28, "MONTH",
                 !ui.journal.weekMode ? COL_GOLD : COL_BG3, !ui.journal.weekMode ? COL_BG0 : COL_MUTED);
   NabzUI_Chip("jou_cal", x + 176, y, 110, 28, "CAL · Gregorian", COL_BG3, COL_MUTED, 9);
   NabzUI_Chip("jou_plu", x + 294, y, 70, 28, "P/L · $", COL_BG3, COL_MUTED, 9);
   y += 36;

   string range = TimeToString(ui.journal.rangeFrom, TIME_DATE) + "  →  " +
                  TimeToString(ui.journal.rangeTo, TIME_DATE);
   NabzUI_Label("jou_range", x, y, range, COL_MUTED, L.fontSec);
   y += 20;

   int dw = 76;
   int shown = 0;
   for(int i = 0; i < ui.journal.dayCount && shown < 5; ++i)
   {
      NabzDayStat ds = ui.journal.days[i];
      MqlDateTime dt; TimeToStruct(ds.day, dt);
      string names[7] = {"SUN","MON","TUE","WED","THU","FRI","SAT"};
      bool profit = ds.net > 0;
      color bg = profit ? NabzMix(COL_BUY, COL_BG1, 70) : COL_BG2;
      NabzUI_Rect("jou_d" + IntegerToString(shown), x + shown * (dw + 6), y, dw, 58, bg, COL_BORDER, 1);
      NabzUI_Label("jou_dn" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 5,
                   StringFormat("%s %d/%02d", names[dt.day_of_week], dt.mon, dt.day), COL_MUTED, 8);
      NabzUI_Label("jou_dp" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 22,
                   NabzMoneyFmt(ds.net), profit ? COL_BUY : COL_SELL, 10, "Segoe UI Semibold");
      NabzUI_Label("jou_dw" + IntegerToString(shown), x + shown * (dw + 6) + 6, y + 40,
                   StringFormat("WR %.0f%%  N %d", ds.winRate, ds.trades), COL_DIM, 8);
      shown++;
   }
   if(shown == 0)
      NabzUI_Label("jou_empty", x, y + 12, "No closed trades in this range yet.", COL_DIM, L.fontBody);
   y += 70;

   NabzUI_Rect("jou_stats", x, y, w - 32, 128, COL_BG2, COL_BORDER, 1);
   int cx = x + 12, cy = y + 10;
   NabzUI_Label("jou_net_l", cx, cy, "NET", COL_MUTED, 8);
   NabzUI_Label("jou_net_v", cx, cy + 16, NabzMoneyFmt(ui.journal.net),
                ui.journal.net >= 0 ? COL_BUY : COL_SELL, 13, "Segoe UI Semibold");
   NabzUI_Label("jou_wr_l", cx + 140, cy, "WIN RATE", COL_MUTED, 8);
   NabzUI_Label("jou_wr_v", cx + 140, cy + 16, StringFormat("%.1f%%", ui.journal.winRate), COL_TEXT, 13, "Segoe UI Semibold");
   NabzUI_Label("jou_tr_l", cx + 270, cy, "TRADES", COL_MUTED, 8);
   NabzUI_Label("jou_tr_v", cx + 270, cy + 16, IntegerToString(ui.journal.trades), COL_TEXT, 13, "Segoe UI Semibold");
   cy += 48;
   NabzUI_Label("jou_pf_l", cx, cy, "PROFIT FACTOR", COL_MUTED, 8);
   NabzUI_Label("jou_pf_v", cx, cy + 16, DoubleToString(ui.journal.profitFactor, 2), COL_GOLD, 12, "Segoe UI Semibold");
   NabzUI_Label("jou_avg_l", cx + 140, cy, "AVG / TRADE", COL_MUTED, 8);
   NabzUI_Label("jou_avg_v", cx + 140, cy + 16, NabzMoneyFmt(ui.journal.avgTrade), COL_TEXT, 12, "Segoe UI Semibold");
   NabzUI_Label("jou_st_l", cx + 270, cy, "STREAKS", COL_MUTED, 8);
   NabzUI_Label("jou_st_v", cx + 270, cy + 16,
                StringFormat("W%d / L%d", ui.journal.winStreak, ui.journal.lossStreak), COL_TEXT, 12);
   cy += 48;
   NabzUI_Label("jou_best", cx, cy,
                "BEST  " + (ui.journal.bestDay > 0 ? TimeToString(ui.journal.bestDay, TIME_DATE) : "—") +
                "  " + NabzMoneyFmt(ui.journal.bestDayNet), COL_MUTED, 9);
   NabzUI_Label("jou_sess", cx + 210, cy,
                "BEST SESSION  " + ui.journal.bestSession + "  " + NabzMoneyFmt(ui.journal.bestSessionNet),
                COL_MUTED, 9);
   y += 140;

   NabzUI_Label("jou_curve_t", x, y, "BALANCE  /  EQUITY CURVE", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   y += 18;
   NabzUI_Rect("jou_curve_bg", x, y, w - 32, 118, COL_BG0, COL_BORDER, 1);
   if(ui.journal.curveN > 1)
   {
      double mn = ui.journal.curve[0], mx = ui.journal.curve[0];
      for(int i = 1; i < ui.journal.curveN; ++i)
      {
         if(ui.journal.curve[i] < mn) mn = ui.journal.curve[i];
         if(ui.journal.curve[i] > mx) mx = ui.journal.curve[i];
      }
      double span = MathMax(1.0, mx - mn);
      int plotW = w - 48;
      int plotH = 96;
      int samples = MathMin(ui.journal.curveN, 40);
      for(int i = 0; i < samples; ++i)
      {
         int src = i * (ui.journal.curveN - 1) / MathMax(1, samples - 1);
         double v = ui.journal.curve[src];
         int barH = (int)((v - mn) / span * plotH);
         if(barH < 2) barH = 2;
         int bx = x + 10 + i * (plotW / samples);
         int by = y + 108 - barH;
         NabzUI_Rect("jou_bar_" + IntegerToString(i), bx, by, MathMax(2, plotW / samples - 2), barH,
                     (i == samples - 1 ? COL_WARN : COL_BUY), (i == samples - 1 ? COL_WARN : COL_BUY), 2);
      }
      NabzUI_Label("jou_cmin", x + 10, y + 100, DoubleToString(mn, 0), COL_DIM, 8);
      NabzUI_Label("jou_cmax", x + 10, y + 6, DoubleToString(mx, 0), COL_DIM, 8);
   }
   else
      NabzUI_Label("jou_cnodata", x + 14, y + 44, "Curve appears after closed trades.", COL_DIM, L.fontBody);
   y += 126;
   NabzUI_Button("jou_bal", x, y, 64, 26, "BAL", COL_BG3, COL_BUY);
   NabzUI_Button("jou_eq", x + 72, y, 74, 26, "EQUITY", COL_BG3, COL_WARN);
   NabzUI_Button("jou_both", x + 154, y, 64, 26, "BOTH", COL_GOLD, COL_BG0);
   NabzUI_Chip("jou_xaxis", x + 230, y, 100, 26, "X · TRADES", COL_BG3, COL_MUTED, 9);
}

void NabzUI_DrawSettings(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_SETTINGS || ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "set_");
      return;
   }
   ObjectsDeleteAll(0, NABZ_PREFIX + "set_");

   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 16;
   int y0 = L.panelY;
   int w = 380;
   int h = 440;
   int x = x0 + 16;
   int y = y0 + 14;

   NabzUI_Rect("set_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_GOLD, COL_BG0, 90), COL_BORDER, 0);
   NabzUI_Rect("set_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("set_rail", x0, y0, 3, h, COL_GOLD, COL_GOLD, 2);

   NabzUI_Label("set_title", x, y, "NABZ  /  SETTINGS", COL_GOLD_GLOW, 13, "Segoe UI Semibold");
   NabzUI_Button("set_close", x0 + w - 40, y0 + 12, 28, 28, "✕", COL_BG3, COL_MUTED);
   y += 32;

   string tabs[5] = {"RISK", "Account", "NEWS", "MANAGE", "ALERT"};
   int tw = 66;
   for(int i = 0; i < 5; ++i)
   {
      bool on = (ui.settingsTab == i);
      NabzUI_Button("set_tab_" + IntegerToString(i), x + i * (tw + 4), y, tw, 28,
                    tabs[i], on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += 40;

   if(ui.settingsTab == 3)
   {
      NabzUI_Label("set_auto_h", x, y, "AUTOMATION", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      NabzUI_Button("set_arf", x, y, 160, 30,
                    ui.risk.autoRiskFree ? "Auto Risk Free  ON" : "Auto Risk Free  OFF",
                    ui.risk.autoRiskFree ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Button("set_arr", x + 170, y, 160, 30,
                    ui.risk.autoRR ? "Auto R:R  ON" : "Auto R:R  OFF",
                    ui.risk.autoRR ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 36;
      NabzUI_Label("set_rr_l", x, y + 6, "Default Reward (R)", COL_MUTED, L.fontSec);
      NabzUI_Edit("set_rr_v", x + 150, y, 64, 28, DoubleToString(ui.risk.defaultRR, 2), COL_BG3, COL_GOLD);
      NabzUI_Button("set_asp", x + 224, y, 106, 28,
                    ui.risk.autoSaveProfit ? "Save ON" : "Save OFF",
                    ui.risk.autoSaveProfit ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 40;

      NabzUI_Label("set_part_h", x, y, "PARTIAL SCALE-OUT", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      for(int i = 0; i < 3; ++i)
      {
         NabzUI_Label("set_prl" + IntegerToString(i), x, y + 6, StringFormat("Reward %d", i + 1), COL_TEXT, L.fontSec);
         NabzUI_Edit("set_prv" + IntegerToString(i), x + 78, y, 54, 28, DoubleToString(ui.risk.partialR[i], 2), COL_BG3, COL_TEXT);
         NabzUI_Button("set_pc25_" + IntegerToString(i), x + 140, y, 48, 28, "0.25",
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc50_" + IntegerToString(i), x + 192, y, 48, 28, "0.50",
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc75_" + IntegerToString(i), x + 244, y, 48, 28, "0.75",
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_BG0 : COL_MUTED);
         y += 34;
      }

      NabzUI_Label("set_vis_h", x, y, "VISUAL  &  DISCIPLINE", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      NabzUI_Button("set_timer", x, y, 160, 30,
                    ui.risk.showCandleTimer ? "Header Timer  ON" : "Header Timer  OFF",
                    ui.risk.showCandleTimer ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Button("set_m1", x + 170, y, 160, 30,
                    ui.risk.blockM1 ? "Block M1  ON" : "Block M1  OFF",
                    ui.risk.blockM1 ? COL_WARN : COL_BG3, COL_BG0);
      y += 34;
      NabzUI_Button("set_pause", x, y, 160, 30,
                    ui.risk.pauseAfterLoss ? "15m Pause  ON" : "15m Pause  OFF",
                    ui.risk.pauseAfterLoss ? COL_WARN : COL_BG3, ui.risk.pauseAfterLoss ? COL_BG0 : COL_MUTED);
      NabzUI_Button("set_rrlive", x + 170, y, 160, 30,
                    ui.risk.showRRLive ? "RR Live  ON" : "RR Live  OFF",
                    ui.risk.showRRLive ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 34;
      NabzUI_Button("set_detail", x, y, 160, 30,
                    ui.risk.showTpSlDetail ? "TP/SL Detail  ON" : "TP/SL Detail  OFF",
                    ui.risk.showTpSlDetail ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      NabzUI_Chip("set_unit", x + 170, y, 160, 30,
                  ui.risk.detailUnit == NABZ_UNIT_PERCENT ? "Unit · PERCENT" :
                  (ui.risk.detailUnit == NABZ_UNIT_MONEY ? "Unit · MONEY" : "Unit · POINTS"),
                  COL_BG3, COL_MUTED, 9);
   }
   else if(ui.settingsTab == 1)
   {
      NabzUI_Label("set_acc_h", x, y, "PROP LIMITS", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      NabzUI_Label("set_mtdd_l", x, y + 6, "Max Total DD %", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_mtdd", x + 150, y, 74, 28, DoubleToString(ui.propCfg.maxTotalDD, 1), COL_BG3, COL_TEXT);
      y += 34;
      NabzUI_Label("set_mddd_l", x, y + 6, "Max Daily DD %", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_mddd", x + 150, y, 74, 28, DoubleToString(ui.propCfg.maxDailyDD, 1), COL_BG3, COL_TEXT);
      y += 34;
      NabzUI_Label("set_pt_l", x, y + 6, "Profit Target %", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_pt", x + 150, y, 74, 28, DoubleToString(ui.propCfg.profitTarget, 1), COL_BG3, COL_GOLD);
      y += 34;
      NabzUI_Label("set_sb_l", x, y + 6, "Start Balance", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_sb", x + 150, y, 110, 28, DoubleToString(ui.propCfg.startBalance, 2), COL_BG3, COL_TEXT);
      y += 40;
      NabzUI_Button("set_reset_peak", x, y, 170, 30, "Reset Peak Equity", COL_BG3, COL_WARN);
   }
   else if(ui.settingsTab == 0)
      NabzUI_Label("set_risk_h", x, y, "Risk value & mode live on the main panel.", COL_MUTED, L.fontBody);
   else if(ui.settingsTab == 2)
   {
      NabzUI_Label("set_news_h", x, y, "News uses the MetaTrader economic calendar.", COL_MUTED, L.fontBody);
      y += 28;
      NabzUI_Button("set_news_ref", x, y, 150, 30, "Refresh News", COL_INFO, COL_BG0);
   }
   else
      NabzUI_Label("set_alert_h", x, y, "Alerts fire on SOS, DD breach, and news soon.", COL_MUTED, L.fontBody);
}

void NabzUI_DrawCoach(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_COACH || ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "coach_");
      return;
   }
   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 16;
   int y0 = L.panelY;
   int w = 340, h = 210;
   NabzUI_Rect("coach_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("coach_rail", x0, y0, 3, h, COL_WARN, COL_WARN, 2);
   NabzUI_Label("coach_t", x0 + 16, y0 + 14, "COACH", COL_WARN, 13, "Segoe UI Semibold");
   NabzUI_Button("coach_close", x0 + w - 40, y0 + 12, 28, 28, "✕", COL_BG3, COL_MUTED);
   NabzUI_Label("coach_tip", x0 + 16, y0 + 52, ui.coachTip, COL_TEXT, L.fontBody);
   NabzUI_Label("coach_sub", x0 + 16, y0 + 110,
                "Protect process over outcome.\nOne risk unit. One plan. Journal every exit.",
                COL_MUTED, L.fontSec);
}

void NabzUI_DrawPctTool(NabzUIState &ui)
{
   if(ui.view != NABZ_VIEW_PCT || ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "pct_");
      return;
   }
   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 16;
   int y0 = L.panelY;
   int w = 300, h = 170;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   NabzUI_Rect("pct_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Label("pct_t", x0 + 16, y0 + 14, "% CALCULATOR", COL_INFO, 13, "Segoe UI Semibold");
   NabzUI_Button("pct_close", x0 + w - 40, y0 + 12, 28, 28, "✕", COL_BG3, COL_MUTED);
   NabzUI_Label("pct_b", x0 + 16, y0 + 52, "Balance  " + DoubleToString(bal, 2), COL_TEXT, L.fontBody);
   NabzUI_Label("pct_e", x0 + 16, y0 + 76, "Equity   " + DoubleToString(eq, 2), COL_TEXT, L.fontBody);
   NabzUI_Label("pct_r", x0 + 16, y0 + 110,
                StringFormat("1%% of equity = %.2f %s", eq * 0.01, AccountInfoString(ACCOUNT_CURRENCY)),
                COL_GOLD, L.fontBody);
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
      if(ui.drag.entry > 0) riskPct = risk / ui.drag.entry * 100.0;
      string lab = NABZ_PREFIX + "drag_lab";
      ObjectCreate(0, lab, OBJ_TEXT, 0, TimeCurrent(), ui.drag.sl);
      ObjectSetString(0, lab, OBJPROP_TEXT,
                      StringFormat("SL %s | Risk %.2f%% | %.1fR",
                                   (ui.drag.isBuy ? "-" : "+") + DoubleToString(riskPct, 2),
                                   riskPct, rr));
      ObjectSetInteger(0, lab, OBJPROP_COLOR, COL_TEXT);
      ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 9);
      ObjectSetString(0, lab, OBJPROP_FONT, "Segoe UI");
   }

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

void NabzUI_PickCoachTip(NabzUIState &ui)
{
   string tips[6];
   tips[0] = "Size first. Story second. Never reverse that order.";
   tips[1] = "If Daily DD > 50% of limit — stop. Tomorrow exists.";
   tips[2] = "RISK FREE is a gift. Take it when price gives +1R.";
   tips[3] = "News window: flat or tiny size. Ego is expensive.";
   tips[4] = "Journal the WHY, not just the P/L.";
   tips[5] = "ASIA/EU overlap is a scalpel — not a hammer.";
   ui.coachTip = tips[(int)(TimeCurrent() % 6)];
}

void NabzUI_Redraw(NabzUIState &ui)
{
   static bool s_init = false;
   static bool s_wasMin = false;
   if(!s_init || s_wasMin != ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX);
      // also wipe any leftover chart timer boxes from v2.0
      ObjectsDeleteAll(0, NABZ_PREFIX + "timer_");
      s_wasMin = ui.minimized;
      s_init = true;
   }

   ui.candleLeft = NabzUI_CandleLeftText();
   NabzUI_DrawMainPanel(ui);
   NabzUI_DrawJournal(ui);
   NabzUI_DrawSettings(ui);
   NabzUI_DrawCoach(ui);
   NabzUI_DrawPctTool(ui);
   NabzUI_DrawDragLines(ui);
   ChartRedraw(0);
}

bool NabzUI_ToggleMinimize(NabzUIState &ui)
{
   ui.minimized = !ui.minimized;
   if(ui.minimized)
      ui.view = NABZ_VIEW_NONE;
   return true;
}

#endif
//+------------------------------------------------------------------+
