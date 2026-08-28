"""
美股ML研究：用MU/NVDA的歷史OHLCV訓練gradient boosting模型，同時做方向分類（未來N日漲/跌）
跟報酬率回歸（未來N日實際報酬%），用walk-forward（不是隨機切分）驗證，避免look-ahead洩漏。

資料來源：scripts/export-us-history.ts先把Polygon的日線OHLCV匯出成CSV（避免在Python重寫一套
Polygon client），這支script只負責特徵工程/訓練/回測。

方法論：
- 每個horizon（5/10/20/40/60個交易日，跟這個repo其他回測一致的horizon組）各自訓練一組模型。
- Walk-forward：資料依時間切成N_SPLITS+1段，逐步擴張訓練窗口（expanding window），每一段測試集
  都只用「這段測試期之前」的資料訓練——不是sklearn預設的隨機k-fold（那樣會用未來資料訓練預測過去）。
- Purge gap：train/test交界處留一段horizon天數的空隙，避免train最後幾天的label（用到horizon天後
  的收盤價）剛好摸到test set範圍，造成邊界洩漏。
- Baseline對照：分類跟多數類別基準比、回歸跟「預測歷史平均值」基準比、策略訊號跟「不管訊號、全部
  平均」比——不是自己跟自己比，避免「模型看起來很準但其實輸給瞎猜」的錯覺。
"""

import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error

from pattern_detection import detect_bottom_pattern, LOOKBACK_TRADING_DAYS as PATTERN_LOOKBACK_DAYS

HORIZONS = [5, 10, 20, 40, 60]
DATA_DIR = "scripts/ml-research/data"
N_SPLITS = 5
SIGNAL_THRESHOLD = 0.55


def load(ticker):
    df = pd.read_csv(f"{DATA_DIR}/{ticker}.csv", parse_dates=["date"])
    return df.sort_values("date").reset_index(drop=True)


def compute_features(df, spy_close_by_date):
    df = df.copy()
    close = df["close"]

    for lag in [1, 5, 10, 20, 40, 60]:
        df[f"ret_{lag}d"] = close.pct_change(lag)

    for p in [5, 10, 20, 50]:
        df[f"close_over_sma{p}"] = close / close.rolling(p).mean() - 1
    df["sma5_over_sma20"] = close.rolling(5).mean() / close.rolling(20).mean() - 1
    df["sma20_over_sma50"] = close.rolling(20).mean() / close.rolling(50).mean() - 1

    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    avg_loss = loss.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    df["rsi14"] = 100 - (100 / (1 + rs))

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal_line = macd.ewm(span=9, adjust=False).mean()
    df["macd_hist"] = macd - signal_line

    df["volatility_20d"] = close.pct_change().rolling(20).std()
    df["vol_ratio_20d"] = df["volume"] / df["volume"].rolling(20).mean() - 1

    stock_ret20 = close.pct_change(20)
    spy_ret20_aligned = df["date"].map(spy_close_by_date.pct_change(20))
    df["rel_strength_20d"] = stock_ret20 - spy_ret20_aligned.values

    # K棒形狀特徵——第一版完全沒用到open/high/low，只用close，這次補上實體/影線比例跟跳空缺口
    open_, high, low = df["open"], df["high"], df["low"]
    day_range = (high - low).replace(0, np.nan)
    df["candle_body_pct"] = (close - open_) / open_
    df["candle_upper_shadow_ratio"] = (high - np.maximum(open_, close)) / day_range
    df["candle_lower_shadow_ratio"] = (np.minimum(open_, close) - low) / day_range
    df["candle_range_pct"] = day_range / close
    df["gap_from_prev_close_pct"] = open_ / close.shift(1) - 1

    # MA排列狀態，跟backtestScenario.ts的classifyMaArrangement同一個定義（多頭/空頭/糾結）
    sma5, sma10, sma20 = close.rolling(5).mean(), close.rolling(10).mean(), close.rolling(20).mean()
    df["ma_arrangement_bullish"] = ((sma5 > sma10) & (sma10 > sma20)).astype(int)
    df["ma_arrangement_bearish"] = ((sma5 < sma10) & (sma10 < sma20)).astype(int)

    # OBV（能量潮）——沒有真實籌碼（法人買賣超）資料時，技術分析裡最接近「用價量推測籌碼
    # 動向」的替代指標：收漲當天的量視為買方力道累加，收跌當天視為賣方力道累加
    direction = np.sign(close.diff().fillna(0))
    obv = (direction * df["volume"]).cumsum()
    df["obv_slope_20d"] = obv.diff(20) / df["volume"].rolling(20).mean().replace(0, np.nan)

    # 底部反轉型態（頭肩底/N字底，搬自detectBottomPattern.ts）——逐日用「當天以前」的收盤價
    # 序列判斷，不能整批算（那樣後面的天數會用到未來資料），這裡用closes.iloc[:i+1]的方式
    # 逐日回溯，只取最近PATTERN_LOOKBACK_DAYS天當輸入（跟TS版一致），效能上可以接受
    closes_list = close.tolist()
    stage_near = np.zeros(len(df))
    stage_confirmed = np.zeros(len(df))
    for i in range(len(df)):
        if i < 2 * 8 + 1:  # PIVOT_CONFIRM_DAYS*2+1，太短無法找轉折點
            continue
        window_start = max(0, i + 1 - PATTERN_LOOKBACK_DAYS)
        result = detect_bottom_pattern(closes_list[window_start : i + 1])
        if result is None:
            continue
        if result["stage"] == "nearBreakout":
            stage_near[i] = 1
        elif result["stage"] == "confirmed":
            stage_confirmed[i] = 1
    df["bottom_pattern_near_breakout"] = stage_near
    df["bottom_pattern_confirmed"] = stage_confirmed

    return df


def compute_targets(df):
    close = df["close"]
    for h in HORIZONS:
        fwd_ret = close.shift(-h) / close - 1
        df[f"target_ret_{h}d"] = fwd_ret
        df[f"target_up_{h}d"] = (fwd_ret > 0).astype(int)
    return df


def feature_columns(df):
    return [c for c in df.columns if c not in ("date", "open", "high", "low", "close", "volume") and not c.startswith("target_")]


def walk_forward_eval(df, horizon):
    feat_cols = feature_columns(df)
    valid = df.dropna(subset=feat_cols + [f"target_ret_{horizon}d"]).reset_index(drop=True)
    n = len(valid)
    fold_size = n // (N_SPLITS + 1)
    if fold_size < 10:
        return {"error": f"樣本數不足以做walk-forward切分（可用列數={n}）"}

    folds = []
    for i in range(1, N_SPLITS + 1):
        train_end = fold_size * i
        test_start = train_end + horizon  # purge gap
        test_end = min(test_start + fold_size, n)
        if test_start >= n or test_end - test_start < 5:
            continue

        train = valid.iloc[:train_end]
        test = valid.iloc[test_start:test_end]
        if len(train) < 40:
            continue

        X_train, X_test = train[feat_cols], test[feat_cols]
        y_train_cls, y_test_cls = train[f"target_up_{horizon}d"], test[f"target_up_{horizon}d"]
        y_train_reg, y_test_reg = train[f"target_ret_{horizon}d"], test[f"target_ret_{horizon}d"]

        clf = HistGradientBoostingClassifier(max_iter=150, random_state=42)
        clf.fit(X_train, y_train_cls)
        pred_cls = clf.predict(X_test)
        pred_proba = clf.predict_proba(X_test)[:, 1]

        reg = HistGradientBoostingRegressor(max_iter=150, random_state=42)
        reg.fit(X_train, y_train_reg)
        pred_reg = reg.predict(X_test)

        acc = accuracy_score(y_test_cls, pred_cls)
        # 多數類別基準改用「訓練集」的up比例（不偷看測試集本身的標籤分布，才是真的可以在
        # 實際交易當下就知道的基準），跟趨勢延續基準一起報，不再只看多數類別
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

        folds.append(
            {
                "fold": i,
                "test_start": str(test.iloc[0]["date"].date()),
                "test_end": str(test.iloc[-1]["date"].date()),
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
    tickers = sys.argv[1].split(",") if len(sys.argv) > 1 else ["MU", "NVDA"]
    spy = load("SPY")
    spy_close_by_date = spy.set_index("date")["close"]

    report = {}
    for ticker in tickers:
        df = load(ticker)
        df = compute_features(df, spy_close_by_date)
        df = compute_targets(df)
        report[ticker] = {f"{h}d": walk_forward_eval(df, h) for h in HORIZONS}

    print(json.dumps(report, indent=2, default=str))
    with open("scripts/ml-research/report.json", "w") as f:
        json.dump(report, f, indent=2, default=str)


if __name__ == "__main__":
    main()
