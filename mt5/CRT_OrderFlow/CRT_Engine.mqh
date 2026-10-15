//+------------------------------------------------------------------+
//| CRT_Engine.mqh                                                   |
//| CRT OrderFlow — STRATEGY source model (3 rules)                  |
//| 1) ≥2 CRT same dir  2) HTF FVG AOI  3) CRT inside FVG            |
//| RunRox on source charts = finder tools only (not this strategy)  |
//| ICT Liquidity Expansion is parked.                               |
//+------------------------------------------------------------------+
#ifndef CRT_ENGINE_MQH
#define CRT_ENGINE_MQH

#define CRT_ENGINE_VERSION 100
#define CRT_ATR_LEN 14
#define CRT_MAX_MODELS 64
#define CRT_MAX_FVG 32

#define CRT_DIR_LONG  1
#define CRT_DIR_SHORT -1

struct CrtModel
{
   int      dir;         // 1 long, -1 short
   int      rcBar;       // reference candle index (oldest->newest)
   int      sweepBar;
   int      confirmBar;
   double   rcHigh;
   double   rcLow;
   double   sweepExt;    // wick extreme of the raid
   double   entryHint;   // mid of RC or reclaim level
   datetime confirmTime;
};

struct CrtFvg
{
   int      dir;
   double   top;
   double   bot;
   datetime time;
   int      barIndex;    // on HTF series if HTF, else LTF
   bool     mitigated;
};

struct CrtSetup
{
   int      dir;
   double   entry;
   double   sl;
   double   tp;
   double   fvgTop;
   double   fvgBot;
   double   rcHigh;
   double   rcLow;
   datetime barTime;
   int      barIndex;
   int      biasCount;   // how many CRT models aligned
};

struct CrtConfig
{
   int    rcLookback;       // how far back to search RC for CRT
   double minSweepPts;      // min pierce beyond RC (price) — 0 = ATR based
   double minSweepAtr;
   bool   requireCloseBack; // confirm must close back through RC extreme
   int    minBiasModels;    // rule 1: at least N CRT same direction
   int    biasLookbackBars; // window to count CRT models for bias
   ENUM_TIMEFRAMES htf;     // rule 2: FVG timeframe
   double minHtfFvgAtr;
   bool   requireHtfFvg;    // rule 2 enforce
   bool   entryInsideFvg;   // rule 3: CRT confirm inside HTF FVG
   double slPadAtr;
   double riskReward;
   bool   useStructureTp;   // TP beyond last swing in direction
   int    cooldownBars;
};

void CrtDefaultConfig(CrtConfig &cfg)
{
   cfg.rcLookback       = 8;
   cfg.minSweepPts      = 0;
   cfg.minSweepAtr      = 0.02;
   cfg.requireCloseBack = true;
   cfg.minBiasModels    = 2;
   cfg.biasLookbackBars = 80;
   cfg.htf              = PERIOD_M15;
   cfg.minHtfFvgAtr     = 0.08;
   cfg.requireHtfFvg    = true;
   cfg.entryInsideFvg   = true;
   cfg.slPadAtr         = 0.06;
   cfg.riskReward       = 2.5;
   cfg.useStructureTp   = true;
   cfg.cooldownBars     = 15;
}

double CrtATR(const int i, const double &h[], const double &l[], const double &c[])
{
   if(i < 1) return h[i] - l[i];
   int start = MathMax(1, i - CRT_ATR_LEN + 1);
   double sum = 0;
   for(int j = start; j <= i; j++)
   {
      double tr = MathMax(h[j] - l[j],
                   MathMax(MathAbs(h[j] - c[j - 1]), MathAbs(l[j] - c[j - 1])));
      sum += tr;
   }
   return sum / (i - start + 1);
}

bool CrtIsPivotHigh(const int i, const int p, const double &h[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
      if(h[i] < h[i - k] || h[i] <= h[i + k]) return false;
   return true;
}

bool CrtIsPivotLow(const int i, const int p, const double &l[], const int rates)
{
   if(i < p || i + p >= rates) return false;
   for(int k = 1; k <= p; k++)
      if(l[i] > l[i - k] || l[i] >= l[i + k]) return false;
   return true;
}

bool CrtNextSwingHigh(const double &h[], const int rates, const int from,
                      const int pivot, double &outPx)
{
   outPx = 0;
   for(int i = from + pivot; i < rates - pivot; i++)
   {
      if(CrtIsPivotHigh(i, pivot, h, rates) && h[i] > outPx)
      {
         // nearest ahead swing: first pivot high after from
         outPx = h[i];
         return true;
      }
   }
   // fallback: max high ahead
   double mx = 0;
   bool ok = false;
   for(int i = from + 1; i < rates; i++)
   {
      if(!ok || h[i] > mx) { mx = h[i]; ok = true; }
   }
   if(ok) { outPx = mx; return true; }
   return false;
}

bool CrtNextSwingLow(const double &l[], const int rates, const int from,
                     const int pivot, double &outPx)
{
   outPx = 0;
   for(int i = from + pivot; i < rates - pivot; i++)
   {
      if(CrtIsPivotLow(i, pivot, l, rates))
      {
         outPx = l[i];
         return true;
      }
   }
   double mn = 0;
   bool ok = false;
   for(int i = from + 1; i < rates; i++)
   {
      if(!ok || l[i] < mn) { mn = l[i]; ok = true; }
   }
   if(ok) { outPx = mn; return true; }
   return false;
}

// Detect CRT completion ending at confirm bar i (closed).
// RC = recent candle whose extreme was swept, then price closed back.
bool CrtDetectAt(const int i,
                 const double &open[],
                 const double &high[],
                 const double &low[],
                 const double &close[],
                 const datetime &time[],
                 const CrtConfig &cfg,
                 CrtModel &out)
{
   if(i < 3) return false;
   double a = CrtATR(i, high, low, close);
   double minPierce = (cfg.minSweepPts > 0) ? cfg.minSweepPts : (a * cfg.minSweepAtr);

   // Prefer RC = i-2, sweep = i-1, confirm = i (classic 3-candle CRT)
   // Also allow RC further back within rcLookback if swept by i-1 and confirmed at i.
   int from = MathMax(0, i - cfg.rcLookback);
   for(int rc = i - 2; rc >= from; rc--)
   {
      int sw = i - 1; // last bar before confirm does the raid (or any between rc+1..i-1)
      // find best sweep bar between rc+1 and i-1
      int bestSw = -1;
      int swDir = 0; // 1 = swept low (bullish CRT), -1 = swept high (bearish CRT)
      double bestExt = 0;

      for(int s = rc + 1; s <= i - 1; s++)
      {
         if(low[s] < low[rc] - minPierce)
         {
            if(bestSw < 0 || low[s] < bestExt)
            {
               bestSw = s; swDir = 1; bestExt = low[s];
            }
         }
         if(high[s] > high[rc] + minPierce)
         {
            if(bestSw < 0 || (swDir == -1 && high[s] > bestExt) || swDir == 1)
            {
               // prefer the directional sweep that matches confirm; store both candidates
            }
         }
      }

      // Evaluate bullish CRT: swept RC low, confirm closes back above RC low
      double bullExt = low[rc];
      int bullSw = -1;
      for(int s = rc + 1; s <= i - 1; s++)
      {
         if(low[s] < low[rc] - minPierce)
         {
            if(bullSw < 0 || low[s] < bullExt)
            {
               bullSw = s;
               bullExt = low[s];
            }
         }
      }
      bool bullOk = (bullSw >= 0);
      if(bullOk && cfg.requireCloseBack)
         bullOk = (close[i] > low[rc] && close[i] > open[i]);
      else if(bullOk)
         bullOk = (close[i] > low[rc]);

      // Bearish CRT
      double bearExt = high[rc];
      int bearSw = -1;
      for(int s = rc + 1; s <= i - 1; s++)
      {
         if(high[s] > high[rc] + minPierce)
         {
            if(bearSw < 0 || high[s] > bearExt)
            {
               bearSw = s;
               bearExt = high[s];
            }
         }
      }
      bool bearOk = (bearSw >= 0);
      if(bearOk && cfg.requireCloseBack)
         bearOk = (close[i] < high[rc] && close[i] < open[i]);
      else if(bearOk)
         bearOk = (close[i] < high[rc]);

      // Prefer the CRT whose confirm displacement matches
      if(bullOk && (!bearOk || close[i] > open[i]))
      {
         out.dir = CRT_DIR_LONG;
         out.rcBar = rc;
         out.sweepBar = bullSw;
         out.confirmBar = i;
         out.rcHigh = high[rc];
         out.rcLow = low[rc];
         out.sweepExt = bullExt;
         out.entryHint = (high[rc] + low[rc]) * 0.5;
         out.confirmTime = time[i];
         return true;
      }
      if(bearOk)
      {
         out.dir = CRT_DIR_SHORT;
         out.rcBar = rc;
         out.sweepBar = bearSw;
         out.confirmBar = i;
         out.rcHigh = high[rc];
         out.rcLow = low[rc];
         out.sweepExt = bearExt;
         out.entryHint = (high[rc] + low[rc]) * 0.5;
         out.confirmTime = time[i];
         return true;
      }
   }
   return false;
}

int CrtCollectModels(const int rates,
                     const datetime &time[],
                     const double &open[],
                     const double &high[],
                     const double &low[],
                     const double &close[],
                     const CrtConfig &cfg,
                     CrtModel &models[])
{
   ArrayResize(models, 0);
   int lastClosed = rates - 2;
   if(lastClosed < 20) return 0;
   int n = 0;
   int lastConfirm = -9999;
   for(int i = 5; i <= lastClosed; i++)
   {
      CrtModel m;
      if(!CrtDetectAt(i, open, high, low, close, time, cfg, m)) continue;
      if(m.confirmBar - lastConfirm < 2) continue; // de-noise
      ArrayResize(models, n + 1);
      models[n++] = m;
      lastConfirm = m.confirmBar;
      if(n >= CRT_MAX_MODELS) break;
   }
   return n;
}

int CrtCountBias(const CrtModel &models[], const int nModels,
                 const int upToBar, const int lookback, const int dir)
{
   int count = 0;
   for(int i = nModels - 1; i >= 0; i--)
   {
      if(models[i].confirmBar > upToBar) continue;
      if(upToBar - models[i].confirmBar > lookback) break;
      if(models[i].dir == dir) count++;
   }
   return count;
}

int CrtScanHtfFvgs(const int rates,
                   const datetime &time[],
                   const double &high[],
                   const double &low[],
                   const double &close[],
                   const CrtConfig &cfg,
                   CrtFvg &fvgs[])
{
   ArrayResize(fvgs, 0);
   int lastClosed = rates - 2;
   if(lastClosed < 5) return 0;
   int n = 0;
   for(int i = 2; i <= lastClosed; i++)
   {
      double a = CrtATR(i, high, low, close);
      // bullish FVG: gap between high[i-2] and low[i]
      double bot = high[i - 2];
      double top = low[i];
      if(top - bot >= a * cfg.minHtfFvgAtr)
      {
         CrtFvg f;
         f.dir = CRT_DIR_LONG;
         f.top = top; f.bot = bot;
         f.time = time[i];
         f.barIndex = i;
         f.mitigated = false;
         // mitigate if later close through
         for(int k = i + 1; k <= lastClosed; k++)
         {
            if(low[k] < f.bot) { f.mitigated = true; break; }
         }
         ArrayResize(fvgs, n + 1);
         fvgs[n++] = f;
         if(n >= CRT_MAX_FVG) break;
      }
      // bearish FVG
      double bTop = low[i - 2];
      double bBot = high[i];
      if(bTop - bBot >= a * cfg.minHtfFvgAtr)
      {
         CrtFvg f;
         f.dir = CRT_DIR_SHORT;
         f.top = bTop; f.bot = bBot;
         f.time = time[i];
         f.barIndex = i;
         f.mitigated = false;
         for(int k = i + 1; k <= lastClosed; k++)
         {
            if(high[k] > f.top) { f.mitigated = true; break; }
         }
         ArrayResize(fvgs, n + 1);
         fvgs[n++] = f;
         if(n >= CRT_MAX_FVG) break;
      }
   }
   return n;
}

bool CrtPointInFvg(const CrtFvg &f, const double px)
{
   return (px <= f.top && px >= f.bot);
}

bool CrtModelTouchesFvg(const CrtModel &m, const CrtFvg &f)
{
   if(m.dir != f.dir) return false;
   // RC range or confirm close overlaps FVG
   double lo = MathMin(m.rcLow, m.sweepExt);
   double hi = MathMax(m.rcHigh, m.sweepExt);
   if(m.dir == CRT_DIR_LONG)
      return !(hi < f.bot || lo > f.top);
   return !(hi < f.bot || lo > f.top);
}

// Main scan: CRT models + bias + HTF FVG confluence -> setups
int CrtScanSetups(const int rates,
                  const datetime &time[],
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[],
                  const CrtConfig &cfg,
                  const CrtFvg &htfFvgs[],
                  const int nHtfFvgs,
                  CrtSetup &outSetups[])
{
   ArrayResize(outSetups, 0);
   CrtModel models[];
   int nModels = CrtCollectModels(rates, time, open, high, low, close, cfg, models);
   if(nModels <= 0) return 0;

   int lastClosed = rates - 2;
   int nOut = 0;
   int lastSetupBar = -9999;

   for(int i = 0; i < nModels; i++)
   {
      CrtModel m = models[i];
      if(m.confirmBar - lastSetupBar < cfg.cooldownBars) continue;

      int bias = CrtCountBias(models, nModels, m.confirmBar, cfg.biasLookbackBars, m.dir);
      if(bias < cfg.minBiasModels) continue;

      // Rule 2+3: need unmitigated HTF FVG same direction that this CRT sits in
      CrtFvg aoi;
      bool haveAoi = false;
      if(cfg.requireHtfFvg)
      {
         for(int f = nHtfFvgs - 1; f >= 0; f--)
         {
            if(htfFvgs[f].mitigated) continue;
            if(htfFvgs[f].dir != m.dir) continue;
            // FVG should exist at/before confirm
            if(cfg.entryInsideFvg)
            {
               bool inside = CrtPointInFvg(htfFvgs[f], close[m.confirmBar]) ||
                             CrtPointInFvg(htfFvgs[f], m.entryHint) ||
                             CrtModelTouchesFvg(m, htfFvgs[f]);
               if(!inside) continue;
            }
            aoi = htfFvgs[f];
            haveAoi = true;
            break;
         }
         if(!haveAoi) continue;
      }

      double a = CrtATR(m.confirmBar, high, low, close);
      double pad = a * cfg.slPadAtr;
      CrtSetup s;
      s.dir = m.dir;
      s.barIndex = m.confirmBar;
      s.barTime = m.confirmTime;
      s.biasCount = bias;
      s.rcHigh = m.rcHigh;
      s.rcLow = m.rcLow;
      if(haveAoi) { s.fvgTop = aoi.top; s.fvgBot = aoi.bot; }
      else { s.fvgTop = m.rcHigh; s.fvgBot = m.rcLow; }

      if(m.dir == CRT_DIR_LONG)
      {
         s.entry = MathMax(m.entryHint, (s.fvgTop + s.fvgBot) * 0.5);
         // prefer FVG mid if inside AOI
         if(haveAoi) s.entry = (aoi.top + aoi.bot) * 0.5;
         s.sl = m.sweepExt - pad;
         if(s.entry <= s.sl) continue;
         double risk = s.entry - s.sl;
         s.tp = s.entry + risk * cfg.riskReward;
         if(cfg.useStructureTp)
         {
            double sw;
            if(CrtNextSwingHigh(high, rates, m.confirmBar, 3, sw) && sw > s.entry)
               s.tp = MathMax(s.tp, sw);
         }
      }
      else
      {
         if(haveAoi) s.entry = (aoi.top + aoi.bot) * 0.5;
         else s.entry = m.entryHint;
         s.sl = m.sweepExt + pad;
         if(s.sl <= s.entry) continue;
         double risk = s.sl - s.entry;
         s.tp = s.entry - risk * cfg.riskReward;
         if(cfg.useStructureTp)
         {
            double sw;
            if(CrtNextSwingLow(low, rates, m.confirmBar, 3, sw) && sw < s.entry)
               s.tp = MathMin(s.tp, sw);
         }
      }

      ArrayResize(outSetups, nOut + 1);
      outSetups[nOut++] = s;
      lastSetupBar = m.confirmBar;
   }
   return nOut;
}

// Helper: load HTF bars into oldest->newest arrays
bool CrtCopyHtf(const string symbol, const ENUM_TIMEFRAMES htf, const int need,
                datetime &t[], double &o[], double &h[], double &l[], double &c[])
{
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int n = CopyRates(symbol, htf, 0, need, rates);
   if(n < 50) return false;
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
   return true;
}

#endif
//+------------------------------------------------------------------+
