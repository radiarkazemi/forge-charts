//+------------------------------------------------------------------+
//| Apex_Chart.mq5                                                   |
//| Visual layer for Apex Brain — pockets, ENTRY / SL / TP (1:3)     |
//+------------------------------------------------------------------+
#property copyright "Apex Brain"
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "Apex_Engine.mqh"

input int    InpLookback   = 220;
input int    InpMinScore   = 70;
input double InpRiskReward = 3.0;
input bool   InpAllowBuy   = true;
input bool   InpAllowSell  = true;
input color  InpLongColor  = clrDodgerBlue;
input color  InpShortColor = clrTomato;
input color  InpTpColor    = clrMediumSeaGreen;
input color  InpSlColor    = clrOrangeRed;

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
   IndicatorSetString(INDICATOR_SHORTNAME, "Apex Brain Chart");
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
   if(rates_total < 80) return 0;

   // OnCalculate arrays are series=false (oldest first) by default unless set.
   // Engine expects series=true (index 1 = last closed). Build series views.
   datetime t[];
   double o[], h[], l[], c[];
   ArraySetAsSeries(t, true);
   ArraySetAsSeries(o, true);
   ArraySetAsSeries(h, true);
   ArraySetAsSeries(l, true);
   ArraySetAsSeries(c, true);

   const int n = MathMin(rates_total, InpLookback);
   ArrayResize(t, n);
   ArrayResize(o, n);
   ArrayResize(h, n);
   ArrayResize(l, n);
   ArrayResize(c, n);
   for(int i = 0; i < n; i++)
   {
      const int src = rates_total - 1 - i;
      t[i] = time[src];
      o[i] = open[src];
      h[i] = high[src];
      l[i] = low[src];
      c[i] = close[src];
   }

   if(t[1] != g_lastBar || prev_calculated == 0)
   {
      g_lastBar = t[1];
      ArrayResize(g_setups, 0);
      g_lastBirthBar = -1;
      // Rescan window by walking closed bars lightly — one pass on latest
      ApexScan(n, t, o, h, l, c, g_cfg, g_setups, g_lastBirthBar);
      ApexManage(g_setups, g_cfg, o, h, l, c, n);
      DrawSetups();
   }
   return rates_total;
}

void DrawSetups()
{
   ObjectsDeleteAll(0, g_pfx);
   const int bi = ApexBestArmed(g_setups, g_cfg);
   int start = 0;
   if(bi >= 0) { DrawOne(g_setups[bi], 0, true); start = 0; }
   int drawn = (bi >= 0) ? 1 : 0;
   for(int i = ArraySize(g_setups) - 1; i >= 0 && drawn < 3; i--)
   {
      if(bi >= 0 && i == bi) continue;
      if(g_setups[i].dead) continue;
      if(g_setups[i].phase == APEX_DEAD || g_setups[i].phase == APEX_DONE) continue;
      DrawOne(g_setups[i], drawn, false);
      drawn++;
   }
   ChartRedraw(0);
}

void DrawOne(const ApexSetup &s, const int idx, const bool primary)
{
   const string id = g_pfx + IntegerToString(idx);
   const color zone = (s.dir > 0) ? InpLongColor : InpShortColor;
   const datetime t1 = s.birthTime;
   const datetime t2 = t1 + PeriodSeconds() * 40;

   // Pocket rectangle
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
