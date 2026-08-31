//+------------------------------------------------------------------+
//| TRH_AutoTrade.mq5                                                |
//| Classic SWEEP autotrade v3                                       |
//| Limit @ ENTRY or market if there + filters + dynamic lots + BE   |
//+------------------------------------------------------------------+
#property copyright "TRH"
#property link      "https://github.com/radiarkazemi/forge-charts"
#property version   "3.23"
#property description "TRH EA v3.23: no expired mid-ENTRY pullbacks + spread retry"
#property strict

#include <Trade/Trade.mqh>
#include "TRH_Engine.mqh"

// MQL5 has no #error — version is checked in OnInit (need Engine v223+ in SAME folder).
#ifndef TRH_ENGINE_VERSION
#define TRH_ENGINE_VERSION 0
#endif

enum ENUM_TRH_TRADE_MODE
{
   TRH_TM_CLASSIC = 0, // Mode A - classic SWEEP room
   TRH_TM_FVG     = 1, // Mode B - sweep + displacement + FVG
   TRH_TM_BOTH    = 2, // A + B (shared cooldown)
   TRH_TM_BTB     = 3, // Mode C - Pro BTB breakout + retest
   TRH_TM_ALL     = 4  // A + B + C
};

input group "Trading"
input bool   InpAutoTrade         = true;   // Enable AutoTrade (Algo Trading ON)
input bool   InpAlertOnSetup      = false;  // Alert on new setup (OFF: indicator alerts; avoids double popups)
input ulong  InpMagic             = 260825; // Magic number
input int    InpMaxSlippagePts    = 30;     // Max slippage (points)
input int    InpPendingExpiryBars = 15;     // Cancel unfilled limit after N bars (was 40)
input int    InpLookbackBars      = 2000;   // History bars to scan

input group "Strategy mode"
input ENUM_TRH_TRADE_MODE InpTradeMode = TRH_TM_ALL; // Detection Mode

input group "1) Spread filter"
input bool   InpUseSpreadFilter   = true;   // Enable max spread filter
input int    InpMaxSpreadPoints   = 100;    // Max spread points (GOLD often 40-80)
input double InpMaxSpreadAtr      = 0.35;   // Also skip if spread > this ATR× (0=off)

input group "2) Session filter (broker server time)"
input bool   InpUseSessionFilter  = true;   // Enable session filter
input int    InpSessionStartHour  = 7;      // Session start hour (inclusive)
input int    InpSessionEndHour    = 21;     // Session end hour (exclusive)

input group "3) Daily limits"
input bool   InpUseDailyLimits    = true;   // Enable daily loss / trade caps
input double InpMaxDailyLossPct   = 4.0;    // Max daily loss % of equity (0=off)
input int    InpMaxDailyTrades    = 5;      // Max new trades per day (0=off)

input group "4) Break-even"
input bool   InpUseBreakEven      = true;   // Move SL to BE after +XR
input double InpBreakEvenAtR      = 0.5;    // Trigger at this R multiple (0.5 = earlier protect)
input double InpBreakEvenLockR    = 0.05;   // Lock +this R past entry (0=exact BE)

input group "5) Entry fill — no expired pullbacks"
input double InpMarketTolAtr      = 0.20;   // Market if within this ATR of ENTRY
input double InpMaxChaseAtr       = 0.30;   // Max past ENTRY for market (else skip)
input bool   InpSkipExpiredEntry  = true;   // If already past ENTRY toward TP: skip (no limit wait)
input bool   InpCancelRunThrough  = true;   // Delete pending if price runs through ENTRY without fill
input bool   InpAllowLimitWhenBehind = true;// Limit only when price has NOT reached ENTRY yet
input int    InpFreshMaxAgeBars   = 3;      // Only trade setups this fresh (bars)

input group "TRH Detection (= Pine Mode A)"
input int    InpPivotPeriod     = 5;
input double InpMinContextAtr   = 1.2;
input double InpMinSweepAtr     = 0.05;
input int    InpBaseConfirmBars = 8;
input int    InpMaxBaseBars     = 40;
input double InpMinRoomAtr      = 0.8;
input double InpMaxRoomAtr      = 3.5;
input int    InpCooldownBars    = 50;
input double InpRoomConfirmFrac = 0.50;   // Confirm at mid ENTRY (0.5); 0.7 = late/expired
input double InpLatePastMidAtr  = 0.25;   // Skip Mode A if close already past mid by this ATR×

input group "Mode B - Sweep + Displacement + FVG"
input double InpMinDispAtr      = 0.55;   // Min Displacement Body (ATRx)
input int    InpMaxDispBars     = 6;      // Max Bars After Sweep For Displacement
input int    InpMaxFvgBars      = 10;     // Max Bars After Displacement For FVG
input double InpMinFvgAtr       = 0.12;   // Min FVG Gap Size (ATRx)
input bool   InpRequireFvgRetest= true;   // Wait For FVG Retest Before Entry
input int    InpMaxRetestBars   = 8;      // Max Bars To Wait For Retest
input double InpFvgSlExtraAtr   = 0.20;   // Extra SL Beyond Sweep (ATRx)

input group "Mode C - Pro BTB (Break + Retest)"
input double InpMinBreakAtr     = 0.15;   // Min Break Beyond Pivot (ATRx)
input double InpMinBreakBodyAtr = 0.35;   // Min Breakout Candle Body (ATRx)
input int    InpMaxBtbRetestBars= 12;     // Max Bars To Wait For BTB Retest
input double InpBtbRiskReward   = 2.0;    // BTB Risk-Reward (min 2.0)
input double InpBtbSlExtraAtr   = 0.10;   // Extra SL Beyond Breakout Extreme
input bool   InpBtbRequireConfirm = true; // Require Rejection Candle On Retest

input group "Entry / SL / TP"
input double InpSlPadAtr        = 0.02;
input double InpRiskReward      = 2.4;    // Target RR Mode A/B (liquidity may extend)
input bool   InpUseLiquidityTP  = true;   // Prefer opposing pivot if farther (up to better TP)

input group "Dynamic lot size (balance-based)"
input bool   InpUseDynamicLots  = true;   // lots = (Balance * Risk%) / SL$
input double InpRiskPercent     = 1.5;    // Risk % of balance per trade (max 1.5%)
input double InpBalanceBase     = 0;      // 0 = use live balance; else use this base
input double InpLotScale        = 1.0;    // Multiply final lots (1.0 = normal)
input double InpFixedLots       = 0.0;    // If >0, ignore dynamic and use fixed
input double InpMinLots         = 0.0;    // Extra floor (0 = broker min)
input double InpMaxLots         = 0.0;    // Extra cap (0 = broker max)
input int    InpMaxOpenTrades   = 1;      // Max open at the same time

CTrade   g_trade;
datetime g_lastBarTime   = 0;
datetime g_lastSetupTime = 0;
datetime g_dayStamp      = 0;
double   g_dayStartEquity = 0;
int      g_dayTrades     = 0;

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
   cfg.roomConfirmFrac = InpRoomConfirmFrac;
   cfg.latePastMidAtr  = InpLatePastMidAtr;
   cfg.minDispAtr      = InpMinDispAtr;
   cfg.maxDispBars     = InpMaxDispBars;
   cfg.maxFvgBars      = InpMaxFvgBars;
   cfg.minFvgAtr       = InpMinFvgAtr;
   cfg.requireFvgRetest= InpRequireFvgRetest;
   cfg.maxRetestBars   = InpMaxRetestBars;
   cfg.fvgSlExtraAtr   = InpFvgSlExtraAtr;
   cfg.minBreakAtr     = InpMinBreakAtr;
   cfg.minBreakBodyAtr = InpMinBreakBodyAtr;
   cfg.maxBtbRetestBars= InpMaxBtbRetestBars;
   cfg.btbRiskReward   = InpBtbRiskReward;
   cfg.btbSlExtraAtr   = InpBtbSlExtraAtr;
   cfg.btbRequireConfirm = InpBtbRequireConfirm;
}

void ResetDayIfNeeded()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime day = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   if(day != g_dayStamp)
   {
      g_dayStamp = day;
      g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
      g_dayTrades = 0;
   }
}

int CountOurOrders()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      n++;
   }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      n++;
   }
   return n;
}

bool SpreadOk(const double atrNow)
{
   if(!InpUseSpreadFilter) return true;
   long spreadPts = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spreadPts > InpMaxSpreadPoints)
   {
      PrintFormat("TRH: retry later - spread %d > max %d pts", (int)spreadPts, InpMaxSpreadPoints);
      return false;
   }
   if(InpMaxSpreadAtr > 0 && atrNow > 0)
   {
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double spreadPrice = (double)spreadPts * point;
      if(spreadPrice > atrNow * InpMaxSpreadAtr)
      {
         PrintFormat("TRH: retry later - spread %.2f > %.2f ATR", spreadPrice, atrNow * InpMaxSpreadAtr);
         return false;
      }
   }
   return true;
}

bool SessionOk()
{
   if(!InpUseSessionFilter) return true;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int h = dt.hour;
   bool ok;
   if(InpSessionStartHour == InpSessionEndHour) ok = true;
   else if(InpSessionStartHour < InpSessionEndHour)
      ok = (h >= InpSessionStartHour && h < InpSessionEndHour);
   else
      ok = (h >= InpSessionStartHour || h < InpSessionEndHour);
   if(!ok)
      PrintFormat("TRH: skip - outside session %d-%d (hour=%d)",
         InpSessionStartHour, InpSessionEndHour, h);
   return ok;
}

bool DailyLimitsOk()
{
   if(!InpUseDailyLimits) return true;
   ResetDayIfNeeded();
   if(InpMaxDailyTrades > 0 && g_dayTrades >= InpMaxDailyTrades)
   {
      PrintFormat("TRH: skip - daily trade cap %d reached", InpMaxDailyTrades);
      return false;
   }
   if(InpMaxDailyLossPct > 0.0 && g_dayStartEquity > 0.0)
   {
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      double lossPct = 100.0 * (g_dayStartEquity - eq) / g_dayStartEquity;
      if(lossPct >= InpMaxDailyLossPct)
      {
         PrintFormat("TRH: skip - daily loss %.2f%% >= max %.2f%%", lossPct, InpMaxDailyLossPct);
         return false;
      }
   }
   return true;
}

// Dynamic lots:
//   riskMoney = balance * (RiskPercent/100) * LotScale
//   lots      = riskMoney / (SL_distance_in_ticks * tick_value)
double CalcLots(const double entry, const double sl)
{
   double volMin     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double volMax     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double volumeStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(volumeStep <= 0) volumeStep = 0.01;
   if(InpMinLots > 0) volMin = MathMax(volMin, InpMinLots);
   if(InpMaxLots > 0) volMax = MathMin(volMax, InpMaxLots);

   double lots;
   if(InpFixedLots > 0.0)
      lots = InpFixedLots;
   else if(InpUseDynamicLots)
   {
      double balance = (InpBalanceBase > 0.0)
         ? InpBalanceBase
         : AccountInfoDouble(ACCOUNT_BALANCE);
      double riskMoney = balance * (InpRiskPercent / 100.0) * InpLotScale;
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dist = MathAbs(entry - sl);
      if(tickSize <= 0 || tickValue <= 0 || dist <= 0 || riskMoney <= 0)
         return volMin;
      lots = riskMoney / ((dist / tickSize) * tickValue);
   }
   else
   {
      double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * (InpRiskPercent / 100.0);
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double dist = MathAbs(entry - sl);
      if(tickSize <= 0 || tickValue <= 0 || dist <= 0) return volMin;
      lots = riskMoney / ((dist / tickSize) * tickValue);
   }

   lots = MathFloor(lots / volumeStep) * volumeStep;
   if(lots < volMin) lots = volMin;
   if(lots > volMax) lots = volMax;

   int digits = 0;
   double step = volumeStep;
   while(step < 1.0 && digits < 8) { step *= 10.0; digits++; }
   return NormalizeDouble(lots, digits);
}

bool AdjustStops(const int dir, const double entry, double &sl, double &tp)
{
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0) return false;
   double minDist = stopsLevel * point;
   if(minDist <= 0) minDist = point;

   if(dir == 1)
   {
      if(entry - sl < minDist) sl = entry - minDist;
      if(tp - entry < minDist) tp = entry + minDist;
   }
   else
   {
      if(sl - entry < minDist) sl = entry + minDist;
      if(entry - tp < minDist) tp = entry - minDist;
   }
   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);
   return true;
}

// Returns: 1 = placed, 0 = retry later (spread/session), -1 = permanent skip this setup
int PlaceSetupTrade(const TrhSetup &s, const double atrNow)
{
   if(!InpAutoTrade) return -1;
   if(!SpreadOk(atrNow) || !SessionOk() || !DailyLimitsOk()) return 0;
   if(CountOurOrders() >= InpMaxOpenTrades)
   {
      Print("TRH: skip - already at MaxOpenTrades");
      return -1;
   }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double entry = NormalizeDouble(s.entry, _Digits);
   double sl    = NormalizeDouble(s.sl, _Digits);
   double tp    = NormalizeDouble(s.tp, _Digits);
   if(!AdjustStops(s.dir, entry, sl, tp)) return -1;

   double lots = CalcLots(entry, sl);
   double maxChase = atrNow * InpMaxChaseAtr;

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);

   string comment = StringFormat("TRH %s %s", TrhModeLabel(s.setupMode), s.dir == 1 ? "LONG" : "SHORT");
   bool ok = false;
   string mode = "";

   // pastEntry > 0 means price already moved from ENTRY toward TP (fill is late)
   double pastEntry = (s.dir == 1) ? (ask - entry) : (entry - bid);

   if(pastEntry > maxChase && maxChase > 0)
   {
      // Already deep past mid-ENTRY toward TP — pullback waits usually fail
      if(InpSkipExpiredEntry)
      {
         PrintFormat("TRH: EXPIRED %s - %.2f past ENTRY (max %.2f) — skip, no pullback limit",
            s.dir == 1 ? "LONG" : "SHORT", pastEntry, maxChase);
         return -1;
      }
      if(!InpAllowLimitWhenBehind)
         return -1;
      mode = (s.dir == 1) ? "BUY LIMIT (hope pullback)" : "SELL LIMIT (hope pullback)";
      ok = (s.dir == 1)
         ? g_trade.BuyLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment)
         : g_trade.SellLimit(lots, entry, _Symbol, sl, tp, ORDER_TIME_GTC, 0, comment);
   }
   else
   {
      // At ENTRY, slightly past (within chase), or still before ENTRY → market now
      // (Do not park limits that wait for failed pullbacks.)
      mode = (s.dir == 1) ? "MARKET BUY" : "MARKET SELL";
      ok = (s.dir == 1)
         ? g_trade.Buy(lots, _Symbol, 0, sl, tp, comment)
         : g_trade.Sell(lots, _Symbol, 0, sl, tp, comment);
   }

   if(ok)
   {
      g_dayTrades++;
      PrintFormat("TRH %s %s lots=%s E=%s SL=%s TP=%s pastE=%.2f balRisk=%.2f%%",
         mode, s.dir == 1 ? "LONG" : "SHORT",
         DoubleToString(lots, 2),
         DoubleToString(entry, _Digits),
         DoubleToString(sl, _Digits),
         DoubleToString(tp, _Digits),
         pastEntry,
         InpRiskPercent);
      return 1;
   }

   PrintFormat("TRH ORDER FAIL %s %s ret=%d %s",
      mode, s.dir == 1 ? "LONG" : "SHORT",
      g_trade.ResultRetcode(),
      g_trade.ResultRetcodeDescription());
   return 0;
}

void ExpireStalePendings()
{
   if(InpPendingExpiryBars <= 0) return;
   int periodSec = PeriodSeconds(_Period);
   if(periodSec <= 0) return;

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;

      datetime setup = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
      int ageBars = (int)((TimeCurrent() - setup) / periodSec);
      if(ageBars >= InpPendingExpiryBars)
      {
         PrintFormat("TRH: expire pending #%I64u after %d bars", ticket, ageBars);
         g_trade.OrderDelete(ticket);
      }
   }
}

// If price already ran through ENTRY toward TP without filling the limit, kill it
void CancelRunThroughPendings(const double atrNow)
{
   if(!InpCancelRunThrough) return;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double maxChase = atrNow * InpMaxChaseAtr;
   if(maxChase <= 0) return;

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !OrderSelect(ticket)) continue;
      if(OrderGetInteger(ORDER_MAGIC) != (long)InpMagic) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;

      long type = OrderGetInteger(ORDER_TYPE);
      double px = OrderGetDouble(ORDER_PRICE_OPEN);
      bool runThrough = false;
      if(type == ORDER_TYPE_BUY_LIMIT && ask > px + maxChase)
         runThrough = true;
      if(type == ORDER_TYPE_SELL_LIMIT && bid < px - maxChase)
         runThrough = true;

      if(runThrough)
      {
         PrintFormat("TRH: cancel run-through pending #%I64u @ %s (no pullback)",
            ticket, DoubleToString(px, _Digits));
         g_trade.OrderDelete(ticket);
      }
   }
}

void ManageBreakEven()
{
   if(!InpUseBreakEven) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long type = PositionGetInteger(POSITION_TYPE);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      double vol   = PositionGetDouble(POSITION_VOLUME);
      if(entry <= 0) continue;

      // Recover original risk from comment distance if SL already moved - use entry vs current SL only if SL still adverse
      double risk = 0;
      if(type == POSITION_TYPE_BUY)
         risk = (sl > 0 && sl < entry) ? (entry - sl) : 0;
      else
         risk = (sl > 0 && sl > entry) ? (sl - entry) : 0;

      // If SL already at/beyond BE, skip; else estimate risk from TP if needed
      if(risk <= 0)
      {
         if(tp > 0)
            risk = MathAbs(tp - entry) / MathMax(InpRiskReward, 0.1);
         else
            continue;
      }

      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double favor = (type == POSITION_TYPE_BUY) ? (bid - entry) : (entry - ask);
      double rNow = favor / risk;
      if(rNow < InpBreakEvenAtR) continue;

      double lock = risk * InpBreakEvenLockR;
      double newSL;
      if(type == POSITION_TYPE_BUY)
      {
         newSL = NormalizeDouble(entry + lock, _Digits);
         if(sl >= newSL) continue; // already protected
         if(bid <= newSL) continue;
      }
      else
      {
         newSL = NormalizeDouble(entry - lock, _Digits);
         if(sl <= newSL && sl > 0) continue;
         if(ask >= newSL) continue;
      }

      if(g_trade.PositionModify(ticket, newSL, tp))
         PrintFormat("TRH BE: ticket=%I64u newSL=%s at %.2fR", ticket, DoubleToString(newSL, _Digits), rNow);
   }
}

int OnInit()
{
   if(TRH_ENGINE_VERSION < 223)
   {
      Alert("TRH EA: Engine outdated (v", IntegerToString(TRH_ENGINE_VERSION),
            "). Put NEW TRH_Engine.mqh in the SAME folder as this .mq5 and recompile.");
      return INIT_FAILED;
   }

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(InpMaxSlippagePts);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   ResetDayIfNeeded();

   PrintFormat("TRH AutoTrade v3.23 | mode=%d | AutoTrade=%s | skipExpired=%s | BE@%.2fR | BTB RR=%.1f | %s %s | risk=%.2f%% | maxSpread=%d",
      (int)InpTradeMode,
      InpAutoTrade ? "ON" : "OFF",
      InpSkipExpiredEntry ? "YES" : "NO",
      InpBreakEvenAtR,
      InpBtbRiskReward,
      _Symbol, EnumToString(_Period), InpRiskPercent, InpMaxSpreadPoints);

   Comment("TRH EA v3.23\nSWEEP+FVG+BTB | skip expired ENTRY\nspread retry | BE@0.5R");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   Comment("");
}

void OnTick()
{
   ResetDayIfNeeded();
   ExpireStalePendings();
   ManageBreakEven();

   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == 0) return;

   // Run-through cancel every tick using last closed ATR estimate from rates
   MqlRates tip[];
   if(CopyRates(_Symbol, _Period, 1, 20, tip) >= 15)
   {
      ArraySetAsSeries(tip, true);
      double sum = 0;
      for(int k = 1; k <= 14; k++)
      {
         double tr = MathMax(tip[k].high - tip[k].low,
                      MathMax(MathAbs(tip[k].high - tip[k + 1].close),
                              MathAbs(tip[k].low - tip[k + 1].close)));
         sum += tr;
      }
      CancelRunThroughPendings(sum / 14.0);
   }

   if(barTime == g_lastBarTime) return;
   g_lastBarTime = barTime;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, 0, InpLookbackBars, rates);
   if(copied < 120)
   {
      Print("TRH: not enough bars (", copied, ")");
      return;
   }

   datetime t[];
   double o[], h[], l[], c[];
   ArrayResize(t, copied);
   ArrayResize(o, copied);
   ArrayResize(h, copied);
   ArrayResize(l, copied);
   ArrayResize(c, copied);
   for(int i = 0; i < copied; i++)
   {
      t[i] = rates[i].time;
      o[i] = rates[i].open;
      h[i] = rates[i].high;
      l[i] = rates[i].low;
      c[i] = rates[i].close;
   }

   TrhConfig cfg;
   BuildConfig(cfg);
   TrhSetup setups[];
   int n = TrhScanByMode(copied, t, o, h, l, c, cfg, (int)InpTradeMode, setups);

   if(n <= 0)
   {
      Comment(StringFormat("TRH EA v3.23 %s - scanning...\nday trades %d | equity %.2f",
         InpAutoTrade ? "ON" : "OFF", g_dayTrades, AccountInfoDouble(ACCOUNT_EQUITY)));
      return;
   }

   TrhSetup last = setups[n - 1];
   // Age vs last CLOSED bar (copied-2). Forming tip is never a valid signal bar.
   int ageBars = (copied >= 2) ? ((copied - 2) - last.barIndex) : ((copied - 1) - last.barIndex);
   if(ageBars < 0) ageBars = 0;
   double previewLots = CalcLots(last.entry, last.sl);
   int openNow = CountOurOrders();

   Comment(StringFormat(
      "TRH %s | %s\nENTRY %s  SL %s  TP %s\nBar %s (age %d)\nAutoTrade %s | orders %d | day %d\nDyn lots ? %s (risk %.2f%% bal) skipExpired=%s",
      last.dir == 1 ? "LONG" : "SHORT",
      TrhModeLabel(last.setupMode),
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      ageBars,
      InpAutoTrade ? "ON" : "OFF",
      openNow,
      g_dayTrades,
      DoubleToString(previewLots, 2),
      InpRiskPercent,
      InpSkipExpiredEntry ? "Y" : "N"));

   // Setup must be fresh; allow age 0..FreshMax so spread can retry next bars
   if(ageBars > InpFreshMaxAgeBars) return;
   if(last.barTime == g_lastSetupTime) return;

   // While a TRH position/pending is already open, do not fire a second alarm
   if(openNow > 0)
   {
      PrintFormat("TRH: hold - already %d open order(s); ignore new setup %s",
         openNow, TimeToString(last.barTime, TIME_DATE|TIME_MINUTES));
      return;
   }

   if(!InpAutoTrade)
   {
      g_lastSetupTime = last.barTime;
      return;
   }

   double atrNow = TrhCalcATR(copied - 2, h, l, c);
   int rc = PlaceSetupTrade(last, atrNow);
   if(rc == 0)
   {
      // Spread/session/requote — do NOT lock setup; retry next bar while fresh
      PrintFormat("TRH: defer setup %s (retry while age<=%d)",
         TimeToString(last.barTime, TIME_DATE|TIME_MINUTES), InpFreshMaxAgeBars);
      return;
   }

   // Placed (1) or permanent skip (-1) — lock this setup bar
   g_lastSetupTime = last.barTime;

   PrintFormat("TRH SETUP %s %s E=%s SL=%s TP=%s @ %s age=%d result=%s",
      TrhModeLabel(last.setupMode),
      last.dir == 1 ? "LONG" : "SHORT",
      DoubleToString(last.entry, _Digits),
      DoubleToString(last.sl, _Digits),
      DoubleToString(last.tp, _Digits),
      TimeToString(last.barTime, TIME_DATE|TIME_MINUTES),
      ageBars,
      rc == 1 ? "PLACED" : "SKIPPED");

   if(InpAlertOnSetup && rc == 1)
   {
      Alert(StringFormat("TRH %s %s SETUP\nENTRY %s\nSL %s\nTP %s\nlots?%s",
         last.dir == 1 ? "LONG" : "SHORT",
         TrhModeLabel(last.setupMode),
         DoubleToString(last.entry, _Digits),
         DoubleToString(last.sl, _Digits),
         DoubleToString(last.tp, _Digits),
         DoubleToString(previewLots, 2)));
   }
}
//+------------------------------------------------------------------+
