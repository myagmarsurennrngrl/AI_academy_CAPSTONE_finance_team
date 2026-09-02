import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales Driver Intelligence",
  description: "Борлуулалтын хүчин зүйлийн шинжилгээ · Sales driver analysis platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f6f8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
