/** 顯示用的公司簡稱：拿掉「股份有限公司」尾綴，公司登記全名（DB 裡存的）保留不動。 */
export function stripCompanySuffix(name: string): string {
  return name.replace(/股份有限公司$/, "").trim();
}
