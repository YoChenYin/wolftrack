import type { OhlcvBar } from "@/lib/trend/types";

const POLYGON_BASE_URL = "https://api.polygon.io";

interface PolygonAggBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** Unix ms timestamp，日線代表當天（ET）的起始時間 */
  t: number;
}

interface PolygonAggsResponse {
  status: string;
  results?: PolygonAggBar[];
  error?: string;
  message?: string;
}

export class PolygonApiError extends Error {
  constructor(
    message: string,
    public readonly ticker?: string
  ) {
    super(message);
    this.name = "PolygonApiError";
  }
}

function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    throw new PolygonApiError(
      "缺少 POLYGON_API_KEY 環境變數。請到 https://polygon.io 申請 API key 後填入 .env（可參考 .env.example）。"
    );
  }
  return key;
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** fetch 沒有內建 timeout，卡住的連線會讓 await 永遠不 resolve，讓整支批次腳本卡死 */
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 抓某檔股票的歷史日線 OHLCV（Polygon.io Aggregates / Bars API）。
 * from/to 是日曆日範圍，Polygon 只會回傳實際有交易的日子。
 * 預設回看 760 個日曆天（約 2.1 年），確保有足夠交易日算 200MA（文件第8章要求至少回補 2 年）。
 */
export async function fetchDailyBars(
  ticker: string,
  options: { fromDaysAgo?: number; to?: Date } = {}
): Promise<OhlcvBar[]> {
  const apiKey = getApiKey();
  const to = options.to ?? new Date();
  const fromDaysAgo = options.fromDaysAgo ?? 760;
  const from = new Date(to.getTime() - fromDaysAgo * 86_400_000);

  const url =
    `${POLYGON_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/` +
    `${toDateParam(from)}/${toDateParam(to)}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;

  const res = await fetchWithTimeout(url);
  const body = (await res.json()) as PolygonAggsResponse;

  if (!res.ok || (body.status !== "OK" && body.status !== "DELAYED")) {
    throw new PolygonApiError(
      `Polygon API 回傳錯誤 (ticker=${ticker}, status=${body.status}): ${body.error ?? body.message ?? res.statusText}`,
      ticker
    );
  }

  const results = body.results ?? [];
  return results.map((bar) => ({
    date: new Date(bar.t).toISOString().slice(0, 10),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
  }));
}
