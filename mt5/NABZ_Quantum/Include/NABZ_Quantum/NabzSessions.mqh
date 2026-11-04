//+------------------------------------------------------------------+
//| NabzSessions.mqh — Asia / London / NY session boxes              |
//+------------------------------------------------------------------+
#ifndef NABZ_SESSIONS_MQH
#define NABZ_SESSIONS_MQH

#include <NABZ_Quantum/NabzTheme.mqh>

struct NabzSessionHours
{
   int asiaStart;   // broker hour
   int asiaEnd;
   int lonStart;
   int lonEnd;
   int nyStart;
   int nyEnd;
   int lookbackDays;
   bool enabled;
};

void NabzSessionDefaults(NabzSessionHours &h)
{
   // Approximate broker-GMT+2/3 style defaults (editable in inputs)
   h.asiaStart = 0;
   h.asiaEnd   = 9;
   h.lonStart  = 8;
   h.lonEnd    = 17;
   h.nyStart   = 13;
   h.nyEnd     = 22;
   h.lookbackDays = 3;
   h.enabled = true;
}

string NabzSessionName(const datetime t, const NabzSessionHours &h)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   int hr = dt.hour;
   bool asia = (h.asiaStart < h.asiaEnd)
      ? (hr >= h.asiaStart && hr < h.asiaEnd)
      : (hr >= h.asiaStart || hr < h.asiaEnd);
   bool lon  = (hr >= h.lonStart && hr < h.lonEnd);
   bool ny   = (hr >= h.nyStart && hr < h.nyEnd);
   if(lon && ny) return "LON/NY";
   if(asia && lon) return "ASIA/EU";
   if(asia) return "ASIA";
   if(lon)  return "LON";
   if(ny)   return "NY";
   return "OFF";
}

void NabzSessionsClear()
{
   ObjectsDeleteAll(0, NABZ_PREFIX + "SESS_");
}

void NabzDrawOneSession(const string tag, const datetime t0, const datetime t1,
                        const double hi, const double lo, const color col)
{
   string box = NABZ_PREFIX + "SESS_" + tag + "_BOX";
   string lab = NABZ_PREFIX + "SESS_" + tag + "_LAB";
   if(ObjectFind(0, box) < 0)
      ObjectCreate(0, box, OBJ_RECTANGLE, 0, t0, hi, t1, lo);
   ObjectSetInteger(0, box, OBJPROP_TIME, 0, t0);
   ObjectSetInteger(0, box, OBJPROP_TIME, 1, t1);
   ObjectSetDouble(0, box, OBJPROP_PRICE, 0, hi);
   ObjectSetDouble(0, box, OBJPROP_PRICE, 1, lo);
   ObjectSetInteger(0, box, OBJPROP_COLOR, col);
   ObjectSetInteger(0, box, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, box, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, box, OBJPROP_FILL, true);
   ObjectSetInteger(0, box, OBJPROP_BACK, true);
   ObjectSetInteger(0, box, OBJPROP_SELECTABLE, false);
   // translucent-ish via dim color already chosen

   if(ObjectFind(0, lab) < 0)
      ObjectCreate(0, lab, OBJ_TEXT, 0, t0, hi);
   ObjectSetInteger(0, lab, OBJPROP_TIME, t0);
   ObjectSetDouble(0, lab, OBJPROP_PRICE, hi);
   ObjectSetString(0, lab, OBJPROP_TEXT, tag);
   ObjectSetInteger(0, lab, OBJPROP_COLOR, COL_TEXT);
   ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, lab, OBJPROP_FONT, "Segoe UI Semibold");
   ObjectSetInteger(0, lab, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, lab, OBJPROP_SELECTABLE, false);
}

void NabzSessionsRedraw(const NabzSessionHours &h)
{
   NabzSessionsClear();
   if(!h.enabled) return;

   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime day0 = StructToTime(dt);

   for(int d = 0; d < h.lookbackDays; ++d)
   {
      datetime base = day0 - d * 86400;
      // Asia
      datetime a0 = base + h.asiaStart * 3600;
      datetime a1 = base + h.asiaEnd * 3600;
      if(h.asiaEnd <= h.asiaStart) a1 += 86400;
      // London
      datetime l0 = base + h.lonStart * 3600;
      datetime l1 = base + h.lonEnd * 3600;
      // NY
      datetime n0 = base + h.nyStart * 3600;
      datetime n1 = base + h.nyEnd * 3600;

      int iA0 = iBarShift(_Symbol, PERIOD_CURRENT, a0, false);
      int iA1 = iBarShift(_Symbol, PERIOD_CURRENT, a1, false);
      int iL0 = iBarShift(_Symbol, PERIOD_CURRENT, l0, false);
      int iL1 = iBarShift(_Symbol, PERIOD_CURRENT, l1, false);
      int iN0 = iBarShift(_Symbol, PERIOD_CURRENT, n0, false);
      int iN1 = iBarShift(_Symbol, PERIOD_CURRENT, n1, false);

      if(iA0 >= 0 && iA1 >= 0)
      {
         int from = MathMax(iA0, iA1), to = MathMin(iA0, iA1);
         int hiIdx = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, from - to + 1, to);
         int loIdx = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, from - to + 1, to);
         if(hiIdx >= 0 && loIdx >= 0)
            NabzDrawOneSession(StringFormat("ASIA%d", d), a0, a1,
               iHigh(_Symbol, PERIOD_CURRENT, hiIdx),
               iLow(_Symbol, PERIOD_CURRENT, loIdx),
               NabzMix(COL_SESSION_ASIA, COL_BG0, 70));
      }
      if(iL0 >= 0 && iL1 >= 0)
      {
         int from = MathMax(iL0, iL1), to = MathMin(iL0, iL1);
         int hiIdx = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, from - to + 1, to);
         int loIdx = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, from - to + 1, to);
         if(hiIdx >= 0 && loIdx >= 0)
            NabzDrawOneSession(StringFormat("LON%d", d), l0, l1,
               iHigh(_Symbol, PERIOD_CURRENT, hiIdx),
               iLow(_Symbol, PERIOD_CURRENT, loIdx),
               NabzMix(COL_SESSION_LON, COL_BG0, 70));
      }
      if(iN0 >= 0 && iN1 >= 0)
      {
         int from = MathMax(iN0, iN1), to = MathMin(iN0, iN1);
         int hiIdx = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, from - to + 1, to);
         int loIdx = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, from - to + 1, to);
         if(hiIdx >= 0 && loIdx >= 0)
            NabzDrawOneSession(StringFormat("NY%d", d), n0, n1,
               iHigh(_Symbol, PERIOD_CURRENT, hiIdx),
               iLow(_Symbol, PERIOD_CURRENT, loIdx),
               NabzMix(COL_SESSION_NY, COL_BG0, 70));
      }
   }
}

#endif
//+------------------------------------------------------------------+
