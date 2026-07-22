import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  title: "DentMarket KZ: закупки для стоматологий",
  description: "Материалы и оборудование для стоматологий Казахстана: сравнение цен, наличие, документы и договор с ЭЦП.",
  keywords: ["стоматология", "закупки", "B2B marketplace", "Казахстан", "стоматологические материалы"],
  openGraph: { title: "DentMarket KZ", description: "Прозрачные закупки для клиник и единый канал продаж для поставщиков.", type: "website", locale: "ru_KZ" },
};

export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="ru"><body>{children}</body></html>; }
