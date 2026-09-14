import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";
import "./dashboard-responsive.css";
import "./inbox-layout.css";
import "./voice.css";
import "./realtime.css";
import "./crm.css";
import "./brand.css";
import "./csat.css";

const displayFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const bodyFont = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f8f7f4",
};

export const metadata: Metadata = {
  title: "Sabor Express · Atendimento que aproxima",
  description: "Uma experiência de atendimento com IA e pessoas, trabalhando juntas. Demonstração para o case HeadOffice.ai.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Corretores do navegador podem adicionar atributos ao <html> antes da hidratação.
  return <html lang="pt-BR" className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning><body>{children}</body></html>;
}
