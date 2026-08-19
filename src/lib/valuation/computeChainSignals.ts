import { prisma } from "@/lib/prisma";
import { getChain, getChainStagesWithThemes } from "./groupConfig";

/** 表格裡每一列的個股資料 */
export interface ChainStageMember {
  ticker: string;
  companyName: string;
  /** 最新一筆（7天內）戰術狀態，null=目前沒有訊號 */
  status: string | null;
  /** 近5日報酬(%)，null=沒有足夠股價資料 */
  return5d: number | null;
  /** 最新收盤價，null=沒有股價資料 */
  closePrice: number | null;
  /** 最新交易日對前一交易日的漲跌金額/幅度(%)，null=資料不足（少於2個交易日） */
  todayChangeAmount: number | null;
  todayChangePct: number | null;
  /** 今年最新一期申報的累積EPS（見TwQuarterlyEps schema說明：季報數字本身就是自年初累計，
   * 不是單季），null=還沒查到今年任何一期申報資料 */
  epsCumulative: number | null;
  /** 是不是這個階段任一個theme標記的龍頭股（group_config.json的leader欄位） */
  isLeader: boolean;
}

/** 2026-08-19：一個階段常常橫跨好幾個原始theme（例如「上游：IP與IC設計」＝「IC設計：
 * 高階運算與邊緣AI」43檔＋「矽智財：IP與ASIC設計服務」7檔），全部攤成一張大表格會讓使用者
 * 分不清哪些股票其實是同類別、可以互相比較——依原始theme分組後，同一組才是真正的同儕比較對象，
 * 「5日漲跌%」「領漲/領跌個股」這些族群統計也改成在這個粒度算，比階段層級的聚合更有意義
 * （原本階段層級的龍頭/二軍燈號判斷已移除，見ChainStageSignal說明）。
 * members依龍頭優先、其餘依近5日報酬排序（跟topGainer/topLoser的純報酬排序不同，這裡是給
 * UI預設收合用：龍頭不該因為報酬不是前幾名就被摺起來看不到）。 */
export interface ChainThemeGroup {
  themeName: string;
  memberCount: number;
  /** 這組的5日平均報酬(%)，null=沒有任何成員有足夠股價資料 */
  avgReturn5d: number | null;
  /** 這組裡近5日報酬最高/最低的個股（領漲/領跌），null=沒有任何成員有報酬資料 */
  topGainer: ChainStageMember | null;
  topLoser: ChainStageMember | null;
  members: ChainStageMember[];
}

export interface ChainStageSignal {
  stageKey: string;
  label: string;
  /** 這個階段涵蓋的不重複股票數（跨底下所有 theme 聯集） */
  memberCount: number;
  /** 依原始theme分組後的成員股票，見ChainThemeGroup說明 */
  themeGroups: ChainThemeGroup[];
}

export interface ChainSignalResult {
  chainName: string;
  chainNameFull: string;
  stages: ChainStageSignal[];
}

const RECENCY_WINDOW_DAYS = 7;
const RETURN_LOOKBACK_TRADING_DAYS = 6; // 算5日報酬要6筆
const RETURN_LOOKBACK_CALENDAR_DAYS = 14;

/**
 * 產業鏈個股資料（2026-07-12，2026-08-19改版拆成依theme分組、拿掉階段層級的龍頭/二軍
 * 燈號判斷）：每個階段（上游/中游/下游/支援層）依原始theme分組列出成員股票的收盤價、
 * 今日漲跌、近5日報酬、戰術訊號、年度累積EPS，並在每個theme分組層級算5日平均報酬跟
 * 領漲/領跌個股——2026-08-19之前這些統計是算在整個階段（可能橫跨好幾個theme、40+檔股票）
 * 上，太粗會讓使用者看不出真正同類股票之間的差異，改成theme分組層級才有意義。
 */
export async function computeChainSignals(chainName: string): Promise<ChainSignalResult | null> {
  const chain = getChain(chainName);
  const stagesWithThemes = getChainStagesWithThemes(chainName);
  if (!chain || !stagesWithThemes) return null;

  const stages: ChainStageSignal[] = [];

  for (const stage of stagesWithThemes) {
    const tickers = [...new Set(stage.themes.flatMap((t) => t.members))];
    const leaderTickers = new Set(stage.themes.flatMap((t) => t.leader));

    if (tickers.length === 0) {
      stages.push({ stageKey: stage.stageKey, label: stage.label, memberCount: 0, themeGroups: [] });
      continue;
    }

    const stocks = await prisma.stock.findMany({
      where: { market: "TW", ticker: { in: tickers } },
      select: { id: true, ticker: true, companyName: true },
    });
    const stockIds = stocks.map((s) => s.id);

    // 訊號：每檔股票取最新一筆（7天內）status，點開表格時每檔股票要顯示自己目前的狀態
    const latestSignals = await prisma.dailyTrendSignal.findMany({
      where: {
        stockId: { in: stockIds },
        tradeDate: { gte: new Date(Date.now() - RECENCY_WINDOW_DAYS * 86_400_000) },
      },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      distinct: ["stockId"],
      select: { stockId: true, status: true },
    });
    const statusByStockId = new Map(latestSignals.map((row) => [row.stockId, row.status as string]));

    // 近5日報酬：先算每檔股票自己的，再平均成族群數字
    const cutoff = new Date(Date.now() - RETURN_LOOKBACK_CALENDAR_DAYS * 86_400_000);
    const priceRows = await prisma.twDailyPrice.findMany({
      where: { stockId: { in: stockIds }, tradeDate: { gte: cutoff } },
      orderBy: [{ stockId: "asc" }, { tradeDate: "desc" }],
      select: { stockId: true, close: true },
    });
    const barsByStockId = new Map<number, number[]>();
    for (const row of priceRows) {
      const list = barsByStockId.get(row.stockId) ?? [];
      if (list.length < RETURN_LOOKBACK_TRADING_DAYS) list.push(Number(row.close));
      barsByStockId.set(row.stockId, list);
    }
    const return5dByStockId = new Map<number, number>();
    // barsByStockId 是每檔股票最新在前的收盤價陣列，closes[0]=最新收盤、closes[1]=前一交易日，
    // 剛好可以直接算今日漲跌，不用再多查一次DB
    const closePriceByStockId = new Map<number, number>();
    const todayChangeAmountByStockId = new Map<number, number>();
    const todayChangePctByStockId = new Map<number, number>();
    for (const [stockId, closes] of barsByStockId) {
      if (closes.length >= 1) closePriceByStockId.set(stockId, closes[0]);
      if (closes.length >= 2 && closes[1] !== 0) {
        todayChangeAmountByStockId.set(stockId, Math.round((closes[0] - closes[1]) * 100) / 100);
        todayChangePctByStockId.set(stockId, Math.round(((closes[0] - closes[1]) / closes[1]) * 10000) / 100);
      }
      if (closes.length <= 5 || closes[5] === 0) continue;
      return5dByStockId.set(stockId, Math.round(((closes[0] - closes[5]) / closes[5]) * 10000) / 100);
    }

    // 年度累積EPS：取每檔股票最新一期申報（fiscalYear/fiscalQuarter最大的一筆），
    // 見TwQuarterlyEps schema說明——季報數字本身就是自年初累計，不用自己再加總多季
    const epsRows = await prisma.twQuarterlyEps.findMany({
      where: { stockId: { in: stockIds } },
      orderBy: [{ stockId: "asc" }, { fiscalYear: "desc" }, { fiscalQuarter: "desc" }],
      distinct: ["stockId"],
      select: { stockId: true, epsCumulative: true },
    });
    const epsByStockId = new Map(epsRows.map((r) => [r.stockId, Number(r.epsCumulative)]));

    const memberByTicker = new Map<string, ChainStageMember>(
      stocks.map((s) => [
        s.ticker,
        {
          ticker: s.ticker,
          companyName: s.companyName,
          status: statusByStockId.get(s.id) ?? null,
          return5d: return5dByStockId.get(s.id) ?? null,
          closePrice: closePriceByStockId.get(s.id) ?? null,
          todayChangeAmount: todayChangeAmountByStockId.get(s.id) ?? null,
          todayChangePct: todayChangePctByStockId.get(s.id) ?? null,
          epsCumulative: epsByStockId.get(s.id) ?? null,
          isLeader: leaderTickers.has(s.ticker),
        },
      ])
    );

    // 依原始theme分組（見ChainThemeGroup說明）：龍頭優先、其餘依近5日報酬排序，同一檔股票
    // 如果同時屬於這個階段的好幾個theme，會分別出現在每一組裡面（目前6條鏈裡沒有這種重疊，
    // 但資料結構上允許，不特別去重)
    const themeGroups: ChainThemeGroup[] = stage.themes
      .map((theme) => {
        const groupMembers = theme.members
          .map((t) => memberByTicker.get(t))
          .filter((m): m is ChainStageMember => m !== undefined)
          .sort((a, b) => {
            if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
            return (b.return5d ?? -Infinity) - (a.return5d ?? -Infinity);
          });

        const withReturn = groupMembers.filter((m): m is ChainStageMember & { return5d: number } => m.return5d !== null);
        const avgReturn5d =
          withReturn.length > 0
            ? Math.round((withReturn.reduce((sum, m) => sum + m.return5d, 0) / withReturn.length) * 100) / 100
            : null;
        const topGainer = withReturn.length > 0 ? withReturn.reduce((a, b) => (a.return5d >= b.return5d ? a : b)) : null;
        const topLoser = withReturn.length > 0 ? withReturn.reduce((a, b) => (a.return5d <= b.return5d ? a : b)) : null;

        return { themeName: theme.theme_name, memberCount: groupMembers.length, avgReturn5d, topGainer, topLoser, members: groupMembers };
      })
      .filter((g) => g.memberCount > 0);

    stages.push({
      stageKey: stage.stageKey,
      label: stage.label,
      memberCount: tickers.length,
      themeGroups,
    });
  }

  return { chainName, chainNameFull: chain.chainNameFull, stages };
}
