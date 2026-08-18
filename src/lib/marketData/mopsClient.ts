/**
 * 公開資訊觀測站（MOPS）法人說明會資料，用來抓龍頭股法說會簡報PDF給LLM解析（見
 * runEarningsCallAnalysis.ts）。跟這個專案其他官方資料源一樣，MOPS沒有乾淨的JSON API，
 * 查詢結果是HTML表格（`ajax_t100sb02_1`），PDF下載是表單POST（`FileDownLoad`），
 * 沿用這個檔案既有client的最小依賴風格，regex逐段解析，不加HTML parser套件。
 *
 * 端點/參數是照瀏覽器實際操作（mopsov.twse.com.tw/mops/web/t100sb02_1 查詢表單）反推出來的：
 * - TYPEK：上市"sii"、上櫃"otc"（不是FinMind那種"twse"/"tpex"命名，兩邊要自己對應）
 * - year：民國年（西元年-1911）
 * - 下載表單固定 filePath=/home/html/nas/STR/，只有fileName會變
 */
const MOPS_BASE_URL = "https://mopsov.twse.com.tw";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

async function fetchWithRetry(url: string, body: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err as Error;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        console.error(`[mops] fetch failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${url}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr ?? new Error("[mops] fetch failed with no error captured");
}

export interface EarningsConferenceEntry {
  ticker: string;
  /** ISO date，範圍日期（例如「115/03/03 至 115/03/06」）取第一天 */
  conferenceDate: string;
  /** 中文簡報PDF檔名（例如233020260716M001.pdf），下載/去重都用這個 */
  pdfFileName: string;
}

/** 民國年月日（例如"115/07/16"）轉西元ISO日期 */
function rocDateToIso(rocDate: string): string | null {
  const match = rocDate.trim().match(/^(\d+)\/(\d{2})\/(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]) + 1911;
  return `${year}-${match[2]}-${match[3]}`;
}

/**
 * 同一份簡報常常因為公司受邀參加好幾場不同券商辦的投資論壇而在清單裡重複出現好幾列
 * （擇要訊息會寫「會中就本公司X/X法說會已公開之財務數字...」），這裡不特別篩選，
 * 呼叫端會用pdfFileName去重，只取每個檔名第一次出現（=最早、也就是真正法說會當天）的日期。
 */
export function parseEarningsConferenceList(html: string, ticker: string): EarningsConferenceEntry[] {
  const rowBlocks = html.split(/<tr class='(?:even|odd)' data-type='body' >/).slice(1);
  const seenFileNames = new Set<string>();
  const entries: EarningsConferenceEntry[] = [];

  for (const block of rowBlocks) {
    const dateMatch = block.match(/<td align='center'>([\d/]+)/);
    const fileMatch = block.match(/fm_fileDownload\.fileName\.value="(\d+M\d+\.pdf)"/);
    if (!dateMatch || !fileMatch) continue;

    const pdfFileName = fileMatch[1];
    if (seenFileNames.has(pdfFileName)) continue;
    seenFileNames.add(pdfFileName);

    const conferenceDate = rocDateToIso(dateMatch[1]);
    if (!conferenceDate) continue;

    entries.push({ ticker, conferenceDate, pdfFileName });
  }

  return entries;
}

export async function fetchEarningsConferenceList(
  ticker: string,
  typeK: "sii" | "otc",
  rocYear: number
): Promise<EarningsConferenceEntry[]> {
  const body = `encodeURIComponent=1&step=1&firstin=1&off=1&TYPEK=${typeK}&year=${rocYear}&co_id=${encodeURIComponent(ticker)}`;
  const res = await fetchWithRetry(`${MOPS_BASE_URL}/mops/web/ajax_t100sb02_1`, body);
  if (!res.ok) {
    throw new Error(`[mops] ajax_t100sb02_1 HTTP ${res.status} for ${ticker}`);
  }
  const html = await res.text();
  return parseEarningsConferenceList(html, ticker);
}

/** 給前端直接開新分頁下載/預覽PDF用的靜態連結。FileDownLoad文件上是表單POST，但實測
 * 同一組參數包成query string一樣可以GET拿到PDF（curl驗證過200 application/pdf），
 * 瀏覽器<a href>可以直接打開，不用另外做一個proxy route轉發POST請求。 */
export function buildMopsPdfUrl(fileName: string): string {
  const filePath = encodeURIComponent("/home/html/nas/STR/");
  return `${MOPS_BASE_URL}/server-java/FileDownLoad?step=9&filePath=${filePath}&fileName=${encodeURIComponent(fileName)}`;
}

export async function downloadMopsPdf(fileName: string): Promise<Buffer> {
  const body = `step=9&filePath=${encodeURIComponent("/home/html/nas/STR/")}&fileName=${encodeURIComponent(fileName)}`;
  const res = await fetchWithRetry(`${MOPS_BASE_URL}/server-java/FileDownLoad`, body);
  if (!res.ok) {
    throw new Error(`[mops] FileDownLoad HTTP ${res.status} for ${fileName}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
