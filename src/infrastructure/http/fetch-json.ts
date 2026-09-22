export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 160)}` : ""}`);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** `fetch` + JSON parsing + timeout, throwing `HttpError` for non-2xx responses. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(url, { headers: options.headers, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(response.status, url, body);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}
