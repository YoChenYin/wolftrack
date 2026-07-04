import { clamp } from "@/lib/trend/utils";

/**
 * 某一天的三大法人買賣超（張數），totalVolumeShares 是當日總成交量（張），
 * 用來把買賣超張數正規化成「佔當日量能比例」，不受個股股本大小影響。
 */
export interface InstitutionalDay {
  date: string;
  foreignNetBuyShares: number;
  investTrustNetBuyShares: number;
  dealerNetBuyShares: number;
  totalVolumeShares: number;
}

export interface ChipSubScores {
  investTrust: number;
  foreign: number;
  dealer: number;
  alignment: number;
}

/**
 * ⚠️假設：四個子分數權重，出自 docs/wolftrack-tw-spec.md 3.1。
 * TODO: 待業務/量化端核對權重。
 */
const CHIP_SCORE_WEIGHTS = {
  investTrust: 0.4,
  foreign: 0.35,
  dealer: 0.1,
  alignment: 0.15,
} as const;

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * 買超張數佔量能比例 -> 0-100 分數。
 * ⚠️假設：買超佔量能 10% 對應滿分 100，這是常見量化門檻的合理起點，非官方公式。
 */
function magnitudeScore(netSum: number, volSum: number): number {
  if (volSum === 0) return 50;
  const ratio = netSum / volSum;
  return clamp(50 + ratio * 500, 0, 100);
}

/**
 * InvestTrust_Score = f(近5日投信買超張數, 近20日投信買賣超趨勢)
 * ⚠️假設：70% 近5日強度 + 30% 近20日趨勢方向（近10日 vs 前10日買超力道變化）。
 * TODO: 待業務端確認 f() 的精確定義（spec 未定義）。
 */
function investTrustScore(days: InstitutionalDay[]): number {
  if (days.length === 0) return 50;

  const last5 = days.slice(-5);
  const magnitude = magnitudeScore(
    sum(last5.map((d) => d.investTrustNetBuyShares)),
    sum(last5.map((d) => d.totalVolumeShares))
  );

  const last20 = days.slice(-20);
  if (last20.length < 20) return magnitude; // 資料不足以看20日趨勢，先只用5日強度

  const recent10 = last20.slice(-10);
  const prior10 = last20.slice(0, 10);
  const vol20 = sum(last20.map((d) => d.totalVolumeShares));
  const trendDelta =
    vol20 > 0
      ? (sum(recent10.map((d) => d.investTrustNetBuyShares)) - sum(prior10.map((d) => d.investTrustNetBuyShares))) /
        vol20
      : 0;
  const trend = clamp(50 + trendDelta * 500, 0, 100);

  return magnitude * 0.7 + trend * 0.3;
}

/**
 * Foreign_Score = f(近5日外資買超金額, 外資持股比例變化)
 * ⚠️假設：spec 原公式用「金額」+「持股比例變化」，但目前沒有可靠的成交金額分母或持股比例資料，
 * 先比照投信邏輯改用「買超張數佔量能比例」計算，方法論上與其他子分數一致。
 * TODO: 待接上真實外資持股比例資料後，改回 spec 原定義的公式。
 */
function foreignScore(days: InstitutionalDay[]): number {
  if (days.length === 0) return 50;
  const last5 = days.slice(-5);
  return magnitudeScore(
    sum(last5.map((d) => d.foreignNetBuyShares)),
    sum(last5.map((d) => d.totalVolumeShares))
  );
}

/** Dealer_Score：自營商雜訊多，只看近5日買超佔量能比例，不看趨勢 */
function dealerScore(days: InstitutionalDay[]): number {
  if (days.length === 0) return 50;
  const last5 = days.slice(-5);
  return magnitudeScore(
    sum(last5.map((d) => d.dealerNetBuyShares)),
    sum(last5.map((d) => d.totalVolumeShares))
  );
}

/**
 * Alignment_Bonus：近5日三大法人是否同方向買超。
 * ⚠️假設：三者近5日淨額同為正 -> 100，同為負 -> 0，否則 50（不一致無加分也不扣分）。
 */
function alignmentScore(days: InstitutionalDay[]): number {
  if (days.length === 0) return 50;
  const last5 = days.slice(-5);
  const foreignNet = sum(last5.map((d) => d.foreignNetBuyShares));
  const investTrustNet = sum(last5.map((d) => d.investTrustNetBuyShares));
  const dealerNet = sum(last5.map((d) => d.dealerNetBuyShares));
  const nets = [foreignNet, investTrustNet, dealerNet];
  if (nets.every((v) => v > 0)) return 100;
  if (nets.every((v) => v < 0)) return 0;
  return 50;
}

export function calculateChipScore(days: InstitutionalDay[]): { chipScore: number; subScores: ChipSubScores } {
  const subScores: ChipSubScores = {
    investTrust: investTrustScore(days),
    foreign: foreignScore(days),
    dealer: dealerScore(days),
    alignment: alignmentScore(days),
  };

  const raw =
    subScores.investTrust * CHIP_SCORE_WEIGHTS.investTrust +
    subScores.foreign * CHIP_SCORE_WEIGHTS.foreign +
    subScores.dealer * CHIP_SCORE_WEIGHTS.dealer +
    subScores.alignment * CHIP_SCORE_WEIGHTS.alignment;

  return { chipScore: Math.round(clamp(raw, 0, 100) * 100) / 100, subScores };
}
