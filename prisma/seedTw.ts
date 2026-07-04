import { prisma } from "../src/lib/prisma";

// TW 版板塊分類，沿用證交所常見產業別（不是 GICS），先做幾個熱門產業示範
const SECTORS = [
  { sectorCode: "SEMI", sectorName: "Semiconductors", sectorNameZh: "半導體業", displayOrder: 1 },
  { sectorCode: "COMPUTER", sectorName: "Computer & Peripheral Equipment", sectorNameZh: "電腦及週邊設備業", displayOrder: 2 },
  { sectorCode: "ELECPARTS", sectorName: "Electronic Parts & Components", sectorNameZh: "電子零組件業", displayOrder: 3 },
  { sectorCode: "FINANCE", sectorName: "Finance & Insurance", sectorNameZh: "金融保險業", displayOrder: 4 },
  { sectorCode: "PLASTIC", sectorName: "Plastics", sectorNameZh: "塑膠工業", displayOrder: 5 },
  { sectorCode: "STEEL", sectorName: "Steel & Iron", sectorNameZh: "鋼鐵工業", displayOrder: 6 },
  { sectorCode: "SHIPPING", sectorName: "Shipping & Transportation", sectorNameZh: "航運業", displayOrder: 7 },
  { sectorCode: "TELECOM", sectorName: "Telecommunications", sectorNameZh: "通信網路業", displayOrder: 8 },
  { sectorCode: "INDEX", sectorName: "Index", sectorNameZh: "指數", displayOrder: 99 },
] as const;

// ~20 檔台股大型股，示範用（代號為證交所股票代號）
const STOCKS = [
  { ticker: "2330", companyName: "台灣積體電路製造股份有限公司", sectorCode: "SEMI", industry: "晶圓代工" },
  { ticker: "2454", companyName: "聯發科技股份有限公司", sectorCode: "SEMI", industry: "IC設計" },
  { ticker: "2303", companyName: "聯華電子股份有限公司", sectorCode: "SEMI", industry: "晶圓代工" },
  { ticker: "3711", companyName: "日月光投資控股股份有限公司", sectorCode: "SEMI", industry: "封裝測試" },

  { ticker: "2317", companyName: "鴻海精密工業股份有限公司", sectorCode: "COMPUTER", industry: "電子代工" },
  { ticker: "2382", companyName: "廣達電腦股份有限公司", sectorCode: "COMPUTER", industry: "筆電代工" },
  { ticker: "2357", companyName: "華碩電腦股份有限公司", sectorCode: "COMPUTER", industry: "品牌電腦" },

  { ticker: "2308", companyName: "台達電子工業股份有限公司", sectorCode: "ELECPARTS", industry: "電源供應器" },
  { ticker: "2327", companyName: "國巨股份有限公司", sectorCode: "ELECPARTS", industry: "被動元件" },
  { ticker: "3008", companyName: "大立光電股份有限公司", sectorCode: "ELECPARTS", industry: "光學鏡頭" },

  { ticker: "2881", companyName: "富邦金融控股股份有限公司", sectorCode: "FINANCE", industry: "金控" },
  { ticker: "2882", companyName: "國泰金融控股股份有限公司", sectorCode: "FINANCE", industry: "金控" },
  { ticker: "2891", companyName: "中國信託金融控股股份有限公司", sectorCode: "FINANCE", industry: "金控" },

  { ticker: "1301", companyName: "台灣塑膠工業股份有限公司", sectorCode: "PLASTIC", industry: "塑化" },
  { ticker: "1303", companyName: "南亞塑膠工業股份有限公司", sectorCode: "PLASTIC", industry: "塑化" },

  { ticker: "2002", companyName: "中國鋼鐵股份有限公司", sectorCode: "STEEL", industry: "鋼鐵" },

  { ticker: "2603", companyName: "長榮海運股份有限公司", sectorCode: "SHIPPING", industry: "貨櫃航運" },
  { ticker: "2609", companyName: "陽明海運股份有限公司", sectorCode: "SHIPPING", industry: "貨櫃航運" },

  { ticker: "3045", companyName: "台灣大哥大股份有限公司", sectorCode: "TELECOM", industry: "電信" },
  { ticker: "4904", companyName: "遠傳電信股份有限公司", sectorCode: "TELECOM", industry: "電信" },

  // --- 2026-07-03 使用者提供的熱門供應鏈概念股清單（group_config.json members），補進 stocks 主檔 ---
  // 半導體（IC設計/測試/設備/封裝）
  { ticker: "6223", companyName: "旺矽科技股份有限公司", sectorCode: "SEMI", industry: "探針卡" },
  { ticker: "6515", companyName: "穎崴科技股份有限公司", sectorCode: "SEMI", industry: "測試介面" },
  { ticker: "2449", companyName: "京元電子股份有限公司", sectorCode: "SEMI", industry: "IC測試" },
  { ticker: "3289", companyName: "宜特科技股份有限公司", sectorCode: "SEMI", industry: "材料分析驗證" },
  { ticker: "3587", companyName: "閎康科技股份有限公司", sectorCode: "SEMI", industry: "材料分析驗證" },
  { ticker: "3131", companyName: "弘塑科技股份有限公司", sectorCode: "SEMI", industry: "半導體濕製程設備" },
  { ticker: "3583", companyName: "辛耘企業股份有限公司", sectorCode: "SEMI", industry: "半導體設備" },
  { ticker: "2467", companyName: "志聖工業股份有限公司", sectorCode: "SEMI", industry: "半導體熱烘烤設備" },
  { ticker: "5443", companyName: "均豪精密工業股份有限公司", sectorCode: "SEMI", industry: "半導體設備" },
  { ticker: "6640", companyName: "均華精密工業股份有限公司", sectorCode: "SEMI", industry: "半導體黏晶設備" },
  { ticker: "6187", companyName: "萬潤科技股份有限公司", sectorCode: "SEMI", industry: "半導體點膠設備" },
  { ticker: "3661", companyName: "世芯電子股份有限公司", sectorCode: "SEMI", industry: "ASIC/矽智財" },
  { ticker: "3443", companyName: "創意電子股份有限公司", sectorCode: "SEMI", industry: "ASIC/矽智財" },
  { ticker: "3035", companyName: "智原科技股份有限公司", sectorCode: "SEMI", industry: "ASIC/矽智財" },
  { ticker: "8299", companyName: "群聯電子股份有限公司", sectorCode: "SEMI", industry: "記憶體控制IC" },
  { ticker: "6706", companyName: "惠特科技股份有限公司", sectorCode: "SEMI", industry: "CPO貼合測試設備" },

  // 電腦及週邊設備（伺服器ODM/工業電腦/自動化整機）
  { ticker: "6669", companyName: "緯穎科技服務股份有限公司", sectorCode: "COMPUTER", industry: "伺服器ODM" },
  { ticker: "3231", companyName: "緯創資通股份有限公司", sectorCode: "COMPUTER", industry: "電腦代工" },
  { ticker: "2356", companyName: "英業達股份有限公司", sectorCode: "COMPUTER", industry: "電腦代工" },
  { ticker: "2376", companyName: "技嘉科技股份有限公司", sectorCode: "COMPUTER", industry: "主機板/顯示卡" },
  { ticker: "7805", companyName: "威聯通科技股份有限公司", sectorCode: "COMPUTER", industry: "NAS網路儲存" },
  { ticker: "6188", companyName: "廣明光電股份有限公司", sectorCode: "COMPUTER", industry: "自動化/機器人手臂" },
  { ticker: "2395", companyName: "研華股份有限公司", sectorCode: "COMPUTER", industry: "工業電腦" },
  { ticker: "2464", companyName: "盟立自動化股份有限公司", sectorCode: "COMPUTER", industry: "自動化系統整合" },
  { ticker: "8210", companyName: "勤誠興業股份有限公司", sectorCode: "COMPUTER", industry: "伺服器機殼" },
  { ticker: "4585", companyName: "達明機器人股份有限公司", sectorCode: "COMPUTER", industry: "協作型機器人" },

  // 電子零組件（PCB/CCL/散熱/連接器/精密機構件等）
  { ticker: "3037", companyName: "欣興電子股份有限公司", sectorCode: "ELECPARTS", industry: "ABF載板/PCB" },
  { ticker: "8046", companyName: "南亞電路板股份有限公司", sectorCode: "ELECPARTS", industry: "ABF載板" },
  { ticker: "3189", companyName: "景碩科技股份有限公司", sectorCode: "ELECPARTS", industry: "ABF載板" },
  { ticker: "5289", companyName: "宜鼎國際股份有限公司", sectorCode: "ELECPARTS", industry: "工業用記憶體模組" },
  { ticker: "2451", companyName: "創見資訊股份有限公司", sectorCode: "ELECPARTS", industry: "記憶體模組" },
  { ticker: "8271", companyName: "宇瞻科技股份有限公司", sectorCode: "ELECPARTS", industry: "記憶體模組" },
  { ticker: "3260", companyName: "威剛科技股份有限公司", sectorCode: "ELECPARTS", industry: "記憶體模組" },
  { ticker: "3017", companyName: "奇鋐科技股份有限公司", sectorCode: "ELECPARTS", industry: "散熱模組" },
  { ticker: "3324", companyName: "雙鴻科技股份有限公司", sectorCode: "ELECPARTS", industry: "散熱模組/液冷" },
  { ticker: "2421", companyName: "建準電機工業股份有限公司", sectorCode: "ELECPARTS", industry: "散熱風扇" },
  { ticker: "2301", companyName: "光寶科技股份有限公司", sectorCode: "ELECPARTS", industry: "電源供應器/光電" },
  { ticker: "3081", companyName: "聯亞光電工業股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊元件" },
  { ticker: "3163", companyName: "波若威技術股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊元件" },
  { ticker: "6442", companyName: "光聖科技股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊" },
  { ticker: "4979", companyName: "華星光通股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊元件" },
  { ticker: "3450", companyName: "聯鈞光電股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊元件" },
  { ticker: "4908", companyName: "前鼎光電科技股份有限公司", sectorCode: "ELECPARTS", industry: "光纖被動元件" },
  { ticker: "1785", companyName: "光洋應用材料科技股份有限公司", sectorCode: "ELECPARTS", industry: "貴金屬科技材料" },
  { ticker: "2313", companyName: "華通電腦股份有限公司", sectorCode: "ELECPARTS", industry: "PCB" },
  { ticker: "2383", companyName: "台光電子材料股份有限公司", sectorCode: "ELECPARTS", industry: "CCL/PCB材料" },
  { ticker: "2367", companyName: "燿華電子股份有限公司", sectorCode: "ELECPARTS", industry: "PCB" },
  { ticker: "2355", companyName: "敬鵬工業股份有限公司", sectorCode: "ELECPARTS", industry: "車用PCB" },
  { ticker: "2368", companyName: "金像電子股份有限公司", sectorCode: "ELECPARTS", industry: "PCB" },
  { ticker: "6213", companyName: "聯茂電子股份有限公司", sectorCode: "ELECPARTS", industry: "CCL材料" },
  { ticker: "6274", companyName: "台燿科技股份有限公司", sectorCode: "ELECPARTS", industry: "CCL材料" },
  { ticker: "4958", companyName: "臻鼎科技控股股份有限公司", sectorCode: "ELECPARTS", industry: "PCB/FPC" },
  { ticker: "6269", companyName: "台郡科技股份有限公司", sectorCode: "ELECPARTS", industry: "FPC軟板" },
  { ticker: "8358", companyName: "金居開發股份有限公司", sectorCode: "ELECPARTS", industry: "銅箔" },
  { ticker: "3533", companyName: "嘉澤端子股份有限公司", sectorCode: "ELECPARTS", industry: "連接器" },
  { ticker: "2049", companyName: "上銀科技股份有限公司", sectorCode: "ELECPARTS", industry: "精密傳動/滾珠螺桿" },
  { ticker: "8374", companyName: "羅昇企業股份有限公司", sectorCode: "ELECPARTS", industry: "自動化零組件通路" },
  { ticker: "6215", companyName: "和椿科技股份有限公司", sectorCode: "ELECPARTS", industry: "自動化設備通路" },
  { ticker: "4573", companyName: "高明鐵企業股份有限公司", sectorCode: "ELECPARTS", industry: "精密定位模組" },
  { ticker: "3498", companyName: "陽程科技股份有限公司", sectorCode: "ELECPARTS", industry: "自動化設備" },
  { ticker: "2404", companyName: "漢唐集成股份有限公司", sectorCode: "ELECPARTS", industry: "無塵室工程" },
  { ticker: "3402", companyName: "漢科系統股份有限公司", sectorCode: "ELECPARTS", industry: "無塵室工程" },
  { ticker: "2059", companyName: "川湖科技股份有限公司", sectorCode: "ELECPARTS", industry: "伺服器滑軌" },
  { ticker: "6584", companyName: "南俊國際股份有限公司", sectorCode: "ELECPARTS", industry: "伺服器滑軌零組件" },

  // 通信網路（網通設備商，非電信商）
  { ticker: "2345", companyName: "智邦科技股份有限公司", sectorCode: "TELECOM", industry: "網通交換器" },
  { ticker: "5388", companyName: "中磊電子股份有限公司", sectorCode: "TELECOM", industry: "網通設備" },

  // 大盤指數（合成股票紀錄，重用 tw_daily_price 存 TAIEX 歷史，當相對強度因子的 benchmark，isActive=false 不會出現在戰術面板）
  { ticker: "TAIEX", companyName: "台灣加權股價指數", sectorCode: "INDEX", industry: "大盤指數", isActive: false },
] as const;

export async function seedTwStocks() {
  const sectorIdByCode = new Map<string, number>();

  for (const sector of SECTORS) {
    const row = await prisma.sectorMapping.upsert({
      where: { market_sectorCode: { market: "TW", sectorCode: sector.sectorCode } },
      update: {
        sectorName: sector.sectorName,
        sectorNameZh: sector.sectorNameZh,
        displayOrder: sector.displayOrder,
      },
      create: { ...sector, market: "TW" },
    });
    sectorIdByCode.set(sector.sectorCode, row.id);
  }

  for (const stock of STOCKS) {
    const sectorId = sectorIdByCode.get(stock.sectorCode);
    if (!sectorId) {
      throw new Error(`Unknown sectorCode ${stock.sectorCode} for ${stock.ticker}`);
    }
    const isActive = "isActive" in stock ? stock.isActive : true;
    await prisma.stock.upsert({
      where: { market_ticker: { market: "TW", ticker: stock.ticker } },
      update: {
        companyName: stock.companyName,
        sectorId,
        industry: stock.industry,
        isActive,
      },
      create: {
        ticker: stock.ticker,
        market: "TW",
        companyName: stock.companyName,
        sectorId,
        industry: stock.industry,
        isActive,
      },
    });
  }

  console.log(`Seeded ${SECTORS.length} TW sectors and ${STOCKS.length} TW stocks.`);
}
