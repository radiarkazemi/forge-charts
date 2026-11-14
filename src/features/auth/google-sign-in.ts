/** Google Identity Services — public client id only, never a client secret. */

export interface GoogleProfile {
  readonly email: string;
  readonly name: string;
  readonly sub: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number | boolean>): void;
}

interface TokenInfo {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  sub?: string;
}

function googleApi(): GoogleIdApi | null {
  const google = (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google;
  return google?.accounts?.id ?? null;
}

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (googleApi()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not reach Google. Try again."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let initialized = false;
let onCredential: (jwt: string) => void = () => {};

/** Paint Google's button into `host`. The click returns an ID token to `onJwt`. */
export async function mountGoogleButton(
  host: HTMLElement,
  width: number,
  onJwt: (jwt: string) => void,
): Promise<void> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in is not configured for this site.");
  await loadGoogleScript();
  const api = googleApi();
  if (!api) throw new Error("Could not reach Google. Try again.");
  onCredential = onJwt;
  if (!initialized) {
    api.initialize({
      client_id: clientId,
      auto_select: false,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
    });
    initialized = true;
  }
  host.replaceChildren();
  api.renderButton(host, {
    type: "standard",
    theme: "filled_black",
    size: "medium",
    text: "continue_with",
    shape: "pill",
    width,
    logo_alignment: "center",
  });
}

/** Confirm the ID token with Google and return the verified profile. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in is not configured for this site.");
  const body = new URLSearchParams({ id_token: idToken });
  let data: TokenInfo;
  try {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) throw new Error("Google could not confirm this sign-in.");
    data = (await res.json()) as TokenInfo;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Google")) throw err;
    throw new Error("Could not reach Google. Try again.");
  }
  const iss = data.iss ?? "";
  const issuerOk = iss === "accounts.google.com" || iss === "https://accounts.google.com";
  const verified = data.email_verified === true || data.email_verified === "true";
  const email = (data.email ?? "").trim().toLowerCase();
  const sub = (data.sub ?? "").trim();
  if (!issuerOk || data.aud !== clientId || !verified || !email || !sub) {
    throw new Error("Google could not confirm this sign-in.");
  }
  const name = (data.name ?? "").trim() || email.split("@")[0] || email;
  return { email, name: name.slice(0, 48), sub };
}
