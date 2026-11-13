import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";

/**
 * Google's public test key. It renders a real checkbox widget on any domain.
 * Set VITE_RECAPTCHA_SITE_KEY to a key registered for forgechart.ir to replace it.
 */
const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

function siteKey(): string {
  const configured = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  return typeof configured === "string" && configured.trim() ? configured.trim() : TEST_SITE_KEY;
}

interface Grecaptcha {
  ready(callback: () => void): void;
  render(element: HTMLElement, options: Record<string, unknown>): number;
}

function grecaptcha(): Grecaptcha | undefined {
  return (window as Window & { grecaptcha?: Grecaptcha }).grecaptcha;
}

const RECAPTCHA_SRC = "https://www.recaptcha.net/recaptcha/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;
let widgetHolder: HTMLDivElement | null = null;
let widgetReady: Promise<void> | null = null;
let onTokenListener: (token: string | null) => void = () => {};
let onErrorListener: (message: string) => void = () => {};

function recaptchaScript(): HTMLScriptElement | null {
  return document.querySelector('script[src*="recaptcha.net/recaptcha/api.js"]');
}

function loadRecaptcha(): Promise<void> {
  if (grecaptcha()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const existing = recaptchaScript();
  scriptPromise = new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    let settled = false;
    let watch = 0;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearInterval(watch);
      if (ok || grecaptcha()) {
        resolve();
        return;
      }
      scriptPromise = null;
      reject(new Error("reCAPTCHA failed to load."));
    };
    watch = window.setInterval(() => {
      if (grecaptcha()) finish(true);
    }, 40);
    script.addEventListener("load", () => finish(true), { once: true });
    script.addEventListener("error", () => finish(false), { once: true });
    if (!existing) {
      // recaptcha.net is Google's endpoint for networks that block google.com.
      // Leave a slow download running — aborting it and starting over showed up as a long spinner.
      script.src = RECAPTCHA_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

/** One widget for the whole page. StrictMode remounts must not render a second checkbox. */
function ensureWidget(): Promise<void> {
  if (widgetHolder?.querySelector("iframe")) return Promise.resolve();
  if (widgetReady) return widgetReady;
  widgetHolder = document.createElement("div");
  widgetHolder.style.cssText = "position:fixed;left:-600px;top:0;width:304px;height:78px";
  document.body.appendChild(widgetHolder);
  widgetReady = loadRecaptcha().then(() => {
    const api = grecaptcha();
    const holder = widgetHolder;
    if (!api || !holder) throw new Error("reCAPTCHA failed to load.");
    return new Promise<void>((resolve) => {
      api.ready(() => {
        if (holder.childElementCount > 0) {
          resolve();
          return;
        }
        api.render(holder, {
          sitekey: siteKey(),
          theme: "dark",
          callback: (token: string) => onTokenListener(token),
          "expired-callback": () => onTokenListener(null),
          "error-callback": () => onErrorListener("reCAPTCHA could not be confirmed."),
        });
        resolve();
      });
    });
  });
  return widgetReady;
}

interface RecaptchaFieldProps {
  readonly onToken: (token: string | null) => void;
  readonly onError: (message: string) => void;
  readonly onReady?: () => void;
}

/** Official reCAPTCHA v2 checkbox. Submit stays blocked until Google accepts it. */
export function RecaptchaField({ onToken, onError, onReady }: RecaptchaFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    onTokenListener = (token) => onTokenRef.current(token);
    onErrorListener = (message) => onErrorRef.current(message);
    ensureWidget()
      .then(() => {
        const hostEl = host.current;
        if (cancelled || !hostEl || !widgetHolder) return;
        widgetHolder.style.cssText = "width:304px;height:78px";
        hostEl.appendChild(widgetHolder);
        onReadyRef.current?.();
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current("reCAPTCHA failed to load. Refresh and try again.");
      });
    return () => {
      cancelled = true;
      if (widgetHolder) {
        widgetHolder.style.cssText = "position:fixed;left:-600px;top:0;width:304px;height:78px;pointer-events:none";
        document.body.appendChild(widgetHolder);
      }
    };
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: 78,
        display: "flex",
        justifyContent: "center",
        "& > div": { transformOrigin: "center top" },
      }}
    >
      <div ref={host} />
    </Box>
  );
}
