//+------------------------------------------------------------------+
//| Session_Daylight.mq5                                             |
//| Soft session bands + day begin/end — visual only, non-trading    |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

input string InpPrefix      = "SDL_";
input int    InpGmtOffset   = 0;      // Hours to shift clock vs server
input bool   InpShowAsia    = true;
input bool   InpShowLondon  = true;
input bool   InpShowNY      = true;
input bool   InpShowOverlap = true;
input bool   InpShowDay     = true;
input bool   InpShowLabels  = false;  // keep false = less clutter
input bool   InpShowHud     = true;
input int    InpHistDays    = 5;
input int    InpDayHour     = 0;      // day begin hour after offset

input int    InpAsiaStart   = 19;
input int    InpAsiaEnd     = 0;      // wraps midnight
input int    InpLonStart    = 3;
input int    InpLonEnd      = 12;
input int    InpNyStart     = 8;
input int    InpNyEnd       = 17;

input color  InpAsiaClr     = C'55,95,150';
input color  InpLonClr      = C'150,120,55';
input color  InpNyClr       = C'45,130,105';
input color  InpOvlClr      = C'110,85,160';
input color  InpDayClr      = C'130,140,155';

string g_pfx;

//+------------------------------------------------------------------+
int HourAt(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t + (datetime)InpGmtOffset * 3600, dt);
   return dt.hour;
}

bool InWindow(const int h, const int startH, const int endH)
{
   if(startH == endH)
      return false;
   if(startH < endH)
      return (h >= startH && h < endH);
   return (h >= startH || h < endH);
}

int KindAt(const datetime t)
{
   const int h = HourAt(t);
   const bool lon = InpShowLondon && InWindow(h, InpLonStart, InpLonEnd);
   const bool ny  = InpShowNY && InWindow(h, InpNyStart, InpNyEnd);
   if(InpShowOverlap && lon && ny)
      return 4;
   if(ny)
      return 3;
   if(lon)
      return 2;
   if(InpShowAsia && InWindow(h, InpAsiaStart, InpAsiaEnd))
      return 1;
   return 0;
}

string SessName(const datetime t)
{
   switch(KindAt(t))
   {
      case 4:  return "LN/NY";
      case 3:  return "NEW YORK";
      case 2:  return "LONDON";
      case 1:  return "ASIA";
      default: return "OFF-SESSION";
   }
}

void MakeRect(const string name, const datetime t1, const datetime t2,
              const double y1, const double y2, const color clr)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, y1, t2, y2);
   ObjectSetInteger(0, name, OBJPROP_TIME, 0, t1);
   ObjectSetInteger(0, name, OBJPROP_TIME, 1, t2);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, y1);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 1, y2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 0);
}

void MakeVLine(const string name, const datetime t, const color clr)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_VLINE, 0, t, 0);
   ObjectSetInteger(0, name, OBJPROP_TIME, t);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void MakeText(const string name, const datetime t, const double price,
              const string text, const color clr)
{
   if(!InpShowLabels)
      return;
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_TIME, t);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void DrawHud()
{
   if(!InpShowHud)
      return;
   const string name = g_pfx + "HUD";
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_RIGHT_LOWER);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_LOWER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 16);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   }
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrSilver);
   ObjectSetString(0, name, OBJPROP_TEXT,
                   SessName(TimeCurrent()) + "  ·  " +
                   TimeToString(TimeCurrent() + (datetime)InpGmtOffset * 3600, TIME_MINUTES));
}

void DrawSessions()
{
   ObjectsDeleteAll(0, g_pfx);
   const int bars = Bars(_Symbol, PERIOD_CURRENT);
   if(bars < 30)
      return;

   const datetime oldest = TimeCurrent() - (datetime)InpHistDays * 86400;
   int from = bars - 2;
   for(int i = 0; i < bars - 2; i++)
   {
      const datetime ti = iTime(_Symbol, PERIOD_CURRENT, i);
      from = i;
      if(ti > 0 && ti < oldest)
         break;
   }
   from = (int)MathMin(bars - 2, MathMax(from, 50));

   double hi = ChartGetDouble(0, CHART_PRICE_MAX);
   double lo = ChartGetDouble(0, CHART_PRICE_MIN);
   if(hi <= lo)
   {
      const int hh = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, from, 0);
      const int ll = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, from, 0);
      hi = iHigh(_Symbol, PERIOD_CURRENT, hh);
      lo = iLow(_Symbol, PERIOD_CURRENT, ll);
   }
   const double pad = (hi - lo) * 0.03;
   hi += pad;
   lo -= pad;

   int seg = 0;
   int runKind = 0;
   datetime runStart = 0;
   int prevHour = -1;

   for(int i = from; i >= 0; --i)
   {
      const datetime t = iTime(_Symbol, PERIOD_CURRENT, i);
      if(t <= 0)
         continue;

      const int h = HourAt(t);
      const int kind = KindAt(t);

      if(InpShowDay && h == InpDayHour && prevHour != InpDayHour && prevHour >= 0)
      {
         MakeVLine(g_pfx + "D" + IntegerToString(i), t, InpDayClr);
         MakeText(g_pfx + "DL" + IntegerToString(i), t, hi, "DAY", InpDayClr);
      }
      prevHour = h;

      if(kind != runKind)
      {
         if(runKind > 0 && runStart > 0)
         {
            color c = InpAsiaClr;
            string tag = "AS";
            if(runKind == 2) { c = InpLonClr; tag = "LN"; }
            else if(runKind == 3) { c = InpNyClr; tag = "NY"; }
            else if(runKind == 4) { c = InpOvlClr; tag = "OV"; }
            MakeRect(g_pfx + "B" + IntegerToString(seg), runStart, t, lo, hi, c);
            MakeText(g_pfx + "L" + IntegerToString(seg), runStart, lo, tag, c);
            seg++;
         }
         runKind = kind;
         runStart = (kind > 0) ? t : 0;
      }
   }

   if(runKind > 0 && runStart > 0)
   {
      color c = InpAsiaClr;
      if(runKind == 2) c = InpLonClr;
      else if(runKind == 3) c = InpNyClr;
      else if(runKind == 4) c = InpOvlClr;
      const datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
      MakeRect(g_pfx + "B" + IntegerToString(seg), runStart, t0 + PeriodSeconds(), lo, hi, c);
   }

   DrawHud();
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
int OnInit()
{
   g_pfx = InpPrefix;
   IndicatorSetString(INDICATOR_SHORTNAME, "Session Daylight");
   return(INIT_SUCCEEDED);
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
   if(rates_total < 30)
      return 0;

   static datetime lastBar = 0;
   const datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(prev_calculated == 0 || t0 != lastBar)
   {
      lastBar = t0;
      DrawSessions();
   }
   else
      DrawHud();
   return rates_total;
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_CHART_CHANGE)
      DrawSessions();
}
//+------------------------------------------------------------------+
