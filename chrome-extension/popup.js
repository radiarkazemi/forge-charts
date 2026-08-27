function fmt(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";
}

function render(d) {
  const statusEl = document.getElementById("status");
  const errEl = document.getElementById("err");
  if (d.status === "error") {
    statusEl.textContent = "Error";
    errEl.hidden = false;
    errEl.textContent = d.error || "Scan failed";
  } else {
    statusEl.textContent = d.status === "ok" ? "Armed" : "Starting…";
    errEl.hidden = true;
  }

  document.getElementById("feed").textContent = d.dataSource
    ? `FOREXCOM · ${d.dataSource.replace(/^https?:\/\//, "").split("/")[0]}`
    : "FOREXCOM VPS";
  document.getElementById("price").textContent = fmt(d.lastPrice);
  document.getElementById("scan").textContent = d.lastScan
    ? new Date(d.lastScan).toLocaleTimeString()
    : "—";

  if (d.lastSetup) {
    const s = d.lastSetup;
    const side = document.getElementById("side");
    side.textContent = `TRH ${s.side}`;
    side.className = "side" + (s.side === "SHORT" ? " short" : "");
    document.getElementById("entry").textContent = fmt(s.entry);
    document.getElementById("sl").textContent = fmt(s.sl);
    document.getElementById("tp").textContent = fmt(s.tp);
  }
}

chrome.storage.local.get(
  ["lastSetup", "lastScan", "lastPrice", "dataSource", "status", "error"],
  render,
);

document.getElementById("scanBtn").addEventListener("click", () => {
  document.getElementById("status").textContent = "Scanning…";
  chrome.runtime.sendMessage({ type: "scan-now" }, () => {
    chrome.storage.local.get(
      ["lastSetup", "lastScan", "lastPrice", "dataSource", "status", "error"],
      render,
    );
  });
});
