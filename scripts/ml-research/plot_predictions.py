"""
把pooled模型（train_pooled.py）在walk-forward每個fold的樣本外預測，跟MU/NVDA的實際股價/
實際報酬畫成圖——量化指標已經證實模型沒有打贏順勢基準，這裡是「眼見為憑」的視覺化版本，
同一批模型/同一套walk-forward切分，只是這次把逐筆預測存下來畫圖，不是只看聚合指標。

用法：python3 scripts/ml-research/plot_predictions.py [horizon]  # 預設20天
輸出：scripts/ml-research/charts/{ticker}_{horizon}d.png（每個目標股票各一張，2個子圖：
  上圖=實際收盤價，樣本外測試期間用底色標出、每個預測點依「猜對/猜錯方向」上色；
  下圖=預測報酬率 vs 實際報酬率，同一時間軸疊圖）
"""

import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# 預設字型（DejaVu Sans）沒有中文字形，圖上的中文標籤會變成方框——macOS內建的PingFang TC有
matplotlib.rcParams["font.sans-serif"] = ["PingFang TC", "Heiti TC", "Arial Unicode MS"]
matplotlib.rcParams["axes.unicode_minus"] = False
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from train_and_backtest import HORIZONS, load, feature_columns
from train_pooled import build_panel, N_SPLITS, UNIVERSE

CHART_DIR = "scripts/ml-research/charts"
TARGET_TICKERS = ["MU", "NVDA"]


def collect_oos_predictions(panel, horizon):
    """跟train_pooled.py的walk_forward_eval_pooled同一套fold切法，但這次把每一筆樣本外
    預測（不是聚合指標）存下來回傳，用來畫圖。"""
    feat_cols = feature_columns(panel.drop(columns=["ticker"]))
    valid = panel.dropna(subset=feat_cols + [f"target_ret_{horizon}d"]).reset_index(drop=True)

    unique_dates = np.sort(valid["date"].unique())
    n_dates = len(unique_dates)
    fold_size = n_dates // (N_SPLITS + 1)

    rows = []
    for i in range(1, N_SPLITS + 1):
        train_cutoff_idx = fold_size * i
        test_start_idx = min(train_cutoff_idx + horizon, n_dates - 1)
        test_end_idx = min(test_start_idx + fold_size, n_dates)
        if test_start_idx >= n_dates - 1 or test_end_idx <= test_start_idx:
            continue

        train_cutoff_date = unique_dates[train_cutoff_idx]
        test_start_date = unique_dates[test_start_idx]
        test_end_date = unique_dates[test_end_idx - 1]

        train = valid[valid["date"] < train_cutoff_date]
        test = valid[(valid["date"] >= test_start_date) & (valid["date"] <= test_end_date)]
        if len(train) < 200 or len(test) < 20:
            continue

        reg = HistGradientBoostingRegressor(max_iter=200, random_state=42)
        reg.fit(train[feat_cols], train[f"target_ret_{horizon}d"])
        pred_reg = reg.predict(test[feat_cols])

        clf = HistGradientBoostingClassifier(max_iter=200, random_state=42)
        clf.fit(train[feat_cols], train[f"target_up_{horizon}d"])
        pred_proba = clf.predict_proba(test[feat_cols])[:, 1]

        fold_rows = test[["date", "ticker", "close", f"target_ret_{horizon}d"]].copy()
        fold_rows["predicted_return"] = pred_reg
        fold_rows["predicted_up_proba"] = pred_proba
        fold_rows["fold"] = i
        rows.append(fold_rows)

    if not rows:
        return pd.DataFrame()
    result = pd.concat(rows, ignore_index=True)
    result = result.rename(columns={f"target_ret_{horizon}d": "actual_return"})
    return result


def plot_ticker(ticker, oos, horizon):
    full_price = load(ticker)
    ticker_oos = oos[oos["ticker"] == ticker].sort_values("date")

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 8), sharex=False, height_ratios=[1.3, 1])
    fig.suptitle(f"{ticker} — {horizon}日 walk-forward 樣本外預測 vs 實際（pooled模型，20檔半導體同業合併訓練）", fontsize=13)

    # 上圖：完整股價走勢 + 樣本外測試期間標色
    ax1.plot(full_price["date"], full_price["close"], color="#333333", linewidth=1.2, label="實際收盤價")
    for fold_id in ticker_oos["fold"].unique():
        fold_data = ticker_oos[ticker_oos["fold"] == fold_id]
        ax1.axvspan(fold_data["date"].min(), fold_data["date"].max(), color="#cfe8ff", alpha=0.4, zorder=0)
    correct_dir = np.sign(ticker_oos["predicted_return"]) == np.sign(ticker_oos["actual_return"])
    ax1.scatter(
        ticker_oos.loc[correct_dir, "date"], ticker_oos.loc[correct_dir, "close"],
        color="#2e7d32", s=18, label="模型方向猜對", zorder=3,
    )
    ax1.scatter(
        ticker_oos.loc[~correct_dir, "date"], ticker_oos.loc[~correct_dir, "close"],
        color="#c62828", s=18, label="模型方向猜錯", zorder=3,
    )
    ax1.set_ylabel("收盤價 (USD)")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.set_title("實際股價走勢（藍底 = walk-forward 樣本外測試期間）", fontsize=10)

    # 下圖：預測報酬率 vs 實際報酬率
    ax2.plot(ticker_oos["date"], ticker_oos["actual_return"] * 100, color="#333333", linewidth=1.3, label=f"實際未來{horizon}日報酬率%", marker="o", markersize=2)
    ax2.plot(ticker_oos["date"], ticker_oos["predicted_return"] * 100, color="#1565c0", linewidth=1.3, label=f"模型預測未來{horizon}日報酬率%", marker="o", markersize=2, alpha=0.8)
    ax2.axhline(0, color="#999999", linewidth=0.8, linestyle="--")
    ax2.set_ylabel("報酬率 (%)")
    ax2.legend(loc="upper left", fontsize=9)
    correlation = np.corrcoef(ticker_oos["predicted_return"], ticker_oos["actual_return"])[0, 1]
    hit_rate = correct_dir.mean()
    ax2.set_title(f"預測報酬率 vs 實際報酬率（相關係數={correlation:.3f}，方向命中率={hit_rate:.1%}）", fontsize=10)

    for ax in (ax1, ax2):
        ax.grid(True, alpha=0.25)
        ax.tick_params(axis="x", rotation=30)

    fig.tight_layout()
    import os
    os.makedirs(CHART_DIR, exist_ok=True)
    path = f"{CHART_DIR}/{ticker}_{horizon}d.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    print(f"wrote {path} (correlation={correlation:.3f}, hit_rate={hit_rate:.1%}, n={len(ticker_oos)})")


def main():
    horizon = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    if horizon not in HORIZONS:
        raise ValueError(f"horizon必須是{HORIZONS}其中之一")

    spy = load("SPY")
    spy_close_by_date = spy.set_index("date")["close"]
    panel = build_panel(UNIVERSE, spy_close_by_date)

    oos = collect_oos_predictions(panel, horizon)
    if oos.empty:
        print("沒有足夠的樣本外預測可以畫圖")
        return

    for ticker in TARGET_TICKERS:
        plot_ticker(ticker, oos, horizon)


if __name__ == "__main__":
    main()
