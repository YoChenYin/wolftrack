export interface ReturnBarRow {
  key: string;
  label: string;
  count: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  winRatePct: number | null;
  lossRatePct: number | null;
  avgHoldingDays: number | null;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** 刻度取整：0.5/1/2/2.5/5×10^n 中第一個能把範圍切成≤4格的間距 */
function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

export interface ChartDomain {
  min: number;
  max: number;
  ticks: number[];
}

/** 兩張圖共用同一個x軸範圍，左右才能直接比長短 */
export function computeDomain(rows: ReturnBarRow[]): ChartDomain {
  const values = rows.map((r) => r.avgReturnPct).filter((v): v is number => v !== null);
  // 兩端各留約30%空間給長條末端的數值標籤，標籤不會超出圖框
  const lo = Math.min(0, ...values) * 1.3;
  const hi = Math.max(0, ...values) * 1.3;
  const step = niceStep(hi - lo || 1);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return { min, max: max === min ? min + step : max, ticks };
}

function pos(value: number, d: ChartDomain): number {
  return ((value - d.min) / (d.max - d.min)) * 100;
}

/**
 * 平均報酬的水平長條圖（單一數列，所以不放圖例，標題就說明畫的是什麼）。長條從0%基準線
 * 往正/負方向長，顏色照台股慣例（漲紅跌綠，跟全站twReturnColor一致），數值標在長條末端、
 * 用文字色不用長條色。整列都是hover/focus目標，提示框補上筆數/勝率/中位數/平均持有。
 */
export function ReturnBarChart({ title, rows, domain }: { title: string; rows: ReturnBarRow[]; domain: ChartDomain }) {
  const zero = pos(0, domain);
  const sorted = [...rows].sort((a, b) => (b.avgReturnPct ?? -Infinity) - (a.avgReturnPct ?? -Infinity));

  return (
    <figure className="min-w-0">
      <figcaption className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</figcaption>
      <div className="mt-3 space-y-1">
        {sorted.map((r) => {
          const v = r.avgReturnPct;
          const left = v === null ? zero : Math.min(zero, pos(v, domain));
          const width = v === null ? 0 : Math.abs(pos(v, domain) - zero);
          const positive = v !== null && v >= 0;
          return (
            <div
              key={r.key}
              tabIndex={0}
              className="group relative grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md px-1 py-1.5 outline-none hover:bg-zinc-50 focus-visible:bg-zinc-50 dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{r.label}</p>
                <p className="font-[family:var(--font-tw-mono)] text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{r.count} 筆</p>
              </div>
              <div className="relative h-5">
                <div className="absolute inset-y-[-6px] w-px bg-zinc-300 dark:bg-white/20" style={{ left: `${zero}%` }} />
                {v === null ? (
                  <span className="absolute top-1/2 -translate-y-1/2 pl-2 text-[11px] text-zinc-300 dark:text-zinc-600" style={{ left: `${zero}%` }}>
                    尚無已出場交易
                  </span>
                ) : (
                  <>
                    <div
                      className={`absolute top-1/2 h-4 -translate-y-1/2 ${
                        positive ? "rounded-r-[4px] bg-red-500 dark:bg-red-400" : "rounded-l-[4px] bg-emerald-500 dark:bg-emerald-400"
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 font-[family:var(--font-tw-mono)] text-[11px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-200"
                      style={positive ? { left: `${left + width}%` } : { right: `${100 - left}%` }}
                    >
                      {formatPct(v)}
                    </span>
                  </>
                )}
              </div>

              <div
                role="tooltip"
                className="pointer-events-none invisible absolute left-[6.5rem] top-full z-30 mt-1 w-52 rounded-md bg-zinc-900 p-2.5 text-[11px] leading-relaxed text-zinc-100 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 dark:bg-zinc-800 dark:ring-1 dark:ring-white/10"
              >
                <p className="font-medium">{r.label}</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 font-[family:var(--font-tw-mono)] tabular-nums">
                  <dt className="text-zinc-400">已出場</dt>
                  <dd className="text-right">{r.count} 筆</dd>
                  <dt className="text-zinc-400">平均報酬</dt>
                  <dd className="text-right">{formatPct(r.avgReturnPct)}</dd>
                  <dt className="text-zinc-400">中位數</dt>
                  <dd className="text-right">{formatPct(r.medianReturnPct)}</dd>
                  <dt className="text-zinc-400">正／負報酬</dt>
                  <dd className="text-right">
                    {r.winRatePct !== null && r.lossRatePct !== null ? `${r.winRatePct.toFixed(0)}% / ${r.lossRatePct.toFixed(0)}%` : "—"}
                  </dd>
                  <dt className="text-zinc-400">平均持有</dt>
                  <dd className="text-right">{r.avgHoldingDays !== null ? `${r.avgHoldingDays.toFixed(1)} 日` : "—"}</dd>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative ml-[7.5rem] mr-1 mt-1 h-4 text-[10px] text-zinc-400 dark:text-zinc-500">
        {domain.ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 font-[family:var(--font-tw-mono)] tabular-nums" style={{ left: `${pos(t, domain)}%` }}>
            {t > 0 ? "+" : ""}
            {t}%
          </span>
        ))}
      </div>
    </figure>
  );
}
