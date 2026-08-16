import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * A fonte é servida pelo próprio domínio — `next/font` baixa e hospeda os
 * arquivos na build. Nada de requisição para o Google em tempo de execução, e
 * nenhum salto de layout quando a fonte carrega.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "4FMOTORS CRM",
    template: "%s · 4FMOTORS",
  },
  description: "WhatsApp, clientes e produtividade da equipe 4FMOTORS.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#121214",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`}>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
