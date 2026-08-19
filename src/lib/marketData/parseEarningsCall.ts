import Anthropic from "@anthropic-ai/sdk";

/**
 * 龍頭股法說會簡報PDF擷取文字後的LLM解析，跟 youtube/parseTranscript.ts 同樣用forced
 * tool-use換取穩定結構化輸出。量更少（48檔龍頭股、一季一次），不需要在意成本。
 * 2026-08-19新增四個質化投資論點維度（護城河/市占率/客戶/催化劑，給個股頁「總覽」用）——
 * 不是每份簡報都會談到全部四項，用null（不是空字串）明確表示「沒提到」，不強迫LLM硬湊。
 */
const MODEL = "claude-sonnet-5";

export interface EarningsCallAnalysis {
  profitGrowthSummary: string;
  outlookSummary: string;
  riskSummary: string;
  signal: "positive" | "neutral" | "negative";
  moatSummary: string | null;
  marketShareSummary: string | null;
  customerSummary: string | null;
  catalystSummary: string | null;
}

const TOOL_NAME = "record_earnings_call_analysis";

const SYSTEM_PROMPT = `你是專業的財經分析師，任務是從台股上市公司法人說明會簡報（PDF擷取出的文字）中，
萃取重點，並給出整體基本面訊號判斷。

profitGrowthSummary：整理簡報裡提到的獲利/營收成長相關數字與趨勢（例如營收年增率、毛利率變化、
淨利成長幅度），用2-3句話總結，盡量引用簡報裡的具體數字；如果簡報沒有明確數字，就描述定性判斷
（例如「營收較上季/去年同期成長」），不要自己捏造數字。

outlookSummary：整理簡報裡對下一季/下一年度的展望或財測guidance（例如營收展望區間、資本支出計畫、
新產品/新產能規劃），2-3句話；沒有明確展望內容就寫「簡報未提供明確展望」。

riskSummary：整理簡報裡明確提到的具體風險因素或不利因素（例如客戶需求不確定性、匯率波動、產能
稀釋毛利率、地緣政治），不要把制式的Safe Harbor法律免責聲明本身當成風險內容；如果簡報除了制式
免責聲明外沒有提到具體風險，就寫「簡報未提及具體風險因素，僅有制式前瞻性聲明」。

signal：綜合以上三點給出整體基本面訊號——positive（獲利成長+展望樂觀，沒有重大風險）、
negative（獲利衰退、展望保守、或風險升高）、neutral（好壞參半或訊號不明確）。

以下四項是給散戶investor建立信心用的質化投資論點，簡報有明確談到才填，沒有明確內容就回傳
null——不要為了填滿欄位自己推論或用空泛的話硬湊（例如「公司具備競爭優勢」這種沒有具體內容的
句子不算，要有實際的技術/數字/事實佐證才記錄）：

moatSummary：簡報描述的具體競爭優勢/技術護城河（例如專利技術、良率領先、成本結構優勢、
轉換成本高、規模經濟），1-2句話，要有具體佐證，不是空泛的「競爭力強」。

marketShareSummary：簡報提到的市占率數字或排名（例如「全球市占率第二」「國內龍頭」），
原文照抄或精簡改寫，沒有具體數字/排名就是null。

customerSummary：簡報提到的主要客戶、客戶集中度、或新客戶開發進度，1-2句話，沒提到就是null。

catalystSummary：簡報提到的具體催化劑——有明確時間點或條件的利多事件（例如「新產能Q4開出」
「新產品下半年放量」「已取得大客戶認證即將出貨」），1-2句話；只是「看好後市」這種空泛說法
不算催化劑，沒有具體事件就是null。`;

export async function parseEarningsCall(pdfText: string): Promise<EarningsCallAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tool_choice: { type: "tool", name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: "記錄從法說會簡報分析出的獲利成長/展望/風險重點、整體基本面訊號，以及質化投資論點",
        input_schema: {
          type: "object",
          properties: {
            profitGrowthSummary: { type: "string", description: "獲利/營收成長重點，2-3句話，盡量引用具體數字" },
            outlookSummary: { type: "string", description: "下一季/年度展望或guidance，2-3句話" },
            riskSummary: { type: "string", description: "簡報明確提到的具體風險因素，不是制式Safe Harbor聲明" },
            signal: { type: "string", enum: ["positive", "neutral", "negative"] },
            moatSummary: { type: ["string", "null"], description: "具體競爭優勢/技術護城河，沒有明確內容就是null" },
            marketShareSummary: { type: ["string", "null"], description: "市占率數字或排名，沒有明確數字就是null" },
            customerSummary: { type: ["string", "null"], description: "主要客戶或客戶集中度資訊，沒提到就是null" },
            catalystSummary: { type: ["string", "null"], description: "有明確時間點的具體催化劑事件，沒有就是null" },
          },
          required: [
            "profitGrowthSummary",
            "outlookSummary",
            "riskSummary",
            "signal",
            "moatSummary",
            "marketShareSummary",
            "customerSummary",
            "catalystSummary",
          ],
        },
      },
    ],
    messages: [{ role: "user", content: `法說會簡報內容：\n\n${pdfText}` }],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("[parseEarningsCall] Claude did not return a tool_use block");
  }

  return toolUse.input as EarningsCallAnalysis;
}
