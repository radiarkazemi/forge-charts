//+------------------------------------------------------------------+
//| TRH_Supply_MM.mq5 — Chart indicator for Supply MM Pack           |
//| Draws ENTRY/SL for live zones · mirrors Pine score/arm           |
//+------------------------------------------------------------------+
#property copyright "TRH Forge"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "SMM_Engine.mqh"

input int    InpLookbackBars   = 1500;
input bool   InpUseS1          = true;
input bool   InpUseS2          = true;
input bool   InpUseS3          = true;
input bool   InpUseS4          = true;
input bool   InpUseS5          = true;
input int    InpMinScoreKeep   = 70;
input int    InpMinScoreArm    = 70;
input int    InpMaxLiveZones   = 3;
input color  InpEntryColor     = clrLime;
input color  InpSlColor        = clrTomato;
input color  InpArmedColor     = clrGold;

SmmConfig g_cfg;
SmmZone   g_zones[];
int       g_lastBirthBar = -1;
int       g_lastFsBirthBar = -1;
int       g_bullSweepUntil = -1;
int       g_bearSweepUntil = -1;
double    g_lastBullSweepLo = 0;
double    g_lastBearSweepHi = 0;
datetime  g_lastBar = 0;
string    g_prefix = "SMM_";

void ClearDrawings()
{
   ObjectsDeleteAll(0, g_prefix);
}

void DrawZones()
{
   ClearDrawings();
   int best = SmmBestLiveIndex(g_zones);
   for(int i = 0; i < ArraySize(g_zones); i++)
   {
      string tag = g_prefix + IntegerToString(i);
      color ec = (g_zones[i].armed) ? InpArmedColor : InpEntryColor;
      color sc = InpSlColor;
      bool dim = (best >= 0 && i != best);
      if(dim) { ec = clrSilver; sc = clrSilver; }

      ObjectCreate(0, tag + "_E", OBJ_HLINE, 0, 0, g_zones[i].entry);
      ObjectSetInteger(0, tag + "_E", OBJPROP_COLOR, ec);
      ObjectSetInteger(0, tag + "_E", OBJPROP_WIDTH, g_zones[i].armed ? 2 : 1);
      ObjectSetInteger(0, tag + "_E", OBJPROP_STYLE, STYLE_SOLID);

      ObjectCreate(0, tag + "_S", OBJ_HLINE, 0, 0, g_zones[i].sl);
      ObjectSetInteger(0, tag + "_S", OBJPROP_COLOR, sc);
      ObjectSetInteger(0, tag + "_S", OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, tag + "_S", OBJPROP_STYLE, STYLE_SOLID);

      ObjectCreate(0, tag + "_L", OBJ_TEXT, 0, g_zones[i].barTime, g_zones[i].entry);
      ObjectSetString(0, tag + "_L", OBJPROP_TEXT,
         StringFormat("%s %s%d %s  ENTRY %s",
            g_zones[i].armed ? "ARMED" : "WAIT",
            SmmGradeLetter(g_zones[i].grade), g_zones[i].score,
            SmmKindName(g_zones[i].kind),
            DoubleToString(g_zones[i].entry, _Digits)));
      ObjectSetInteger(0, tag + "_L", OBJPROP_COLOR, ec);
      ObjectSetInteger(0, tag + "_L", OBJPROP_FONTSIZE, 9);
   }
}

int OnInit()
{
   SmmDefaultConfig(g_cfg);
   g_cfg.useMM = InpUseS1;
   g_cfg.useMss = InpUseS2;
   g_cfg.useHtf = InpUseS3;
   g_cfg.useBb = InpUseS4;
   g_cfg.useFs = InpUseS5;
   g_cfg.minScoreKeep = InpMinScoreKeep;
   g_cfg.minScoreArm = InpMinScoreArm;
   g_cfg.maxLiveZones = InpMaxLiveZones;
   ArrayResize(g_zones, 0);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ClearDrawings();
   Comment("");
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
   if(rates_total < 100) return 0;

   // Copy to series orientation for engine
   MqlRates rates[];
   int copied = CopyRates(_Symbol, _Period, 0, MathMin(InpLookbackBars, rates_total), rates);
   if(copied < 100) return 0;
   ArraySetAsSeries(rates, true);

   datetime t[];
   double o[], h[], l[], c[];
   ArrayResize(t, copied);
   ArrayResize(o, copied);
   ArrayResize(h, copied);
   ArrayResize(l, copied);
   ArrayResize(c, copied);
   for(int i = 0; i < copied; i++)
   {
      t[i] = rates[i].time;
      o[i] = rates[i].open;
      h[i] = rates[i].high;
      l[i] = rates[i].low;
      c[i] = rates[i].close;
   }

   datetime t0 = t[0];
   if(t0 != g_lastBar)
   {
      g_lastBar = t0;
      SmmScanBirths(copied, t, o, h, l, c, g_cfg, g_zones,
                    g_lastBirthBar, g_lastFsBirthBar,
                    g_bullSweepUntil, g_bearSweepUntil,
                    g_lastBullSweepLo, g_lastBearSweepHi);
      SmmManageZones(g_zones, g_cfg, h, l, c, copied);
      DrawZones();
   }

   int best = SmmBestLiveIndex(g_zones);
   int armed = SmmBestArmedIndex(g_zones, g_cfg);
   string msg = StringFormat("TRH Supply MM  zones=%d", ArraySize(g_zones));
   if(armed >= 0)
      msg += StringFormat("\nARMED %s %s%d ENTRY %s SL %s",
         SmmKindName(g_zones[armed].kind),
         SmmGradeLetter(g_zones[armed].grade), g_zones[armed].score,
         DoubleToString(g_zones[armed].entry, _Digits),
         DoubleToString(g_zones[armed].sl, _Digits));
   else if(best >= 0)
      msg += StringFormat("\nBEST %s %s%d wait arm",
         SmmKindName(g_zones[best].kind),
         SmmGradeLetter(g_zones[best].grade), g_zones[best].score);
   Comment(msg);
   return rates_total;
}
