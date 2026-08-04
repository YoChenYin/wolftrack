/** 台股慣例：漲(正)=紅、跌(負)=綠，跟美股相反。給圖表類元件共用，避免重複散落各處。 */
export function twReturnColor(value: number | null): string {
  if (value === null) return "text-zinc-400 dark:text-zinc-500";
  if (value > 0) return "text-red-600 dark:text-red-400";
  if (value < 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-500 dark:text-zinc-400";
}

/** 同上但給 SVG fill/stroke 用的色碼（不是 tailwind class） */
export function twReturnHex(value: number | null): string {
  if (value === null) return "#a1a1aa";
  if (value > 0) return "light-dark(#dc2626, #f87171)";
  if (value < 0) return "light-dark(#059669, #34d399)";
  return "#a1a1aa";
}
