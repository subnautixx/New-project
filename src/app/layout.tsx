import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="pt-BR" className="dark">
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
