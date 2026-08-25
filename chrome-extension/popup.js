chrome.storage.local.get(["lastSetup", "lastScan"], (d) => {
  document.getElementById("status").textContent = d.lastScan
    ? `Last scan: ${new Date(d.lastScan).toLocaleTimeString()}`
    : "Scanning gold 1m…";
  if (d.lastSetup) {
    const s = d.lastSetup;
    document.getElementById("last").textContent =
      `${s.side} @ ${s.entry?.toFixed(2)}\nSL ${s.sl?.toFixed(2)}\nTP ${s.tp?.toFixed(2)}`;
  }
});
