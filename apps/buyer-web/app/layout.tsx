import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MarketplaceProvider } from "@marketplace/ui";
import "@marketplace/ui/styles.css";
import "./globals.css";

const inter = Inter({ subsets: ["cyrillic", "latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "DentMarket для клиник",
  description: "Закупки стоматологической клиники в одном контуре",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={inter.variable}><MarketplaceProvider>{children}</MarketplaceProvider></body></html>;
}
