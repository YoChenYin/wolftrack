"""
不用ML模型，改成傳統技術分析的明確規則（黃金/死亡交叉、RSI超賣超買、MACD轉正轉負、頭肩底/
N字底確認）——每個規則各自回測，不訓練任何東西，純粹「這個規則觸發的那些天，後來平均漲跌
多少」，方法論跟這個repo台股那邊buyDip/戰術訊號的backtestWalkForward.ts一致：只記錄anchor
day（訊號剛觸發那天，不是持續符合的每一天都算，避免同一段訊號被算成好幾筆重疊樣本）。

因為這裡不是ML模型（沒有訓練/測試的問題，規則是寫死的、不會過擬合訓練資料），不需要
walk-forward切分——直接用全部歷史回測，這是規則型策略backtest的標準做法。
"""

import json

import numpy as np

from train_and_backtest import HORIZONS, load
from train_pooled import UNIVERSE, build_panel

HORIZON_COLS = {h: f"target_ret_{h}d" for h in HORIZONS}


def anchor_days(series):
    """今天True、昨天False（或是series第一筆）才算anchor day，避免持續符合的每一天都重複計入"""
    prev = series.shift(1).fillna(False)
    return series & ~prev


def build_rules(panel):
    """groupby+shift要在各ticker內分開做，不能跨股票邊界比較「昨天」——每個布林狀態欄位
    各自transform(anchor_days)，確保只在同一檔股票的時間序列內找「今天True昨天False」。"""
    panel = panel.sort_values(["ticker", "date"]).reset_index(drop=True)
    tmp = panel.copy()
    tmp["_bullish"] = panel["ma_arrangement_bullish"].astype(bool)
    tmp["_bearish"] = panel["ma_arrangement_bearish"].astype(bool)
    tmp["_rsi_oversold"] = panel["rsi14"] < 30
    tmp["_rsi_overbought"] = panel["rsi14"] > 70
    tmp["_macd_pos"] = panel["macd_hist"] > 0
    tmp["_macd_neg"] = panel["macd_hist"] < 0
    tmp["_bottom_confirmed"] = panel["bottom_pattern_confirmed"].astype(bool)

    return {
        "golden_cross_ma_bullish": tmp.groupby("ticker")["_bullish"].transform(anchor_days),
        "death_cross_ma_bearish": tmp.groupby("ticker")["_bearish"].transform(anchor_days),
        "rsi_oversold_cross": tmp.groupby("ticker")["_rsi_oversold"].transform(anchor_days),
        "rsi_overbought_cross": tmp.groupby("ticker")["_rsi_overbought"].transform(anchor_days),
        "macd_bullish_cross": tmp.groupby("ticker")["_macd_pos"].transform(anchor_days),
        "macd_bearish_cross": tmp.groupby("ticker")["_macd_neg"].transform(anchor_days),
        "bottom_pattern_confirmed": tmp.groupby("ticker")["_bottom_confirmed"].transform(anchor_days),
    }


def round2(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 3)


def evaluate_rule(panel, mask, baseline_means):
    result = {}
    n_total = int(mask.sum())
    if n_total == 0:
        return {"sample_size": 0}
    for h in HORIZONS:
        col = HORIZON_COLS[h]
        values = panel.loc[mask, col].dropna()
        if len(values) == 0:
            result[f"{h}d"] = {"sample_size": 0}
            continue
        win_rate = float((values > 0).mean())
        avg_ret = float(values.mean())
        median_ret = float(values.median())
        baseline = baseline_means[h]
        result[f"{h}d"] = {
            "sample_size": int(len(values)),
            "win_rate": round2(win_rate),
            "avg_return_pct": round2(avg_ret * 100),
            "median_return_pct": round2(median_ret * 100),
            "baseline_avg_return_pct": round2(baseline * 100),
            "excess_return_pct": round2((avg_ret - baseline) * 100),
        }
    result["sample_size"] = n_total
    return result


def main():
    spy = load("SPY")
    spy_close_by_date = spy.set_index("date")["close"]
    panel = build_panel(UNIVERSE, spy_close_by_date)

    # 基準：不管任何規則，全部股票全部歷史天數的平均未來N日報酬率（無條件基準）
    baseline_means = {h: panel[HORIZON_COLS[h]].dropna().mean() for h in HORIZONS}

    rules_masks = build_rules(panel)

    report = {"baseline_unconditional_avg_return_pct": {f"{h}d": round2(baseline_means[h] * 100) for h in HORIZONS}}
    for name, mask in rules_masks.items():
        report[name] = evaluate_rule(panel, mask.fillna(False), baseline_means)

    print(json.dumps(report, indent=2, default=str))
    with open("scripts/ml-research/report_technical_rules.json", "w") as f:
        json.dump(report, f, indent=2, default=str)


if __name__ == "__main__":
    main()
