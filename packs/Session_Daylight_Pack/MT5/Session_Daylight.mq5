//+------------------------------------------------------------------+
//| Session_Daylight.mq5                                             |
//| Medium session card — top-right empty space (away from TRH)      |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.50"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

input string InpPrefix       = "SDL_";
input int    InpGmtOffset    = 0;                 // Hours vs server time
input int    InpAsiaStart    = 19;
input int    InpAsiaEnd      = 0;
input int    InpLonStart     = 3;
input int    InpLonEnd       = 12;
input int    InpNyStart      = 8;
input int    InpNyEnd        = 17;
input int    InpDayBegin     = 0;
input int    InpDayEnd       = 23;
input bool   InpShowProgress = true;
// Top-right empty space (away from One-Click + TRH on the left)
input ENUM_BASE_CORNER InpCorner = CORNER_RIGHT_UPPER;
input int    InpX            = 28;                // Margin from right
input int    InpY            = 24;                // Margin from top
input int    InpWidth        = 200;               // Card width (medium)
input int    InpFontSize     = 10;
input color  InpBg           = C'10,14,20';
input color  InpHead         = C'18,24,34';
input color  InpMuted        = C'148,163,184';
input color  InpText         = C'241,245,249';
input color  InpLive         = C'34,197,94';
input color  InpIdle         = C'100,116,139';

string g_pfx;
bool   g_fromRight;
bool   g_fromBottom;

bool IsRightCorner(const ENUM_BASE_CORNER c)
{
   return (c == CORNER_RIGHT_UPPER || c == CORNER_RIGHT_LOWER);
}

bool IsBottomCorner(const ENUM_BASE_CORNER c)
{
   return (c == CORNER_LEFT_LOWER || c == CORNER_RIGHT_LOWER);
}

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
      return "LN x NY";
   if(kind == 3)
      return "NEW YORK";
   if(kind == 2)
      return "LONDON";
   if(kind == 1)
      return "ASIA";
   return "OFF";
}

string SessWin(const int kind)
{
   if(kind == 4)
      return WinTxt(InpLonStart, InpLonEnd) + " | " + WinTxt(InpNyStart, InpNyEnd);
   if(kind == 3)
      return WinTxt(InpNyStart, InpNyEnd);
   if(kind == 2)
      return WinTxt(InpLonStart, InpLonEnd);
   if(kind == 1)
      return WinTxt(InpAsiaStart, InpAsiaEnd);
   return "--:--";
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

int DistLeft(const int panelW, const int insetFromLeft)
{
   if(g_fromRight)
      return InpX + panelW - insetFromLeft;
   return InpX + insetFromLeft;
}

int DistTop(const int panelH, const int insetFromTop)
{
   if(g_fromBottom)
      return InpY + panelH - insetFromTop;
   return InpY + insetFromTop;
}

void PutLabel(const string name, const int xDist, const int yDist, const string text,
              const color clr, const int size, const bool alignRight)
{
   const ENUM_ANCHOR_POINT anchor = alignRight ? ANCHOR_RIGHT_UPPER : ANCHOR_LEFT_UPPER;
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xDist);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yDist);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
}

void PutRect(const string name, const int xDist, const int yDist, const int w, const int h,
             const color bg, const color border)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xDist);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yDist);
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

void PutBar(const string name, const int panelW, const int panelH,
            const int insetL, const int insetTop, const int barW, const int barH,
            const color clr)
{
   const int xDist = g_fromRight ? (InpX + panelW - insetL - barW) : (InpX + insetL);
   const int yDist = g_fromBottom ? (InpY + panelH - insetTop - barH) : (InpY + insetTop);
   PutRect(name, xDist, yDist, barW, barH, clr, clr);
}

void DrawBox()
{
   ObjectsDeleteAll(0, g_pfx);

   g_fromRight  = IsRightCorner(InpCorner);
   g_fromBottom = IsBottomCorner(InpCorner);

   const datetime now = TimeCurrent();
   const int kind = KindAt(now);
   const bool live = (kind != 0);
   const string sess = SessName(kind);
   const string win = SessWin(kind);
   const color accent = SessColor(kind);
   const color liveCol = live ? InpLive : InpIdle;
   const string clock = Two(HourAt(now)) + ":" + Two(MinuteAt(now));

   double prog = 0.0;
   if(kind == 4)
      prog = MathMax(Progress(now, InpLonStart, InpLonEnd), Progress(now, InpNyStart, InpNyEnd));
   else if(kind == 3)
      prog = Progress(now, InpNyStart, InpNyEnd);
   else if(kind == 2)
      prog = Progress(now, InpLonStart, InpLonEnd);
   else if(kind == 1)
      prog = Progress(now, InpAsiaStart, InpAsiaEnd);

   const int pad = 14;
   const int w = MathMax(160, MathMin(280, InpWidth));
   const int headH = 26;
   const int barH = 6;
   const int bodyTop = headH + 10;
   const int row1 = bodyTop;
   const int row2 = row1 + 22;
   const int barTop = row2 + 20;
   const int row3 = InpShowProgress ? (barTop + barH + 12) : (row2 + 20);
   const int h = row3 + 20;

   const color edge = C'36,48,64';
   PutRect(g_pfx + "BG", InpX, InpY, w, h, InpBg, edge);
   PutRect(g_pfx + "HEAD", InpX, InpY, w, headH, InpHead, InpHead);
   PutRect(g_pfx + "STRIPE", InpX, InpY, 3, h, accent, accent);

   const int fs = MathMax(9, InpFontSize);
   const int fsSm = MathMax(8, InpFontSize - 1);
   const int fsLg = InpFontSize + 2;

   const int xL = DistLeft(w, pad);
   const int xR = g_fromRight ? (InpX + pad) : (InpX + w - pad);

   PutLabel(g_pfx + "H1", xL, DistTop(h, 7), "SESSION", InpMuted, fsSm, false);
   PutLabel(g_pfx + "H2", xR, DistTop(h, 7), live ? "LIVE" : "IDLE", liveCol, fsSm, true);

   PutLabel(g_pfx + "S1", xL, DistTop(h, row1), sess, accent, fsLg, false);
   PutLabel(g_pfx + "S2", xR, DistTop(h, row1), clock, InpText, fsLg, true);

   PutLabel(g_pfx + "W1", xL, DistTop(h, row2), win, InpText, fs, false);

   if(InpShowProgress)
   {
      const int barW = w - pad * 2 - 40;
      const int fillW = live ? (int)MathMax(2, MathRound(barW * prog)) : 0;
      PutBar(g_pfx + "TRK", w, h, pad, barTop, barW, barH, C'30,41,59');
      if(fillW > 0)
         PutBar(g_pfx + "FIL", w, h, pad, barTop, fillW, barH, accent);
      PutLabel(g_pfx + "P2", xR, DistTop(h, barTop - 2),
               live ? IntegerToString((int)MathRound(prog * 100.0)) + "%" : "--",
               InpMuted, fsSm, true);
   }

   PutLabel(g_pfx + "D1", xL, DistTop(h, row3),
            "DAY  " + Two(InpDayBegin) + ":00 > " + Two(InpDayEnd) + ":59",
            InpMuted, fsSm, false);

   ChartRedraw(0);
}

int OnInit()
{
   g_pfx = InpPrefix;
   IndicatorSetString(INDICATOR_SHORTNAME, "Session");
   EventSetTimer(5);
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
