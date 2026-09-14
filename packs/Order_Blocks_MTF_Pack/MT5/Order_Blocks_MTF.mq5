//+------------------------------------------------------------------+
//| Order_Blocks_MTF.mq5                                             |
//| Multi-timeframe Order Blocks — HH→LL rectangles (Pine parity)   |
//+------------------------------------------------------------------+
#property copyright "Forge Charts"
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

input string InpPrefix      = "OBMTF_";
input int    InpBlockLen    = 2;          // Candles in block (HH→LL)
input bool   InpRequireOpp  = true;       // Require opposing candles
input double InpMinOppPct   = 50.0;       // Min opposing %
input int    InpSwingLen    = 5;          // Structure lookback
input bool   InpUseBos      = true;       // Require BOS
input bool   InpUseDisp     = true;       // Require displacement
input int    InpAtrLen      = 14;         // ATR length
input double InpDispMult    = 1.2;        // Displacement × ATR
input bool   InpMitClose    = true;       // Mitigate on close (off=wick)
input bool   InpUseChart    = true;       // Use chart TF
input bool   InpUseTf1      = true;       // Use TF 1
input ENUM_TIMEFRAMES InpTf1 = PERIOD_H1;
input bool   InpUseTf2      = false;      // Use TF 2
input ENUM_TIMEFRAMES InpTf2 = PERIOD_H4;
input bool   InpUseTf3      = false;      // Use TF 3
input ENUM_TIMEFRAMES InpTf3 = PERIOD_D1;
input int    InpMaxObs      = 12;         // Max OBs per side / TF
input int    InpExtendBars  = 100;        // Box extend (chart bars)
input bool   InpKeepBrk     = true;       // Keep mitigated as breakers
input bool   InpShowLbl     = true;       // Show labels
input int    InpScanBars    = 800;        // History scan depth
input color  InpBullFill    = C'34,197,94';
input color  InpBearFill    = C'239,68,68';
input color  InpBrkBull     = C'134,239,172';
input color  InpBrkBear     = C'252,165,165';
input color  InpBullBord    = C'22,163,74';
input color  InpBearBord    = C'220,38,38';
input int    InpFillAlpha   = 72;         // Fill transparency 0-100 (higher=more transparent)

#define MAX_OB 256

struct ObZone
{
   string   name;
   string   tag;
   int      kind;     // 1 bull, -1 bear
   int      state;    // 0 active, 1 breaker
   double   top;
   double   bot;
   datetime left;
   datetime right;
   bool     used;
};

ObZone   g_obs[MAX_OB];
int      g_count = 0;
string   g_pfx;
datetime g_lastChartBar = 0;
datetime g_lastTf1Bar   = 0;
datetime g_lastTf2Bar   = 0;
datetime g_lastTf3Bar   = 0;

string TfTag(const ENUM_TIMEFRAMES tf)
{
   if(tf == PERIOD_CURRENT)
      return "CHART";
   string s = EnumToString(tf);
   // PERIOD_H1 → H1
   if(StringFind(s, "PERIOD_") == 0)
      s = StringSubstr(s, 7);
   return s;
}

color MixAlpha(const color clr, const int alphaPct)
{
   const int a = (int)MathMax(0, MathMin(100, alphaPct));
   const int r = (int)((clr      ) & 0xFF);
   const int g = (int)((clr >> 8 ) & 0xFF);
   const int b = (int)((clr >> 16) & 0xFF);
   const double k = (100.0 - a) / 100.0;
   const int rr = (int)(r * k);
   const int gg = (int)(g * k);
   const int bb = (int)(b * k);
   return (color)(rr | (gg << 8) | (bb << 16));
}

double HighestHigh(const MqlRates &rates[], const int fromShift, const int len)
{
   double hh = rates[fromShift].high;
   for(int i = 1; i < len; i++)
      hh = MathMax(hh, rates[fromShift + i].high);
   return hh;
}

double LowestLow(const MqlRates &rates[], const int fromShift, const int len)
{
   double ll = rates[fromShift].low;
   for(int i = 1; i < len; i++)
      ll = MathMin(ll, rates[fromShift + i].low);
   return ll;
}

bool OppOk(const MqlRates &rates[], const int impShift, const int len, const bool isBull)
{
   if(!InpRequireOpp)
      return true;
   int opp = 0;
   for(int i = 1; i <= len; i++)
   {
      const int s = impShift + i;
      const bool bearish = rates[s].close < rates[s].open;
      const bool bullish = rates[s].close > rates[s].open;
      if(isBull && bearish)
         opp++;
      if(!isBull && bullish)
         opp++;
   }
   return ((opp * 100.0) / len) >= InpMinOppPct;
}

double AtrAt(const string sym, const ENUM_TIMEFRAMES tf, const int shift)
{
   const int h = iATR(sym, tf, InpAtrLen);
   if(h == INVALID_HANDLE)
      return 0.0;
   double buf[];
   ArraySetAsSeries(buf, true);
   double atr = 0.0;
   if(CopyBuffer(h, 0, shift, 1, buf) == 1)
      atr = buf[0];
   IndicatorRelease(h);
   return atr;
}

bool DetectAt(const string sym, const ENUM_TIMEFRAMES tf, const MqlRates &rates[],
              const int impShift, bool &bullSig, bool &bearSig, double &hh, double &ll, datetime &leftT)
{
   bullSig = false;
   bearSig = false;
   hh = 0.0;
   ll = 0.0;
   leftT = 0;

   const int need = impShift + MathMax(InpBlockLen, InpSwingLen) + 2;
   if(ArraySize(rates) <= need || InpBlockLen < 1)
      return false;

   const double atr = AtrAt(sym, tf, impShift);
   const double body = MathAbs(rates[impShift].close - rates[impShift].open);
   const double swingHi = HighestHigh(rates, impShift + 1, InpSwingLen);
   const double swingLo = LowestLow(rates, impShift + 1, InpSwingLen);

   const bool bullBar = rates[impShift].close > rates[impShift].open;
   const bool bearBar = rates[impShift].close < rates[impShift].open;
   const bool bullDisp = InpUseDisp ? (bullBar && body >= atr * InpDispMult) : bullBar;
   const bool bearDisp = InpUseDisp ? (bearBar && body >= atr * InpDispMult) : bearBar;
   const bool bullBos = InpUseBos ? (rates[impShift].close > swingHi) : true;
   const bool bearBos = InpUseBos ? (rates[impShift].close < swingLo) : true;
   const bool needRule = InpUseDisp || InpUseBos;

   bullSig = needRule && bullDisp && bullBos && OppOk(rates, impShift, InpBlockLen, true);
   bearSig = needRule && bearDisp && bearBos && OppOk(rates, impShift, InpBlockLen, false);

   hh = HighestHigh(rates, impShift + 1, InpBlockLen);
   ll = LowestLow(rates, impShift + 1, InpBlockLen);
   leftT = rates[impShift + InpBlockLen].time;
   return (bullSig || bearSig) && hh > ll;
}

void DeleteObObjects(const string name)
{
   ObjectDelete(0, name);
   ObjectDelete(0, name + "_L");
}

void DrawOb(const int idx)
{
   if(!g_obs[idx].used)
      return;

   const string name = g_obs[idx].name;
   color fill = (g_obs[idx].kind > 0)
                ? (g_obs[idx].state == 0 ? MixAlpha(InpBullFill, InpFillAlpha) : MixAlpha(InpBrkBull, InpFillAlpha + 10))
                : (g_obs[idx].state == 0 ? MixAlpha(InpBearFill, InpFillAlpha) : MixAlpha(InpBrkBear, InpFillAlpha + 10));
   color bord = (g_obs[idx].kind > 0) ? InpBullBord : InpBearBord;
   if(g_obs[idx].state != 0)
      bord = MixAlpha(bord, 40);

   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, g_obs[idx].left, g_obs[idx].top, g_obs[idx].right, g_obs[idx].bot);

   ObjectSetInteger(0, name, OBJPROP_TIME, 0, g_obs[idx].left);
   ObjectSetInteger(0, name, OBJPROP_TIME, 1, g_obs[idx].right);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 0, g_obs[idx].top);
   ObjectSetDouble(0, name, OBJPROP_PRICE, 1, g_obs[idx].bot);
   ObjectSetInteger(0, name, OBJPROP_COLOR, fill);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   // border hint via ray off + secondary thin rectangle outline using COLOR on non-fill isn't available;
   // keep fill tinted; store bord for label color.
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 0);

   if(InpShowLbl)
   {
      const string ln = name + "_L";
      const string txt = (g_obs[idx].state == 0
                          ? (g_obs[idx].kind > 0 ? "BULL OB" : "BEAR OB")
                          : (g_obs[idx].kind > 0 ? "BULL BRK" : "BEAR BRK"))
                         + " · " + g_obs[idx].tag + " · " + IntegerToString(InpBlockLen) + "c";
      const double y = (g_obs[idx].kind > 0 ? g_obs[idx].top : g_obs[idx].bot);
      if(ObjectFind(0, ln) < 0)
         ObjectCreate(0, ln, OBJ_TEXT, 0, g_obs[idx].left, y);
      ObjectSetString(0, ln, OBJPROP_TEXT, txt);
      ObjectSetString(0, ln, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, ln, OBJPROP_FONTSIZE, 8);
      ObjectSetInteger(0, ln, OBJPROP_COLOR, bord);
      ObjectSetInteger(0, ln, OBJPROP_ANCHOR, (g_obs[idx].kind > 0 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER));
      ObjectSetInteger(0, ln, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, ln, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, ln, OBJPROP_TIME, 0, g_obs[idx].left);
      ObjectSetDouble(0, ln, OBJPROP_PRICE, 0, y);
   }
}

void TrimSide(const int kind, const string tag)
{
   int n = 0;
   for(int i = g_count - 1; i >= 0; i--)
   {
      if(!g_obs[i].used)
         continue;
      if(g_obs[i].kind == kind && g_obs[i].tag == tag)
      {
         n++;
         if(n > InpMaxObs)
         {
            DeleteObObjects(g_obs[i].name);
            g_obs[i].used = false;
         }
      }
   }
}

bool ExistsDup(const string tag, const int kind, const datetime left)
{
   for(int i = 0; i < g_count; i++)
   {
      if(g_obs[i].used && g_obs[i].tag == tag && g_obs[i].kind == kind && g_obs[i].left == left)
         return true;
   }
   return false;
}

int FreeSlot()
{
   for(int i = 0; i < g_count; i++)
   {
      if(!g_obs[i].used)
         return i;
   }
   if(g_count < MAX_OB)
   {
      g_count++;
      return g_count - 1;
   }
   DeleteObObjects(g_obs[0].name);
   g_obs[0].used = false;
   return 0;
}

datetime RightTimeFromLeft(const datetime left)
{
   const int shift = iBarShift(_Symbol, PERIOD_CURRENT, left, false);
   if(shift < 0)
      return left + (datetime)PeriodSeconds(PERIOD_CURRENT) * InpExtendBars;
   const int rightShift = MathMax(0, shift - InpExtendBars);
   datetime t = iTime(_Symbol, PERIOD_CURRENT, rightShift);
   if(t <= left)
      t = left + (datetime)PeriodSeconds(PERIOD_CURRENT) * InpExtendBars;
   return t;
}

void AddOb(const int kind, const double top, const double bot, const datetime left, const string tag)
{
   if(top <= bot || left <= 0)
      return;
   if(ExistsDup(tag, kind, left))
      return;

   const int idx = FreeSlot();
   g_obs[idx].used  = true;
   g_obs[idx].kind  = kind;
   g_obs[idx].state = 0;
   g_obs[idx].top   = top;
   g_obs[idx].bot   = bot;
   g_obs[idx].left  = left;
   g_obs[idx].right = RightTimeFromLeft(left);
   g_obs[idx].tag   = tag;
   g_obs[idx].name  = g_pfx + tag + "_" + (kind > 0 ? "B" : "S") + "_" + IntegerToString((int)left);
   DrawOb(idx);
   TrimSide(kind, tag);
}

void MitigateAndExtend()
{
   const double c = iClose(_Symbol, PERIOD_CURRENT, 0);
   const double h = iHigh(_Symbol, PERIOD_CURRENT, 0);
   const double l = iLow(_Symbol, PERIOD_CURRENT, 0);
   const datetime nowR = iTime(_Symbol, PERIOD_CURRENT, 0) + (datetime)PeriodSeconds(PERIOD_CURRENT);

   for(int i = 0; i < g_count; i++)
   {
      if(!g_obs[i].used)
         continue;

      if(g_obs[i].state == 0)
      {
         bool hit = false;
         if(g_obs[i].kind > 0)
            hit = InpMitClose ? (c < g_obs[i].bot) : (l < g_obs[i].bot);
         else
            hit = InpMitClose ? (c > g_obs[i].top) : (h > g_obs[i].top);

         if(hit)
         {
            if(InpKeepBrk)
            {
               g_obs[i].state = 1;
               DrawOb(i);
            }
            else
            {
               DeleteObObjects(g_obs[i].name);
               g_obs[i].used = false;
            }
         }
         else
         {
            g_obs[i].right = nowR;
            DrawOb(i);
         }
      }
   }
}

void ScanTf(const ENUM_TIMEFRAMES tf, const string tag, const bool fullScan, datetime &lastBar)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   const int want = MathMax(InpScanBars, InpBlockLen + InpSwingLen + 50);
   const int copied = CopyRates(_Symbol, tf, 0, want, rates);
   if(copied < InpBlockLen + InpSwingLen + 5)
      return;

   const datetime closed = rates[1].time;
   int fromShift = 1;
   int toShift = copied - (InpBlockLen + InpSwingLen + 3);

   if(!fullScan)
   {
      if(lastBar != 0 && closed == lastBar)
         return;
      toShift = 1;
   }

   for(int s = fromShift; s <= toShift; s++)
   {
      bool bull = false, bear = false;
      double hh = 0.0, ll = 0.0;
      datetime leftT = 0;
      if(!DetectAt(_Symbol, tf, rates, s, bull, bear, hh, ll, leftT))
         continue;
      if(bull)
         AddOb(1, hh, ll, leftT, tag);
      if(bear)
         AddOb(-1, hh, ll, leftT, tag);
   }
   lastBar = closed;
}

void ClearAll()
{
   ObjectsDeleteAll(0, g_pfx);
   g_count = 0;
   for(int i = 0; i < MAX_OB; i++)
   {
      g_obs[i].used = false;
      g_obs[i].name = "";
      g_obs[i].tag = "";
      g_obs[i].kind = 0;
      g_obs[i].state = 0;
      g_obs[i].top = 0;
      g_obs[i].bot = 0;
      g_obs[i].left = 0;
      g_obs[i].right = 0;
   }
   g_lastChartBar = 0;
   g_lastTf1Bar = 0;
   g_lastTf2Bar = 0;
   g_lastTf3Bar = 0;
}

void Rebuild(const bool fullScan)
{
   if(fullScan)
      ClearAll();

   if(InpUseChart)
      ScanTf(PERIOD_CURRENT, "CHART", fullScan, g_lastChartBar);
   if(InpUseTf1)
      ScanTf(InpTf1, TfTag(InpTf1), fullScan, g_lastTf1Bar);
   if(InpUseTf2)
      ScanTf(InpTf2, TfTag(InpTf2), fullScan, g_lastTf2Bar);
   if(InpUseTf3)
      ScanTf(InpTf3, TfTag(InpTf3), fullScan, g_lastTf3Bar);

   MitigateAndExtend();
   ChartRedraw(0);
}

int OnInit()
{
   g_pfx = InpPrefix;
   if(InpBlockLen < 1)
   {
      Print("Order_Blocks_MTF: BlockLen must be >= 1");
      return INIT_PARAMETERS_INCORRECT;
   }
   IndicatorSetString(INDICATOR_SHORTNAME, "OB MTF");
   ClearAll();
   Rebuild(true);
   EventSetTimer(2);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, g_pfx);
}

void OnTimer()
{
   Rebuild(false);
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
   if(prev_calculated == 0)
      Rebuild(true);
   else if(t0 != last)
   {
      last = t0;
      Rebuild(false);
   }
   else
      MitigateAndExtend();
   return rates_total;
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_CHART_CHANGE)
      MitigateAndExtend();
}
//+------------------------------------------------------------------+
