export function formatPrice(value: number | undefined, precision: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 10_000) {
    return value.toLocaleString("en-US", { minimumFractionDigits: Math.min(precision, 2), maximumFractionDigits: 2 });
  }
  return value.toFixed(precision);
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC";
}

export function formatRelative(unixMs: number, now = Date.now()): string {
  const diff = Math.max(0, now - unixMs);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
