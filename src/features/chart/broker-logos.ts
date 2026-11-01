/** Broker / venue marks shown on the right of each symbol-search row. */

export type BrokerLogoId = "faraz" | "forexcom" | "fxpro" | "fxcm" | "binance" | "other";

export interface BrokerLogo {
  readonly id: BrokerLogoId;
  /** Under Vite `base` (/charts/ in prod) → …/brand/brokers/… */
  readonly src: string;
  readonly label: string;
}

function brokerAsset(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/brokers/${file}`;
}

const BY_EXCHANGE: Record<string, BrokerLogo> = {
  IRAN: { id: "faraz", src: brokerAsset("faraz.svg"), label: "Faraz" },
  FARAZ: { id: "faraz", src: brokerAsset("faraz.svg"), label: "Faraz" },
  FOREXCOM: { id: "forexcom", src: brokerAsset("forexcom.png"), label: "FOREXCOM" },
  FXPRO: { id: "fxpro", src: brokerAsset("fxpro.svg"), label: "FXPRO" },
  FXCM: { id: "fxcm", src: brokerAsset("fxcm.svg"), label: "FXCM" },
  BINANCE: { id: "binance", src: brokerAsset("binance.svg"), label: "Binance" },
};

export function brokerLogoForExchange(exchange: string): BrokerLogo | null {
  const ex = (exchange || "").trim().toUpperCase();
  if (!ex) return null;
  return BY_EXCHANGE[ex] ?? null;
}
