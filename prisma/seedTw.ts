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
  // --- 2026-07-06 擴大股票池到數百檔熱門股，補上證交所其餘產業別代碼 ---
  { sectorCode: "TW01", sectorName: "Cement", sectorNameZh: "水泥工業", displayOrder: 9 },
  { sectorCode: "TW02", sectorName: "Food", sectorNameZh: "食品工業", displayOrder: 10 },
  { sectorCode: "TW04", sectorName: "Textiles", sectorNameZh: "紡織纖維", displayOrder: 11 },
  { sectorCode: "TW05", sectorName: "Electric Machinery", sectorNameZh: "電機機械", displayOrder: 12 },
  { sectorCode: "TW06", sectorName: "Electrical & Cable", sectorNameZh: "電器電纜", displayOrder: 13 },
  { sectorCode: "TW08", sectorName: "Glass & Ceramics", sectorNameZh: "玻璃陶瓷", displayOrder: 14 },
  { sectorCode: "TW09", sectorName: "Paper", sectorNameZh: "造紙工業", displayOrder: 15 },
  { sectorCode: "TW11", sectorName: "Rubber", sectorNameZh: "橡膠工業", displayOrder: 16 },
  { sectorCode: "TW12", sectorName: "Automotive", sectorNameZh: "汽車工業", displayOrder: 17 },
  { sectorCode: "TW14", sectorName: "Building Materials & Construction", sectorNameZh: "建材營造業", displayOrder: 18 },
  { sectorCode: "TW16", sectorName: "Tourism", sectorNameZh: "觀光餐旅", displayOrder: 19 },
  { sectorCode: "TW18", sectorName: "Trading & Consumers Goods", sectorNameZh: "貿易百貨業", displayOrder: 20 },
  { sectorCode: "TW20", sectorName: "Others", sectorNameZh: "其他業", displayOrder: 21 },
  { sectorCode: "TW21", sectorName: "Chemicals", sectorNameZh: "化學工業", displayOrder: 22 },
  { sectorCode: "TW22", sectorName: "Biotechnology & Medical Care", sectorNameZh: "生技醫療業", displayOrder: 23 },
  { sectorCode: "TW23", sectorName: "Oil, Gas & Electricity", sectorNameZh: "油電燃氣業", displayOrder: 24 },
  { sectorCode: "TW26", sectorName: "Optoelectronics", sectorNameZh: "光電業", displayOrder: 25 },
  { sectorCode: "TW29", sectorName: "Electronic Products Distribution", sectorNameZh: "電子通路業", displayOrder: 26 },
  { sectorCode: "TW30", sectorName: "Information Services", sectorNameZh: "資訊服務業", displayOrder: 27 },
  { sectorCode: "TW31", sectorName: "Other Electronics", sectorNameZh: "其他電子業", displayOrder: 28 },
  { sectorCode: "TW35", sectorName: "Green Energy & Environmental Services", sectorNameZh: "綠能環保", displayOrder: 29 },
  { sectorCode: "TW36", sectorName: "Digital Cloud", sectorNameZh: "數位雲端", displayOrder: 30 },
  { sectorCode: "TW37", sectorName: "Sports & Leisure", sectorNameZh: "運動休閒", displayOrder: 31 },
  { sectorCode: "TW38", sectorName: "Home Living", sectorNameZh: "居家生活", displayOrder: 32 },
  { sectorCode: "TW91", sectorName: "Depositary Receipts", sectorNameZh: "存託憑證", displayOrder: 33 },
  { sectorCode: "INDEX", sectorName: "Index", sectorNameZh: "指數", displayOrder: 99 },
] as const;

// ~20 檔台股大型股，示範用（代號為證交所股票代號）
const STOCKS = [
  { ticker: "2330", companyName: "台灣積體電路製造股份有限公司", sectorCode: "SEMI", industry: "全球先進製程與晶圓代工絕對龍頭 / AI晶片核心代工" },
  { ticker: "2454", companyName: "聯發科技股份有限公司", sectorCode: "SEMI", industry: "全球手機晶片與邊緣 AI 運算晶片巨頭" },
  { ticker: "2303", companyName: "聯華電子股份有限公司", sectorCode: "SEMI", industry: "成熟製程代工 / 22/28nm 與特殊工藝核心" },
  { ticker: "3711", companyName: "日月光投資控股股份有限公司", sectorCode: "SEMI", industry: "全球封測與 SiP 系統級封裝絕對龍頭" },

  { ticker: "2317", companyName: "鴻海精密工業股份有限公司", sectorCode: "COMPUTER", industry: "全球系統整合代工龍頭 / 垂直整合與整櫃式出貨" },
  { ticker: "2382", companyName: "廣達電腦股份有限公司", sectorCode: "COMPUTER", industry: "高階伺服器代工龍頭 / 北美雲端大廠核心供應商" },
  { ticker: "2357", companyName: "華碩電腦股份有限公司", sectorCode: "COMPUTER", industry: "品牌 PC/NB 巨頭 / 積極擴展 AI 伺服器投標業務" },

  { ticker: "2308", companyName: "台達電子工業股份有限公司", sectorCode: "ELECPARTS", industry: "資料中心電力系統與高瓦數 PSU 龍頭 / 綠能整合方案" },
  { ticker: "2327", companyName: "國巨股份有限公司", sectorCode: "ELECPARTS", industry: "全球被動元件晶片電阻、鉭電容雙料龍頭 / 產業併購王" },
  { ticker: "3008", companyName: "大立光電股份有限公司", sectorCode: "ELECPARTS", industry: "全球手機塑膠鏡頭專利與技術絕對龍頭" },

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
  { ticker: "6223", companyName: "旺矽科技股份有限公司", sectorCode: "SEMI", industry: "高階探針卡龍頭 / 獨家切入矽光子光電測試線" },
  { ticker: "6515", companyName: "穎崴科技股份有限公司", sectorCode: "SEMI", industry: "測試介面" },
  { ticker: "2449", companyName: "京元電子股份有限公司", sectorCode: "SEMI", industry: "高階 GPU/晶片測試核心營運商 / 法人核心基本盤" },
  { ticker: "3289", companyName: "宜特科技股份有限公司", sectorCode: "SEMI", industry: "晶片可靠度驗證老字號 / 跨足後段晶圓減薄加工" },
  { ticker: "3587", companyName: "閎康科技股份有限公司", sectorCode: "SEMI", industry: "亞太區獨立材料與失效分析檢測龍頭" },
  { ticker: "3131", companyName: "弘塑科技股份有限公司", sectorCode: "SEMI", industry: "台積電 CoWoS 濕製程與自動化化學設備龍頭" },
  { ticker: "3583", companyName: "辛耘企業股份有限公司", sectorCode: "SEMI", industry: "晶圓再生與濕製程設備 / 自製設備與代理雙軌驅動" },
  { ticker: "2467", companyName: "志聖工業股份有限公司", sectorCode: "SEMI", industry: "高階熱烘烤設備 / 橫跨載板與先進封裝供應鏈" },
  { ticker: "5443", companyName: "均豪精密工業股份有限公司", sectorCode: "SEMI", industry: "封裝與面板製程自動化光學檢測設備延伸" },
  { ticker: "6640", companyName: "均華精密工業股份有限公司", sectorCode: "SEMI", industry: "精密晶粒挑揀機(Die Sorter)高市佔廠商" },
  { ticker: "6187", companyName: "萬潤科技股份有限公司", sectorCode: "SEMI", industry: "點膠機、散熱貼合與高精度 AOI 量測設備核心" },
  { ticker: "3661", companyName: "世芯電子股份有限公司", sectorCode: "SEMI", industry: "北美 CSP 雲端大廠 AI/HPC 客製化晶片設計服務巨頭" },
  { ticker: "3443", companyName: "創意電子股份有限公司", sectorCode: "SEMI", industry: "台積電體系 ASIC / 先進封裝與高頻寬記憶體整合" },
  { ticker: "3035", companyName: "智原科技股份有限公司", sectorCode: "SEMI", industry: "聯電體系 ASIC 服務商 / 跨足先進製程與高階封裝" },
  { ticker: "8299", companyName: "群聯電子股份有限公司", sectorCode: "SEMI", industry: "NAND Flash 控制晶片巨頭 / 布局 AI 企業級固態硬碟" },
  { ticker: "6706", companyName: "惠特科技股份有限公司", sectorCode: "SEMI", industry: "CPO貼合測試設備" },

  // 電腦及週邊設備（伺服器ODM/工業電腦/自動化整機）
  { ticker: "6669", companyName: "緯穎科技服務股份有限公司", sectorCode: "COMPUTER", industry: "純 AI 伺服器代工 / 資料中心超高純度客製化" },
  { ticker: "3231", companyName: "緯創資通股份有限公司", sectorCode: "COMPUTER", industry: "AI 伺服器基板(Baseboard)核心供應商" },
  { ticker: "2356", companyName: "英業達股份有限公司", sectorCode: "COMPUTER", industry: "企業級伺服器代工主力 / 跨足邊緣運算硬體" },
  { ticker: "2376", companyName: "技嘉科技股份有限公司", sectorCode: "COMPUTER", industry: "自有品牌 AI 伺服器拓展快速 / 專攻中小型區域資料中心" },
  { ticker: "7805", companyName: "威聯通科技股份有限公司", sectorCode: "COMPUTER", industry: "NAS網路儲存" },
  { ticker: "6188", companyName: "廣明光電股份有限公司", sectorCode: "COMPUTER", industry: "自動化/機器人手臂" },
  { ticker: "2395", companyName: "研華股份有限公司", sectorCode: "COMPUTER", industry: "全球工業電腦龍頭 / 物聯網與邊緣運算平台巨頭" },
  { ticker: "2464", companyName: "盟立自動化股份有限公司", sectorCode: "COMPUTER", industry: "自動化系統整合" },
  { ticker: "8210", companyName: "勤誠興業股份有限公司", sectorCode: "COMPUTER", industry: "全球伺服器機殼巨頭 / 標準機櫃核心合作夥伴" },
  { ticker: "4585", companyName: "達明機器人股份有限公司", sectorCode: "COMPUTER", industry: "協作型機器人" },

  // 電子零組件（PCB/CCL/散熱/連接器/精密機構件等）
  { ticker: "3037", companyName: "欣興電子股份有限公司", sectorCode: "ELECPARTS", industry: "全球高階 ABF 載板龍頭 / 技術與產能壁壘高" },
  { ticker: "8046", companyName: "南亞電路板股份有限公司", sectorCode: "ELECPARTS", industry: "伺服器與高效能運算載板老字號主要供應商" },
  { ticker: "3189", companyName: "景碩科技股份有限公司", sectorCode: "ELECPARTS", industry: "ABF 載板 / 高比例 BT 載板與記憶體模組應用" },
  { ticker: "5289", companyName: "宜鼎國際股份有限公司", sectorCode: "ELECPARTS", industry: "工業用記憶體模組" },
  { ticker: "2451", companyName: "創見資訊股份有限公司", sectorCode: "ELECPARTS", industry: "記憶體模組" },
  { ticker: "8271", companyName: "宇瞻科技股份有限公司", sectorCode: "ELECPARTS", industry: "記憶體模組" },
  { ticker: "3260", companyName: "威剛科技股份有限公司", sectorCode: "ELECPARTS", industry: "全球記憶體模組大廠 / 記憶體價格循環槓桿標的" },
  { ticker: "3017", companyName: "奇鋐科技股份有限公司", sectorCode: "ELECPARTS", industry: "散熱管理龍頭 / 3D VC 與液冷系統一體化方案商" },
  { ticker: "3324", companyName: "雙鴻科技股份有限公司", sectorCode: "ELECPARTS", industry: "高階液冷散熱大廠 / 水冷板、CDU 與分歧管純度高" },
  { ticker: "2421", companyName: "建準電機工業股份有限公司", sectorCode: "ELECPARTS", industry: "高階精密節能散熱風扇龍頭 / AI 伺服器風扇核心" },
  { ticker: "2301", companyName: "光寶科技股份有限公司", sectorCode: "ELECPARTS", industry: "雲端高階伺服器電源與 AI 機櫃 BBU 備用電池組" },
  { ticker: "3081", companyName: "聯亞光電工業股份有限公司", sectorCode: "ELECPARTS", industry: "全球雷射磊晶片龍頭 / AI 矽光子核心光源不二選擇" },
  { ticker: "3163", companyName: "波若威技術股份有限公司", sectorCode: "ELECPARTS", industry: "光主被動元件與光纖分路器 / 下世代 WDM 材料" },
  { ticker: "6442", companyName: "光聖科技股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊主被動元件 / 光纖跳線通吃美系大廠急單" },
  { ticker: "4979", companyName: "華星光通股份有限公司", sectorCode: "ELECPARTS", industry: "高階光收發晶片代工與模組 / 美系晶片大廠關鍵夥伴" },
  { ticker: "3450", companyName: "聯鈞光電股份有限公司", sectorCode: "ELECPARTS", industry: "光通訊元件" },
  { ticker: "4908", companyName: "前鼎光電科技股份有限公司", sectorCode: "ELECPARTS", industry: "高階光收發模組 / 受益資料中心傳輸速度升級" },
  { ticker: "1785", companyName: "光洋應用材料科技股份有限公司", sectorCode: "ELECPARTS", industry: "貴金屬科技材料" },
  { ticker: "2313", companyName: "華通電腦股份有限公司", sectorCode: "ELECPARTS", industry: "PCB" },
  { ticker: "2383", companyName: "台光電子材料股份有限公司", sectorCode: "ELECPARTS", industry: "全球高頻高速 CCL 銅箔基板龍頭 / 通吃美系主板材料" },
  { ticker: "2367", companyName: "燿華電子股份有限公司", sectorCode: "ELECPARTS", industry: "PCB" },
  { ticker: "2355", companyName: "敬鵬工業股份有限公司", sectorCode: "ELECPARTS", industry: "車用PCB" },
  { ticker: "2368", companyName: "金像電子股份有限公司", sectorCode: "ELECPARTS", industry: "高階超多層伺服器 PCB 板 / 交換器板絕對核心" },
  { ticker: "6213", companyName: "聯茂電子股份有限公司", sectorCode: "ELECPARTS", industry: "高階高速 CCL 材料 / 搶攻非美系 AI 伺服器訂單" },
  { ticker: "6274", companyName: "台燿科技股份有限公司", sectorCode: "ELECPARTS", industry: "極低損耗高階 CCL 大廠 / 網通高頻傳輸材料" },
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
  { ticker: "2059", companyName: "川湖科技股份有限公司", sectorCode: "ELECPARTS", industry: "全球伺服器精密滑軌龍頭 / 高承重利潤王" },
  { ticker: "6584", companyName: "南俊國際股份有限公司", sectorCode: "ELECPARTS", industry: "鋼珠滑軌大廠 / 成功切入美系 CSP 滑軌供應鏈" },

  // 通信網路（網通設備商，非電信商）
  { ticker: "2345", companyName: "智邦科技股份有限公司", sectorCode: "TELECOM", industry: "全球白牌交換器絕對龍頭 / 800G 與 1.6T 指標廠" },
  { ticker: "5388", companyName: "中磊電子股份有限公司", sectorCode: "TELECOM", industry: "電信商直供網通設備 / 5G 小型基地台先驅" },

  // --- 2026-07-06 擴大股票池：市值前300大新增（TWSE 上市，排除已在池中的87檔與TPEx）---
  { ticker: "2408", companyName: "南亞科技股份有限公司", sectorCode: "SEMI", industry: "台塑集團旗下 DRAM 製造廠 / 專攻利基型記憶體" }, // 南亞科
  { ticker: "7769", companyName: "鴻勁精密股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 鴻勁
  { ticker: "2412", companyName: "中華電信股份有限公司", sectorCode: "TELECOM", industry: "通信網路業" }, // 中華電
  { ticker: "2360", companyName: "致茂電子股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 致茂
  { ticker: "2885", companyName: "元大金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 元大金
  { ticker: "2344", companyName: "華邦電子股份有限公司", sectorCode: "SEMI", industry: "焦家體系 / NOR Flash 與中低密度 DRAM 核心主力" }, // 華邦電
  { ticker: "2887", companyName: "台新新光金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 台新新光金
  { ticker: "2886", companyName: "兆豐金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 兆豐金
  { ticker: "2890", companyName: "永豐金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 永豐金
  { ticker: "6505", companyName: "台塑石化股份有限公司", sectorCode: "TW23", industry: "油電燃氣業" }, // 台塑化
  { ticker: "2884", companyName: "玉山金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 玉山金
  { ticker: "3481", companyName: "群創光電股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 群創
  { ticker: "6446", companyName: "藥華醫藥股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 藥華藥
  { ticker: "3653", companyName: "健策精密工業股份有限公司", sectorCode: "ELECPARTS", industry: "全球高階 CPU/GPU 均熱片(Heat Spreader)絕對龍頭" }, // 健策
  { ticker: "2880", companyName: "華南金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 華南金
  { ticker: "2883", companyName: "凱基金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 凱基金
  { ticker: "2892", companyName: "第一金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 第一金
  { ticker: "1216", companyName: "統一企業股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 統一
  { ticker: "2379", companyName: "瑞昱半導體股份有限公司", sectorCode: "SEMI", industry: "網通、音訊晶片網卡龍頭 / 乙太網路主要供應商" }, // 瑞昱
  { ticker: "3665", companyName: "貿聯控股(BizLink Holding Inc.)", sectorCode: "TW31", industry: "全球高階連接線束龍頭 / 特斯拉與 AI 伺服器雙核心供應商" }, // 貿聯-KY
  { ticker: "5880", companyName: "合作金庫金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 合庫金
  { ticker: "1326", companyName: "台灣化學纖維股份有限公司", sectorCode: "PLASTIC", industry: "塑膠工業" }, // 台化
  { ticker: "6770", companyName: "力晶積成電子製造股份有限公司", sectorCode: "SEMI", industry: "記憶體與邏輯代工 / 基礎晶圓代工" }, // 力積電
  { ticker: "3034", companyName: "聯詠科技股份有限公司", sectorCode: "SEMI", industry: "顯示驅動 IC 龍頭 / 高階 OLED 與車用晶片" }, // 聯詠
  { ticker: "2337", companyName: "旺宏電子股份有限公司", sectorCode: "SEMI", industry: "全球 ROM 唯讀記憶體與 NOR Flash 領導廠商" }, // 旺宏
  { ticker: "1590", companyName: "亞德客國際集團", sectorCode: "TW05", industry: "電機機械" }, // 亞德客-KY
  { ticker: "3036", companyName: "文曄科技股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 文曄
  { ticker: "2801", companyName: "彰化商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 彰銀
  { ticker: "2492", companyName: "華新科技股份有限公司", sectorCode: "ELECPARTS", industry: "華新焦家體系 / 大宗 MLCC、晶片電阻核心廠商" }, // 華新科
  { ticker: "3044", companyName: "健鼎科技股份有限公司", sectorCode: "ELECPARTS", industry: "PCB 多元硬板大廠 / 記憶體、車用與伺服器佈局平衡" }, // 健鼎
  { ticker: "2207", companyName: "和泰汽車股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 和泰車
  { ticker: "6239", companyName: "力成科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 力成
  { ticker: "1519", companyName: "華城電機股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 華城
  { ticker: "6415", companyName: "矽力杰股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 矽力*-KY
  { ticker: "2912", companyName: "統一超商股份有限公司", sectorCode: "TW18", industry: "貿易百貨業" }, // 統一超
  { ticker: "2618", companyName: "長榮航空股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 長榮航
  { ticker: "2409", companyName: "友達光電股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 友達
  { ticker: "4938", companyName: "和碩聯合科技股份有限公司", sectorCode: "COMPUTER", industry: "消費性電子代工大廠 / 布局 AI 伺服器與 5G 專網" }, // 和碩
  { ticker: "2615", companyName: "萬海航運股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 萬海
  { ticker: "6139", companyName: "亞翔工程股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 亞翔
  { ticker: "1802", companyName: "台灣玻璃工業股份有限公司", sectorCode: "TW08", industry: "玻璃陶瓷" }, // 台玻
  { ticker: "5876", companyName: "上海商業儲蓄銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 上海商銀
  { ticker: "5871", companyName: "中租控股股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 中租-KY
  { ticker: "3702", companyName: "大聯大控股股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 大聯大
  { ticker: "1101", companyName: "臺灣水泥股份有限公司", sectorCode: "TW01", industry: "水泥工業" }, // 台泥
  { ticker: "2834", companyName: "臺灣中小企業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 臺企銀
  { ticker: "6789", companyName: "采鈺科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 采鈺
  { ticker: "1504", companyName: "東元電機股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 東元
  { ticker: "3532", companyName: "台塑勝高科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 台勝科
  { ticker: "1605", companyName: "華新麗華股份有限公司", sectorCode: "TW06", industry: "電器電纜" }, // 華新
  { ticker: "6531", companyName: "愛普科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 愛普*
  { ticker: "2347", companyName: "聯強國際股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 聯強
  { ticker: "7750", companyName: "新代科技股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 新代
  { ticker: "2324", companyName: "仁寶電腦工業股份有限公司", sectorCode: "COMPUTER", industry: "電子代工大廠 / 逐步拉高伺服器與車用營收比重" }, // 仁寶
  { ticker: "1402", companyName: "遠東新世紀股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 遠東新
  { ticker: "6919", companyName: "康霈生技股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 康霈*
  { ticker: "3026", companyName: "禾伸堂企業股份有限公司", sectorCode: "ELECPARTS", industry: "高階利基型 MLCC 製造商 / 專攻工控、醫療與高壓電容技術" }, // 禾伸堂
  { ticker: "2633", companyName: "台灣高速鐵路股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 台灣高鐵
  { ticker: "2610", companyName: "中華航空股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 華航
  { ticker: "8996", companyName: "高力熱處理工業股份有限公司", sectorCode: "TW05", industry: "液冷散熱板式熱交換器 / 分歧管核心專利技術" }, // 高力
  { ticker: "6196", companyName: "帆宣系統科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 帆宣
  { ticker: "1102", companyName: "亞洲水泥股份有限公司", sectorCode: "TW01", industry: "水泥工業" }, // 亞泥
  { ticker: "6285", companyName: "啟碁科技股份有限公司", sectorCode: "TELECOM", industry: "車用網通、低軌衛星地端設備與企業級路由器龍頭" }, // 啟碁
  { ticker: "1503", companyName: "士林電機廠股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 士電
  { ticker: "3706", companyName: "神達控股股份有限公司", sectorCode: "COMPUTER", industry: "白牌伺服器與通路市場細分領域受惠者" }, // 神達
  { ticker: "6257", companyName: "矽格股份有限公司", sectorCode: "SEMI", industry: "網通與消費性晶片測試 / 積極擴建 AI 測試線" }, // 矽格
  { ticker: "2812", companyName: "台中商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 台中銀
  { ticker: "7610", companyName: "聯友金屬科技股份有限公司", sectorCode: "TW35", industry: "綠能環保" }, // 聯友金屬-創
  { ticker: "2377", companyName: "微星科技股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 微星
  { ticker: "6526", companyName: "達發科技股份有限公司", sectorCode: "SEMI", industry: "高階藍牙、導航定位與固網寬頻晶片" }, // 達發
  { ticker: "910322", companyName: "康師傅控股有限公司", sectorCode: "TW91", industry: "存託憑證" }, // 康師傅-DR
  { ticker: "1560", companyName: "中國砂輪企業股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 中砂
  { ticker: "6805", companyName: "富世達股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 富世達
  { ticker: "5269", companyName: "祥碩科技股份有限公司", sectorCode: "SEMI", industry: "高速傳輸介面晶片 / AMD 核心合作夥伴" }, // 祥碩
  { ticker: "8464", companyName: "億豐綜合工業股份有限公司", sectorCode: "TW38", industry: "居家生活" }, // 億豐
  { ticker: "2474", companyName: "可成科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 可成
  { ticker: "2027", companyName: "大成不銹鋼工業股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 大成鋼
  { ticker: "5434", companyName: "崇越科技股份有限公司", sectorCode: "TW29", industry: "半導體核心材料(信越晶圓、光阻劑)最大代理商" }, // 崇越
  { ticker: "6409", companyName: "旭隼科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 旭隼
  { ticker: "6781", companyName: "AES Holding Co., Ltd.", sectorCode: "ELECPARTS", industry: "新普旗下 / 高階輕型電動車與資料中心 BBU 電池組利潤王" }, // AES-KY
  { ticker: "2105", companyName: "正新橡膠工業股份有限公司", sectorCode: "TW11", industry: "橡膠工業" }, // 正新
  { ticker: "2838", companyName: "聯邦商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 聯邦銀
  { ticker: "9105", companyName: "泰金寶科技股份有限公司", sectorCode: "TW91", industry: "存託憑證" }, // 泰金寶-DR
  { ticker: "2353", companyName: "宏碁股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 宏碁
  { ticker: "2542", companyName: "興富發建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 興富發
  { ticker: "6691", companyName: "洋基工程股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 洋基工程
  { ticker: "3090", companyName: "日電貿股份有限公司", sectorCode: "ELECPARTS", industry: "台灣最大被動元件代理商 / 代理日系大廠高階電容" }, // 日電貿
  { ticker: "1513", companyName: "中興電工機械股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 中興電
  { ticker: "1717", companyName: "長興材料工業股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 長興
  { ticker: "1476", companyName: "儒鴻企業股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 儒鴻
  { ticker: "2481", companyName: "強茂股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 強茂
  { ticker: "6005", companyName: "群益金鼎證券股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 群益證
  { ticker: "2385", companyName: "群光電子股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 群光
  { ticker: "2441", companyName: "超豐電子股份有限公司", sectorCode: "SEMI", industry: "消費性電子傳統封測主力 / 產能利用率指標" }, // 超豐
  { ticker: "2855", companyName: "統一綜合證券股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 統一證
  { ticker: "3023", companyName: "信邦電子股份有限公司", sectorCode: "ELECPARTS", industry: "高階客製化連接線與整合方案 / 橫跨醫療、綠能與航太" }, // 信邦
  { ticker: "8021", companyName: "尖點科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 尖點
  { ticker: "3042", companyName: "台灣晶技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 晶技
  { ticker: "4919", companyName: "新唐科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 新唐
  { ticker: "2354", companyName: "鴻準精密工業股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 鴻準
  { ticker: "6944", companyName: "兆聯實業股份有限公司", sectorCode: "TW35", industry: "綠能環保" }, // 兆聯實業
  { ticker: "1229", companyName: "聯華實業控股股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 聯華
  { ticker: "8150", companyName: "南茂科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 南茂
  { ticker: "9945", companyName: "潤泰創新國際股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 潤泰新
  { ticker: "3030", companyName: "德律科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 德律
  { ticker: "8454", companyName: "富邦媒體科技股份有限公司", sectorCode: "TW36", industry: "數位雲端" }, // 富邦媒
  { ticker: "2645", companyName: "長榮航太科技股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 長榮航太
  { ticker: "3406", companyName: "玉晶光電股份有限公司", sectorCode: "TW26", industry: "美系大廠核心鏡頭供應商 / 積極切入 VR/AR 潛望式鏡頭" }, // 玉晶光
  { ticker: "9904", companyName: "寶成工業股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 寶成
  { ticker: "3167", companyName: "大量科技股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 大量
  { ticker: "2472", companyName: "立隆電子工業股份有限公司", sectorCode: "ELECPARTS", industry: "高階高壓鋁質電解電容 / 固態電容 / 綠能與車用布局深" }, // 立隆電
  { ticker: "9910", companyName: "豐泰企業股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 豐泰
  { ticker: "3006", companyName: "晶豪科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 晶豪科
  { ticker: "6831", companyName: "邁&#33834;科技股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 邁科
  { ticker: "2455", companyName: "全新光電科技股份有限公司", sectorCode: "TELECOM", industry: "通信網路業" }, // 全新
  { ticker: "3005", companyName: "神基控股股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 神基
  { ticker: "6278", companyName: "台灣表面黏著科技股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 台表科
  { ticker: "2646", companyName: "星宇航空股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 星宇航空
  { ticker: "2845", companyName: "遠東國際商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 遠東銀
  { ticker: "7799", companyName: "禾榮科技股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 禾榮科
  { ticker: "8926", companyName: "台灣汽電共生股份有限公司", sectorCode: "TW23", industry: "油電燃氣業" }, // 台汽電
  { ticker: "6451", companyName: "訊芯科技控股股份有限公司", sectorCode: "SEMI", industry: "高階光收發模組封裝 / 領先佈局 CPO 生產線" }, // 訊芯-KY
  { ticker: "2486", companyName: "一詮精密工業股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 一詮
  { ticker: "2371", companyName: "大同股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 大同
  { ticker: "6949", companyName: "沛爾生技醫藥股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 沛爾生醫-創
  { ticker: "8028", companyName: "昇陽國際半導體股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 昇陽半導體
  { ticker: "2915", companyName: "潤泰全球股份有限公司", sectorCode: "TW18", industry: "貿易百貨業" }, // 潤泰全
  { ticker: "2258", companyName: "鴻華先進科技股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 鴻華先進-創
  { ticker: "2458", companyName: "義隆電子股份有限公司", sectorCode: "SEMI", industry: "觸控螢幕晶片與觸控板 IC 領導廠商" }, // 義隆
  { ticker: "6271", companyName: "同欣電子工業股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 同欣電
  { ticker: "6472", companyName: "保瑞藥業股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 保瑞
  { ticker: "6191", companyName: "精成科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 精成科
  { ticker: "1477", companyName: "聚陽實業股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 聚陽
  { ticker: "6414", companyName: "樺漢科技股份有限公司", sectorCode: "COMPUTER", industry: "鴻海集團旗下 IPC 大廠 / 透過國際併購高速成長" }, // 樺漢
  { ticker: "2889", companyName: "國票金融控股股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 國票金
  { ticker: "2637", companyName: "慧洋海運股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 慧洋-KY
  { ticker: "7822", companyName: "倍利科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 倍利科
  { ticker: "6116", companyName: "瀚宇彩晶股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 彩晶
  { ticker: "2312", companyName: "金寶電子工業股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 金寶
  { ticker: "2597", companyName: "潤弘精密工程事業股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 潤弘
  { ticker: "1773", companyName: "勝一化工股份有限公司", sectorCode: "TW21", industry: "晶圓清洗與蝕刻特用高純度化學溶劑本土主力" , isActive: true },// 勝一
  { ticker: "3563", companyName: "牧德科技股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 牧德
  { ticker: "1210", companyName: "大成長城企業股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 大成
  { ticker: "2634", companyName: "漢翔航空工業股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 漢翔
  { ticker: "1795", companyName: "美時化學製藥股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 美時
  { ticker: "2606", companyName: "裕民航運股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 裕民
  { ticker: "2540", companyName: "愛山林建設開發股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 愛山林
  { ticker: "2352", companyName: "佳世達科技股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 佳世達
  { ticker: "2006", companyName: "東和鋼鐵企業股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 東和鋼鐵
  { ticker: "2867", companyName: "三商美邦人壽保險股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 三商壽
  { ticker: "5522", companyName: "遠雄建設事業股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 遠雄
  { ticker: "3715", companyName: "定穎投資控股股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 定穎投控
  { ticker: "6282", companyName: "康舒科技股份有限公司", sectorCode: "ELECPARTS", industry: "消費性與金屬電源供應器 / 轉型新能源與車用市場" }, // 康舒
  { ticker: "4583", companyName: "台灣精銳科技股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 台灣精銳
  { ticker: "4763", companyName: "濟南大自然新材料股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 材料*-KY
  { ticker: "6890", companyName: "來億興業股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 來億-KY
  { ticker: "7795", companyName: "長廣精機股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 長廣
  { ticker: "2206", companyName: "三陽工業股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 三陽工業
  { ticker: "9917", companyName: "中興保全科技股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 中保科
  { ticker: "1722", companyName: "台灣肥料股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 台肥
  { ticker: "8112", companyName: "至上電子股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 至上
  { ticker: "2539", companyName: "櫻花建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 櫻花建
  { ticker: "9941", companyName: "裕融企業股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 裕融
  { ticker: "2923", companyName: "鼎固控股有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 鼎固-KY
  { ticker: "3714", companyName: "富采控股股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 富采
  { ticker: "1409", companyName: "新光合成纖維股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 新纖
  { ticker: "1907", companyName: "永豐餘投資控股股份有限公司", sectorCode: "TW09", industry: "造紙工業" }, // 永豐餘
  { ticker: "1319", companyName: "東陽實業廠股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 東陽
  { ticker: "2850", companyName: "新光產物保險股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 新產
  { ticker: "6197", companyName: "佳必琪國際股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 佳必琪
  { ticker: "4766", companyName: "南寶樹脂化學工廠股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 南寶
  { ticker: "5469", companyName: "瀚宇博德股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 瀚宇博
  { ticker: "3596", companyName: "智易科技股份有限公司", sectorCode: "TELECOM", industry: "寬頻網通設備 / 歐洲與新興市場電信客戶穩健" }, // 智易
  { ticker: "3019", companyName: "亞洲光學股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 亞光
  { ticker: "2493", companyName: "揚博科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 揚博
  { ticker: "8070", companyName: "長華電材股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 長華*
  { ticker: "5234", companyName: "達興材料股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 達興材料
  { ticker: "6176", companyName: "瑞儀光電股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 瑞儀
  { ticker: "2428", companyName: "興勤電子工業股份有限公司", sectorCode: "ELECPARTS", industry: "全球壓敏/熱敏電阻龍頭 / 專攻車用與伺服器過溫防護" }, // 興勤
  { ticker: "2211", companyName: "長榮鋼鐵股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 長榮鋼
  { ticker: "2388", companyName: "威盛電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 威盛
  { ticker: "8016", companyName: "矽創電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 矽創
  { ticker: "2316", companyName: "楠梓電子股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 楠梓電
  { ticker: "8039", companyName: "台虹科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 台虹
  { ticker: "6412", companyName: "群光電能科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 群電
  { ticker: "8261", companyName: "富鼎先進電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 富鼎
  { ticker: "1736", companyName: "喬山健康科技股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 喬山
  { ticker: "2351", companyName: "順德工業股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 順德
  { ticker: "3016", companyName: "嘉晶電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 嘉晶
  { ticker: "9933", companyName: "中鼎工程股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 中鼎
  { ticker: "2504", companyName: "國產建材實業股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 國產
  { ticker: "3376", companyName: "新日興股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 新日興
  { ticker: "6592", companyName: "和潤企業股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 和潤企業
  { ticker: "2363", companyName: "矽統科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 矽統
  { ticker: "3413", companyName: "京鼎精密科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 京鼎
  { ticker: "8422", companyName: "可寧衛股份有限公司", sectorCode: "TW35", industry: "綠能環保" }, // 可寧衛*
  { ticker: "2498", companyName: "宏達國際電子股份有限公司", sectorCode: "TELECOM", industry: "通信網路業" }, // 宏達電
  { ticker: "6214", companyName: "精誠資訊股份有限公司", sectorCode: "TW30", industry: "資訊服務業" }, // 精誠
  { ticker: "2015", companyName: "豐興鋼鐵股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 豐興
  { ticker: "6670", companyName: "復盛應用科技股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 復盛應用
  { ticker: "2329", companyName: "華泰電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 華泰
  { ticker: "9939", companyName: "宏全國際股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 宏全
  { ticker: "3673", companyName: "TPK Holding Co., Ltd.", sectorCode: "TW26", industry: "光電業" }, // TPK-KY
  { ticker: "1314", companyName: "中國石油化學工業開發(股)公司", sectorCode: "PLASTIC", industry: "塑膠工業" }, // 中石化
  { ticker: "1514", companyName: "亞力電機股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 亞力
  { ticker: "2478", companyName: "大毅科技股份有限公司", sectorCode: "ELECPARTS", industry: "國巨體系 / 精密保護元件與晶片電阻製造大廠" }, // 大毅
  { ticker: "3010", companyName: "華立企業股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 華立
  { ticker: "2548", companyName: "華固建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 華固
  { ticker: "1215", companyName: "台灣卜蜂企業股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 卜蜂
  { ticker: "6719", companyName: "力智電子股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 力智
  { ticker: "4915", companyName: "致伸科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 致伸
  { ticker: "2903", companyName: "遠東百貨股份有限公司", sectorCode: "TW18", industry: "貿易百貨業" }, // 遠百
  { ticker: "2204", companyName: "中華汽車工業股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 中華
  { ticker: "8131", companyName: "福懋科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 福懋科
  { ticker: "6449", companyName: "鈺邦科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 鈺邦
  { ticker: "8033", companyName: "雷虎科技股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 雷虎
  { ticker: "2393", companyName: "億光電子工業股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 億光
  { ticker: "1609", companyName: "大亞電線電纜股份有限公司", sectorCode: "TW06", industry: "電器電纜" }, // 大亞
  { ticker: "2851", companyName: "中央再保險股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 中再保
  { ticker: "6715", companyName: "嘉基科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 嘉基
  { ticker: "2201", companyName: "裕隆汽車製造股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 裕隆
  { ticker: "9921", companyName: "巨大機械工業股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 巨大
  { ticker: "1434", companyName: "福懋興業股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 福懋
  { ticker: "2897", companyName: "王道商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 王道銀行
  { ticker: "6166", companyName: "凌華科技股份有限公司", sectorCode: "COMPUTER", industry: "邊緣運算硬體與量測設備 / 布局機器人作業系統 (ROS2)" }, // 凌華
  { ticker: "2476", companyName: "鉅祥企業股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 鉅祥
  { ticker: "9958", companyName: "世紀鋼鐵結構股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 世紀鋼
  { ticker: "4722", companyName: "國精化學股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 國精化
  { ticker: "2072", companyName: "世紀離岸風電設備股份有限公司", sectorCode: "TW35", industry: "綠能環保" }, // 世紀風電
  { ticker: "4576", companyName: "大銀微系統股份有限公司", sectorCode: "TW05", industry: "電機機械" }, // 大銀微系統
  { ticker: "8110", companyName: "華東科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 華東
  { ticker: "2849", companyName: "安泰商業銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 安泰銀
  { ticker: "2501", companyName: "國泰建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 國建
  { ticker: "6757", companyName: "台灣虎航股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 台灣虎航
  { ticker: "4551", companyName: "智伸科技股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 智伸科
  { ticker: "3576", companyName: "聯合再生能源股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 聯合再生
  { ticker: "6579", companyName: "研揚科技股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 研揚
  { ticker: "8081", companyName: "致新科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 致新
  { ticker: "6491", companyName: "晶碩光學股份有限公司", sectorCode: "TW22", industry: "生技醫療業" }, // 晶碩
  { ticker: "2328", companyName: "廣宇科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 廣宇
  { ticker: "3515", companyName: "華擎科技股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 華擎
  { ticker: "3014", companyName: "聯陽半導體股份有限公司", sectorCode: "SEMI", industry: "PC/NB 輸出入控制 IC 龍頭 / 穩健配息" }, // 聯陽
  { ticker: "1227", companyName: "佳格食品股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 佳格
  { ticker: "1808", companyName: "潤隆建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 潤隆
  { ticker: "1231", companyName: "聯華食品工業股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 聯華食
  { ticker: "2374", companyName: "佳能企業股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 佳能
  { ticker: "4764", companyName: "雙鍵化工股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 雙鍵
  { ticker: "2362", companyName: "藍天電腦股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 藍天
  { ticker: "2489", companyName: "瑞軒科技股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 瑞軒
  { ticker: "2359", companyName: "所羅門股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 所羅門
  { ticker: "5534", companyName: "長虹建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 長虹
  { ticker: "2023", companyName: "燁輝企業股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 燁輝
  { ticker: "1711", companyName: "臺灣永光化學工業股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 永光
  { ticker: "2014", companyName: "中鴻鋼鐵股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業" }, // 中鴻
  { ticker: "1904", companyName: "正隆股份有限公司", sectorCode: "TW09", industry: "造紙工業" }, // 正隆
  { ticker: "2607", companyName: "長榮國際儲運股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 榮運
  { ticker: "3033", companyName: "威健實業股份有限公司", sectorCode: "TW29", industry: "電子通路業" }, // 威健
  { ticker: "2208", companyName: "台灣國際造船股份有限公司", sectorCode: "SHIPPING", industry: "航運業" }, // 台船
  { ticker: "2535", companyName: "達欣工程股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 達欣工
  { ticker: "6830", companyName: "汎銓科技股份有限公司", sectorCode: "TW31", industry: "先進製程研發材料分析核心 / 高階工藝技術" }, // 汎銓
  { ticker: "9907", companyName: "統一實業股份有限公司", sectorCode: "TW20", industry: "其他業" }, // 統一實
  { ticker: "2101", companyName: "南港輪胎股份有限公司", sectorCode: "TW11", industry: "橡膠工業" }, // 南港
  { ticker: "2375", companyName: "凱美電機股份有限公司", sectorCode: "ELECPARTS", industry: "國巨集團旗下 / 鋁質電解電容與風扇製造廠商" }, // 凱美
  { ticker: "7711", companyName: "永擎電子股份有限公司", sectorCode: "COMPUTER", industry: "電腦及週邊設備業" }, // 永擎
  { ticker: "1440", companyName: "臺南紡織股份有限公司", sectorCode: "TW04", industry: "紡織纖維" }, // 南紡
  { ticker: "1718", companyName: "中國人造纖維股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 中纖
  { ticker: "1232", companyName: "大統益股份有限公司", sectorCode: "TW02", industry: "食品工業" }, // 大統益
  { ticker: "2439", companyName: "美律實業股份有限公司", sectorCode: "TELECOM", industry: "通信網路業" }, // 美律
  { ticker: "2707", companyName: "晶華國際酒店股份有限公司", sectorCode: "TW16", industry: "觀光餐旅" }, // 晶華
  { ticker: "7827", companyName: "英屬開曼群島商漢康生技(股)公司", sectorCode: "TW22", industry: "生技醫療業" }, // 漢康-KY創
  { ticker: "2820", companyName: "中華票券金融股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 華票
  { ticker: "2426", companyName: "鼎元光電科技股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 鼎元
  { ticker: "3013", companyName: "晟銘電子科技股份有限公司", sectorCode: "COMPUTER", industry: "高階 AI 伺服器機殼與液冷機櫃整合研發廠" }, // 晟銘電
  { ticker: "2836", companyName: "高雄銀行股份有限公司", sectorCode: "FINANCE", industry: "金融保險業" }, // 高雄銀
  { ticker: "9914", companyName: "美利達工業股份有限公司", sectorCode: "TW37", industry: "運動休閒" }, // 美利達
  { ticker: "6456", companyName: "GIS Holding Limited", sectorCode: "TW26", industry: "光電業" }, // GIS-KY
  { ticker: "6605", companyName: "帝寶工業股份有限公司", sectorCode: "TW12", industry: "汽車工業" }, // 帝寶
  { ticker: "2515", companyName: "中華工程股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 中工
  { ticker: "4967", companyName: "十銓科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 十銓
  { ticker: "7786", companyName: "東方風能科技股份有限公司", sectorCode: "TW35", industry: "綠能環保" }, // 東方風能
  { ticker: "6525", companyName: "捷敏股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 捷敏-KY
  { ticker: "7722", companyName: "連加網路商業股份有限公司", sectorCode: "TW36", industry: "數位雲端" }, // LINEPAY
  { ticker: "7768", companyName: "頌勝科技材料股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 頌勝科技
  { ticker: "6177", companyName: "達麗建設事業股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 達麗
  { ticker: "1608", companyName: "華榮電線電纜股份有限公司", sectorCode: "TW06", industry: "電器電纜" }, // 華榮
  { ticker: "6672", companyName: "騰輝電子國際集團股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 騰輝電子-KY
  { ticker: "2520", companyName: "冠德建設股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 冠德
  { ticker: "2402", companyName: "毅嘉科技股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 毅嘉
  { ticker: "3592", companyName: "瑞鼎科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 瑞鼎
  { ticker: "3617", companyName: "碩天科技股份有限公司", sectorCode: "TW31", industry: "其他電子業" }, // 碩天
  { ticker: "2727", companyName: "王品餐飲股份有限公司", sectorCode: "TW16", industry: "觀光餐旅" }, // 王品
  { ticker: "1714", companyName: "和桐化學股份有限公司", sectorCode: "TW21", industry: "化學工業" }, // 和桐
  { ticker: "3149", companyName: "正達國際光電股份有限公司", sectorCode: "TW26", industry: "光電業" }, // 正達
  { ticker: "7749", companyName: "意騰科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 意騰-KY
  { ticker: "2401", companyName: "凌陽科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 凌陽
  { ticker: "2543", companyName: "皇昌營造股份有限公司", sectorCode: "TW14", industry: "建材營造業" }, // 皇昌
  { ticker: "5284", companyName: "經寶精密控股股份有限公司", sectorCode: "TW20", industry: "其他業" }, // jpp-KY
  { ticker: "4961", companyName: "天鈺科技股份有限公司", sectorCode: "SEMI", industry: "電源管理與顯示驅動晶片 / 擴展電子紙與車用" }, // 天鈺
  { ticker: "7788", companyName: "松川精密股份有限公司", sectorCode: "ELECPARTS", industry: "電子零組件業" }, // 松川精密
  { ticker: "6937", companyName: "天虹科技股份有限公司", sectorCode: "SEMI", industry: "半導體業" }, // 天虹

  // --- 2026-07-09 使用者提供「台灣純科技股清單」補上未追蹤的科技股 ---
  { ticker: "5347", companyName: "世界先進積體電路股份有限公司", sectorCode: "SEMI", industry: "8吋/12吋晶圓代工 / 電源管理 IC 高市佔", isActive: true },
  { ticker: "4966", companyName: "譜瑞科技股份有限公司", sectorCode: "SEMI", industry: "高速訊號傳輸與時序控制 IC (Timing Controller)", isActive: true },
  { ticker: "3545", companyName: "敦泰電子股份有限公司", sectorCode: "SEMI", industry: "觸控與驅動整合晶片 (IDC) / 中低階智慧機與車載", isActive: true },
  { ticker: "3529", companyName: "力旺電子股份有限公司", sectorCode: "SEMI", industry: "嵌入式非揮發性記憶體 IP 龍頭 / 純權利金商業模式", isActive: true },
  { ticker: "6643", companyName: "円星科技股份有限公司", sectorCode: "SEMI", industry: "基礎與高速傳輸介面實體層 IP 供應商", isActive: true },
  { ticker: "6533", companyName: "晶心科技股份有限公司", sectorCode: "SEMI", industry: "RISC-V 架構高階處理器 IP 開發商", isActive: true },
  { ticker: "6462", companyName: "神盾股份有限公司", sectorCode: "SEMI", industry: "指紋辨識轉型 IP / 聯盟化佈局先進製程 IP", isActive: true },
  { ticker: "3265", companyName: "台星科股份有限公司", sectorCode: "SEMI", industry: "高階晶圓測試 / 先進封裝產能外溢受益者", isActive: true },
  { ticker: "3264", companyName: "欣銓科技股份有限公司", sectorCode: "SEMI", industry: "車用與工控微控制器(MCU)晶片測試龍頭", isActive: true },
  { ticker: "6147", companyName: "頎邦科技股份有限公司", sectorCode: "SEMI", industry: "面板驅動 IC 封裝測試龍頭 / 穩健高股息", isActive: true },
  { ticker: "3680", companyName: "家登精密工業股份有限公司", sectorCode: "SEMI", industry: "全球高階 EUV Pod 光罩傳送盒龍頭", isActive: true },
  { ticker: "6207", companyName: "雷科股份有限公司", sectorCode: "ELECPARTS", industry: "雷射修阻機與高階封裝材料載帶供應", isActive: true },
  { ticker: "8064", companyName: "東捷科技股份有限公司", sectorCode: "TW26", industry: "雷射修補設備 / 跨足面板級封裝 (PLP) 領域", isActive: true },
  { ticker: "6664", companyName: "群翊工業股份有限公司", sectorCode: "ELECPARTS", industry: "PCB與半導體自動化塗佈烘烤設備 / 高階製程關鍵", isActive: true },
  { ticker: "4768", companyName: "晶呈科技股份有限公司", sectorCode: "TW21", industry: "高純度特殊電子氣體 / 乾式蝕刻必需品", isActive: true },
  { ticker: "4755", companyName: "三福化工股份有限公司", sectorCode: "TW21", industry: "顯影劑回收與特用化學品供應商", isActive: true },
  { ticker: "3483", companyName: "力致科技股份有限公司", sectorCode: "COMPUTER", industry: "風扇與散熱模組大廠 / 研發浸沒式散熱系統", isActive: true },
  { ticker: "3338", companyName: "泰碩電子股份有限公司", sectorCode: "ELECPARTS", industry: "通訊基地台與中高階伺服器散熱模組供應商", isActive: true },
  { ticker: "3015", companyName: "全漢企業股份有限公司", sectorCode: "ELECPARTS", industry: "工控與伺服器電源供應器 / 儲能設備開拓", isActive: true },
  { ticker: "2420", companyName: "新巨企業股份有限公司", sectorCode: "ELECPARTS", industry: "客製化高階工控、軍工與伺服器冗餘電源 (Redundant)", isActive: true },
  { ticker: "8155", companyName: "博智電子股份有限公司", sectorCode: "ELECPARTS", industry: "高階工業電腦與中高階伺服器 PCB 厚板專家", isActive: true },
  { ticker: "6117", companyName: "迎廣科技股份有限公司", sectorCode: "COMPUTER", industry: "轉型高階 AI 機櫃與系統組裝成效顯著廠", isActive: true },
  { ticker: "3357", companyName: "西北臺慶科技股份有限公司", sectorCode: "ELECPARTS", industry: "一體成型電感 (Molding Choke) / 高效能 AI 伺服器受惠", isActive: true },
  { ticker: "6173", companyName: "信昌電子陶瓷股份有限公司", sectorCode: "ELECPARTS", industry: "專攻大尺寸、高電壓特殊晶片電容與陶瓷粉末材料", isActive: true },
  { ticker: "6205", companyName: "詮欣股份有限公司", sectorCode: "ELECPARTS", industry: "車載高速傳輸連接器 / ADAS 鏡頭線束佈局深", isActive: true },
  { ticker: "3003", companyName: "健和興端子股份有限公司", sectorCode: "ELECPARTS", industry: "綠能與車用端子連接器 / 跨足電動車充電槍全球供應鏈", isActive: true },
  { ticker: "4906", companyName: "正文科技股份有限公司", sectorCode: "TELECOM", industry: "無線網路設備 OEM/ODM / 發展直供與乾淨網路", isActive: true },
  { ticker: "3380", companyName: "明泰科技股份有限公司", sectorCode: "TELECOM", industry: "代工中大型交換器、智慧城域網與無線寬頻", isActive: true },
  { ticker: "3558", companyName: "神準科技股份有限公司", sectorCode: "TELECOM", industry: "高階企業級網路安全伺服器與無線網通製造商", isActive: true },
  { ticker: "3025", companyName: "星通資訊股份有限公司", sectorCode: "TELECOM", industry: "關鍵任務網路 (MCC) 整合設備商 / 高壁壘", isActive: true },
  { ticker: "3363", companyName: "上詮光纖通信股份有限公司", sectorCode: "TELECOM", industry: "光纖共同封裝(CPO)技術 / 與晶圓大廠技術高度對接", isActive: true },
  { ticker: "4977", companyName: "眾達科技股份有限公司", sectorCode: "TELECOM", industry: "全球高階光收發模組代工大廠 / 與美系博通連結深", isActive: true },
  { ticker: "6206", companyName: "飛捷科技股份有限公司", sectorCode: "COMPUTER", industry: "全球 POS 機製造大廠 / 轉型 AI 邊緣智慧零售硬體", isActive: true },
  { ticker: "3362", companyName: "先進光電科技股份有限公司", sectorCode: "TW26", industry: "筆電鏡頭龍頭 / 切入車用車載鏡頭與高階安防", isActive: true },
  { ticker: "2231", companyName: "為升電裝工業股份有限公司", sectorCode: "TW12", industry: "汽車胎壓偵測系統 (TPMS) 與高階毫米波雷達大廠", isActive: true },
  { ticker: "3552", companyName: "同致電子企業股份有限公司", sectorCode: "TW31", industry: "車載倒車雷達與影像系統 / 專攻自動停車與 ADAS 系統", isActive: true },
  { ticker: "6279", companyName: "胡連精密股份有限公司", sectorCode: "ELECPARTS", industry: "車用端子與高頻連接器龍頭 / 中國與東南亞車廠核心鏈", isActive: true },
  { ticker: "2497", companyName: "怡利電子工業股份有限公司", sectorCode: "TW12", industry: "車載抬頭顯示器 (HUD) 與智慧座艙系統開發商", isActive: true },
  { ticker: "6121", companyName: "新普科技股份有限公司", sectorCode: "COMPUTER", industry: "全球筆電與智慧手機電池模組龍頭 / 穩健高配息", isActive: true },
  { ticker: "3323", companyName: "加百裕工業股份有限公司", sectorCode: "COMPUTER", industry: "鋰電池模組大廠 / 擴展網通、儲能與電動兩輪車市場", isActive: true },

  // --- 2026-07-09 補上 group_config.json theme members 裡漏加進 stocks 主檔的股票 ---
  { ticker: "1304", companyName: "台灣聚合化學品股份有限公司", sectorCode: "PLASTIC", industry: "塑膠工業", isActive: true },
  { ticker: "1308", companyName: "亞洲聚合股份有限公司", sectorCode: "PLASTIC", industry: "塑膠工業", isActive: true },
  { ticker: "1536", companyName: "和大工業股份有限公司", sectorCode: "TW12", industry: "汽車工業", isActive: true },
  { ticker: "1727", companyName: "臺灣中華化學工業股份有限公司", sectorCode: "TW21", industry: "化學生技醫療", isActive: true },
  { ticker: "1789", companyName: "台灣神隆股份有限公司", sectorCode: "TW22", industry: "生技醫療業", isActive: true },
  { ticker: "2031", companyName: "新光鋼鐵股份有限公司", sectorCode: "STEEL", industry: "鋼鐵工業", isActive: true },
  { ticker: "2314", companyName: "台揚科技股份有限公司", sectorCode: "TELECOM", industry: "電子工業", isActive: true },
  { ticker: "2406", companyName: "國碩科技工業股份有限公司", sectorCode: "TW26", industry: "電子工業", isActive: true },
  { ticker: "2605", companyName: "新興航運股份有限公司", sectorCode: "SHIPPING", industry: "航運業", isActive: true },
  { ticker: "2612", companyName: "中國航運股份有限公司", sectorCode: "SHIPPING", industry: "航運業", isActive: true },
  { ticker: "2731", companyName: "雄獅旅行社股份有限公司", sectorCode: "TW16", industry: "觀光餐旅", isActive: true },
  { ticker: "3049", companyName: "精金科技股份有限公司", sectorCode: "TW26", industry: "電子工業", isActive: true },
  { ticker: "3176", companyName: "基亞生物科技股份有限公司", sectorCode: "TW22", industry: "生技醫療業", isActive: true },
  { ticker: "3491", companyName: "昇達科技股份有限公司", sectorCode: "TELECOM", industry: "通信網路業", isActive: true },
  { ticker: "4147", companyName: "中裕新藥股份有限公司", sectorCode: "TW22", industry: "生技醫療業", isActive: true },
  { ticker: "4174", companyName: "台灣浩鼎生技股份有限公司", sectorCode: "TW22", industry: "生技醫療業", isActive: true },
  { ticker: "4572", companyName: "駐龍精密機械股份有限公司", sectorCode: "TW05", industry: "電機機械", isActive: true },
  { ticker: "5243", companyName: "乙盛精密工業股份有限公司", sectorCode: "TW26", industry: "電子工業", isActive: true },
  { ticker: "5351", companyName: "鈺創科技股份有限公司", sectorCode: "SEMI", industry: "半導體業", isActive: true },
  { ticker: "6443", companyName: "元晶太陽能科技股份有限公司", sectorCode: "TW26", industry: "電子工業", isActive: true },
  { ticker: "6477", companyName: "安集科技股份有限公司", sectorCode: "TW26", industry: "電子工業", isActive: true },
  { ticker: "6589", companyName: "台康生技股份有限公司", sectorCode: "TW22", industry: "生技醫療業", isActive: true },
  { ticker: "8088", companyName: "品安科技股份有限公司", sectorCode: "SEMI", industry: "半導體業", isActive: true },
  { ticker: "8222", companyName: "寶一科技股份有限公司", sectorCode: "TW05", industry: "電機機械", isActive: true },

  // 大盤指數（合成股票紀錄，重用 tw_daily_price 存 TAIEX 歷史，當相對強度因子的 benchmark，isActive=false 不會出現在戰術面板）
  { ticker: "TAIEX", companyName: "台灣加權股價指數", sectorCode: "INDEX", industry: "大盤指數", isActive: false },
] as const;

/**
 * 2026-07-09 使用者要求把戰術分類（反轉雷達/蓄勢待發/趨勢穩健）的股票池收斂成「科技類股 + 金融股」，
 * 移除傳統產業（水泥/食品/紡織/鋼鐵/航運/建材/觀光餐旅/貿易百貨/汽車/化學/油電燃氣/橡膠/玻璃陶瓷/
 * 造紙/電器電纜/運動休閒/居家生活…等）。用 isActive=false 軟移除（歷史資料保留，之後要恢復隨時可以）。
 * 板塊層級用 sectorCode 整批排除；TW20（其他業）、TW91（存託憑證）是官方分類本身就混雜科技與非科技股
 * 的萬用板塊，改成逐檔判斷（例如 TW20 裡的 8033雷虎科技、5284經寶精密控股保留，9933中鼎工程移除）。
 */
const NON_TECH_SECTOR_CODES = new Set([
  "PLASTIC",
  "STEEL",
  "SHIPPING",
  "TW01",
  "TW02",
  "TW04",
  "TW06",
  "TW08",
  "TW09",
  "TW11",
  "TW12",
  "TW14",
  "TW16",
  "TW18",
  "TW21",
  "TW23",
  "TW37",
  "TW38",
]);
const NON_TECH_TICKER_OVERRIDES = new Set([
  "910322", // 康師傅控股（TW91 存託憑證，食品飲料）
  "5871", // 中租控股（TW20 其他業，租賃金融，非官方「金融保險業」分類）
  "9945", // 潤泰創新國際（投資控股）
  "9917", // 中興保全科技（保全服務）
  "9941", // 裕融企業（汽車金融）
  "9933", // 中鼎工程（工程服務）
  "6592", // 和潤企業（車輛租賃）
  "9939", // 宏全國際（包裝容器）
  "9907", // 統一實業（食品相關）
]);

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
    const isActive =
      "isActive" in stock
        ? stock.isActive
        : !NON_TECH_SECTOR_CODES.has(stock.sectorCode) && !NON_TECH_TICKER_OVERRIDES.has(stock.ticker);
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
