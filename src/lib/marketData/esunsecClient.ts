/**
 * 玉山證券（esunsec.com.tw）「台股熱點」「總經盤勢」文章，給法人報告tab用（見
 * runInstitutionalReportIngest.ts）。這個網站沒有正式公開API，但文章列表頁跟內文頁
 * 都是伺服器端渲染，資料直接內嵌在HTML的data屬性/內文區塊裡（不像有些SPA要真的執行JS
 * 才看得到內容），純fetch()+regex就能解析，不用開headless browser——沿用這個專案
 * mopsClient.ts既有的「沒有乾淨JSON API就regex逐段解析，不加HTML parser套件」風格。
 *
 * ⚠️只接受esunsec.com.tw這一個來源，且只抓「台股熱點」「總經盤勢」兩個分類——2026-08-19
 * 選型時確認過這兩個分類的文章常直接引用投顧研究內容（例如標註「以下內容取自玉山投顧」），
 * 比較貼近使用者要的「法人產業報告」；其餘分類（ETF、存股策略、投資入門等）偏教育性質。
 * robots.txt對這個網站的User-agent: *沒有Disallow規則，跟MoneyDJ（明文禁止LLM/AI用途、
 * 逐一封鎖ClaudeBot等）或cnyes（Disallow: /news/）不同，選型時已確認過這點。
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

const BASE_URL = "https://www.esunsec.com.tw";

export const ESUNSEC_CATEGORIES = [
  { id: "3E9D118F-F053-4F43-BF83-0702E3F07DEB", label: "台股熱點" },
  { id: "97A8BF02-C370-4230-BFA2-5BBE89923EB8", label: "總經盤勢" },
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT }, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`esunsec HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(`[esunsec] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying: ${url}`);
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(quot|amp|#39|apos|lt|gt|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** "2026/08/14" -> "2026-08-14" */
function slashDateToIso(dateStr: string): string {
  return dateStr.trim().replace(/\//g, "-");
}

export interface EsunsecArticleSummary {
  postId: string;
  title: string;
  publishDate: string; // ISO date
  sourceUrl: string;
  category: string;
  isMemberOnly: boolean;
}

/**
 * 分類頁（/article/category?category=X）內嵌一個`data-initial-items="{...}"`屬性，
 * 值是HTML-entity編碼過的JSON字串，裡面就是這個分類最新一批文章的完整清單（含title/
 * url/date/summary/category/isMemberOnly）——不用另外解析卡片HTML排版。
 */
export async function fetchCategoryArticles(categoryId: string, categoryLabel: string): Promise<EsunsecArticleSummary[]> {
  const html = await fetchHtml(`${BASE_URL}/article/category?category=${categoryId}`);
  const match = html.match(/data-initial-items="([^"]*)"/);
  if (!match) return [];

  const json = decodeHtmlEntities(match[1]);
  let parsed: { list?: { title: string; url: string; date: string; isMemberOnly?: boolean }[] };
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    console.error(`[esunsec] failed to parse data-initial-items JSON for category ${categoryLabel}:`, err);
    return [];
  }

  return (parsed.list ?? [])
    .map((item) => {
      const postIdMatch = item.url.match(/postid=([A-Za-z0-9-]+)/);
      if (!postIdMatch) return null;
      return {
        postId: postIdMatch[1],
        title: item.title,
        publishDate: slashDateToIso(item.date),
        sourceUrl: `${BASE_URL}${item.url}`,
        category: categoryLabel,
        isMemberOnly: item.isMemberOnly ?? false,
      };
    })
    .filter((item): item is EsunsecArticleSummary => item !== null);
}

/** 從html裡tagOpenIndex開始（指向"<div"這個開始字元），找出深度平衡的完整區塊（含結尾</div>） */
function extractBalancedDiv(html: string, tagOpenIndex: number): string | null {
  const firstTagEnd = html.indexOf(">", tagOpenIndex);
  if (firstTagEnd === -1) return null;

  const tokenRe = /<div\b|<\/div>/gi;
  tokenRe.lastIndex = firstTagEnd + 1;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html))) {
    if (match[0].toLowerCase() === "</div>") {
      depth--;
      if (depth === 0) return html.slice(tagOpenIndex, match.index + match[0].length);
    } else {
      depth++;
    }
  }
  return null; // 沒有找到平衡的結尾，HTML結構跟預期不同
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 文章內文頁（/article/post?postid=X）的正文包在`data-detail-item=""`的div裡（跟
 * 上面文章卡片區塊剛好同名class但不同div，用data-detail-item這個獨有屬性精準定位），
 * 內含小標題(h2)、段落(p)，有些段落會直接標註「以下內容取自OO投顧」引用法人研究內容。
 * 抓不到（例如網站改版、或整篇是isMemberOnly會員限定內容）回傳null，呼叫端當跳過處理。
 */
export async function fetchArticleFullText(postId: string): Promise<string | null> {
  const html = await fetchHtml(`${BASE_URL}/article/post?postid=${postId}`);
  const attrIndex = html.indexOf("data-detail-item");
  if (attrIndex === -1) return null;

  const divOpenIndex = html.lastIndexOf("<div", attrIndex);
  if (divOpenIndex === -1) return null;

  const block = extractBalancedDiv(html, divOpenIndex);
  if (!block) return null;

  const text = htmlToPlainText(block);
  return text.length > 0 ? text : null;
}
