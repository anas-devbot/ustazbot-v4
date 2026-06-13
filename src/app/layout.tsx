import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "UstazBot — Jawapan Agama Islam | AI Bermazhab Shafie-ASWJ",
  description:
    "UstazBot ialah AI bermazhab Shafie-ASWJ yang membantu menjawab persoalan agama secara ringkas dan tepat. Rujukan muktabar, jawapan Bahasa Melayu, fiqh Malaysia.",
  keywords: [
    "ustazbot",
    "soal jawab agama",
    "fiqh shafie",
    "ASWJ",
    "hukum Islam",
    "AI Islam",
    "soal jawab Islam Malaysia",
  ],
  openGraph: {
    title: "UstazBot — Jawapan Agama Islam",
    description:
      "AI bermazhab Shafie-ASWJ. Tanya soalan agama, dapat jawapan berlandaskan rujukan muktabar.",
    url: "https://ustazbot.com",
    siteName: "UstazBot",
    type: "website",
    locale: "ms_MY",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}