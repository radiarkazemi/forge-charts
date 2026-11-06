/**
 * Multi-scale structure tiers — minor → major on the same chart TF.
 *
 * Same idea as Dealing Ranges stacking chart TF + HTF slots: show the full
 * hierarchy at once (e.g. 5-bar BOS next to 30-bar BOS) instead of one pivot
 * length at a time.
 */

/** Default pivot widths (bars each side): micro → minor → intermediate → major. */
export const DEFAULT_STRUCTURE_SCALES: readonly number[] = [2, 5, 10, 20, 30];

export function parseScaleList(
  text: string,
  fallback: readonly number[] = DEFAULT_STRUCTURE_SCALES,
): number[] {
  const raw = (text || "")
    .split(/[,;\s]+/)
    .map((s) => Math.floor(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 100);
  const uniq = [...new Set(raw)].sort((a, b) => a - b);
  return uniq.length > 0 ? uniq : [...fallback];
}

/**
 * Resolve which pivot widths to run.
 * - smartScales on → parse `scalesText` (default 2,5,10,20,30)
 * - smartScales off → single length only
 */
export function resolveStructureScales(opts: {
  readonly smartScales: boolean;
  readonly scalesText: string;
  readonly single: number;
}): number[] {
  const single = Math.max(1, Math.min(50, Math.floor(opts.single)));
  if (!opts.smartScales) return [single];
  const list = parseScaleList(opts.scalesText);
  // Always include the user's single length so Inputs still matter.
  if (!list.includes(single)) {
    list.push(single);
    list.sort((a, b) => a - b);
  }
  return list;
}

/** 0 = smallest (minor) · 1 = largest (major) among active scales. */
export function scaleStrength(scale: number, scales: readonly number[]): number {
  if (scales.length <= 1) return 1;
  const min = scales[0]!;
  const max = scales[scales.length - 1]!;
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (scale - min) / (max - min)));
}

export function scaleLineWidth(base: number, strength: number): number {
  const b = Math.max(1, Math.min(4, Math.floor(base)));
  return Math.max(1, Math.min(4, Math.round(b * (0.6 + 0.6 * strength))));
}

export function scaleFontSize(base: number, strength: number): number {
  const b = Math.max(8, Math.min(28, Math.floor(base)));
  return Math.max(8, Math.min(28, Math.round(b * (0.75 + 0.4 * strength))));
}

/** Dedup key for multi-scale BOS/MSS that hit the same swing + break. */
export function bosEventDedupeKey(ev: {
  readonly kind: string;
  readonly t1: number;
  readonly t2: number;
  readonly price: number;
}): string {
  const p = Math.round(ev.price * 1e8) / 1e8;
  return `${ev.kind}|${ev.t1}|${ev.t2}|${p}`;
}
