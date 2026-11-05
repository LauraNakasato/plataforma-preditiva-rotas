"""
Serviço de Monitoramento e Alertas de Alagamento (alert_service)
Santo André / Grande ABC Paulista
------------------------------------------------------------------
1. Carrega variáveis de ambiente automaticamente do arquivo .env.
2. Autentica no webservice do CEMADEN SGAA (/controle-token/tokens) e
   renova o token JWT automaticamente quando expirado.
3. Lê as estações pluviométricas do CEMADEN (documentacao/pluviometros_santo_andre.csv).
4. Lê os pontos críticos e suas tolerâncias (documentacao/vulnerabilidade_alagamentos_santo_andre.csv).
5. Mapeia a área de influência espacial (raio de 3 km) entre pluviômetros e pontos vulneráveis.
6. Consulta periodicamente a API oficial do CEMADEN (/pcds-acum/acumulados-recentes).
7. Se o volume de chuva exceder a tolerância do endereço, insere alerta no Supabase (zonas_risco).
   Suporta modo mock (MOCK_SUPABASE=true) para testes locais sem credenciais de escrita.
8. Gera automaticamente um relatório em PDF com design profissional, tabelas de risco e emojis.
"""

import os
import sys
import csv
import math
import time
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime

# Garante que o diretório atual do script esteja no sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Garante saída UTF-8 no Windows/PowerShell
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def carregar_env(caminho_env=None):
    """
    Carrega variáveis do arquivo .env.
    Tenta usar python-dotenv se disponível; caso contrário usa carregador nativo.
    """
    candidatos = [
        caminho_env,
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for c in candidatos:
        if c and os.path.isfile(c):
            try:
                from dotenv import load_dotenv
                load_dotenv(c)
                print(f"📄 Configurações carregadas do arquivo (dotenv): {os.path.abspath(c)}")
                return True
            except ImportError:
                try:
                    with open(c, mode="r", encoding="utf-8") as f:
                        for linha in f:
                            linha = linha.strip()
                            if not linha or linha.startswith("#"):
                                continue
                            if "=" in linha:
                                chave, valor = linha.split("=", 1)
                                chave = chave.strip()
                                valor = valor.strip().strip("'\"")
                                if chave and chave not in os.environ:
                                    os.environ[chave] = valor
                    print(f"📄 Configurações carregadas do arquivo (nativo): {os.path.abspath(c)}")
                    return True
                except Exception as e:
                    print(f"⚠️ Erro ao ler arquivo .env ({c}): {e}")
    return False


# Carrega o .env logo no início da execução
carregar_env()

# ================= Configurações Padrão (com fallback para .env) =================
DEFAULT_CEMADEN_URL = os.environ.get("CEMADEN_URL", "https://sws.cemaden.gov.br/PED/rest")
DEFAULT_CEMADEN_SGAA_URL = os.environ.get("CEMADEN_SGAA_URL", "https://sgaa.cemaden.gov.br/SGAA/rest/controle-token/tokens")
DEFAULT_CEMADEN_EMAIL = os.environ.get("CEMADEN_EMAIL", "")
DEFAULT_CEMADEN_PASSWORD = os.environ.get("CEMADEN_PASSWORD", "")
DEFAULT_CEMADEN_TOKEN = os.environ.get("CEMADEN_TOKEN", "")

DEFAULT_SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dzhfqsftxdkauwgrxgdf.supabase.co")
DEFAULT_SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or
    os.environ.get("SUPABASE_KEY") or
    "sb_publishable_ZBEoCCMdz62UE_6HQEGQPg_93RWIrvR"
)

COD_IBGE_MUNICIPIO = os.environ.get("COD_IBGE_MUNICIPIO", "3547809")
RAIO_INFLUENCIA_KM = float(os.environ.get("RAIO_INFLUENCIA_KM", 3.0))
INTERVALO_MINUTOS = int(os.environ.get("INTERVALO_MINUTOS", 10))
MOCK_SUPABASE = os.environ.get("MOCK_SUPABASE", "true").lower() in ("true", "1", "yes")


# ================= Funções de Suporte =================

def resolver_caminho(nome_arquivo):
    """Encontra os arquivos CSV tanto se executado de alert_service/ quanto da raiz do projeto."""
    candidatos = [
        os.path.join(os.path.dirname(__file__), "..", "documentacao", nome_arquivo),
        os.path.join("documentacao", nome_arquivo),
        os.path.join(os.path.dirname(__file__), nome_arquivo),
        nome_arquivo
    ]
    for c in candidatos:
        if os.path.exists(c):
            return os.path.abspath(c)
    raise FileNotFoundError(f"Arquivo '{nome_arquivo}' não encontrado em nenhum dos diretórios esperados.")


def haversine_km(lat1, lon1, lat2, lon2):
    """Calcula a distância geodésica em quilômetros entre duas coordenadas (WGS84)."""
    R = 6371.0  # Raio médio da Terra em km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def carregar_pluviometros(caminho_csv):
    """Carrega os pluviômetros do CEMADEN."""
    pluviometros = {}
    with open(caminho_csv, mode="r", encoding="utf-8") as f:
        leitor = csv.DictReader(f, delimiter=";")
        for linha in leitor:
            try:
                cod = linha["codEstacao"].strip()
                lat = float(linha["latitude"].replace(",", "."))
                lon = float(linha["longitude"].replace(",", "."))
                nome = linha.get("nomeEstacao", cod).strip()
                pluviometros[cod] = {
                    "codEstacao": cod,
                    "nome": nome,
                    "latitude": lat,
                    "longitude": lon
                }
            except (ValueError, KeyError):
                continue
    return pluviometros


def carregar_pontos_vulnerabilidade(caminho_csv):
    """Carrega os pontos com vulnerabilidade e precipitação máxima tolerada em mm."""
    pontos = []
    with open(caminho_csv, mode="r", encoding="utf-8") as f:
        leitor = csv.DictReader(f, delimiter=",")
        for linha in leitor:
            try:
                ponto = {
                    "id": linha.get("id"),
                    "bairro_regiao": linha.get("bairro_regiao", "").strip(),
                    "endereco": linha.get("endereco", "").strip(),
                    "latitude": float(linha["latitude"].replace(",", ".")),
                    "longitude": float(linha["longitude"].replace(",", ".")),
                    "vulnerabilidade": linha.get("vulnerabilidade", "").strip(),
                    "tolerancia_mm": float(linha["precipitacao_maxima_tolerada_mm"].replace(",", "."))
                }
                pontos.append(ponto)
            except (ValueError, KeyError):
                continue
    return pontos


def mapear_areas_influencia(pontos_vulneraveis, pluviometros, raio_km=RAIO_INFLUENCIA_KM):
    """Associa a cada endereço vulnerável os pluviômetros que estão dentro do seu raio de 3 km."""
    mapeamento = []
    for ponto in pontos_vulneraveis:
        estacoes_vizinhas = []
        for cod, pluv in pluviometros.items():
            dist = haversine_km(ponto["latitude"], ponto["longitude"], pluv["latitude"], pluv["longitude"])
            if dist <= raio_km:
                estacoes_vizinhas.append({
                    "codEstacao": cod,
                    "nome": pluv["nome"],
                    "distancia_km": round(dist, 2)
                })

        estacoes_vizinhas.sort(key=lambda x: x["distancia_km"])
        mapeamento.append({
            "ponto": ponto,
            "estacoes": estacoes_vizinhas
        })
    return mapeamento


# ================= Integração CEMADEN =================

def autenticar_cemaden(email, password, sgaa_url=DEFAULT_CEMADEN_SGAA_URL):
    """
    Solicita um novo token JWT ao SGAA do CEMADEN utilizando email e senha.
    Endpoint: POST /SGAA/rest/controle-token/tokens
    """
    import ssl
    if not email or not password:
        raise ValueError("Email ou senha do CEMADEN não informados.")

    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    req = urllib.request.Request(sgaa_url, data=payload, headers=headers, method="POST")

    def _executar(ctx):
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))

    try:
        ctx = ssl.create_default_context()
        corpo = _executar(ctx)
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            ctx_sem_verif = ssl._create_unverified_context()
            corpo = _executar(ctx_sem_verif)
        else:
            raise
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Erro HTTP {e.code} ao autenticar no CEMADEN SGAA: {msg}")

    token = corpo.get("token")
    tempo_exp = corpo.get("timeToExp", "N/A")
    if not token:
        msg_erro = corpo.get("Alerta") or corpo.get("mensagem") or corpo
        raise RuntimeError(f"Falha na autenticação do CEMADEN: {msg_erro}")

    print(f"🔑 [CEMADEN SGAA] Novo token JWT gerado com sucesso (válido por ~{tempo_exp} min).")
    return token


def consultar_cemaden_acumulados(cemaden_url, token, codibge=COD_IBGE_MUNICIPIO):
    """
    Chama a API de dados do CEMADEN para recuperar acumulados recentes de chuva para o município.
    Endpoint: /PED/rest/pcds-acum/acumulados-recentes?codibge=3547809
    """
    import ssl
    url = f"{cemaden_url.rstrip('/')}/pcds-acum/acumulados-recentes?codibge={codibge}"
    headers = {
        "Accept": "application/json",
        "token": token
    }

    req = urllib.request.Request(url, headers=headers, method="GET")

    # Tratamento de certificados para domínios governamentais (.gov.br) no Windows
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
            raise RuntimeError(f"Erro na API CEMADEN: HTTP {resp.status}")
    except urllib.error.HTTPError:
        raise
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            ctx_sem_verif = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=20, context=ctx_sem_verif) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
                raise RuntimeError(f"Erro na API CEMADEN: HTTP {resp.status}")
        raise


class CemadenSessao:
    """
    Gerenciador de sessão com a API do CEMADEN.
    Fornece renovação automática do JWT token via SGAA caso expire (HTTP 401).
    """

    def __init__(self, token=None, email=None, password=None, sgaa_url=None, ped_url=None):
        self.token = token.strip() if token else ""
        self.email = email.strip() if email else ""
        self.password = password.strip() if password else ""
        self.sgaa_url = sgaa_url or DEFAULT_CEMADEN_SGAA_URL
        self.ped_url = ped_url or DEFAULT_CEMADEN_URL

    def tem_credenciais(self):
        return bool(self.token or (self.email and self.password))

    def obter_token(self, forcar_renovacao=False):
        """Retorna o token ativo, renovando ou gerando novo se necessário."""
        if not self.token or forcar_renovacao:
            if self.email and self.password:
                self.token = autenticar_cemaden(self.email, self.password, self.sgaa_url)
            elif not self.token:
                return None
        return self.token

    def consultar_acumulados(self, codibge):
        """
        Consulta os dados pluviométricos. Se o token expirar (HTTP 401),
        renova automaticamente via credenciais de SGAA e repete a consulta.
        """
        token = self.obter_token()
        if not token:
            raise ValueError("Nenhum token disponível e sem credenciais de email/senha para autenticação.")

        try:
            return consultar_cemaden_acumulados(self.ped_url, token, codibge)
        except urllib.error.HTTPError as e:
            if e.code == 401 and self.email and self.password:
                print("⚠️ [CEMADEN] Token expirado ou rejeitado (HTTP 401). Renovando automaticamente via SGAA...")
                token = self.obter_token(forcar_renovacao=True)
                return consultar_cemaden_acumulados(self.ped_url, token, codibge)
            raise


# ================= Integração Supabase =================

def obter_zonas_ativas_supabase(supabase_url, supabase_key):
    """Recupera as zonas de risco atualmente cadastradas no Supabase."""
    url = f"{supabase_url.rstrip('/')}/rest/v1/zonas_risco?select=id,latitude,longitude,status"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Aviso ao consultar zonas existentes no Supabase: {e}")
        return []


def inserir_alerta_supabase(supabase_url, supabase_key, latitude, longitude, status="alerta", mock=False):
    """
    Insere um ponto crítico na tabela zonas_risco do Supabase.
    Payload: {"latitude": lat, "longitude": lng, "status": "alerta"}
    Se mock=True, simula a inserção sem falhar por falta de permissão de escrita.
    """
    if mock:
        print(f"   [MOCK SUPABASE] 📦 Simulação de INSERT na tabela public.zonas_risco:")
        print(f"                   -> latitude={latitude}, longitude={longitude}, status='{status}'")
        return [{"id": "mock-simulado", "latitude": latitude, "longitude": longitude, "status": status}]

    url = f"{supabase_url.rstrip('/')}/rest/v1/zonas_risco"
    payload = json.dumps({
        "latitude": latitude,
        "longitude": longitude,
        "status": status
    }).encode("utf-8")

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            corpo = resp.read().decode("utf-8")
            return json.loads(corpo) if corpo else True
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        if e.code == 401:
            print("❌ Erro 401 no Supabase: Permissão negada para INSERT na tabela zonas_risco.")
            print("   Dica 1: Defina MOCK_SUPABASE=true no seu .env para simular as inserções.")
            print("   Dica 2: Ou preencha SUPABASE_SERVICE_ROLE_KEY no .env com a service_role secret.")
            print("   Dica 3: Ou execute no SQL Editor do Supabase: GRANT INSERT, SELECT, DELETE ON public.zonas_risco TO anon;")
        else:
            print(f"❌ Erro HTTP {e.code} ao inserir no Supabase: {err_msg}")
        raise


# ================= Ciclo de Verificação =================

def executar_rodada(
    mapeamento,
    cemaden_sessao,
    supabase_url,
    supabase_key,
    codibge,
    modo_simulado=False,
    mock_supabase=False,
    total_pluviometros=20,
    modo_auth="",
    intervalo=10,
    raio_km=3.0,
    gerar_pdf=True,
    caminho_pdf=None
):
    timestamp_atual = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{timestamp_atual}] 🛰️ Iniciando verificação de precipitação...")

    # 1. Obter medições de chuva das estações
    medicoes_por_estacao = {}
    if modo_simulado or not cemaden_sessao.tem_credenciais():
        if not modo_simulado:
            print("ℹ️ Credenciais do CEMADEN não configuradas. Utilizando valores de chuva simulados.")
        import random
        for item in mapeamento:
            for est in item["estacoes"]:
                cod = est["codEstacao"]
                if cod not in medicoes_por_estacao:
                    medicoes_por_estacao[cod] = {
                        "codestacao": cod,
                        "acc1hr": round(random.uniform(5.0, 35.0), 1),
                        "acc24hr": round(random.uniform(15.0, 60.0), 1)
                    }
    else:
        try:
            dados_cemaden = cemaden_sessao.consultar_acumulados(codibge=codibge)
            for item in dados_cemaden:
                cod = item.get("codestacao")
                if cod:
                    medicoes_por_estacao[cod] = item
        except Exception as e:
            print(f"❌ Falha ao consultar API do CEMADEN: {e}")
            return

    # 2. Obter zonas ativas no Supabase para evitar duplicidade de inserts
    zonas_existentes = obter_zonas_ativas_supabase(supabase_url, supabase_key)
    coordenadas_ativas = {
        (round(float(z["latitude"]), 4), round(float(z["longitude"]), 4))
        for z in zonas_existentes
        if z.get("latitude") is not None and z.get("longitude") is not None
    }

    alertas_disparados = 0
    pontos_avaliados = []
    maior_chuva_geral_24h = 0.0
    maior_chuva_geral_1h = 0.0

    # 3. Avaliar cada ponto vulnerável
    for item in mapeamento:
        ponto = item["ponto"]
        estacoes = item["estacoes"]
        tol = ponto["tolerancia_mm"]

        if not estacoes:
            print(f"⚠️ {ponto['bairro_regiao']}: Nenhuma estação a menos de {raio_km} km.")
            continue

        maior_chuva_1h = 0.0
        maior_chuva_24h = 0.0
        estacao_mais_chuvosa = estacoes[0] if estacoes else None

        for est in estacoes:
            cod = est["codEstacao"]
            med = medicoes_por_estacao.get(cod, {})
            acc1 = float(med.get("acc1hr") or 0.0)
            acc24 = float(med.get("acc24hr") or 0.0)

            if acc1 > maior_chuva_1h or (acc1 == maior_chuva_1h and acc24 > maior_chuva_24h):
                maior_chuva_1h = acc1
                maior_chuva_24h = acc24
                estacao_mais_chuvosa = est
            elif acc24 > maior_chuva_24h:
                maior_chuva_24h = acc24

        maior_chuva_geral_1h = max(maior_chuva_geral_1h, maior_chuva_1h)
        maior_chuva_geral_24h = max(maior_chuva_geral_24h, maior_chuva_24h)

        chuva_relevante = max(maior_chuva_1h, maior_chuva_24h * 0.5)
        limiar_excedido = (chuva_relevante >= tol)

        nome_est_ref = estacao_mais_chuvosa["nome"] if estacao_mais_chuvosa else "N/A"
        dist_est_ref = estacao_mais_chuvosa.get("distancia_km", 0.0) if estacao_mais_chuvosa else 0.0

        print(f"📍 {ponto['bairro_regiao']} | Tol: {tol}mm | Chuva detectada: 1h={maior_chuva_1h}mm, 24h={maior_chuva_24h}mm ({nome_est_ref})")

        status_supabase_desc = "Normal ✅"
        if limiar_excedido:
            chave_coord = (round(ponto["latitude"], 4), round(ponto["longitude"], 4))
            if chave_coord in coordenadas_ativas:
                print(f"   ℹ️ Ponto já cadastrado como ativo no Supabase. Inserção ignorada.")
                status_supabase_desc = "Ativo no Supabase ℹ️"
            else:
                print(f"   🚨 LIMIAR EXCEDIDO ({chuva_relevante}mm >= {tol}mm)! Inserindo alerta...")
                try:
                    inserir_alerta_supabase(
                        supabase_url=supabase_url,
                        supabase_key=supabase_key,
                        latitude=ponto["latitude"],
                        longitude=ponto["longitude"],
                        status="alerta",
                        mock=mock_supabase
                    )
                    if mock_supabase:
                        print(f"   ✅ [MOCK] Alerta gerado com sucesso para {ponto['endereco']}!")
                    else:
                        print(f"   ✅ Alerta gravado no Supabase para {ponto['endereco']}!")
                    alertas_disparados += 1
                    coordenadas_ativas.add(chave_coord)
                    status_supabase_desc = "Alerta gravado 🚨"
                except Exception as e:
                    print(f"   ❌ Erro ao enviar alerta ao Supabase: {e}")
                    status_supabase_desc = "Erro no envio ❌"

        pontos_avaliados.append({
            "bairro_regiao": ponto["bairro_regiao"],
            "endereco": ponto["endereco"],
            "latitude": ponto["latitude"],
            "longitude": ponto["longitude"],
            "tolerancia_mm": tol,
            "chuva_1h": maior_chuva_1h,
            "chuva_24h": maior_chuva_24h,
            "chuva_relevante": chuva_relevante,
            "estacao_referencia": nome_est_ref,
            "distancia_km": dist_est_ref,
            "limiar_excedido": limiar_excedido,
            "status_supabase": status_supabase_desc,
            "estacoes_vizinhas": estacoes
        })

    print(f"🏁 Verificação concluída. Alertas emitidos nesta rodada: {alertas_disparados}")

    # 4. Geração do Relatório PDF com Emojis
    if gerar_pdf:
        try:
            from report_pdf import gerar_relatorio_pdf
            dados_relatorio = {
                "timestamp": timestamp_atual,
                "municipio": f"Santo André (IBGE: {codibge})",
                "intervalo": intervalo,
                "raio_km": raio_km,
                "modo_auth": modo_auth,
                "mock_supabase": mock_supabase,
                "total_pluviometros": total_pluviometros,
                "estacoes_ativas": len(medicoes_por_estacao),
                "pontos_avaliados": pontos_avaliados,
                "alertas_disparados": alertas_disparados,
                "maior_chuva_24h": maior_chuva_geral_24h,
                "maior_chuva_1h": maior_chuva_geral_1h,
            }
            pdf_salvo = gerar_relatorio_pdf(dados_relatorio, caminho_saida=caminho_pdf)
            print(f"📄 [PDF] Relatório gerado com sucesso: {pdf_salvo}")
        except Exception as e:
            print(f"⚠️ Erro ao gerar relatório PDF: {e}")


# ================= Função Principal =================

def main():
    parser = argparse.ArgumentParser(description="Serviço de Alertas de Alagamento (alert_service)")
    parser.add_argument("--intervalo", type=int, default=None, help="Intervalo em minutos entre consultas")
    parser.add_argument("--raio", type=float, default=None, help="Raio de influência em km (padrão: 3.0)")
    parser.add_argument("--env-file", type=str, default=None, help="Caminho para arquivo .env customizado")
    parser.add_argument("--once", action="store_true", help="Executa apenas uma rodada e finaliza")
    parser.add_argument("--simular", action="store_true", help="Simula medições de chuva para testes sem API")
    parser.add_argument("--mock-supabase", action="store_true", help="Força mock na inserção do Supabase")
    parser.add_argument("--cemaden-email", type=str, default=None, help="Email para login no CEMADEN SGAA")
    parser.add_argument("--cemaden-password", type=str, default=None, help="Senha para login no CEMADEN SGAA")
    parser.add_argument("--cemaden-token", type=str, default=None, help="Token JWT estático do CEMADEN")
    parser.add_argument("--pdf-path", type=str, default=None, help="Caminho do arquivo PDF gerado")
    parser.add_argument("--sem-pdf", action="store_true", help="Desabilita a geração do relatório em PDF")
    args = parser.parse_args()

    if args.env_file:
        carregar_env(args.env_file)

    intervalo = args.intervalo or int(os.environ.get("INTERVALO_MINUTOS", INTERVALO_MINUTOS))
    raio = args.raio or float(os.environ.get("RAIO_INFLUENCIA_KM", RAIO_INFLUENCIA_KM))
    mock_supabase = args.mock_supabase or (os.environ.get("MOCK_SUPABASE", "true").lower() in ("true", "1", "yes"))

    cemaden_email = args.cemaden_email or os.environ.get("CEMADEN_EMAIL", DEFAULT_CEMADEN_EMAIL)
    cemaden_password = args.cemaden_password or os.environ.get("CEMADEN_PASSWORD", DEFAULT_CEMADEN_PASSWORD)
    cemaden_token = args.cemaden_token or os.environ.get("CEMADEN_TOKEN", DEFAULT_CEMADEN_TOKEN)
    cemaden_sgaa_url = os.environ.get("CEMADEN_SGAA_URL", DEFAULT_CEMADEN_SGAA_URL)
    cemaden_url = os.environ.get("CEMADEN_URL", DEFAULT_CEMADEN_URL)

    codibge = os.environ.get("COD_IBGE_MUNICIPIO", COD_IBGE_MUNICIPIO)
    supabase_url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    supabase_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or
        os.environ.get("SUPABASE_KEY") or
        DEFAULT_SUPABASE_KEY
    )

    cemaden_sessao = CemadenSessao(
        token=cemaden_token,
        email=cemaden_email,
        password=cemaden_password,
        sgaa_url=cemaden_sgaa_url,
        ped_url=cemaden_url
    )

    modo_auth = "Simulação (sem credenciais)"
    if cemaden_email and cemaden_password:
        modo_auth = f"Automática via SGAA ({cemaden_email})"
    elif cemaden_token:
        modo_auth = "Token JWT estático pré-configurado"

    print("=" * 70)
    print("🌊 SERVIÇO DE ALERTAS DE ALAGAMENTO (ALERT_SERVICE)")
    print(f"⏱️ Intervalo: a cada {intervalo} minutos | 🎯 Raio de Influência: {raio} km")
    print(f"📍 Município IBGE: {codibge} (Santo André)")
    print(f"🔑 Autenticação CEMADEN: {modo_auth}")
    print(f"🗄️ Modo Supabase: {'MOCK ATIVO (simulação local de INSERT)' if mock_supabase else 'PRODUÇÃO (gravação real no Supabase)'}")
    print(f"📄 Relatório PDF: {'Habilitado (alert_service/relatorio_alertas.pdf)' if not args.sem_pdf else 'Desabilitado'}")
    print("=" * 70)

    # Carregar arquivos de dados
    caminho_pluv = resolver_caminho("pluviometros_santo_andre.csv")
    caminho_vuln = resolver_caminho("vulnerabilidade_alagamentos_santo_andre.csv")

    pluviometros = carregar_pluviometros(caminho_pluv)
    pontos_vuln = carregar_pontos_vulnerabilidade(caminho_vuln)
    mapeamento = mapear_areas_influencia(pontos_vuln, pluviometros, raio_km=raio)

    print(f"📦 Pluviômetros carregados: {len(pluviometros)}")
    print(f"📦 Pontos de vulnerabilidade: {len(pontos_vuln)}")
    print("-" * 70)
    print("🗺️ Mapeamento de Influência Espacial (raio <= 3 km):")
    for m in mapeamento:
        p = m["ponto"]
        nomes_est = [f"{e['nome']} ({e['distancia_km']}km)" for e in m["estacoes"]]
        print(f" • {p['bairro_regiao']} (tolera {p['tolerancia_mm']}mm) ➔ {len(m['estacoes'])} estações: {', '.join(nomes_est[:3])}")
    print("-" * 70)

    try:
        while True:
            executar_rodada(
                mapeamento=mapeamento,
                cemaden_sessao=cemaden_sessao,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
                codibge=codibge,
                modo_simulado=args.simular,
                mock_supabase=mock_supabase,
                total_pluviometros=len(pluviometros),
                modo_auth=modo_auth,
                intervalo=intervalo,
                raio_km=raio,
                gerar_pdf=not args.sem_pdf,
                caminho_pdf=args.pdf_path
            )
            if args.once:
                print("\nFlag --once informada. Encerrando execução.")
                break
            print(f"\n⏳ Próxima consulta em {intervalo} minutos... Pressione Ctrl+C para parar.")
            time.sleep(intervalo * 60)
    except KeyboardInterrupt:
        print("\n\n🛑 Serviço encerrado pelo usuário.")


if __name__ == "__main__":
    main()
