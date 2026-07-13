/**
 * YouTube 頻道 RSS feed（https://www.youtube.com/feeds/videos.xml?channel_id=...）：
 * 免 API key 就能拿到最新 ~15 支影片的 videoId/標題/發布時間，比申請 YouTube Data API v3
 * key 更輕量（這個功能只需要「有沒有新影片」，不需要完整的頻道管理能力）。
 * 不加 XML parser 套件——feed 結構固定（每個 <entry> 內 videoId/title/published 各出現一次
 * ，title 在 media:group 的 media:title 重複之前），regex 逐段解析就夠用，比照這個專案
 * 既有 client（twseClient.ts 等）的最小依賴風格。
 */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`youtube RSS HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(`[youtube-rss] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying: ${url}`);
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

/** XML entity 解碼，feed 標題常見 &amp; &quot; &#39; 等 */
function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export interface RssVideoEntry {
  videoId: string;
  title: string;
  publishedAt: string; // ISO
}

export function parseChannelRss(xml: string): RssVideoEntry[] {
  const entries: RssVideoEntry[] = [];
  const entryBlocks = xml.split("<entry>").slice(1); // 第一段是 feed 層級的內容，不是 entry

  for (const block of entryBlocks) {
    const videoIdMatch = block.match(/<yt:videoId>([^<]*)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([^<]*)<\/title>/);
    const publishedMatch = block.match(/<published>([^<]*)<\/published>/);
    if (!videoIdMatch || !titleMatch || !publishedMatch) continue;

    entries.push({
      videoId: videoIdMatch[1],
      title: decodeXmlEntities(titleMatch[1]),
      publishedAt: publishedMatch[1],
    });
  }

  return entries;
}

export async function fetchChannelRss(channelId: string): Promise<RssVideoEntry[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml = await fetchText(url);
  return parseChannelRss(xml);
}
