// Indica que este componente deve ser executado no lado do cliente,
// permitindo o uso de recursos do navegador.
'use client';

// Importa a função dynamic do Next.js, que permite carregar componentes
// de forma dinâmica, ou seja, somente quando forem necessários.
import dynamic from 'next/dynamic';

// Importa o componente MapaABC de forma dinâmica.
// A opção ssr: false desativa a renderização no servidor (Server-Side Rendering),
// garantindo que o mapa seja carregado somente no navegador.
// Isso é importante porque bibliotecas de mapas, como o Leaflet,
// dependem de recursos disponíveis no ambiente do navegador.
const MapaComDados = dynamic(() => import('./MapaABC'), { ssr: false });

// Define o componente principal da página.
export default function Home() {
  return (
    // Elemento principal que envolve o conteúdo da página.
    // margin: 0 e padding: 0 removem as margens e os espaçamentos internos,
    // permitindo que o mapa ocupe o espaço disponível sem bordas indesejadas.
    <main style={{ margin: 0, padding: 0 }}>

      {/* Exibe o componente do mapa, que foi carregado dinamicamente. */}
      <MapaComDados />

    </main>
  );
}