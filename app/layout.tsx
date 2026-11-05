// Importa o tipo Metadata do Next.js.
// Ele permite definir informações sobre a página,
// como título, descrição, ícones e manifesto.
import type { Metadata } from "next";

// Importa a fonte Inter diretamente do Google Fonts
// por meio do sistema de otimização de fontes do Next.js.
import { Inter } from "next/font/google";

// Importa o arquivo global de estilos CSS da aplicação.
import "./globals.css";

// Configura a fonte Inter para utilizar o conjunto de caracteres latinos.
// Essa configuração permite que a fonte seja aplicada às páginas do sistema.
const inter = Inter({ subsets: ["latin"] });

// METADADOS DO NEXT.JS:
// Define informações gerais da aplicação que serão utilizadas
// pelo navegador, mecanismos de busca e dispositivos compatíveis com PWA.
export const metadata: Metadata = {
  // Define o título exibido na aba do navegador.
  title: "Navegação Segura ABC",

  // Define uma descrição sobre a finalidade da plataforma.
  description: "Plataforma preditiva de rotas para o Grande ABC",

  // Indica o caminho do arquivo de manifesto do PWA.
  // O Next.js utiliza essa configuração para inserir a referência
  // ao manifesto na seção head da página.
  manifest: "/manifest.json",

  // Define os ícones utilizados pela aplicação.
  icons: {
    // Ícone exibido como favicon nos navegadores.
    icon: "/icon.png",

    // Ícone utilizado por dispositivos Apple, como iPhones e iPads,
    // quando a aplicação é adicionada à tela inicial.
    apple: "/icon.png",
  },
};

// Define o componente RootLayout, que funciona como estrutura principal
// de todas as páginas da aplicação.
// A propriedade children representa o conteúdo da página atual.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Define o documento HTML e informa que o idioma principal
    // do conteúdo da aplicação é o português.
    <html lang="pt">

      <head>
        {/* Define a cor principal da interface do navegador
            em dispositivos compatíveis, especialmente no celular. */}
        <meta name="theme-color" content="#ef4444" />

        {/* Permite que a aplicação funcione em modo semelhante
            a um aplicativo quando adicionada à tela inicial do iOS. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/* Define o estilo da barra de status do dispositivo Apple. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>

      {/* Aplica a fonte Inter ao corpo inteiro do documento.
          O conteúdo das páginas é renderizado dentro de children. */}
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}