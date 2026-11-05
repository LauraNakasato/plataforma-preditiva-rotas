"""
Script de Monitoramento e Alerta de Alagamentos - Santo André / SP
------------------------------------------------------------------
1. Carrega as estações pluviométricas do CEMADEN em Santo André (pluviometros_santo_andre.csv).
2. Carrega os pontos críticos com suas tolerâncias (vulnerabilidade_alagamentos_santo_andre.csv).
3. Calcula a área de influência espacial (raio de 3 km) entre pluviômetros e pontos vulneráveis.
4. Consulta a cada 10 minutos a API oficial do CEMADEN (/pcds-acum/acumulados-recentes).
5. Se o volume de chuva exceder a tolerância máxima do endereço, insere alerta no Supabase (tabela zonas_risco).
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

# Garante saída UTF-8 no Windows/PowerShell
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ================= Configurações Padrão =================
DEFAULT_CEMADEN_URL = "https://sws.cemaden.gov.br/PED/rest"
DEFAULT_SUPABASE_URL = "https://dzhfqsftxdkauwgrxgdf.supabase.co"
# Chave pública padrão (para inserção em produção recomenda-se SUPABASE_SERVICE_ROLE_KEY)
DEFAULT_SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or "sb_publishable_ZBEoCCMdz62UE_6HQEGQPg_93RWIrvR"

COD_IBGE_SANTO_ANDRE = "3547809"
RAIO_INFLUENCIA_KM = 3.0
INTERVALO_MINUTOS = 10

# ================= Funções Auxiliares =================

def resolver_caminho(nome_arquivo):
    """Encontra o arquivo tanto se executado da raiz do projeto quanto da pasta scraper/"""
    candidatos = [
        os.path.join(os.path.dirname(__file__), "..", "documentacao", nome_arquivo),
        os.path.join("documentacao", nome_arquivo),
        nome_arquivo
    ]
    for c in candidatos:
        if os.path.exists(c):
            return os.path.abspath(c)
    raise FileNotFoundError(f"Arquivo '{nome_arquivo}' não encontrado em nenhum dos locais esperados.")


def haversine_km(lat1, lon1, lat2, lon2):
    """Calcula a distância em quilômetros entre duas coordenadas WGS84."""
    R = 6371.0  # Raio médio da Terra em km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def carregar_pluviometros(caminho_csv):
    """Lê o arquivo de pluviômetros do CEMADEN em Santo André."""
    pluviometros = {}
    with open(caminho_csv, mode="r", encoding="utf-8") as f:
        # Detecta separador (esperado ponto e vírgula ';')
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
            except (ValueError, KeyError) as e:
                continue
    return pluviometros


def carregar_pontos_vulnerabilidade(caminho_csv):
    """Lê o arquivo de pontos com vulnerabilidade e precipitação máxima tolerada."""
    pontos = []
    with open(caminho_csv, mode="r", encoding="utf-8") as f:
        leitor = csv.DictReader(f, delimiter=",")
        for linha in leitor:
            try:
                ponto = {
                    "id": linha.get("id"),
                    "bairro_regiao": linha.get("bairro_regiao", "").strip(),
                    "endereco": linha.get("endereco", "").strip(),
                    "latitude": float(linha["latitude"]),
                    "longitude": float(linha["longitude"]),
                    "vulnerabilidade": linha.get("vulnerabilidade", "").strip(),
                    "tolerancia_mm": float(linha["precipitacao_maxima_tolerada_mm"])
                }
                pontos.append(ponto)
            except (ValueError, KeyError) as e:
                continue
    return pontos


def mapear_areas_influencia(pontos_vulneraveis, pluviometros, raio_km=RAIO_INFLUENCIA_KM):
    """
    Associa a cada ponto vulnerável todos os pluviômetros que estão dentro do seu raio de influência.
    """
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

        # Ordena as estações pela mais próxima
        estacoes_vizinhas.sort(key=lambda x: x["distancia_km"])
        mapeamento.append({
            "ponto": ponto,
            "estacoes": estacoes_vizinhas
        })
    return mapeamento


# ================= Integração CEMADEN =================

def consultar_cemaden_acumulados(cemaden_url, token, codibge=COD_IBGE_SANTO_ANDRE):
    """
    Chama a API do CEMADEN para recuperar acumulados recentes de chuva para Santo André.
    Endpoint: /PED/rest/pcds-acum/acumulados-recentes?codibge=3547809
    """
    url = f"{cemaden_url.rstrip('/')}/pcds-acum/acumulados-recentes?codibge={codibge}"
    headers = {
        "Accept": "application/json",
        "token": token
    }

    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as resp:
        if resp.status == 200:
            return json.loads(resp.read().decode("utf-8"))
        raise RuntimeError(f"Erro na API CEMADEN: HTTP {resp.status}")


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


def inserir_alerta_supabase(supabase_url, supabase_key, latitude, longitude, status="alerta"):
    """
    Insere um ponto em zonas_risco no Supabase conforme o esquema documentado no README.
    Payload: {"latitude": lat, "longitude": lng, "status": "alerta"}
    """
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
            print(f"❌ Erro 401 no Supabase: permissão negada para INSERT.")
            print(f"   Dica: No Supabase SQL Editor execute: GRANT INSERT, SELECT, DELETE ON public.zonas_risco TO anon;")
            print(f"   Ou defina a variável de ambiente SUPABASE_SERVICE_ROLE_KEY com a service_role do projeto.")
        else:
            print(f"❌ Erro HTTP {e.code} ao inserir no Supabase: {err_msg}")
        raise


# ================= Ciclo de Monitoramento =================

def executar_rodada(mapeamento, cemaden_url, cemaden_token, supabase_url, supabase_key, modo_simulado=False):
    timestamp_atual = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{timestamp_atual}] 🛰️ Iniciando verificação de precipitação...")

    # 1. Obter medições de chuva das estações
    medicoes_por_estacao = {}
    if modo_simulado or not cemaden_token:
        if not cemaden_token and not modo_simulado:
            print("⚠️ Token do CEMADEN não configurado! Executando em MODO SIMULADO para demonstração.")
        # Gera valores simulados realistas para teste
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
            dados_cemaden = consultar_cemaden_acumulados(cemaden_url, cemaden_token)
            for item in dados_cemaden:
                cod = item.get("codestacao")
                if cod:
                    medicoes_por_estacao[cod] = item
        except Exception as e:
            print(f"❌ Falha ao consultar API do CEMADEN: {e}")
            return

    # 2. Obter zonas já cadastradas no Supabase para evitar duplicatas em curto prazo
    zonas_existentes = obter_zonas_ativas_supabase(supabase_url, supabase_key)
    coordenadas_ativas = {
        (round(float(z["latitude"]), 4), round(float(z["longitude"]), 4))
        for z in zonas_existentes
        if z.get("latitude") is not None and z.get("longitude") is not None
    }

    alertas_disparados = 0

    # 3. Avaliar cada ponto vulnerável
    for item in mapeamento:
        ponto = item["ponto"]
        estacoes = item["estacoes"]
        tol = ponto["tolerancia_mm"]

        if not estacoes:
            print(f"⚠️ {ponto['bairro_regiao']}: Nenhuma estação a menos de {RAIO_INFLUENCIA_KM}km.")
            continue

        maior_chuva_1h = 0.0
        maior_chuva_24h = 0.0
        estacao_mais_chuvosa = None

        for est in estacoes:
            cod = est["codEstacao"]
            med = medicoes_por_estacao.get(cod, {})
            # Considera acumulado de 1h (pico de enxurrada) ou 24h
            acc1 = float(med.get("acc1hr") or 0.0)
            acc24 = float(med.get("acc24hr") or 0.0)

            if acc1 > maior_chuva_1h:
                maior_chuva_1h = acc1
                maior_chuva_24h = acc24
                estacao_mais_chuvosa = est

        # Regra de decisão: se o acumulado de 1h (ou equivalente ponderado) exceder a tolerância
        chuva_relevante = max(maior_chuva_1h, maior_chuva_24h * 0.5)

        print(f"📍 {ponto['bairro_regiao']} | Tol: {tol}mm | Chuva máx detectada: 1h={maior_chuva_1h}mm, 24h={maior_chuva_24h}mm ({estacao_mais_chuvosa['nome'] if estacao_mais_chuvosa else 'N/A'})")

        if chuva_relevante >= tol:
            chave_coord = (round(ponto["latitude"], 4), round(ponto["longitude"], 4))
            if chave_coord in coordenadas_ativas:
                print(f"   ℹ️ Ponto já está cadastrado como ativo no Supabase. Ignorando inserção repetida.")
                continue

            print(f"   🚨 LIMIAR EXCEDIDO ({chuva_relevante}mm >= {tol}mm)! Inserindo alerta no Supabase...")
            try:
                inserir_alerta_supabase(
                    supabase_url=supabase_url,
                    supabase_key=supabase_key,
                    latitude=ponto["latitude"],
                    longitude=ponto["longitude"],
                    status="alerta"
                )
                print(f"   ✅ Alerta registrado com sucesso para {ponto['endereco']}!")
                alertas_disparados += 1
                coordenadas_ativas.add(chave_coord)
            except Exception as e:
                print(f"   ❌ Erro ao enviar alerta ao Supabase: {e}")

    print(f"🏁 Verificação concluída. Alertas emitidos nesta rodada: {alertas_disparados}")


# ================= Função Principal =================

def main():
    parser = argparse.ArgumentParser(description="Monitor de Alagamentos e Alertas CEMADEN -> Supabase (Santo André)")
    parser.add_argument("--intervalo", type=int, default=INTERVALO_MINUTOS, help="Intervalo em minutos entre consultas (padrão: 10)")
    parser.add_argument("--raio", type=float, default=RAIO_INFLUENCIA_KM, help="Raio de influência em km (padrão: 3.0)")
    parser.add_argument("--once", action="store_true", help="Executa apenas uma vez e sai")
    parser.add_argument("--simular", action="store_true", help="Simula valores de chuva para testar sem precisar da API do CEMADEN")
    args = parser.parse_args()

    print("=" * 70)
    print("🌊 INICIANDO SISTEMA DE ALERTA DE ALAGAMENTO (SANTO ANDRÉ)")
    print(f"⏱️ Intervalo: a cada {args.intervalo} minutos | 🎯 Raio de Influência: {args.raio} km")
    print("=" * 70)

    # Carregar arquivos de dados
    caminho_pluv = resolver_caminho("pluviometros_santo_andre.csv")
    caminho_vuln = resolver_caminho("vulnerabilidade_alagamentos_santo_andre.csv")

    pluviometros = carregar_pluviometros(caminho_pluv)
    pontos_vuln = carregar_pontos_vulnerabilidade(caminho_vuln)
    mapeamento = mapear_areas_influencia(pontos_vuln, pluviometros, raio_km=args.raio)

    print(f"📦 Pluviômetros carregados: {len(pluviometros)}")
    print(f"📦 Pontos de vulnerabilidade: {len(pontos_vuln)}")
    print("-" * 70)
    print("🗺️ Mapeamento de Influência (raio <= 3km):")
    for m in mapeamento:
        p = m["ponto"]
        nomes_est = [f"{e['nome']} ({e['distancia_km']}km)" for e in m["estacoes"]]
        print(f" • {p['bairro_regiao']} (tolera {p['tolerancia_mm']}mm) ➔ {len(m['estacoes'])} estações: {', '.join(nomes_est[:3])}")
    print("-" * 70)

    cemaden_url = os.environ.get("CEMADEN_URL", DEFAULT_CEMADEN_URL)
    cemaden_token = os.environ.get("CEMADEN_TOKEN", "")
    supabase_url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", DEFAULT_SUPABASE_KEY)

    try:
        while True:
            executar_rodada(
                mapeamento=mapeamento,
                cemaden_url=cemaden_url,
                cemaden_token=cemaden_token,
                supabase_url=supabase_url,
                supabase_key=supabase_key,
                modo_simulado=args.simular
            )
            if args.once:
                print("\nFlag --once informada. Encerrando execução.")
                break
            print(f"\n⏳ Próxima consulta em {args.intervalo} minutos... Pressione Ctrl+C para parar.")
            time.sleep(args.intervalo * 60)
    except KeyboardInterrupt:
        print("\n\n🛑 Monitoramento encerrado pelo usuário.")


if __name__ == "__main__":
    main()
