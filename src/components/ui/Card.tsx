/**
 * /tw共用卡片樣式：白底浮在淺色畫布上、柔和陰影取代硬邊框，取代原本每個區塊各自重複的
 * `rounded-lg border border-zinc-200 bg-white p-4`。SubCard是卡片內部的次層容器（例如
 * ChainSignalLights展開的成員清單、GroupValuationTable單一族群區塊），用更輕的填色
 * 取代再疊一層邊框卡片。
 */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_-14px_rgba(24,24,27,0.14)] ring-1 ring-zinc-900/[0.05] ${className}`}
    >
      {children}
    </section>
  );
}

export function SubCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-zinc-50/70 p-3 ring-1 ring-zinc-900/[0.04] ${className}`}>{children}</div>
  );
}
