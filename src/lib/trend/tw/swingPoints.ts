/**
 * 轉折點（swing point）偵測——底部型態辨識（頭肩底/N字底，見detectBottomPattern.ts）共用的
 * 基礎工具。用最基本的「N日樞紐」判定法：某天收盤價如果是左右各PIVOT_CONFIRM_DAYS天內
 * （共2×PIVOT_CONFIRM_DAYS+1天窗口）的最低/最高點，就認定是一個轉折低點/高點。
 *
 * 這個判定法天生有PIVOT_CONFIRM_DAYS天的確認延遲（要等到之後幾天價格真的沒有再創新低/新高，
 * 才敢認定某一天是轉折點）——這跟人眼判斷技術線圖的邏輯一致（型態圖上的左肩/頭部都是事後才
 * 看得出來的），不是這個實作的缺陷。也因為這個延遲，陣列最後PIVOT_CONFIRM_DAYS天永遠不會
 * 產生新的轉折點，這是預期行為。
 */
const PIVOT_CONFIRM_DAYS = 8;

export interface SwingPoint {
  /** 在傳入的closes陣列裡的index */
  index: number;
  price: number;
  type: "low" | "high";
}

export function findSwingPoints(closes: number[]): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = PIVOT_CONFIRM_DAYS; i < closes.length - PIVOT_CONFIRM_DAYS; i++) {
    const window = closes.slice(i - PIVOT_CONFIRM_DAYS, i + PIVOT_CONFIRM_DAYS + 1);
    const price = closes[i];
    if (price === Math.min(...window)) {
      points.push({ index: i, price, type: "low" });
    } else if (price === Math.max(...window)) {
      points.push({ index: i, price, type: "high" });
    }
  }
  return alternate(points);
}

/**
 * 原始樞紐判定可能產生連續同類型的轉折點（例如盤整區間裡好幾個局部低點都符合窗口內最低）。
 * 型態辨識需要的是乾淨的低-高-低-高交替序列，這裡把連續同類型的點收斂成只留最極端的那個
 * （例如兩個連續低點，只留價格更低的那個），確保回傳序列一定是嚴格交替。
 */
function alternate(points: SwingPoint[]): SwingPoint[] {
  const result: SwingPoint[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (!last || last.type !== p.type) {
      result.push(p);
      continue;
    }
    const moreExtreme = p.type === "low" ? p.price < last.price : p.price > last.price;
    if (moreExtreme) result[result.length - 1] = p;
  }
  return result;
}
