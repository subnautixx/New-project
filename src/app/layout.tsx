import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

/**
 * Duas fontes, com papéis separados.
 *
 * Inter carrega a interface: lista, tabela, formulário, corpo. É neutra de
 * propósito — numa ferramenta olhada oito horas por dia, o texto não deve
 * chamar atenção para si.
 *
 * Archivo carrega a marca e os títulos de tela. É uma grotesca estreita, de
 * aberturas fechadas, com o desenho de letreiro de concessionária e de placa —
 * o mundo do próprio negócio. Usada só em display e com entrelinha apertada,
 * ela dá identidade sem custar legibilidade onde a legibilidade importa.
 *
 * As duas são baixadas e hospedadas pelo `next/font` durante a build: nada de
 * requisição ao Google em execução, e nenhum salto de layout.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700"],
  variable: "--font-archivo",
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
    <html lang="pt-BR" className={`dark ${inter.variable} ${archivo.variable}`}>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
