import { prisma } from "@/lib/prisma";
import { fetchTaifexFrontMonthFutures, fetchTaifexPutCallRatio } from "./taifexClient";

export interface TaifexDailyUpdateResult {
  futuresWritten: number;
  putCallRatioWritten: number;
}

/**
 * 台指期每日更新：抓台指期(TX)近月合約行情 + 台指選擇權Put/Call比，寫進 tw_futures_daily /
 * tw_options_put_call_ratio。兩支API都只給「今天」（Put/Call比稍微寬鬆，給約一個月），沒有
 * 歷史範圍可回填，只能每天呼叫累積——這支就是那個每天呼叫的函式，本身沒有「回填腳本」對應版本。
 */
export async function runTaifexDailyUpdate(): Promise<TaifexDailyUpdateResult> {
  let futuresWritten = 0;
  const futuresBar = await fetchTaifexFrontMonthFutures("TX");
  if (futuresBar) {
    await prisma.twFuturesDaily.upsert({
      where: { contract_tradeDate: { contract: "TX", tradeDate: new Date(futuresBar.date) } },
      update: {
        contractMonth: futuresBar.contractMonth,
        open: futuresBar.open,
        high: futuresBar.high,
        low: futuresBar.low,
        close: futuresBar.close,
        settlementPrice: futuresBar.settlementPrice,
        volume: futuresBar.volume,
        openInterest: futuresBar.openInterest,
      },
      create: {
        contract: "TX",
        tradeDate: new Date(futuresBar.date),
        contractMonth: futuresBar.contractMonth,
        open: futuresBar.open,
        high: futuresBar.high,
        low: futuresBar.low,
        close: futuresBar.close,
        settlementPrice: futuresBar.settlementPrice,
        volume: futuresBar.volume,
        openInterest: futuresBar.openInterest,
      },
    });
    futuresWritten = 1;
  }

  let putCallRatioWritten = 0;
  const pcRatioDays = await fetchTaifexPutCallRatio();
  for (const day of pcRatioDays) {
    await prisma.twOptionsPutCallRatio.upsert({
      where: { tradeDate: new Date(day.date) },
      update: {
        putVolume: day.putVolume,
        callVolume: day.callVolume,
        putCallVolumeRatioPct: day.putCallVolumeRatioPct,
        putOpenInterest: day.putOpenInterest,
        callOpenInterest: day.callOpenInterest,
        putCallOiRatioPct: day.putCallOiRatioPct,
      },
      create: {
        tradeDate: new Date(day.date),
        putVolume: day.putVolume,
        callVolume: day.callVolume,
        putCallVolumeRatioPct: day.putCallVolumeRatioPct,
        putOpenInterest: day.putOpenInterest,
        callOpenInterest: day.callOpenInterest,
        putCallOiRatioPct: day.putCallOiRatioPct,
      },
    });
    putCallRatioWritten++;
  }

  return { futuresWritten, putCallRatioWritten };
}
