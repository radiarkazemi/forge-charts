//+------------------------------------------------------------------+
//| NabzTheme.mqh — Obsidian Gold visual system                      |
//+------------------------------------------------------------------+
#ifndef NABZ_THEME_MQH
#define NABZ_THEME_MQH

#define NABZ_PREFIX     "NABZ2_"
#define NABZ_SESS_PFX   "NABZSESS_"
#define NABZ_VERSION    "2.5.0"  // sticky MOVE, no chart-scroll wipe glitch
#define NABZ_TITLE      "NABZ"

//--- Base layout (scaled at runtime via NabzLayout)
#define NABZ_PANEL_W0   330
#define NABZ_PANEL_X0   14
#define NABZ_PANEL_Y0   24
#define NABZ_PAD0       14
#define NABZ_BTN_H0     36
#define NABZ_GAP0       8
#define NABZ_SECTION0   14

//--- Obsidian Gold palette
#define COL_BG0         C'8,10,14'
#define COL_BG1         C'14,17,24'
#define COL_BG2         C'20,24,33'
#define COL_BG3         C'28,34,46'
#define COL_BORDER      C'42,50,68'
#define COL_BORDER_HI   C'70,82,108'
#define COL_GOLD        C'240,180,41'
#define COL_GOLD_DIM    C'160,118,28'
#define COL_GOLD_GLOW   C'255,210,90'
#define COL_BUY         C'0,201,167'
#define COL_BUY_DIM     C'0,120,100'
#define COL_SELL        C'255,77,109'
#define COL_SELL_DIM    C'150,40,60'
#define COL_WARN        C'255,176,32'
#define COL_INFO        C'88,196,220'
#define COL_TEXT        C'230,237,243'
#define COL_MUTED       C'120,132,150'
#define COL_DIM         C'70,80,96'
#define COL_OK          C'63,185,80'
#define COL_DANGER      C'248,81,73'
#define COL_ACTIVE      C'240,180,41'
#define COL_SOS         C'180,20,40'
#define COL_PROGRESS_BG C'32,40,54'
#define COL_SESSION_LON C'56,100,180'
#define COL_SESSION_NY  C'180,90,50'
#define COL_SESSION_ASIA C'40,140,120'

enum ENUM_NABZ_RISK_MODE
{
   NABZ_RISK_PCT  = 0,
   NABZ_RISK_USD  = 1,
   NABZ_RISK_LOT  = 2,
   NABZ_RISK_BAL  = 3
};

enum ENUM_NABZ_VIEW
{
   NABZ_VIEW_NONE     = 0,
   NABZ_VIEW_JOURNAL  = 1,
   NABZ_VIEW_SESSIONS = 2,
   NABZ_VIEW_ECO      = 3,
   NABZ_VIEW_COACH    = 4,
   NABZ_VIEW_PCT      = 5,
   NABZ_VIEW_SETTINGS = 6
};

enum ENUM_NABZ_DETAIL_UNIT
{
   NABZ_UNIT_PERCENT = 0,
   NABZ_UNIT_MONEY   = 1,
   NABZ_UNIT_POINTS  = 2
};

struct NabzLayout
{
   int panelW;
   int panelX;
   int panelY;
   int pad;
   int btnH;
   int gap;
   int section;
   int fontTitle;
   int fontBody;
   int fontSec;
   int fontTiny;
   int miniH;
   int bottomReserve; // keep clear of MT5 terminal / toolbox
   int maxH;          // max panel height in pixels
};

string NabzRiskModeLabel(const ENUM_NABZ_RISK_MODE m)
{
   switch(m)
   {
      case NABZ_RISK_PCT: return "%";
      case NABZ_RISK_USD: return "$";
      case NABZ_RISK_LOT: return "LOT";
      case NABZ_RISK_BAL: return "BAL";
   }
   return "%";
}

color NabzMix(const color a, const color b, const int pctTowardB)
{
   int p = MathMax(0, MathMin(100, pctTowardB));
   int ar = (int)(a & 0xFF), ag = (int)((a >> 8) & 0xFF), ab = (int)((a >> 16) & 0xFF);
   int br = (int)(b & 0xFF), bg = (int)((b >> 8) & 0xFF), bb = (int)((b >> 16) & 0xFF);
   int r = ar + (br - ar) * p / 100;
   int g = ag + (bg - ag) * p / 100;
   int bl = ab + (bb - ab) * p / 100;
   return (color)(r | (g << 8) | (bl << 16));
}

void NabzLayoutCompute(NabzLayout &L, const int bottomReserve = 140)
{
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int chartH = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   if(chartW < 400) chartW = 1200;
   if(chartH < 300) chartH = 800;

   L.bottomReserve = bottomReserve;
   if(L.bottomReserve < 60) L.bottomReserve = 60;

   // Target ~26% of chart width, clamped — leave room for chart
   int w = (int)MathRound(chartW * 0.26);
   if(w < 300) w = 300;
   if(w > 360) w = 360;
   if(w > chartW - 100) w = chartW - 100;

   double scale = (double)w / (double)NABZ_PANEL_W0;
   if(scale < 0.90) scale = 0.90;
   if(scale > 1.12) scale = 1.12;

   // Available height above terminal / toolbox
   int usableH = chartH - L.bottomReserve - 20;
   if(usableH < 360) usableH = 360;
   L.maxH = usableH;

   double vScale = 1.0;
   if(usableH < 720) vScale = 0.90;
   if(usableH < 580) vScale = 0.82;
   if(usableH < 480) vScale = 0.74;

   // Keep user drag offsets if already set
   if(L.panelX < 4) L.panelX = NABZ_PANEL_X0;
   if(L.panelY < 4) L.panelY = NABZ_PANEL_Y0;
   if(L.panelX > chartW - 80) L.panelX = chartW - 80;
   if(L.panelY > chartH - L.bottomReserve - 60)
      L.panelY = MathMax(8, chartH - L.bottomReserve - 60);

   L.panelW   = w;
   L.pad      = (int)MathRound(NABZ_PAD0 * scale);
   L.btnH     = (int)MathRound(NABZ_BTN_H0 * scale * vScale);
   if(L.btnH < 26) L.btnH = 26;
   L.gap      = (int)MathRound(NABZ_GAP0 * scale);
   L.section  = (int)MathRound(NABZ_SECTION0 * scale * vScale);
   L.fontTitle = (scale >= 1.05 ? 15 : 14);
   L.fontBody  = (vScale < 0.85 ? 9 : 10);
   L.fontSec   = (vScale < 0.85 ? 8 : 9);
   L.fontTiny  = 8;
   L.miniH     = 48;
}

#endif
//+------------------------------------------------------------------+
