import type { ChartEngine } from "../engine/ChartEngine";
import { useEngine } from "./useEngine";

const SPEEDS = [0.5, 1, 2, 5, 10];

type Props = {
  engine: ChartEngine | null;
};

/** TradingView-style Bar Replay control strip. */
export function ReplayBar({ engine }: Props) {
  const snap = useEngine(engine);
  if (!snap?.replay) return null;

  const selecting = snap.replaySelecting;
  const dateLabel =
    snap.replayStartIndex != null && snap.last
      ? new Date((snap.last.time || 0) * 1000).toUTCString().replace("GMT", "UTC")
      : selecting
        ? "Select a bar on the chart"
        : "—";

  return (
    <div className="replay-bar tv" role="toolbar" aria-label="Bar Replay">
      <span className="replay-status" title="Bar Replay">
        <b>Replay</b>
        {selecting ? <em>Select starting point</em> : <em>{dateLabel}</em>}
      </span>
      <span className="obj-sep" />
      <button
        type="button"
        className={snap.replayPlaying ? "on" : ""}
        disabled={selecting}
        title="Play / Pause (Shift+↓)"
        onClick={() => engine?.setReplayPlaying(!snap.replayPlaying)}
      >
        {snap.replayPlaying ? "Pause" : "Play"}
      </button>
      <button type="button" disabled={selecting} title="Forward one bar (Shift+→)" onClick={() => engine?.stepReplay()}>
        Forward
      </button>
      <label className="replay-speed">
        Speed
        <select
          value={snap.replaySpeed}
          disabled={selecting}
          onChange={(e) => engine?.setReplaySpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </label>
      <span className="obj-sep" />
      <button type="button" title="Select bar" onClick={() => engine?.beginReplaySelect()}>
        Select bar
      </button>
      <button type="button" title="Random bar" onClick={() => engine?.pickRandomReplayStart()}>
        Random bar
      </button>
      <button type="button" title="Jump to real-time chart" onClick={() => engine?.jumpToRealtime()}>
        Jump to real-time
      </button>
      <button type="button" className="replay-close" title="Close Bar Replay" onClick={() => engine?.setReplay(false)}>
        ×
      </button>
    </div>
  );
}
