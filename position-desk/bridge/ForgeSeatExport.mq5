// Forge Seat exporter. Attach to a chart of the symbol you want checked.
// MetaTrader only allows WebRequest to URLs you list under
// Tools → Options → Expert Advisors → Allow WebRequest for listed URL.
// Add the desk origin, for example http://2.28.37.51:8096
#property copyright "Forge"
#property version   "1.00"
#property strict

input string DeskUrl = "http://2.28.37.51:8096/api/ingest";
input string Token = "";
input int BarsToSend = 300;

int OnInit()
{
   EventSetTimer(2);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   if(StringLen(Token) < 8)
   {
      Comment("Forge Seat: paste the desk token into the EA inputs");
      return;
   }
   string json = BuildPayload();
   uchar body[];
   int count = StringToCharArray(json, body, 0, StringLen(json), CP_UTF8);
   if(count > 0)
      ArrayResize(body, count);
   uchar result[];
   string responseHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + Token + "\r\n";
   int status = WebRequest("POST", DeskUrl, headers, 5000, body, result, responseHeaders);
   if(status == -1)
      Comment("Forge Seat: WebRequest failed ", GetLastError(), ". Allow the URL in Expert Advisors options.");
   else
      Comment("Forge Seat: HTTP ", status, " ", _Symbol);
}

string BuildPayload()
{
   MqlTick tick;
   SymbolInfoTick(_Symbol, tick);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   return "{"
      + "\"symbol\":\"" + _Symbol + "\","
      + "\"digits\":" + IntegerToString(digits) + ","
      + "\"point\":" + DoubleToString(point, 8) + ","
      + "\"quote\":{\"time\":" + IntegerToString((int)tick.time)
      + ",\"bid\":" + DoubleToString(tick.bid, digits)
      + ",\"ask\":" + DoubleToString(tick.ask, digits) + "},"
      + "\"bars\":{"
      + "\"M1\":" + RatesJson(PERIOD_M1) + ","
      + "\"M5\":" + RatesJson(PERIOD_M5) + ","
      + "\"M15\":" + RatesJson(PERIOD_M15) + ","
      + "\"H1\":" + RatesJson(PERIOD_H1)
      + "}}";
}

string RatesJson(ENUM_TIMEFRAMES timeframe)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 0, BarsToSend, rates);
   string out = "[";
   for(int i = copied - 1; i >= 0; i--)
   {
      if(i != copied - 1)
         out += ",";
      out += "{\"time\":" + IntegerToString((int)rates[i].time)
         + ",\"open\":" + DoubleToString(rates[i].open, _Digits)
         + ",\"high\":" + DoubleToString(rates[i].high, _Digits)
         + ",\"low\":" + DoubleToString(rates[i].low, _Digits)
         + ",\"close\":" + DoubleToString(rates[i].close, _Digits)
         + ",\"volume\":" + DoubleToString(rates[i].tick_volume, 0) + "}";
   }
   return out + "]";
}
