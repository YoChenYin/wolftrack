/**
 * 固定追蹤的3個台股財經節目。少量、手動維護的參考資料，比照 group_config.json
 * 的做法用 static config 檔，不建 DB table——這裡的資料不需要在執行期被查詢/修改。
 *
 * 2026-07-15改版：這3個節目原本是照YouTube頻道追蹤，但YouTube本身（yt-dlp）在雲端環境
 * 一律被反機器人機制擋下（cookies/PO Token/代理都試過仍被擋，見docs/progress-status.md），
 * 改成追蹤這幾個節目對應的Podcast RSS feed（SoundOn/SoundCloud等標準podcast host，沒有
 * 反爬蟲機制，音檔直接HTTP下載即可）。channelId沿用原欄位名（避免大改schema/API路徑），
 * 語意變成「內部識別用的節目slug」，不再是YouTube channel ID。
 */
export interface YoutubeChannelConfig {
  channelId: string;
  displayName: string;
  /** Podcast RSS feed網址，discovery直接fetch這個 */
  podcastFeedUrl: string;
  /** 純文件用途，不影響排程邏輯 */
  cadenceNote: string;
}

export const YOUTUBE_CHANNELS: YoutubeChannelConfig[] = [
  {
    channelId: "ebc-moneyshow",
    displayName: "理財達人秀 EBCmoneyshow",
    // Podcast品牌名稱是「兆華與股惑仔」，主持人李兆華就是理財達人秀本人，同樣的股市/產業內容
    podcastFeedUrl: "https://feeds.soundon.fm/podcasts/91be014b-9f55-4bf3-a910-b232eda82d11.xml",
    cadenceNote: "幾乎每天更新（Podcast品牌名「兆華與股惑仔」，主持人李兆華）",
  },
  {
    channelId: "yutinghao-finance",
    displayName: "游庭皓的財經皓角",
    podcastFeedUrl: "https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss",
    cadenceNote: "每天早上八點半直播，Podcast同步更新",
  },
  {
    channelId: "gooaye",
    displayName: "Gooaye 股癌",
    podcastFeedUrl: "https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml",
    cadenceNote: "沒有固定更新時間",
  },
];

export function findYoutubeChannel(channelId: string): YoutubeChannelConfig | null {
  return YOUTUBE_CHANNELS.find((c) => c.channelId === channelId) ?? null;
}
