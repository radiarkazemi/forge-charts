//+------------------------------------------------------------------+
//| TRH_Trading_Room_Hunter.mq5                                      |
//| Classic SWEEP model — same logic as TradingView Pine             |
//| Phase 1: DETECT + DRAW only (validate vs TV before autotrade)    |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "1.20"
#property description "Classic TRH SWEEP — same ENTRY/SL/TP model as TradingView Pine"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

#include "TRH_Engine.mqh"

input group "TRH Detection"
input int    InpPivotPeriod     = 5;      // Pivot Period
input double InpMinContextAtr   = 1.2;    // Min Selloff/Rally Into Sweep (ATR×)
input double InpMinSweepAtr     = 0.05;   // Min Sweep Beyond Pivot (ATR×)
input int    InpBaseConfirmBars = 8;      // Min Base Bars After Sweep
input int    InpMaxBaseBars     = 40;     // Max Bars To Confirm Room
input double InpMinRoomAtr      = 0.8;    // Min Room Width (ATR×)
input double InpMaxRoomAtr      = 3.5;    // Max Room Width (ATR×)
input int    InpCooldownBars    = 50;     // Cooldown Between Setups

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;   // SL Pad (ATR×)
input double InpRiskReward      = 2.4;    // Risk-Reward Ratio
input bool   InpUseLiquidityTP  = true;   // Prefer Opposing Pivot As TP

input group "Display"
input int    InpSetupWidth      = 80;     // Box Width (bars)
input bool   InpOnlyLast        = true;   // Only Last Setup
input bool   InpAlertPopup      = true;   // Alert popup on new setup

string   OBJ_PREFIX = "TRH_";
TrhSetup g_setups[];
int      g_nSetups = 0;
datetime g_lastAlertTime = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   IndicatorSetString(INDICATOR_SHORTNAME, "TRH Sweep");
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

void DrawSetup(const TrhSetup &s, const datetime &time[])
{
   if(InpOnlyLast) ClearDrawings();

   int bi = s.barIndex;
   if(bi < 0 || bi >= ArraySize(time)) return;

   datetime t1 = time[bi];
   int rightIdx = MathMin(ArraySize(time) - 1, bi + InpSetupWidth);
   datetime t2 = time[rightIdx];

   string tag = IntegerToString((int)s.barTime);
   color zoneCol = (s.dir == 1) ? clrTeal : clrFireBrick;
   color tpCol = clrTeal;
   color slCol = clrFireBrick;

   string zName = OBJ_PREFIX + "Z_" + tag;
   ObjectCreate(0, zName, OBJ_RECTANGLE, 0, t1, s.proximal, t2, s.distal);
   ObjectSetInteger(0, zName, OBJPROP_COLOR, zoneCol);
   ObjectSetInteger(0, zName, OBJPROP_FILL, true);
   ObjectSetInteger(0, zName, OBJPROP_BACK, true);
   ObjectSetInteger(0, zName, OBJPROP_WIDTH, 1);

   if(s.dir == 1)
   {
      string tpN = OBJ_PREFIX + "TP_" + tag;
      ObjectCreate(0, tpN, OBJ_RECTANGLE, 0, t1, s.tp, t2, s.entry);
      ObjectSetInteger(0, tpN, OBJPROP_COLOR, tpCol);
      ObjectSetInteger(0, tpN, OBJPROP_FILL, true);
      ObjectSetInteger(0, tpN, OBJPROP_BACK, true);

      string slN = OBJ_PREFIX + "SL_" + tag;
      ObjectCreate(0, slN, OBJ_RECTANGLE, 0, t1, s.entry, t2, s.sl);
      ObjectSetInteger(0, slN, OBJPROP_COLOR, slCol);
      ObjectSetInteger(0, slN, OBJPROP_FILL, true);
      ObjectSetInteger(0, slN, OBJPROP_BACK, true);
   }
   else
   {
      string tpN = OBJ_PREFIX + "TP_" + tag;
      ObjectCreate(0, tpN, OBJ_RECTANGLE, 0, t1, s.entry, t2, s.tp);
      ObjectSetInteger(0, tpN, OBJPROP_COLOR, tpCol);
      ObjectSetInteger(0, tpN, OBJPROP_FILL, true);
      ObjectSetInteger(0, tpN, OBJPROP_BACK, true);

      string slN = OBJ_PREFIX + "SL_" + tag;
      ObjectCreate(0, slN, OBJ_RECTANGLE, 0, t1, s.sl, t2, s.entry);
      ObjectSetInteger(0, slN, OBJPROP_COLOR, slCol);
      ObjectSetInteger(0, slN, OBJPROP_FILL, true);
      ObjectSetInteger(0, slN, OBJPROP_BACK, true);
   }

   // Horizontal levels (same labels as Pine: ENTRY / SL / TP)
   string eN = OBJ_PREFIX + "E_" + tag;
   ObjectCreate(0, eN, OBJ_HLINE, 0, 0, s.entry);
   ObjectSetInteger(0, eN, OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, eN, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, eN, OBJPROP_WIDTH, 2);

   string slH = OBJ_PREFIX + "SLH_" + tag;
   ObjectCreate(0, slH, OBJ_HLINE, 0, 0, s.sl);
   ObjectSetInteger(0, slH, OBJPROP_COLOR, clrFireBrick);
   ObjectSetInteger(0, slH, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, slH, OBJPROP_WIDTH, 1);

   string tpH = OBJ_PREFIX + "TPH_" + tag;
   ObjectCreate(0, tpH, OBJ_HLINE, 0, 0, s.tp);
   ObjectSetInteger(0, tpH, OBJPROP_COLOR, clrTeal);
   ObjectSetInteger(0, tpH, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, tpH, OBJPROP_WIDTH, 1);

   string le = OBJ_PREFIX + "LE_" + tag;
   ObjectCreate(0, le, OBJ_TEXT, 0, t2, s.entry);
   ObjectSetString(0, le, OBJPROP_TEXT, "ENTRY " + DoubleToString(s.entry, _Digits));
   ObjectSetInteger(0, le, OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, le, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, le, OBJPROP_ANCHOR, ANCHOR_LEFT);

   string ls = OBJ_PREFIX + "LS_" + tag;
   ObjectCreate(0, ls, OBJ_TEXT, 0, t2, s.sl);
   ObjectSetString(0, ls, OBJPROP_TEXT, "SL " + DoubleToString(s.sl, _Digits));
   ObjectSetInteger(0, ls, OBJPROP_COLOR, clrFireBrick);
   ObjectSetInteger(0, ls, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, ls, OBJPROP_ANCHOR, ANCHOR_LEFT);

   string lt = OBJ_PREFIX + "LT_" + tag;
   ObjectCreate(0, lt, OBJ_TEXT, 0, t2, s.tp);
   ObjectSetString(0, lt, OBJPROP_TEXT, "TP " + DoubleToString(s.tp, _Digits));
   ObjectSetInteger(0, lt, OBJPROP_COLOR, clrTeal);
   ObjectSetInteger(0, lt, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, lt, OBJPROP_ANCHOR, ANCHOR_LEFT);

   string lab = OBJ_PREFIX + "L_" + tag;
   ObjectCreate(0, lab, OBJ_TEXT, 0, t1, (s.dir == 1 ? MathMax(s.proximal, s.distal) : MathMin(s.proximal, s.distal)));
   ObjectSetString(0, lab, OBJPROP_TEXT,
      "TRH " + (s.dir == 1 ? "LONG" : "SHORT") + " · SWEEP");
   ObjectSetInteger(0, lab, OBJPROP_COLOR, (s.dir == 1 ? clrAqua : clrOrangeRed));
   ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 10);

   Comment(
      "TRH | Trading Room Hunter\n",
      (s.dir == 1 ? "LONG" : "SHORT"), " · SWEEP (same as Pine)\n",
      "ENTRY ", DoubleToString(s.entry, _Digits), "\n",
      "SL    ", DoubleToString(s.sl, _Digits), "\n",
      "TP    ", DoubleToString(s.tp, _Digits), "\n",
      "Risk  ", DoubleToString(MathAbs(s.entry - s.sl), _Digits),
      "  (", DoubleToString(InpRiskReward, 1), "R)\n",
      "Bar   ", TimeToString(s.barTime, TIME_DATE|TIME_MINUTES)
   );
}

void BuildConfig(TrhConfig &cfg)
{
   cfg.pivotPeriod     = InpPivotPeriod;
   cfg.minContextAtr   = InpMinContextAtr;
   cfg.minSweepAtr     = InpMinSweepAtr;
   cfg.baseConfirmBars = InpBaseConfirmBars;
   cfg.maxBaseBars     = InpMaxBaseBars;
   cfg.minRoomAtr      = InpMinRoomAtr;
   cfg.maxRoomAtr      = InpMaxRoomAtr;
   cfg.cooldownBars    = InpCooldownBars;
   cfg.slPadAtr        = InpSlPadAtr;
   cfg.riskReward      = InpRiskReward;
   cfg.useLiquidityTP  = InpUseLiquidityTP;
}

//+------------------------------------------------------------------+
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

   static datetime lastBar = 0;
   datetime curBar = time[rates_total - 1];
   // When as-series, newest is index 0
   bool asSeries = (rates_total > 1 && time[0] > time[rates_total - 1]);
   if(asSeries) curBar = time[0];

   if(prev_calculated == 0 || curBar != lastBar)
   {
      lastBar = curBar;

      datetime t[];
      double o[], h[], l[], c[];
      TrhNormalizeBars(rates_total, time, open, high, low, close, t, o, h, l, c);

      TrhConfig cfg;
      BuildConfig(cfg);

      datetime prevTime = (g_nSetups > 0) ? g_setups[g_nSetups - 1].barTime : 0;
      g_nSetups = TrhScanSetups(rates_total, t, o, h, l, c, cfg, g_setups);

      if(g_nSetups > 0)
      {
         TrhSetup last = g_setups[g_nSetups - 1];
         DrawSetup(last, t);
         PrintFormat("TRH %s | ENTRY %.2f SL %.2f TP %.2f @ %s (n=%d)",
            last.dir == 1 ? "LONG" : "SHORT",
            last.entry, last.sl, last.tp,
            TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
            g_nSetups);

         if(InpAlertPopup && last.barTime != prevTime && last.barTime != g_lastAlertTime)
         {
            g_lastAlertTime = last.barTime;
            Alert(StringFormat("TRH %s SETUP\nENTRY %s\nSL %s\nTP %s",
               last.dir == 1 ? "LONG" : "SHORT",
               DoubleToString(last.entry, _Digits),
               DoubleToString(last.sl, _Digits),
               DoubleToString(last.tp, _Digits)));
         }
      }
      else
      {
         ClearDrawings();
         Comment("TRH scanning… (no setup yet)");
      }
   }

   return rates_total;
}
//+------------------------------------------------------------------+
