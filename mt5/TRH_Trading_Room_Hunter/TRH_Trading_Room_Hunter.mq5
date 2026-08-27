//+------------------------------------------------------------------+
//| TRH_Trading_Room_Hunter.mq5                                      |
//| Classic SWEEP — Pine parity + advanced graphics / options        |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "2.20"
#property description "TRH classic SWEEP + Mode B Sweep/Displacement/FVG"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "TRH_Engine.mqh"

enum ENUM_TRH_PANEL_CORNER
{
   TRH_PANEL_LEFT  = 0,  // Top-left
   TRH_PANEL_RIGHT = 1   // Top-right
};

enum ENUM_TRH_TRADE_MODE
{
   TRH_TM_CLASSIC = 0, // Mode A — classic SWEEP room
   TRH_TM_FVG     = 1, // Mode B — sweep + displacement + FVG
   TRH_TM_BOTH    = 2  // Both (shared cooldown; FVG wins same bar)
};

input group "Strategy mode"
input ENUM_TRH_TRADE_MODE InpTradeMode = TRH_TM_BOTH; // Detection Mode

input group "TRH Detection"
input int    InpPivotPeriod     = 5;      // Pivot Period
input double InpMinContextAtr   = 1.2;    // Min Selloff/Rally Into Sweep (ATR×)
input double InpMinSweepAtr     = 0.05;   // Min Sweep Beyond Pivot (ATR×)
input int    InpBaseConfirmBars = 8;      // Min Base Bars After Sweep (Mode A)
input int    InpMaxBaseBars     = 40;     // Max Bars To Confirm Room (Mode A)
input double InpMinRoomAtr      = 0.8;    // Min Room Width (ATR×) Mode A
input double InpMaxRoomAtr      = 3.5;    // Max Room Width (ATR×) Mode A
input int    InpCooldownBars    = 50;     // Cooldown Between Setups

input group "Mode B — Sweep + Displacement + FVG"
input double InpMinDispAtr      = 0.55;   // Min Displacement Body (ATR×)
input int    InpMaxDispBars     = 6;      // Max Bars After Sweep For Displacement
input int    InpMaxFvgBars      = 10;     // Max Bars After Displacement For FVG
input double InpMinFvgAtr       = 0.12;   // Min FVG Gap Size (ATR×)

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;   // SL Pad (ATR×)
input double InpRiskReward      = 2.4;    // Risk-Reward Ratio
input bool   InpUseLiquidityTP  = true;   // Prefer Opposing Pivot As TP

input group "Display — layout"
input int    InpSetupWidth      = 80;     // Box Width (bars)
input bool   InpOnlyLast        = true;   // Only Last Setup
input int    InpHistoryCount    = 5;      // History Setups (if Only Last = false)
input bool   InpExtendToNow     = true;   // Extend Boxes Until TP/SL (then freeze)
input bool   InpFreezeOnExit    = true;   // Freeze setup at TP/SL bar (keep until next)
input ENUM_TRH_PANEL_CORNER InpPanelCorner = TRH_PANEL_LEFT; // Info Panel Corner
input bool   InpShowPanel       = true;   // Show Info Panel
input bool   InpShowComment     = false;  // Also Use Chart Comment
input int    InpFontSize        = 9;      // Label Font Size

input group "Display — objects"
input bool   InpShowRoomZone    = true;   // Show Room (proximal–distal) Zone
input bool   InpShowTpSlZones   = true;   // Show TP / SL Shade Boxes
input bool   InpShowHLines      = true;   // Show Full-Width HLines
input bool   InpShowTrendLevels = true;   // Show Levels Inside Setup Window
input bool   InpShowPriceLabels = true;   // Show ENTRY / SL / TP Text
input bool   InpShowTag         = true;   // Show TRH LONG/SHORT Tag
input bool   InpShowArrow       = true;   // Show Confirm Arrow
input bool   InpShowMidRoom     = true;   // Mark Mid-Room ENTRY Dot
input bool   InpShowDistalProx  = false;  // Label Distal / Proximal

input group "Display — colors"
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

string   OBJ_PREFIX = "TRH2_";
TrhSetup g_setups[];
int      g_nSetups = 0;
datetime g_lastAlertTime = 0;
datetime g_lastTpAlert = 0;
datetime g_lastSlAlert = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "TRH Sweep+FVG Pro");
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
      (s.dir == 1 ? "LONG" : "SHORT") + " · " + TrhModeLabel(s.mode) + " · " + stTxt, sideCol, 9, corner); y += dy;
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
   color zoneCol = (s.dir == 1) ? InpBullZoneCol : InpBearZoneCol;
   double zTop = MathMax(s.proximal, s.distal);
   double zBot = MathMin(s.proximal, s.distal);

   if(InpShowRoomZone)
      SetRect(OBJ_PREFIX + "Z_" + tag, t1, zTop, t2, zBot, DimColor(zoneCol, 55), 1);

   if(InpShowTpSlZones)
   {
      if(s.dir == 1)
      {
         SetRect(OBJ_PREFIX + "TPZ_" + tag, t1, s.tp, t2, s.entry, DimColor(InpTpZoneCol, 70));
         SetRect(OBJ_PREFIX + "SLZ_" + tag, t1, s.entry, t2, s.sl, DimColor(InpSlZoneCol, 70));
      }
      else
      {
         SetRect(OBJ_PREFIX + "TPZ_" + tag, t1, s.entry, t2, s.tp, DimColor(InpTpZoneCol, 70));
         SetRect(OBJ_PREFIX + "SLZ_" + tag, t1, s.sl, t2, s.entry, DimColor(InpSlZoneCol, 70));
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
      // remove old HLines when frozen
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
      string tagTxt = "TRH " + (s.dir == 1 ? "LONG" : "SHORT") + " · " + TrhModeLabel(s.mode);
      if(stCode == 2) tagTxt += " · TP";
      if(stCode == 3) tagTxt += " · SL";
      SetText(OBJ_PREFIX + "TAG_" + tag, t1, (s.dir == 1 ? zTop : zBot),
         tagTxt,
         (s.dir == 1 ? InpBullZoneCol : InpBearZoneCol),
         (s.dir == 1 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER));
   }

   if(InpShowArrow)
   {
      int code = (s.dir == 1) ? 233 : 234;
      double ap = (s.dir == 1) ? zBot : zTop;
      SetArrow(OBJ_PREFIX + "AR_" + tag, t1, ap, code, zoneCol);
   }

   if(InpShowMidRoom)
      SetArrow(OBJ_PREFIX + "MD_" + tag, t1, s.entry, 159, InpEntryCol);

   // Mark exit bar
   if((stCode == 2 || stCode == 3) && exitBar >= 0 && exitBar < rates)
   {
      int xcode = (stCode == 2) ? 252 : 251; // check / X
      double xp = (stCode == 2) ? s.tp : s.sl;
      SetArrow(OBJ_PREFIX + "EX_" + tag, time[exitBar], xp, xcode, (stCode == 2 ? InpTpCol : InpSlCol));
   }
}

void NotifyNewSetup(const TrhSetup &s)
{
   string msg = StringFormat("TRH %s %s SETUP\nENTRY %s\nSL %s\nTP %s",
      s.dir == 1 ? "LONG" : "SHORT",
      TrhModeLabel(s.mode),
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
      g_nSetups = TrhScanByMode(rates_total, t, o, h, l, c, cfg, (int)InpTradeMode, g_setups);

      ClearDrawings();

      if(g_nSetups <= 0)
      {
         if(InpShowPanel)
         {
            int corner = (InpPanelCorner == TRH_PANEL_RIGHT) ? CORNER_RIGHT_UPPER : CORNER_LEFT_UPPER;
            int y0 = (InpPanelCorner == TRH_PANEL_LEFT) ? 70 : 28;
            SetPanelBg(OBJ_PREFIX + "PBG", 12, y0, 248, 56, corner);
            SetPanelLabel(OBJ_PREFIX + "P0", 22, y0 + 10, "TRH | scanning…", clrSilver, 10, corner);
            SetPanelLabel(OBJ_PREFIX + "P1", 22, y0 + 30, "No SWEEP / FVG yet", clrDimGray, 9, corner);
         }
         if(InpShowComment) Comment("TRH scanning… (no setup yet)");
         return rates_total;
      }

      int from = 0;
      if(InpOnlyLast) from = g_nSetups - 1;
      else from = MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));

      for(int i = from; i < g_nSetups; i++)
         DrawOneSetup(g_setups[i], t, h, l, c, rates_total);

      TrhSetup last = g_setups[g_nSetups - 1];
      if(last.barTime != prevTime && last.barTime != g_lastAlertTime)
      {
         g_lastAlertTime = last.barTime;
         NotifyNewSetup(last);
      }
   }
   else if(g_nSetups > 0)
   {
      int from = InpOnlyLast ? g_nSetups - 1 : MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));
      for(int i = from; i < g_nSetups; i++)
         DrawOneSetup(g_setups[i], t, h, l, c, rates_total);
   }

   if(g_nSetups > 0)
   {
      TrhSetup last = g_setups[g_nSetups - 1];
      int stCode = 0;
      int exitBar = -1;
      string stTxt = StatusText(last, h, l, c, rates_total, stCode, exitBar);
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      DrawInfoPanel(last, stTxt, stCode, bid);

      if(InpAlertOnTpSl)
      {
         if(stCode == 2 && last.barTime != g_lastTpAlert)
         {
            g_lastTpAlert = last.barTime;
            string m = "TRH TP HIT @ " + DoubleToString(last.tp, _Digits);
            if(InpAlertPopup) Alert(m);
            if(InpAlertPush) SendNotification(m);
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
         if(stCode == 3 && last.barTime != g_lastSlAlert)
         {
            g_lastSlAlert = last.barTime;
            string m = "TRH SL HIT @ " + DoubleToString(last.sl, _Digits);
            if(InpAlertPopup) Alert(m);
            if(InpAlertPush) SendNotification(m);
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
      }

      if(InpShowComment)
      {
         Comment(
            "TRH | Trading Room Hunter\n",
            (last.dir == 1 ? "LONG" : "SHORT"), " · ", TrhModeLabel(last.mode), " · ", stTxt, "\n",
            "ENTRY ", DoubleToString(last.entry, _Digits), "\n",
            "SL    ", DoubleToString(last.sl, _Digits), "\n",
            "TP    ", DoubleToString(last.tp, _Digits), "\n",
            "Bar   ", TimeToString(last.barTime, TIME_DATE|TIME_MINUTES)
         );
      }
      else Comment("");
   }

   return rates_total;
}
//+------------------------------------------------------------------+
