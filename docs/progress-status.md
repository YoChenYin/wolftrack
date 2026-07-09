# WolfTrack 開發進度追蹤

> 這份文件記錄目前已完成的項目、已知限制、以及下一階段待辦，每次階段性完成後更新。
> 對應規格文件：`trend-core-core-features-spec.md`、`trend-core-implementation-logic.md`（美股版）、`wolftrack-tw-spec.md`（台股版）。

最後更新：2026-07-09

---

## 零、部署與自動化（2026-07-04）

**Git/GitHub**：專案已推到 https://github.com/YoChenYin/wolftrack（main branch），5 個邏輯 commit（US MVP / Polygon整合 / TW基礎+ModuleABC / TWSE真實資料 / 進度文件）+ 這次的部署準備 commit。

**程式碼側已完成**：
- `scripts/run-daily-batch.ts`（美股）、`scripts/tw-daily-batch.ts`、`scripts/tw-fetch-valuation.ts`（台股）的核心邏輯都抽成可 import 的函式（`src/lib/marketData/run*.ts`），CLI script 變成薄包裝
- 新增 `scripts/tw-daily-update.ts` + `runTwDailyUpdate()`：**之前一直缺的「台股每日增量更新」**，只補「今天」一天（STOCK_DAY_ALL + T86 + TAIEX當月，3-4次API請求），不用重跑整包回填，已實測跑通
- 兩支排程用 API：`POST /api/cron/us-batch`、`POST /api/cron/tw-daily`，用 `Authorization: Bearer <CRON_SECRET>` 驗證（`src/lib/cronAuth.ts`），採 fire-and-forget（立刻回 202，實際工作在背景跑完，因為美股批次要跑~25分鐘，遠超過一般 reverse proxy 的 HTTP timeout）
- `.github/workflows/daily-batch.yml`：GitHub Actions 排程（美股約美東19:30、台股約台北17:00），用 `secrets.APP_URL` + `secrets.CRON_SECRET` 打上面兩支 API（Zeabur 沒有簡單的原生 cron 機制可以宣告式排程任意 script，改用這個平台無關的做法）
- `package.json` 的 `start` 改成 `prisma migrate deploy && next start`，部署時自動套用 migration，不用手動一步
- **修了一個部署前測出來的 bug**：`/` 和 `/tw` 被 Next.js 誤判成可以靜態預渲染（build time 凍結一份快照），即使它們都是直接查資料庫顯示每日訊號——已加 `export const dynamic = "force-dynamic"` 修正，並且已經跑過 `next build` + `next start` 確認 production build 正常

**部署狀態（2026-07-06）：已上線並跑通真實資料**
- 正式站：https://wolftrack.zeabur.app （US 首頁 `/`、TW 版 `/tw`）
- Production DB 已 migrate + seed + 美股批次（13檔真實分類）+ 台股全量回填（62檔TWSE股票，含PE/PB）都跑過，`/tw/stock/[ticker]` 的 Module C 供應鏈估值比較也在正式站驗證過正常

**部署過程中抓到兩個真實 bug（都已修正並 push）**：
1. **TWSE/Polygon 的 `fetch()` 沒設 timeout**：卡住的連線會讓 `await` 永遠不 resolve，且不會拋錯——production 的台股回填因此卡了整整兩天沒被發現（只能靠比對 process CPU 時間 vs log 檔案最後更新時間才抓出來）。已加 `AbortController` + 30 秒 timeout（`twseClient.ts`、`polygonClient.ts`）。
2. **`STOCK_DAY_ALL`（每日更新用的「當日全市場」端點）比逐檔查詢的 `STOCK_DAY` 端點資料還舊**，實測差到 3 個交易日。因為 `/api/sector-trends` 用全域 `MAX(trade_date)` 篩選，只要有任何一檔股票的資料比較新，其他「稍微舊一點」但其實還在合理範圍的股票就會整批從面板消失。已把 `runTwDailyUpdate()` 改成逐檔用 `STOCK_DAY`（跟回填用同一個資料源），犧牲一點效率（62次請求~80秒 vs 1次請求）換取日期基準一致。

**接下來只有你能做的（需要 Zeabur/GitHub 帳號權限）**：
1. ~~Zeabur 建立專案~~ ✅已完成
2. ~~部署 Next.js 服務~~ ✅已完成（https://wolftrack.zeabur.app）
3. ~~設定環境變數~~ ✅已完成（`DATABASE_URL`/`POLYGON_API_KEY`/`CRON_SECRET`）
4. ~~跑 seed~~ ✅已完成
5. ~~台股歷史回填~~ ✅已完成（62檔全部成功）
6. ~~GitHub Actions 排程驗證~~ ✅已確認（2026-07-08，使用者回報已穩定跑好幾天）

---

## 一、美股版（WolfTrack）

### 1.1 MVP 核心（已完成）
- 專案骨架：Next.js 16 + TypeScript + Tailwind v4 + PostgreSQL（Prisma 7，driver adapter 模式）
- DB schema：`stocks`、`sector_mapping`、`daily_trend_signals` 三張核心表
- 計算引擎：`src/lib/trend/`
  - `indicators.ts`：SMA/EMA/RSI/MACD/ADX/ROC
  - `coreScore.ts`：五因子加權 Core Score（均線排列30% / 動能25% / ADX 20% / 相對強度15% / 量能10%）
  - `classify.ts`：三段式分類（反轉雷達 → 蓄勢待發 → 趨勢穩健，互斥判斷順序）
  - `calculateDailySignal.ts`：orchestrator，整合上述三者
- API：`GET /api/sector-trends?market=&sector=&theme=&mode=&limit=`，只回傳「最新一個有資料的交易日」
- 前端：板塊選擇器 + 題材篩選器 + 三欄戰術面板（`/`），首頁 Server Component 直查 DB，切換用 Client Component fetch API

### 1.2 真實資料整合（已完成）
- Polygon.io API 串接：`src/lib/marketData/polygonClient.ts`（Aggregates/Bars API）+ `rateLimiter.ts`（免費方案 5 req/分鐘節流）
- 批次計算腳本 `scripts/run-daily-batch.ts`：抓真實日線 → 跑計算引擎 → 寫入 `daily_trend_signals`，支援 `npx tsx scripts/run-daily-batch.ts TICKER1,TICKER2` 只跑指定股票
- `npm run market:test` 快速測連線、`npm run market:batch` 跑全量批次
- API key 存在 `.env`（未進 git），`.env.example` 已建立

### 1.3 股票池與題材標籤（已完成）
- 117 檔美股（原 15 檔 + 擴充至 ~103 檔涵蓋完整 11 個 GICS 板塊 + 14 檔 AI 供應鏈題材股）
- 板塊：Energy / Materials / Industrials / Consumer Discretionary / Consumer Staples / Healthcare / Financials / Technology / Communication Services / Utilities / Real Estate
- 題材標籤系統（`themes` + `stock_themes` 多對多）：AI infra / 散熱 / 被動元件 / CPO / PCB，題材篩選 UI 已上線

### 1.4 已知限制 / 待確認
- Core Score 五因子權重、三段分類門檻值（回檔5-15%、ADX>25、量能1.5倍等）都是 ⚠️假設值，需業務/量化端用歷史資料回測校準（見 `src/lib/trend/classify.ts`、`coreScore.ts` 的 TODO 註解）
- 三種分類條件都不符合時的 `"none"` 內部狀態（不寫入 DB、不進戰術面板）是本次實作補上的設計，spec 未定義，需業務端確認是否合理
- 真實資料批次目前需手動執行（`npm run market:batch`），沒有排程；後續要嘛手動定期跑、要嘛接 Zeabur Cron Job
- 個股詳情頁（6M/1Y 趨勢區間圖、反轉難度）尚未建置，目前只有三欄戰術面板

---

## 二、台股版（WolfTrack TW）

### 2.1 基礎架構（已完成）
- `Market` enum（US/TW）：`stocks`、`sector_mapping` 加 `market` 欄位共用美股版的表，唯一鍵改為 `(market, ticker)` / `(market, sectorCode)`
- `TrendStatus` 擴充 `limitMove`：台股觸及漲跌停(±10%)當天的特殊狀態，`classify()` 收到 `isLimitMove=true` 會直接短路，不跑三段式邏輯
- `adjustPrice()`（`src/lib/trend/tw/adjustPrice.ts`）：除權息還原股價（前復權），所有技術指標計算前都會先跑過
- `isLimitMoveDay()`（`src/lib/trend/tw/limitMove.ts`）：用**還原前**的原始價格判斷，避免跟除權息調整互相干擾
- 路由：`/tw`（首頁）+ `/tw/stock/[ticker]`（個股詳情頁），共用 `MarketNav` 分頁切換元件（`/` 美股 / `/tw` 台股，URL 分開可個別分享）
- 台股示範資料：8 個產業板塊（半導體業/電腦及週邊設備業/電子零組件業/金融保險業/塑膠工業/鋼鐵工業/航運業/通信網路業）+ 20 檔示範股票（2330台積電等）

### 2.2 Module A：籌碼面基礎（已完成）
- 新表 `tw_institutional_trading`（三大法人買賣超，張數+金額都存）、`tw_broker_branch_flow`（券商分點進出，**這次只建表結構，偵測邏輯未做**）
- `daily_trend_signals` 新增 `chip_score`、`technical_score` 欄位
- `calculateChipScore()`（`src/lib/trend/tw/chipScore.ts`）：投信40% + 外資35% + 自營商10% + 三方align15%，用「買賣超張數佔量能比例」正規化
- Core Score（台股版）= 0.5 × technical + 0.5 × chip（`coreScoreTw.ts`）

### 2.3 Module B：籌碼集中度指標（已完成）
- `calculateChipConcentration()`（`src/lib/trend/tw/chipConcentration.ts`）：Concentration(5)/(10)/(20)，✅已確認公式（張數計算）
- `chip_momentum`（轉強/持平/轉弱）+ `chip_badge`（籌碼確認✅/籌碼背離⚠️，只在 status=bullish 時標記）
- 三欄戰術面板已顯示徽章（`TrendColumn.tsx`）

### 2.4 Module C：供應鏈估值比較（2026-07-04 PE/PB 真實資料已接上，完整跑通）
- `src/config/group_config.json`：spec 第四章骨架（16個產業概念分類 + 2個集團概念分類）+ 2 個使用者新增族群（探針卡概念股、伺服器機殼滑軌概念股）
  - **members 已填入 15 個熱門族群，共 71 檔不重複股票代號**（2026-07-03 使用者提供）：AI伺服器/AI Storage/機器人/先進封裝/CoWoS/AI ASIC/ABF載板/探針卡/光通訊/CPO/液冷散熱/AI電力/伺服器機殼滑軌/PCB/高頻高速材料
  - 其餘族群（HBM、FOPLP、面板、電動車、能源…等）members 仍是空陣列，待補
  - 一檔股票可同時屬於多個族群，已驗證正確（如 2308 台達電同時屬於「機器人概念股」和「AI電力概念股」）
  - ⚠️分類判斷：FPC軟板類（4958臻鼎-KY、6269台郡）併入「PCB概念股」、8358金居併入「高頻高速材料概念股」（無現成對應 theme，判斷為最接近的既有分類）
- `groupConfig.ts`：直接 `import` JSON，模組系統自動達成「啟動時載入記憶體快取」，不需自己寫 cache 邏輯
- `calculateValuationPercentile()` + `screenLaggingStocks()`（純函式，已用假資料驗證正確）
- 個股詳情頁 side panel：Core Score 拆解（技術面 vs 籌碼面）+ 供應鏈估值比較區塊
- **71 檔 members 已全數補進 `stocks` 資料表**（`prisma/seedTw.ts`，2026-07-03），台股股票池從 20 檔擴到 **86 檔**，個股詳情頁都能點進去看（例：`/tw/stock/6223` 旺矽科技，正確顯示「探針卡概念股」）
- **`seed:tw-mock-signals` 已重構為自動涵蓋全部台股**（2026-07-04）：原本是寫死 20 檔的 `TICKER_SCENARIOS` 陣列，改成用 ticker hash 決定性衍生 drift/vol/chipBias 參數，不用每加新股票就手動調整；重跑後 86 檔全部有假訊號資料（2580 筆三大法人買賣超、207 筆 daily_trend_signals），三欄戰術面板和個股詳情頁（含新增的機器人/PCB/散熱概念股，如 2049上銀正確顯示「籌碼背離⚠️」）都驗證過正常顯示
- **PE/PB 真實資料源已接上**：TWSE `BWIBBU_ALL`（一次請求拿全部上市股票本益比/股價淨值比/殖利率），新表 `tw_stock_fundamentals` 存快照，`scripts/tw-fetch-valuation.ts` 抓取，62 檔 TWSE 股票全部有真實 PE/PB
- `computeGroupValuation()`（`src/lib/valuation/computeGroupValuation.ts`）：整合 PE/PB 百分位 + 真實近20日報酬率（算自 `tw_daily_price`）+ 落後股篩選，成員缺資料（上櫃股/未回填）會顯示 N/A、不計入落後股名單，不會壞掉
- 個股詳情頁 side panel 已改用真實數據渲染（表格：代號/PE/PE百分位/PB/近20日報酬/落後股標記/龍頭標籤）
- **已用 2330（台積電）端到端驗證**：「先進封裝概念股」族群近20日平均+3.8% > 大盤+2.4%（題材正熱）；2330 PE=32.9 排族群最低（百分位0%，最便宜）但近20日只漲2.5%、落後族群平均，**正確被標記「供應鏈落後股」**——即使是族群龍頭，只要估值便宜又漲得比同族群慢，一樣會被抓出來，邏輯完全對；3131（缺真實資料的成員）正確顯示 N/A 沒有壞掉
- **待辦**：這次沒有回填的個別股票（例如3131弘塑，屬於 CoWoS設備族群，不確定是否為 TWSE 上市或單純漏了）值得之後再核對一次名單

### 2.5 已知限制 / 待確認（給業務/資料團隊）
1. **Core Score 技術面/籌碼面 50/50 權重**是否合理？（spec 待確認清單第1項）
2. **Foreign_Score 公式偏離 spec 原定義**：spec 用「外資買超金額 + 持股比例變化」，但目前沒有可靠的成交金額分母或持股比例資料，暫時比照投信邏輯改用「買超張數佔量能比例」，之後接上真實外資持股比例資料要改回來（`chipScore.ts` TODO）
3. **籌碼確認/背離的降級邏輯**：spec 寫「分類降級為蓄勢待發**或**標記籌碼背離」，語意不夠肯定，目前採用較保守的「只標記徽章、不改動 status」，需業務端確認是否要真的降級（`calculateTwDailySignal.ts` TODO）
4. **adjustPrice() 前復權 vs 後復權**：目前假設用前復權，需資料團隊確認（spec 待確認清單第5項）
5. **tw_broker_branch_flow 偵測邏輯（主力券商進駐）未做**：表已建，資料供應商尚未確認（spec 待確認清單第3項）
6. **投信認養偵測、外資階梯加碼、融資融券風險警示**（spec 3.2/3.3/3.5）：這次 A/B/C 範圍都沒有涵蓋，屬於「五、沿用美股版但需微調的功能」和「輔助訊號區」，尚未開發
7. **group_config.json 的 members 清單**：骨架已就緒，需使用者提供實際股票代號清單，優先順序建議照 spec 「熱門概念股排行榜前20名」（AI、半導體、NVIDIA、AI伺服器、CoWoS、重電、AI電力、光通訊…）
8. **PE/PB 本益比/股價淨值比資料源未接**：`calculateValuationPercentile()` 目前是純函式，沒有 `tw_stock_fundamentals` 之類的表，需另外決定資料來源（MOPS？第三方？）
9. ~~沒有真實 TWSE/TPEx OpenAPI 資料~~ **2026-07-04 已接上 TWSE**（見 2.6），~~TPEx（上櫃）仍是缺口~~ **2026-07-09 已用 FinMind 補上**（見 2.8）
10. **趨勢王者重現的籌碼疊加條件**（spec 5.1）、**回測需排除除權息跳空+檢查可否融券**（spec 5.2）：尚未開發（美股版的「Trend Core 選股」本身也還沒做）
11. Benchmark（大盤指數）與個股序列的日期對齊：**美股版**（`run-daily-batch.ts`）仍用陣列長度差推算 index，未修；**台股版**已改用真實日期對照（`tw-daily-batch.ts` 用 `benchmarkDateIndex` Map by date），更精確

### 2.6 台股真實資料源（TWSE，2026-07-04 新完成）
- **資料來源確認**：TWSE OpenAPI 可用，TPEx 新版 OpenAPI 沒有歷史資料（見上方限制第9項）
  - `STOCK_DAY`（個股單月日線，上市股專用，逐月請求，是回填成本的主因）
  - `STOCK_DAY_ALL`（當日全部上市股票快照，一次請求拿全部，給每日增量更新用）
  - `T86`（三大法人各股買賣超日報，一次請求拿當日全部股票，原始單位是股，已換算成張）
  - `MI_5MINS_HIST`（加權指數 TAIEX 歷史，逐月請求，跟個股用同一套邏輯）
  - `BWIBBU_ALL`（本益比/殖利率/股價淨值比快照，client 函式已寫但這次沒接進 Module C，是現成的 PE/PB 資料源候選）
- **架構決策**：TWSE 沒有「一檔股票、日期範圍」的高效歷史 API（不像 Polygon），改用**兩張快取表**：
  - `tw_daily_price`：原始（未還原）日線快取，回填一次後之後每天只補一天，不用重新拉2年
  - `tw_institutional_trading`：只需回填近 ~25 個交易日（chip score/concentration 最多看20日），用「當日全部股票」的 T86 一次請求拿全部追蹤股票的資料，比逐檔請求有效率很多
  - TAIEX 大盤指數做成一筆合成的 `Stock` 紀錄（`ticker="TAIEX"`, `isActive=false`），重用 `tw_daily_price` 存放，不用另開表
- **86 檔台股裡，62 檔確認是上市（TWSE）、23 檔是上櫃（TPEx，暫無歷史資料）、1 檔查無資料**（4573高明鐵，代號可能有誤或已下市，待查）
- `src/lib/marketData/twseClient.ts`：`fetchStockDayHistory`/`fetchTaiexHistory`（回填用）、`fetchAllStocksToday`/`fetchInstitutionalTradingByDate`（每日增量用）、`fetchValuationAllToday`（PE/PB，未接）
- `scripts/tw-backfill.ts`：一次性歷史回填（62檔 x 25個月 ≈ 1550次請求，跑 30-40+ 分鐘，背景執行）
- `scripts/tw-daily-batch.ts`：從 DB 讀回歷史計算訊號（輕量，不打 API），支援指定 ticker
- **已用 2330（台積電）真實資料端到端驗證**：468 天真實日線（2024-07-01 起）、真實三大法人買賣超、技術指標數值合理（ma20=2383/ma50=2311/ma200=1785 多頭排列、RSI=57、ADX=18.2）、reversal_point_date 抓到真實的 2025-12-26 黃金交叉、status="none"（ADX 不到25門檻，正確沒有勉強分類）
- **62 檔全量回填已完成**（中途因網路 ECONNRESET 崩潰過一次，已修復 twseClient.ts 加入重試機制 + tw-backfill.ts 單檔失敗不影響其他股票，之後續跑完成）
- **`tw-daily-batch.ts` 已對 62 檔全量跑過，15 檔有真實戰術分類結果**（5反轉/3蓄勢/7穩健），**1 檔真實觸發 `limitMove` 特殊狀態**（6213聯茂電子，首次用真實市場資料驗證這個邏輯路徑），其餘 46 檔今天是 `none` 或資料筆數不足（4585達明機器人剛上市~183天歷史，還不夠算200MA）
- **修了一個資料完整性 bug**：舊的 `seed:tw-mock-signals` 假資料剛好也用「今天」當日期錨點，跟真實資料的交易日重疊，導致面板一度混雜「真的算出來的股票」跟「剛好日期撞上的舊 mock 資料」（例：6187萬潤，TPEx股，被誤判成當天有真實 pullback 訊號）。已清掉所有「沒有 ≥210 天真實股價資料」股票的舊 `daily_trend_signals`/`tw_institutional_trading` 殘留（清了 59+750 筆），面板現在只會顯示真的有能力追蹤的股票，其餘乾脆不顯示（誠實的空狀態，不是 bug）
- **順手修了一個美股批次的 bug**：`run-daily-batch.ts` 查詢股票時沒有加 `market: "US"` 篩選，因為 `stocks` 表美股台股共用後，會把 86 檔台股代號也拿去問 Polygon（當然問不到，純浪費時間，沒有寫入錯誤資料）；`seedDailySignals.ts` 也順手補了同樣的防禦性篩選
- **美股資料也順便重新整理**：原本停在 2026-07-01（3天沒更新），重跑後更新到 2026-07-02，`daily_trend_signals`（US）從 9 筆增加到 22 筆
- **待辦**：「每日增量更新」腳本（用 `fetchAllStocksToday`+`fetchInstitutionalTradingByDate` 補一天，不用重新回填2年）還沒寫，這次只做了回填 + 從DB算訊號兩支；4573高明鐵確認查無資料（TWSE/TPEx都找不到，代號可能有誤或已下市，待查證）

### 2.7 台股股票池擴大到 386 檔（2026-07-08）

**動機**：使用者發現目前評估三種戰術狀態（反轉雷達/蓄勢待發/趨勢穩健）的台股只有 62 檔（86 檔股票池裡扣掉 23 檔 TPEx 上櫃 + 1 檔查無資料），要求擴大到「所有上市上櫃股票」。確認後範圍縮小為：**只擴 TWSE 上市股（TPEx 上櫃股仍無歷史資料源，維持排除）**、**先擴到數百檔熱門股（而非全市場 ~1368 檔），依市值排名取新增前 300 大**（避免一次回填全市場的時間成本）。

**選股方法**：
1. 抓 `t187ap03_L`（TWSE 上市公司總表，含產業別代碼、已發行股數）+ `STOCK_DAY_ALL`（當日收盤價），算 `市值 = 已發行股數 × 收盤價`
2. 排序後排除原本已在股票池的 87 檔（含 TAIEX），取市值前 300 大新股票（整體排名約 #14~#359，因為前面部分已在既有池中）
3. 抽樣驗證：2330 台積電市值排名 #1，符合預期，方法可信

**產業分類擴充**：原本只有 8 個手選熱門板塊（半導體/電腦及週邊/電子零組件/金融/塑膠/鋼鐵/航運/通信網路），這次補上 TWSE 官方剩餘 25 個產業別代碼（水泥/食品/紡織纖維/電機機械/電器電纜/玻璃陶瓷/造紙/橡膠/汽車/建材營造/觀光餐旅/貿易百貨/其他業/化學/生技醫療/油電燃氣/光電/電子通路/資訊服務/其他電子/綠能環保/數位雲端/運動休閒/居家生活/存託憑證），**分類代碼與名稱取自 TWSE ISIN 分類查詢頁的官方下拉選單**（`isin.twse.com.tw/isin/class_i.jsp?kind=1`），不是用樣本公司名稱亂猜的，共 33 個板塊。

**歷史回填深度決策**：訊號計算需要至少 210 個交易日（200MA 暖身期，`MIN_BARS_REQUIRED`），既有全量回填腳本預設 25 個月（~500 交易日）緩衝較多；這次 300 檔一次性回填，把 `scripts/tw-backfill.ts` 改成可用第二個 CLI 參數覆寫回填月數（預設值不變，不影響既有腳本行為），這次跑 **13 個月（~247 交易日）**，仍遠超過 210 天門檻，把一次性回填時間從預估 ~3.6 小時砍到約 ~1.5 小時。

**執行結果**（本地 + production 都跑過，流程一致）：
- Seed：34 個台股板塊（9 舊 + 25 新）、387 檔台股（87 舊 + 300 新，含 TAIEX），386 檔 `isActive=true`
- 回填：300 檔全部成功（0 失敗），三大法人資料 9047 筆寫入
- 訊號批次：386 檔裡約 40 多檔進入三種戰術狀態分類（含 limitMove），200~300+ 檔為 `none`（不符合任何狀態門檻，誠實顯示為空，不是 bug），約 40 檔因新股上市不滿 210 天被跳過
- PE/PB：360 檔寫入，26 檔查無資料（`BWIBBU_ALL` 快照沒有涵蓋，可能是新股或特殊股種）
- **已知殘留問題**：跑完後有少數幾檔（本地2檔、production 8檔，跑完 `tw-daily-update.ts` 收斂後降到1檔）最新交易日比全域最新日期慢 1-3 天，跟 2.6 節記錄過的「TWSE 個別股票資料更新速度不一致」是同一種已知現象（不是這次新增的 bug），會隨著每日排程自動追上，未特別處理

**其他順手完成**：`ValuationSidePanel.tsx`（Module C 供應鏈估值比較的成員清單表格）補上公司名稱顯示，原本只有代號（`GroupValuationMember.companyName` 資料本來就有，純顯示層修改）

**部署插曲**：這次推上去的程式碼變更（含前述公司名稱顯示）發現 Zeabur 沒有自動重新部署——原因不明（GitHub 有收到 push，但 Zeabur 後台完全沒有新的部署紀錄），使用者手動去後台觸發才成功部署。**這件事之後每次 push 完都要留意**，不能假設 Zeabur 的 GitHub auto-deploy 一定會自動觸發，需要使用者自己去後台確認/手動觸發。

### 2.8 上櫃（TPEx）股票歷史資料缺口補上（2026-07-09，用 FinMind）

**背景**：2.6 節記錄過的長期已知限制——TWSE 官方 API 沒有上櫃股資料，TPEx 自己的 OpenAPI（`tpex.org.tw/openapi/`）查過 swagger 規格確認全部端點都是「當日快照」、沒有日期區間查詢參數，舊版有歷史功能的 CSV 下載端點雖然這次重測不再被 Cloudflare 擋（回應 200），但回傳資料是空的（可能需要額外參數或改用 POST，沒有深究）。股票池擴大到 386 檔後，一直卡在 mock 資料的上櫃股數量累積到 24 檔（含之前查無資料的 4573 高明鐵）。

**解法**：找到 [FinMind](https://finmindtrade.com)（開源金融資料 API，GitHub 上有維護），實測確認：
- `TaiwanStockPrice` 資料集明確涵蓋「上市、上櫃、興櫃」，且是「一檔股票、任意日期區間」單次請求就拿到全部（不像 TWSE `STOCK_DAY` 要逐月請求），24 檔上櫃股回填只要 24 次請求就能拿到近 2 年（504 個交易日）歷史，幾秒內跑完
- `TaiwanStockInstitutionalInvestorsBuySell`（三大法人買賣超）、`TaiwanStockPER`（PE/PB）也都涵蓋上櫃股，一樣支援日期區間查詢
- 免費不需註冊/API key：300 次/小時；官網說明註冊後可提升到 600 次/小時
- 只拿來補上櫃股這塊缺口，完全不動現有 TWSE 上市股那一套邏輯（風險較低的做法）

**新增/修改的檔案**：
- `src/lib/marketData/finmindClient.ts`（新）：`fetchFinMindStockPrice`、`fetchFinMindInstitutionalTrading`、`fetchFinMindLatestValuation`
- `scripts/tpex-backfill.ts`（新）：一次性回填，自動抓出「目前完全沒有 `tw_daily_price` 資料」的 TW 股票（也可指定 ticker），寫進跟 TWSE 上市股共用的同一組表（`tw_daily_price`/`tw_institutional_trading`），下游訊號計算完全不用改
- `fetchTwValuationSnapshot.ts`：TWSE `BWIBBU_ALL` 快照裡沒中的股票（幾乎都是上櫃股），改用 FinMind 逐檔查最新 PE/PB 補上
- `runTwDailyUpdate.ts`（每日排程用）：TWSE `STOCK_DAY` 對上櫃股會回傳空資料（不是錯誤），改用 FinMind 抓近10天取最新一筆補上，三大法人買賣超也一樣用 FinMind 逐檔補（TWSE 的 T86 沒有上櫃股），確保上櫃股之後每天會持續更新，不會回填完就再度變成舊資料

**執行結果**（本地 + production 都跑過）：
- 回填：24 檔全部成功，0 失敗，0 查無資料
- 訊號批次：「資料不足（<210天）」從 41 檔降到 17 檔（差額 24 剛好對應這批上櫃股）
- PE/PB：可寫入數從 360 提升到 383（386 檔裡只剩 3 檔查無資料）
- production API 驗證：3498 陽程科技（上櫃股）出現在正式站「反轉雷達」分類清單，確認資料面到前端全部打通

### 2.9 股票池收斂成「科技類股 + 金融股」，用使用者提供的產業分類清單強化資料品質（2026-07-09）

**背景**：使用者提供一份詳細的「台灣純科技股清單」（`taiwan_pure_tech_stock_universe_2026`），5 大分類（半導體先進製程/AI伺服器與硬體基礎建設/被動元件與連接器模組/次世代網通與矽光子CPO/關鍵利基科技）、22 個子分類，每檔股票附具體「角色」描述，比我們自己分次拼湊的分類更嚴謹精確。使用者要求：(1) 用這份清單強化現有分類與股票池正確性，(2) 移除 `group_config.json` 裡完全沒被程式碼使用的 `group_concepts`（台灣集團+國際供應鏈），(3) 把戰術分類的股票池收斂成「科技類股 + 金融股」，移除傳統產業。

**資料品質把關（重要）**：清單直接拿去用之前，先用 FinMind 的 `TaiwanStockInfo` 逐一驗證全部 130 檔代號/名稱是否對得上官方登記資料，抓出 **4 個代號錯誤**（不是每個代號都照抄，避免把錯的資料帶進資料庫）：
  - 均豪（均豪精密工業）清單寫 2421，但 2421 其實是建準電機（已知），均豪真實代號是 **5443**
  - 聯陽（聯陽半導體）清單寫 3041，但 3041 其實是揚智科技，聯陽真實代號是 **3014**
  - 信昌電（信昌電子陶瓷）清單寫 2407，這個代號根本不存在，真實代號是 **6173**
  - 凌華（凌華科技）清單寫 6160，但 6160 其實是欣技，凌華真實代號是 **6166**

**執行內容**：
1. **新增 40 檔清單裡尚未追蹤的股票**到 `seedTw.ts`（130 檔扣掉已追蹤的 88 檔、代號修正後又少 2 檔重複），公司全名查自 TWSE `t187ap03_L` / TPEx `mopsfin_t187ap03_O` 官方名冊，`industry` 欄位直接用清單的角色描述
2. **91 檔已追蹤且清單裡也有的股票**，`industry` 欄位從原本的粗略分類（如「IC設計」）換成清單的具體角色描述（如「PC/NB 輸出入控制 IC 龍頭 / 穩健配息」）
3. **`group_config.json` 重寫**：用清單的 5大類/22子分類取代舊有的 `AI科技/半導體/光通訊/資料中心/被動元件/工業電腦/電子科技` 7 個類別（新架構更嚴謹），保留不受影響的 `機器人/記憶體儲存/面板顯示/通訊航太/電動車/能源/景氣循環/金融消費/ETF` 9 個類別不變；`group_concepts` 整個刪除（`groupConfig.ts` 的 `GroupConfig` 型別也同步移除該欄位）
4. **股票池收斂**：`seedTw.ts` 新增 `NON_TECH_SECTOR_CODES`（水泥/食品/紡織/鋼鐵/航運/建材/觀光餐旅/貿易百貨/汽車/化學/油電燃氣/橡膠/玻璃陶瓷/造紙/電器電纜/運動休閒/居家生活等17個板塊）在 seed 時動態算 `isActive=false`（軟移除，歷史資料保留，之後要恢復隨時可以，跟 TAIEX 的做法一樣）；官方分類本身混雜科技與非科技股的 `TW20`（其他業）、`TW91`（存託憑證）改成逐檔判斷（例：保留 8033雷虎科技/9105泰金寶科技，移除 910322康師傅控股/9933中鼎工程等）；使用者確認「生技醫療業/綠能環保/電機機械」算科技類保留；新增/更新的股票即使官方分類落在排除板塊（例如 2231為升電裝、1773勝一化工），也用逐檔 `isActive: true` 覆寫強制保留，因為它們明確在使用者的科技股清單裡
5. **結果**：427 檔台股裡 **320 檔啟用（科技+金融）、107 檔軟移除**（非科技傳統產業）

**意外插曲：抓到一個 18+ 小時的資料庫連線卡死 bug**：對 production 跑 40 檔新股回填時，過程中卡住完全沒有錯誤訊息，隔了一段時間才發現（用 `ps -p <pid> -o etime` 比對進度才驚覺卡了超過18小時）。根本原因跟先前 `fetch()` 沒設 timeout 那次是同一種模式，但這次是資料庫連線側：`pg.Pool`（Prisma 的 driver adapter）預設沒有 `statement_timeout`，長時間執行的腳本連到遠端 production DB，連線中途斷掉的話，pending 的 query 會永遠卡住、不會拋錯也不會 timeout。已修正 `src/lib/prisma.ts`，`PrismaPg` 建構子加上 `statement_timeout: 30_000`、`connectionTimeoutMillis: 10_000`、`idleTimeoutMillis: 30_000`。中斷點之後的 7 檔股票重新回填，這次順利跑完沒再卡住。

**執行結果驗證**（本地 + production 都跑過，並在正式站確認）：
- Seed：427 檔台股（87舊 + 300舊擴充 + 40新），320 檔 `isActive=true`
- 40 檔新股回填：16 檔 TWSE（`tw-backfill.ts`）+ 24 檔 TPEx（`tpex-backfill.ts`）全部成功
- 訊號批次 + PE/PB：新股正確進入分類（例：3265台星科=reversal、6121新普科技=pullback）
- production 驗證：`/tw/stock/2330` 的供應鏈估值比較面板正確顯示新分類名稱「晶圓代工與重權值」（確認 `group_config.json` 重寫已部署上線）；`/api/sector-trends` 確認新股票（6121新普科技等）出現在戰術分類清單

---

## 三、下一步可能的方向（尚未排入具體任務，等使用者決定優先順序）

1. ~~台股真實資料源~~ **TWSE 已接（見 2.6）**，~~TPEx（23檔上櫃股）需要另找歷史資料來源~~ **已用 FinMind 補上（見 2.8）**；每日增量更新腳本還沒寫
2. ~~group_config.json 補完~~ **已完成**（使用者 2026-07-03 提供 71 檔熱門族群清單）
3. **PE/PB 資料源**：TWSE `BWIBBU_ALL` 是現成候選（已寫 `fetchValuationAllToday()` client 函式，這次沒接進 Module C），要不要直接用、或仍要找 MOPS/第三方另外決定
4. **券商分點進出偵測邏輯**（spec 3.4「主力券商進駐」）：需先確認資料供應商（CMoney/嘉實 XQ/Fugle 等）
5. **投信認養偵測 / 外資階梯加碼 / 融資融券風險警示**（spec 3.2/3.3/3.5）
6. **排程化**：美股 `market:batch`、台股「每日增量更新」（還沒寫，要用 `fetchAllStocksToday`+`fetchInstitutionalTradingByDate` 補一天）都還是手動跑，掛到 Zeabur Cron Job
7. **個股詳情頁補完**（美股版+台股版）：6M/1Y 趨勢區間圖、三大法人買賣超歷史圖、5/10/20日籌碼集中度排列圖
8. **部署到 Zeabur**：目前只在本地跑，還沒有正式部署流程
9. Trend Core 選股（歷史回測，美股版 spec 第二章第4點 / 台股版 spec 5.2）：兩版都還沒做

---

## 四、環境/操作備忘

- 本地 DB：既有 Homebrew Postgres 17（非 Docker），資料庫名稱 `wolftrack`
- `npx prisma db seed`：seed 美股 sectors/stocks/themes + 台股 sectors/stocks（**不含**任何訊號資料，避免覆蓋真實資料）
- `npm run seed:mock-signals`：美股假訊號資料（demo 用，會覆蓋掉已存在的真實資料，小心使用）
- `npm run seed:tw-mock-signals`：台股假訊號資料（demo 用，目前台股沒有真實資料源，可放心跑）
- `npm run market:test` / `npm run market:batch`：美股真實資料（Polygon.io）
- `npx tsx scripts/tw-backfill.ts [ticker1,ticker2,...]`：台股真實資料歷史回填（TWSE，一次性/低頻，全量約30-40+分鐘，建議背景執行）
- `npx tsx scripts/tw-daily-batch.ts [ticker1,ticker2,...]`：從 DB 讀回歷史算台股訊號（輕量，不打 API，`tw-backfill.ts` 跑完後才有資料可算）
- `npx tsx scripts/test-twse-connection.ts [stockNo]`：快速測 TWSE 連線
- 修改 `prisma/schema.prisma` 後，除了 `prisma generate`，**dev server 也要重啟**才會讀到新的 Prisma Client（HMR 不會自動更新 generated client）
