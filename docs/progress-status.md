# WolfTrack 開發進度追蹤

> 這份文件記錄目前已完成的項目、已知限制、以及下一階段待辦，每次階段性完成後更新。
> 對應規格文件：`trend-core-core-features-spec.md`、`trend-core-implementation-logic.md`（美股版）、`wolftrack-tw-spec.md`（台股版）。

最後更新：2026-07-09（籌碼領先/板塊熱圖/資金流動折線圖）

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

### 2.10 首頁大改版：板塊下拉選單、PE/PB比較表、熱圖、資金流動折線圖、籌碼領先觀察名單（2026-07-09）

**日期碎片化 bug 修正**：使用者回報「三個戰術區塊股票很少，有些甚至沒有」，查出來不是真的股票少，是查詢邏輯的 bug——`/api/sector-trends` 原本用「嚴格等於全域最新交易日」篩選，320+ 檔股票裡只要有 1 檔資料比其他人新（TWSE逐檔查詢天生會有1-2天落差），其餘幾百檔全部從面板消失（親眼在production看到320檔裡只剩1檔對得上日期）。改成「每檔股票自己最新一筆訊號」（`distinct: ['stockId']` + `orderBy tradeDate desc`），只要求在7天內，不要求跟其他股票同一天。修好後本地測試從幾乎全空回升到8/10/10（後兩欄還頂到顯示上限）。

**板塊改用 group_config.json theme_name**：原本首頁「板塊」篩選是 TWSE 官方產業別（`sector_mapping`），改成 `group_config.json` 的 43 個 theme_name，更貼近使用者實際想篩的供應鏈/概念族群。因為 theme 只涵蓋部分股票（見下方缺資料股票段落），額外加「未分類」虛擬選項，「全部」選項維持不限縮範圍。篩選 UI 也從按鈕列改成原生 `<select>` 下拉選單。

**選了板塊後顯示 PE/PB 估值比較表**：新增 `/api/theme-valuation`，重用個股詳情頁「供應鏈估值比較」的 `computeGroupValuation()` 邏輯與資料，把重複的表格 JSX 抽成共用元件 `GroupValuationTable`。

**板塊熱圖**：新增 `/api/theme-heatmap`，一次算出全部43個theme的5/10/20日族群平均報酬率，做成可捲動的表格（`max-h-80 overflow-y-auto` + sticky表頭），點列可直接篩選該板塊。

**板塊資金流動折線圖**：新增 `/api/theme-flow`，以 group_config.json 的14個大分類（比43個theme少很多，才畫得清楚）為單位，算過去20個交易日的族群平均累積報酬指數時間序列，用純手刻 SVG 折線圖呈現（沒有加圖表函式庫依賴），可點圖例隱藏/顯示個別分類線、hover看當天各分類數值。

**發現並補上 24 檔缺資料的股票**：使用者回報 3491/8088/5351/1789 等股票在供應鏈估值比較裡沒有資料，查出來是這些代號在 `group_config.json` 某些 theme 的 members 清單裡（來自最早期使用者提供的概念股清單），但當初從沒被加進 `stocks` 主檔，導致 `computeGroupValuation()` 對這些代號回傳全 null。全面掃描抓出 29 檔類似情況，其中 5 檔是 ETF（0050/0056/00878/00919/00929，我們的資料模型沒有ETF支援，PE/PB/基本面完全不適用，列為已知缺口不處理），另外 24 檔是真股票，用 FinMind 交叉驗證代號正確性後全部補進 `stocks`（18檔TWSE + 6檔TPEx），本地+production都完成回填。

**新增「籌碼領先」第四類觀察名單**：使用者提出財經問題「技術面OK時，籌碼有沒有可能還沒跟上」，討論後決定把這個洞察做成功能——抓「技術面尚未觸發任何戰術分類（本來的status="none"，完全不會被顯示）、但籌碼集中度已經加速轉強」的股票。判斷條件：`chipMomentum="strengthening"`（集中度5日>10日>20日且5日>0，代表連續三個窗口都在加速）+ `chipScore>=60` + `chipConcentration5>=1%`。門檻**先用 `scripts/validate-chip-leading.ts` 對本地真實資料驗證過**才正式做成功能（344檔追蹤股票，244檔當天是none，45檔符合條件，抽樣看訊號品質合理，非任意數字）。

技術實作：`daily_trend_signals` 原本status="none"的訊號完全不會寫入資料庫（省空間，但也代表沒辦法查詢），這次新增 `TrendStatus` enum 值 `chipLeading`（Prisma migration `20260709140941_add_chip_leading_status`，純新增列舉值不影響既有資料），讓符合條件的「none」訊號改用這個新狀態寫入，複用既有的 upsert 邏輯不用改批次腳本主體。因為只是籌碼面訊號、少了技術面確認，可信度天生較低，UI上刻意跟主要三欄拉開視覺份量（虛線邊框、「⏳籌碼領先·待確認」標題，放在三欄下方而非並列第四欄）。

**其他順手完成**：
- 公司名稱顯示統一移除「股份有限公司」尾綴（`stripCompanySuffix()`，只影響顯示，DB存的還是全名）
- PE/PE百分位/PB/近20日/落後股標記，以及三個戰術欄位的選股條件，都加上 hover「？」說明（`InfoTooltip` 元件，純CSS hover不用JS事件）

**執行結果**（本地+production都跑過，並在正式站逐項驗證過）：
- `chipLeading` 訊號：production 跑出20檔進入籌碼領先觀察名單（例：微星科技 chipScore=95.3、兆豐金 92.5）
- 24檔缺資料股票補齊後，`/api/theme-valuation` 正確回傳真實 PE/PB（例：3491昇達科技 PE=138.95、8088品安科技 PE=21.62）
- production 逐項確認：板塊dropdown、PE/PB表格、板塊熱圖、資金流動折線圖、籌碼領先名單、公司名稱簡化、hover說明，全部正常顯示

（註：2.10之後、本節之前，還有回測引擎/門檻校正、月營收、MA5>MA10>MA20訊號、產業鏈訊號燈號等功能，這份文件尚未補上對應章節，之後有空再補。）

### 2.11 YouTube財經頻道「網紅視角」：頻道抓取＋LLM解析＋個股交叉驗證（2026-07-13）

**目標**：抓取3個台股財經YouTube頻道（理財達人秀EBCmoneyshow、游庭皓的財經皓角、Gooaye股癌）的內容，用LLM解析出提到的個股、看多看空立場、對大盤的看法；把影片提到但系統還沒追蹤的個股加進資料庫；並把每支被提到股票的影片情緒和系統當下的TrendStatus分類做交叉比對，找出「網紅已經看多但系統還沒亮燈」的落差案例。

**實測驗證過的關鍵事實**：新影片清單用頻道RSS feed（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）就能拿到，不需要YouTube Data API v3 key；3個頻道裡只有游庭皓有自動字幕，理財達人秀和股癌完全沒有字幕，必須語音轉文字——這是使用者明確選擇的架構決策點：不用付費雲端STT（OpenAI/Groq），改用GitHub Actions runner跑開源faster-whisper模型（`small`，int8），免費但受GH Actions分鐘數限制、非即時。

**技術實作**：
- Schema新增 `YoutubeVideo`/`YoutubeStockMention` 兩張表 + `TranscriptSource`/`MentionSentiment`/`MentionAgreement` 三個enum（migration `20260713131014_add_youtube_mentions`）
- `src/config/youtubeChannels.ts`：3個頻道的固定清單（比照group_config.json的做法，少量參考資料用static config不建DB table）
- `src/lib/youtube/fetchChannelRss.ts` + `runYoutubeDiscovery.ts` + `/api/cron/youtube-discovery`：RSS掃描新影片
- 新增獨立的 `.github/workflows/youtube-transcribe.yml`（Python + yt-dlp + faster-whisper，跟其他cron job用途差很多特別拆開）+ `scripts/youtube-transcribe.py`：字幕優先，沒字幕才下載音訊跑Whisper，結果回傳給 `/api/youtube/ingest-transcript`
- `src/lib/youtube/parseTranscript.ts`：這個專案第一次引入LLM API（`@anthropic-ai/sdk`，新增`ANTHROPIC_API_KEY`），用forced tool-use結構化輸出解析逐字稿
- `src/lib/youtube/resolveStockMention.ts`：個股名稱/代號解析，只有「唯一明確匹配」才自動insert新股（US個股絕不自動新增，模糊/多筆候選留白交人工確認）；`finmindClient.ts`新增`fetchFinMindStockInfo()`
- `src/lib/marketData/backfillSingleTwStock.ts`：新股自動新增後必須立即單股回補歷史價格/法人資料，否則`runTwDailyBatch`（需≥210天資料）和`runTwDailyUpdate`（只碰已有價格歷史的股票）永遠不會處理這支新股
- UI：`/tw`首頁「網紅視角」區塊 + 個股detail頁「近期媒體提及」面板

**交叉驗證語意**：`TrendStatus`完全沒有看空分類，所以video情緒=bearish/neutral一律`noData`；bullish時，系統當下有訊號=`agree`，沒有訊號=`aheadOfSystem`（最有價值的案例，不叫`disagree`避免誤導成系統判斷錯誤）。

**本地驗證過程中發現並修正的bug**：
1. FinMind的`TaiwanStockInfo`同一個ticker常有多筆列（產業分類歷史變更快照，例如某股票曾是「半導體業」後來改「電子工業」），不去重的話`resolveStockMention`會誤判成「查到多筆不同候選」而放棄自動解析——修成依`date`取最新一筆去重。
2. 更關鍵的發現：FinMind的公司註冊資料裡有些ticker（實測案例：3614誠致）查得到公司名稱/產業別，但TWSE和FinMind都沒有任何實際交易價格歷史（可能是下市或註冊未實際掛牌）。原本的設計只要FinMind比對到唯一候選就自動insert並設`isActive:true`，這種案例會插入一筆永遠不會有資料、系統也永遠不會處理的死股票。修正：新股insert後立即嘗試回補，若拿回0筆價格資料，自動把該股票`isActive`設回`false`，避免弄髒追蹤清單。

**執行結果驗證**（本地，`ANTHROPIC_API_KEY`未設定所以LLM解析這段沒有真的跑，其餘全部驗證過）：
- `npm run build`成功，`tsc --noEmit`/`eslint`全部乾淨
- 呼叫`/api/cron/youtube-discovery`：3個頻道共發現45支新影片，正確寫入`youtube_videos`
- 手動跑`scripts/youtube-transcribe.py`的核心流程：游庭皓一支影片走字幕路徑成功（10613字），理財達人秀一支39秒短片走Whisper路徑成功（231字），都正確POST回`/api/youtube/ingest-transcript`並存入DB（`transcriptSource`分別為`caption`/`whisper`）
- LLM解析因為沒有API key會fire-and-forget失敗，但有正確被catch記錄、不影響transcript已經存好這件事
- `resolveStockMention`直接單元測試：ticker精確匹配、公司名稱比對（含股份有限公司尾綴正規化）、查無資料、US股不自動新增、FinMind唯一候選自動新增（含上述bug修正後的驗證）都各自測過
- `/tw`和`/tw/stock/2330`頁面確認渲染出「網紅視角」/「近期媒體提及」新區塊

**部署前使用者需要手動處理**：Zeabur設定新環境變數`ANTHROPIC_API_KEY`（這個功能第一次用到LLM API）。

### 2.12 部署上線後發現：GitHub Actions的IP被YouTube反機器人機制擋下來，改成Docker+Zeabur跑（2026-07-14~15）

部署後實測，discovery（RSS）正常運作，但`scripts/youtube-transcribe.py`在GitHub Actions runner上一律失敗：`ERROR: [youtube] ...: Sign in to confirm you're not a bot`。這是yt-dlp社群裡常見的問題——YouTube會針對雲端/CI的IP範圍（尤其GitHub Actions，因為太多公開repo拿它做類似爬取）加強反機器人檢查。

**依序試過兩種免費繞過方式，都沒解決：**
1. **Cookies認證**：從備用Google帳號匯出cookies.txt，存成GitHub secret `YOUTUBE_COOKIES`，`scripts/youtube-transcribe.py`帶著跑（`cookiefile`選項）。第一次只匯出了`.youtube.com`網域（漏了`.google.com`底下的關鍵登入驗證cookies），補上後兩個網域都有了，還是一樣的錯誤。
2. **偽裝手機App用戶端**：yt-dlp的`extractor_args: {youtube: {player_client: ["android","ios","web"]}}`，繞過網頁版client需要的PO token驗證，跟cookies一起加上去，還是被擋。

**結論**：GitHub Actions這個特定服務的IP被鎖得比cookies/client偽裝能解的範圍更嚴格。跟使用者討論後，決定改成在Zeabur的container上直接跑yt-dlp+faster-whisper（原本選GitHub Actions就是為了不要讓這個CPU密集的工作跟正式站搶資源，這次是已知取捨、使用者知情後接受的風險）。

**技術實作**：
- 新增repo根目錄`Dockerfile`（Zeabur偵測到Dockerfile會自動改用Docker建置，不用額外設定）：`node:22-slim`基底，裝`python3`/`python3-venv`/`ffmpeg`，Python套件裝在venv裡（Debian新版系統Python的PEP668限制，不能直接pip install），`yt-dlp`+`faster-whisper`+`requests`
- 本地驗證：暫時移除`.env`後跑`next build`跟`prisma generate`都成功（這個專案所有頁面都是`force-dynamic`，不需要build time連DB），降低Docker build階段失敗的風險（沒辦法在這個環境直接跑`docker build`測試）
- 新增`src/app/api/cron/youtube-transcribe/route.ts`：cron-authorized，用Node的`child_process.spawn`跑`python3 scripts/youtube-transcribe.py`，APP_URL改指向`http://127.0.0.1:$PORT`（同一個container內部呼叫，不用繞出去外部網址），fire-and-forget回傳202
- `.github/workflows/daily-batch.yml`：`youtube-transcribe` job改成單純curl觸發這支新端點（跟其他cron job一樣的模式），移除原本`youtube-transcribe.yml`裡一大段Python/yt-dlp/faster-whisper/cookies安裝設定（整個獨立workflow檔案刪除）
- `scripts/youtube-transcribe.py`的cookies/player_client邏輯保留（沒有害處，萬一Zeabur的IP之後也被盯上還能當備案），但不再是必要條件

**部署後待驗證**：Zeabur用Dockerfile建置有沒有成功、yt-dlp在Zeabur的IP上是否真的不會被擋、faster-whisper轉錄會不會明顯拖慢正式站回應速度。

**驗證結果（2026-07-15）**：Docker建置成功、網站沒中斷，但**Zeabur的IP一樣被YouTube擋**（同樣的"Sign in to confirm you're not a bot"錯誤），而且**有無字幕都一樣被擋**——證實反機器人檢查發生在yt-dlp判斷「這支影片有沒有字幕」之前更上游的資訊擷取階段，不是字幕/音訊個別被擋。查資料才發現：YouTube從2024-2026開始針對某些用戶端強制要求**BotGuard attestation + PO Token**，這是比cookies更新一層的驗證機制，單純cookies或偽裝用戶端已經不夠。

**改用`bgutil-ytdlp-pot-provider`**（yt-dlp官方PO Token指南推薦的方案）：一個Node.js寫的本地HTTP server（預設監聽127.0.0.1:4416）負責產生PO Token，搭配對應的yt-dlp python plugin（`pip install bgutil-ytdlp-pot-provider`）。Dockerfile新增：clone `Brainicism/bgutil-ytdlp-pot-provider`（pin在1.3.1版）、`npm ci && npx tsc`建置出`server/build/main.js`；新增`docker-entrypoint.sh`在背景啟動這個provider server後再用`exec npm run start`跑主服務（兩個服務共用同一個container）。本地測試過（clone+build+啟動server+`yt-dlp -v`確認plugin正確抓到`bgutil:http-1.3.1 (external)`）沒問題，但因為本地IP本來就沒被擋，沒辦法在本地驗證這是否真的解決YouTube那邊的封鎖，要等部署後才知道。

**PO Token也沒解決（2026-07-15）**：部署後實測，`bgutil` provider server確認成功啟動（log印出"Started POT server (v1.3.1)..."），Zeabur container內部網路也正常（python腳本能正常抓pending清單、回報結果），但yt-dlp還是被擋，包含**有字幕的影片也一樣被擋**——證實反機器人檢查發生在yt-dlp判斷「這支影片有沒有字幕」之前更上游的資訊擷取階段。額外測了「每支影片間加5-10秒隨機延遲、只測3支」排除是頻率觸發的可能性，結果一樣全部立刻失敗。至此cookies、client偽裝、換平台（GitHub Actions→Zeabur）、PO Token、降低頻率，5種免費方法全部確認無效，指向IP本身的名聲已經被列入比「缺Token」更嚴重的封鎖層級，不是技術手段能解的（yt-dlp的issue tracker上也有其他人回報同樣結論：換一個新IP問題就消失了）。

### 2.13 改用Podcast RSS取代YouTube+yt-dlp（2026-07-15）

使用者提出「這3個節目是不是也有Podcast版本」——查證後發現**三個節目都有官方Podcast版本，且內容/主持人相同**：
- Gooaye股癌：SoundOn平台，`https://feeds.soundon.fm/podcasts/954689a5-.../xml`，679集（股癌本身就是以Podcast起家的節目）
- 游庭皓的財經皓角：SoundCloud平台，集數標題跟YouTube版本完全一致，確認是同一節目
- 理財達人秀（EBC）：Podcast品牌名稱是「兆華與股惑仔」，主持人就是理財達人秀主持人李兆華本人，同樣的股市/產業內容

實測Podcast的MP3是直接放在Backblaze B2 + Cloudflare CDN（SoundOn）或SoundCloud自家CDN上，一般HTTP GET就能下載，沒有任何反爬蟲機制——這代表可以完全移除yt-dlp/cookies/PO Token/代理這整條路線，改成單純的「抓RSS + 下載MP3 + faster-whisper」。

**技術實作**：
- Schema：`YoutubeVideo`新增`audioUrl`欄位存MP3下載連結（migration `20260715150256_add_youtube_video_audio_url`）；`channelId`/`videoId`欄位沿用原名但語意改成「節目slug」/「episode guid」，避免大改schema/API路徑
- `src/config/youtubeChannels.ts`：`channelId`改成內部slug（`ebc-moneyshow`/`yutinghao-finance`/`gooaye`），新增`podcastFeedUrl`
- `src/lib/youtube/fetchChannelRss.ts`：整個重寫，從YouTube的Atom feed格式（`<entry>`/`<yt:videoId>`）改成標準Podcast RSS格式（`<item>`/`<guid>`/`<enclosure url="...">`），本地測試過三個真實feed都正確解析
- `scripts/youtube-transcribe.py`：整個簡化，移除yt-dlp/cookies/extractor_args/字幕判斷邏輯，改成`requests.get(audio_url, stream=True)`直接下載MP3再丟給faster-whisper，程式碼行數少了一半以上
- `Dockerfile`：移除`git`、yt-dlp、bgutil-ytdlp-pot-provider整套建置步驟，移除`docker-entrypoint.sh`（不用再背景啟動PO Token provider），改回單純`CMD ["npm","run","start"]`

**驗證**：本地真的下載一集股癌實際節目（53MB MP3）並完整跑完faster-whisper轉錄，耗時約18分鐘（55分鐘音訊，約3.1倍實時速度，跟預期的small model在CPU上的速度吻合），輸出可讀的繁中逐字稿，確認整條pipeline技術上可行。因為改用Podcast RSS完全不碰YouTube，理論上不會再遇到反機器人問題，實際效果待部署後在production驗證。

**部署後發現更嚴重的問題（2026-07-15夜間）**：反機器人問題確實解決了（Podcast MP3能正常下載），但**跟正式站共用Zeabur container這件事本身直接造成正式站當機**——先是丟37集一次處理，網站完全無回應（連Zeabur後台的重啟/看log都連不上，回報`Please try again later`）；使用者手動重啟後，改成一次只處理1集、Whisper限制1個CPU執行緒再測，網站還是整個卡死超過10分鐘。這代表這個container的CPU資源遠比預期緊繃，不是「跑太多集」的問題，是「同一個container裡有任何faster-whisper在跑」就會讓Next.js的事件迴圈完全被餓死。

**緊急處理（使用者當時已就寢，明確授權自行處理不用再確認）**：
1. 刪除`Dockerfile`+`.dockerignore`，讓Zeabur恢復成原本的自動偵測Node建置（不再需要Python/faster-whisper跑在這個container上）
2. 刪除`src/app/api/cron/youtube-transcribe/route.ts`（原本在Zeabur container內用child_process跑轉錄腳本的端點，不再需要）
3. 轉錄工作**搬回GitHub Actions**（恢復獨立的`youtube-transcribe.yml`，內容跟2026-07-13最早的版本一樣，只是把yt-dlp換成單純`requests.get()`下載Podcast MP3）——現在內容來源已經不是YouTube本身，當初從GitHub Actions搬去Zeabur的理由（yt-dlp被YouTube反機器人機制擋）已經不存在，搬回去GitHub Actions同時解決「不被擋」和「不跟正式站搶資源」兩個問題
4. `scripts/youtube-transcribe.py`：拿掉Zeabur專用的`MAX_VIDEOS_PER_RUN=1`和`cpu_threads=1`限制，恢復成drain整個pending佇列的設計（GitHub Actions有獨立2 vCPU，不用像跟正式站共用container那樣保守）

推送emergency revert後，Zeabur站台恢復時間比預期久很多（超過20分鐘持續無回應），懷疑跟這個session稍早就記錄過的「Zeabur自動部署不穩定」問題有關，可能需要人工到後台確認部署狀態或手動觸發Redeploy。

---

### 2.14 選股清單支撐/壓力+法人成本欄位改用圖示、新增底部反轉型態偵測（2026-08-20）

**UI優化**：`TrendTable.tsx`的「支撐/壓力」「外資/投信成本」兩欄原本用文字標籤（壓力/支撐/外資/投信）+數字，格子擠、不好讀。改成圖示（`ArrowUpToLine`/`ArrowDownToLine`/`Globe`/`Landmark`）取代文字標籤，站上壓力/跌破支撐時數字變色加粗取代原本額外一行文字，欄位從3行縮成2行，表頭加`InfoTooltip`圖例。

**新增「底部出現」分類**：使用者看盤軟體上常見的兩種打底型態——頭肩底（左肩-頭部-右肩三個轉折低點，突破頸線確認）、N字底（第1腳-反彈高點-第2腳，突破反彈高點確認）。技術上跟現有5個籌碼流分類不同（`trustTurnBuy`等）：不是`status`欄位的某個值，是獨立於籌碼流的新欄位（`bottomPatternType`/`Stage`/`Description`/`TargetPrice`），一檔股票可能同時符合逢低布局又在走頭肩底，兩者不互斥。UI上一樣當成第6個tab放在逢低布局後面（`sectorTrendsQuery.ts`的`TacticalStatus`型別特別處理這個「假tab」，過濾條件是`bottomPatternStage`不是null不是`status===mode`）。

只在型態主體已成形（N字底第2腳、頭肩底右肩都已確認）才會有輸出，分兩階段：`nearBreakout`（即將突破）/`confirmed`（已突破確認），使用者確認過要兩階段都收、用狀態描述區分，不是只收已突破的。

**實作**：`swingPoints.ts`（N日樞紐法找轉折點，PIVOT_CONFIRM_DAYS=8天）→`detectBottomPattern.ts`（兩種型態的偵測邏輯+目標價量測移動法）→接進`calculateTwDailySignal.ts`（跟籌碼流分類平行跑，互不影響）→`runTwDailyBatch.ts`調整skip邏輯（原本status="none"整筆不寫DB，現在如果有偵測到底部型態還是要寫，只是status維持"none"——`TrendStatus` enum這次也新增了"none"這個值，第一次真的把它寫進資料庫，過去只是TS-only的哨兵值）。

**參數校準**：第一版用MIN_BOUNCE_PCT=5%等寬鬆容忍度，實測對278檔真實股票（用各股最新可查到的價格歷史）掃描命中率高達22%，明顯太鬆（一般股票在120天窗口內隨便一次正常回檔反彈就會超過5%，不是有意義的型態訊號）。調整：PIVOT_CONFIRM_DAYS 5→8、MIN_BOUNCE_PCT 5%→12%、MIN_HEAD_DEPTH_PCT 2%→5%，並新增「型態起點之前必須有明顯更高的轉折高點」的檢查（確認這是真的「跌了一段之後在打底」，不是盤整或上升趨勢中段的正常拉回）——命中率降到約10%。這些容忍度都是主觀判斷不是backtest出來的最佳參數，跟其他「效果未驗證」分類一樣誠實標註，未來如果實測誤判率仍偏高可以再調。

**驗證**：合成資料涵蓋兩種型態×兩階段+3種反例（破前低/單純下跌/反彈幅度不足）共7個案例全數通過；真實資料跑`scripts/tw-daily-batch.ts`對6672騰輝電子-KY實際算出N字底已突破確認（目標價362.4元），確認DB寫入（status="none"但底部型態欄位有值）跟UI渲染（截圖驗證亮/暗模式）都正常。

---

### 2.15 個股頁圖表整合+營收/同業比較擴充+每日異動修正（2026-08-21）

**每日異動修正**：`describeDailyDiff.ts`的戰術分類轉換描述（投信轉買/投信外資合買等）原本只有股數變化的觸發原因，沒有價格，跟支撐壓力突破/法人成本翻轉兩類事件的描述不一致（那兩類都有「今天收盤價X元」）。`CategoryTransition`加`price`欄位，所有轉換描述統一補上「今天收盤價X元」開頭。

**個股頁「股價走勢」+「三大法人」整合**：使用者反映籌碼影響價格、兩者連動，分開看不好對照。`PriceTrendChart.tsx`重寫：加MA5/10/20（用`sma()`對完整歷史序列算，不是切完區間才算，確保短區間如「1個月」的第一天MA20還有前面19天真實資料可用）+ 下方疊加三大法人合計買賣超柱狀圖，共用同一個x軸/區間切換/hover游標。原本獨立的「三大法人」分頁保留（看外資/投信/自營個別拆分細節用），「股價走勢」分頁升級成整合總覽視圖。

**營收面板**：標題「月營收」→「營收」；單位驗證——`revenue`欄位存官方原始單位「千元」（schema註解＋monthlyRevenueClient.ts解析TWSE `t187ap05_L`都是這個假設），直接curl TWSE API拿2330真實數字（2026-07當月營收467,580,548，換算467.58億，YoY+44.7%）交叉比對，換算邏輯（`n/100_000`千元→億元）確認正確，不是bug。新增年份切換：預設只顯示資料裡最新一筆所在的年份（不是系統當下西元年，避免排程斷更時預設畫面空白），超過1個年份才顯示dropdown選其他年份。

**同業比較表擴充**：`computeGroupValuation.ts`/`GroupValuationTable.tsx`新增3欄——股價（`tw_daily_price`最新收盤）、EPS累計（`TwQuarterlyEps`裡`fiscalYear`=今年的最新一筆`epsCumulative`，去年的不算「今年累計」寧可顯示N/A）、籌碼集中度（`daily_trend_signals.chip_concentration_20`最新一筆）。

**驗證**：screenshot確認整合圖表（亮/暗/手機）、營收面板、同業比較新欄位都正常；EPS/籌碼集中度本機dev DB大多是N/A（本機`tw_quarterly_eps`目前是空表，之前的EPS backfill是跑在prod），用一筆合成測試資料確認過渲染格式正確（"24.35（Q2累計）"）後刪除。

---

### 2.16 戰術訊號回測v1：trustTurnBuy/combinedBuy/trustTurnSell/combinedSell/headShoulders/nShape（2026-08-21）

實作「台股戰術訊號回測」設計（見上方2026-08-19條目）的第一批：驗證buyDip以外的其他6個「效果未驗證」分類（籌碼流4個+底部型態2個）。

**架構**：`backtestWalkForward.ts`把`classifyChipFlow()`/`detectBottomPattern()`（跟正式環境用的是同一套函式，不是另外重寫一份回測邏輯）回溯套用到每一檔股票的每一個歷史交易日（從第210根bar開始，只用當天以前的資料），記錄訊號事件（連續訊號只記起點那天，避免同一段訊號被算成好幾筆重疊樣本），量測往後5/10/20/40/60個交易日報酬率，同步存同一天大盤(TAIEX)的同期報酬當比較基準。寫進新表`tw_signal_backtest_events`。`backtestSummary.ts`彙總每個分類/每個持有期間的樣本數/勝率/平均報酬/中位數/大盤基準/超額報酬，預設排除ETF（industry="ETF"）——實測0050單檔就貢獻749筆事件，遠高於任何個股，ETF的法人籌碼流動態（造市商/授權參與人日常申贖套利）跟個股籌碼訊號意義完全不同，混進去會嚴重扭曲統計。

**效能**：本機全部台股（288檔有足夠歷史）跑完只要2.3秒，比原本設計文件裡「工程量大、需要抓效能」的顧慮樂觀很多——`classifyChipFlow`雖然每次呼叫是O(n)過濾institutionalDays，但對~2000-2300個交易日跑下來也只是幾百萬次比較，JS原生吞吐量遠遠夠用。

**⚠️ 重要發現：本機dev DB的結果不能當作真正的驗證結果**——查了事件的訊號日期分布，排除ETF後1401筆事件裡有1006筆(72%)集中在2025年、386筆(28%)在2026年，2015-2024整整10年只有9筆。這代表本機dev DB雖然股價/法人資料理論上可以回溯到2015年，但大部分股票的**連續、無缺口**歷史其實只從2024末~2025初才開始（呼應這次session一路發現的「本機dev DB資料很破碎」的既有認知）。而2025-2026剛好是本機模擬環境設定的AI/半導體超級多頭期間，用這麼窄、這麼偏多頭的樣本回測，連理論上該是空方訊號的`trustTurnSell`/`combinedSell`都測出正報酬、正超額報酬（例如combinedSell的60日平均報酬+49.3%、勝率78%）——這不是訊號本身有效，是整個樣本期間市場都在噴。

**結論**：回測的程式邏輯/管線是對的（已用小樣本測過、事件數量合理、跟正式分類邏輯共用同一套函式不會有規則不一致的問題），但**要跑在prod資料庫**（median 2358個交易日≈9-10年連續歷史）才能拿到有意義的驗證結果。新增`/api/cron/tw-signal-backtest`（手動觸發，`POST` + `Authorization: Bearer $CRON_SECRET`，不掛進每日排程——這是「調整參數後想重新驗證」才需要手動跑一次的離線分析，不是每天要抓的資料）。

**對prod實際跑過一次（860檔股票，24萬3千筆事件，耗時約344秒）**，結果可信（大盤基準報酬回到合理範圍0.3%~6.3%/5~60日，不是本機那個被短窗多頭污染的18%）：5個分類都有真實、方向正確的統計邊際效益（買訊號20日後平均跑贏大盤、賣訊號平均跑輸大盤），但幅度都遠小於已驗證的逢低布局——投信轉買/合買20日超額約+0.2~0.3%、投信轉賣/合賣20日落後大盤約0.2~0.4%、N字底最強（60日超額+2.8%，樣本5429筆）、頭肩底樣本太少（243筆）數字還不穩定。

**UI已接上**（2026-08-21）：`backtestSummary.ts`新增`getBacktestBadgeStats()`——不像`computeBacktestSummary()`把全部事件（23萬+筆）撈進Node.js逐筆處理，這個用SQL直接`GROUP BY`算好20日這個horizon的聚合值（勝率/超額報酬），每次`/tw`頁面載入只查一次、只回傳6列聚合結果，控制成本。樣本數<500（頭肩底）的分類不會回傳，UI端自動fallback回原本的「效果未驗證」。`/tw/page.tsx`查一次當靜態prop往下傳（跟sector/theme篩選無關，不用像`data`那樣切換篩選時重查）→`SectorTrendsBoard.tsx`→`TrendTable.tsx`的`BacktestStatsBadge`取代`UnprovenBadge`，賣方分類特別處理成「落後大盤X%」而不是套用買方的「超額+X%」語氣（賣訊號後續跑輸大盤才是訊號有效，不是報酬變正的才算過關）。4個籌碼流分類（trustTurnBuy/combinedBuy/trustTurnSell/combinedSell）的`tacticalStatusMeta.ts`靜態文案也同步更新，拿掉跟新badge矛盾的「效果待驗證」字眼。「底部出現」分類因為混合了樣本充足的N字底跟樣本不足的頭肩底，沒有單一數字可以誠實代表整個分類，繼續顯示「效果未驗證」。驗證：把本機dev server的`DATABASE_URL`暫時指向prod（唯讀，只是看畫面，沒有寫入）截圖確認亮/暗模式、多方/空方badge文字都正確。

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

**2026-08-19 新增：台股戰術訊號回測（商業化前提）**

現況：`daily_trend_signals`裡5個新分類（投信轉買/投信外資合買/逢低布局/投信轉賣/投信外資合賣，2026-08-17上線）UI上都誠實標了「效果未驗證」——這對免費工具沒問題，但要談商業價值（訂閱付費、推播警示），沒有實證勝率就只是「看起來合理的指標」，是目前最大的可信度缺口。

**關鍵發現**：即時累積的訊號歷史只有2-3天（太少無法回測），但`tw_daily_price`/`tw_institutional_trading`兩張表對大部分908檔追蹤股票都有回2016年至今的完整歷史（實測：三大法人資料median 2358個交易日≈9-10年）。這代表不用等真實訊號累積數月——可以用「回溯重跑分類器」的方式，把`classifyChipFlow.ts`的邏輯套用到每一個歷史交易日（只用當天以前的資料，不能看到未來），重建出「如果現在的分類邏輯過去每天都在跑，哪些日期會觸發訊號」，馬上就能拿到有統計意義的樣本量。

**回測策略草案**：
1. 對每檔追蹤中的台股，逐一走訪歷史交易日（從有足夠歷史可以算出訊號的最早日期，到「今天-60個交易日」，確保最長區間有未來資料可以量報酬）
2. 每一天用截至當天的價格+三大法人歷史重跑`classifyChipFlow()`，記錄命中5個分類其中之一的日期
3. 每個訊號事件往後量+5/+10/+20/+40/+60個交易日的報酬率（收盤對收盤）
4. 依分類彙總：勝率（正報酬比例）、平均報酬、中位數報酬、標準差、樣本數
5. 跟基準比較（例如同股票隨機日期報酬分布、或大盤同期報酬），確認是「真的有訊號」不是「反正股票長期會漲」
6. 額外依龍頭/二軍、產業別切一刀，看訊號的邊際效益集中在哪裡

**已知限制**：沒有處理下市股票的存活者偏差（目前只有追蹤中的股票有歷史）；2020年以前的三大法人資料品質未抽查驗證；這是回測「現在的分類規則」套用到歷史，不是驗證「過去真的即時跑出這些訊號」（因為規則本身這次session才定案）；v1不含交易成本/滑價。

**產出**：離線script（跑一次寫進新的回測結果表）+ UI呈現（每個戰術分類的勝率/平均報酬/樣本數，取代現在單純的「效果未驗證」badge）。使用者已同意記錄這個方向，尚未排入實作（工程量：對900+檔股票、多年每日資料重跑分類器，需要抓效能）。

**2026-08-20 新增：每日異動報告 v2/v3（v1已開工，見下方個股頁/選股清單章節旁的實作紀錄）**

v1（2026-08-20已完成）：純樣板組字，掃「戰術狀態轉換」+「支撐壓力突破」+「法人成本翻轉」三類，`/tw/report`頁面（TwSectionNav第5分頁「每日異動」）。刻意不用LLM生成報告本文——LLM自由敘述容易滑向「建議買進」這類措辭，樣板組字是可控的白名單語言，法遵風險（台灣投顧牌照）趨近於零。語言規則：只描述「今天發生了什麼客觀狀態變化」（站上/跌破/轉為/連續N天），禁用「建議買進賣出」「目標價」「應該」，開頭/結尾固定放「僅呈現資料異動，不構成投資建議」。

實作：`dailyMarketDiff.ts`（純計算，比對daily_trend_signals兩個交易日的status/支撐壓力/法人成本，找daily_trend_signals裡最新兩天，也支援手動指定日期補跑）→`generateDailyReport.ts`upsert進`tw_daily_market_report`（存事實不存文案，Json欄位）→`describeDailyDiff.ts`把事實轉中文句子（UI層）→`/tw/report`頁面渲染，每區塊上限30筆避免震盪日單日近百筆事件把頁面拉爆。排程：`.github/workflows/daily-batch.yml`新增「20 9 * * 1-5」（台北17:20，跟在tw-daily/decision-os-daily後面留緩衝）觸發`/api/cron/tw-daily-report`。用真實歷史資料（2026-07-08 vs 2026-07-06，大盤當天-1.77%）測試過：6筆分類轉換、20筆支撐壓力突破、99筆法人成本翻轉，畫面/文案/顏色（TW紅漲綠跌慣例）都正常。

已知限制：本機dev DB訊號資料很舊（最新完整批次停在2026-07-08），production資料應該每天都有新report可看，這裡沒有機會用「真的連續兩個交易日」的即時資料驗證，是用歷史日期組合測的；沒有處理股票下市/當天完全沒訊號的邊界情況（見dailyMarketDiff.ts註解）。

**v2（待排入）**：diff掃描範圍擴大到基本面/消息面——`EarningsCallAnalysis`新解析出的護城河/市占率/催化劑摘要、`TwQuarterlyEps`新一季毛利率公布、YouTube網紅提及次數異常暴增的股票。技術上是在既有`DailyMarketDiff.payload`裡多加幾個diff類別，架構不用大改。

**v3（待排入，可選）**：LLM潤飾層，把v1/v2的樣板句子串成更順的「晨報」語氣敘事。關鍵限制：LLM輸入必須是已經審過的事實句（樣板產出的diff），不能讓LLM自主判斷要不要下建議、要不要新增內容——潤飾語氣可以自由，但事實範圍要鎖死，否則等於繞回v1一開始想避開的法遵風險。

**2026-07-14 使用者提出的UI/UX待辦（尚未開始）：**

10. `/tw`首頁板塊dropdown版面容易誤導：它只控制PE/PB表格和三個戰術欄位，但視覺上位置讓人以為也控制上面的產業鏈訊號燈號、板塊資金流動折線圖（這兩個區塊其實不受篩選影響）——需要調整版面分組，讓篩選範圍更清楚
11. 產業鏈訊號燈號（`ChainSignalLights.tsx`）：每個階段（上游/中游/下游/支援層）要能點擊展開，顯示該階段實際包含哪些個股、目前個別表現
12. 板塊資金流動折線圖（`computeThemeFlow.ts`/`ThemeFlowChart.tsx`）：(a) 目前固定算最近20個交易日，改成顯示資料庫實際能撐到的最長時間；(b) hover時要能明顯標示走強/走弱的族群，不是每條線一樣顯眼
13. 台股個股漲跌顏色：改成台灣市場慣例（漲=紅、跌=綠），現在應該是共用美股的紅跌綠漲邏輯，需要找出所有共用的漲跌顏色判斷（例如`pctColor`類的function）分market處理

**2026-08-21新增：**

14. **走勢預測模型（使用者提出，改用歷史相似情境統計取代「預測」）**：使用者想要「用MA+股價+籌碼量能的關係做走勢預測」，但直接輸出「預測目標價/明天會漲」會踩到投顧牌照的法規紅線（跟每日異動報告當初的設計顧慮一樣）。建議改法：不做「預測」，做「歷史相似情境統計」——例如「當MA5/10/20多頭排列+籌碼集中度>20%這個組合，過去出現時，未來20個交易日N次裡有M次上漲、平均報酬X%」，呈現歷史統計事實、使用者自己判斷，跟`buyDip`現有的70%勝率標示是同一種呈現邏輯。技術上是本文件已經記錄的「台股戰術訊號回測」的延伸——不只回測5個戰術分類本身，而是把MA排列狀態、籌碼集中度分箱當成額外的條件變數，交叉統計。尚未排入實作，需要先確認方向。

15. **每日異動報告優化想法**（使用者要求「思考」，尚未排入實作）：
    - 把底部反轉型態（`detectBottomPattern.ts`）也納入每日異動的第4類事件（目前只有戰術分類轉換/支撐壓力突破/法人成本翻轉三類）
    - v2待辦（已記錄在上面）：法說會新解析內容、月營收/毛利率新公告、網紅提及異動
    - 「連續天數」動能標示：某股已經連續N天都在同一個戰術分類，不是只看「今天新增」這個單一事件
    - 大盤情境交叉：今天是大盤上漲/下跌的日子，這個背景資訊可以放在每個異動旁邊，幫助判斷「這檔的異動是跟著大盤走還是逆勢」

---

### 2.17 法人報告解析升級：Trend Core風格結構化解析（2026-08-21，使用者睡前交代、自行完成待審閱）

使用者參考美股研究網站Trend Core（gooptions.cc）的呈現方式，要求把`parseInstitutionalReport.ts`原本的「一段長摘要+偏多中性偏空」升級成「聚焦產業瓶頸、關鍵數據變數、牛熊對抗」的結構化解析。這個任務是使用者交代完就去睡覺、要求「你繼續工作」的情況下自主完成，重大決策點都記錄在這裡供醒來後審閱。

**設計決策**：
- 沿用既有`Anthropic` SDK + forced tool-use的既有模式（跟`parseEarningsCall.ts`/`parseInstitutionalReport.ts`原本的做法一致），沒有改用使用者原本詢問裡提到的OpenAI——避免在同一個專案裡混用兩套LLM SDK/API金鑰，跟既有慣例更一致。
- 使用者提供的TS介面草稿裡`title`/`publishDate`/`source`/`category`刻意沒有讓LLM重新萃取——這幾個欄位在`discoverNewArticles()`階段就已經從esunsec文章列表API拿到，是可靠的原始metadata，讓LLM從內文重新猜一次只會多一個「LLM猜的跟discovery階段記錄的對不上」的風險，沒有任何好處。
- `signal`（偏多/中性/偏空）保留，沒有被bullCase/bearCase取代——既有UI的`pendingCount`篩選邏輯依賴`signal !== null`判斷「這篇文章解析完成了沒」，拿掉會牽動既有邏輯；bullCase/bearCase是額外的結構化elaboration，不是取代品。
- 個股`chainLayer`欄位（upstream/midstream/downstream/support）沿用`group_config.json`裡`ThemeChainStage.stageKey`既有的英文詞彙+`GroupValuationTable.tsx`既有的顏色（上游藍/中游紫/下游橘/支援層灰），沒有引入使用者原本提議的中文3類詞彙——避免同一個「供應鏈位置」概念在app裡出現兩套不同的分類詞彙。多加了原本3類之外的`support`（既有詞彙本來就有這一類）。
- `MentionSentiment` enum（bullish/bearish/neutral）直接複用YouTube提及功能既有的同名enum，沒有重複定義。

**Schema**：`InstitutionalReportArticle`新增`keyMetrics`(Json)、`bullCoreLogic`/`bullTrigger`/`bearCoreLogic`/`bearBottleneck`(Text)、`tags`(Json)；`InstitutionalReportMention`新增`sentiment`/`chainLayer`/`role`。全部nullable——舊資料（用舊版prompt解析過的文章）這些欄位是null，UI要能優雅降級（見下）。

**Prompt設計重點**：延續`parseEarningsCall.ts`確立的「不要為了填滿欄位自己推論」原則——`keyMetrics`只收文章有明確數字佐證的（最多5個，沒有就空陣列）；`bullCase.trigger`/`bearCase.bottleneck`文章沒有明確講就是null；`chainLayer`文章沒有明確講清楚供應鏈位置就是null，不用「產業慣例」自己硬猜。刻意要求「即使文章整體signal是positive，也要整理文章裡提到的任何風險/瓶頸因素進bearCase」（反之亦然）——避免bullCase/bearCase變成signal的同義重複，兩者要能呈現真正的「牛熊對抗」張力。

**UI**：`InstitutionalReportList.tsx`的`ReportCard`升級——關鍵數據用小chip橫排、bullCase/bearCase用左右兩欄（紅=看多/綠=看空，跟台股紅漲綠跌慣例一致）、個股mention chip加上立場色點+供應鏈層級badge+角色文字、底部加標籤列。用`hasStructuredAnalysis`（`bullCoreLogic`/`bearCoreLogic`都不是null）判斷要不要顯示新版結構化區塊，沒有的話（舊資料/待解析）繼續顯示原本的簡易摘要或「尚未解析」提示，三種狀態（新版完整解析/舊版解析/待解析）都截圖驗證過（亮/暗/手機）。

**已知限制**：本機沒有設定`ANTHROPIC_API_KEY`，沒辦法實際呼叫LLM驗證prompt在真實文章上的效果，只用手動插入的合成資料驗證UI渲染邏輯正確。使用者醒來後建議先手動觸發`/api/cron/institutional-reports`（或本機補上API金鑰跑`runInstitutionalReportIngestBatch()`）用真實文章測一次，確認LLM實際輸出的品質（尤其keyMetrics/chainLayer這種需要LLM從自由格式內文正確判斷的欄位）。這批改動**只commit沒有push**——LLM prompt改動會影響之後每次解析新文章的行為+消耗LLM額度，留給使用者醒來後review再決定要不要deploy。

---

### 2.18 三個LLM解析pipeline用量盤點 + 法說會積壓修復（2026-08-21）

使用者要求整理全站LLM解析用量以規劃資源分配。查了production實際狀況：

| Pipeline | 觸發頻率（改前） | 單次額度 | 待解析 | 積壓情況 |
|---|---|---|---|---|
| 法說會分析 | 每週一1次，5輪×8篇 | 8篇/輪 | **556篇**（564篇中僅8篇解析完） | 🔴 照原速度需~14週清完 |
| 法人報告（剛升級） | 每天1次 | 8篇/天 | 40篇（全部，0篇解析成功） | 🔴 排程可能沒真的執行成功，是bug不是額度問題 |
| YouTube逐字稿 | 每天1次 | 20~50支/天 | 69篇已有逐字稿等LLM+27篇連逐字稿都沒有 | 🟡 現在的速度幾天內可以清完 |

使用者選擇先處理法說會（最嚴重的積壓）。

**根因分析**：原本設計是「每週一次、連續5輪，每輪都discover+parse」——但`discoverNewFilings()`（純HTML查詢MOPS，掃全部~290+檔追蹤股票）本身單輪就要跑約1分半，5輪重複掃描同一份清單（新股票很少，大部分重複）換算下來，30分鐘的GitHub Actions timeout裡有7-8分鐘被浪費在重複discovery，換算成「本來可以拿去解析PDF的額度」大概少了2-3輪。再加上「每週一次」的頻率本身跟556篇的積壓量級差太多——就算每輪都滿載處理，5輪×8篇=40篇/週，都追不上一個財報季擠出來的新增量。

**修復**：
1. `earnings-call-analysis/route.ts`加`?discover=false`參數，只呼叫`parsePendingFilings()`不重跑`discoverNewFilings()`——workflow裡第一輪discover+parse，後面幾輪只parse，不再重複掃描全市場。
2. `PROCESS_BUDGET_PER_INVOCATION`：8→12（省下discovery的時間，同樣30分鐘視窗能塞多幾篇）。
3. `.github/workflows/earnings-call-analysis.yml`：cron從「每週一06:00」改成「每天06:00」，輪數從5輪增加到8輪。

**預期效果**：舊制40篇/週 → 新制最多8輪×12篇=96篇/天×7天=672篇/週理論上限（實際會因為早退出機制、部分PDF解析失敗等因素打折，保守估計實際約40-60篇/天），556篇積壓預期**1-2週內清完**，取代原本估計的3.5個月。跟另外兩個pipeline一樣改成每天觸發，節奏一致。

**未處理**：法人報告0/40的異常（可能是GitHub Actions排程本身沒觸發成功、或APP_URL/CRON_SECRET設定問題、或解析本身在拋錯但沒被注意到）——這是獨立的bug，不是這次資源分配調整的範圍，需要另外查。

**驗證**：本機起dev server直接curl測試`?discover=false`路徑，確認回傳格式正確（沒有觸發discovery）；`discoverNewFilings()`本身沒有被改動，沿用既有邏輯。沒有實際跑一整輪完整的法說會解析（本機沒有ANTHROPIC_API_KEY），tsc/eslint都乾淨。

---

### 2.19 法人報告0/40排查：找到「看得見成功、看不到失敗」的排程盲點（2026-08-21）

查`institutional-reports`0/40卡住的原因，過程：

1. 直接測`esunsecClient.ts`的`fetchArticleFullText()`/`fetchCategoryArticles()`——都正常（真實抓到1787字文章內文、兩個分類各20篇清單），排除文章擷取失敗的可能。
2. `institutional-reports`的cron route（`/api/cron/institutional-reports`）本身是**awaited**（不是fire-and-forget，跟tw-daily/tw-quarterly-eps不同），回傳的JSON裡有`discovered`/`processed`/`errors`/`errorMessages`——理論上錯誤是看得到的。
3. 用GitHub公開Actions API（repo是public，不用認證就查得到）翻`daily-batch.yml`最近幾天的執行紀錄，找到`30 9 * * *`這個排程確實有觸發、且job顯示`conclusion: success`。
4. **但`daily-batch.yml`裡這個job的shell script只有裸`curl -sf ...`，response直接丟掉，沒有像`earnings-call-analysis.yml`那樣`echo`出來**——GitHub Actions只要curl拿到2xx就判定這個step成功，完全不管JSON body裡`processed`到底是不是0、`errorMessages`寫了什麼。這解釋了「排程明明有跑、但完全看不出出了什麼事」的现象。

**目前結論**：discovery（純HTML抓取）確認沒問題，awaited的route理論上有回傳診斷資訊，但因為GH Actions沒有記錄response body，過去幾天的真實錯誤內容已經無法回溯（Zeabur本身的server log我沒有存取權限）。最可能的剩餘原因是production環境的`ANTHROPIC_API_KEY`沒設定或已失效（這是LLM呼叫這一步唯一還沒排除的環節），但無法在本機確認（本機沒有金鑰，測不出prod的金鑰狀態）。

**修復**：`daily-batch.yml`的`institutional-reports` job補上`echo "$RESPONSE"`+檢查`errors`欄位，非0就讓這個step明確fail（紅X），不再是「curl拿到2xx就算過」的靜默假成功。下次排程觸發（或使用者手動`workflow_dispatch`）之後，就能在GitHub Actions log裡直接看到真正的錯誤訊息。

**待使用者確認**：建議直接去Zeabur後台確認`ANTHROPIC_API_KEY`環境變數有沒有設定/是否有效——這是最快能排除或坐實這個假設的方法，比等下次排程或手動觸發後翻log更直接。

**真正原因（2026-08-21找到）**：使用者提供金鑰後直接測試——不是金鑰無效，是**Anthropic帳戶額度歸零**（`Your credit balance is too low to access the Anthropic API`）。這解釋了三個LLM pipeline（法人報告0/40、法說會556篇積壓、YouTube 69篇待解析）全部卡住的根本原因：discovery（純HTML抓取，不用LLM）都正常運作，但每次LLM呼叫都被額度擋下、在try/catch裡被吞成`errors`，不會讓整個排程crash——這也是為什麼GitHub Actions一直顯示「success」。已請使用者去Anthropic Console加值，加值後三個pipeline應該會在下次排程自動繼續處理積壓，不需要額外動作。

---

### 2.20 待辦：額度不足時的靜默失敗警示（2026-08-21新增）

這次排查法人報告卡住花了不少功夫才找到「帳戶額度歸零」這個根因，過程中發現三個LLM pipeline都有同一類設計缺口：**LLM呼叫失敗時，cron route/workflow大多還是回傳2xx，GitHub Actions顯示「success」，實際上完全沒有處理任何東西**。目前只修了`institutional-reports`（`daily-batch.yml`裡`errors>0`時讓step明確fail），另外兩個還沒處理：

- `earnings-call-analysis.yml`：迴圈用`totalProcessed==0`判斷要不要提早跳出，但沒有讓step本身fail（exit code還是0），額度用完時只會提早結束、不會顯示紅X。
- `youtube-parse`（`/api/youtube/parse-pending`）：不管`results`裡失敗幾支都回傳200，GitHub Actions step一律「success」。

**建議做法**：
1. 比照這次對`institutional-reports`的修法，讓這兩個workflow也在「這輪的processed=0但有嘗試處理」或「errors比例過高」時明確fail，讓GitHub原生的「workflow執行失敗」email通知能真的觸發（不用額外接Slack/Discord webhook，github repo本身的watcher通知就夠用了）。
2. 更進一步：判斷錯誤訊息裡有沒有出現「credit balance is too low」這類特徵字串，額度用完是「不用再重試、需要人去加值」的狀態，跟一般暫時性錯誤（網路逾時等）意義不同，可以考慮用更明顯的方式標示（例如GitHub Actions annotation、或的的獨立錯誤分類），不是每種失敗都用同一種「errors計數」處理。

尚未排入實作，記錄下來供之後排優先順序。

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
