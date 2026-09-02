//+------------------------------------------------------------------+
//| TRH_Trading_Room_Hunter.mq5                                      |
//| Classic SWEEP - Pine parity + advanced graphics / options        |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "2.29"
#property description "TRH v2.29: unified A+B · always show latest SWEEP"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "TRH_Engine.mqh"

// MQL5 has no #error — version is checked in OnInit (need Engine v228+ in SAME folder).
#ifndef TRH_ENGINE_VERSION
#define TRH_ENGINE_VERSION 0
#endif

enum ENUM_TRH_PANEL_CORNER
{
   TRH_PANEL_LEFT  = 0,  // Top-left
   TRH_PANEL_RIGHT = 1   // Top-right
};

enum ENUM_TRH_TRADE_MODE
{
   TRH_TM_CLASSIC = 0, // Mode A - classic SWEEP room
   TRH_TM_FVG     = 1, // Mode B - sweep + displacement + FVG
   TRH_TM_BOTH    = 2, // A + B (default live model)
   TRH_TM_BTB     = 3, // Mode C - legacy BTB (off)
   TRH_TM_ALL     = 4  // A + B (same as Both; BTB removed)
};

input group "Strategy mode"
input ENUM_TRH_TRADE_MODE InpTradeMode = TRH_TM_BOTH; // Detection Mode (A+B)

input group "TRH Detection"
input int    InpPivotPeriod     = 5;      // Pivot Period
input double InpMinContextAtr   = 1.2;    // Min Selloff/Rally Into Sweep (ATRx)
input double InpMinSweepAtr     = 0.05;   // Min Sweep Beyond Pivot (ATRx)
input int    InpBaseConfirmBars = 8;      // Min Base Bars After Sweep (Mode A)
input int    InpMaxBaseBars     = 40;     // Max Bars To Confirm Room (Mode A)
input double InpMinRoomAtr      = 0.8;    // Min Room Width (ATRx) Mode A
input double InpMaxRoomAtr      = 3.5;    // Max Room Width (ATRx) Mode A
input int    InpCooldownBars    = 50;     // Cooldown Between Setups

input group "Mode B - Sweep + Displacement + FVG"
input double InpMinDispAtr      = 0.55;   // Min Displacement Body (ATRx)
input int    InpMaxDispBars     = 6;      // Max Bars After Sweep For Displacement
input int    InpMaxFvgBars      = 10;     // Max Bars After Displacement For FVG
input double InpMinFvgAtr       = 0.12;   // Min FVG Gap Size (ATRx)
input bool   InpRequireFvgRetest= true;   // Wait For FVG Retest Before Signal
input int    InpMaxRetestBars   = 8;      // Max Bars To Wait For Retest
input double InpFvgSlExtraAtr   = 0.45;   // Extra SL Beyond Sweep/FVG (ATRx) — TV-wide
input double InpFvgEntryBias    = 0.62;   // Entry bias (0.5=mid CE · 1.0=full proximal)
input double InpFvgMinRiskAtr   = 1.00;   // Min Mode B risk (ATRx) — avoid tight SL hunts

input group "Mode C - Pro BTB (Break + Retest)"
input double InpMinBreakAtr     = 0.20;   // Min Break Beyond Pivot (ATRx)
input double InpMinBreakBodyAtr = 0.45;   // Min Breakout Candle Body (ATRx)
input int    InpMaxBtbRetestBars= 10;     // Max Bars To Wait For BTB Retest
input double InpBtbRiskReward   = 2.0;    // BTB Risk-Reward (min 2.0)
input double InpBtbSlExtraAtr   = 0.15;   // Extra SL Beyond Breakout Extreme
input bool   InpBtbRequireConfirm = true; // Require Rejection Candle On Retest
input double InpBtbMinRiskAtr   = 0.50;   // Min Risk Size (ATRx) — reject tiny SL
input double InpBtbMinConfirmBody= 0.28;  // Min Confirm Candle Body (ATRx)
input bool   InpBtbWickReject   = true;   // Wick tags BE + close rejects
input double InpBtbMaxPastEntry = 0.20;   // Skip if close past BE toward TP (ATRx)
input int    InpBtbMinBarsBreak = 2;      // Min Bars After Breakout Before Entry

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;   // SL Pad (ATRx)
input double InpRiskReward      = 2.4;    // Risk-Reward Ratio (Mode A/B)
input bool   InpUseLiquidityTP  = true;   // Prefer Opposing Pivot As TP

input group "Display - layout"
input int    InpSetupWidth      = 80;     // Box Width (bars)
input bool   InpOnlyLast        = false;  // Only Last Setup (false=show history)
input int    InpHistoryCount    = 8;      // History Setups (if Only Last = false)
input bool   InpExtendToNow     = true;   // Extend Boxes Until TP/SL (then freeze)
input bool   InpFreezeOnExit    = true;   // Freeze setup at TP/SL bar (keep until next)
input ENUM_TRH_PANEL_CORNER InpPanelCorner = TRH_PANEL_LEFT; // Info Panel Corner
input bool   InpShowPanel       = true;   // Show Info Panel
input bool   InpShowComment     = false;  // Also Use Chart Comment
input int    InpFontSize        = 9;      // Label Font Size

input group "Display - objects"
input bool   InpShowRoomZone    = true;   // Show Room (proximal-distal) Zone
input bool   InpShowTpSlZones   = true;   // Show TP / SL Shade Boxes
input bool   InpShowHLines      = true;   // Show Full-Width HLines
input bool   InpShowTrendLevels = true;   // Show Levels Inside Setup Window
input bool   InpShowPriceLabels = true;   // Show ENTRY / SL / TP Text
input bool   InpShowTag         = true;   // Show TRH LONG/SHORT Tag
input bool   InpShowArrow       = true;   // Show Confirm Arrow
input bool   InpShowMidRoom     = true;   // Mark Mid-Room ENTRY Dot
input bool   InpShowDistalProx  = false;  // Label Distal / Proximal

input group "Display - colors"
input color  InpBullZoneCol     = C'38,166,154';   // Long Room
input color  InpBearZoneCol     = C'239,83,80';    // Short Room
input color  InpTpZoneCol       = C'38,166,154';   // TP Zone
input color  InpSlZoneCol       = C'239,83,80';    // SL Zone
input color  InpEntryCol        = C'120,123,134';  // Entry
input color  InpSlCol           = C'239,83,80';    // SL
input color  InpTpCol           = C'38,166,154';   // TP
input color  InpPanelBg         = C'17,17,17';     // Panel Background
input color  InpPanelBorder     = C'80,80,80';     // Panel Border

input group "Alerts"
input bool   InpAlertPopup      = true;   // Alert Popup On New Setup
input bool   InpAlertPush       = false;  // Push Notification (MetaQuotes ID)
input bool   InpAlertSound      = true;   // Play Sound On New Setup
input string InpAlertSoundFile  = "alert.wav"; // Sound File
input bool   InpAlertOnTpSl     = true;   // Alert When TP / SL Hit

input group "Live position sync (multi-PC)"
input bool   InpSyncLivePosition = true;  // Show open broker position on this chart
input ulong  InpSyncMagic        = 260825;// EA magic (0 = any position on symbol)
input bool   InpPreferLivePanel  = true;  // Panel follows live position over old SL/TP hold

string   OBJ_PREFIX = "TRH2_";
TrhSetup g_setups[];
int      g_nSetups = 0;
datetime g_lastAlertTime = 0;
datetime g_lastTpAlert = 0;
datetime g_lastSlAlert = 0;
TrhSetup g_holdSetup;          // keep visible while WAIT/IN TRADE
bool     g_holdValid = false;
bool     g_livePosValid = false;
int      g_liveDir = 0;
double   g_liveEntry = 0, g_liveSL = 0, g_liveTP = 0;
datetime g_liveOpenTime = 0;
double   g_liveLots = 0;
ulong    g_liveTicket = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(TRH_ENGINE_VERSION < 228)
   {
      Alert("TRH: Engine outdated (v", IntegerToString(TRH_ENGINE_VERSION),
            "). Put NEW TRH_Engine.mqh in the SAME folder as this .mq5 and recompile.");
      return INIT_FAILED;
   }
   IndicatorSetString(INDICATOR_SHORTNAME, "TRH A·SWEEP + B·FVG");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, OBJ_PREFIX);
   Comment("");
}

void ClearDrawings()
{
   ObjectsDeleteAll(0, OBJ_PREFIX);
}

color DimColor(const color c, const int mixBlackPct)
{
   int r = (int)((c      ) & 0xFF);
   int g = (int)((c >> 8) & 0xFF);
   int b = (int)((c >>16) & 0xFF);
   int p = MathMax(0, MathMin(90, mixBlackPct));
   r = r * (100 - p) / 100;
   g = g * (100 - p) / 100;
   b = b * (100 - p) / 100;
   return (color)(r | (g << 8) | (b << 16));
}

void SetRect(const string name, const datetime t1, const double p1,
             const datetime t2, const double p2, const color col, const int width = 1)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   else
   {
      ObjectMove(0, name, 0, t1, p1);
      ObjectMove(0, name, 1, t2, p2);
   }
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetTrend(const string name, const datetime t1, const double p1,
              const datetime t2, const double p2, const color col,
              const ENUM_LINE_STYLE style, const int width)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else
   {
      ObjectMove(0, name, 0, t1, p1);
      ObjectMove(0, name, 1, t2, p2);
   }
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetHLine(const string name, const double price, const color col,
              const ENUM_LINE_STYLE style, const int width)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetText(const string name, const datetime t, const double price,
             const string text, const color col, const ENUM_ANCHOR_POINT anchor)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
   else
      ObjectMove(0, name, 0, t, price);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, InpFontSize);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetArrow(const string name, const datetime t, const double price,
              const int arrowCode, const color col)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
   else
      ObjectMove(0, name, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, arrowCode);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetPanelLabel(const string name, const int x, const int y,
                   const string text, const color col, const int fontSize,
                   const int corner)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetPanelBg(const string name, const int x, const int y,
                const int w, const int h, const int corner)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, corner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, InpPanelBg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, InpPanelBorder);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}


// Find open position on this symbol (same account = visible on every PC)
bool RefreshLivePosition()
{
   g_livePosValid = false;
   g_liveDir = 0;
   g_liveEntry = g_liveSL = g_liveTP = 0;
   g_liveOpenTime = 0;
   g_liveLots = 0;
   g_liveTicket = 0;
   if(!InpSyncLivePosition) return false;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(InpSyncMagic > 0 && PositionGetInteger(POSITION_MAGIC) != (long)InpSyncMagic) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      g_liveDir = (type == POSITION_TYPE_BUY) ? 1 : -1;
      g_liveEntry = PositionGetDouble(POSITION_PRICE_OPEN);
      g_liveSL = PositionGetDouble(POSITION_SL);
      g_liveTP = PositionGetDouble(POSITION_TP);
      g_liveOpenTime = (datetime)PositionGetInteger(POSITION_TIME);
      g_liveLots = PositionGetDouble(POSITION_VOLUME);
      g_liveTicket = ticket;
      g_livePosValid = true;
      return true;
   }
   return false;
}

// Best scanned setup matching live position (same dir, closest ENTRY)
bool FindSetupNearLive(TrhSetup &out)
{
   if(!g_livePosValid || g_nSetups <= 0) return false;
   int best = -1;
   double bestDist = 1e100;
   for(int i = 0; i < g_nSetups; i++)
   {
      if(g_setups[i].dir != g_liveDir) continue;
      double d = MathAbs(g_setups[i].entry - g_liveEntry);
      if(d < bestDist)
      {
         bestDist = d;
         best = i;
      }
   }
   // accept within ~5.0 price units on gold (or very close)
   if(best < 0 || bestDist > 5.0) return false;
   out = g_setups[best];
   return true;
}

void DrawLivePositionOverlay()
{
   if(!g_livePosValid) return;
   datetime t2 = TimeCurrent();
   datetime t1 = g_liveOpenTime;
   if(t1 <= 0) t1 = t2 - PeriodSeconds(_Period) * 30;

   string tag = "LIVE";
   color accent = (g_liveDir == 1) ? InpBullZoneCol : InpBearZoneCol;

   if(InpShowTrendLevels)
   {
      SetTrend(OBJ_PREFIX + "TE_" + tag, t1, g_liveEntry, t2, g_liveEntry, InpEntryCol, STYLE_SOLID, 2);
      if(g_liveSL > 0)
         SetTrend(OBJ_PREFIX + "TS_" + tag, t1, g_liveSL, t2, g_liveSL, InpSlCol, STYLE_DOT, 1);
      if(g_liveTP > 0)
         SetTrend(OBJ_PREFIX + "TT_" + tag, t1, g_liveTP, t2, g_liveTP, InpTpCol, STYLE_DOT, 1);
   }
   if(InpShowHLines)
   {
      SetHLine(OBJ_PREFIX + "HE_" + tag, g_liveEntry, InpEntryCol, STYLE_SOLID, 1);
      if(g_liveSL > 0) SetHLine(OBJ_PREFIX + "HS_" + tag, g_liveSL, InpSlCol, STYLE_DOT, 1);
      if(g_liveTP > 0) SetHLine(OBJ_PREFIX + "HT_" + tag, g_liveTP, InpTpCol, STYLE_DOT, 1);
   }
   if(InpShowPriceLabels)
   {
      SetText(OBJ_PREFIX + "LE_" + tag, t2, g_liveEntry,
         "LIVE ENTRY " + DoubleToString(g_liveEntry, _Digits), InpEntryCol, ANCHOR_LEFT);
      if(g_liveSL > 0)
         SetText(OBJ_PREFIX + "LS_" + tag, t2, g_liveSL,
            "LIVE SL " + DoubleToString(g_liveSL, _Digits), InpSlCol, ANCHOR_LEFT);
      if(g_liveTP > 0)
         SetText(OBJ_PREFIX + "LT_" + tag, t2, g_liveTP,
            "LIVE TP " + DoubleToString(g_liveTP, _Digits), InpTpCol, ANCHOR_LEFT);
   }
   if(InpShowTag)
   {
      SetText(OBJ_PREFIX + "TAG_" + tag, t1, g_liveEntry,
         "TRH LIVE " + (g_liveDir == 1 ? "LONG" : "SHORT") + " · pos",
         accent, (g_liveDir == 1 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER));
   }
   if(InpShowArrow)
      SetArrow(OBJ_PREFIX + "AR_" + tag, t1, g_liveEntry,
         (g_liveDir == 1 ? 233 : 234), accent);
}

void DrawLiveInfoPanel(const double bid)
{
   if(!InpShowPanel || !g_livePosValid) return;

   int corner = (InpPanelCorner == TRH_PANEL_RIGHT) ? CORNER_RIGHT_UPPER : CORNER_LEFT_UPPER;
   int x0 = 12;
   int y0 = 28;
   if(InpPanelCorner == TRH_PANEL_LEFT) y0 = 70;

   SetPanelBg(OBJ_PREFIX + "PBG", x0, y0, 260, 168, corner);

   color sideCol = (g_liveDir == 1) ? InpBullZoneCol : InpBearZoneCol;
   double risk = MathAbs(g_liveEntry - g_liveSL);
   double reward = MathAbs(g_liveTP - g_liveEntry);
   double rr = (risk > 0) ? reward / risk : 0;
   double liveR = 0;
   if(risk > 0)
      liveR = (g_liveDir == 1) ? (bid - g_liveEntry) / risk : (g_liveEntry - bid) / risk;

   // Try attach mode name from matching setup
   string modeTxt = "LIVE POSITION";
   TrhSetup match;
   if(FindSetupNearLive(match))
      modeTxt = TrhModeFullName(match.setupMode) + " · LIVE";

   int y = y0 + 8;
   int dy = 16;
   SetPanelLabel(OBJ_PREFIX + "P0", x0 + 10, y, "TRH | Trading Room Hunter", clrWhite, 10, corner); y += dy + 2;
   SetPanelLabel(OBJ_PREFIX + "P1", x0 + 10, y,
      (g_liveDir == 1 ? "LONG" : "SHORT") + " · LIVE · IN TRADE", sideCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P1b", x0 + 10, y, modeTxt, sideCol, 8, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P2", x0 + 10, y, "ENTRY  " + DoubleToString(g_liveEntry, _Digits), InpEntryCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P3", x0 + 10, y,
      "SL     " + (g_liveSL > 0 ? DoubleToString(g_liveSL, _Digits) : "-"), InpSlCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P4", x0 + 10, y,
      "TP     " + (g_liveTP > 0 ? DoubleToString(g_liveTP, _Digits) : "-"), InpTpCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P5", x0 + 10, y,
      "Lots   " + DoubleToString(g_liveLots, 2) + "   (" + DoubleToString(rr, 1) + "R)", clrSilver, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P6", x0 + 10, y,
      "Live   " + DoubleToString(liveR, 2) + "R   @ " + DoubleToString(bid, _Digits), clrGold, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P7", x0 + 10, y,
      "Opened " + TimeToString(g_liveOpenTime, TIME_DATE|TIME_MINUTES) + "  #" + IntegerToString((int)g_liveTicket),
      clrDimGray, 8, corner);
}

string StatusText(const TrhSetup &s, const double &high[], const double &low[],
                  const double &close[], const int rates, int &statusOut, int &exitBar)
{
   statusOut = 0;
   exitBar = -1;
   int bi = s.barIndex;
   if(bi < 0 || bi >= rates) return "-";

   bool filled = false;
   int fillBar = -1;
   for(int i = bi; i < rates; i++)
   {
      bool hitE = (s.dir == 1) ? (low[i] <= s.entry) : (high[i] >= s.entry);
      bool closeThrough = (s.dir == 1) ? (close[i] >= s.entry) : (close[i] <= s.entry);
      if(hitE || closeThrough)
      {
         filled = true;
         fillBar = i;
         break;
      }
   }
   if(!filled)
   {
      statusOut = 0;
      return "WAIT FILL";
   }

   for(int i = fillBar; i < rates; i++)
   {
      bool hitT = (s.dir == 1) ? (high[i] >= s.tp) : (low[i] <= s.tp);
      bool hitS = (s.dir == 1) ? (low[i] <= s.sl) : (high[i] >= s.sl);
      // Prefer TP if both wick same bar (same as Pine)
      if(hitT)
      {
         statusOut = 2;
         exitBar = i;
         return "TP HIT";
      }
      if(hitS)
      {
         statusOut = 3;
         exitBar = i;
         return "SL HIT";
      }
   }
   statusOut = 1;
   return "IN TRADE";
}

bool PickNewestActiveSetup(const double &high[], const double &low[], const double &close[],
                           const int rates, TrhSetup &out)
{
   // Prefer newest WAIT FILL / IN TRADE over closed SL/TP
   for(int i = g_nSetups - 1; i >= 0; i--)
   {
      int st = 0, eb = -1;
      StatusText(g_setups[i], high, low, close, rates, st, eb);
      if(st == 0 || st == 1)
      {
         out = g_setups[i];
         return true;
      }
   }
   return false;
}

void DrawInfoPanel(const TrhSetup &s, const string stTxt, const int stCode,
                    const double bid)
{
   if(!InpShowPanel) return;

   int corner = (InpPanelCorner == TRH_PANEL_RIGHT) ? CORNER_RIGHT_UPPER : CORNER_LEFT_UPPER;
   int x0 = 12;
   int y0 = 28;
   if(InpPanelCorner == TRH_PANEL_LEFT) y0 = 70;

   SetPanelBg(OBJ_PREFIX + "PBG", x0, y0, 248, 168, corner);

   color sideCol = (s.dir == 1) ? InpBullZoneCol : InpBearZoneCol;
   color stCol = InpEntryCol;
   if(stCode == 1) stCol = clrGold;
   if(stCode == 2) stCol = InpTpCol;
   if(stCode == 3) stCol = InpSlCol;

   double risk = MathAbs(s.entry - s.sl);
   double reward = MathAbs(s.tp - s.entry);
   double rr = (risk > 0) ? reward / risk : 0;
   double liveR = 0;
   if(risk > 0)
   {
      if(stCode == 2) liveR = rr;           // closed at TP
      else if(stCode == 3) liveR = -1.0;    // closed at SL
      else liveR = (s.dir == 1) ? (bid - s.entry) / risk : (s.entry - bid) / risk;
   }

   string liveLabel = (stCode == 2 || stCode == 3) ? "Final  " : "Live   ";

   int y = y0 + 8;
   int dy = 16;
   SetPanelLabel(OBJ_PREFIX + "P0", x0 + 10, y, "TRH | Trading Room Hunter", clrWhite, 10, corner); y += dy + 2;
   SetPanelLabel(OBJ_PREFIX + "P1", x0 + 10, y,
      (s.dir == 1 ? "LONG" : "SHORT") + " · " + TrhModeLabel(s.setupMode) + " · " + stTxt, sideCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P1b", x0 + 10, y, TrhModeFullName(s.setupMode), TrhModeAccent(s.setupMode, s.dir), 8, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P2", x0 + 10, y, "ENTRY  " + DoubleToString(s.entry, _Digits), InpEntryCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P3", x0 + 10, y, "SL     " + DoubleToString(s.sl, _Digits), InpSlCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P4", x0 + 10, y, "TP     " + DoubleToString(s.tp, _Digits), InpTpCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P5", x0 + 10, y,
      "Risk   " + DoubleToString(risk, _Digits) + "   (" + DoubleToString(rr, 1) + "R)", clrSilver, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P6", x0 + 10, y,
      liveLabel + DoubleToString(liveR, 2) + "R   @ " + DoubleToString(bid, _Digits), stCol, 9, corner); y += dy;
   SetPanelLabel(OBJ_PREFIX + "P7", x0 + 10, y,
      "Bar    " + TimeToString(s.barTime, TIME_DATE|TIME_MINUTES), clrDimGray, 8, corner);
}

void DrawOneSetup(const TrhSetup &s, const datetime &time[],
                  const double &high[], const double &low[], const double &close[],
                  const int rates)
{
   int bi = s.barIndex;
   if(bi < 0 || bi >= rates) return;

   int stCode = 0;
   int exitBar = -1;
   StatusText(s, high, low, close, rates, stCode, exitBar);

   datetime t1 = time[bi];
   int rightIdx = MathMin(rates - 1, bi + InpSetupWidth);

   // Extend only while active; freeze at TP/SL bar and keep until next setup
   if(InpFreezeOnExit && (stCode == 2 || stCode == 3) && exitBar >= 0)
      rightIdx = exitBar;
   else if(InpExtendToNow && stCode <= 1)
      rightIdx = rates - 1;

   datetime t2 = time[rightIdx];
   if(t2 <= t1 && bi + 1 < rates) t2 = time[bi + 1];

   string tag = IntegerToString((int)s.barTime);
   color accent = TrhModeAccent(s.setupMode, s.dir);
   color zoneCol = accent;
   double roomTop = MathMax(s.proximal, s.distal);
   double roomBot = MathMin(s.proximal, s.distal);

   if(InpShowRoomZone)
      SetRect(OBJ_PREFIX + "Z_" + tag, t1, roomTop, t2, roomBot, DimColor(zoneCol, 62), 1);

   if(InpShowTpSlZones)
   {
      if(s.dir == 1)
      {
         SetRect(OBJ_PREFIX + "TPZ_" + tag, t1, s.tp, t2, s.entry, DimColor(InpTpZoneCol, 72));
         SetRect(OBJ_PREFIX + "SLZ_" + tag, t1, s.entry, t2, s.sl, DimColor(InpSlZoneCol, 72));
      }
      else
      {
         SetRect(OBJ_PREFIX + "TPZ_" + tag, t1, s.entry, t2, s.tp, DimColor(InpTpZoneCol, 72));
         SetRect(OBJ_PREFIX + "SLZ_" + tag, t1, s.sl, t2, s.entry, DimColor(InpSlZoneCol, 72));
      }
   }

   if(InpShowTrendLevels)
   {
      SetTrend(OBJ_PREFIX + "TE_" + tag, t1, s.entry, t2, s.entry, InpEntryCol, STYLE_SOLID, 2);
      SetTrend(OBJ_PREFIX + "TS_" + tag, t1, s.sl, t2, s.sl, InpSlCol, STYLE_DOT, 1);
      SetTrend(OBJ_PREFIX + "TT_" + tag, t1, s.tp, t2, s.tp, InpTpCol, STYLE_DOT, 1);
   }

   // Full-width HLines only while trade is open; freeze = no endless lines after exit
   if(InpShowHLines && stCode <= 1)
   {
      SetHLine(OBJ_PREFIX + "HE_" + tag, s.entry, InpEntryCol, STYLE_SOLID, 1);
      SetHLine(OBJ_PREFIX + "HS_" + tag, s.sl, InpSlCol, STYLE_DOT, 1);
      SetHLine(OBJ_PREFIX + "HT_" + tag, s.tp, InpTpCol, STYLE_DOT, 1);
   }
   else
   {
      ObjectDelete(0, OBJ_PREFIX + "HE_" + tag);
      ObjectDelete(0, OBJ_PREFIX + "HS_" + tag);
      ObjectDelete(0, OBJ_PREFIX + "HT_" + tag);
   }

   if(InpShowPriceLabels)
   {
      SetText(OBJ_PREFIX + "LE_" + tag, t2, s.entry, "ENTRY " + DoubleToString(s.entry, _Digits), InpEntryCol, ANCHOR_LEFT);
      SetText(OBJ_PREFIX + "LS_" + tag, t2, s.sl, "SL " + DoubleToString(s.sl, _Digits), InpSlCol, ANCHOR_LEFT);
      SetText(OBJ_PREFIX + "LT_" + tag, t2, s.tp, "TP " + DoubleToString(s.tp, _Digits), InpTpCol, ANCHOR_LEFT);
   }

   if(InpShowDistalProx)
   {
      SetText(OBJ_PREFIX + "LD_" + tag, t1, s.distal, "distal " + DoubleToString(s.distal, _Digits), clrDimGray, ANCHOR_LEFT_UPPER);
      SetText(OBJ_PREFIX + "LP_" + tag, t1, s.proximal, "prox " + DoubleToString(s.proximal, _Digits), clrDimGray, ANCHOR_LEFT_LOWER);
   }

   if(InpShowTag)
   {
      string modeName = TrhModeLabel(s.setupMode);
      string tagTxt = "TRH " + (s.dir == 1 ? "LONG" : "SHORT") + " · " + modeName;
      if(stCode == 0) tagTxt += " · WAIT";
      if(stCode == 1) tagTxt += " · LIVE";
      if(stCode == 2) tagTxt += " · TP";
      if(stCode == 3) tagTxt += " · SL";
      // Mode badge above/below setup
      SetText(OBJ_PREFIX + "TAG_" + tag, t1, (s.dir == 1 ? roomTop : roomBot),
         tagTxt, accent,
         (s.dir == 1 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER));
      SetText(OBJ_PREFIX + "MOD_" + tag, t1, s.entry,
         TrhModeFullName(s.setupMode),
         accent,
         (s.dir == 1 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER));
   }

   if(InpShowArrow)
   {
      int code = (s.dir == 1) ? 233 : 234;
      double ap = (s.dir == 1) ? roomBot : roomTop;
      SetArrow(OBJ_PREFIX + "AR_" + tag, t1, ap, code, accent);
   }

   if(InpShowMidRoom)
      SetArrow(OBJ_PREFIX + "MD_" + tag, t1, s.entry, 159, accent);

   // Mark exit bar
   if((stCode == 2 || stCode == 3) && exitBar >= 0 && exitBar < rates)
   {
      int xcode = (stCode == 2) ? 252 : 251;
      double xp = (stCode == 2) ? s.tp : s.sl;
      SetArrow(OBJ_PREFIX + "EX_" + tag, time[exitBar], xp, xcode, (stCode == 2 ? InpTpCol : InpSlCol));
   }
}

void NotifyNewSetup(const TrhSetup &s)
{
   string msg = StringFormat("TRH %s · %s\nENTRY %s\nSL %s\nTP %s",
      s.dir == 1 ? "LONG" : "SHORT",
      TrhModeFullName(s.setupMode),
      DoubleToString(s.entry, _Digits),
      DoubleToString(s.sl, _Digits),
      DoubleToString(s.tp, _Digits));

   if(InpAlertPopup) Alert(msg);
   if(InpAlertPush)  SendNotification(msg);
   if(InpAlertSound) PlaySound(InpAlertSoundFile);
   Print(msg);
}

void BuildConfig(TrhConfig &cfg)
{
   cfg.pivotPeriod     = InpPivotPeriod;
   cfg.minContextAtr   = InpMinContextAtr;
   cfg.minSweepAtr     = InpMinSweepAtr;
   cfg.baseConfirmBars = InpBaseConfirmBars;
   cfg.maxBaseBars     = InpMaxBaseBars;
   cfg.minRoomAtr      = InpMinRoomAtr;
   cfg.maxRoomAtr      = InpMaxRoomAtr;
   cfg.cooldownBars    = InpCooldownBars;
   cfg.slPadAtr        = InpSlPadAtr;
   cfg.riskReward      = InpRiskReward;
   cfg.useLiquidityTP  = InpUseLiquidityTP;
   cfg.minDispAtr      = InpMinDispAtr;
   cfg.maxDispBars     = InpMaxDispBars;
   cfg.maxFvgBars      = InpMaxFvgBars;
   cfg.minFvgAtr       = InpMinFvgAtr;
   cfg.requireFvgRetest= InpRequireFvgRetest;
   cfg.maxRetestBars   = InpMaxRetestBars;
   cfg.fvgSlExtraAtr   = InpFvgSlExtraAtr;
   cfg.fvgEntryBias    = InpFvgEntryBias;
   cfg.fvgMinRiskAtr   = InpFvgMinRiskAtr;
   cfg.minBreakAtr     = InpMinBreakAtr;
   cfg.minBreakBodyAtr = InpMinBreakBodyAtr;
   cfg.maxBtbRetestBars= InpMaxBtbRetestBars;
   cfg.btbRiskReward   = InpBtbRiskReward;
   cfg.btbSlExtraAtr   = InpBtbSlExtraAtr;
   cfg.btbRequireConfirm = InpBtbRequireConfirm;
   cfg.btbMinRiskAtr       = InpBtbMinRiskAtr;
   cfg.btbMinConfirmBodyAtr= InpBtbMinConfirmBody;
   cfg.btbRequireWickReject= InpBtbWickReject;
   cfg.btbMaxPastEntryAtr  = InpBtbMaxPastEntry;
   cfg.btbMinBarsAfterBreak= InpBtbMinBarsBreak;
}

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if(rates_total < 120) return 0;

   static datetime lastBar = 0;
   datetime curBar = time[rates_total - 1];
   bool asSeries = (rates_total > 1 && time[0] > time[rates_total - 1]);
   if(asSeries) curBar = time[0];

   bool newBar = (prev_calculated == 0 || curBar != lastBar);
   if(newBar) lastBar = curBar;

   datetime t[];
   double o[], h[], l[], c[];
   TrhNormalizeBars(rates_total, time, open, high, low, close, t, o, h, l, c);

   if(newBar)
   {
      TrhConfig cfg;
      BuildConfig(cfg);
      datetime prevTime = (g_nSetups > 0) ? g_setups[g_nSetups - 1].barTime : 0;
      int nNew = TrhScanByMode(rates_total, t, o, h, l, c, cfg, (int)InpTradeMode, g_setups);
      g_nSetups = nNew;

      // Hold only while WAIT/IN TRADE. Dead SL/TP must release so multi-PC
      // / newer setups become visible (was stuck on old SHORT SL HIT).
      bool holdActive = false;
      if(g_holdValid)
      {
         int hs = 0, heb = -1;
         StatusText(g_holdSetup, h, l, c, rates_total, hs, heb);
         if(hs == 2 || hs == 3)
            g_holdValid = false; // release dead hold
         else
            holdActive = (hs == 0 || hs == 1);
      }

      if(g_nSetups > 0)
      {
         TrhSetup newest = g_setups[g_nSetups - 1]; // chronological last = latest bar
         TrhSetup activePick;
         bool haveActive = PickNewestActiveSetup(h, l, c, rates_total, activePick);
         // Prefer later bar always; among same-time, active WAIT/IN TRADE
         TrhSetup choose = newest;
         if(haveActive && activePick.barTime >= newest.barTime)
            choose = activePick;

         // Break hold whenever a NEWER setup exists (even if prior TP HIT)
         if(holdActive && choose.barTime > g_holdSetup.barTime)
         {
            g_holdSetup = choose;
            holdActive = true;
         }
         else if(!holdActive)
         {
            g_holdSetup = choose;
            g_holdValid = true;
         }

         if(g_holdValid && g_holdSetup.barTime != prevTime && g_holdSetup.barTime != g_lastAlertTime)
         {
            // alert only for fresh non-closed setups
            int ast = 0, aeb = -1;
            StatusText(g_holdSetup, h, l, c, rates_total, ast, aeb);
            if(ast <= 1)
            {
               g_lastAlertTime = g_holdSetup.barTime;
               NotifyNewSetup(g_holdSetup);
            }
         }
      }
      else if(!holdActive)
      {
         g_holdValid = false;
      }

      ClearDrawings();

      if(!g_holdValid && g_nSetups <= 0)
      {
         if(InpShowPanel)
         {
            int corner = (InpPanelCorner == TRH_PANEL_RIGHT) ? CORNER_RIGHT_UPPER : CORNER_LEFT_UPPER;
            int y0 = (InpPanelCorner == TRH_PANEL_LEFT) ? 70 : 28;
            SetPanelBg(OBJ_PREFIX + "PBG", 12, y0, 248, 56, corner);
            SetPanelLabel(OBJ_PREFIX + "P0", 22, y0 + 10, "TRH | scanning...", clrSilver, 10, corner);
            SetPanelLabel(OBJ_PREFIX + "P1", 22, y0 + 30, "No SWEEP / FVG yet", clrDimGray, 9, corner);
         }
         if(InpShowComment) Comment("TRH scanning... (no setup yet)");
         return rates_total;
      }

      // Draw hold (active trade setup) first; optionally history behind it
      if(!InpOnlyLast && g_nSetups > 0)
      {
         int from = MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));
         for(int i = from; i < g_nSetups; i++)
         {
            if(g_holdValid && g_setups[i].barTime == g_holdSetup.barTime) continue;
            DrawOneSetup(g_setups[i], t, h, l, c, rates_total);
         }
      }
      if(g_holdValid)
         DrawOneSetup(g_holdSetup, t, h, l, c, rates_total);
      else if(g_nSetups > 0)
         DrawOneSetup(g_setups[g_nSetups - 1], t, h, l, c, rates_total);
   }
   else if(g_holdValid)
   {
      DrawOneSetup(g_holdSetup, t, h, l, c, rates_total);
   }
   else if(g_nSetups > 0)
   {
      int from = InpOnlyLast ? g_nSetups - 1 : MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));
      for(int i = from; i < g_nSetups; i++)
         DrawOneSetup(g_setups[i], t, h, l, c, rates_total);
   }

   // Always refresh live broker position (same account on other PCs)
   RefreshLivePosition();
   if(newBar || g_livePosValid)
      DrawLivePositionOverlay();

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // Panel priority: LIVE open position > active hold > newest setup
   if(InpPreferLivePanel && g_livePosValid)
   {
      DrawLiveInfoPanel(bid);
      // Also promote matching scanned setup into hold so boxes align
      TrhSetup match;
      if(FindSetupNearLive(match))
      {
         g_holdSetup = match;
         g_holdValid = true;
      }
      if(InpShowComment)
      {
         Comment(
            "TRH LIVE ", (g_liveDir == 1 ? "LONG" : "SHORT"), " IN TRADE\n",
            "ENTRY ", DoubleToString(g_liveEntry, _Digits), "\n",
            "SL    ", DoubleToString(g_liveSL, _Digits), "\n",
            "TP    ", DoubleToString(g_liveTP, _Digits), "\n",
            "Opened ", TimeToString(g_liveOpenTime, TIME_DATE|TIME_MINUTES)
         );
      }
      else if(!InpShowComment) Comment("");
   }
   else
   {
      TrhSetup panelSetup;
      bool havePanel = false;
      if(g_holdValid) { panelSetup = g_holdSetup; havePanel = true; }
      else if(g_nSetups > 0) { panelSetup = g_setups[g_nSetups - 1]; havePanel = true; }

      if(havePanel)
      {
         int stCode = 0;
         int exitBar = -1;
         string stTxt = StatusText(panelSetup, h, l, c, rates_total, stCode, exitBar);
         DrawInfoPanel(panelSetup, stTxt, stCode, bid);

         // Release dead holds immediately
         if(g_holdValid && (stCode == 2 || stCode == 3))
            g_holdValid = false;

         if(InpAlertOnTpSl)
         {
            if(stCode == 2 && panelSetup.barTime != g_lastTpAlert)
            {
               g_lastTpAlert = panelSetup.barTime;
               string m = "TRH TP HIT @ " + DoubleToString(panelSetup.tp, _Digits);
               if(InpAlertPopup) Alert(m);
               if(InpAlertPush) SendNotification(m);
               if(InpAlertSound) PlaySound(InpAlertSoundFile);
            }
            if(stCode == 3 && panelSetup.barTime != g_lastSlAlert)
            {
               g_lastSlAlert = panelSetup.barTime;
               string m = "TRH SL HIT @ " + DoubleToString(panelSetup.sl, _Digits);
               if(InpAlertPopup) Alert(m);
               if(InpAlertPush) SendNotification(m);
               if(InpAlertSound) PlaySound(InpAlertSoundFile);
            }
         }

         if(InpShowComment)
         {
            Comment(
               "TRH | Trading Room Hunter\n",
               (panelSetup.dir == 1 ? "LONG" : "SHORT"), " | ", TrhModeLabel(panelSetup.setupMode), " | ", stTxt, "\n",
               "ENTRY ", DoubleToString(panelSetup.entry, _Digits), "\n",
               "SL    ", DoubleToString(panelSetup.sl, _Digits), "\n",
               "TP    ", DoubleToString(panelSetup.tp, _Digits), "\n",
               "Bar   ", TimeToString(panelSetup.barTime, TIME_DATE|TIME_MINUTES)
            );
         }
         else Comment("");
      }
   }

   // Keep live overlay visible even on non-new bars
   if(!newBar && g_livePosValid)
      DrawLivePositionOverlay();

   return rates_total;
}
//+------------------------------------------------------------------+
