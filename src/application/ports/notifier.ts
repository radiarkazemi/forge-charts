export interface Notification {
  readonly title: string;
  readonly body: string;
}

/** Out-of-app notification channel (system notifications, sound, …). */
export interface Notifier {
  requestPermission(): Promise<boolean>;
  notify(notification: Notification): void;
}
