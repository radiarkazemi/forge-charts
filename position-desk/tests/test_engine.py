import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine import Bar, Position, Quote, analyze, efficiency_ratio, resample


def series(closes, *, start=1_700_000_000, step=300, wick=0.2, volume=100, bullish_volume=True):
    bars = []
    prev = closes[0]
    for index, close in enumerate(closes):
        high = max(prev, close) + wick
        low = min(prev, close) - wick
        up = close >= prev
        vol = volume * (1.8 if up else 0.6) if bullish_volume else volume
        bars.append(Bar(start + index * step, prev, high, low, close, vol))
        prev = close
    return bars


def leg(closes, start, end, steps):
    for index in range(steps):
        closes.append(start + (end - start) * index / max(1, steps - 1))


def wave():
    closes = []
    leg(closes, 100, 112, 14)
    leg(closes, 111.2, 105, 8)
    leg(closes, 105.4, 120, 16)
    leg(closes, 119.4, 110, 8)
    return closes


def swing_book():
    """Explicit fractal highs and lows a 2-bar pivot can confirm."""
    count = 48
    close = [110.0] * count
    high = [110.2] * count
    low = [109.8] * count
    volume = [100.0] * count

    def stamp_high(index, level):
        close[index] = level - 0.15
        high[index] = level
        low[index] = level - 1.2
        volume[index] = 220
        for step, drop in ((1, 2.4), (2, 3.6)):
            for sign in (-1, 1):
                at = index + sign * step
                close[at] = level - drop
                high[at] = level - drop + 0.25
                low[at] = level - drop - 0.35

    def stamp_low(index, level):
        close[index] = level + 0.12
        low[index] = level
        high[index] = level + 0.35
        volume[index] = 80
        for step, lift in ((1, 0.8), (2, 1.3)):
            for sign in (-1, 1):
                at = index + sign * step
                close[at] = level + lift
                high[at] = level + lift + 0.25
                low[at] = level + lift - 0.2

    for index, level in ((8, 108.0), (20, 116.0), (32, 124.0)):
        stamp_high(index, level)
    for index, level in ((14, 102.0), (26, 108.0), (38, 114.0)):
        stamp_low(index, level)
    for index in range(41, count):
        close[index] = 117.2
        high[index] = 117.55
        low[index] = 116.9
        volume[index] = 240
    bars = []
    for index in range(count):
        open_ = min(close[index] - 0.08, high[index] - 0.02)
        open_ = max(low[index] + 0.02, open_)
        bars.append(Bar(1_700_000_000 + index * 300, open_, high[index], low[index], close[index], volume[index]))
    return bars


class EngineTests(unittest.TestCase):
    def test_efficiency_of_a_straight_line_is_one(self):
        self.assertEqual(efficiency_ratio([float(i) for i in range(20)], 10), 1.0)

    def test_resample_builds_higher_timeframe_ohlc(self):
        start = 1_700_000_100
        self.assertEqual(start % 180, 0)
        bars = series([100, 101, 99, 102, 103, 101], start=start, step=60)
        higher = resample(bars, 180)
        self.assertEqual(len(higher), 2)
        self.assertEqual(higher[0].open, 100)
        self.assertEqual(higher[0].close, 99)
        self.assertAlmostEqual(higher[0].high, 101.2)
        self.assertAlmostEqual(higher[0].low, 98.8)

    def test_warming_until_there_are_enough_bars(self):
        bars = series([100 + i * 0.1 for i in range(12)])
        desk = analyze({"M5": bars}, Quote(0, 101, 101.1), Position("flat"), feed_age_sec=0)
        self.assertEqual(desk["verdict"], "WARMING")

    def test_clean_long_location_passes(self):
        bars = swing_book()
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.01),
            Position("long", entry=price, stop=price - 4.5, target=price + 9),
            digits=2,
            feed_age_sec=1,
        )
        self.assertEqual(desk["verdict"], "SEAT_OK", f"{desk['summary']}\n{desk['reasons']}\n{desk['metrics']}")
        self.assertEqual(desk["metrics"]["structure"], 1)
        self.assertTrue(desk["metrics"]["dealing_eq"])
        self.assertNotIn("flow", desk["summary"])
        self.assertIn("not enough completed swings", desk["summary"])
        self.assertIsNone(desk["metrics"]["heat_p70_atr"])

    def test_delta_and_a_wide_stop_are_not_enough(self):
        bars = series([100 + i * 0.15 for i in range(80)], wick=0.02)
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.01),
            Position("long", entry=price, stop=price - 1.5, target=price + 3),
            feed_age_sec=1,
        )
        self.assertNotEqual(desk["verdict"], "SEAT_OK", desk["summary"])

    def test_price_through_the_stop_breaks_the_thesis(self):
        closes = [100 + (i % 7) * 0.2 for i in range(80)]
        bars = series(closes, wick=0.3, bullish_volume=False)
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.02),
            Position("long", entry=price + 1, stop=price + 0.4),
            feed_age_sec=1,
        )
        self.assertEqual(desk["verdict"], "THESIS_BROKEN")

    def test_stop_inside_heat_asks_for_a_review(self):
        bars = series(wave(), wick=0.4)
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.01),
            Position("long", entry=price, stop=price - 0.05),
            feed_age_sec=1,
        )
        self.assertEqual(desk["verdict"], "REVIEW_STOP", desk["summary"])

    def test_extended_long_is_not_a_chase_entry(self):
        closes = [100.0] * 70 + [100.2, 100.1, 108, 112, 118]
        bars = series(closes, wick=0.05, volume=50, bullish_volume=False)
        for index, bar in enumerate(bars):
            if index >= len(bars) - 3:
                bars[index] = Bar(bar.time, bar.open, bar.high, bar.low, bar.close, 40)
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.02),
            Position("long", entry=price - 0.2, stop=price - 2.5),
            feed_age_sec=1,
        )
        self.assertEqual(desk["verdict"], "DO_NOT_CHASE", f"z={desk['metrics'].get('vwap_z')} {desk['summary']}")

    def test_chop_with_no_position_stands_aside(self):
        closes = [100 + (0.4 if i % 2 == 0 else -0.4) for i in range(90)]
        bars = series(closes, wick=0.15, bullish_volume=False)
        price = bars[-1].close
        desk = analyze(
            {"M5": bars},
            Quote(bars[-1].time, price, price + 0.01),
            Position("flat"),
            feed_age_sec=1,
        )
        self.assertEqual(desk["verdict"], "STAND_ASIDE", desk["summary"])


if __name__ == "__main__":
    unittest.main()
