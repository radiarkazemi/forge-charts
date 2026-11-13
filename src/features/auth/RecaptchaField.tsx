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

function loadRecaptcha(attempt = 0): Promise<void> {
  if (grecaptcha()) return Promise.resolve();
  if (scriptPromise && attempt === 0) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // recaptcha.net is Google's endpoint for networks that block google.com.
    script.src = RECAPTCHA_SRC;
    script.async = true;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok) {
        resolve();
        return;
      }
      script.remove();
      scriptPromise = null;
      if (attempt < 2) {
        loadRecaptcha(attempt + 1).then(resolve, reject);
        return;
      }
      reject(new Error("reCAPTCHA failed to load."));
    };
    // A stuck connection never fires onerror. Retry so the checkbox is not a blank bar.
    const timer = window.setTimeout(() => finish(false), 8000);
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

if (typeof document !== "undefined") loadRecaptcha();

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
    loadRecaptcha()
      .then(() => {
        const api = grecaptcha();
        if (cancelled || !host.current || !api) return;
        api.ready(() => {
          if (cancelled || !host.current || host.current.childElementCount > 0) return;
          api.render(host.current, {
            sitekey: siteKey(),
            theme: "dark",
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onErrorRef.current("reCAPTCHA could not be confirmed."),
          });
          onReadyRef.current?.();
        });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current("reCAPTCHA failed to load. Refresh and try again.");
      });
    return () => {
      cancelled = true;
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
