"use client";

/**
 * 純 CSS hover 提示（不用 JS 事件），滑到「？」圖示上方彈出說明文字。
 * `align` 控制彈出框對齊方向，避免最左/最右欄位的提示框被裁到畫面外。
 */
export function InfoTooltip({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span className="group relative inline-flex cursor-help items-center align-middle">
      <span className="ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-200 text-[9px] font-bold leading-none text-zinc-500 group-hover:bg-zinc-400 group-hover:text-white">
        ?
      </span>
      <span
        className={`invisible absolute bottom-full z-30 mb-1.5 w-64 rounded-md bg-zinc-900 p-2.5 text-[11px] font-normal normal-case leading-relaxed text-zinc-100 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 ${
          align === "left" ? "left-0" : "right-0"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
