import Anthropic from "@anthropic-ai/sdk";

/**
 * 玉山證券產業報告文章（純文字，見esunsecClient.ts）的LLM解析，跟
 * marketData/parseEarningsCall.ts、youtube/parseTranscript.ts同樣用forced tool-use
 * 換取穩定結構化輸出。這類文章常橫跨好幾檔同產業股票（例如矽晶圓報告列出環球晶/合晶/
 * 台勝科），所以除了摘要跟訊號，還要額外抽取提及的個股清單，格式跟parseTranscript.ts
 * 的mentions一致，方便共用resolveStockMention.ts解析成內部stockId。
 */
const MODEL = "claude-sonnet-5";

export interface InstitutionalReportMentionRaw {
  rawNameOrTicker: string;
  market: "TW" | "US" | "unknown";
}

export interface InstitutionalReportAnalysis {
  industryTheme: string;
  summary: string;
  signal: "positive" | "neutral" | "negative";
  mentions: InstitutionalReportMentionRaw[];
}

const TOOL_NAME = "record_institutional_report_analysis";

const SYSTEM_PROMPT = `你是專業的產業分析師，任務是從券商網站發布的產業趨勢文章中，萃取重點並整理成結構化資料。
這類文章常常引用投顧/法人的研究內容（例如標註「以下內容取自OO投顧」），也常常用表格列出同產業
好幾檔個股的財務數字（EPS、收盤價等）。

industryTheme：這篇文章討論的核心產業趨勢，用一句話描述（例如「矽晶圓供需缺口擴大」「AI伺服器
液冷散熱滲透率提升」），不是文章標題本身，是提煉出的主題。

summary：整理文章的核心論點，2-4句話，盡量引用文章裡的具體數字（例如產能擴充規模、供需缺口
百分比、成長率），不要自己捏造數字。

signal：綜合文章論點給出整體偏多/中性/偏空判斷——positive（產業趨勢正向、供需吃緊、成長動能強）、
negative（產業趨勢負向、供過於求、需求疲弱）、neutral（好壞參半或訊號不明確）。

mentions：文章裡明確提到「個股層級」（不是整個產業或整個市場）的公司，原文照抄名稱或代號
（例如「環球晶」或「6488」，看文章怎麼寫就照抄，不要自己正規化），market固定填"TW"（這個
資料來源只會是台股文章）。只列出文章確實點名的個股，不要把產業名稱或不相關的公司也列進去；
沒有提到任何個股就回傳空陣列。`;

export async function parseInstitutionalReport(articleText: string): Promise<InstitutionalReportAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tool_choice: { type: "tool", name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: "記錄從產業報告文章分析出的主題/摘要/訊號與提及個股清單",
        input_schema: {
          type: "object",
          properties: {
            industryTheme: { type: "string", description: "核心產業趨勢主題，一句話" },
            summary: { type: "string", description: "文章核心論點摘要，2-4句話，盡量引用具體數字" },
            signal: { type: "string", enum: ["positive", "neutral", "negative"] },
            mentions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rawNameOrTicker: { type: "string", description: "文章提到的個股名稱或代號，原文照抄" },
                  market: { type: "string", enum: ["TW", "US", "unknown"] },
                },
                required: ["rawNameOrTicker", "market"],
              },
            },
          },
          required: ["industryTheme", "summary", "signal", "mentions"],
        },
      },
    ],
    messages: [{ role: "user", content: `產業報告文章內容：\n\n${articleText}` }],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("[parseInstitutionalReport] Claude did not return a tool_use block");
  }

  return toolUse.input as InstitutionalReportAnalysis;
}
