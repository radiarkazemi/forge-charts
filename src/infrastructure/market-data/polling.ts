import type { Unsubscribe } from "@/application";

/**
 * Run `task` immediately and then every `intervalMs`, skipping ticks while a
 * previous run is still in flight. Errors are swallowed so a flaky upstream
 * does not kill the loop.
 */
export function startPolling(task: () => Promise<void>, intervalMs: number): Unsubscribe {
  let active = true;
  let busy = false;

  const tick = async () => {
    if (!active || busy) return;
    busy = true;
    try {
      await task();
    } catch {
      /* transient upstream failure — try again next tick */
    } finally {
      busy = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
}
