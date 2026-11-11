/**
 * Catalog of Forge custom studies for the Indicators dialog.
 * `studyId` is what Charting Library createStudy expects for custom indicators.
 */

import { BOS_MSS_STUDY_ID, BOS_MSS_STUDY_NAME } from "./bos-mss-indicator";
import { OB_CISD_STUDY_ID, OB_CISD_STUDY_NAME } from "./order-block-cisd-indicator";
import { DEALING_RANGES_STUDY_ID, DEALING_RANGES_STUDY_NAME } from "./dealing-ranges-indicator";
import { FRACTAL_IGOR_STUDY_ID, FRACTAL_IGOR_STUDY_NAME } from "./fractal-igor-indicator";
import { CERTAINTY_STUDY_ID, CERTAINTY_STUDY_NAME } from "./forge-certainty-indicator";
import { FTA_STUDY_ID, FTA_STUDY_NAME } from "./forge-trading-assistant-indicator";
import { HTF_CANDLES_STUDY_ID, HTF_CANDLES_STUDY_NAME } from "./htf-candles-indicator";
import { IRL_ERL_STUDY_ID, IRL_ERL_STUDY_NAME } from "./irl-erl-indicator";
import { REAL_SWINGS_STUDY_ID, REAL_SWINGS_STUDY_NAME } from "./real-swings-indicator";
import { REPLAY_MENTOR_STUDY_ID, REPLAY_MENTOR_STUDY_NAME } from "./replay-mentor-indicator";
import { SESSIONS_STUDY_ID, SESSIONS_STUDY_NAME } from "./sessions-indicator";
import { SI_STUDY_ID, SI_STUDY_NAME } from "./structure-intelligence-indicator";
import { WATERMARK_STUDY_ID, WATERMARK_STUDY_NAME } from "./watermark-indicator";

export type IndicatorNavId =
  | "favorites"
  | "myScripts"
  | "technicals"
  | "editorsPicks"
  | "top"
  | "trending";

export interface ForgeIndicatorEntry {
  readonly id: string;
  readonly name: string;
  /** createStudy target (metainfo id for custom studies). */
  readonly studyId: string;
  readonly author: string;
  readonly shortDescription: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  /** Soft popularity label for TV-like list (display only). */
  readonly usesLabel: string;
  readonly section: "forge" | "builtin";
}

/** Built-in CL studies we surface alongside Forge scripts. */
export const BUILTIN_INDICATORS: readonly ForgeIndicatorEntry[] = [
  {
    id: "builtin-volume",
    name: "Volume",
    studyId: "Volume",
    author: "TradingView",
    shortDescription: "Volume histogram",
    tags: ["volume", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-sma",
    name: "Moving Average",
    studyId: "Moving Average",
    author: "TradingView",
    shortDescription: "Simple moving average",
    tags: ["ma", "sma", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-ema",
    name: "Moving Average Exponential",
    studyId: "Moving Average Exponential",
    author: "TradingView",
    shortDescription: "EMA",
    tags: ["ema", "ma", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-rsi",
    name: "Relative Strength Index",
    studyId: "Relative Strength Index",
    author: "TradingView",
    shortDescription: "RSI",
    tags: ["rsi", "momentum", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-macd",
    name: "MACD",
    studyId: "MACD",
    author: "TradingView",
    shortDescription: "MACD",
    tags: ["macd", "momentum", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-bb",
    name: "Bollinger Bands",
    studyId: "Bollinger Bands",
    author: "TradingView",
    shortDescription: "Bollinger Bands",
    tags: ["bb", "bands", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-atr",
    name: "Average True Range",
    studyId: "Average True Range",
    author: "TradingView",
    shortDescription: "ATR",
    tags: ["atr", "volatility", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
  {
    id: "builtin-williams-fractal",
    name: "Williams Fractal",
    studyId: "Williams Fractal",
    author: "TradingView",
    shortDescription: "Williams fractal markers",
    tags: ["fractal", "williams", "technicals"],
    favorite: false,
    usesLabel: "—",
    section: "builtin",
  },
] as const;

export const FORGE_INDICATORS: readonly ForgeIndicatorEntry[] = [
  {
    id: "forge-ob-cisd",
    name: OB_CISD_STUDY_NAME,
    studyId: OB_CISD_STUDY_ID,
    author: "Forge",
    shortDescription: "Order block · dashed CISD level",
    tags: ["orderblock", "ob", "cisd", "ict", "smc"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-bos-mss",
    name: BOS_MSS_STUDY_NAME,
    studyId: BOS_MSS_STUDY_ID,
    author: "Forge",
    shortDescription: "BOS+ · BOS- · MSS+ · MSS-",
    tags: ["bos", "mss", "structure", "ict"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-irl-erl",
    name: IRL_ERL_STUDY_NAME,
    studyId: IRL_ERL_STUDY_ID,
    author: "Forge",
    shortDescription: "Internal & external range liquidity",
    tags: ["irl", "erl", "liquidity", "ict"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-real-swings",
    name: REAL_SWINGS_STUDY_NAME,
    studyId: REAL_SWINGS_STUDY_ID,
    author: "Forge",
    shortDescription: "Styleable swing high / low markers",
    tags: ["swing", "hl", "structure"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-fractal",
    name: FRACTAL_IGOR_STUDY_NAME,
    studyId: FRACTAL_IGOR_STUDY_ID,
    author: "Forge",
    shortDescription: "Chart Champions fractal swings",
    tags: ["fractal", "igor", "swing"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-dr",
    name: DEALING_RANGES_STUDY_NAME,
    studyId: DEALING_RANGES_STUDY_ID,
    author: "Forge",
    shortDescription: "ICT dealing ranges · 0 / 0.5 / 1",
    tags: ["dealing", "range", "dr", "ict", "ote"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-si",
    name: SI_STUDY_NAME,
    studyId: SI_STUDY_ID,
    author: "Forge",
    shortDescription: "Structure Intelligence POI 1:3",
    tags: ["structure", "poi", "si", "fvg", "ob"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-sessions",
    name: SESSIONS_STUDY_NAME,
    studyId: SESSIONS_STUDY_ID,
    author: "Forge",
    shortDescription: "Asia · London · New York sessions",
    tags: ["sessions", "asia", "london", "ny"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-htf",
    name: HTF_CANDLES_STUDY_NAME,
    studyId: HTF_CANDLES_STUDY_ID,
    author: "Forge",
    shortDescription: "Fadi-style HTF candles (6 TF)",
    tags: ["htf", "candles", "ict", "fadi"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-fta",
    name: FTA_STUDY_NAME,
    studyId: FTA_STUDY_ID,
    author: "Forge",
    shortDescription: "Texas · Manual Buy/Sell · Stop entry",
    tags: ["assistant", "buy", "sell", "texas"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-certainty",
    name: CERTAINTY_STUDY_NAME,
    studyId: CERTAINTY_STUDY_ID,
    author: "Forge",
    shortDescription: "Certainty · SI POI · DR bias · 1:3",
    tags: ["certainty", "signal", "dr", "si"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-mentor",
    name: REPLAY_MENTOR_STUDY_NAME,
    studyId: REPLAY_MENTOR_STUDY_ID,
    author: "Forge",
    shortDescription: "Beginner ICT overlays for replay",
    tags: ["mentor", "replay", "ict", "fvg"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
  {
    id: "forge-watermark",
    name: WATERMARK_STUDY_NAME,
    studyId: WATERMARK_STUDY_ID,
    author: "Forge",
    shortDescription: "Chart watermark title / subtitle",
    tags: ["watermark", "brand"],
    favorite: true,
    usesLabel: "Forge",
    section: "forge",
  },
] as const;

export const ALL_INDICATORS: readonly ForgeIndicatorEntry[] = [
  ...FORGE_INDICATORS,
  ...BUILTIN_INDICATORS,
];
