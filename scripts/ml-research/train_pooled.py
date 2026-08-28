"""
美股ML研究 v2：不再單檔股票各自訓練，改成同類型股票（半導體同業）合併成一個橫斷面panel一起
訓練——單檔股票2年歷史只有~500列，跟v1(train_and_backtest.py)的結果一樣顯示樣本太少、模型
在每個horizon都輸給基準。合併20檔同業後樣本數是~20倍，是量化研究比較標準的做法（cross-sectional
pooling：假設同類股票的技術面模式有共通性，模型學的是「這個技術面特徵組合在半導體股裡代表什麼」，
不是「這檔股票的歷史怪癖」）。

跟v1的關鍵方法論差異：
- Walk-forward切分改成「依日期」而不是「依單一股票的列數」——所有股票同一段時間的資料要進同一個
  fold，不然不同股票的fold在時間上互相交錯，等於用某些股票的未來資料訓練來預測另一檔股票的過去。
- 特徵集跟v1完全一樣（沿用同一組technical indicator），只是訓練資料從單檔變成20檔的聯集。
- 不把ticker本身當特徵——所有特徵都已經是相對值（報酬率/比值/RSI等），刻意不讓模型記住
  「這是哪支股票」，這樣學到的東西才有跨股票的泛化意義，不是每支股票各自的怪癖。
"""

import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error

from train_and_backtest import HORIZONS, load, compute_features, compute_targets, feature_columns

N_SPLITS = 5
SIGNAL_THRESHOLD = 0.55
UNIVERSE = [
    "MU", "NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM", "TXN", "ASML", "MRVL",
    "ON", "MCHP", "LRCX", "AMAT", "KLAC", "ADI", "SWKS", "MPWR", "ENTG", "WDC",
]


def build_panel(tickers, spy_close_by_date):
    frames = []
    for ticker in tickers:
        df = load(ticker)
        df = compute_features(df, spy_close_by_date)
        df = compute_targets(df)
        df["ticker"] = ticker
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def walk_forward_eval_pooled(panel, horizon):
    feat_cols = feature_columns(panel.drop(columns=["ticker"]))
    valid = panel.dropna(subset=feat_cols + [f"target_ret_{horizon}d"]).reset_index(drop=True)

    unique_dates = np.sort(valid["date"].unique())
    n_dates = len(unique_dates)
    fold_size = n_dates // (N_SPLITS + 1)
    if fold_size < 10:
        return {"error": f"日期數不足以做walk-forward切分（可用交易日={n_dates}）"}

    folds = []
    for i in range(1, N_SPLITS + 1):
        train_cutoff_idx = fold_size * i
        test_start_idx = min(train_cutoff_idx + horizon, n_dates - 1)  # purge gap（交易日數，橫跨全部股票共用同一套交易日曆）
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

        X_train, X_test = train[feat_cols], test[feat_cols]
        y_train_cls, y_test_cls = train[f"target_up_{horizon}d"], test[f"target_up_{horizon}d"]
        y_train_reg, y_test_reg = train[f"target_ret_{horizon}d"], test[f"target_ret_{horizon}d"]

        clf = HistGradientBoostingClassifier(max_iter=200, random_state=42)
        clf.fit(X_train, y_train_cls)
        pred_cls = clf.predict(X_test)
        pred_proba = clf.predict_proba(X_test)[:, 1]

        reg = HistGradientBoostingRegressor(max_iter=200, random_state=42)
        reg.fit(X_train, y_train_reg)
        pred_reg = reg.predict(X_test)

        acc = accuracy_score(y_test_cls, pred_cls)
        # 多數類別基準改用訓練集（不偷看測試集標籤分布），加上使用者要求的「順勢」基準——
        # 用跟horizon等長的過去報酬率當「趨勢延續」訊號，這是比「無腦猜多數類別」更公平的對照，
        # 尤其這段期間半導體處於強勢多頭，多數類別基準本身就會虛高
        train_majority_acc = max(y_train_cls.mean(), 1 - y_train_cls.mean())
        trend_pred_cls = (X_test[f"ret_{horizon}d"] > 0).astype(int)
        trend_baseline_acc = accuracy_score(y_test_cls, trend_pred_cls)

        mae = mean_absolute_error(y_test_reg, pred_reg)
        rmse = mean_squared_error(y_test_reg, pred_reg) ** 0.5
        naive_mae = mean_absolute_error(y_test_reg, np.full(len(y_test_reg), y_train_reg.mean()))
        trend_pred_reg = X_test[f"ret_{horizon}d"]
        trend_mae = mean_absolute_error(y_test_reg, trend_pred_reg)
        dir_acc_from_reg = float((np.sign(pred_reg) == np.sign(y_test_reg)).mean())
        trend_dir_acc = float((np.sign(trend_pred_reg) == np.sign(y_test_reg)).mean())

        signal = pred_proba > SIGNAL_THRESHOLD
        avg_return_all = float(y_test_reg.mean())
        avg_return_when_signaled = float(y_test_reg[signal].mean()) if signal.sum() > 0 else None
        hit_rate_when_signaled = float((y_test_reg[signal] > 0).mean()) if signal.sum() > 0 else None

        # 個股層級的方向準確率（合併訓練後，MU/NVDA本身的表現有沒有變好）
        per_ticker_acc = {}
        for ticker in test["ticker"].unique():
            mask = test["ticker"] == ticker
            if mask.sum() < 5:
                continue
            per_ticker_acc[ticker] = round(float(accuracy_score(y_test_cls[mask], pred_cls[mask])), 3)

        folds.append(
            {
                "fold": i,
                "test_start": str(pd.Timestamp(test_start_date).date()),
                "test_end": str(pd.Timestamp(test_end_date).date()),
                "n_train": int(len(train)),
                "n_test": int(len(test)),
                "cls_accuracy": round(float(acc), 4),
                "cls_train_majority_baseline": round(float(train_majority_acc), 4),
                "cls_trend_following_baseline": round(float(trend_baseline_acc), 4),
                "reg_mae_pct": round(float(mae) * 100, 3),
                "reg_naive_mae_pct": round(float(naive_mae) * 100, 3),
                "reg_trend_persistence_mae_pct": round(float(trend_mae) * 100, 3),
                "reg_rmse_pct": round(float(rmse) * 100, 3),
                "directional_accuracy_from_regression": round(dir_acc_from_reg, 4),
                "trend_following_directional_accuracy": round(trend_dir_acc, 4),
                "signal_rate": round(float(signal.mean()), 3),
                "avg_return_all_days_pct": round(avg_return_all * 100, 3),
                "avg_return_when_signaled_pct": round(avg_return_when_signaled * 100, 3) if avg_return_when_signaled is not None else None,
                "hit_rate_when_signaled": round(hit_rate_when_signaled, 3) if hit_rate_when_signaled is not None else None,
                "per_ticker_accuracy": per_ticker_acc,
            }
        )

    if not folds:
        return {"error": "沒有足夠的walk-forward fold可以評估"}

    return {
        "folds": folds,
        "summary": {
            "avg_cls_accuracy": round(float(np.mean([f["cls_accuracy"] for f in folds])), 4),
            "avg_cls_train_majority_baseline": round(float(np.mean([f["cls_train_majority_baseline"] for f in folds])), 4),
            "avg_cls_trend_following_baseline": round(float(np.mean([f["cls_trend_following_baseline"] for f in folds])), 4),
            "avg_reg_mae_pct": round(float(np.mean([f["reg_mae_pct"] for f in folds])), 3),
            "avg_reg_naive_mae_pct": round(float(np.mean([f["reg_naive_mae_pct"] for f in folds])), 3),
            "avg_reg_trend_persistence_mae_pct": round(float(np.mean([f["reg_trend_persistence_mae_pct"] for f in folds])), 3),
            "avg_directional_accuracy": round(float(np.mean([f["directional_accuracy_from_regression"] for f in folds])), 4),
            "avg_trend_following_directional_accuracy": round(float(np.mean([f["trend_following_directional_accuracy"] for f in folds])), 4),
        },
    }


def main():
    tickers = sys.argv[1].split(",") if len(sys.argv) > 1 else UNIVERSE
    spy = load("SPY")
    spy_close_by_date = spy.set_index("date")["close"]

    panel = build_panel(tickers, spy_close_by_date)
    print(f"pooled panel: {len(panel)} rows across {len(tickers)} tickers")

    report = {f"{h}d": walk_forward_eval_pooled(panel, h) for h in HORIZONS}

    print(json.dumps(report, indent=2, default=str))
    with open("scripts/ml-research/report_pooled.json", "w") as f:
        json.dump(report, f, indent=2, default=str)


if __name__ == "__main__":
    main()
