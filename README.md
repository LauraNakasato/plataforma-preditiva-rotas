# Plataforma Preditiva de Rotas — Navegação Segura ABC

Aplicativo de navegação e roteamento inteligente (PWA) focado no **Grande ABC Paulista**, projetado para **detectar e contornar áreas de alagamento e enchentes** em tempo real.

---

## 🚀 Funcionalidades

- **Prevenção Ativa de Alagamentos:** Consulta zonas de risco cadastradas e recalcula trajetos automaticamente caso a rota cruze pontos críticos.
- **Múltiplos Modos de Transporte:** Perfis dedicados para **Carro**, **A pé**, **Bicicleta** e **Transporte Público** (rota multimodal simulada com caminhada, ônibus e trem/metrô).
- **Busca Rápida e Localizada:** Autocomplete via Photon com delimitação geográfica (Bounding Box) restrita ao ABC.
- **Navegação GPS em Tempo Real:**
  - *Snap-to-Route:* Estabiliza o cursor sobre a via, eliminando oscilações do GPS.
  - *Filtro de Ruído:* Ignora variações menores que 3m ou giros abaixo de 10°.
  - *Instruções em PT-BR:* Reconhece o gênero da via ("na Rua", "no Viaduto", "pela Avenida").
  - *Detecção de Desvio:* Alerta quando o usuário sai da rota (>60m) com recálculo em um clique.
- **Câmera Imersiva (Visão 3D):** Alternância entre visão superior (2D) e perspectiva 3D (*heading-up*, inclinada a 55°, acompanhando o deslocamento).
- **PWA e Screen WakeLock:** Instalável no celular (Android/iOS) como app nativo e mantém a tela acesa durante o trajeto.

---

## 🧠 Como Funciona a Lógica de Desvio

```mermaid
flowchart TD
    A[Origem e Destino] --> B[OSRM calcula até 3 alternativas]
    B --> C{Cruza zona de risco? (raio 150m)}
    C -->|Não| D[Rota Segura aprovada]
    C -->|Sim| E[Aplica Waypoint de Fuga e recalcula]
    E --> F{Desvio contornou a água?}
    F -->|Sim| G[Rota aprovada com etiqueta 'Com desvio']
    F -->|Não| H[Rota descartada]
    D --> I[Condutor escolhe a melhor rota]
    G --> I
    H --> J{Todas bloqueadas?}
    J -->|Sim| K[ALERTA VERMELHO: Área sem desvios seguros]
```

1. **Dados em Tempo Real:** O app consome do **Supabase** (`zonas_risco`) os pontos de inundação cadastrados.
2. **Checagem Geométrica:** Calcula a menor distância entre cada segmento do trajeto e os centros das áreas de risco.
3. **Desvio Silencioso:** Se houver colisão (< 150m), cria um ponto de fuga silencioso (`OFFSET_FUGA = 0.003`) que obriga o motor OSRM a contornar o obstáculo.
4. **Alerta de Bloqueio:** Se nenhuma alternativa puder evitar o alagamento, a interface sinaliza bloqueio total da região.

---

## 🛠 Tecnologias

- **Frontend:** Next.js 16 (App Router, Turbopack, React 19)
- **Mapas:** Leaflet + Leaflet Routing Machine
- **Roteamento:** OSRM (Open Source Routing Machine)
- **Geocodificação:** Komoot Photon API (OSM)
- **Banco de Dados:** Supabase
- **PWA:** `@ducanh2912/next-pwa`
- **Estilo:** Tailwind CSS 4 + Glassmorphism personalizado

---

## 📂 Estrutura de Arquivos

```text
plataforma-preditiva-rotas/
├── app/
│   ├── layout.tsx         # Metadados PWA, fontes e tema
│   ├── page.tsx           # Ponto de entrada (carrega MapaABC via dynamic import)
│   ├── MapaABC.js         # Núcleo: mapa Leaflet, OSRM, GPS, câmera 3D e desvios
│   ├── supabase.js        # Cliente de conexão com o banco Supabase
│   └── globals.css        # Estilos globais
├── components/
│   └── InterfaceEnchentes.tsx  # Componente complementar de alertas da Defesa Civil
└── public/
    ├── manifest.json      # Configuração PWA para instalação mobile
    └── icon.png           # Ícone do aplicativo
```

---

## 🏁 Como Executar

### Pré-requisitos
- **Bun** (recomendado) ou **Node.js** (v18+)

### Com Bun
```bash
bun install
bun run dev
```

### Com Node / NPM
```bash
npm install
npm run dev
```

### Acesso no Smartphone (Rede Local)
Para testar GPS e PWA em outro dispositivo na mesma rede Wi-Fi:
```bash
bun run dev -- -H 0.0.0.0
```
Acesse pelo navegador do celular usando o IP da sua máquina: `http://<SEU-IP-LOCAL>:3000`.
