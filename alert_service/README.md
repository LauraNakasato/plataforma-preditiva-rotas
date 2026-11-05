# Alert Service — Plataforma Preditiva de Rotas

Serviço autônomo em Python para monitoramento contínuo das estações pluviométricas do CEMADEN, detecção de limiares de inundação no Grande ABC e disparo de alertas para o banco de dados Supabase e relatórios em PDF.

---

## 🚀 Funcionalidades

- **Autenticação Automática no CEMADEN SGAA**: Não é necessário gerar ou colar tokens manualmente. Com `CEMADEN_EMAIL` e `CEMADEN_PASSWORD` definidos no `.env`, o serviço autentica automaticamente via SGAA e renova o JWT token sempre que expirar (HTTP 401).
- **Mapeamento Espacial (Haversine)**: Relaciona cada ponto vulnerável de Santo André às estações pluviométricas dentro de um raio de influência (padrão: 3.0 km).
- **Integração com Supabase**: Consulta áreas ativas e insere novos registros de alerta na tabela `public.zonas_risco`.
- **Geração Automática de Relatórios em PDF**: A cada rodada, gera um relatório visual formatado (`relatorio_alertas.pdf`) com suporte a emojis, cards de resumo, tabelas de risco e status das rotas.
- **Modo Mock Seguro**: A flag `MOCK_SUPABASE=true` simula inserções locais com logs detalhados, permitindo testes sem chave `service_role`.

---

## 🛠 Pré-requisitos e Instalação

### 1. Configurar Variáveis de Ambiente
Copie o arquivo de exemplo para `.env`:
```bash
cd alert_service
cp .env.example .env
```
*(O arquivo `.env.example` já inclui as credenciais e parâmetros padrão prontos para uso).*

### 2. Instalar Dependências

#### Opção A: Com Poetry (Recomendado)
```bash
cd alert_service
poetry install
```

#### Opção B: Com Pip / Python Nativo
```bash
cd alert_service
pip install -r requirements.txt
```

---

## 💻 Todos os Comandos de Execução

Todos os comandos abaixo podem ser executados com `poetry run python main.py` (ou com `python main.py` / `py main.py`):

### 1. Execução Padrão (Monitoramento Contínuo)
Executa o serviço em loop contínuo (a cada 10 minutos por padrão), consultando a API real do CEMADEN, gerando o relatório PDF e gravando no Supabase:
```bash
# Com Poetry
poetry run python main.py

# Com Python nativo
py main.py
```

### 2. Execução de Rodada Única (`--once`)
Ideal para testes pontuais ou agendadores externos (cron / task scheduler). Executa uma única verificação e finaliza imediatamente:
```bash
# Com Poetry
poetry run python main.py --once

# Com Python nativo
py main.py --once
```

### 3. Modo de Simulação de Chuva (`--simular`)
Simula medições pluviométricas elevadas em todas as estações. Útil para testar o disparo de múltiplos alertas, inserções no banco mock e verificação dos badges de alerta no PDF sem depender da chuva real no momento:
```bash
poetry run python main.py --once --simular
```

### 4. Ajustar o Intervalo de Verificação (`--intervalo`)
Altera o tempo de espera entre cada consulta (em minutos):
```bash
# Consulta a cada 5 minutos
poetry run python main.py --intervalo 5

# Consulta a cada 30 minutos
poetry run python main.py --intervalo 30
```

### 5. Ajustar o Raio de Influência Espacial (`--raio`)
Modifica o raio geodésico (em km) ao redor de cada pluviômetro para cobrir os pontos vulneráveis:
```bash
# Raio expandido para 5 km
poetry run python main.py --once --raio 5.0

# Raio reduzido para 2 km
poetry run python main.py --once --raio 2.0
```

### 6. Forçar Modo Mock no Supabase (`--mock-supabase`)
Simula a inserção de alertas localmente sem enviar requisições de escrita para a tabela do Supabase:
```bash
poetry run python main.py --once --mock-supabase
```

### 7. Customizar o Caminho do PDF Gerado (`--pdf-path`)
Salva o relatório em um diretório ou nome de arquivo personalizado:
```bash
poetry run python main.py --once --pdf-path relatorio_saida.pdf
```

### 8. Desabilitar a Geração do PDF (`--sem-pdf`)
Executa a verificação e disparos sem gerar o arquivo PDF:
```bash
poetry run python main.py --once --sem-pdf
```

### 9. Utilizar Arquivo `.env` Customizado (`--env-file`)
Carrega variáveis de ambiente de um arquivo específico:
```bash
poetry run python main.py --env-file .env.production
```

### 10. Passar Credenciais do CEMADEN Diretamente via CLI
Substitui as credenciais do `.env` por parâmetros informados na linha de comando:
```bash
poetry run python main.py --once --cemaden-email "seu_email@exemplo.com" --cemaden-password "sua_senha"
```

### 11. Utilizar um Token JWT Estático Pré-definido
```bash
poetry run python main.py --once --cemaden-token "seu_token_jwt_aqui"
```

---

## 📋 Tabela Resumo dos Parâmetros de Linha de Comando (CLI)

| Flag | Tipo | Padrão | Descrição |
|---|---|---|---|
| `--once` | Flag (booleano) | `False` | Executa apenas uma rodada de verificação e encerra o processo. |
| `--simular` | Flag (booleano) | `False` | Simula medições pluviométricas sem fazer chamadas à API do CEMADEN. |
| `--intervalo <min>` | Inteiro | `10` | Intervalo em minutos entre cada verificação contínua. |
| `--raio <km>` | Float | `3.0` | Raio de influência espacial entre pluviômetro e ponto vulnerável. |
| `--mock-supabase` | Flag (booleano) | `True` | Simula os `INSERT`s na tabela `zonas_risco` sem exigir permissão de escrita. |
| `--pdf-path <caminho>` | String | `relatorio_alertas.pdf` | Caminho do arquivo PDF gerado. |
| `--sem-pdf` | Flag (booleano) | `False` | Desativa a criação do arquivo PDF. |
| `--cemaden-email <email>` | String | `.env` | Email para login automático no SGAA do CEMADEN. |
| `--cemaden-password <senha>` | String | `.env` | Senha para login automático no SGAA do CEMADEN. |
| `--cemaden-token <token>` | String | `.env` | Token JWT estático pré-existente do CEMADEN. |
| `--env-file <caminho>` | String | `.env` | Caminho para um arquivo de variáveis de ambiente customizado. |

---

## 📄 Relatório em PDF (`relatorio_alertas.pdf`)

A cada ciclo de execução, o arquivo [`relatorio_alertas.pdf`](relatorio_alertas.pdf) é atualizado com:
1. **Banner e Metadados**: Data/hora, município, status de conexão com CEMADEN e Supabase.
2. **Cards de Resumo (KPIs)**: Total de pontos, estações ativas com telemetria, maior volume de chuva e total de alertas emitidos.
3. **Tabela de Análise de Risco**: Comparativo entre a precipitação tolerada e a chuva detectada (1h e 24h), com indicação de status (`Normal ✅` ou `ALERTA 🚨`).
4. **Mapeamento de Cobertura Espacial**: Lista de estações pluviométricas situadas a até 3.0 km de cada local monitorado.
