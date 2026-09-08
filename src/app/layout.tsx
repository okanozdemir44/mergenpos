import type { Metadata } from "next";
import { PosShell } from "@/components/shell/PosShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mergen POS",
  description: "Restoran adisyon & POS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <PosShell>{children}</PosShell>
      </body>
    </html>
  );
}
