/**
 * FRED（美國聯準會經濟資料庫，https://fred.stlouisfed.org）：免金鑰、公開的 CSV 匯出端點，
 * 拿來補美股大盤指數的歷史資料——Polygon.io 免費方案只開放約 2 年歷史（實測 2023 年的資料
 * 會回 NOT_AUTHORIZED），FRED 的 SP500 序列雖然受授權限制只能回溯 10 年，但免費且不用金鑰，
 * 對「至少5年」的季節性分析需求綽綽有餘。
 */
const FRED_CSV_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";

export interface FredObservation {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * 抓一個 FRED 序列的完整歷史（單次請求，回傳整段可回溯範圍）。當天無資料（市場休市的美股假日，
 * FRED 仍然會列出那個日期）有兩種標記方式都要濾掉：純數字序列通常是"."，但 SP500 這個序列實測
 * 是「值直接留空」（"YYYY-MM-DD,"）——不特別檢查空字串的話，Number("") 會算出 0 而不是 NaN，
 * 假日就會被誤存成收盤價0，需要靠這個特例濾掉。
 */
export async function fetchFredSeries(seriesId: string): Promise<FredObservation[]> {
  const url = `${FRED_CSV_BASE_URL}?id=${encodeURIComponent(seriesId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[fred] HTTP ${res.status} for series ${seriesId}`);
  }
  const text = await res.text();
  const lines = text.trim().split("\n");
  const [, ...rows] = lines; // 第一行是 header："observation_date,<seriesId>"

  return rows
    .map((line) => {
      const [date, raw] = line.split(",");
      if (!date || !raw || raw === "." || raw.trim() === "") return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      return { date, value };
    })
    .filter((row): row is FredObservation => row !== null);
}
