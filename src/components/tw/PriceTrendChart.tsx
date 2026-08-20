"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";
import { sma } from "@/lib/trend/indicators";
import type { InstitutionalFlowDay } from "./InstitutionalFlowChart";

export interface PriceTrendBar {
  date: string; // YYYY-MM-DD
  close: number;
}

const PRICE_HEIGHT = 200;
const FLOW_HEIGHT = 84;
const SECTION_GAP = 10;
const CHART_WIDTH = 720;
const PADDING = { top: 12, right: 12, bottom: 24, left: 48 };
const CHART_HEIGHT = PADDING.top + PRICE_HEIGHT + SECTION_GAP + FLOW_HEIGHT + PADDING.bottom;

const RANGES = [
  { key: "1m", label: "1個月", tradingDays: 20 },
  { key: "3m", label: "3個月", tradingDays: 60 },
  { key: "6m", label: "6個月", tradingDays: 120 },
  { key: "1y", label: "1年", tradingDays: 250 },
  { key: "all", label: "全部", tradingDays: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const MA_LINES = [
  { period: 5, color: "light-dark(#1d4ed8, #60a5fa)", label: "MA5" },
  { period: 10, color: "light-dark(#7c3aed, #c4b5fd)", label: "MA10" },
  { period: 20, color: "light-dark(#047857, #6ee7b7)", label: "MA20" },
] as const;

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatLots(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}張`;
}

/**
 * 個股收盤價區間走勢圖（6M/1Y 切換）+ MA5/10/20 + 三大法人合計買賣超，整合成一張圖
 * （2026-08-21）——原本股價走勢跟三大法人買賣超是分開兩個tab，使用者反映「籌碼影響價格，
 * 兩個是連動的」，分開看不容易對照同一天發生了什麼。改成價格+均線在上、法人進出場量在下，
 * 共用同一個x軸/區間切換/hover游標，看得出兩者的時間關係。原本的InstitutionalFlowChart
 * （三大法人分頁）保留給需要看外資/投信/自營個別拆分的細節，這裡只顯示合計。
 *
 * MA計算用bars的完整歷史序列（不是切完區間才算），確保切到「1個月」這種短區間時，
 * 區間第一天的MA20還是有前面19天的真實資料可以算，不會一開頭就是null。
 */
export function PriceTrendChart({ bars, institutionalDays }: { bars: PriceTrendBar[]; institutionalDays: InstitutionalFlowDay[] }) {
  const [range, setRange] = useState<RangeKey>("6m");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const maSeries = useMemo(() => MA_LINES.map((ma) => sma(closes, ma.period)), [closes]);
  const flowByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of institutionalDays) {
      m.set(d.date, d.foreignNetBuyShares + d.investTrustNetBuyShares + d.dealerNetBuyShares);
    }
    return m;
  }, [institutionalDays]);
  const flowDetailByDate = useMemo(() => new Map(institutionalDays.map((d) => [d.date, d])), [institutionalDays]);

  const rangeConfig = RANGES.find((r) => r.key === range)!;
  const sliceFrom = rangeConfig.tradingDays === Infinity ? 0 : Math.max(bars.length - rangeConfig.tradingDays, 0);
  const visible = useMemo(() => bars.slice(sliceFrom), [bars, sliceFrom]);
  const visibleMa = useMemo(() => maSeries.map((series) => series.slice(sliceFrom)), [maSeries, sliceFrom]);
  const visibleFlow = useMemo(() => visible.map((b) => flowByDate.get(b.date) ?? null), [visible, flowByDate]);

  if (visible.length < 2) {
    return (
      <Card>
        <SectionHeader icon={TrendingUp} iconColor="rose" title="股價走勢" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">歷史資料不足，無法繪製走勢圖。</p>
      </Card>
    );
  }

  const closesVisible = visible.map((b) => b.close);
  const maValuesForRange = visibleMa.flat().filter((v): v is number => v !== null);
  const minV = Math.min(...closesVisible, ...(maValuesForRange.length > 0 ? maValuesForRange : closesVisible));
  const maxV = Math.max(...closesVisible, ...(maValuesForRange.length > 0 ? maValuesForRange : closesVisible));
  const yPad = Math.max((maxV - minV) * 0.08, 0.5);
  const yMin = minV - yPad;
  const yMax = maxV + yPad;

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const priceTop = PADDING.top;
  const flowTop = PADDING.top + PRICE_HEIGHT + SECTION_GAP;
  const flowZeroY = flowTop + FLOW_HEIGHT / 2;

  function xFor(i: number): number {
    return PADDING.left + (visible.length <= 1 ? 0 : (i / (visible.length - 1)) * innerW);
  }
  function yFor(v: number): number {
    return priceTop + PRICE_HEIGHT - ((v - yMin) / (yMax - yMin)) * PRICE_HEIGHT;
  }

  const pricePath = visible.map((b, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(b.close).toFixed(1)}`).join(" ");
  const maPaths = visibleMa.map((series) => {
    let d = "";
    let started = false;
    series.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `;
      started = true;
    });
    return d;
  });

  const flowValidAbs = visibleFlow.filter((v): v is number => v !== null).map((v) => Math.abs(v));
  const flowMaxAbs = Math.max(...flowValidAbs, 1);
  const barWidth = Math.max(innerW / visible.length - 1.5, 1);
  function flowBarHeightFor(v: number): number {
    return (Math.abs(v) / flowMaxAbs) * (FLOW_HEIGHT / 2);
  }

  const periodStart = closesVisible[0];
  const periodEnd = closesVisible[closesVisible.length - 1];
  const periodReturnPct = ((periodEnd - periodStart) / periodStart) * 100;

  const hoverBar = hoverIndex !== null ? visible[hoverIndex] : null;
  const hoverReturnPct = hoverBar ? ((hoverBar.close - periodStart) / periodStart) * 100 : null;
  const hoverMaValues = hoverIndex !== null ? visibleMa.map((series) => series[hoverIndex]) : null;
  const hoverFlowDetail = hoverBar ? flowDetailByDate.get(hoverBar.date) : undefined;
  const hoverFlowTotal = hoverIndex !== null ? visibleFlow[hoverIndex] : null;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeader icon={TrendingUp} iconColor="rose" title="股價走勢與籌碼" />
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${twReturnColor(periodReturnPct)}`}>{formatPct(periodReturnPct)}</span>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  range === r.key
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: "light-dark(#78350f, #f0b866)" }} />
          收盤價
        </span>
        {MA_LINES.map((ma) => (
          <span key={ma.period} className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: ma.color }} />
            {ma.label}
          </span>
        ))}
        <span>下方：外資+投信+自營合計買賣超（紅=買超、綠=賣超）</span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full min-w-[480px]"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {tickValues.map((v, i) => (
            <g key={i}>
              <line
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="light-dark(#f4f4f5, #27272a)"
                strokeWidth={1}
              />
              <text x={PADDING.left - 6} y={yFor(v) + 3} textAnchor="end" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
                {formatPrice(v)}
              </text>
            </g>
          ))}

          {maPaths.map((d, i) => (
            <path key={MA_LINES[i].period} d={d} fill="none" stroke={MA_LINES[i].color} strokeWidth={1.25} opacity={0.9} />
          ))}
          <path d={pricePath} fill="none" stroke="light-dark(#78350f, #f0b866)" strokeWidth={1.75} />

          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={flowZeroY}
            y2={flowZeroY}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
          />
          {visibleFlow.map((v, i) => {
            if (v === null) return null;
            const h = flowBarHeightFor(v);
            const y = v >= 0 ? flowZeroY - h : flowZeroY;
            return (
              <rect
                key={i}
                x={xFor(i) - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(h, 0.5)}
                fill={v >= 0 ? "light-dark(#dc2626, #f87171)" : "light-dark(#059669, #34d399)"}
                opacity={hoverIndex === null || hoverIndex === i ? 0.9 : 0.35}
              />
            );
          })}

          {hoverIndex !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={PADDING.top}
                y2={flowTop + FLOW_HEIGHT}
                stroke="light-dark(#d4d4d8, #3f3f46)"
                strokeWidth={1}
              />
              <circle cx={xFor(hoverIndex)} cy={yFor(visible[hoverIndex].close)} r={2.5} fill="light-dark(#78350f, #f0b866)" />
            </>
          )}

          {visible.map((_, i) => (
            <rect
              key={i}
              x={xFor(i) - innerW / visible.length / 2}
              y={PADDING.top}
              width={innerW / visible.length}
              height={flowTop + FLOW_HEIGHT - PADDING.top}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {[0, Math.floor(visible.length / 2), visible.length - 1].map((i) => (
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {visible[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {hoverBar ? (
          <>
            <span>
              {hoverBar.date} 收盤 <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatPrice(hoverBar.close)}</span>{" "}
              <span className={twReturnColor(hoverReturnPct)}>{formatPct(hoverReturnPct!)}</span>
            </span>
            {hoverMaValues &&
              MA_LINES.map((ma, i) =>
                hoverMaValues[i] !== null ? (
                  <span key={ma.period}>
                    {ma.label} <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatPrice(hoverMaValues[i]!)}</span>
                  </span>
                ) : null
              )}
            {hoverFlowDetail && (
              <>
                <span>
                  外資 <span className={`font-medium ${twReturnColor(hoverFlowDetail.foreignNetBuyShares)}`}>{formatLots(hoverFlowDetail.foreignNetBuyShares)}</span>
                </span>
                <span>
                  投信{" "}
                  <span className={`font-medium ${twReturnColor(hoverFlowDetail.investTrustNetBuyShares)}`}>
                    {formatLots(hoverFlowDetail.investTrustNetBuyShares)}
                  </span>
                </span>
                <span>
                  自營{" "}
                  <span className={`font-medium ${twReturnColor(hoverFlowDetail.dealerNetBuyShares)}`}>
                    {formatLots(hoverFlowDetail.dealerNetBuyShares)}
                  </span>
                </span>
              </>
            )}
            {hoverFlowTotal !== null && (
              <span className="font-semibold">
                合計 <span className={twReturnColor(hoverFlowTotal)}>{formatLots(hoverFlowTotal)}</span>
              </span>
            )}
          </>
        ) : (
          <span>{visible[0]?.date} ~ {visible[visible.length - 1]?.date}</span>
        )}
      </div>
    </Card>
  );
}
