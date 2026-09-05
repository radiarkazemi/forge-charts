import { useEffect, useRef, useState } from "react";
import { conditionLabel, type AlertCondition, type AlertTrigger, type PriceAlert } from "../data/alerts";

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
  exchange?: string;
  interval?: string;
  precision: number;
  defaultPrice: number;
  defaultName?: string;
  onCreate: (input: {
    symbol: string;
    exchange?: string;
    interval?: string;
    name: string;
    condition: AlertCondition;
    price: number;
    trigger: AlertTrigger;
    message: string;
    webhookUrl?: string;
  }) => void;
};

export function AlertModal({
  open,
  onClose,
  symbol,
  exchange,
  interval,
  precision,
  defaultPrice,
  defaultName,
  onCreate,
}: Props) {
  const [condition, setCondition] = useState<AlertCondition>("crossing");
  const [price, setPrice] = useState("");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AlertTrigger>("once");
  const [message, setMessage] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const priceRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const p = Number.isFinite(defaultPrice) ? defaultPrice.toFixed(Math.max(0, precision)) : "";
    setCondition("crossing");
    setPrice(p);
    setName(defaultName?.trim() || `${symbol} crossing ${p}`);
    setTrigger("once");
    setMessage("");
    setWebhookUrl("");
    requestAnimationFrame(() => {
      priceRef.current?.focus();
      priceRef.current?.select();
    });
  }, [defaultName, defaultPrice, open, precision, symbol]);

  useEffect(() => {
    if (!open) return;
    const p = price.trim() || "…";
    setName((prev) => {
      // Keep custom names the user typed, but refresh the default-style name.
      if (!prev || prev.startsWith(`${symbol} `)) {
        return `${symbol} ${conditionLabel(condition).toLowerCase()} ${p}`;
      }
      return prev;
    });
  }, [condition, open, price, symbol]);

  if (!open) return null;

  const submit = () => {
    const value = Number(price);
    if (!Number.isFinite(value)) return;
    onCreate({
      symbol,
      exchange,
      interval,
      name: name.trim() || `${symbol} ${condition} ${value}`,
      condition,
      price: value,
      trigger,
      message: message.trim(),
      webhookUrl: webhookUrl.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal alert-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create alert">
        <div className="alert-modal-head">
          <h2>Create alert</h2>
          <button type="button" className="ind-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <p className="hint">
          {symbol}
          {exchange ? ` · ${exchange}` : ""}
          {interval ? ` · ${interval}` : ""}
        </p>

        <label className="row">
          Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}>
            <option value="crossing">Crossing</option>
            <option value="above">Crossing up</option>
            <option value="below">Crossing down</option>
          </select>
        </label>

        <label className="row">
          Price
          <input
            ref={priceRef}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        <label className="row">
          Alert name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="row">
          Trigger
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as AlertTrigger)}>
            <option value="once">Only once</option>
            <option value="every">Every time</option>
          </select>
        </label>

        <label className="row alert-message-row">
          Message
          <input
            value={message}
            placeholder="Optional note"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        <label className="row">
          Webhook URL
          <input
            value={webhookUrl}
            placeholder="https://… (optional POST on fire)"
            onChange={(e) => setWebhookUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        <div className="alert-modal-actions">
          <button type="button" className="primary" onClick={submit} disabled={!Number.isFinite(Number(price))}>
            Create
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function alertStatusText(alert: PriceAlert): string {
  if (!alert.enabled) return alert.fireCount ? "Triggered" : "Paused";
  if (alert.webhookUrl) return "Active · webhook";
  if (alert.drawingId) return "Active · drawing";
  if (alert.indicatorId) return "Active · indicator";
  return "Active";
}
