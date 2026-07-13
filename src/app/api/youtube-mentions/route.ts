import { NextRequest, NextResponse } from "next/server";
import { fetchRecentVideoMentions, fetchStockMentions } from "@/lib/youtube/queries";

export async function GET(request: NextRequest) {
  const stockIdParam = request.nextUrl.searchParams.get("stockId");

  if (stockIdParam) {
    const stockId = Number(stockIdParam);
    if (!Number.isFinite(stockId)) {
      return NextResponse.json({ error: "invalid stockId" }, { status: 400 });
    }
    const mentions = await fetchStockMentions(stockId);
    return NextResponse.json({ mentions });
  }

  const videos = await fetchRecentVideoMentions();
  return NextResponse.json({ videos });
}
