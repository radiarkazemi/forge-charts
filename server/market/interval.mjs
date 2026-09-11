/** Forge interval id -> TradingView resolution string. */
export function tvResolution(interval) {
  const raw = String(interval || "15").trim();
  const upper = raw.toUpperCase();
  if (raw === "1" || raw === "1m") return "1";
  if (raw === "2") return "2";
  if (raw === "3") return "3";
  if (raw === "5") return "5";
  if (raw === "10") return "10";
  if (raw === "15") return "15";
  if (raw === "30") return "30";
  if (raw === "45") return "45";
  if (raw === "60" || upper === "1H") return "60";
  if (raw === "120") return "120";
  if (raw === "180") return "180";
  if (raw === "240") return "240";
  if (upper === "1D" || upper === "D") return "1D";
  if (upper === "1W" || upper === "W") return "1W";
  if (upper === "1M" || upper === "M") return "1M";
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n <= 1) return "1";
    if (n <= 5) return "5";
    if (n <= 15) return "15";
    if (n <= 30) return "30";
    if (n <= 60) return "60";
    if (n <= 240) return "240";
    return "1D";
  }
  if (upper.endsWith("S")) return "1";
  if (upper.endsWith("H")) return String(Math.max(1, parseInt(upper, 10) || 1) * 60);
  if (upper.endsWith("D")) return "1D";
  if (upper.endsWith("W")) return "1W";
  if (upper.endsWith("M")) return "1M";
  return "15";
}
