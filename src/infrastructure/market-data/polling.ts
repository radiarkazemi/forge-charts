import type { Unsubscribe } from "@/application";

/**
 * Run `task` immediately, then again every `intervalMs` measured from the
 * previous *start*. If a request takes longer than `intervalMs`, the next
 * run starts immediately when it finishes (no idle gap) so slow upstreams
 * still refresh as fast as RTT allows.
 */
export function startPolling(task: () => Promise<void>, intervalMs: number): Unsubscribe {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const loop = async () => {
    if (!active) return;
    const started = Date.now();
    try {
      await task();
    } catch {
      /* transient upstream failure — try again next tick */
    }
    if (!active) return;
    const wait = Math.max(0, intervalMs - (Date.now() - started));
    timer = setTimeout(() => void loop(), wait);
  };

  void loop();

  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
