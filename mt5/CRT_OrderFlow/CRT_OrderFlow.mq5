//+------------------------------------------------------------------+
//| CRT_OrderFlow.mq5                                                |
//| Standalone CRT OrderFlow indicator                               |
//| Bias(2+ CRT) + HTF FVG AOI + CRT entry inside FVG                |
//+------------------------------------------------------------------+
#property copyright "CRT OrderFlow"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.00"
#property description "CRT OrderFlow: 2+ CRT bias + HTF FVG + CRT entry in AOI"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "CRT_Engine.mqh"

#ifndef CRT_ENGINE_VERSION
#define CRT_ENGINE_VERSION 0
#endif

input group "CRT Model"
input int    InpRcLookback       = 8;
input double InpMinSweepAtr      = 0.02;
input bool   InpRequireCloseBack = true;
input int    InpMinBiasModels    = 2;      // Rule 1: min CRT same direction
input int    InpBiasLookbackBars = 80;
input int    InpCooldownBars     = 15;

input group "HTF FVG (Area of Interest)"
input ENUM_TIMEFRAMES InpHtf     = PERIOD_M15; // Rule 2: FVG timeframe
input double InpMinHtfFvgAtr     = 0.08;
input bool   InpRequireHtfFvg    = true;
input bool   InpEntryInsideFvg   = true;   // Rule 3
input int    InpHtfBars          = 500;

input group "Entry / SL / TP"
input double InpSlPadAtr         = 0.06;
input double InpRiskReward       = 2.5;
input bool   InpUseStructureTp   = true;

input group "Display / Alerts"
input bool   InpOnlyLast         = true;
input bool   InpShowPanel        = true;
input bool   InpShowFvg          = true;
input bool   InpShowHLines       = true;
input bool   InpAlertPopup       = true;
input bool   InpAlertSound       = true;
input string InpAlertSoundFile   = "alert.wav";
input bool   InpAlertOnTpSl      = true;
input color  InpLongCol          = C'38,166,154';
input color  InpShortCol         = C'239,83,80';
input color  InpEntryCol         = C'120,123,134';

string   OBJ_PREFIX = "CRT1_";
CrtSetup g_setups[];
int      g_nSetups = 0;
datetime g_lastAlert = 0, g_lastTp = 0, g_lastSl = 0;
CrtSetup g_hold;
bool     g_holdValid = false;

int OnInit()
{
   if(CRT_ENGINE_VERSION < 100)
   {
      Alert("CRT: put CRT_Engine.mqh in the SAME folder and recompile.");
      return INIT_FAILED;
   }
   IndicatorSetString(INDICATOR_SHORTNAME, "CRT OrderFlow");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, OBJ_PREFIX);
   Comment("");
}

void BuildConfig(CrtConfig &cfg)
{
   CrtDefaultConfig(cfg);
   cfg.rcLookback       = InpRcLookback;
   cfg.minSweepAtr      = InpMinSweepAtr;
   cfg.requireCloseBack = InpRequireCloseBack;
   cfg.minBiasModels    = InpMinBiasModels;
   cfg.biasLookbackBars = InpBiasLookbackBars;
   cfg.htf              = InpHtf;
   cfg.minHtfFvgAtr     = InpMinHtfFvgAtr;
   cfg.requireHtfFvg    = InpRequireHtfFvg;
   cfg.entryInsideFvg   = InpEntryInsideFvg;
   cfg.slPadAtr         = InpSlPadAtr;
   cfg.riskReward       = InpRiskReward;
   cfg.useStructureTp   = InpUseStructureTp;
   cfg.cooldownBars     = InpCooldownBars;
}

string StatusText(const CrtSetup &s, const double &high[], const double &low[],
                  const double &close[], const int rates, int &st, int &exitBar)
{
   st = 0; exitBar = -1;
   int bi = s.barIndex;
   if(bi < 0 || bi >= rates) return "-";
   bool filled = false; int fillBar = -1;
   for(int i = bi; i < rates; i++)
   {
      bool hit = (s.dir == 1) ? (low[i] <= s.entry || close[i] >= s.entry)
                              : (high[i] >= s.entry || close[i] <= s.entry);
      if(hit) { filled = true; fillBar = i; break; }
   }
   if(!filled) { st = 0; return "WAIT FILL"; }
   for(int i = fillBar; i < rates; i++)
   {
      bool hitT = (s.dir == 1) ? (high[i] >= s.tp) : (low[i] <= s.tp);
      bool hitS = (s.dir == 1) ? (low[i] <= s.sl) : (high[i] >= s.sl);
      if(hitT) { st = 2; exitBar = i; return "TP HIT"; }
      if(hitS) { st = 3; exitBar = i; return "SL HIT"; }
   }
   st = 1; return "IN TRADE";
}

void SetRect(const string name, datetime t1, double p1, datetime t2, double p2, color col)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, name, OBJPROP_TIME, 0, t1);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, p1);
   ObjectSetInteger(0, name, OBJPROP_TIME, 1, t2);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 1, p2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void SetHLine(const string name, double price, color col, int style)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void SetLbl(const string name, int x, int y, string text, color col, int fs)
{
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fs);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void DrawPanel(const CrtSetup &s, string stTxt, int st, double bid)
{
   if(!InpShowPanel) return;
   color side = (s.dir == 1) ? InpLongCol : InpShortCol;
   color stc = clrSilver;
   if(st == 1) stc = clrGold;
   if(st == 2) stc = InpLongCol;
   if(st == 3) stc = InpShortCol;
   double risk = MathAbs(s.entry - s.sl);
   double rr = (risk > 0) ? MathAbs(s.tp - s.entry) / risk : 0;
   double live = 0;
   if(risk > 0)
   {
      if(st == 2) live = rr;
      else if(st == 3) live = -1;
      else live = (s.dir == 1) ? (bid - s.entry) / risk : (s.entry - bid) / risk;
   }
   int y = 18;
   SetLbl(OBJ_PREFIX + "P0", 18, y, "CRT OrderFlow", clrWhite, 10); y += 18;
   SetLbl(OBJ_PREFIX + "P1", 18, y,
      (s.dir == 1 ? "LONG" : "SHORT") + " | bias x" + IntegerToString(s.biasCount) + " | " + stTxt, stc, 9); y += 16;
   SetLbl(OBJ_PREFIX + "P2", 18, y, "ENTRY " + DoubleToString(s.entry, _Digits), InpEntryCol, 9); y += 14;
   SetLbl(OBJ_PREFIX + "P3", 18, y, "SL    " + DoubleToString(s.sl, _Digits), InpShortCol, 9); y += 14;
   SetLbl(OBJ_PREFIX + "P4", 18, y, "TP    " + DoubleToString(s.tp, _Digits) + " (" + DoubleToString(rr, 1) + "R)", InpLongCol, 9); y += 14;
   SetLbl(OBJ_PREFIX + "P5", 18, y, ((st >= 2) ? "Final " : "Live  ") + DoubleToString(live, 2) + "R", side, 9); y += 14;
   SetLbl(OBJ_PREFIX + "P6", 18, y, "HTF FVG AOI + CRT in zone", clrDimGray, 8);
}

void DrawOne(const CrtSetup &s, const datetime &time[], const double &h[],
             const double &l[], const double &c[], const int rates)
{
   int st = 0, ex = -1;
   StatusText(s, h, l, c, rates, st, ex);
   int bi = s.barIndex;
   if(bi < 0 || bi >= rates) return;
   datetime t1 = time[bi];
   datetime t2 = time[rates - 1];
   if(st >= 2 && ex >= 0) t2 = time[ex];
   string tag = IntegerToString((int)s.barTime);
   color col = (s.dir == 1) ? InpLongCol : InpShortCol;
   if(InpShowFvg) SetRect(OBJ_PREFIX + "F_" + tag, t1, s.fvgTop, t2, s.fvgBot, col);
   if(InpShowHLines && st <= 1)
   {
      SetHLine(OBJ_PREFIX + "E_" + tag, s.entry, InpEntryCol, STYLE_DASH);
      SetHLine(OBJ_PREFIX + "S_" + tag, s.sl, InpShortCol, STYLE_DASH);
      SetHLine(OBJ_PREFIX + "T_" + tag, s.tp, InpLongCol, STYLE_DASH);
   }
}

void Notify(const CrtSetup &s)
{
   string msg = StringFormat("CRT %s | bias x%d\nENTRY %s\nSL %s\nTP %s",
      s.dir == 1 ? "LONG" : "SHORT", s.biasCount,
      DoubleToString(s.entry, _Digits),
      DoubleToString(s.sl, _Digits),
      DoubleToString(s.tp, _Digits));
   if(InpAlertPopup) Alert(msg);
   if(InpAlertSound) PlaySound(InpAlertSoundFile);
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

   datetime t[]; double o[], h[], l[], c[];
   ArrayResize(t, rates_total);
   ArrayResize(o, rates_total);
   ArrayResize(h, rates_total);
   ArrayResize(l, rates_total);
   ArrayResize(c, rates_total);
   bool asSeries = (rates_total > 1 && time[0] > time[rates_total - 1]);
   for(int i = 0; i < rates_total; i++)
   {
      int src = asSeries ? (rates_total - 1 - i) : i;
      t[i] = time[src]; o[i] = open[src]; h[i] = high[src];
      l[i] = low[src]; c[i] = close[src];
   }

   static datetime lastClosed = 0;
   datetime closedT = (rates_total >= 2) ? t[rates_total - 2] : 0;
   bool rescan = (prev_calculated == 0) || (closedT != 0 && closedT != lastClosed);

   if(rescan)
   {
      lastClosed = closedT;
      CrtConfig cfg; BuildConfig(cfg);

      datetime ht[]; double ho[], hh[], hl[], hc[];
      CrtFvg fvgs[];
      int nFvg = 0;
      if(CrtCopyHtf(_Symbol, InpHtf, InpHtfBars, ht, ho, hh, hl, hc))
         nFvg = CrtScanHtfFvgs(ArraySize(ht), ht, hh, hl, hc, cfg, fvgs);

      datetime prev = (g_nSetups > 0) ? g_setups[g_nSetups - 1].barTime : 0;
      g_nSetups = CrtScanSetups(rates_total, t, o, h, l, c, cfg, fvgs, nFvg, g_setups);

      bool holdActive = false;
      if(g_holdValid)
      {
         int hs = 0, he = -1;
         StatusText(g_hold, h, l, c, rates_total, hs, he);
         holdActive = (hs == 0 || hs == 1);
      }

      if(g_nSetups > 0)
      {
         CrtSetup newest = g_setups[g_nSetups - 1];
         if(!holdActive)
         {
            g_hold = newest; g_holdValid = true;
            if(newest.barTime != prev && newest.barTime != g_lastAlert)
            {
               g_lastAlert = newest.barTime;
               Notify(newest);
            }
         }
      }
      else if(!holdActive) g_holdValid = false;

      ObjectsDeleteAll(0, OBJ_PREFIX);
      if(!g_holdValid && g_nSetups <= 0)
      {
         if(InpShowPanel) SetLbl(OBJ_PREFIX + "P0", 18, 18, "CRT | scanning...", clrDimGray, 9);
         return rates_total;
      }
      if(g_holdValid) DrawOne(g_hold, t, h, l, c, rates_total);
      else if(g_nSetups > 0) DrawOne(g_setups[g_nSetups - 1], t, h, l, c, rates_total);
   }
   else if(g_holdValid)
      DrawOne(g_hold, t, h, l, c, rates_total);

   CrtSetup panel; bool have = false;
   if(g_holdValid) { panel = g_hold; have = true; }
   else if(g_nSetups > 0) { panel = g_setups[g_nSetups - 1]; have = true; }
   if(have)
   {
      int st = 0, ex = -1;
      string stTxt = StatusText(panel, h, l, c, rates_total, st, ex);
      DrawPanel(panel, stTxt, st, SymbolInfoDouble(_Symbol, SYMBOL_BID));
      if(InpAlertOnTpSl)
      {
         if(st == 2 && panel.barTime != g_lastTp)
         {
            g_lastTp = panel.barTime;
            if(InpAlertPopup) Alert("CRT TP HIT @ " + DoubleToString(panel.tp, _Digits));
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
         if(st == 3 && panel.barTime != g_lastSl)
         {
            g_lastSl = panel.barTime;
            if(InpAlertPopup) Alert("CRT SL HIT @ " + DoubleToString(panel.sl, _Digits));
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
      }
   }
   return rates_total;
}
//+------------------------------------------------------------------+
