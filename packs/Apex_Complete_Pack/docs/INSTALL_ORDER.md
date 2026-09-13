# Apex Brain — install order (verified)

## 1) MT5 include (bridge)
Copy to: `MQL5/Include/MT5_WatchBridge/`  OR  `MQL5/Experts/MT5_WatchBridge/`
- WatchBridge.mqh

## 2) Engine (shared header)
Copy to BOTH:
- `MQL5/Indicators/Apex_Brain/Apex_Engine.mqh`
- `MQL5/Experts/Apex_Brain/Apex_Engine.mqh`

## 3) Chart indicator
Copy to: `MQL5/Indicators/Apex_Brain/`
- Apex_Chart.mq5
- Apex_Engine.mqh  (same folder)

Compile: Apex_Chart.mq5 → attach from Navigator → Indicators

## 4) Expert Advisor
Copy to: `MQL5/Experts/Apex_Brain/`
- Apex_AutoTrade.mq5
- Apex_Engine.mqh  (same folder)

Compile: Apex_AutoTrade.mq5 → attach from Navigator → Experts  
Allow WebRequest URL: `http://127.0.0.1:8787` (or your tunnel URL)

## 5) Web dashboard (optional)
Folder: WebDashboard/
```
npm run apex:watch
# or: node server.mjs
```
Open: http://127.0.0.1:8787/apex.html
