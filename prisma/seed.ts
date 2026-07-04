import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedTwStocks } from "./seedTw";

// 完整 11 個 GICS 板塊，順序照 GICS 標準（Energy -> ... -> Real Estate）
const SECTORS = [
  { sectorCode: "ENERGY", sectorName: "Energy", sectorNameZh: "能源", displayOrder: 1 },
  { sectorCode: "MATERIALS", sectorName: "Materials", sectorNameZh: "原物料", displayOrder: 2 },
  { sectorCode: "INDU", sectorName: "Industrials", sectorNameZh: "工業", displayOrder: 3 },
  { sectorCode: "CD", sectorName: "Consumer Discretionary", sectorNameZh: "非必需消費", displayOrder: 4 },
  { sectorCode: "STAPLES", sectorName: "Consumer Staples", sectorNameZh: "必需消費", displayOrder: 5 },
  { sectorCode: "HC", sectorName: "Healthcare", sectorNameZh: "醫療保健", displayOrder: 6 },
  { sectorCode: "FIN", sectorName: "Financials", sectorNameZh: "金融", displayOrder: 7 },
  { sectorCode: "TECH", sectorName: "Technology", sectorNameZh: "科技", displayOrder: 8 },
  { sectorCode: "COMM", sectorName: "Communication Services", sectorNameZh: "通訊服務", displayOrder: 9 },
  { sectorCode: "UTIL", sectorName: "Utilities", sectorNameZh: "公用事業", displayOrder: 10 },
  { sectorCode: "REALESTATE", sectorName: "Real Estate", sectorNameZh: "不動產", displayOrder: 11 },
] as const;

// ~100 檔美股大型股，每個板塊 9-10 檔，涵蓋完整 11 個 GICS 板塊
const STOCKS = [
  // Energy
  { ticker: "XOM", companyName: "Exxon Mobil Corporation", sectorCode: "ENERGY", industry: "Oil & Gas Integrated" },
  { ticker: "CVX", companyName: "Chevron Corporation", sectorCode: "ENERGY", industry: "Oil & Gas Integrated" },
  { ticker: "COP", companyName: "ConocoPhillips", sectorCode: "ENERGY", industry: "Oil & Gas E&P" },
  { ticker: "SLB", companyName: "Schlumberger Limited", sectorCode: "ENERGY", industry: "Oil & Gas Equipment & Services" },
  { ticker: "EOG", companyName: "EOG Resources, Inc.", sectorCode: "ENERGY", industry: "Oil & Gas E&P" },
  { ticker: "MPC", companyName: "Marathon Petroleum Corporation", sectorCode: "ENERGY", industry: "Oil & Gas Refining & Marketing" },
  { ticker: "PSX", companyName: "Phillips 66", sectorCode: "ENERGY", industry: "Oil & Gas Refining & Marketing" },
  { ticker: "OXY", companyName: "Occidental Petroleum Corporation", sectorCode: "ENERGY", industry: "Oil & Gas E&P" },
  { ticker: "WMB", companyName: "The Williams Companies, Inc.", sectorCode: "ENERGY", industry: "Oil & Gas Midstream" },

  // Materials
  { ticker: "LIN", companyName: "Linde plc", sectorCode: "MATERIALS", industry: "Specialty Chemicals" },
  { ticker: "SHW", companyName: "The Sherwin-Williams Company", sectorCode: "MATERIALS", industry: "Specialty Chemicals" },
  { ticker: "APD", companyName: "Air Products and Chemicals, Inc.", sectorCode: "MATERIALS", industry: "Specialty Chemicals" },
  { ticker: "ECL", companyName: "Ecolab Inc.", sectorCode: "MATERIALS", industry: "Specialty Chemicals" },
  { ticker: "FCX", companyName: "Freeport-McMoRan Inc.", sectorCode: "MATERIALS", industry: "Copper" },
  { ticker: "NEM", companyName: "Newmont Corporation", sectorCode: "MATERIALS", industry: "Gold" },
  { ticker: "DOW", companyName: "Dow Inc.", sectorCode: "MATERIALS", industry: "Chemicals" },
  { ticker: "NUE", companyName: "Nucor Corporation", sectorCode: "MATERIALS", industry: "Steel" },
  { ticker: "CTVA", companyName: "Corteva, Inc.", sectorCode: "MATERIALS", industry: "Agricultural Inputs" },

  // Industrials
  { ticker: "BA", companyName: "The Boeing Company", sectorCode: "INDU", industry: "Aerospace & Defense" },
  { ticker: "CAT", companyName: "Caterpillar Inc.", sectorCode: "INDU", industry: "Farm & Heavy Construction Machinery" },
  { ticker: "HON", companyName: "Honeywell International Inc.", sectorCode: "INDU", industry: "Conglomerates" },
  { ticker: "UPS", companyName: "United Parcel Service, Inc.", sectorCode: "INDU", industry: "Integrated Freight & Logistics" },
  { ticker: "RTX", companyName: "RTX Corporation", sectorCode: "INDU", industry: "Aerospace & Defense" },
  { ticker: "GE", companyName: "GE Aerospace", sectorCode: "INDU", industry: "Aerospace & Defense" },
  { ticker: "LMT", companyName: "Lockheed Martin Corporation", sectorCode: "INDU", industry: "Aerospace & Defense" },
  { ticker: "DE", companyName: "Deere & Company", sectorCode: "INDU", industry: "Farm & Heavy Construction Machinery" },
  { ticker: "UNP", companyName: "Union Pacific Corporation", sectorCode: "INDU", industry: "Railroads" },

  // Consumer Discretionary
  { ticker: "AMZN", companyName: "Amazon.com, Inc.", sectorCode: "CD", industry: "Internet Retail" },
  { ticker: "TSLA", companyName: "Tesla, Inc.", sectorCode: "CD", industry: "Auto Manufacturers" },
  { ticker: "HD", companyName: "The Home Depot, Inc.", sectorCode: "CD", industry: "Home Improvement Retail" },
  { ticker: "MCD", companyName: "McDonald's Corporation", sectorCode: "CD", industry: "Restaurants" },
  { ticker: "NKE", companyName: "NIKE, Inc.", sectorCode: "CD", industry: "Footwear & Accessories" },
  { ticker: "LOW", companyName: "Lowe's Companies, Inc.", sectorCode: "CD", industry: "Home Improvement Retail" },
  { ticker: "SBUX", companyName: "Starbucks Corporation", sectorCode: "CD", industry: "Restaurants" },
  { ticker: "BKNG", companyName: "Booking Holdings Inc.", sectorCode: "CD", industry: "Travel Services" },
  { ticker: "TJX", companyName: "The TJX Companies, Inc.", sectorCode: "CD", industry: "Apparel Retail" },
  { ticker: "CMG", companyName: "Chipotle Mexican Grill, Inc.", sectorCode: "CD", industry: "Restaurants" },

  // Consumer Staples
  { ticker: "PG", companyName: "The Procter & Gamble Company", sectorCode: "STAPLES", industry: "Household & Personal Products" },
  { ticker: "KO", companyName: "The Coca-Cola Company", sectorCode: "STAPLES", industry: "Beverages" },
  { ticker: "PEP", companyName: "PepsiCo, Inc.", sectorCode: "STAPLES", industry: "Beverages" },
  { ticker: "WMT", companyName: "Walmart Inc.", sectorCode: "STAPLES", industry: "Discount Stores" },
  { ticker: "COST", companyName: "Costco Wholesale Corporation", sectorCode: "STAPLES", industry: "Discount Stores" },
  { ticker: "PM", companyName: "Philip Morris International Inc.", sectorCode: "STAPLES", industry: "Tobacco" },
  { ticker: "MO", companyName: "Altria Group, Inc.", sectorCode: "STAPLES", industry: "Tobacco" },
  { ticker: "CL", companyName: "Colgate-Palmolive Company", sectorCode: "STAPLES", industry: "Household & Personal Products" },
  { ticker: "MDLZ", companyName: "Mondelez International, Inc.", sectorCode: "STAPLES", industry: "Packaged Foods" },

  // Healthcare
  { ticker: "UNH", companyName: "UnitedHealth Group Incorporated", sectorCode: "HC", industry: "Healthcare Plans" },
  { ticker: "LLY", companyName: "Eli Lilly and Company", sectorCode: "HC", industry: "Drug Manufacturers" },
  { ticker: "JNJ", companyName: "Johnson & Johnson", sectorCode: "HC", industry: "Drug Manufacturers" },
  { ticker: "PFE", companyName: "Pfizer Inc.", sectorCode: "HC", industry: "Drug Manufacturers" },
  { ticker: "MRK", companyName: "Merck & Co., Inc.", sectorCode: "HC", industry: "Drug Manufacturers" },
  { ticker: "ABBV", companyName: "AbbVie Inc.", sectorCode: "HC", industry: "Drug Manufacturers" },
  { ticker: "TMO", companyName: "Thermo Fisher Scientific Inc.", sectorCode: "HC", industry: "Diagnostics & Research" },
  { ticker: "ABT", companyName: "Abbott Laboratories", sectorCode: "HC", industry: "Medical Devices" },
  { ticker: "DHR", companyName: "Danaher Corporation", sectorCode: "HC", industry: "Diagnostics & Research" },
  { ticker: "BMY", companyName: "Bristol-Myers Squibb Company", sectorCode: "HC", industry: "Drug Manufacturers" },

  // Financials
  { ticker: "JPM", companyName: "JPMorgan Chase & Co.", sectorCode: "FIN", industry: "Banks" },
  { ticker: "GS", companyName: "The Goldman Sachs Group, Inc.", sectorCode: "FIN", industry: "Capital Markets" },
  { ticker: "BAC", companyName: "Bank of America Corporation", sectorCode: "FIN", industry: "Banks" },
  { ticker: "WFC", companyName: "Wells Fargo & Company", sectorCode: "FIN", industry: "Banks" },
  { ticker: "MS", companyName: "Morgan Stanley", sectorCode: "FIN", industry: "Capital Markets" },
  { ticker: "C", companyName: "Citigroup Inc.", sectorCode: "FIN", industry: "Banks" },
  { ticker: "BLK", companyName: "BlackRock, Inc.", sectorCode: "FIN", industry: "Asset Management" },
  { ticker: "SCHW", companyName: "The Charles Schwab Corporation", sectorCode: "FIN", industry: "Capital Markets" },
  { ticker: "AXP", companyName: "American Express Company", sectorCode: "FIN", industry: "Credit Services" },
  { ticker: "SPGI", companyName: "S&P Global Inc.", sectorCode: "FIN", industry: "Financial Data & Exchanges" },

  // Technology
  { ticker: "AAPL", companyName: "Apple Inc.", sectorCode: "TECH", industry: "Consumer Electronics" },
  { ticker: "MSFT", companyName: "Microsoft Corporation", sectorCode: "TECH", industry: "Software" },
  { ticker: "NVDA", companyName: "NVIDIA Corporation", sectorCode: "TECH", industry: "Semiconductors" },
  { ticker: "AMD", companyName: "Advanced Micro Devices, Inc.", sectorCode: "TECH", industry: "Semiconductors" },
  { ticker: "AVGO", companyName: "Broadcom Inc.", sectorCode: "TECH", industry: "Semiconductors" },
  { ticker: "ORCL", companyName: "Oracle Corporation", sectorCode: "TECH", industry: "Software" },
  { ticker: "CRM", companyName: "Salesforce, Inc.", sectorCode: "TECH", industry: "Software" },
  { ticker: "ADBE", companyName: "Adobe Inc.", sectorCode: "TECH", industry: "Software" },
  { ticker: "CSCO", companyName: "Cisco Systems, Inc.", sectorCode: "TECH", industry: "Communication Equipment" },
  { ticker: "INTC", companyName: "Intel Corporation", sectorCode: "TECH", industry: "Semiconductors" },

  // Communication Services
  { ticker: "GOOGL", companyName: "Alphabet Inc.", sectorCode: "COMM", industry: "Internet Content & Information" },
  { ticker: "META", companyName: "Meta Platforms, Inc.", sectorCode: "COMM", industry: "Internet Content & Information" },
  { ticker: "NFLX", companyName: "Netflix, Inc.", sectorCode: "COMM", industry: "Entertainment" },
  { ticker: "DIS", companyName: "The Walt Disney Company", sectorCode: "COMM", industry: "Entertainment" },
  { ticker: "CMCSA", companyName: "Comcast Corporation", sectorCode: "COMM", industry: "Telecom Services" },
  { ticker: "T", companyName: "AT&T Inc.", sectorCode: "COMM", industry: "Telecom Services" },
  { ticker: "VZ", companyName: "Verizon Communications Inc.", sectorCode: "COMM", industry: "Telecom Services" },
  { ticker: "TMUS", companyName: "T-Mobile US, Inc.", sectorCode: "COMM", industry: "Telecom Services" },
  { ticker: "WBD", companyName: "Warner Bros. Discovery, Inc.", sectorCode: "COMM", industry: "Entertainment" },

  // Utilities
  { ticker: "NEE", companyName: "NextEra Energy, Inc.", sectorCode: "UTIL", industry: "Utilities Renewable" },
  { ticker: "DUK", companyName: "Duke Energy Corporation", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "SO", companyName: "The Southern Company", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "D", companyName: "Dominion Energy, Inc.", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "AEP", companyName: "American Electric Power Company, Inc.", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "EXC", companyName: "Exelon Corporation", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "SRE", companyName: "Sempra", sectorCode: "UTIL", industry: "Utilities Regulated Gas" },
  { ticker: "XEL", companyName: "Xcel Energy Inc.", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },
  { ticker: "ED", companyName: "Consolidated Edison, Inc.", sectorCode: "UTIL", industry: "Utilities Regulated Electric" },

  // Real Estate
  { ticker: "PLD", companyName: "Prologis, Inc.", sectorCode: "REALESTATE", industry: "REIT - Industrial" },
  { ticker: "AMT", companyName: "American Tower Corporation", sectorCode: "REALESTATE", industry: "REIT - Specialty" },
  { ticker: "EQIX", companyName: "Equinix, Inc.", sectorCode: "REALESTATE", industry: "REIT - Specialty" },
  { ticker: "CCI", companyName: "Crown Castle Inc.", sectorCode: "REALESTATE", industry: "REIT - Specialty" },
  { ticker: "PSA", companyName: "Public Storage", sectorCode: "REALESTATE", industry: "REIT - Industrial" },
  { ticker: "O", companyName: "Realty Income Corporation", sectorCode: "REALESTATE", industry: "REIT - Retail" },
  { ticker: "SPG", companyName: "Simon Property Group, Inc.", sectorCode: "REALESTATE", industry: "REIT - Retail" },
  { ticker: "WELL", companyName: "Welltower Inc.", sectorCode: "REALESTATE", industry: "REIT - Healthcare Facilities" },
  { ticker: "DLR", companyName: "Digital Realty Trust, Inc.", sectorCode: "REALESTATE", industry: "REIT - Specialty" },
  // AI 供應鏈題材股（散熱/被動元件/CPO/AI infra/PCB），大多是 TECH，少數（Vertiv/nVent/Modine）
  // GICS 正式分類其實是 Industrials，題材標籤本來就是跨板塊的，sector 維持正確分類，用 themes 額外標記
  { ticker: "VRT", companyName: "Vertiv Holdings Co", sectorCode: "INDU", industry: "Electrical Equipment & Parts" },
  { ticker: "NVT", companyName: "nVent Electric plc", sectorCode: "INDU", industry: "Electrical Equipment & Parts" },
  { ticker: "MOD", companyName: "Modine Manufacturing Company", sectorCode: "INDU", industry: "Electrical Equipment & Parts" },
  { ticker: "VSH", companyName: "Vishay Intertechnology, Inc.", sectorCode: "TECH", industry: "Electronic Components" },
  { ticker: "LFUS", companyName: "Littelfuse, Inc.", sectorCode: "TECH", industry: "Electronic Components" },
  { ticker: "CTS", companyName: "CTS Corporation", sectorCode: "TECH", industry: "Electronic Components" },
  { ticker: "COHR", companyName: "Coherent Corp.", sectorCode: "TECH", industry: "Scientific & Technical Instruments" },
  { ticker: "LITE", companyName: "Lumentum Holdings Inc.", sectorCode: "TECH", industry: "Communication Equipment" },
  { ticker: "AAOI", companyName: "Applied Optoelectronics, Inc.", sectorCode: "TECH", industry: "Communication Equipment" },
  { ticker: "CIEN", companyName: "Ciena Corporation", sectorCode: "TECH", industry: "Communication Equipment" },
  { ticker: "SMCI", companyName: "Super Micro Computer, Inc.", sectorCode: "TECH", industry: "Computer Hardware" },
  { ticker: "ANET", companyName: "Arista Networks, Inc.", sectorCode: "TECH", industry: "Communication Equipment" },
  { ticker: "DELL", companyName: "Dell Technologies Inc.", sectorCode: "TECH", industry: "Computer Hardware" },
  { ticker: "TTMI", companyName: "TTM Technologies, Inc.", sectorCode: "TECH", industry: "Electronic Components" },
] as const;

// 跨板塊題材標籤（一檔股票可以有多個）
const THEMES = [
  { themeCode: "AI_INFRA", themeName: "AI Infrastructure", themeNameZh: "AI infra", displayOrder: 1 },
  { themeCode: "THERMAL", themeName: "Thermal Management", themeNameZh: "散熱", displayOrder: 2 },
  { themeCode: "PASSIVE", themeName: "Passive Components", themeNameZh: "被動元件", displayOrder: 3 },
  { themeCode: "CPO", themeName: "Co-Packaged Optics", themeNameZh: "CPO", displayOrder: 4 },
  { themeCode: "PCB", themeName: "Printed Circuit Board", themeNameZh: "PCB", displayOrder: 5 },
] as const;

// ticker -> 題材標籤（多對多）
const STOCK_THEME_LINKS: Record<string, readonly string[]> = {
  NVDA: ["AI_INFRA"],
  AVGO: ["AI_INFRA"],
  VRT: ["AI_INFRA", "THERMAL"],
  NVT: ["THERMAL"],
  MOD: ["THERMAL"],
  VSH: ["PASSIVE"],
  LFUS: ["PASSIVE"],
  CTS: ["PASSIVE"],
  COHR: ["CPO"],
  LITE: ["CPO"],
  AAOI: ["CPO"],
  CIEN: ["CPO"],
  SMCI: ["AI_INFRA"],
  ANET: ["AI_INFRA"],
  DELL: ["AI_INFRA"],
  TTMI: ["PCB"],
};

async function main() {
  const sectorIdByCode = new Map<string, number>();

  for (const sector of SECTORS) {
    const row = await prisma.sectorMapping.upsert({
      where: { market_sectorCode: { market: "US", sectorCode: sector.sectorCode } },
      update: {
        sectorName: sector.sectorName,
        sectorNameZh: sector.sectorNameZh,
        displayOrder: sector.displayOrder,
      },
      create: { ...sector, market: "US" },
    });
    sectorIdByCode.set(sector.sectorCode, row.id);
  }

  const stockIdByTicker = new Map<string, number>();

  for (const stock of STOCKS) {
    const sectorId = sectorIdByCode.get(stock.sectorCode);
    if (!sectorId) {
      throw new Error(`Unknown sectorCode ${stock.sectorCode} for ${stock.ticker}`);
    }
    const row = await prisma.stock.upsert({
      where: { market_ticker: { market: "US", ticker: stock.ticker } },
      update: {
        companyName: stock.companyName,
        sectorId,
        industry: stock.industry,
      },
      create: {
        ticker: stock.ticker,
        market: "US",
        companyName: stock.companyName,
        sectorId,
        industry: stock.industry,
      },
    });
    stockIdByTicker.set(stock.ticker, row.id);
  }

  const themeIdByCode = new Map<string, number>();
  for (const theme of THEMES) {
    const row = await prisma.theme.upsert({
      where: { themeCode: theme.themeCode },
      update: {
        themeName: theme.themeName,
        themeNameZh: theme.themeNameZh,
        displayOrder: theme.displayOrder,
      },
      create: theme,
    });
    themeIdByCode.set(theme.themeCode, row.id);
  }

  let themeLinks = 0;
  for (const [ticker, themeCodes] of Object.entries(STOCK_THEME_LINKS)) {
    const stockId = stockIdByTicker.get(ticker);
    if (!stockId) {
      console.warn(`skip theme link for ${ticker}: stock not found`);
      continue;
    }
    for (const themeCode of themeCodes) {
      const themeId = themeIdByCode.get(themeCode);
      if (!themeId) {
        throw new Error(`Unknown themeCode ${themeCode} for ${ticker}`);
      }
      await prisma.stockTheme.upsert({
        where: { stockId_themeId: { stockId, themeId } },
        update: {},
        create: { stockId, themeId },
      });
      themeLinks++;
    }
  }

  console.log(
    `Seeded ${SECTORS.length} sectors, ${STOCKS.length} stocks, ${THEMES.length} themes, ${themeLinks} theme links.`
  );

  await seedTwStocks();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
