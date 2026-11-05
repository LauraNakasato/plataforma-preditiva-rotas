# Plataforma Preditiva de Rotas — Navegação Segura ABC

Aplicativo de navegação e roteamento inteligente (PWA) focado no **Grande ABC Paulista**, projetado para **detectar e contornar áreas de alagamento e enchentes** em tempo real.

> 📄 **Relatório Acadêmico:** O relatório técnico completo elaborado para avaliação universitária (organização de tarefas, tecnologias, diagramas de arquitetura, trechos de código comentados, procedimentos de teste e custos) encontra-se em [**documentacao/RELATORIO_TECNICO.md**](documentacao/RELATORIO_TECNICO.md).

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

## 🗄️ Esquema do Banco de Dados (Supabase / alert_service)

O frontend consulta os pontos de alagamento via `@supabase/supabase-js` através da consulta:
```javascript
const { data, error } = await supabase.from('zonas_risco').select('*');
```

Para alimentar esse banco com o serviço autônomo de alertas (`alert_service`), a tabela segue o contrato abaixo:

### Tabela: `zonas_risco`

| Campo | Tipo | Obrigatório | Descrição | Exemplo |
|---|---|---|---|---|
| `latitude` | `numeric` / `float8` / `text` | **Sim** | Latitude decimal (WGS84) do ponto crítico | `-23.674` |
| `longitude` | `numeric` / `float8` / `text` | **Sim** | Longitude decimal (WGS84) do ponto crítico | `-46.546` |
| `status` | `text` | Não | Estado do ponto (ex: `"alerta"`, `"risco"`) | `"alerta"` |
| `id` | `int8` (PK auto-increment) | Automático | Identificador único do registro gerado pelo banco | `1` |
| `created_at` | `timestamptz` | Automático | Data/hora do registro (padrão: `now()`) | `2026-11-01T01:45:39.507Z` |

---

## 🛠 Tecnologias

- **Frontend:** Next.js 16 (App Router, Turbopack, React 19)
- **Mapas:** Leaflet + Leaflet Routing Machine
- **Roteamento:** OSRM (Open Source Routing Machine)
- **Geocodificação:** Komoot Photon API (OSM)
- **Banco de Dados:** Supabase
- **Serviço de Alertas:** Python 3 (autônomo, sem dependências externas)
- **PWA:** `@ducanh2912/next-pwa`
- **Estilo:** Tailwind CSS 4 + Glassmorphism personalizado

---

## 📂 Estrutura de Arquivos

```text
plataforma-preditiva-rotas/
├── alert_service/         # SERVIÇO DE MONITORAMENTO E ALERTAS (Python)
│   ├── .env.example       # Modelo de variáveis de ambiente (CEMADEN, Supabase)
│   ├── alert.py           # Motor de cálculo espacial (raio 3km) e inserção
│   └── main.py            # Ponto de entrada do serviço
├── app/
│   ├── layout.tsx         # Metadados PWA, fontes e tema
│   ├── page.tsx           # Ponto de entrada (carrega MapaABC via dynamic import)
│   ├── MapaABC.js         # Núcleo: mapa Leaflet, OSRM, GPS, câmera 3D e desvios
│   ├── supabase.js        # Cliente de conexão com o banco Supabase
│   └── globals.css        # Estilos globais
├── components/
│   └── InterfaceEnchentes.tsx  # Componente complementar de alertas da Defesa Civil
├── documentacao/          # DADOS E ESPECIFICAÇÕES
│   ├── alagamentos_abc_historico.csv
│   ├── cemaden_swagger.json
│   ├── pluviometros_santo_andre.csv
│   └── vulnerabilidade_alagamentos_santo_andre.csv
└── public/
    ├── manifest.json      # Configuração PWA para instalação mobile
    └── icon.png           # Ícone do aplicativo
```

---

## 🏁 Como Executar

### 1. Aplicação Web (Next.js)

#### Com Bun
```bash
bun install
bun run dev
```

#### Com Node / NPM
```bash
npm install
npm run dev
```

#### Acesso no Smartphone (Rede Local)
```bash
bun run dev -- -H 0.0.0.0
```
Acesse pelo navegador do celular: `http://<SEU-IP-LOCAL>:3000`.

---

### 2. Serviço de Alertas (alert_service)

Serviço em Python para monitorar as estações do CEMADEN, disparar alertas de alagamento para o Supabase e gerar relatórios visuais em PDF (`alert_service/relatorio_alertas.pdf`).

#### 2.1. Instalação e Configuração
```bash
cd alert_service

# Copiar arquivo de variáveis de ambiente
cp .env.example .env

# Instalar dependências com Poetry (Recomendado)
poetry install

# Ou com pip nativo:
pip install -r requirements.txt
```

#### 2.2. Comandos de Execução

| Objetivo | Comando com Poetry | Comando com Python Nativo |
|---|---|---|
| **Loop Contínuo (Padrão a cada 10 min)** | `poetry run python main.py` | `py main.py` |
| **Rodada Única de Teste (`--once`)** | `poetry run python main.py --once` | `py main.py --once` |
| **Simulação de Chuva e Alertas (`--simular`)** | `poetry run python main.py --once --simular` | `py main.py --once --simular` |
| **Alterar Intervalo (ex: a cada 5 min)** | `poetry run python main.py --intervalo 5` | `py main.py --intervalo 5` |
| **Alterar Raio de Influência (ex: 5 km)** | `poetry run python main.py --once --raio 5.0` | `py main.py --once --raio 5.0` |
| **Forçar Modo Mock no Supabase** | `poetry run python main.py --once --mock-supabase` | `py main.py --once --mock-supabase` |
| **Caminho Personalizado do PDF** | `poetry run python main.py --once --pdf-path relatorio.pdf` | `py main.py --once --pdf-path relatorio.pdf` |
| **Executar Sem Gerar PDF** | `poetry run python main.py --once --sem-pdf` | `py main.py --once --sem-pdf` |
| **Executar com `.env` Customizado** | `poetry run python main.py --env-file .env.prod` | `py main.py --env-file .env.prod` |

*Para mais detalhes dos parâmetros e estrutura do serviço, consulte o [README do alert_service](alert_service/README.md).*

