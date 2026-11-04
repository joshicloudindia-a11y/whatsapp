import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { MATERIAL_SYMBOLS_HREF } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "ChatFlow — WhatsApp Business Platform",
  description: "Manage all your WhatsApp conversations, campaigns, and automation in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />
      </head>
      <body className="h-full bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
