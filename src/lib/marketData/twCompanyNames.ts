/**
 * 2026-07-26：TWSE/TPEx官方「公司簡稱」，用來把DB裡存的公司全名簡化成大家平常講的名稱
 * （例如「聯發科技股份有限公司」→「聯發科」、「瑞昱半導體股份有限公司」→「瑞昱」）——
 * 這是官方資料本身就有的欄位，不是自己用規則猜的縮寫，比stripCompanySuffix()單純拿掉
 * 「股份有限公司」尾綴更準（很多公司全名比簡稱多的不只是這個尾綴，例如「瑞昱半導體」
 * 多了「半導體」兩個字）。
 * 上市/上櫃兩邊資料集欄位名稱不一樣（TWSE中文key、TPEx英文key），這裡統一成同一個介面。
 */
interface TwseCompanyRow {
  公司代號: string;
  公司簡稱: string;
}

interface TpexCompanyRow {
  SecuritiesCompanyCode: string;
  CompanyAbbreviation: string;
}

export async function fetchTwCompanyShortNames(): Promise<Map<string, string>> {
  const [twseRows, tpexRows] = await Promise.all([
    fetch("https://openapi.twse.com.tw/v1/opendata/t187ap03_L").then((res) => res.json() as Promise<TwseCompanyRow[]>),
    fetch("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O").then(
      (res) => res.json() as Promise<TpexCompanyRow[]>
    ),
  ]);

  const result = new Map<string, string>();
  for (const row of twseRows) {
    if (row.公司簡稱) result.set(row.公司代號, row.公司簡稱);
  }
  for (const row of tpexRows) {
    if (row.CompanyAbbreviation) result.set(row.SecuritiesCompanyCode, row.CompanyAbbreviation);
  }
  return result;
}
