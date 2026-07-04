/**
 * 序列化節流器：每次呼叫回傳的 function 保證跟上一次呼叫至少間隔 minIntervalMs。
 * 用來配合 Polygon.io 免費方案 5 requests/分鐘的限制，呼叫端必須依序 await，不能平行發request。
 */
export function createRateLimiter(minIntervalMs: number) {
  let lastCallAt = 0;
  return async function throttle(): Promise<void> {
    const wait = lastCallAt + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
  };
}
