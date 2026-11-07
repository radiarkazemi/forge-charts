# Trading Handbook → Forge indicator map

Source (public): https://trading-handbook-lesson-3-3.radiar.chatgpt.site/  
PDF: https://trading-handbook-lesson-3-3.radiar.chatgpt.site/trading-handbook.pdf  
Persian edition through lesson 3.6 (55 pages).

## Dealing Range (قسمت ۱)

- A dealing range is the price span between an effective low and high chosen for reading the market (not only ranging markets).
- Bullish: origin = swing low, end = resulting high → `L` / `H`.
- Bearish: origin = swing high, end = resulting low.
- `EQ = (H + L) / 2` · Discount = below mid · Premium = above mid.
- Prefer wick extremes for borders; do not treat a still-expanding leg as a finalized range.

Forge: **Dealing Ranges** study (green discount / red premium halves).

## Structure (قسمت ۲)

- “Market Structure = Tracking Dealing Ranges.”
- **BOS** = continuation break of an effective extreme.
- **MSS** = structure direction change on the selected scale.
- Confirm with close vs wick per study inputs.

Forge: **BOS / MSS**, **Real Swing High/Low**, **Fractal**.

## Liquidity · IRL / ERL (قسمت ۳ · درس‌های نقدینگی)

Glossary (p.53–54):

| Term | Meaning in this handbook |
|------|---------------------------|
| **BSL / SSL** | Buy-side / sell-side liquidity (usually above a high / below a low) |
| **ERL** | External range liquidity — related to the **outer edges** of the chosen dealing range |
| **IRL** | Internal range liquidity — levels / zones **inside** that range |
| **EQH / EQL** | Nearby equal highs / equal lows (lesson 3.3 level types; often IRL when inside the DR) |
| **IRL → ERL** | Expansion: price leaves an internal area toward an outer edge |
| **ERL → IRL** | Correction: after the outer area, pullback into internal swings |
| **ERL → ERL** | Range oscillation edge-to-edge, or external path with MSS |

Important (p.25): the **same price** can be ERL vs a small range and IRL vs a larger range — always fix the reference dealing range + timeframe.

Forge: **IRL / ERL** study (`IrlErlLiquidity@tv-basicstudies-4`)

- Picks **one active dealing range** by default (largest that still contains last close).
- Draws **ERL+ / ERL−** only on that range’s outer high / low.
- Internal pivots are searched **between the two extremes** (and while price stays in-box) — not only after confirmation.
- Draws **EQH / EQL** for equal internal pivots (lesson 3.3), and **IRL+ / IRL−** for the strongest remaining internal swings.
- Nested micro-ranges are dropped so their edges are not mis-labeled as ERL.

Forge: **Dealing Ranges** also hides nested boxes by default (`hideNested`).
