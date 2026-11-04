//+------------------------------------------------------------------+
//| NabzJournal.mqh — week/month performance analytics               |
//+------------------------------------------------------------------+
#ifndef NABZ_JOURNAL_MQH
#define NABZ_JOURNAL_MQH

#include <NABZ_Quantum/NabzSessions.mqh>

struct NabzDayStat
{
   datetime day;
   double   net;
   int      trades;
   int      wins;
   double   winRate;
};

struct NabzJournalStats
{
   bool     weekMode;      // true=WEEK false=MONTH
   datetime rangeFrom;
   datetime rangeTo;
   NabzDayStat days[];
   int      dayCount;
   double   net;
   double   winRate;
   int      trades;
   double   profitFactor;
   double   avgTrade;
   double   commissions;
   datetime bestDay;
   double   bestDayNet;
   datetime worstDay;
   double   worstDayNet;
   int      winStreak;
   int      lossStreak;
   string   bestSession;
   double   bestSessionNet;
   // equity curve samples (closed trade balance approx)
   double   curve[];
   int      curveN;
};

datetime NabzDayStart(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   return StructToTime(dt);
}

datetime NabzWeekStart(const datetime t)
{
   // Monday-based week
   MqlDateTime dt;
   TimeToStruct(t, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime d0 = StructToTime(dt);
   int dow = dt.day_of_week; // 0=Sun
   int back = (dow == 0) ? 6 : (dow - 1);
   return d0 - back * 86400;
}

datetime NabzMonthStart(const datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   dt.day = 1; dt.hour = 0; dt.min = 0; dt.sec = 0;
   return StructToTime(dt);
}

int NabzFindDay(NabzJournalStats &j, const datetime day)
{
   for(int i = 0; i < j.dayCount; ++i)
      if(j.days[i].day == day) return i;
   return -1;
}

void NabzJournalCompute(NabzJournalStats &j, const NabzSessionHours &sessions,
                        const bool weekMode, const bool onlySymbol)
{
   j.weekMode = weekMode;
   datetime now = TimeCurrent();
   if(weekMode)
   {
      j.rangeFrom = NabzWeekStart(now);
      j.rangeTo   = j.rangeFrom + 7 * 86400 - 1;
   }
   else
   {
      j.rangeFrom = NabzMonthStart(now);
      MqlDateTime dt;
      TimeToStruct(j.rangeFrom, dt);
      dt.mon += 1;
      if(dt.mon > 12) { dt.mon = 1; dt.year++; }
      j.rangeTo = StructToTime(dt) - 1;
   }

   ArrayResize(j.days, 0);
   j.dayCount = 0;
   j.net = 0; j.trades = 0; j.winRate = 0;
   j.profitFactor = 0; j.avgTrade = 0; j.commissions = 0;
   j.bestDay = 0; j.bestDayNet = -1e99;
   j.worstDay = 0; j.worstDayNet = 1e99;
   j.winStreak = 0; j.lossStreak = 0;
   j.bestSession = "—"; j.bestSessionNet = -1e99;
   ArrayResize(j.curve, 0); j.curveN = 0;

   if(!HistorySelect(j.rangeFrom, j.rangeTo + 86400))
      return;

   double grossWin = 0, grossLoss = 0;
   int wins = 0;
   int curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
   double sessAsia = 0, sessLon = 0, sessNy = 0, sessOff = 0;
   // First pass: collect closed deals OUT
   double profits[];
   ArrayResize(profits, 0);

   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; ++i)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
      string sym = HistoryDealGetString(ticket, DEAL_SYMBOL);
      if(onlySymbol && sym != _Symbol) continue;
      datetime t = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      if(t < j.rangeFrom || t > j.rangeTo) continue;

      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                    + HistoryDealGetDouble(ticket, DEAL_SWAP)
                    + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double comm = HistoryDealGetDouble(ticket, DEAL_COMMISSION);

      j.net += profit;
      j.commissions += MathAbs(comm);
      j.trades++;
      if(profit >= 0) { wins++; grossWin += profit; curWin++; curLoss = 0; if(curWin > maxWin) maxWin = curWin; }
      else { grossLoss += MathAbs(profit); curLoss++; curWin = 0; if(curLoss > maxLoss) maxLoss = curLoss; }

      datetime day = NabzDayStart(t);
      int di = NabzFindDay(j, day);
      if(di < 0)
      {
         NabzDayStat ds;
         ds.day = day; ds.net = 0; ds.trades = 0; ds.wins = 0; ds.winRate = 0;
         ArrayResize(j.days, j.dayCount + 1);
         j.days[j.dayCount] = ds;
         di = j.dayCount;
         j.dayCount++;
      }
      j.days[di].net += profit;
      j.days[di].trades++;
      if(profit >= 0) j.days[di].wins++;

      string sn = NabzSessionName(t, sessions);
      if(StringFind(sn, "ASIA") >= 0) sessAsia += profit;
      else if(StringFind(sn, "LON") >= 0) sessLon += profit;
      else if(StringFind(sn, "NY") >= 0) sessNy += profit;
      else sessOff += profit;

      int n = ArraySize(profits);
      ArrayResize(profits, n + 1);
      profits[n] = profit;
   }

   for(int i = 0; i < j.dayCount; ++i)
   {
      if(j.days[i].trades > 0)
         j.days[i].winRate = 100.0 * j.days[i].wins / j.days[i].trades;
      if(j.days[i].net > j.bestDayNet) { j.bestDayNet = j.days[i].net; j.bestDay = j.days[i].day; }
      if(j.days[i].net < j.worstDayNet) { j.worstDayNet = j.days[i].net; j.worstDay = j.days[i].day; }
   }
   if(j.bestDayNet <= -1e98) { j.bestDayNet = 0; j.worstDayNet = 0; }

   j.winRate = (j.trades > 0) ? 100.0 * wins / j.trades : 0.0;
   j.avgTrade = (j.trades > 0) ? j.net / j.trades : 0.0;
   j.profitFactor = (grossLoss > 0.0) ? grossWin / grossLoss : (grossWin > 0 ? 999.0 : 0.0);
   j.winStreak = maxWin;
   j.lossStreak = maxLoss;

   // best session
   j.bestSessionNet = sessAsia; j.bestSession = "ASIA";
   if(sessLon > j.bestSessionNet) { j.bestSessionNet = sessLon; j.bestSession = "LON"; }
   if(sessNy  > j.bestSessionNet) { j.bestSessionNet = sessNy;  j.bestSession = "NY"; }

   // curve by trade
   double bal = AccountInfoDouble(ACCOUNT_BALANCE) - j.net; // start of range approx
   ArrayResize(j.curve, ArraySize(profits) + 1);
   j.curve[0] = bal;
   for(int i = 0; i < ArraySize(profits); ++i)
   {
      bal += profits[i];
      j.curve[i + 1] = bal;
   }
   j.curveN = ArraySize(j.curve);
}

string NabzMoneyFmt(const double v)
{
   string sign = (v >= 0 ? "+" : "");
   return sign + StringFormat("$%.2f", v);
}

string NabzPctFmt(const double v, const int digits = 2)
{
   string sign = (v >= 0 ? "+" : "");
   return sign + DoubleToString(v, digits) + "%";
}

#endif
//+------------------------------------------------------------------+
