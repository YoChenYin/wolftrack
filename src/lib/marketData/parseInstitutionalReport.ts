import Anthropic from "@anthropic-ai/sdk";

/**
 * 玉山證券產業報告文章（純文字，見esunsecClient.ts）的LLM解析，跟
 * marketData/parseEarningsCall.ts、youtube/parseTranscript.ts同樣用forced tool-use
 * 換取穩定結構化輸出。這類文章常橫跨好幾檔同產業股票（例如矽晶圓報告列出環球晶/合晶/
 * 台勝科），所以除了摘要跟訊號，還要額外抽取提及的個股清單，格式跟parseTranscript.ts
 * 的mentions一致，方便共用resolveStockMention.ts解析成內部stockId。
 *
 * 2026-08-21改版：參考Trend Core（gooptions.cc）的呈現方式，把「一段長摘要」升級成
 * 「聚焦產業瓶頸、關鍵數據變數、牛熊對抗」的結構化解析——summary/signal保留（既有UI/
 * pendingCount篩選邏輯依賴signal!==null判斷解析完成，不能拿掉），新增keyMetrics（文章
 * 點名的具體數字變數）、bullCase/bearCase（看多/看空的核心邏輯+驗證條件/瓶頸），
 * mentions也從單純「提到哪些個股」升級成「這檔股票在這個趨勢裡的立場/供應鏈層級/角色」。
 *
 * title/publishDate/source/category刻意不讓LLM重新萃取——這些在discoverNewArticles()
 * 階段就已經從esunsec的文章列表API拿到了，是可靠的原始metadata，讓LLM從內文重新猜一次
 * 只會多一個「LLM猜的跟discovery階段記錄的對不上」的風險，沒有任何好處。
 */
const MODEL = "claude-sonnet-5";

export type MentionSentiment = "bullish" | "bearish" | "neutral";
export type SupplyChainLayer = "upstream" | "midstream" | "downstream" | "support";

export interface InstitutionalReportMentionRaw {
  rawNameOrTicker: string;
  market: "TW" | "US" | "unknown";
  /** 這檔股票在這篇文章論述裡的立場——不一定跟文章整體signal一致（例如報告整體偏多，
   * 但下游成本受害的個股在這篇裡是bearish） */
  sentiment: MentionSentiment;
  /** 供應鏈層級，文章沒有明確講清楚這檔股票在鏈裡的位置就填null，不要用產業慣例硬猜 */
  chainLayer: SupplyChainLayer | null;
  /** 這檔股票在這個趨勢裡扮演的角色，10字以內，例如"CoWoS產能供應商"「終端組裝受惠」，
   * 文章沒有具體講就填null */
  role: string | null;
}

export interface KeyMetric {
  label: string;
  value: string;
}

export interface BullCase {
  coreLogic: string;
  /** 驗證/觸發條件，文章沒有明確講就是null，不要自己推論 */
  trigger: string | null;
}

export interface BearCase {
  coreLogic: string;
  /** 目前最大瓶頸或限制，文章沒有明確講就是null，不要自己推論 */
  bottleneck: string | null;
}

export interface InstitutionalReportAnalysis {
  industryTheme: string;
  summary: string;
  signal: "positive" | "neutral" | "negative";
  keyMetrics: KeyMetric[];
  bullCase: BullCase;
  bearCase: BearCase;
  tags: string[];
  mentions: InstitutionalReportMentionRaw[];
}

const TOOL_NAME = "record_institutional_report_analysis";

const SYSTEM_PROMPT = `你是專業的產業分析師，任務是從券商網站發布的產業趨勢文章中，萃取重點並整理成結構化資料。
這類文章常常引用投顧/法人的研究內容（例如標註「以下內容取自OO投顧」），也常常用表格列出同產業
好幾檔個股的財務數字（EPS、收盤價等）。

整體原則：只根據文章實際寫的內容萃取，不要自己推論或用空泛的話硬湊；文章沒有明確講的欄位，
寧可回傳null/空陣列，也不要為了填滿欄位自己編數字或邏輯。

industryTheme：這篇文章討論的核心產業趨勢，用一句話描述（例如「矽晶圓供需缺口擴大」「AI伺服器
液冷散熱滲透率提升」），不是文章標題本身，是提煉出的主題。

summary：整理文章的核心論點，80字以內，盡量引用文章裡的具體數字（例如產能擴充規模、供需缺口
百分比、成長率），不要自己捏造數字。

signal：綜合文章論點給出整體偏多/中性/偏空判斷——positive（產業趨勢正向、供需吃緊、成長動能強）、
negative（產業趨勢負向、供過於求、需求疲弱）、neutral（好壞參半或訊號不明確）。

keyMetrics：文章裡明確提到、支撐這個產業趨勢論點的具體數字變數，最多5個，例如
[{"label":"CoWoS月產能","value":"45k/月→60k/月"},{"label":"水冷滲透率","value":"15%→40%"}]。
只列文章有明確數字佐證的（產能、滲透率、成長率、財務數字等），不是每篇文章都有這麼多明確數字，
沒有就回傳空陣列，不要硬湊。

bullCase：這篇文章隱含或明講的看多邏輯。coreLogic用一句話講核心看多理由；trigger是驗證這個
看多邏輯的觸發或確認條件（例如「毛利率止跌回升」「Q3法說會上修展望」），文章沒有明確講就填null。
即使文章整體signal是negative，只要文章裡有提到任何正面因素或多頭論點，也要整理進bullCase
（沒有的話coreLogic可以直接說「文章未提出明確看多論點」）。

bearCase：跟bullCase對稱，看空/風險邏輯。coreLogic是核心看空理由；bottleneck是目前最大的
瓶頸或限制（例如「先進封裝產能排擠」「終端需求能見度不足」），文章沒有明確講就填null。
即使文章整體signal是positive，也要整理文章裡提到的任何風險/瓶頸因素進bearCase
（沒有的話coreLogic可以直接說「文章未提出明確風險因素」）。

tags：這篇文章討論的產業關鍵字標籤，例如["水冷散熱","CPO","CoWoS"]，抓文章裡實際出現、
足以代表這篇文章主題的專有名詞/技術名詞，不要抓太籠統的詞（例如"半導體""台股"這種泛用詞不算）。

mentions：文章裡明確提到「個股層級」（不是整個產業或整個市場）的公司：
- rawNameOrTicker：原文照抄名稱或代號（例如「環球晶」或「6488」，看文章怎麼寫就照抄，不要自己正規化）
- market：固定填"TW"（這個資料來源只會是台股文章）
- sentiment：這檔股票在文章論述裡的多空立場，不一定跟整篇文章的signal一致
- chainLayer：這檔股票在供應鏈的位置——upstream(上游材料/設備)、midstream(中游零組件)、
  downstream(下游系統/代工)、support(支援/周邊服務)，文章沒有明確講清楚就填null，不要用
  產業慣例自己硬猜這檔股票的供應鏈位置
- role：這檔股票在這個趨勢裡扮演的角色，10字以內（例如「CoWoS產能供應商」「終端組裝受惠」），
  文章沒有具體講就填null
只列出文章確實點名的個股，不要把產業名稱或不相關的公司也列進去；沒有提到任何個股就回傳空陣列。`;

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
        description: "記錄從產業報告文章分析出的主題/摘要/訊號/關鍵數據/牛熊論述與提及個股清單",
        input_schema: {
          type: "object",
          properties: {
            industryTheme: { type: "string", description: "核心產業趨勢主題，一句話" },
            summary: { type: "string", description: "文章核心論點摘要，80字以內，盡量引用具體數字" },
            signal: { type: "string", enum: ["positive", "neutral", "negative"] },
            keyMetrics: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "數據變數名稱，例如「CoWoS月產能」" },
                  value: { type: "string", description: "數值或變化區間，例如「45k/月→60k/月」" },
                },
                required: ["label", "value"],
              },
            },
            bullCase: {
              type: "object",
              properties: {
                coreLogic: { type: "string", description: "看多核心邏輯，一句話" },
                trigger: { type: ["string", "null"], description: "驗證/觸發條件，文章沒有明確講就是null" },
              },
              required: ["coreLogic", "trigger"],
            },
            bearCase: {
              type: "object",
              properties: {
                coreLogic: { type: "string", description: "看空/風險核心邏輯，一句話" },
                bottleneck: { type: ["string", "null"], description: "目前最大瓶頸或限制，文章沒有明確講就是null" },
              },
              required: ["coreLogic", "bottleneck"],
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "產業關鍵字標籤，例如[\"水冷散熱\",\"CPO\",\"CoWoS\"]",
            },
            mentions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rawNameOrTicker: { type: "string", description: "文章提到的個股名稱或代號，原文照抄" },
                  market: { type: "string", enum: ["TW", "US", "unknown"] },
                  sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                  chainLayer: {
                    type: ["string", "null"],
                    enum: ["upstream", "midstream", "downstream", "support", null],
                    description: "供應鏈位置，文章沒有明確講清楚就是null",
                  },
                  role: { type: ["string", "null"], description: "這檔股票在這個趨勢裡的角色，10字以內，沒有具體講就是null" },
                },
                required: ["rawNameOrTicker", "market", "sentiment", "chainLayer", "role"],
              },
            },
          },
          required: ["industryTheme", "summary", "signal", "keyMetrics", "bullCase", "bearCase", "tags", "mentions"],
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
