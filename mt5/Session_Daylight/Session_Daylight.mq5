//+------------------------------------------------------------------+
//| Session_Daylight.mq5                                             |
//| Compact trader session HUD — corner panel only                   |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.30"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

input string InpPrefix       = "SDL_";
input int    InpGmtOffset    = 0;              // Hours vs server time
input int    InpAsiaStart    = 19;
input int    InpAsiaEnd      = 0;
input int    InpLonStart     = 3;
input int    InpLonEnd       = 12;
input int    InpNyStart      = 8;
input int    InpNyEnd        = 17;
input int    InpDayBegin     = 0;
input int    InpDayEnd       = 23;
input bool   InpShowProgress = true;
input bool   InpCompact      = false;
input ENUM_BASE_CORNER InpCorner = CORNER_RIGHT_LOWER;
input int    InpX            = 14;
input int    InpY            = 20;
input color  InpBg           = C'10,15,22';
input color  InpHead         = C'18,25,37';
input color  InpBorder       = C'30,42,58';
input color  InpMuted        = C'127,143,163';
input color  InpText         = C'248,250,252';
input color  InpSoft         = C'203,213,225';
input color  InpLive         = C'34,197,94';
input color  InpIdle         = C'100,116,139';

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

string Two(const int v)
{
   return (v < 10 ? "0" : "") + IntegerToString(v);
}

string WinTxt(const int a, const int b)
{
   return Two(a) + ":00-" + Two(b) + ":00";
}

int KindAt(const datetime t)
{
   const int h = HourAt(t);
   const bool lon = InWindow(h, InpLonStart, InpLonEnd);
   const bool ny  = InWindow(h, InpNyStart, InpNyEnd);
   if(lon && ny)
      return 4;
   if(ny)
      return 3;
   if(lon)
      return 2;
   if(InWindow(h, InpAsiaStart, InpAsiaEnd))
      return 1;
   return 0;
}

string SessName(const int kind)
{
   if(kind == 4)
      return "LONDON x NEW YORK";
   if(kind == 3)
      return "NEW YORK";
   if(kind == 2)
      return "LONDON";
   if(kind == 1)
      return "ASIA";
   return "OFF SESSION";
}

string SessWin(const int kind)
{
   if(kind == 4)
      return WinTxt(InpLonStart, InpLonEnd) + " / " + WinTxt(InpNyStart, InpNyEnd);
   if(kind == 3)
      return WinTxt(InpNyStart, InpNyEnd);
   if(kind == 2)
      return WinTxt(InpLonStart, InpLonEnd);
   if(kind == 1)
      return WinTxt(InpAsiaStart, InpAsiaEnd);
   return "awaiting open";
}

color SessColor(const int kind)
{
   if(kind == 4)
      return C'196,181,253';
   if(kind == 3)
      return C'52,211,153';
   if(kind == 2)
      return C'251,191,36';
   if(kind == 1)
      return C'56,189,248';
   return InpIdle;
}

double Progress(const datetime t, const int a, const int b)
{
   const int nowMin = HourAt(t) * 60 + MinuteAt(t);
   const int sa = a * 60;
   const int sb = b * 60;
   if(sa == sb)
      return 0.0;
   if(sa < sb)
   {
      const double p = (double)(nowMin - sa) / (double)MathMax(1, sb - sa);
      return MathMax(0.0, MathMin(1.0, p));
   }
   const int span = (1440 - sa) + sb;
   const int cur = (nowMin >= sa) ? (nowMin - sa) : ((1440 - sa) + nowMin);
   return MathMax(0.0, MathMin(1.0, (double)cur / (double)MathMax(1, span)));
}

string Meter(const double p, const bool live)
{
   if(!live)
      return "..........";
   const int n = (int)MathRound(p * 10.0);
   string out = "";
   for(int i = 1; i <= 10; i++)
      out += (i <= n ? "#" : ".");
   return out;
}

void PutLabel(const string name, const int x, const int y, const string text,
              const color clr, const int size, const ENUM_ANCHOR_POINT anchor)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void PutRect(const string name, const int x, const int y, const int w, const int h, const color bg, const color border)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void DrawBox()
{
   ObjectsDeleteAll(0, g_pfx);

   const datetime now = TimeCurrent();
   const int kind = KindAt(now);
   const bool live = (kind != 0);
   const string sess = SessName(kind);
   const string win = SessWin(kind);
   const color accent = SessColor(kind);
   const color liveCol = live ? InpLive : InpIdle;
   const string clock = Two(HourAt(now)) + ":" + Two(MinuteAt(now));
   const string liveTxt = live ? "LIVE" : "IDLE";

   double prog = 0.0;
   if(kind == 4)
      prog = MathMax(Progress(now, InpLonStart, InpLonEnd), Progress(now, InpNyStart, InpNyEnd));
   else if(kind == 3)
      prog = Progress(now, InpNyStart, InpNyEnd);
   else if(kind == 2)
      prog = Progress(now, InpLonStart, InpLonEnd);
   else if(kind == 1)
      prog = Progress(now, InpAsiaStart, InpAsiaEnd);

   const int w = InpCompact ? 210 : 236;
   int h = InpCompact ? 78 : 108;
   if(InpShowProgress)
      h += 18;

   PutRect(g_pfx + "BG", InpX, InpY, w, h, InpBg, accent);
   PutRect(g_pfx + "STRIPE", InpX, InpY, 4, h, accent, accent);
   PutRect(g_pfx + "HEAD", InpX + 4, InpY, w - 4, 22, InpHead, InpHead);

   PutLabel(g_pfx + "H1", InpX + 14, InpY + 5, "SESSIONS", InpMuted, 8, ANCHOR_LEFT_UPPER);
   PutLabel(g_pfx + "H2", InpX + w - 10, InpY + 5, liveTxt, liveCol, 8, ANCHOR_RIGHT_UPPER);

   PutLabel(g_pfx + "S1", InpX + 14, InpY + 28, sess, accent, 11, ANCHOR_LEFT_UPPER);
   PutLabel(g_pfx + "S2", InpX + w - 10, InpY + 28, clock, InpText, 11, ANCHOR_RIGHT_UPPER);

   int y = InpY + 50;
   if(InpCompact)
   {
      PutLabel(g_pfx + "W1", InpX + 14, y, win, InpSoft, 8, ANCHOR_LEFT_UPPER);
      PutLabel(g_pfx + "W2", InpX + w - 10, y,
               Two(InpDayBegin) + ":00->" + Two(InpDayEnd) + ":59", InpMuted, 8, ANCHOR_RIGHT_UPPER);
      y += 18;
   }
   else
   {
      PutLabel(g_pfx + "W1", InpX + 14, y, "WINDOW", InpMuted, 8, ANCHOR_LEFT_UPPER);
      PutLabel(g_pfx + "W2", InpX + w - 10, y, win, InpSoft, 9, ANCHOR_RIGHT_UPPER);
      y += 20;
   }

   if(InpShowProgress)
   {
      PutLabel(g_pfx + "P1", InpX + 14, y, Meter(prog, live), live ? accent : InpMuted, 8, ANCHOR_LEFT_UPPER);
      PutLabel(g_pfx + "P2", InpX + w - 10, y,
               live ? IntegerToString((int)MathRound(prog * 100.0)) + "%" : "-", InpMuted, 8, ANCHOR_RIGHT_UPPER);
      y += 18;
   }

   if(!InpCompact)
   {
      PutLabel(g_pfx + "D1", InpX + 14, y, "DAY OPEN " + Two(InpDayBegin) + ":00", InpMuted, 8, ANCHOR_LEFT_UPPER);
      PutLabel(g_pfx + "D2", InpX + w - 10, y, "CLOSE " + Two(InpDayEnd) + ":59", InpMuted, 8, ANCHOR_RIGHT_UPPER);
   }

   ChartRedraw(0);
}

int OnInit()
{
   g_pfx = InpPrefix;
   IndicatorSetString(INDICATOR_SHORTNAME, "Session Box");
   EventSetTimer(10);
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
