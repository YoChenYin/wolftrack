/**
 * 法說會簡報PDF文字擷取。用pdfjs-dist的legacy Node build，只需要getTextContent()、
 * 不需要把頁面畫成圖片，所以不用裝@napi-rs/canvas那類原生binding——這個專案已經在
 * faster-whisper/yt-dlp那次踩過原生依賴在Zeabur部署會出問題的坑（見docs/progress-status.md
 * 2.12/2.13），能純JS解決的就不要加原生依賴。
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
