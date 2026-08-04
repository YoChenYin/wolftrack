"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { twReturnColor } from "@/lib/tw/color";

export interface InstitutionalFlowDay {
  date: string; // YYYY-MM-DD
  foreignNetBuyShares: number;
  investTrustNetBuyShares: number;
  dealerNetBuyShares: number;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const PADDING = { top: 10, right: 12, bottom: 24, left: 48 };

function formatLots(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString()}張`;
}

/** 三大法人（外資/投信/自營）買賣超歷史圖：每日合計淨買賣超張數，hover看個別法人拆分 */
export function InstitutionalFlowChart({ days }: { days: InstitutionalFlowDay[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length < 2) {
    return (
      <Card>
        <SectionHeader icon={Landmark} iconColor="blue" title="三大法人買賣超" />
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">歷史資料不足，無法繪製買賣超走勢。</p>
      </Card>
    );
  }

  const totals = days.map((d) => d.foreignNetBuyShares + d.investTrustNetBuyShares + d.dealerNetBuyShares);
  const maxAbs = Math.max(...totals.map((v) => Math.abs(v)), 1);

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const zeroY = PADDING.top + innerH / 2;
  const barWidth = Math.max(innerW / days.length - 1.5, 1);

  function xFor(i: number): number {
    return PADDING.left + (i + 0.5) * (innerW / days.length);
  }
  function barHeightFor(v: number): number {
    return (Math.abs(v) / maxAbs) * (innerH / 2);
  }

  const hoverDay = hoverIndex !== null ? days[hoverIndex] : null;
  const hoverTotal = hoverIndex !== null ? totals[hoverIndex] : null;

  return (
    <Card>
      <SectionHeader icon={Landmark} iconColor="blue" title="三大法人買賣超" />
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        近{days.length}個交易日外資+投信+自營合計淨買賣超（張），紅=合計買超、綠=合計賣超。滑過長條看個別法人拆分。
      </p>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full min-w-[480px]"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <line
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={zeroY}
            y2={zeroY}
            stroke="light-dark(#d4d4d8, #3f3f46)"
            strokeWidth={1}
          />

          {days.map((_, i) => {
            const v = totals[i];
            const h = barHeightFor(v);
            const y = v >= 0 ? zeroY - h : zeroY;
            const isHover = hoverIndex === i;
            return (
              <rect
                key={i}
                x={xFor(i) - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(h, 0.5)}
                fill={v >= 0 ? "light-dark(#dc2626, #f87171)" : "light-dark(#059669, #34d399)"}
                opacity={hoverIndex === null || isHover ? 0.9 : 0.35}
              />
            );
          })}

          {days.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={xFor(i) - innerW / days.length / 2}
              y={PADDING.top}
              width={innerW / days.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
            <text key={i} x={xFor(i)} y={CHART_HEIGHT - 6} textAnchor="middle" fontSize="9" fill="light-dark(#a1a1aa, #71717a)">
              {days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>

      {hoverDay && hoverTotal !== null ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-zinc-50 p-2 text-[11px] dark:bg-white/5">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{hoverDay.date}</span>
          <span>
            外資 <span className={`font-medium ${twReturnColor(hoverDay.foreignNetBuyShares)}`}>{formatLots(hoverDay.foreignNetBuyShares)}</span>
          </span>
          <span>
            投信 <span className={`font-medium ${twReturnColor(hoverDay.investTrustNetBuyShares)}`}>{formatLots(hoverDay.investTrustNetBuyShares)}</span>
          </span>
          <span>
            自營 <span className={`font-medium ${twReturnColor(hoverDay.dealerNetBuyShares)}`}>{formatLots(hoverDay.dealerNetBuyShares)}</span>
          </span>
          <span className="font-semibold">
            合計 <span className={twReturnColor(hoverTotal)}>{formatLots(hoverTotal)}</span>
          </span>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          {days[0]?.date} ~ {days[days.length - 1]?.date}
        </p>
      )}
    </Card>
  );
}
