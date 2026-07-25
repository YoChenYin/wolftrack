import Anthropic from "@anthropic-ai/sdk";

/**
 * 龍頭股法說會簡報PDF擷取文字後的LLM解析，跟 youtube/parseTranscript.ts 同樣用forced
 * tool-use換取穩定結構化輸出。量更少（48檔龍頭股、一季一次），不需要在意成本。
 */
const MODEL = "claude-sonnet-5";

export interface EarningsCallAnalysis {
  profitGrowthSummary: string;
  outlookSummary: string;
  riskSummary: string;
  signal: "positive" | "neutral" | "negative";
}

const TOOL_NAME = "record_earnings_call_analysis";

const SYSTEM_PROMPT = `你是專業的財經分析師，任務是從台股上市公司法人說明會簡報（PDF擷取出的文字）中，
萃取三個重點：獲利成長、未來展望、風險因素，並給出整體基本面訊號判斷。

profitGrowthSummary：整理簡報裡提到的獲利/營收成長相關數字與趨勢（例如營收年增率、毛利率變化、
淨利成長幅度），用2-3句話總結，盡量引用簡報裡的具體數字；如果簡報沒有明確數字，就描述定性判斷
（例如「營收較上季/去年同期成長」），不要自己捏造數字。

outlookSummary：整理簡報裡對下一季/下一年度的展望或財測guidance（例如營收展望區間、資本支出計畫、
新產品/新產能規劃），2-3句話；沒有明確展望內容就寫「簡報未提供明確展望」。

riskSummary：整理簡報裡明確提到的具體風險因素或不利因素（例如客戶需求不確定性、匯率波動、產能
稀釋毛利率、地緣政治），不要把制式的Safe Harbor法律免責聲明本身當成風險內容；如果簡報除了制式
免責聲明外沒有提到具體風險，就寫「簡報未提及具體風險因素，僅有制式前瞻性聲明」。

signal：綜合以上三點給出整體基本面訊號——positive（獲利成長+展望樂觀，沒有重大風險）、
negative（獲利衰退、展望保守、或風險升高）、neutral（好壞參半或訊號不明確）。`;

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
        description: "記錄從法說會簡報分析出的獲利成長/展望/風險重點與整體基本面訊號",
        input_schema: {
          type: "object",
          properties: {
            profitGrowthSummary: { type: "string", description: "獲利/營收成長重點，2-3句話，盡量引用具體數字" },
            outlookSummary: { type: "string", description: "下一季/年度展望或guidance，2-3句話" },
            riskSummary: { type: "string", description: "簡報明確提到的具體風險因素，不是制式Safe Harbor聲明" },
            signal: { type: "string", enum: ["positive", "neutral", "negative"] },
          },
          required: ["profitGrowthSummary", "outlookSummary", "riskSummary", "signal"],
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
