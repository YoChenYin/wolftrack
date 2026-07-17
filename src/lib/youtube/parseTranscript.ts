import Anthropic from "@anthropic-ai/sdk";

/**
 * 這個專案第一次引入 LLM API（之前完全沒有 anthropic/openai 依賴）。用 forced tool-use
 * 換取穩定的結構化輸出，而不是要求模型自己輸出JSON再手動parse——量少（每天最多3-4支
 * 影片），不需要在意成本，準確度（尤其中文財經術語/公司名判讀）比省token更重要。
 */
const MODEL = "claude-sonnet-5";

export interface TranscriptMention {
  rawNameOrTicker: string;
  market: "TW" | "US" | "unknown";
  sentiment: "bullish" | "bearish" | "neutral";
  reasoningExcerpt: string;
  /** 進場理由（例如「季報優於預期、法人開始加碼」），逐字稿沒明確提到就是null，不要硬湊 */
  entryReason: string | null;
  /** 出場條件（例如「跌破月線」「本益比超過20倍」「到目標價」），沒提到就是null */
  exitCondition: string | null;
}

export interface TranscriptAnalysis {
  summary: string;
  keySignals: string[];
  mentions: TranscriptMention[];
}

const TOOL_NAME = "record_video_analysis";

const SYSTEM_PROMPT = `你是專業的財經內容分析師，任務是從台股/美股財經YouTube節目的逐字稿中，
萃取出主持人或來賓對個股的具體看法。只記錄逐字稿裡明確、有方向性判斷依據的個股提及
（例如明確表態看多/看空、給出具體理由），不要把單純提到股票名稱但沒有立場的情況也算進去，
也不要幻覺出逐字稿沒有提到的個股。summary欄位用2-3句話總結整支影片對大盤/總經的看法。

keySignals欄位額外列出3-5條逐字稿裡明確提到、值得注意的具體訊號或數據（例如「Fed可能9月降息」
「台積電法說會上修資本支出」「外資連續5天賣超電子股」），每條一句話、越具體越好，不要跟summary
重複的空泛敘述；如果逐字稿內容真的很空洞、沒有具體訊號，回傳空陣列，不要硬湊。

如果逐字稿有提到具體的進場理由（例如「季報優於預期」「法人開始加碼」「剛突破頸線」）就填entryReason，
如果有提到出場條件/停損停利點（例如「跌破月線」「本益比超過20倍該獲利了結」「到目標價OO元」）就填
exitCondition。這兩個欄位只記錄逐字稿明確講出來的內容，沒有提到就填null，不要自己推論或硬湊一個。`;

export async function parseTranscript(transcript: string): Promise<TranscriptAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tool_choice: { type: "tool", name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: "記錄從逐字稿分析出的整體市場看法與個股提及清單",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "整支影片對大盤/總經的看法摘要，2-3句話" },
            keySignals: {
              type: "array",
              items: { type: "string" },
              description: "3-5條逐字稿明確提到的具體訊號/數據重點，沒有具體內容就回傳空陣列",
            },
            mentions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rawNameOrTicker: { type: "string", description: "逐字稿裡提到的個股名稱或代號，原文照抄" },
                  market: { type: "string", enum: ["TW", "US", "unknown"] },
                  sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                  reasoningExcerpt: { type: "string", description: "支持這個判斷的逐字稿原文摘錄或改寫" },
                  entryReason: {
                    type: ["string", "null"],
                    description: "逐字稿明確提到的進場理由，沒提到就是null，不要推論或硬湊",
                  },
                  exitCondition: {
                    type: ["string", "null"],
                    description: "逐字稿明確提到的出場條件/停損停利點，沒提到就是null，不要推論或硬湊",
                  },
                },
                required: ["rawNameOrTicker", "market", "sentiment", "reasoningExcerpt", "entryReason", "exitCondition"],
              },
            },
          },
          required: ["summary", "keySignals", "mentions"],
        },
      },
    ],
    messages: [{ role: "user", content: `逐字稿內容：\n\n${transcript}` }],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("[parseTranscript] Claude did not return a tool_use block");
  }

  return toolUse.input as TranscriptAnalysis;
}
