//+------------------------------------------------------------------+
//| NabzNews.mqh — economic calendar strip (MT5 Calendar API)        |
//+------------------------------------------------------------------+
#ifndef NABZ_NEWS_MQH
#define NABZ_NEWS_MQH

struct NabzNewsItem
{
   string   currency;
   string   name;
   datetime time;
   int      importance; // 0..3
   bool     released;
};

struct NabzNewsState
{
   NabzNewsItem items[];
   int          count;
   int          offset;   // scroll index
   datetime     lastFetch;
};

void NabzNewsClear(NabzNewsState &n)
{
   ArrayResize(n.items, 0);
   n.count = 0;
   n.offset = 0;
}

void NabzNewsFetchToday(NabzNewsState &n)
{
   NabzNewsClear(n);
   n.lastFetch = TimeCurrent();

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime from = StructToTime(dt);
   datetime to   = from + 86400;

   MqlCalendarValue values[];
   int total = CalendarValueHistory(values, from, to);
   if(total <= 0)
   {
      // graceful empty — UI shows "no events"
      return;
   }

   ArrayResize(n.items, total);
   int w = 0;
   for(int i = 0; i < total; ++i)
   {
      MqlCalendarEvent ev;
      if(!CalendarEventById(values[i].event_id, ev))
         continue;
      MqlCalendarCountry country;
      string ccy = "";
      if(CalendarCountryById(ev.country_id, country))
         ccy = country.currency;

      NabzNewsItem it;
      it.currency = (ccy == "" ? "—" : ccy);
      it.name = ev.name;
      if(StringLen(it.name) > 22)
         it.name = StringSubstr(it.name, 0, 20) + "…";
      it.time = values[i].time;
      it.importance = (int)ev.importance;
      it.released = (values[i].time <= TimeCurrent());
      n.items[w++] = it;
   }
   ArrayResize(n.items, w);
   n.count = w;

   // sort by time ascending (simple insertion — small N)
   for(int i = 1; i < n.count; ++i)
   {
      NabzNewsItem key = n.items[i];
      int j = i - 1;
      while(j >= 0 && n.items[j].time > key.time)
      {
         n.items[j + 1] = n.items[j];
         j--;
      }
      n.items[j + 1] = key;
   }

   // start near upcoming
   n.offset = 0;
   for(int i = 0; i < n.count; ++i)
   {
      if(n.items[i].time >= TimeCurrent() - 3600)
      {
         n.offset = i;
         break;
      }
   }
}

string NabzNewsLine(const NabzNewsState &n, const int index)
{
   if(index < 0 || index >= n.count)
      return "No economic events";
   NabzNewsItem it = n.items[index];
   string t = TimeToString(it.time, TIME_MINUTES);
   string st = it.released ? "RELEASED" : "SOON";
   return StringFormat("%s  ·  %s  ·  %s  ·  %s", it.currency, it.name, t, st);
}

#endif
//+------------------------------------------------------------------+
