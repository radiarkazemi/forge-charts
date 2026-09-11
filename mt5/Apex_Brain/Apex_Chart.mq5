//+------------------------------------------------------------------+
//| Apex_Chart.mq5                                                   |
//| Always-on HUD + pocket / ENTRY / SL / TP (1:3)                   |
//+------------------------------------------------------------------+
#property copyright "Apex Brain"
#property version   "1.10"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "Apex_Engine.mqh"

input int    InpLookback   = 220;
input int    InpReplayBars = 140;
input int    InpMinScore   = 55;
input double InpRiskReward = 3.0;
input bool   InpAllowBuy   = true;
input bool   InpAllowSell  = true;
input color  InpLongColor  = clrDodgerBlue;
input color  InpShortColor = clrTomato;
input color  InpTpColor    = clrMediumSeaGreen;
input color  InpSlColor    = clrOrangeRed;
input color  InpHudColor   = clrAqua;

ApexConfig g_cfg;
ApexSetup  g_setups[];
int        g_lastBirthBar = -1;
datetime   g_lastBar = 0;
string     g_pfx = "APEX_";

int OnInit()
{
   ApexDefaultConfig(g_cfg);
   g_cfg.allowLong = InpAllowBuy;
   g_cfg.allowShort = InpAllowSell;
   g_cfg.confirmMinScore = InpMinScore;
   g_cfg.riskReward = InpRiskReward;
   ArrayResize(g_setups, 0);
   IndicatorSetString(INDICATOR_SHORTNAME, "Apex Brain");
   DrawHud("APEX · loading", "replaying structure…");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, g_pfx);
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
   if(rates_total < 80)
   {
      DrawHud("APEX · waiting", "need ≥80 bars");
      return 0;
   }

   datetime t[];
   double o[], h[], l[], c[];
   ArraySetAsSeries(t, true);
   ArraySetAsSeries(o, true);
   ArraySetAsSeries(h, true);
   ArraySetAsSeries(l, true);
   ArraySetAsSeries(c, true);

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   const int want = (int)MathMin(rates_total, InpLookback);
   const int n = CopyRates(_Symbol, PERIOD_CURRENT, 0, want, rates);
   if(n < 80)
   {
      DrawHud("APEX · waiting", "CopyRates failed — load more history");
      return rates_total;
   }

   ArrayResize(t, n);
   ArrayResize(o, n);
   ArrayResize(h, n);
   ArrayResize(l, n);
   ArrayResize(c, n);
   for(int i = 0; i < n; i++)
   {
      t[i] = rates[i].time;
      o[i] = rates[i].open;
      h[i] = rates[i].high;
      l[i] = rates[i].low;
      c[i] = rates[i].close;
   }

   if(t[1] != g_lastBar || prev_calculated == 0)
   {
      g_lastBar = t[1];
      ApexReplay(n, t, o, h, l, c, g_cfg, g_setups, g_lastBirthBar, InpReplayBars);
      DrawAll(n, t, h, l);
   }
   else
      RefreshHud();

   return rates_total;
}

int AliveCount()
{
   int n = 0;
   for(int i = 0; i < ArraySize(g_setups); i++)
   {
      if(g_setups[i].dead) continue;
      if(g_setups[i].phase == APEX_DEAD || g_setups[i].phase == APEX_DONE) continue;
      n++;
   }
   return n;
}

void RefreshHud()
{
   const int bi = ApexBestArmed(g_setups, g_cfg);
   if(bi < 0)
   {
      DrawHud("APEX · SCOUTING",
              StringFormat("%s %s · swing map on · waiting pocket",
                           _Symbol, EnumToString(_Period)));
      return;
   }
   const ApexSetup s = g_setups[bi];
   DrawHud(StringFormat("APEX · %s · %s", ApexPhaseName(s.phase), (s.dir > 0 ? "LONG" : "SHORT")),
           StringFormat("%s | score %d G%s | E %s SL %s TP %s | n=%d",
                        s.story, s.score, ApexGradeLetter(s.grade),
                        DoubleToString(s.entry, _Digits),
                        DoubleToString(s.sl, _Digits),
                        DoubleToString(s.tp, _Digits),
                        AliveCount()));
}

void DrawHud(const string title, const string detail)
{
   const string box = g_pfx + "HUD";
   const string t1  = g_pfx + "HUD_T";
   const string t2  = g_pfx + "HUD_D";

   if(ObjectFind(0, box) < 0)
   {
      ObjectCreate(0, box, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, box, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, box, OBJPROP_XDISTANCE, 12);
      ObjectSetInteger(0, box, OBJPROP_YDISTANCE, 18);
      ObjectSetInteger(0, box, OBJPROP_XSIZE, 540);
      ObjectSetInteger(0, box, OBJPROP_YSIZE, 56);
      ObjectSetInteger(0, box, OBJPROP_BGCOLOR, clrBlack);
      ObjectSetInteger(0, box, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, box, OBJPROP_COLOR, InpHudColor);
      ObjectSetInteger(0, box, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, box, OBJPROP_BACK, false);
      ObjectSetInteger(0, box, OBJPROP_SELECTABLE, false);
   }

   if(ObjectFind(0, t1) < 0)
   {
      ObjectCreate(0, t1, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, t1, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, t1, OBJPROP_XDISTANCE, 22);
      ObjectSetInteger(0, t1, OBJPROP_YDISTANCE, 24);
      ObjectSetString(0, t1, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, t1, OBJPROP_FONTSIZE, 11);
      ObjectSetInteger(0, t1, OBJPROP_COLOR, InpHudColor);
      ObjectSetInteger(0, t1, OBJPROP_SELECTABLE, false);
   }
   ObjectSetString(0, t1, OBJPROP_TEXT, title);

   if(ObjectFind(0, t2) < 0)
   {
      ObjectCreate(0, t2, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, t2, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, t2, OBJPROP_XDISTANCE, 22);
      ObjectSetInteger(0, t2, OBJPROP_YDISTANCE, 44);
      ObjectSetString(0, t2, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, t2, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, t2, OBJPROP_COLOR, clrSilver);
      ObjectSetInteger(0, t2, OBJPROP_SELECTABLE, false);
   }
   ObjectSetString(0, t2, OBJPROP_TEXT, detail);
}

void DrawAll(const int n, const datetime &t[], const double &h[], const double &l[])
{
   ObjectsDeleteAll(0, g_pfx);

   double sh, slv;
   int shB, slB;
   if(ApexLastSwing(h, l, n, g_cfg.swingPivot, sh, shB, slv, slB))
   {
      if(shB >= 0)
      {
         ObjectCreate(0, g_pfx + "SW_HI", OBJ_ARROW_DOWN, 0, t[shB], sh);
         ObjectSetInteger(0, g_pfx + "SW_HI", OBJPROP_COLOR, InpShortColor);
         ObjectSetInteger(0, g_pfx + "SW_HI", OBJPROP_WIDTH, 2);
         ObjectSetInteger(0, g_pfx + "SW_HI", OBJPROP_SELECTABLE, false);
         HLine(g_pfx + "SW_HI_L", sh, InpShortColor, 1, STYLE_DOT);
      }
      if(slB >= 0)
      {
         ObjectCreate(0, g_pfx + "SW_LO", OBJ_ARROW_UP, 0, t[slB], slv);
         ObjectSetInteger(0, g_pfx + "SW_LO", OBJPROP_COLOR, InpLongColor);
         ObjectSetInteger(0, g_pfx + "SW_LO", OBJPROP_WIDTH, 2);
         ObjectSetInteger(0, g_pfx + "SW_LO", OBJPROP_SELECTABLE, false);
         HLine(g_pfx + "SW_LO_L", slv, InpLongColor, 1, STYLE_DOT);
      }
   }

   const int bi = ApexBestArmed(g_setups, g_cfg);
   int drawn = 0;
   if(bi >= 0)
   {
      DrawOne(g_setups[bi], 0, true);
      drawn++;
   }
   for(int i = ArraySize(g_setups) - 1; i >= 0 && drawn < 4; i--)
   {
      if(bi >= 0 && i == bi) continue;
      if(g_setups[i].dead) continue;
      if(g_setups[i].phase == APEX_DEAD || g_setups[i].phase == APEX_DONE) continue;
      DrawOne(g_setups[i], drawn, false);
      drawn++;
   }

   RefreshHud();
   ChartRedraw(0);
}

void DrawOne(const ApexSetup &s, const int idx, const bool primary)
{
   const string id = g_pfx + IntegerToString(idx);
   const color zone = (s.dir > 0) ? InpLongColor : InpShortColor;
   const datetime t1 = (s.birthTime > 0 ? s.birthTime : TimeCurrent());
   const datetime t2 = t1 + (datetime)PeriodSeconds() * 48;

   ObjectCreate(0, id + "_zn", OBJ_RECTANGLE, 0, t1, s.prox, t2, s.dist);
   ObjectSetInteger(0, id + "_zn", OBJPROP_COLOR, zone);
   ObjectSetInteger(0, id + "_zn", OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, id + "_zn", OBJPROP_WIDTH, primary ? 2 : 1);
   ObjectSetInteger(0, id + "_zn", OBJPROP_BACK, true);
   ObjectSetInteger(0, id + "_zn", OBJPROP_FILL, true);
   ObjectSetInteger(0, id + "_zn", OBJPROP_SELECTABLE, false);

   HLine(id + "_en", s.entry, zone, primary ? 2 : 1, STYLE_SOLID);
   HLine(id + "_sl", s.sl, InpSlColor, 1, STYLE_DASH);
   HLine(id + "_tp", s.tp, InpTpColor, 1, STYLE_DOT);

   ObjectCreate(0, id + "_lb", OBJ_TEXT, 0, t2, s.entry);
   ObjectSetString(0, id + "_lb", OBJPROP_TEXT,
                   StringFormat("APEX %s %s G%s %d  1:%.0f",
                                (s.dir > 0 ? "LONG" : "SHORT"),
                                ApexPhaseName(s.phase),
                                ApexGradeLetter(s.grade),
                                s.score,
                                InpRiskReward));
   ObjectSetInteger(0, id + "_lb", OBJPROP_COLOR, zone);
   ObjectSetInteger(0, id + "_lb", OBJPROP_FONTSIZE, primary ? 10 : 8);
   ObjectSetString(0, id + "_lb", OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, id + "_lb", OBJPROP_SELECTABLE, false);
}

void HLine(const string name, const double price, const color clr, const int width, const ENUM_LINE_STYLE st)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}
//+------------------------------------------------------------------+
