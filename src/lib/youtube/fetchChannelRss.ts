/**
 * Podcast RSS feed（SoundOn/SoundCloud等標準podcast host）：抓最新集數的guid/標題/發布時間/
 * MP3下載連結。2026-07-15從YouTube頻道RSS改過來——YouTube本身（yt-dlp）在雲端環境一律被
 * 反機器人機制擋下（cookies/PO Token/代理都試過仍被擋，見docs/progress-status.md），改成
 * 追蹤這些節目對應的Podcast版本，標準RSS格式沒有反爬蟲機制，音檔直接HTTP下載即可。
 * 不加XML parser套件——沿用這個專案既有client的最小依賴風格，regex逐段解析。
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
      if (!res.ok) throw new Error(`podcast RSS HTTP ${res.status}: ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(`[podcast-rss] fetch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying: ${url}`);
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

/** <title>純文字</title> 或 <title><![CDATA[文字]]></title> 兩種都要吃 */
function extractTagText(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

export interface RssVideoEntry {
  videoId: string;
  title: string;
  publishedAt: string; // ISO
  audioUrl: string;
}

export function parseChannelRss(xml: string): RssVideoEntry[] {
  const entries: RssVideoEntry[] = [];
  const itemBlocks = xml.split("<item>").slice(1); // 第一段是 channel 層級的內容，不是 item

  for (const block of itemBlocks) {
    const guid = extractTagText(block, "guid");
    const title = extractTagText(block, "title");
    const pubDate = extractTagText(block, "pubDate");
    const enclosureMatch = block.match(/<enclosure[^>]*url="([^"]*)"/);
    if (!guid || !title || !pubDate || !enclosureMatch) continue;

    const publishedAt = new Date(pubDate);
    if (Number.isNaN(publishedAt.getTime())) continue;

    entries.push({
      videoId: guid,
      title,
      publishedAt: publishedAt.toISOString(),
      audioUrl: decodeXmlEntities(enclosureMatch[1]),
    });
  }

  return entries;
}

export async function fetchChannelRss(podcastFeedUrl: string): Promise<RssVideoEntry[]> {
  const xml = await fetchText(podcastFeedUrl);
  return parseChannelRss(xml);
}
