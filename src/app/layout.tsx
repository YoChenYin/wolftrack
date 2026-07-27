import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { MarketNav } from "@/components/MarketNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 2026-07-26：/tw 首頁的視覺升級用（見 app/tw/layout.tsx），刻意跟其餘頁面的Geist區隔開，
// 只在/tw這個route subtree套用，不影響美股版(施工中頁面)/其他頁面的字體。
const displayFont = Bricolage_Grotesque({ variable: "--font-tw-display", subsets: ["latin"] });
const twSans = IBM_Plex_Sans({ variable: "--font-tw-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const twMono = IBM_Plex_Mono({ variable: "--font-tw-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "WolfTrack 狼蹤",
  description: "美股趨勢追蹤：反轉雷達 / 蓄勢待發 / 趨勢穩健",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${twSans.variable} ${twMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MarketNav />
        {children}
      </body>
    </html>
  );
}
