#!/usr/bin/env bash
# Re-apply TradingView-matching labels on Charting Library drawing flyout.
# Safe to re-run. Requires public/charting_library present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLES="$ROOT/public/charting_library/bundles"
TB="$BUNDLES/drawing-toolbar.ae90b75d73d48a9b8e94.js"

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
print("ok")
PY
