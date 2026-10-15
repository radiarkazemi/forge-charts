//+------------------------------------------------------------------+
//| WatchBridge.mqh — push MT5 events to local mt5-watch webapp      |
//| Drop beside each AutoTrade EA and #include after Trade.mqh       |
//+------------------------------------------------------------------+
#ifndef MT5_WATCH_BRIDGE_MQH
#define MT5_WATCH_BRIDGE_MQH

#define WATCH_BRIDGE_VERSION 100

input group "MT5 Watch (local webapp)"
input bool   InpWatchEnable   = true;                         // Send events to local watch
input string InpWatchUrl      = "http://127.0.0.1:8787/api/event"; // POST URL
input bool   InpWatchFile     = true;                         // Also write Common/Files/mt5-watch/events.jsonl
input int    InpWatchHbSec    = 30;                           // Heartbeat seconds (0=off)

datetime g_watchLastHb = 0;
string   g_watchLastFp = "";

string WatchEsc(const string s)
{
   string o = s;
   StringReplace(o, "\\", "\\\\");
   StringReplace(o, "\"", "\\\"");
   StringReplace(o, "\n", "\\n");
   StringReplace(o, "\r", "");
   return o;
}

string WatchJsonNum(const double v)
{
   if(!MathIsValidNumber(v)) return "null";
   return DoubleToString(v, 8);
}

bool WatchWriteFile(const string json)
{
   if(!InpWatchFile) return false;
   FolderCreate("mt5-watch", FILE_COMMON);
   int h = FileOpen("mt5-watch\\events.jsonl",
                    FILE_READ|FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE)
   {
      // first create
      h = FileOpen("mt5-watch\\events.jsonl",
                   FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE);
      if(h == INVALID_HANDLE) return false;
   }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, json + "\n");
   FileClose(h);
   return true;
}

bool WatchHttpPost(const string json)
{
   if(!InpWatchEnable) return false;
   if(StringLen(InpWatchUrl) < 8) return false;

   char data[];
   char result[];
   string resultHeaders;
   // WebRequest wants UTF-8 bytes without trailing NUL as payload length
   int n = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) ArrayResize(data, n - 1);

   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int code = WebRequest("POST", InpWatchUrl, headers, 3000, data, result, resultHeaders);
   if(code == -1)
   {
      static datetime lastWarn = 0;
      if(TimeCurrent() - lastWarn > 300)
      {
         lastWarn = TimeCurrent();
         PrintFormat("WatchBridge: WebRequest failed err=%d — allow URL in Tools→Options→EA→WebRequest: %s",
                     GetLastError(), InpWatchUrl);
      }
      return false;
   }
   return (code >= 200 && code < 300);
}

bool WatchEmitRaw(const string json)
{
   bool okFile = WatchWriteFile(json);
   bool okHttp = WatchHttpPost(json);
   return okFile || okHttp;
}

// model: "TRH" | "ICT" | "CRT"
// kind:  "heartbeat" | "status" | "setup" | "entry" | "exit" | "error" | "info"
bool WatchEmit(const string model,
               const string kind,
               const string side,
               const string status,
               const double entry,
               const double sl,
               const double tp,
               const string mode,
               const string message,
               const datetime barTime = 0)
{
   if(!InpWatchEnable && !InpWatchFile) return false;

   string fp = model + "|" + kind + "|" + side + "|" + status + "|" +
               DoubleToString(entry, _Digits) + "|" +
               DoubleToString(sl, _Digits) + "|" +
               DoubleToString(tp, _Digits) + "|" +
               IntegerToString((int)barTime);
   // de-dupe identical setup/status spam within same fingerprint (except heartbeat)
   if(kind != "heartbeat" && fp == g_watchLastFp && kind != "error")
      return false;
   if(kind == "setup" || kind == "entry" || kind == "exit")
      g_watchLastFp = fp;

   string json = "{"
      "\"ts\":" + IntegerToString((long)TimeLocal() * 1000) + ","
      "\"model\":\"" + WatchEsc(model) + "\","
      "\"kind\":\"" + WatchEsc(kind) + "\","
      "\"symbol\":\"" + WatchEsc(_Symbol) + "\","
      "\"tf\":\"" + WatchEsc(EnumToString(_Period)) + "\","
      "\"side\":\"" + WatchEsc(side) + "\","
      "\"status\":\"" + WatchEsc(status) + "\","
      "\"entry\":" + WatchJsonNum(entry) + ","
      "\"sl\":" + WatchJsonNum(sl) + ","
      "\"tp\":" + WatchJsonNum(tp) + ","
      "\"mode\":\"" + WatchEsc(mode) + "\","
      "\"message\":\"" + WatchEsc(message) + "\","
      "\"barTime\":" + IntegerToString((long)barTime) + ","
      "\"bid\":" + WatchJsonNum(SymbolInfoDouble(_Symbol, SYMBOL_BID)) + ","
      "\"ask\":" + WatchJsonNum(SymbolInfoDouble(_Symbol, SYMBOL_ASK)) + ","
      "\"account\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ","
      "\"balance\":" + WatchJsonNum(AccountInfoDouble(ACCOUNT_BALANCE)) + ","
      "\"equity\":" + WatchJsonNum(AccountInfoDouble(ACCOUNT_EQUITY)) +
      "}";
   return WatchEmitRaw(json);
}

void WatchHeartbeat(const string model, const string status, const string message = "")
{
   if(InpWatchHbSec <= 0) return;
   if(g_watchLastHb != 0 && (TimeCurrent() - g_watchLastHb) < InpWatchHbSec) return;
   g_watchLastHb = TimeCurrent();
   WatchEmit(model, "heartbeat", "", status, 0, 0, 0, "", message, 0);
}

void WatchSetup(const string model, const int dir, const double entry, const double sl, const double tp,
                const string mode, const datetime barTime, const string extra = "")
{
   string side = (dir == 1) ? "LONG" : (dir == -1) ? "SHORT" : "";
   string msg = StringFormat("%s %s SETUP E=%s SL=%s TP=%s %s",
                             model, side,
                             DoubleToString(entry, _Digits),
                             DoubleToString(sl, _Digits),
                             DoubleToString(tp, _Digits),
                             extra);
   WatchEmit(model, "setup", side, "NEW", entry, sl, tp, mode, msg, barTime);
}

void WatchStatus(const string model, const int dir, const double entry, const double sl, const double tp,
                 const string mode, const string status, const datetime barTime = 0)
{
   string side = (dir == 1) ? "LONG" : (dir == -1) ? "SHORT" : "";
   WatchEmit(model, "status", side, status, entry, sl, tp, mode,
             StringFormat("%s %s", model, status), barTime);
}

#endif // MT5_WATCH_BRIDGE_MQH
