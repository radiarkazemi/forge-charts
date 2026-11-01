/** Broker / venue marks shown on the right of each symbol-search row. */

export type BrokerLogoId = "faraz" | "forexcom" | "fxpro" | "fxcm" | "binance" | "other";

export interface BrokerLogo {
  readonly id: BrokerLogoId;
  /** Served from /brand/brokers/… (copied into dist on build). */
  readonly src: string;
  readonly label: string;
}

const BY_EXCHANGE: Record<string, BrokerLogo> = {
  IRAN: { id: "faraz", src: "/brand/brokers/faraz.svg", label: "Faraz" },
  FARAZ: { id: "faraz", src: "/brand/brokers/faraz.svg", label: "Faraz" },
  FOREXCOM: { id: "forexcom", src: "/brand/brokers/forexcom.png", label: "FOREXCOM" },
  FXPRO: { id: "fxpro", src: "/brand/brokers/fxpro.svg", label: "FXPRO" },
  FXCM: { id: "fxcm", src: "/brand/brokers/fxcm.svg", label: "FXCM" },
  BINANCE: { id: "binance", src: "/brand/brokers/binance.svg", label: "Binance" },
};

export function brokerLogoForExchange(exchange: string): BrokerLogo | null {
  const ex = (exchange || "").trim().toUpperCase();
  if (!ex) return null;
  return BY_EXCHANGE[ex] ?? null;
}
