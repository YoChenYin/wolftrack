import type { MarketRegime, ScenarioCase } from "./types";

/**
 * M9 Scenario Generator（docs/decision-lab-prd.html 第9節）：規則式機率，不讓LLM自己編機率
 * （那樣無法回測校準，也違反「不預測市場」的產品原則）。每個 Regime 對應一組固定的三劇本模板，
 * 機率依 Regime 的歷史特徵設定 ⚠️初始假設值，需要 Phase 2 Decision Replay 累積命中率後回頭校準。
 */
const SCENARIO_TEMPLATES: Record<MarketRegime, ScenarioCase[]> = {
  strongBull: [
    { label: "A", description: "延續強勢，拉回即買盤進場", probability: 60, condition: "價格維持在均線之上，拉回不破20MA", risk: "追高後遇獲利了結賣壓", strategy: "順勢做多，拉回分批進場" },
    { label: "B", description: "高檔震盪整理", probability: 30, condition: "價格在近期高點附近來回", risk: "誤判整理為反轉", strategy: "觀望，等突破或跌破區間再動作" },
    { label: "C", description: "獲利了結導致回檔", probability: 10, condition: "跌破20MA且成交量放大", risk: "深度回檔傷及本金", strategy: "減碼或設好停損" },
  ],
  weakBull: [
    { label: "A", description: "延續緩漲", probability: 45, condition: "價格續創高但動能未加速", risk: "動能不足，漲勢隨時停滯", strategy: "輕倉順勢，嚴設停損" },
    { label: "B", description: "橫盤整理", probability: 40, condition: "價格區間內震盪", risk: "來回洗損", strategy: "區間操作或觀望" },
    { label: "C", description: "轉弱回測支撐", probability: 15, condition: "跌破近期低點", risk: "多頭結構轉弱", strategy: "降低曝險" },
  ],
  range: [
    { label: "A", description: "區間上緣突破", probability: 30, condition: "帶量突破區間上緣", risk: "假突破", strategy: "突破後拉回不破再進場" },
    { label: "B", description: "持續區間震盪", probability: 50, condition: "價格維持在區間內", risk: "頻繁進出侵蝕成本", strategy: "區間高賣低買，或直接觀望" },
    { label: "C", description: "區間下緣跌破", probability: 20, condition: "帶量跌破區間下緣", risk: "假跌破", strategy: "跌破後反彈不過再放空" },
  ],
  weakBear: [
    { label: "A", description: "延續緩跌", probability: 45, condition: "價格續創低但動能未加速", risk: "殺低後急彈", strategy: "輕倉順勢做空，嚴設停損" },
    { label: "B", description: "橫盤整理", probability: 35, condition: "價格區間內震盪", risk: "來回洗損", strategy: "觀望為主" },
    { label: "C", description: "止跌反彈", probability: 20, condition: "站回近期高點", risk: "空頭結構轉弱", strategy: "降低空頭曝險" },
  ],
  strongBear: [
    { label: "A", description: "延續弱勢，反彈即賣壓", probability: 55, condition: "價格維持在均線之下，反彈不過20MA", risk: "超跌反彈軋空", strategy: "順勢做空，反彈分批進場" },
    { label: "B", description: "低檔震盪整理", probability: 30, condition: "價格在近期低點附近來回", risk: "誤判整理為底部", strategy: "觀望，等跌破或止穩再動作" },
    { label: "C", description: "超跌反彈", probability: 15, condition: "帶量站回關鍵均線", risk: "空單軋損", strategy: "減碼或回補空單" },
  ],
  volatile: [
    { label: "A", description: "波動收斂，方向明朗化", probability: 35, condition: "ATR回落至20日均值附近", risk: "過早猜測方向", strategy: "降低曝險，等波動收斂再進場" },
    { label: "B", description: "劇烈雙向洗盤", probability: 45, condition: "價格大幅雙向擺盪", risk: "停損被巨幅波動打到", strategy: "縮小部位，放寬停損或觀望" },
    { label: "C", description: "波動度持續擴張", probability: 20, condition: "ATR續創新高", risk: "系統性風險事件", strategy: "大幅降低曝險，等待明朗" },
  ],
  distribution: [
    { label: "A", description: "高檔跌破，確認派發", probability: 45, condition: "跌破近期整理區間", risk: "錯過反彈", strategy: "降低多頭曝險，減碼" },
    { label: "B", description: "延長高檔震盪", probability: 40, condition: "持續在高檔區間來回", risk: "提早放空被軋", strategy: "觀望，不追高不搶空" },
    { label: "C", description: "動能回復，續創新高", probability: 15, condition: "MACD重新翻揚", risk: "誤判轉弱訊號", strategy: "維持既有多頭部位，暫不加碼" },
  ],
  accumulation: [
    { label: "A", description: "低檔突破，確認吸籌完成", probability: 45, condition: "站上近期整理區間", risk: "錯過起漲", strategy: "突破後分批布局" },
    { label: "B", description: "延長低檔震盪", probability: 40, condition: "持續在低檔區間來回", risk: "過早抄底被套", strategy: "觀望，等待突破確認" },
    { label: "C", description: "動能轉弱，再破底", probability: 15, condition: "MACD重新翻弱", risk: "誤判止穩訊號", strategy: "不搶反彈" },
  ],
  capitulation: [
    { label: "A", description: "恐慌後止穩，V型反彈", probability: 40, condition: "隔日開盤不再破前低", risk: "反彈力道不足", strategy: "小倉位試單，嚴設停損" },
    { label: "B", description: "低檔盤整消化恐慌", probability: 40, condition: "價格區間內震盪，量能萎縮", risk: "二次探底", strategy: "觀望為主，等待量縮企穩" },
    { label: "C", description: "恐慌延續，再創新低", probability: 20, condition: "持續破底且量能不減", risk: "系統性風險未解除", strategy: "維持空手或避險部位" },
  ],
};

export function generateScenarios(regime: MarketRegime): ScenarioCase[] {
  return SCENARIO_TEMPLATES[regime];
}
