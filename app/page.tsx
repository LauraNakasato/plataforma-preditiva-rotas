'use client';
import dynamic from 'next/dynamic';

const MapaComDados = dynamic(() => import('./MapaABC'), { ssr: false });

export default function Home() {
  return (
    <main style={{ margin: 0, padding: 0 }}>
      <MapaComDados />
    </main>
  );
}