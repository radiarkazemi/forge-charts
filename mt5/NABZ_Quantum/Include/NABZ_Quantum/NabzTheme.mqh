//+------------------------------------------------------------------+
//| NabzTheme.mqh — Obsidian Gold visual system                      |
//| Creative dark UI: charcoal glass + molten gold accents           |
//+------------------------------------------------------------------+
#ifndef NABZ_THEME_MQH
#define NABZ_THEME_MQH

#define NABZ_PREFIX     "NABZ2_"
#define NABZ_VERSION    "2.0.0"
#define NABZ_TITLE      "NABZ"

//--- Layout
#define NABZ_PANEL_W    268
#define NABZ_PANEL_X    12
#define NABZ_PANEL_Y    28
#define NABZ_PAD        10
#define NABZ_ROW_H      28
#define NABZ_BTN_H      30
#define NABZ_GAP        6
#define NABZ_SECTION_GAP 10
#define NABZ_RADIUS_HINT 6

//--- Obsidian Gold palette (MQL5 color = BGR via C'R,G,B')
#define COL_BG0         C'8,10,14'         // deepest void
#define COL_BG1         C'14,17,24'        // panel body
#define COL_BG2         C'20,24,33'        // raised surface
#define COL_BG3         C'28,34,46'        // chip / input
#define COL_BORDER      C'42,50,68'        // soft edge
#define COL_BORDER_HI   C'70,82,108'       // focus edge
#define COL_GOLD        C'240,180,41'      // molten gold
#define COL_GOLD_DIM    C'160,118,28'      // muted gold
#define COL_GOLD_GLOW   C'255,210,90'      // highlight
#define COL_BUY         C'0,201,167'       // teal buy
#define COL_BUY_DIM     C'0,120,100'
#define COL_SELL        C'255,77,109'      // crimson sell
#define COL_SELL_DIM    C'150,40,60'
#define COL_WARN        C'255,176,32'      // amber
#define COL_INFO        C'88,196,220'      // cyan
#define COL_TEXT        C'230,237,243'     // primary text
#define COL_MUTED       C'120,132,150'     // secondary
#define COL_DIM         C'70,80,96'        // tertiary
#define COL_OK          C'63,185,80'       // success green
#define COL_DANGER      C'248,81,73'       // danger
#define COL_ACTIVE      C'240,180,41'      // active chip
#define COL_SOS         C'180,20,40'       // emergency
#define COL_PROGRESS_BG C'32,40,54'
#define COL_SESSION_LON C'56,100,180'
#define COL_SESSION_NY  C'180,90,50'
#define COL_SESSION_ASIA C'40,140,120'

enum ENUM_NABZ_RISK_MODE
{
   NABZ_RISK_PCT  = 0,  // % of equity
   NABZ_RISK_USD  = 1,  // fixed $
   NABZ_RISK_LOT  = 2,  // fixed lot
   NABZ_RISK_BAL  = 3   // % of balance
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

#endif
//+------------------------------------------------------------------+
