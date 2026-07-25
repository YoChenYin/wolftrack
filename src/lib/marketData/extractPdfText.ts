/**
 * 法說會簡報PDF文字擷取。用pdfjs-dist的legacy Node build，只需要getTextContent()、
 * 不需要把頁面畫成圖片，所以不用裝@napi-rs/canvas那類原生binding——這個專案已經在
 * faster-whisper/yt-dlp那次踩過原生依賴在Zeabur部署會出問題的坑（見docs/progress-status.md
 * 2.12/2.13），能純JS解決的就不要加原生依賴。
 *
 * ⚠️2026-07-25 production實測踩到的坑：pdfjs-dist雖然會偵測到Node環境自動關掉真的
 * Worker執行緒，但它的「fake worker」後備機制內部是用執行期動態`import("./pdf.worker.mjs")`
 * 載入worker程式碼，Next.js bundler看不懂這種動態路徑、不會把pdf.worker.mjs這個實體檔案
 * 一起打包進production輸出，導致production報錯「Cannot find module .../pdf.worker.mjs」
 * （本機`npx tsx`直接執行、沒有bundler處理，所以本機測試完全正常，只有部署後才會爆）。
 * 修法：靜態import worker檔案本身（bundler看得懂、會正確打包），它會在載入時把
 * WorkerMessageHandler掛到globalThis.pdfjsWorker，pdfjs-dist的fake worker機制會先檢查
 * 這個global有沒有值，有的話就直接用、不會再走那條會爆炸的動態import路徑。
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const data = new Uint8Array(pdfBuffer);
  const doc = await getDocument({ data }).promise;

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pageTexts.push(pageText);
  }

  return pageTexts.join("\n\n");
}
