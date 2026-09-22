import type { Notification as AppNotification, Notifier } from "@/application";

/** Uses the Web Notifications API when the user has granted permission. */
export class BrowserNotifier implements Notifier {
  private get api(): typeof Notification | null {
    return typeof window !== "undefined" && "Notification" in window ? window.Notification : null;
  }

  async requestPermission(): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    if (api.permission === "granted") return true;
    if (api.permission === "denied") return false;
    return (await api.requestPermission()) === "granted";
  }

  notify({ title, body }: AppNotification): void {
    const api = this.api;
    if (!api || api.permission !== "granted") return;
    try {
      new api(title, { body });
    } catch {
      /* some browsers throw outside a service worker */
    }
  }
}
