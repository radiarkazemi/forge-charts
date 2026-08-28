//+------------------------------------------------------------------+
//| ICT_Liquidity_Expansion.mq5                                      |
//| Standalone ICT indicator (NOT TRH)                               |
//| Sweep SSL/BSL -> MSS -> FVG -> opposing liquidity TP             |
//+------------------------------------------------------------------+
#property copyright "ICT Liquidity Expansion"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.00"
#property description "ICT: liquidity raid -> MSS -> FVG -> opposing liq"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "ICT_Engine.mqh"

#ifndef ICT_ENGINE_VERSION
#define ICT_ENGINE_VERSION 0
#endif

input group "ICT Detection"
input int    InpPivotPeriod      = 5;      // Pivot Period
input double InpMinSweepAtr      = 0.05;   // Min Sweep Beyond Pivot (ATRx)
input double InpMinDispAtr       = 0.40;   // Min MSS Displacement Body (ATRx)
input double InpMinFvgAtr        = 0.10;   // Min FVG Size (ATRx)
input int    InpMaxMssBars       = 12;     // Max Bars After Sweep For MSS
input int    InpMaxFvgBars       = 10;     // Max Bars After MSS For FVG
input bool   InpRequireFvgRetest = true;   // Wait For FVG Retest
input int    InpMaxRetestBars    = 10;     // Max Bars To Wait For Retest
input int    InpCooldownBars     = 40;     // Cooldown Between Setups

input group "Entry / SL / TP"
input double InpSlPadAtr         = 0.08;   // SL Pad Beyond Sweep (ATRx)
input double InpRiskReward       = 3.0;    // Fallback RR if no opposing liq
input bool   InpUseOpposingLiq   = true;   // TP = opposing swing liquidity
input double InpLiqExtendAtr     = 1.5;    // Min Distance To Opposing Liq (ATRx)

input group "Display"
input bool   InpOnlyLast         = true;   // Only Last Setup
input int    InpHistoryCount     = 4;      // History Count
input bool   InpExtendToNow      = true;   // Extend Until TP/SL
input bool   InpShowPanel        = true;   // Info Panel
input bool   InpShowFvgBox       = true;   // Show FVG Box
input bool   InpShowHLines       = true;   // ENTRY / SL / TP Lines
input bool   InpAlertPopup       = true;   // Alert On New Setup
input bool   InpAlertSound       = true;   // Sound On New Setup
input string InpAlertSoundFile   = "alert.wav";
input bool   InpAlertOnTpSl      = true;   // Alert On TP / SL

input group "Colors"
input color  InpLongCol          = C'38,166,154';
input color  InpShortCol         = C'239,83,80';
input color  InpEntryCol         = C'120,123,134';
input color  InpPanelBg          = C'17,17,17';

string   OBJ_PREFIX = "ICT1_";
IctSetup g_setups[];
int      g_nSetups = 0;
datetime g_lastAlertTime = 0;
datetime g_lastTpAlert = 0;
datetime g_lastSlAlert = 0;
IctSetup g_holdSetup;
bool     g_holdValid = false;

int OnInit()
{
   if(ICT_ENGINE_VERSION < 100)
   {
      Alert("ICT: Engine missing/outdated. Put ICT_Engine.mqh next to this .mq5 and recompile.");
      return INIT_FAILED;
   }
   IndicatorSetString(INDICATOR_SHORTNAME, "ICT Liquidity Expansion");
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

void BuildConfig(IctConfig &cfg)
{
   cfg.pivotPeriod      = InpPivotPeriod;
   cfg.minSweepAtr      = InpMinSweepAtr;
   cfg.minDispAtr       = InpMinDispAtr;
   cfg.minFvgAtr        = InpMinFvgAtr;
   cfg.maxMssBars       = InpMaxMssBars;
   cfg.maxFvgBars       = InpMaxFvgBars;
   cfg.requireFvgRetest = InpRequireFvgRetest;
   cfg.maxRetestBars    = InpMaxRetestBars;
   cfg.slPadAtr         = InpSlPadAtr;
   cfg.riskReward       = InpRiskReward;
   cfg.useOpposingLiq   = InpUseOpposingLiq;
   cfg.liqExtendAtr     = InpLiqExtendAtr;
   cfg.cooldownBars     = InpCooldownBars;
}

string StatusText(const IctSetup &s, const double &high[], const double &low[],
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
      if(hitT) { statusOut = 2; exitBar = i; return "TP HIT"; }
      if(hitS) { statusOut = 3; exitBar = i; return "SL HIT"; }
   }
   statusOut = 1;
   return "IN TRADE";
}

void SetRect(const string name, const datetime t1, const double p1,
             const datetime t2, const double p2, const color col, const int alpha)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_TIME, 0, t1);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, p1);
   ObjectSetInteger(0, name, OBJPROP_TIME, 1, t2);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 1, p2);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, col);
   color c = col;
   // alpha via color mix approx: keep solid fill
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
}

void SetHLine(const string name, const double price, const color col, const int style)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_STYLE, style);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void SetLabel(const string name, const datetime t, const double price,
              const string text, const color col)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_TIME, t);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void SetPanelLabel(const string name, const int x, const int y,
                   const string text, const color col, const int fs)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fs);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void DrawInfoPanel(const IctSetup &s, const string stTxt, const int stCode, const double bid)
{
   if(!InpShowPanel) return;
   color side = (s.dir == 1) ? InpLongCol : InpShortCol;
   color stCol = clrSilver;
   if(stCode == 1) stCol = clrGold;
   if(stCode == 2) stCol = InpLongCol;
   if(stCode == 3) stCol = InpShortCol;

   double risk = MathAbs(s.entry - s.sl);
   double rr = (risk > 0) ? MathAbs(s.tp - s.entry) / risk : 0;
   double liveR = 0;
   if(risk > 0)
   {
      if(stCode == 2) liveR = rr;
      else if(stCode == 3) liveR = -1.0;
      else liveR = (s.dir == 1) ? (bid - s.entry) / risk : (s.entry - bid) / risk;
   }

   int y = 18;
   SetPanelLabel(OBJ_PREFIX + "P0", 18, y, "ICT | Liquidity Expansion", clrWhite, 10); y += 18;
   SetPanelLabel(OBJ_PREFIX + "P1", 18, y,
      (s.dir == 1 ? "LONG" : "SHORT") + " | RAID->MSS->FVG | " + stTxt, stCol, 9); y += 16;
   SetPanelLabel(OBJ_PREFIX + "P2", 18, y, "ENTRY  " + DoubleToString(s.entry, _Digits), InpEntryCol, 9); y += 14;
   SetPanelLabel(OBJ_PREFIX + "P3", 18, y, "SL     " + DoubleToString(s.sl, _Digits), InpShortCol, 9); y += 14;
   SetPanelLabel(OBJ_PREFIX + "P4", 18, y, "TP     " + DoubleToString(s.tp, _Digits) + "  (" + DoubleToString(rr, 1) + "R)", InpLongCol, 9); y += 14;
   SetPanelLabel(OBJ_PREFIX + "P5", 18, y,
      ((stCode == 2 || stCode == 3) ? "Final  " : "Live   ") + DoubleToString(liveR, 2) + "R", side, 9); y += 14;
   SetPanelLabel(OBJ_PREFIX + "P6", 18, y, "Sweep  " + DoubleToString(s.sweepPrice, _Digits), clrDimGray, 8); y += 12;
   SetPanelLabel(OBJ_PREFIX + "P7", 18, y, "Bar    " + TimeToString(s.barTime, TIME_DATE|TIME_MINUTES), clrDimGray, 8);
}

void DrawOneSetup(const IctSetup &s, const datetime &time[], const double &high[],
                  const double &low[], const double &close[], const int rates)
{
   int stCode = 0, exitBar = -1;
   StatusText(s, high, low, close, rates, stCode, exitBar);

   int bi = s.barIndex;
   if(bi < 0 || bi >= rates) return;

   datetime t1 = time[bi];
   datetime t2 = time[rates - 1];
   if(!InpExtendToNow || stCode >= 2)
   {
      int end = (exitBar >= 0) ? exitBar : MathMin(rates - 1, bi + 40);
      t2 = time[end];
   }

   string tag = IntegerToString((int)s.barTime);

   if(InpShowFvgBox)
   {
      color zc = (s.dir == 1) ? InpLongCol : InpShortCol;
      SetRect(OBJ_PREFIX + "FVG_" + tag, t1, s.fvgTop, t2, s.fvgBot, zc, 40);
   }

   if(InpShowHLines && stCode <= 1)
   {
      SetHLine(OBJ_PREFIX + "E_" + tag, s.entry, InpEntryCol, STYLE_DASH);
      SetHLine(OBJ_PREFIX + "S_" + tag, s.sl, InpShortCol, STYLE_DASH);
      SetHLine(OBJ_PREFIX + "T_" + tag, s.tp, InpLongCol, STYLE_DASH);
   }

   SetLabel(OBJ_PREFIX + "TAG_" + tag, t1,
      (s.dir == 1 ? s.fvgTop : s.fvgBot),
      "ICT " + (s.dir == 1 ? "LONG" : "SHORT") + " | RAID",
      (s.dir == 1 ? InpLongCol : InpShortCol));

   if((stCode == 2 || stCode == 3) && exitBar >= 0 && exitBar < rates)
   {
      SetLabel(OBJ_PREFIX + "EX_" + tag, time[exitBar],
         (stCode == 2 ? s.tp : s.sl),
         (stCode == 2 ? "TP" : "SL"),
         (stCode == 2 ? InpLongCol : InpShortCol));
   }
}

void NotifyNewSetup(const IctSetup &s)
{
   string msg = StringFormat(
      "ICT %s RAID->MSS->FVG\nENTRY %s\nSL %s\nTP %s\nSweep %s",
      s.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(s.entry, _Digits),
      DoubleToString(s.sl, _Digits),
      DoubleToString(s.tp, _Digits),
      DoubleToString(s.sweepPrice, _Digits));
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

   datetime t[];
   double o[], h[], l[], c[];
   ArrayResize(t, rates_total);
   ArrayResize(o, rates_total);
   ArrayResize(h, rates_total);
   ArrayResize(l, rates_total);
   ArrayResize(c, rates_total);

   bool asSeries = (rates_total > 1 && time[0] > time[rates_total - 1]);
   for(int i = 0; i < rates_total; i++)
   {
      int src = asSeries ? (rates_total - 1 - i) : i;
      t[i] = time[src];
      o[i] = open[src];
      h[i] = high[src];
      l[i] = low[src];
      c[i] = close[src];
   }

   // Rescan on new closed bar
   static datetime lastClosedScan = 0;
   datetime closedT = (rates_total >= 2) ? t[rates_total - 2] : 0;
   bool newClosed = (closedT != 0 && closedT != lastClosedScan);

   if(newClosed || prev_calculated == 0)
   {
      lastClosedScan = closedT;
      IctConfig cfg;
      BuildConfig(cfg);
      datetime prevTime = (g_nSetups > 0) ? g_setups[g_nSetups - 1].barTime : 0;
      g_nSetups = IctScanSetups(rates_total, t, o, h, l, c, cfg, g_setups);

      bool holdActive = false;
      if(g_holdValid)
      {
         int hs = 0, heb = -1;
         StatusText(g_holdSetup, h, l, c, rates_total, hs, heb);
         holdActive = (hs == 0 || hs == 1);
      }

      if(g_nSetups > 0)
      {
         IctSetup newest = g_setups[g_nSetups - 1];
         if(!holdActive)
         {
            g_holdSetup = newest;
            g_holdValid = true;
            if(newest.barTime != prevTime && newest.barTime != g_lastAlertTime)
            {
               g_lastAlertTime = newest.barTime;
               NotifyNewSetup(newest);
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
            SetPanelLabel(OBJ_PREFIX + "P0", 18, 18, "ICT | scanning for raid...", clrDimGray, 9);
         return rates_total;
      }

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

   IctSetup panelSetup;
   bool havePanel = false;
   if(g_holdValid) { panelSetup = g_holdSetup; havePanel = true; }
   else if(g_nSetups > 0) { panelSetup = g_setups[g_nSetups - 1]; havePanel = true; }

   if(havePanel)
   {
      int stCode = 0, exitBar = -1;
      string stTxt = StatusText(panelSetup, h, l, c, rates_total, stCode, exitBar);
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      DrawInfoPanel(panelSetup, stTxt, stCode, bid);

      if(InpAlertOnTpSl)
      {
         if(stCode == 2 && panelSetup.barTime != g_lastTpAlert)
         {
            g_lastTpAlert = panelSetup.barTime;
            string m = "ICT TP HIT @ " + DoubleToString(panelSetup.tp, _Digits);
            if(InpAlertPopup) Alert(m);
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
         if(stCode == 3 && panelSetup.barTime != g_lastSlAlert)
         {
            g_lastSlAlert = panelSetup.barTime;
            string m = "ICT SL HIT @ " + DoubleToString(panelSetup.sl, _Digits);
            if(InpAlertPopup) Alert(m);
            if(InpAlertSound) PlaySound(InpAlertSoundFile);
         }
      }
   }

   return rates_total;
}
//+------------------------------------------------------------------+
