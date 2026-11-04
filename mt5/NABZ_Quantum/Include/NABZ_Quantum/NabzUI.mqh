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
   int              settingsTab;      // 0 RISK 1 Account 2 NEWS 3 MANAGE 4 ALERT 5 SESS
   string           candleLeft;
   // panel drag
   bool             panelDragging;
   int              dragOffX;
   int              dragOffY;
   int              bottomReserve;
   // Save Pos popup
   bool             savePosOpen;
   ulong            savePosTicket;   // 0 = all matching symbol positions
   bool             compactMode;     // auto when chart is short
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

   // Invisible drag strip across header (hold left mouse & drag anywhere on title row)
   NabzUI_Rect("hdr_drag", x, y - 4, L.panelW - 2 * L.pad - 36, 34, COL_BG1, COL_BG1, 0);
   ObjectSetString(0, NABZ_PREFIX + "hdr_drag", OBJPROP_TOOLTIP, "Drag to move panel");

   NabzUI_Label("hdr_title", x, y, NABZ_TITLE, COL_GOLD_GLOW, L.fontTitle, "Segoe UI Semibold");
   NabzUI_Label("hdr_ver", x + 58, y + 5, "v" + NABZ_VERSION, COL_MUTED, L.fontTiny);

   int right = x + L.panelW - 2 * L.pad;
   NabzUI_Button("btn_minmax", right - 30, y - 2, 30, 28, "—", COL_BG3, COL_TEXT);
   ObjectSetString(0, NABZ_PREFIX + "btn_minmax", OBJPROP_TOOLTIP, "Minimize NABZ panel");

   if(ui.risk.showCandleTimer)
   {
      NabzUI_Chip("hdr_timer", right - 108, y - 2, 70, 28, ui.candleLeft, COL_BG3, COL_GOLD_GLOW, 10);
      NabzUI_Chip("hdr_sp", right - 182, y - 2, 68, 28,
                  StringFormat("SP %.1f", spread), COL_BG3, (spread > 50 ? COL_WARN : COL_INFO), 9);
   }
   else
   {
      NabzUI_Chip("hdr_sp", right - 108, y - 2, 70, 28,
                  StringFormat("SP %.1f", spread), COL_BG3, (spread > 50 ? COL_WARN : COL_INFO), 9);
   }
   y += 34;
}

void NabzUI_ApplyRRToDrag(NabzUIState &ui)
{
   if(!ui.drag.active || !ui.risk.autoRR) return;
   double r = MathAbs(ui.drag.entry - ui.drag.sl);
   if(r <= 0) return;
   ui.drag.tp = ui.drag.isBuy
      ? ui.drag.entry + r * ui.risk.defaultRR
      : ui.drag.entry - r * ui.risk.defaultRR;
}

void NabzUI_DrawRisk(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   NabzUI_Label("risk_lab", x, y, "RISK ENGINE", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   y += 20;

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
   y += L.btnH + L.gap + 4;

   // R:R row — always visible & editable on the main panel
   NabzUI_Label("rr_lab", x, y + 8, "R:R", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   NabzUI_Button("rr_minus", x + 36, y, 30, L.btnH, "−", COL_BG3, COL_TEXT);
   NabzUI_Edit("rr_val", x + 70, y, 64, L.btnH, DoubleToString(ui.risk.defaultRR, 2), COL_BG3, COL_GOLD);
   NabzUI_Button("rr_plus", x + 138, y, 30, L.btnH, "+", COL_BG3, COL_TEXT);
   NabzUI_Button("rr_auto", x + 176, y, inner - 176, L.btnH,
                 ui.risk.autoRR ? "Auto R:R  ON" : "Auto R:R  OFF",
                 ui.risk.autoRR ? COL_BUY_DIM : COL_BG3,
                 ui.risk.autoRR ? COL_TEXT : COL_MUTED);
   y += L.btnH + L.gap + 4;
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

bool NabzUI_SymbolMatch(const string posSym)
{
   if(posSym == _Symbol) return true;
   // brokers often alias GOLD / XAUUSD / XAUUSDm
   string a = posSym, b = _Symbol;
   StringToUpper(a); StringToUpper(b);
   if(a == b) return true;
   bool aGold = (StringFind(a, "XAU") >= 0 || StringFind(a, "GOLD") >= 0);
   bool bGold = (StringFind(b, "XAU") >= 0 || StringFind(b, "GOLD") >= 0);
   return (aGold && bGold);
}

void NabzUI_DrawPositions(NabzUIState &ui, const int x, int &y)
{
   // Drop previous position cards so closed trades cannot linger / overlap
   ObjectsDeleteAll(0, NABZ_PREFIX + "pos");

   NabzLayout L = ui.layout;
   NabzUI_Label("pos_lab", x, y, "POSITIONS", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   y += 20;

   int shown = 0;
   double totRisk = 0, totPl = 0;
   int openN = 0;
   int rowH = 52; // two-line card: side/pl + Entry / Risk Free
   int pw = L.panelW - 2 * L.pad;
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      if(!NabzUI_SymbolMatch(sym)) continue;

      openN++;
      long type = PositionGetInteger(POSITION_TYPE);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      double riskPct = (sl > 0.0) ? NabzPositionRiskPct(sym, vol, open, sl) : 0.0;
      double plPct = NabzProfitPct(profit);
      totRisk += riskPct;
      totPl += plPct;

      if(shown >= 3) continue;

      string side = (type == POSITION_TYPE_BUY ? "BUY" : "SELL");
      color sideCol = (type == POSITION_TYPE_BUY ? COL_BUY : COL_SELL);
      string idx = IntegerToString(shown);

      NabzUI_Rect("posr_" + idx, x, y, pw, rowH, COL_BG2, COL_BORDER, 1);
      // Line 1: side · symbol · risk% · p/l
      NabzUI_Label("pos_side_" + idx, x + 8, y + 6, side, sideCol, L.fontSec, "Segoe UI Semibold");
      NabzUI_Label("pos_info_" + idx, x + 48, y + 6,
                   StringFormat("%s  ×%.2f%%", sym, riskPct), COL_TEXT, L.fontSec);
      NabzUI_Label("pos_pl_" + idx, x + pw - 100, y + 6,
                   NabzPctFmt(plPct, 2), (plPct >= 0 ? COL_BUY : COL_SELL), L.fontSec,
                   "Segoe UI Semibold", ANCHOR_RIGHT_UPPER);

      // Line 2: Entry + [S]=Save Profit  [R]=Risk Free  [X]=Close  (sample layout)
      NabzUI_Label("pos_entry_" + idx, x + 8, y + 28,
                   "Entry " + DoubleToString(open, digits), COL_MUTED, L.fontTiny);
      int btnY = y + 24;
      int btnSz = 24;
      int bx0 = x + pw - 3 * (btnSz + 4) - 4;
      NabzUI_Button("pos_sv_" + idx, bx0, btnY, btnSz, btnSz, "$", COL_BUY_DIM, COL_TEXT);
      NabzUI_Button("pos_rf_" + idx, bx0 + btnSz + 4, btnY, btnSz, btnSz, "R", COL_WARN, COL_BG0);
      NabzUI_Button("pos_x_" + idx, bx0 + 2 * (btnSz + 4), btnY, btnSz, btnSz, "✕", COL_SELL_DIM, COL_TEXT);
      ObjectSetString(0, NABZ_PREFIX + "pos_sv_" + idx, OBJPROP_TOOLTIP, "Save Profit|" + IntegerToString(ticket));
      ObjectSetString(0, NABZ_PREFIX + "pos_rf_" + idx, OBJPROP_TOOLTIP, IntegerToString(ticket));
      ObjectSetString(0, NABZ_PREFIX + "pos_x_" + idx, OBJPROP_TOOLTIP, IntegerToString(ticket));

      y += rowH + 8;
      shown++;
   }

   if(openN == 0)
   {
      NabzUI_Label("pos_empty", x, y, "No open positions — ready.", COL_DIM, L.fontBody);
      y += 22;
   }

   NabzUI_Label("pos_sum", x, y,
                StringFormat("Open: %d     Risk: %s     P/L: %s",
                             openN, NabzPctFmt(totRisk, 2), NabzPctFmt(totPl, 2)),
                COL_MUTED, L.fontSec);
   y += 26;
}

void NabzUI_DrawProp(NabzUIState &ui, const int x, int &y)
{
   NabzLayout L = ui.layout;
   int pw = L.panelW - 2 * L.pad;
   NabzUI_Label("prop_lab", x, y, "LIVE ANALYSIS  ·  PROP", COL_MUTED, L.fontSec, "Segoe UI Semibold");
   NabzUI_Chip("prop_live", x + pw - 52, y - 2, 52, 18, "LIVE",
               NabzMix(COL_INFO, COL_BG1, 70), COL_INFO, 8);
   y += 24;

   NabzUI_Label("dd_t_l", x, y, "Total DD", COL_MUTED, L.fontSec);
   NabzUI_Label("dd_t_v", x + pw, y, StringFormat("%.2f%%", ui.prop.totalDD), COL_TEXT, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 18;
   NabzUI_Progress("dd_t", x, y, pw, 8, ui.prop.totalDD / MathMax(0.01, ui.propCfg.maxTotalDD),
                   (ui.prop.totalDD > ui.propCfg.maxTotalDD * 0.7 ? COL_DANGER : COL_WARN), COL_PROGRESS_BG);
   y += 16;

   NabzUI_Label("dd_d_l", x, y, "Daily DD", COL_MUTED, L.fontSec);
   NabzUI_Label("dd_d_v", x + pw, y, StringFormat("%.2f%%", ui.prop.dailyDD), COL_TEXT, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 18;
   NabzUI_Progress("dd_d", x, y, pw, 8, ui.prop.dailyDD / MathMax(0.01, ui.propCfg.maxDailyDD),
                   (ui.prop.dailyDD > ui.propCfg.maxDailyDD * 0.7 ? COL_DANGER : COL_INFO), COL_PROGRESS_BG);
   y += 16;

   NabzUI_Label("tgt_l", x, y, "Target", COL_MUTED, L.fontSec);
   NabzUI_Label("tgt_v", x + pw, y, StringFormat("%.1f%%", ui.prop.targetPct), COL_BUY, L.fontSec, "Segoe UI", ANCHOR_RIGHT_UPPER);
   y += 18;
   NabzUI_Progress("tgt", x, y, pw, 9, ui.prop.targetPct / 100.0, COL_GOLD, COL_PROGRESS_BG);
   y += 16;

   NabzUI_Label("frisk", x, y, StringFormat("Floating risk   %s", NabzPctFmt(-ui.prop.floatingRisk, 2)), COL_MUTED, L.fontSec);
   y += 24;
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

void NabzUI_DrawSavePosPopup(NabzUIState &ui); // forward
void NabzUI_DrawEcoPopup(NabzUIState &ui);

void NabzUI_DrawMainPanel(NabzUIState &ui)
{
   NabzLayoutCompute(ui.layout, ui.bottomReserve);
   ui.candleLeft = NabzUI_CandleLeftText();

   int chartH = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int maxBottom = chartH - ui.layout.bottomReserve;
   if(maxBottom < ui.layout.panelY + 220)
      maxBottom = ui.layout.panelY + 220;

   // Keep panel inside chart horizontally
   if(ui.layout.panelX < 4) ui.layout.panelX = 4;
   if(ui.layout.panelX + ui.layout.panelW > chartW - 4)
      ui.layout.panelX = MathMax(4, chartW - ui.layout.panelW - 4);
   if(ui.layout.panelY < 4) ui.layout.panelY = 4;
   if(ui.layout.panelY > maxBottom - 80)
      ui.layout.panelY = MathMax(4, maxBottom - 80);

   int availH = maxBottom - ui.layout.panelY;
   ui.compactMode = (availH < 620);

   if(ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "news");
      NabzUI_DrawMiniBar(ui);
      if(ui.savePosOpen) NabzUI_DrawSavePosPopup(ui);
      if(ui.view == NABZ_VIEW_ECO) NabzUI_DrawEcoPopup(ui);
      return;
   }

   NabzLayout L = ui.layout;
   int x0 = L.panelX;
   int y0 = L.panelY;
   int x = x0 + L.pad;
   int y = y0 + L.pad;

   // Reserve footer (nav + links) so it never falls outside the body
   int footerH = 30 + L.gap + 28 + L.pad + 8;
   int contentMaxY = y0 + availH - footerH;

   // Draw shell first with full available height (exact fit above terminal)
   ui.panelH = availH;
   NabzUI_Rect("panel_glow", x0 - 2, y0 - 2, L.panelW + 4, ui.panelH + 4,
               NabzMix(COL_GOLD, COL_BG0, 88), NabzMix(COL_GOLD, COL_BG0, 75), 0);
   NabzUI_Rect("panel_body", x0, y0, L.panelW, ui.panelH, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("panel_rail", x0, y0, 3, ui.panelH, COL_GOLD, COL_GOLD, 2);

   NabzUI_DrawHeader(ui, x, y);
   NabzUI_DrawRisk(ui, x, y);
   NabzUI_DrawExec(ui, x, y);

   if(y + 90 < contentMaxY)
      NabzUI_DrawPositions(ui, x, y);
   else
      ObjectsDeleteAll(0, NABZ_PREFIX + "pos");

   if(y + 120 < contentMaxY)
      NabzUI_DrawProp(ui, x, y);
   else
   {
      ObjectsDeleteAll(0, NABZ_PREFIX + "prop");
      ObjectsDeleteAll(0, NABZ_PREFIX + "dd_");
      ObjectsDeleteAll(0, NABZ_PREFIX + "tgt");
      ObjectsDeleteAll(0, NABZ_PREFIX + "frisk");
   }

   // News is NEVER inside the main column (was overflowing). Use ECO popup instead.
   ObjectsDeleteAll(0, NABZ_PREFIX + "news");

   // Pin nav to bottom of panel body
   int navY = y0 + ui.panelH - footerH + L.pad;
   if(navY < y + 8) navY = y + 8;
   y = navY;
   NabzUI_DrawNav(ui, x, y);

   if(ui.savePosOpen)
      NabzUI_DrawSavePosPopup(ui);
   else
      ObjectsDeleteAll(0, NABZ_PREFIX + "svp_");

   if(ui.view == NABZ_VIEW_ECO)
      NabzUI_DrawEcoPopup(ui);
   else
      ObjectsDeleteAll(0, NABZ_PREFIX + "eco_");
}

//+------------------------------------------------------------------+
void NabzUI_DrawEcoPopup(NabzUIState &ui)
{
   ObjectsDeleteAll(0, NABZ_PREFIX + "eco_");
   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 12;
   int y0 = L.panelY + 40;
   int w = 280;
   int h = 160;
   NabzUI_Rect("eco_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_INFO, COL_BG0, 88), COL_BORDER, 0);
   NabzUI_Rect("eco_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("eco_rail", x0, y0, 3, h, COL_INFO, COL_INFO, 2);
   NabzUI_Label("eco_title", x0 + 12, y0 + 12, "ECONOMIC NEWS · TODAY", COL_INFO, 11, "Segoe UI Semibold");
   NabzUI_Button("eco_x", x0 + w - 32, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);
   NabzUI_Button("eco_prev", x0 + w - 64, y0 + 10, 24, 24, "‹", COL_BG3, COL_TEXT);
   NabzUI_Button("eco_next", x0 + w - 96, y0 + 10, 24, 24, "›", COL_BG3, COL_TEXT);
   // fix order: prev left of next
   ObjectSetInteger(0, NABZ_PREFIX + "eco_prev", OBJPROP_XDISTANCE, x0 + w - 92);
   ObjectSetInteger(0, NABZ_PREFIX + "eco_next", OBJPROP_XDISTANCE, x0 + w - 64);

   for(int i = 0; i < 4; ++i)
   {
      int idx = ui.news.offset + i;
      string line = (idx < ui.news.count) ? NabzNewsLine(ui.news, idx) : (i == 0 ? "No events" : "");
      color c = (idx < ui.news.count && !ui.news.items[idx].released) ? COL_TEXT : COL_MUTED;
      NabzUI_Label("eco_l" + IntegerToString(i), x0 + 12, y0 + 44 + i * 24, line, c, 9);
   }
}

void NabzUI_DrawSavePosPopup(NabzUIState &ui)
{
   ObjectsDeleteAll(0, NABZ_PREFIX + "svp_");
   NabzLayout L = ui.layout;
   int x0 = L.panelX + L.panelW + 12;
   int y0 = L.panelY + 90;
   int w = 156;
   int h = 200;

   NabzUI_Rect("svp_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_BUY, COL_BG0, 85), COL_BORDER, 0);
   NabzUI_Rect("svp_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("svp_rail", x0, y0, 3, h, COL_BUY, COL_BUY, 2);
   NabzUI_Label("svp_title", x0 + 12, y0 + 12, "Save Pos", COL_BUY, 12, "Segoe UI Semibold");
   NabzUI_Button("svp_x", x0 + w - 32, y0 + 10, 24, 24, "✕", COL_BG3, COL_MUTED);
   NabzUI_Label("svp_sub", x0 + 12, y0 + 40, "Take partial profit", COL_MUTED, 8);

   string tip = (ui.savePosTicket == 0 ? "all" : IntegerToString(ui.savePosTicket));
   NabzUI_Button("svp_25", x0 + 12, y0 + 62, w - 24, 30, "0.25", COL_BUY, COL_BG0);
   NabzUI_Button("svp_50", x0 + 12, y0 + 96, w - 24, 30, "0.50", COL_BUY, COL_BG0);
   NabzUI_Button("svp_75", x0 + 12, y0 + 130, w - 24, 30, "0.75", COL_BUY, COL_BG0);
   NabzUI_Button("svp_full", x0 + 12, y0 + 164, w - 24, 28, "CLOSE", COL_SOS, COL_TEXT);
   ObjectSetString(0, NABZ_PREFIX + "svp_25", OBJPROP_TOOLTIP, tip);
   ObjectSetString(0, NABZ_PREFIX + "svp_50", OBJPROP_TOOLTIP, tip);
   ObjectSetString(0, NABZ_PREFIX + "svp_75", OBJPROP_TOOLTIP, tip);
   ObjectSetString(0, NABZ_PREFIX + "svp_full", OBJPROP_TOOLTIP, tip);
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
   int w = 400;
   int h = 520;
   int x = x0 + 16;
   int y = y0 + 14;

   NabzUI_Rect("set_glow", x0 - 2, y0 - 2, w + 4, h + 4, NabzMix(COL_GOLD, COL_BG0, 90), COL_BORDER, 0);
   NabzUI_Rect("set_body", x0, y0, w, h, COL_BG1, COL_BORDER, 1);
   NabzUI_Rect("set_rail", x0, y0, 3, h, COL_GOLD, COL_GOLD, 2);

   NabzUI_Label("set_title", x, y, "NABZ  /  SETTINGS", COL_GOLD_GLOW, 13, "Segoe UI Semibold");
   NabzUI_Button("set_close", x0 + w - 40, y0 + 12, 28, 28, "✕", COL_BG3, COL_MUTED);
   y += 32;

   string tabs[6] = {"RISK", "Acct", "NEWS", "MANAGE", "ALERT", "SESS"};
   int tw = 58;
   for(int i = 0; i < 6; ++i)
   {
      bool on = (ui.settingsTab == i);
      NabzUI_Button("set_tab_" + IntegerToString(i), x + i * (tw + 4), y, tw, 28,
                    tabs[i], on ? COL_GOLD : COL_BG3, on ? COL_BG0 : COL_MUTED);
   }
   y += 40;

   if(ui.settingsTab == 3) // MANAGE
   {
      NabzUI_Label("set_auto_h", x, y, "AUTOMATION", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      string arf = "Auto Risk Free  OFF";
      color arfBg = COL_BG3;
      if(ui.risk.autoRiskFreeAt == 1) { arf = "Auto Risk Free  R1"; arfBg = COL_BUY_DIM; }
      else if(ui.risk.autoRiskFreeAt == 2) { arf = "Auto Risk Free  R2"; arfBg = COL_BUY_DIM; }
      else if(ui.risk.autoRiskFreeAt == 3) { arf = "Auto Risk Free  R3"; arfBg = COL_BUY_DIM; }
      else if(ui.risk.autoRiskFree) { arf = "Auto Risk Free  R1"; arfBg = COL_BUY_DIM; ui.risk.autoRiskFreeAt = 1; }
      NabzUI_Button("set_arf", x, y, 170, 30, arf, arfBg, COL_TEXT);
      NabzUI_Button("set_arr", x + 178, y, 150, 30,
                    ui.risk.autoRR ? "Auto R:R  ON" : "Auto R:R  OFF",
                    ui.risk.autoRR ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 36;
      NabzUI_Label("set_rr_l", x, y + 6, "Default Reward (R)", COL_MUTED, L.fontSec);
      NabzUI_Edit("set_rr_v", x + 150, y, 64, 28, DoubleToString(ui.risk.defaultRR, 2), COL_BG3, COL_GOLD);
      NabzUI_Button("set_asp", x + 224, y, 104, 28,
                    ui.risk.autoSaveProfit ? "Save ON" : "Save OFF",
                    ui.risk.autoSaveProfit ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 40;

      NabzUI_Label("set_part_h", x, y, "REWARD LEVELS  ·  partial close", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 20;
      for(int i = 0; i < 3; ++i)
      {
         NabzUI_Label("set_prl" + IntegerToString(i), x, y + 6, StringFormat("R%d", i + 1), COL_TEXT, L.fontSec);
         NabzUI_Edit("set_prv" + IntegerToString(i), x + 36, y, 50, 28, DoubleToString(ui.risk.partialR[i], 2), COL_BG3, COL_TEXT);
         NabzUI_Button("set_pc25_" + IntegerToString(i), x + 94, y, 48, 28, "0.25",
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.25) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc50_" + IntegerToString(i), x + 146, y, 48, 28, "0.50",
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.50) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc75_" + IntegerToString(i), x + 198, y, 48, 28, "0.75",
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i] - 0.75) < 0.01 ? COL_BG0 : COL_MUTED);
         NabzUI_Button("set_pc00_" + IntegerToString(i), x + 250, y, 48, 28, "0",
                       MathAbs(ui.risk.partialClose[i]) < 0.01 ? COL_GOLD : COL_BG3,
                       MathAbs(ui.risk.partialClose[i]) < 0.01 ? COL_BG0 : COL_MUTED);
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
      NabzUI_Button("set_sessb", x + 170, y, 160, 30,
                    ui.sessions.borderOnly ? "Session  BORDER" : "Session  FILL",
                    COL_BG3, COL_GOLD);
   }
   else if(ui.settingsTab == 5) // SESSIONS
   {
      NabzUI_Label("set_sess_h", x, y, "SESSION HOURS  (broker time)", COL_MUTED, L.fontSec, "Segoe UI Semibold");
      y += 22;
      NabzUI_Label("set_asia_l", x, y + 6, "ASIA start/end", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_asia0", x + 130, y, 50, 28, IntegerToString(ui.sessions.asiaStart), COL_BG3, COL_TEXT);
      NabzUI_Edit("set_asia1", x + 186, y, 50, 28, IntegerToString(ui.sessions.asiaEnd), COL_BG3, COL_TEXT);
      y += 34;
      NabzUI_Label("set_lon_l", x, y + 6, "LON start/end", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_lon0", x + 130, y, 50, 28, IntegerToString(ui.sessions.lonStart), COL_BG3, COL_TEXT);
      NabzUI_Edit("set_lon1", x + 186, y, 50, 28, IntegerToString(ui.sessions.lonEnd), COL_BG3, COL_TEXT);
      y += 34;
      NabzUI_Label("set_ny_l", x, y + 6, "NY start/end", COL_TEXT, L.fontSec);
      NabzUI_Edit("set_ny0", x + 130, y, 50, 28, IntegerToString(ui.sessions.nyStart), COL_BG3, COL_TEXT);
      NabzUI_Edit("set_ny1", x + 186, y, 50, 28, IntegerToString(ui.sessions.nyEnd), COL_BG3, COL_TEXT);
      y += 40;
      NabzUI_Button("set_sessb2", x, y, 160, 30,
                    ui.sessions.borderOnly ? "Draw  BORDER" : "Draw  FILL",
                    COL_BG3, COL_GOLD);
      NabzUI_Button("set_sesson", x + 170, y, 160, 30,
                    ui.sessions.enabled ? "Sessions  ON" : "Sessions  OFF",
                    ui.sessions.enabled ? COL_BUY_DIM : COL_BG3, COL_TEXT);
      y += 36;
      NabzUI_Button("set_sessapply", x, y, 200, 30, "Apply & Redraw", COL_GOLD, COL_BG0);
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

bool NabzUI_ToggleMinimize(NabzUIState &ui)
{
   ui.minimized = !ui.minimized;
   if(ui.minimized)
      ui.view = NABZ_VIEW_NONE;
   return true;
}

void NabzUI_Redraw(NabzUIState &ui)
{
   static bool s_init = false;
   static bool s_wasMin = false;
   // Full wipe only on first paint / minimize toggle (keeps edit fields usable)
   if(!s_init || s_wasMin != ui.minimized)
   {
      ObjectsDeleteAll(0, NABZ_PREFIX);
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

ulong NabzUI_TipTicket(const string tip)
{
   if(tip == "" || tip == "all") return 0;
   int pipe = StringFind(tip, "|");
   if(pipe >= 0)
      return (ulong)StringToInteger(StringSubstr(tip, pipe + 1));
   return (ulong)StringToInteger(tip);
}

void NabzUI_ApplySaveFraction(NabzUIState &ui, const double frac, const bool fullClose)
{
   if(ui.savePosTicket == 0)
   {
      if(fullClose) NabzCloseAll(_Symbol);
      else NabzPartialCloseAll(frac, _Symbol);
   }
   else
   {
      if(fullClose) g_nabzTrade.PositionClose(ui.savePosTicket);
      else NabzPartialClose(ui.savePosTicket, frac);
   }
   ui.savePosOpen = false;
}

void NabzUI_ReadSessionEdits(NabzUIState &ui)
{
   string keys[6] = {"set_asia0","set_asia1","set_lon0","set_lon1","set_ny0","set_ny1"};
   for(int i = 0; i < 6; ++i)
   {
      string n = NABZ_PREFIX + keys[i];
      if(ObjectFind(0, n) < 0) continue;
      int v = (int)StringToInteger(ObjectGetString(0, n, OBJPROP_TEXT));
      if(v < 0) v = 0; if(v > 23) v = 23;
      if(i == 0) ui.sessions.asiaStart = v;
      if(i == 1) ui.sessions.asiaEnd = v;
      if(i == 2) ui.sessions.lonStart = v;
      if(i == 3) ui.sessions.lonEnd = v;
      if(i == 4) ui.sessions.nyStart = v;
      if(i == 5) ui.sessions.nyEnd = v;
   }
}

// Returns true if the click was handled here
bool NabzUI_HandleClick(NabzUIState &ui, const string key)
{
   if(key == "btn_minmax")
   {
      NabzUI_ToggleMinimize(ui);
      return true;
   }
   if(key == "eco_x")
   {
      ui.view = NABZ_VIEW_NONE;
      return true;
   }
   if(key == "eco_prev")
   {
      ui.news.offset = MathMax(0, ui.news.offset - 1);
      return true;
   }
   if(key == "eco_next")
   {
      ui.news.offset = MathMin(MathMax(0, ui.news.count - 1), ui.news.offset + 1);
      return true;
   }
   if(key == "rr_minus")
   {
      ui.risk.defaultRR = MathMax(0.5, ui.risk.defaultRR - 0.25);
      NabzUI_ApplyRRToDrag(ui);
      return true;
   }
   if(key == "rr_plus")
   {
      ui.risk.defaultRR = MathMin(10.0, ui.risk.defaultRR + 0.25);
      NabzUI_ApplyRRToDrag(ui);
      return true;
   }
   if(key == "rr_auto")
   {
      ui.risk.autoRR = !ui.risk.autoRR;
      NabzUI_ApplyRRToDrag(ui);
      return true;
   }
   // Save Pos popup
   if(key == "svp_x") { ui.savePosOpen = false; return true; }
   if(key == "svp_25") { NabzUI_ApplySaveFraction(ui, 0.25, false); return true; }
   if(key == "svp_50") { NabzUI_ApplySaveFraction(ui, 0.50, false); return true; }
   if(key == "svp_75") { NabzUI_ApplySaveFraction(ui, 0.75, false); return true; }
   if(key == "svp_full") { NabzUI_ApplySaveFraction(ui, 1.0, true); return true; }

   if(key == "set_arf")
   {
      ui.risk.autoRiskFreeAt = (ui.risk.autoRiskFreeAt + 1) % 4; // OFF→R1→R2→R3
      ui.risk.autoRiskFree = (ui.risk.autoRiskFreeAt > 0);
      return true;
   }
   if(key == "set_sessb" || key == "set_sessb2")
   {
      ui.sessions.borderOnly = !ui.sessions.borderOnly;
      NabzSessionsRedraw(ui.sessions);
      return true;
   }
   if(key == "set_sesson")
   {
      ui.sessions.enabled = !ui.sessions.enabled;
      ui.showSessions = ui.sessions.enabled;
      NabzSessionsRedraw(ui.sessions);
      return true;
   }
   if(key == "set_sessapply")
   {
      NabzUI_ReadSessionEdits(ui);
      NabzSessionsRedraw(ui.sessions);
      return true;
   }
   if(StringFind(key, "set_pc00_") == 0)
   {
      int i = (int)StringToInteger(StringSubstr(key, 9));
      if(i >= 0 && i < 3) ui.risk.partialClose[i] = 0.0;
      return true;
   }
   return false;
}

// Continuous drag: hold left mouse on header area and move
bool NabzUI_HandleMouseMove(NabzUIState &ui, const int mx, const int my, const uint state)
{
   bool left = ((state & 1) == 1);
   NabzLayout L = ui.layout;
   int x0 = L.panelX;
   int y0 = L.panelY;
   int hdrH = 56;
   bool inHeader = (mx >= x0 && mx <= x0 + L.panelW - 34 &&
                    my >= y0 && my <= y0 + hdrH);

   static bool s_down = false;
   if(left && !s_down)
   {
      if(inHeader && !ui.minimized)
      {
         ui.panelDragging = true;
         ui.dragOffX = mx - x0;
         ui.dragOffY = my - y0;
      }
   }
   if(!left)
   {
      ui.panelDragging = false;
   }
   s_down = left;

   if(ui.panelDragging && left)
   {
      int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
      int chartH = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
      int maxBottom = chartH - ui.bottomReserve;
      ui.layout.panelX = mx - ui.dragOffX;
      ui.layout.panelY = my - ui.dragOffY;
      if(ui.layout.panelX < 4) ui.layout.panelX = 4;
      if(ui.layout.panelY < 4) ui.layout.panelY = 4;
      if(ui.layout.panelX > chartW - L.panelW - 4)
         ui.layout.panelX = chartW - L.panelW - 4;
      if(ui.layout.panelY > maxBottom - 100)
         ui.layout.panelY = maxBottom - 100;
      return true;
   }
   return false;
}

bool NabzUI_HandleChartClick(NabzUIState &ui, const int px, const int py)
{
   // kept for compatibility — drag uses mouse move now
   return false;
}

void NabzUI_ReadRREdit(NabzUIState &ui)
{
   string n = NABZ_PREFIX + "rr_val";
   if(ObjectFind(0, n) < 0) return;
   double v = StringToDouble(ObjectGetString(0, n, OBJPROP_TEXT));
   if(v >= 0.5 && v <= 20.0)
   {
      ui.risk.defaultRR = v;
      NabzUI_ApplyRRToDrag(ui);
   }
}

#endif
//+------------------------------------------------------------------+
