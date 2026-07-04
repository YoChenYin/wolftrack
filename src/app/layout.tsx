import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MarketNav />
        {children}
      </body>
    </html>
  );
}
