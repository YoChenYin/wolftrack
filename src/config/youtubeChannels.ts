/**
 * 固定追蹤的3個台股財經YouTube頻道。少量、手動維護的參考資料，比照 group_config.json
 * 的做法用 static config 檔，不建 DB table——這裡的資料不需要在執行期被查詢/修改。
 */
export interface YoutubeChannelConfig {
  channelId: string;
  handle: string;
  displayName: string;
  /** 純文件用途，不影響排程邏輯 */
  cadenceNote: string;
}

export const YOUTUBE_CHANNELS: YoutubeChannelConfig[] = [
  {
    channelId: "UCQvsuaih5lE0n_Ne54nNezg",
    handle: "EBCmoneyshow",
    displayName: "理財達人秀 EBCmoneyshow",
    cadenceNote: "每天晚上九點更新，無字幕，走 Whisper 語音轉文字",
  },
  {
    channelId: "UC0lbAQVpenvfA2QqzsRtL_g",
    handle: "yutinghaofinance",
    displayName: "游庭皓的財經皓角",
    cadenceNote: "每天早上八點半直播，有自動字幕",
  },
  {
    channelId: "UC23rnlQU_qE3cec9x709peA",
    handle: "Gooaye",
    displayName: "Gooaye 股癌",
    cadenceNote: "沒有固定更新時間，無字幕，走 Whisper 語音轉文字",
  },
];

export function findYoutubeChannel(channelId: string): YoutubeChannelConfig | null {
  return YOUTUBE_CHANNELS.find((c) => c.channelId === channelId) ?? null;
}
