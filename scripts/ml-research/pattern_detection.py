"""
把src/lib/trend/tw/swingPoints.ts + detectBottomPattern.ts的頭肩底/N字底偵測邏輯搬來Python，
常數/演算法都跟TS版本一致（純陣列運算，沒有TW專屬依賴，可以直接套用在美股）。用途是給ML
模型多一個「圖形型態」特徵維度，不是只有統計指標。
"""

PIVOT_CONFIRM_DAYS = 8
LOOKBACK_TRADING_DAYS = 120
MIN_BOUNCE_PCT = 12
MIN_HEAD_DEPTH_PCT = 5
SHOULDER_TOLERANCE_PCT = 12
NECKLINE_TOLERANCE_PCT = 6
NEAR_BREAKOUT_THRESHOLD_PCT = 3
FRESHNESS_TRADING_DAYS = 40
MIN_PRIOR_DECLINE_PCT = 12


def find_swing_points(closes):
    points = []
    n = len(closes)
    for i in range(PIVOT_CONFIRM_DAYS, n - PIVOT_CONFIRM_DAYS):
        window = closes[i - PIVOT_CONFIRM_DAYS : i + PIVOT_CONFIRM_DAYS + 1]
        price = closes[i]
        if price == min(window):
            points.append({"index": i, "price": price, "type": "low"})
        elif price == max(window):
            points.append({"index": i, "price": price, "type": "high"})
    return _alternate(points)


def _alternate(points):
    result = []
    for p in points:
        if not result or result[-1]["type"] != p["type"]:
            result.append(p)
            continue
        last = result[-1]
        more_extreme = p["price"] < last["price"] if p["type"] == "low" else p["price"] > last["price"]
        if more_extreme:
            result[-1] = p
    return result


def _pct_diff(a, b):
    return abs(a - b) / min(a, b) * 100


def _find_most_recent_sequence(swings, types_from_end):
    for end in range(len(swings) - 1, len(types_from_end) - 2, -1):
        matched = True
        for offset in range(len(types_from_end)):
            if swings[end - offset]["type"] != types_from_end[len(types_from_end) - 1 - offset]:
                matched = False
                break
        if matched:
            return end
    return -1


def _has_meaningful_prior_decline(swings, pattern_start_index):
    if pattern_start_index - 1 < 0:
        return False
    prior_high = swings[pattern_start_index - 1]
    if prior_high["type"] != "high":
        return False
    pattern_start_price = swings[pattern_start_index]["price"]
    return (prior_high["price"] - pattern_start_price) / prior_high["price"] * 100 >= MIN_PRIOR_DECLINE_PCT


def _detect_n_shape(swings, latest_index, latest_close):
    end = _find_most_recent_sequence(swings, ["low", "high", "low"])
    if end == -1:
        return None
    if not _has_meaningful_prior_decline(swings, end - 2):
        return None
    first_leg, rebound_high, second_leg = swings[end - 2], swings[end - 1], swings[end]
    if second_leg["price"] <= first_leg["price"]:
        return None
    if (rebound_high["price"] - first_leg["price"]) / first_leg["price"] * 100 < MIN_BOUNCE_PCT:
        return None
    if latest_index - second_leg["index"] > FRESHNESS_TRADING_DAYS:
        return None
    if latest_close < first_leg["price"]:
        return None

    breakout_level = rebound_high["price"]
    if latest_close > breakout_level:
        return {"pattern_type": "nShape", "stage": "confirmed", "breakout_level": breakout_level}
    dist_pct = (breakout_level - latest_close) / breakout_level * 100
    if dist_pct > NEAR_BREAKOUT_THRESHOLD_PCT:
        return None
    return {"pattern_type": "nShape", "stage": "nearBreakout", "breakout_level": breakout_level, "dist_pct": dist_pct}


def _detect_head_shoulders(swings, latest_index, latest_close):
    end = _find_most_recent_sequence(swings, ["low", "high", "low", "high", "low"])
    if end == -1:
        return None
    if not _has_meaningful_prior_decline(swings, end - 4):
        return None
    left_shoulder, neck1, head, neck2, right_shoulder = swings[end - 4 : end + 1]
    if head["price"] >= left_shoulder["price"] * (1 - MIN_HEAD_DEPTH_PCT / 100):
        return None
    if head["price"] >= right_shoulder["price"] * (1 - MIN_HEAD_DEPTH_PCT / 100):
        return None
    if _pct_diff(left_shoulder["price"], right_shoulder["price"]) > SHOULDER_TOLERANCE_PCT:
        return None
    if _pct_diff(neck1["price"], neck2["price"]) > NECKLINE_TOLERANCE_PCT:
        return None
    if latest_index - right_shoulder["index"] > FRESHNESS_TRADING_DAYS:
        return None
    if latest_close < head["price"]:
        return None

    neckline = (neck1["price"] + neck2["price"]) / 2
    if latest_close > neckline:
        return {"pattern_type": "headShoulders", "stage": "confirmed", "breakout_level": neckline}
    dist_pct = (neckline - latest_close) / neckline * 100
    if dist_pct > NEAR_BREAKOUT_THRESHOLD_PCT:
        return None
    return {"pattern_type": "headShoulders", "stage": "nearBreakout", "breakout_level": neckline, "dist_pct": dist_pct}


def detect_bottom_pattern(closes):
    """closes: 日期升序排列的收盤價list，最後一筆是「今天」。回傳None或dict{pattern_type,stage,dist_pct}"""
    windowed = closes[-LOOKBACK_TRADING_DAYS:]
    if len(windowed) < 2 * PIVOT_CONFIRM_DAYS + 1:
        return None
    swings = find_swing_points(windowed)
    latest_index = len(windowed) - 1
    latest_close = windowed[latest_index]

    hs = _detect_head_shoulders(swings, latest_index, latest_close)
    ns = _detect_n_shape(swings, latest_index, latest_close)

    if hs and ns:
        if hs["stage"] == ns["stage"]:
            return hs
        return hs if hs["stage"] == "confirmed" else ns
    return hs or ns
