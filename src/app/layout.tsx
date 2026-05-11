import { Noto_Sans_SC, Outfit } from "next/font/google";
import "./globals.css";
import { RadioRuntimeProvider } from "@/components/radio/radio-runtime-provider";

export const dynamic = "force-dynamic";

const heading = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Noto_Sans_SC({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${heading.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <RadioRuntimeProvider>{children}</RadioRuntimeProvider>
      </body>
    </html>
  );
}

