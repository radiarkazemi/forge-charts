#!/usr/bin/env bash
# Re-apply TradingView-matching labels + Long/Short icons on Charting Library.
# Safe to re-run. Requires public/charting_library present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLES="$ROOT/public/charting_library/bundles"
TB="$BUNDLES/drawing-toolbar.ae90b75d73d48a9b8e94.js"
ICONS="$BUNDLES/line-tools-icons.6270f97faffd65a49d40.js"

python3 - <<PY
from pathlib import Path
import re

tb = Path("$TB")
text = tb.read_text()
old = '{title:n.t(null,void 0,o(75747)),items:[{name:"LineToolRiskRewardLong"'
new = '{title:"Forecasting",items:[{name:"LineToolRiskRewardLong"'
if old in text:
    tb.write_text(text.replace(old, new, 1))
    print("drawing-toolbar: Forecasting section")
elif 'title:"Forecasting"' in text:
    print("drawing-toolbar: already patched")
else:
    raise SystemExit("drawing-toolbar pattern missing")

renames = {
    "en.9488.2f156b47fe84118759c5.js": {
        "75747": "Sector",
        "20138": "Position forecast",
        "74832": "Long position",
        "8075": "Short position",
        "81994": "Bars pattern",
        "46808": "Ghost feed",
        "25705": "Fixed range volume profile",
        "68941": "Price range",
        "85444": "Date range",
        "47017": "Date and price range",
    },
    "en.2134.fb8463bf93e547b8a24f.js": {"97050": "Measurers"},
    "en.4211.932ffa2dc04657916b72.js": {"97050": "Measurers"},
}
for fname, idmap in renames.items():
    p = Path("$BUNDLES") / fname
    t = p.read_text()
    for mid, label in idmap.items():
        pat = rf'({mid}:e=>\{{e\.exports=\{{en:\[\")[^\"]+(\"\]\}})'
        nt, n = re.subn(pat, rf"\g<1>{label}\2", t, count=1)
        if n != 1:
            raise SystemExit(f"failed {fname} id {mid}")
        t = nt
        print(f"{fname}:{mid} -> {label}")
    p.write_text(t)

# Long / Short position icons → TradingView L/S artwork
LONG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path fill="currentColor" d="M8.75 14.25h1.2v5.1H14.6v1.15H8.75z"/></svg>'
SHORT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M5.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 9.5A2.5 2.5 0 0 1 7.95 9h12.1a2.5 2.5 0 1 1 0 1H7.95A2.5 2.5 0 0 1 3 9.5zM22.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/><path fill="currentColor" d="M12.35 14.1c-1.55 0-2.7.72-2.95 1.85l1.12.35c.18-.55.72-.95 1.75-.95.95 0 1.55.4 1.55 1.05 0 .55-.4.9-1.35 1.2l-.85.28c-1.45.48-2.25 1.2-2.25 2.4 0 1.4 1.2 2.3 3 2.3 1.5 0 2.65-.65 2.95-1.8l-1.15-.35c-.22.6-.85 1-1.82 1-1.05 0-1.72-.45-1.72-1.15 0-.55.38-.9 1.32-1.2l.9-.3c1.55-.52 2.35-1.25 2.35-2.55 0-1.5-1.25-2.38-3.05-2.38z"/></svg>'
icons = Path("$ICONS")
it = icons.read_text()
it2, n1 = re.subn(r"70802:l=>\{l\.exports='<svg[^']+</svg>'\}", f"70802:l=>{{l.exports='{LONG}'}}", it, count=1)
it3, n2 = re.subn(r"10568:l=>\{\nl\.exports='<svg[^']+</svg>'\}", f"10568:l=>{{\nl.exports='{SHORT}'}}", it2, count=1)
if n2 == 0:
    it3, n2 = re.subn(r"10568:l=>\{l\.exports='<svg[^']+</svg>'\}", f"10568:l=>{{l.exports='{SHORT}'}}", it2, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f"icon patch failed long={n1} short={n2}")
icons.write_text(it3)
print("line-tools-icons: Long/Short → L/S")
print("ok")
PY
