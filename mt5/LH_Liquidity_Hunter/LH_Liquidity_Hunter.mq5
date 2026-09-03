//+------------------------------------------------------------------+
//| LH_Liquidity_Hunter.mq5                                          |
//| Exact Pine parity indicator — LH · Liquidity Hunter              |
//| 1 RAID → 2 CISD → 3 MSS → 4 FVG → ENTRY / SL / TP                 |
//+------------------------------------------------------------------+
#property copyright "LH Liquidity Hunter"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.20"
#property description "LH v1.20 exact Pine: RAID→CISD→MSS→FVG · ENTRY/SL/TP"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "LH_Engine.mqh"

#ifndef LH_ENGINE_VERSION
#define LH_ENGINE_VERSION 0
#endif

#define LH_IND_BUILD 120
#define LH_MIN_ENGINE 120

input group "Detection (exact Pine)"
input int    InpPivotPeriod      = 5;
input double InpMinSweepAtr      = 0.08;
input double InpMinDispAtr       = 0.55;
input double InpMinFvgAtr        = 0.12;
input int    InpMaxCisdBars      = 6;
input int    InpMaxStructBars    = 10;
input int    InpMaxFvgBars       = 8;
input bool   InpRequireCisd      = true;
input bool   InpAllowBos         = false;  // OFF = MSS only
input bool   InpRequireFvgRetest = true;
input int    InpMaxRetestBars    = 8;
input int    InpCooldownBars     = 50;

input group "Entry / SL / TP (exact Pine)"
input double InpSlPadAtr         = 0.20;
input double InpMinRiskAtr       = 0.35;
input double InpRiskReward       = 2.5;
input bool   InpUseOpposingLiq   = true;
input double InpLiqExtendAtr     = 1.2;
input double InpMinTpR           = 1.5;

input group "Display"
input bool   InpOnlyLast         = true;
input int    InpHistoryCount     = 3;
input bool   InpShowAnatomy      = true;
input bool   InpShowFvg          = true;
input bool   InpShowLevels       = true;
input bool   InpShowLevelLabels  = true;
input bool   InpShowPanel        = true;
input bool   InpExtendToNow      = true;
input bool   InpAlertPopup       = true;
input bool   InpAlertSound       = true;
input string InpAlertSoundFile   = "alert.wav";
input bool   InpAlertOnTpSl      = true;

input group "Colors"
input color  InpLongCol          = C'38,166,154';
input color  InpShortCol         = C'239,83,80';
input color  InpEntryCol         = C'207,216,220';
input color  InpRaidCol          = C'255,183,77';
input color  InpCisdCol          = C'100,181,246';
input color  InpMssCol           = C'186,104,200';
input color  InpPanelBg          = C'13,17,23';

string   OBJ_PREFIX = "LH120_";
LhSetup  g_setups[];
int      g_nSetups = 0;
datetime g_lastAlertTime = 0;
datetime g_lastTpAlert = 0;
datetime g_lastSlAlert = 0;

int OnInit()
{
   ObjectsDeleteAll(0, "LH1_");
   ObjectsDeleteAll(0, "LH120_");
   if(LH_ENGINE_VERSION < LH_MIN_ENGINE)
   {
      Alert("LH v", IntegerToString(LH_IND_BUILD),
            ": Engine outdated. Copy LH_Engine.mqh next to this file and recompile. Need >= ",
            IntegerToString(LH_MIN_ENGINE));
      return INIT_FAILED;
   }
   IndicatorSetString(INDICATOR_SHORTNAME,
      "LH v" + IntegerToString(LH_IND_BUILD) + " Eng" + IntegerToString(LH_ENGINE_VERSION));
   Print("LH Liquidity Hunter build ", LH_IND_BUILD,
         " | Eng ", LH_ENGINE_VERSION,
         " | RAID→CISD→MSS→FVG exact Pine");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, OBJ_PREFIX);
   Comment("");
}

void ClearDrawings() { ObjectsDeleteAll(0, OBJ_PREFIX); }

void BuildConfig(LhConfig &cfg)
{
   cfg.pivotPeriod      = InpPivotPeriod;
   cfg.minSweepAtr      = InpMinSweepAtr;
   cfg.minDispAtr       = InpMinDispAtr;
   cfg.minFvgAtr        = InpMinFvgAtr;
   cfg.maxCisdBars      = InpMaxCisdBars;
   cfg.maxStructBars    = InpMaxStructBars;
   cfg.maxFvgBars       = InpMaxFvgBars;
   cfg.requireCisd      = InpRequireCisd;
   cfg.allowBos         = InpAllowBos;
   cfg.requireFvgRetest = InpRequireFvgRetest;
   cfg.maxRetestBars    = InpMaxRetestBars;
   cfg.cooldownBars     = InpCooldownBars;
   cfg.slPadAtr         = InpSlPadAtr;
   cfg.minRiskAtr       = InpMinRiskAtr;
   cfg.riskReward       = InpRiskReward;
   cfg.useOpposingLiq   = InpUseOpposingLiq;
   cfg.liqExtendAtr     = InpLiqExtendAtr;
   cfg.minTpR           = InpMinTpR;
}

void SetRect(const string name, datetime t1, double p1, datetime t2, double p2, color col)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetTrend(const string name, datetime t1, double p1, datetime t2, double p2,
              color col, ENUM_LINE_STYLE style, int width)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetHLine(const string name, double price, color col, ENUM_LINE_STYLE style, int width)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetText(const string name, datetime t, double price, string txt, color col)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
   else ObjectMove(0, name, 0, t, price);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetLabel(const string name, int x, int y, string txt, color col, int fs=9)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fs);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetPanelBg(const string name, int x, int y, int w, int h)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, InpPanelBg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, C'48,54,61');
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

// status: 0 WAIT FILL, 1 IN TRADE, 2 TP, 3 SL
string StatusText(const LhSetup &s, const double &h[], const double &l[], const double &c[],
                  const int rates, int &code, int &exitBar)
{
   code = 0; exitBar = -1;
   bool filled = false;
   int fillBar = -1;
   for(int i = s.barIndex; i < rates; i++)
   {
      bool touch = (s.dir == 1) ? (l[i] <= s.entry) : (h[i] >= s.entry);
      bool thru  = (s.dir == 1) ? (c[i] >= s.entry) : (c[i] <= s.entry);
      if(touch || thru) { filled = true; fillBar = i; break; }
   }
   if(!filled) { code = 0; return "WAIT FILL"; }

   for(int i = fillBar; i < rates; i++)
   {
      bool hitT = (s.dir == 1) ? (h[i] >= s.tp) : (l[i] <= s.tp);
      bool hitS = (s.dir == 1) ? (l[i] <= s.sl) : (h[i] >= s.sl);
      if(hitS) { code = 3; exitBar = i; return "SL HIT"; }
      if(hitT) { code = 2; exitBar = i; return "TP HIT"; }
   }
   code = 1;
   return "IN TRADE";
}

color Dim(color col, int pct)
{
   int r = (int)((col) & 0xFF);
   int g = (int)((col >> 8) & 0xFF);
   int b = (int)((col >> 16) & 0xFF);
   r = r * (100 - pct) / 100;
   g = g * (100 - pct) / 100;
   b = b * (100 - pct) / 100;
   return (color)(r | (g << 8) | (b << 16));
}

void DrawOne(const LhSetup &s, const datetime &time[], const double &h[], const double &l[],
             const double &c[], const int rates, const bool primary)
{
   if(s.barIndex < 0 || s.barIndex >= rates) return;
   int st = 0, xb = -1;
   string stTxt = StatusText(s, h, l, c, rates, st, xb);

   int bi = s.barIndex;
   datetime t1 = time[bi];
   int right = MathMin(rates - 1, bi + 40);
   if(InpExtendToNow && st <= 1) right = rates - 1;
   if(st >= 2 && xb >= 0) right = xb;
   datetime t2 = time[right];
   if(t2 <= t1 && bi + 1 < rates) t2 = time[bi + 1];

   string tag = IntegerToString((int)s.barTime);
   color side = (s.dir == 1) ? InpLongCol : InpShortCol;
   double risk = MathAbs(s.entry - s.sl);
   double rr = (risk > 0) ? MathAbs(s.tp - s.entry) / risk : 0.0;

   datetime tRaid = (s.raidBar >= 0 && s.raidBar < rates) ? time[s.raidBar] : t1;
   datetime tCisd = (s.cisdBar >= 0 && s.cisdBar < rates) ? time[s.cisdBar] : tRaid;
   datetime tMss  = (s.mssBar  >= 0 && s.mssBar  < rates) ? time[s.mssBar]  : tCisd;

   if(InpShowFvg)
      SetRect(OBJ_PREFIX + "FVG_" + tag, tMss, s.fvgTop, t2, s.fvgBot, Dim(side, 78));

   if(InpShowAnatomy)
   {
      SetTrend(OBJ_PREFIX + "RAID_" + tag, tRaid, s.raidPx, t2, s.raidPx, InpRaidCol, STYLE_DOT, 2);
      SetText(OBJ_PREFIX + "LRAID_" + tag, tRaid, s.raidPx,
         "1 RAID " + (s.dir == 1 ? "SSL " : "BSL ") + DoubleToString(s.raidPx, _Digits), InpRaidCol);
      SetTrend(OBJ_PREFIX + "SWP_" + tag, tRaid, s.raidExt, tCisd, s.raidExt, InpRaidCol, STYLE_DASH, 1);
      SetTrend(OBJ_PREFIX + "CISD_" + tag, tCisd, s.cisdPx, t2, s.cisdPx, InpCisdCol, STYLE_DOT, 2);
      SetText(OBJ_PREFIX + "LCISD_" + tag, tCisd, s.cisdPx,
         "2 CISD " + DoubleToString(s.cisdPx, _Digits), InpCisdCol);
      SetTrend(OBJ_PREFIX + "MSS_" + tag, tMss, s.mssPx, t2, s.mssPx, InpMssCol, STYLE_DOT, 2);
      SetText(OBJ_PREFIX + "LMSS_" + tag, tMss, s.mssPx,
         "3 " + s.tag + " " + DoubleToString(s.mssPx, _Digits), InpMssCol);

      SetRect(OBJ_PREFIX + "RISK_" + tag, t1, MathMax(s.entry, s.sl), t2, MathMin(s.entry, s.sl), Dim(InpShortCol, 88));
      SetRect(OBJ_PREFIX + "REW_" + tag, t1, MathMax(s.entry, s.tp), t2, MathMin(s.entry, s.tp), Dim(InpLongCol, 90));
   }

   if(InpShowLevels && primary && st <= 1)
   {
      SetHLine(OBJ_PREFIX + "HE_" + tag, s.entry, InpEntryCol, STYLE_SOLID, 2);
      SetHLine(OBJ_PREFIX + "HS_" + tag, s.sl, InpShortCol, STYLE_SOLID, 2);
      SetHLine(OBJ_PREFIX + "HT_" + tag, s.tp, InpLongCol, STYLE_SOLID, 2);
   }

   if(InpShowLevelLabels)
   {
      SetText(OBJ_PREFIX + "LE_" + tag, t2, s.entry, "ENTRY " + DoubleToString(s.entry, _Digits), InpEntryCol);
      SetText(OBJ_PREFIX + "LS_" + tag, t2, s.sl, "SL " + DoubleToString(s.sl, _Digits), InpShortCol);
      SetText(OBJ_PREFIX + "LT_" + tag, t2, s.tp,
         "TP " + DoubleToString(s.tp, _Digits) + " (" + DoubleToString(rr, 1) + "R)", InpLongCol);
      color stc = (st == 0) ? clrGray : (st == 1) ? clrOrange : (st == 2) ? InpLongCol : InpShortCol;
      SetText(OBJ_PREFIX + "LST_" + tag, t2, (s.entry + s.sl) * 0.5, stTxt, stc);
   }

   SetText(OBJ_PREFIX + "TAG_" + tag, t1, (s.dir == 1 ? s.fvgTop : s.fvgBot),
      "LH " + (s.dir == 1 ? "LONG" : "SHORT") + " · " + s.tag, side);
}

void DrawPanel(const LhSetup &s, const string stTxt, const int st, const double bid)
{
   if(!InpShowPanel) return;
   double risk = MathAbs(s.entry - s.sl);
   double rr = (risk > 0) ? MathAbs(s.tp - s.entry) / risk : 0.0;
   double liveR = 0;
   if(risk > 0)
   {
      if(st == 2) liveR = rr;
      else if(st == 3) liveR = -1.0;
      else liveR = (s.dir == 1) ? (bid - s.entry) / risk : (s.entry - bid) / risk;
   }
   color side = (s.dir == 1) ? InpLongCol : InpShortCol;
   color stc = (st == 0) ? clrGray : (st == 1) ? clrOrange : (st == 2) ? InpLongCol : InpShortCol;
   int y = 70, dy = 16;
   SetPanelBg(OBJ_PREFIX + "PBG", 10, y, 300, 210);
   SetLabel(OBJ_PREFIX + "P0", 20, y + 8, "LH · Liquidity Hunter  v" + IntegerToString(LH_IND_BUILD), clrWhite, 10);
   SetLabel(OBJ_PREFIX + "P1", 20, y + 8 + dy, "POSITION  " + (s.dir == 1 ? "LONG" : "SHORT"), side, 11);
   SetLabel(OBJ_PREFIX + "P2", 20, y + 8 + dy * 2, "STATUS    " + stTxt, stc);
   SetLabel(OBJ_PREFIX + "P3", 20, y + 8 + dy * 3,
      "PATH  1 RAID → 2 CISD → 3 " + s.tag + " → 4 FVG", side, 8);
   SetLabel(OBJ_PREFIX + "P4", 20, y + 8 + dy * 4,
      "1 RAID   " + DoubleToString(s.raidPx, _Digits) + "  (sweep " + DoubleToString(s.raidExt, _Digits) + ")", InpRaidCol, 8);
   SetLabel(OBJ_PREFIX + "P5", 20, y + 8 + dy * 5,
      "2 CISD   " + DoubleToString(s.cisdPx, _Digits), InpCisdCol, 8);
   SetLabel(OBJ_PREFIX + "P6", 20, y + 8 + dy * 6,
      "3 MSS    " + DoubleToString(s.mssPx, _Digits) + "  (" + s.tag + ")", InpMssCol, 8);
   SetLabel(OBJ_PREFIX + "P7", 20, y + 8 + dy * 7, "ENTRY    " + DoubleToString(s.entry, _Digits), clrWhite);
   SetLabel(OBJ_PREFIX + "P8", 20, y + 8 + dy * 8, "SL       " + DoubleToString(s.sl, _Digits), InpShortCol);
   SetLabel(OBJ_PREFIX + "P9", 20, y + 8 + dy * 9,
      "TP       " + DoubleToString(s.tp, _Digits) + "  (" + DoubleToString(rr, 1) + "R)", InpLongCol);
   SetLabel(OBJ_PREFIX + "P10", 20, y + 8 + dy * 10,
      ((st >= 2) ? "RESULT   " : "LIVE     ") + DoubleToString(liveR, 2) + "R",
      (liveR >= 0 ? InpLongCol : InpShortCol));
   SetLabel(OBJ_PREFIX + "P11", 20, y + 8 + dy * 11, "Liquidity first — don't become liquidity", clrDimGray, 7);
}

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
   LhNormalizeBars(rates_total, time, open, high, low, close, t, o, h, l, c);

   if(newBar)
   {
      LhConfig cfg;
      BuildConfig(cfg);
      datetime prevTime = (g_nSetups > 0) ? g_setups[g_nSetups - 1].barTime : 0;
      g_nSetups = LhScanSetups(rates_total, t, o, h, l, c, cfg, g_setups);
      ClearDrawings();

      if(g_nSetups <= 0)
      {
         if(InpShowPanel)
         {
            SetPanelBg(OBJ_PREFIX + "PBG", 10, 70, 280, 50);
            SetLabel(OBJ_PREFIX + "P0", 20, 78, "LH · Liquidity Hunter", clrWhite, 10);
            SetLabel(OBJ_PREFIX + "P1", 20, 98, "Waiting for complete setup…", clrGray, 9);
         }
         return rates_total;
      }

      int from = InpOnlyLast ? g_nSetups - 1 : MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));
      for(int i = from; i < g_nSetups; i++)
         DrawOne(g_setups[i], t, h, l, c, rates_total, (i == g_nSetups - 1));

      LhSetup last = g_setups[g_nSetups - 1];
      if(last.barTime != prevTime && last.barTime != g_lastAlertTime)
      {
         g_lastAlertTime = last.barTime;
         string msg = StringFormat("LH %s · %s\nENTRY %s\nSL %s\nTP %s",
            last.dir == 1 ? "LONG" : "SHORT", last.tag,
            DoubleToString(last.entry, _Digits),
            DoubleToString(last.sl, _Digits),
            DoubleToString(last.tp, _Digits));
         if(InpAlertPopup) Alert(msg);
         if(InpAlertSound) PlaySound(InpAlertSoundFile);
         Print(msg);
      }
   }
   else if(g_nSetups > 0)
   {
      int from = InpOnlyLast ? g_nSetups - 1 : MathMax(0, g_nSetups - MathMax(1, InpHistoryCount));
      for(int i = from; i < g_nSetups; i++)
         DrawOne(g_setups[i], t, h, l, c, rates_total, (i == g_nSetups - 1));
   }

   if(g_nSetups > 0)
   {
      LhSetup panel = g_setups[g_nSetups - 1];
      int st = 0, xb = -1;
      string stTxt = StatusText(panel, h, l, c, rates_total, st, xb);
      DrawPanel(panel, stTxt, st, SymbolInfoDouble(_Symbol, SYMBOL_BID));

      if(InpAlertOnTpSl)
      {
         if(st == 2 && panel.barTime != g_lastTpAlert)
         {
            g_lastTpAlert = panel.barTime;
            if(InpAlertPopup) Alert("LH TP HIT @ ", DoubleToString(panel.tp, _Digits));
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
         if(st == 3 && panel.barTime != g_lastSlAlert)
         {
            g_lastSlAlert = panel.barTime;
            if(InpAlertPopup) Alert("LH SL HIT @ ", DoubleToString(panel.sl, _Digits));
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
      }
   }
   return rates_total;
}
//+------------------------------------------------------------------+
