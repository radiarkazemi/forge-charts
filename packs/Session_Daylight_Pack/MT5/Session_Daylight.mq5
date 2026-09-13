//+------------------------------------------------------------------+
//| Session_Daylight.mq5                                             |
//| Tiny corner session/day box — no chart-wide bands                |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.10"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

input string InpPrefix     = "SDL_";
input int    InpGmtOffset  = 0;     // Hours vs server time
input int    InpAsiaStart  = 19;
input int    InpAsiaEnd    = 0;
input int    InpLonStart   = 3;
input int    InpLonEnd     = 12;
input int    InpNyStart    = 8;
input int    InpNyEnd      = 17;
input int    InpDayBegin   = 0;
input int    InpDayEnd     = 23;
input ENUM_BASE_CORNER InpCorner = CORNER_RIGHT_LOWER;
input int    InpX          = 12;    // Distance from corner
input int    InpY          = 18;
input color  InpBg         = C'11,14,18';
input color  InpBorder     = C'42,51,64';
input color  InpMuted      = C'154,166,181';
input color  InpText       = C'232,238,245';

string g_pfx;

int HourAt(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t + (datetime)InpGmtOffset * 3600, dt);
   return dt.hour;
}

int MinuteAt(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t + (datetime)InpGmtOffset * 3600, dt);
   return dt.min;
}

bool InWindow(const int h, const int a, const int b)
{
   if(a == b)
      return false;
   if(a < b)
      return (h >= a && h < b);
   return (h >= a || h < b);
}

string SessName(const datetime t)
{
   const int h = HourAt(t);
   const bool lon = InWindow(h, InpLonStart, InpLonEnd);
   const bool ny  = InWindow(h, InpNyStart, InpNyEnd);
   if(lon && ny)
      return "LN/NY";
   if(ny)
      return "NEW YORK";
   if(lon)
      return "LONDON";
   if(InWindow(h, InpAsiaStart, InpAsiaEnd))
      return "ASIA";
   return "OFF";
}

color SessColor(const string s)
{
   if(s == "LN/NY")
      return C'167,139,250';
   if(s == "NEW YORK")
      return C'70,195,155';
   if(s == "LONDON")
      return C'224,180,78';
   if(s == "ASIA")
      return C'91,141,239';
   return InpMuted;
}

string Two(const int v)
{
   return (v < 10 ? "0" : "") + IntegerToString(v);
}

void DrawBox()
{
   ObjectsDeleteAll(0, g_pfx);

   const datetime now = TimeCurrent();
   const string sess = SessName(now);
   const string clock = Two(HourAt(now)) + ":" + Two(MinuteAt(now));
   const string dayIn = Two(InpDayBegin) + ":00";
   const string dayOut = Two(InpDayEnd) + ":59";

   const int w = 150;
   const int h = 82;
   const string bg = g_pfx + "BG";

   ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, InpX);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, InpY);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, InpBg);
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, InpBorder);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);

   string keys[4];
   string vals[4];
   color  cols[4];
   keys[0] = "SESSION"; vals[0] = sess;   cols[0] = SessColor(sess);
   keys[1] = "CLOCK";   vals[1] = clock;  cols[1] = InpText;
   keys[2] = "DAY IN";  vals[2] = dayIn;  cols[2] = InpText;
   keys[3] = "DAY OUT"; vals[3] = dayOut; cols[3] = InpText;

   for(int i = 0; i < 4; i++)
   {
      const string kn = g_pfx + "K" + IntegerToString(i);
      const string vn = g_pfx + "V" + IntegerToString(i);
      const int yy = InpY + 10 + i * 17;

      ObjectCreate(0, kn, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, kn, OBJPROP_CORNER, InpCorner);
      ObjectSetInteger(0, kn, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetInteger(0, kn, OBJPROP_XDISTANCE, InpX + 10);
      ObjectSetInteger(0, kn, OBJPROP_YDISTANCE, yy);
      ObjectSetString(0, kn, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, kn, OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, kn, OBJPROP_COLOR, InpMuted);
      ObjectSetString(0, kn, OBJPROP_TEXT, keys[i]);
      ObjectSetInteger(0, kn, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, kn, OBJPROP_HIDDEN, true);

      ObjectCreate(0, vn, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, vn, OBJPROP_CORNER, InpCorner);
      ObjectSetInteger(0, vn, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
      ObjectSetInteger(0, vn, OBJPROP_XDISTANCE, InpX + w - 10);
      ObjectSetInteger(0, vn, OBJPROP_YDISTANCE, yy);
      ObjectSetString(0, vn, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, vn, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, vn, OBJPROP_COLOR, cols[i]);
      ObjectSetString(0, vn, OBJPROP_TEXT, vals[i]);
      ObjectSetInteger(0, vn, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, vn, OBJPROP_HIDDEN, true);
   }
   ChartRedraw(0);
}

int OnInit()
{
   g_pfx = InpPrefix;
   IndicatorSetString(INDICATOR_SHORTNAME, "Session Box");
   EventSetTimer(15);
   DrawBox();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, g_pfx);
}

void OnTimer()
{
   DrawBox();
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
   static datetime last = 0;
   const datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(prev_calculated == 0 || t0 != last)
   {
      last = t0;
      DrawBox();
   }
   return rates_total;
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_CHART_CHANGE)
      DrawBox();
}
//+------------------------------------------------------------------+
