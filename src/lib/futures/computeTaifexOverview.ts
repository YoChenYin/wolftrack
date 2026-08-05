import { prisma } from "@/lib/prisma";

export interface FuturesBasisDay {
  date: string; // YYYY-MM-DD
  futuresClose: number;
  spotClose: number;
  basis: number;
  basisPct: number;
  contractMonth: string;
}

export interface PutCallRatioDay {
  date: string; // YYYY-MM-DD
  putCallVolumeRatioPct: number;
  putCallOiRatioPct: number;
}

export interface TaifexOverviewResult {
  basisDays: FuturesBasisDay[];
  putCallDays: PutCallRatioDay[];
}

/**
 * 台指期總覽：基差（期貨-現貨價差）+ 選擇權Put/Call比歷史。
 * tw_futures_daily 只會有排程開始跑之後每天累積的資料（沒有回填捷徑，見 taifexClient.ts 說明），
 * 剛上線時可能只有1天；tw_options_put_call_ratio 因為官方API本身給約一個月範圍，會比較快有historical資料。
 */
export async function computeTaifexOverview(): Promise<TaifexOverviewResult> {
  const taiexStock = await prisma.stock.findUnique({
    where: { market_ticker: { market: "TW", ticker: "TAIEX" } },
  });

  const futuresRows = await prisma.twFuturesDaily.findMany({
    where: { contract: "TX" },
    orderBy: { tradeDate: "asc" },
  });

  let basisDays: FuturesBasisDay[] = [];
  if (taiexStock && futuresRows.length > 0) {
    const spotRows = await prisma.twDailyPrice.findMany({
      where: { stockId: taiexStock.id, tradeDate: { in: futuresRows.map((r) => r.tradeDate) } },
      select: { tradeDate: true, close: true },
    });
    const spotByDate = new Map(spotRows.map((r) => [r.tradeDate.toISOString().slice(0, 10), Number(r.close)]));

    basisDays = futuresRows
      .map((r) => {
        const date = r.tradeDate.toISOString().slice(0, 10);
        const spotClose = spotByDate.get(date);
        if (spotClose === undefined) return null;
        const futuresClose = Number(r.close);
        const basis = Math.round((futuresClose - spotClose) * 100) / 100;
        const basisPct = Math.round((basis / spotClose) * 10000) / 100;
        return { date, futuresClose, spotClose, basis, basisPct, contractMonth: r.contractMonth };
      })
      .filter((d): d is FuturesBasisDay => d !== null);
  }

  const pcRows = await prisma.twOptionsPutCallRatio.findMany({ orderBy: { tradeDate: "asc" } });
  const putCallDays: PutCallRatioDay[] = pcRows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    putCallVolumeRatioPct: Number(r.putCallVolumeRatioPct),
    putCallOiRatioPct: Number(r.putCallOiRatioPct),
  }));

  return { basisDays, putCallDays };
}
