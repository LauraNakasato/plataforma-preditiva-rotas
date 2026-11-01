import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// METADADOS DO NEXT.JS: Isso insere automaticamente <link rel="manifest" href="/manifest.json" /> no <head>
export const metadata: Metadata = {
  title: "Navegação Segura ABC",
  description: "Plataforma preditiva de rotas para o Grande ABC",
  manifest: "/manifest.json", // O Next.js resolve e injeta o manifesto aqui
  icons: {
    icon: "/icon.png", // Usa o novo logotipo como ícone de favoritos (favicon)
    apple: "/icon.png", // Ícone de favoritos para dispositivos iOS
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <head>
        {/* Força o suporte a cores e tema no telemóvel para o PWA */}
        <meta name="theme-color" content="#ef4444" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}