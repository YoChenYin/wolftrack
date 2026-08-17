import {
  Radar,
  Hourglass,
  TrendingUp,
  ArrowDownToLine,
  Repeat,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TacticalStatus } from "./sectorTrendsQuery";

export interface TacticalStatusMeta {
  icon: LucideIcon;
  iconColor: "blue" | "amber" | "emerald" | "rose";
  title: string;
  subtitle: string;
  accent: string;
  badge: string;
  criteria: string;
  signalLabel: string;
  /** 用真實production資料回測過、目前沒有正超額報酬的訊號，要在不用hover tooltip的情況下也看得到，
   * 不能只寫在tooltip裡——這是「這個訊號值不值得信任」的重要資訊，不是細節補充 */
  unproven?: boolean;
}

/** 2026-08-18：從 TrendColumn.tsx 抽出來，讓美股卡片版（TrendColumn）跟台股表格版（TrendTable）
 * 共用同一份中文標題/說明/顏色設定，不用兩邊各自維護一份容易兜不起來的重複資料。 */
export const TACTICAL_STATUS_META: Record<TacticalStatus, TacticalStatusMeta> = {
  reversal: {
    icon: Radar,
    iconColor: "blue",
    title: "反轉雷達",
    subtitle: "接近趨勢切換點，變盤初期 — 提早佈局",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
    criteria:
      "近期剛發生黃金交叉，動能剛轉強：① MA20/MA50 在近5個交易日內出現黃金交叉 ② 同期間 MACD 柱狀圖由負轉正 ③ 近3日內出現爆量（成交量 > 20日均量 ×1.5倍）。三者同時符合才會進這一欄。",
    signalLabel: "反轉點",
  },
  pullback: {
    icon: Hourglass,
    iconColor: "amber",
    title: "蓄勢待發",
    subtitle: "回檔整理中 — 等拉回上車",
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
    criteria:
      "多頭排列中的健康回檔，準備反彈：① 均線多頭排列（MA20>MA50>MA200）② 從近60日高點回檔5%~15%之間 ③ 股價貼近MA20或MA50支撐（±2%以內）④ RSI從超買區(>70)冷卻回40~55區間。",
    signalLabel: "反轉點",
  },
  bullish: {
    icon: TrendingUp,
    iconColor: "emerald",
    title: "趨勢穩健",
    subtitle: "已進入上升軌道、動能延續 — 續抱追蹤",
    accent: "border-t-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
    criteria:
      "確立中的強勢多頭趨勢：① 均線多頭排列且MA20/MA50/MA200近5日都上揚 ② ADX14>25且持續走高 ③ 近20日內至少2次「新高」 ④ 從近60日高點回檔不到5%。",
    signalLabel: "反轉點",
  },
  trustTurnBuy: {
    icon: Repeat,
    iconColor: "blue",
    title: "投信轉買",
    subtitle: "投信由賣轉買的翻轉日 — 效果待驗證",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
    unproven: true,
    criteria: "投信今日淨買超轉正、昨日淨買超<=0（由賣轉買的翻轉日）。2026-08-17新規則，還沒有backtest數據，出現不代表歷史上會賺錢，請自行搭配風控。",
    signalLabel: "訊號起點",
  },
  combinedBuy: {
    icon: Users,
    iconColor: "blue",
    title: "投信外資合買",
    subtitle: "外資投信同步買超 — 效果待驗證",
    accent: "border-t-blue-500",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400",
    unproven: true,
    criteria: "外資、投信當日同時淨買超（不要求連續天數，訊號本身會標註目前是連續第幾天買超）。2026-08-17新規則，還沒有backtest數據。",
    signalLabel: "訊號起點",
  },
  buyDip: {
    icon: ArrowDownToLine,
    iconColor: "amber",
    title: "逢低布局",
    subtitle: "回落季線的健康拉回 — 目前唯一驗證有效的訊號",
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
    criteria:
      "① 股價落在季線(MA60)±1.5%範圍內 ② 近5日籌碼集中度≥15%。用真實production資料回測過，是目前這套策略裡唯一有穩健正超額報酬的訊號：20日中位超額報酬約+2.1%~+2.3%，勝率70%以上。",
    signalLabel: "訊號起點",
  },
  trustTurnSell: {
    icon: Repeat,
    iconColor: "rose",
    title: "投信轉賣",
    subtitle: "投信由買轉賣的翻轉日 — 效果待驗證",
    accent: "border-t-rose-500",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-400",
    unproven: true,
    criteria: "投信今日淨買超轉負、昨日淨買超>=0（由買轉賣的翻轉日）。2026-08-17新規則，還沒有backtest數據，出現不代表歷史上會下跌，請自行搭配風控。",
    signalLabel: "訊號起點",
  },
  combinedSell: {
    icon: Users,
    iconColor: "rose",
    title: "投信外資合賣",
    subtitle: "外資投信同步賣超 — 效果待驗證",
    accent: "border-t-rose-500",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-400",
    unproven: true,
    criteria: "外資、投信當日同時淨賣超（不要求連續天數，訊號本身會標註目前是連續第幾天賣超）。2026-08-17新規則，還沒有backtest數據。",
    signalLabel: "訊號起點",
  },
};
