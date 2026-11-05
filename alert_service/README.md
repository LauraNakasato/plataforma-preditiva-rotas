# Alert Service — Plataforma Preditiva de Rotas

Serviço autônomo em Python para monitoramento das estações do CEMADEN e disparo de alertas de alagamento para o Supabase no Grande ABC.

## Funcionalidades

- **Autenticação Automática no CEMADEN SGAA**: Não é necessário gerar ou colar tokens manualmente. Com `CEMADEN_EMAIL` e `CEMADEN_PASSWORD` definidos no `.env`, o serviço autentica automaticamente e renova o JWT token sempre que expirar (HTTP 401).
- **Mapeamento Espacial (Haversine)**: Relaciona pontos vulneráveis a pluviômetros dentro de um raio de influência (3.0 km).
- **Integração com Supabase**: Consulta áreas ativas e insere novos alertas na tabela `public.zonas_risco`.
- **Modo Mock Seguro**: Flag `MOCK_SUPABASE=true` permite simular inserts sem falhar quando a chave service_role não estiver configurada.

## Como Executar

### 1. Configurar variáveis de ambiente
Copie o `.env.example` para `.env`:
```bash
cp .env.example .env
```

### 2. Com Poetry:
```bash
poetry install
poetry run python main.py
```

Ou para rodar apenas uma verificação de teste:
```bash
poetry run python main.py --once
```

### 3. Com Python nativo:
```bash
py main.py --once
```

### Parâmetros de Linha de Comando (CLI)
- `--once`: Executa apenas uma rodada e finaliza.
- `--intervalo <minutos>`: Define o tempo entre consultas (padrão: 10 minutos).
- `--raio <km>`: Define o raio de influência espacial (padrão: 3.0 km).
- `--simular`: Simula medições pluviométricas sem fazer requisições à API.
- `--mock-supabase`: Força a simulação dos inserts no Supabase.
- `--env-file <caminho>`: Especifica um arquivo `.env` customizado.
