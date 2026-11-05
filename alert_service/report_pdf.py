"""
Módulo de Geração de Relatórios em PDF (report_pdf)
Plataforma Preditiva de Rotas — Alertas de Alagamento
------------------------------------------------------------------
Gera um relatório profissional em formato PDF com métricas,
tabelas de vulnerabilidade, acumulados de chuva do CEMADEN e emojis.
"""

import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def obter_fonte_compativel():
    """
    Registra e retorna a melhor fonte disponível com suporte a Unicode e Emojis.
    No Windows, prioriza Segoe UI Emoji ou Segoe UI.
    """
    candidatos = [
        ("SegoeUIEmoji", "C:/Windows/Fonts/seguiemj.ttf"),
        ("SegoeUI", "C:/Windows/Fonts/segoeui.ttf"),
        ("Arial", "C:/Windows/Fonts/arial.ttf"),
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for nome, caminho in candidatos:
        if os.path.exists(caminho):
            try:
                pdfmetrics.registerFont(TTFont(nome, caminho))
                return nome
            except Exception:
                continue
    return "Helvetica"


def gerar_relatorio_pdf(resultado_rodada, caminho_saida=None):
    """
    Gera um relatório PDF a partir dos dados de uma rodada de verificação.
    
    :param resultado_rodada: Dicionário contendo todos os dados e medições da rodada.
    :param caminho_saida: Caminho do arquivo PDF. Se omitido, salva em alert_service/relatorio_alertas.pdf
    :return: Caminho absoluto do arquivo PDF gerado.
    """
    if not caminho_saida:
        diretorio_atual = os.path.dirname(os.path.abspath(__file__))
        caminho_saida = os.path.join(diretorio_atual, "relatorio_alertas.pdf")

    # Garante que o diretório de destino exista
    os.makedirs(os.path.dirname(os.path.abspath(caminho_saida)), exist_ok=True)

    font_family = obter_fonte_compativel()

    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm
    )

    styles = getSampleStyleSheet()

    # Estilos customizados
    title_style = ParagraphStyle(
        "PDFTitle",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#FFFFFF"),
        alignment=1
    )

    subtitle_style = ParagraphStyle(
        "PDFSubtitle",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#94A3B8"),
        alignment=1
    )

    meta_style = ParagraphStyle(
        "PDFMeta",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155")
    )

    section_style = ParagraphStyle(
        "PDFSection",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#0F172A")
    )

    col_header_style = ParagraphStyle(
        "PDFColHeader",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#FFFFFF"),
        alignment=1
    )

    cell_style = ParagraphStyle(
        "PDFCell",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#1E293B")
    )

    cell_bold_style = ParagraphStyle(
        "PDFCellBold",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0F172A")
    )

    status_ok_style = ParagraphStyle(
        "PDFStatusOk",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#166534"),
        alignment=1
    )

    status_alerta_style = ParagraphStyle(
        "PDFStatusAlerta",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#991B1B"),
        alignment=1
    )

    footer_style = ParagraphStyle(
        "PDFFooter",
        parent=styles["Normal"],
        fontName=font_family,
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#64748B"),
        alignment=1
    )

    story = []

    # 1. Cabeçalho Principal (Banner)
    banner_data = [
        [Paragraph("🌊 PLATAFORMA PREDITIVA DE ROTAS — ALERTA DE ALAGAMENTO", title_style)],
        [Paragraph("Sistema Autônomo de Monitoramento Pluviométrico e Prevenção de Desastres", subtitle_style)]
    ]
    banner_table = Table(banner_data, colWidths=[182 * mm])
    banner_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F172A")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 6))

    # 2. Barra de Metadados
    timestamp = resultado_rodada.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    municipio = resultado_rodada.get("municipio", "Santo André (IBGE: 3547809)")
    intervalo = resultado_rodada.get("intervalo", 10)
    raio_km = resultado_rodada.get("raio_km", 3.0)
    modo_auth = resultado_rodada.get("modo_auth", "CEMADEN SGAA")
    mock_supabase = resultado_rodada.get("mock_supabase", True)
    modo_sub = "MOCK ATIVO (Simulação local)" if mock_supabase else "PRODUÇÃO (Gravado no Supabase)"

    meta_data = [
        [
            Paragraph(f"📅 <b>Data/Hora:</b> {timestamp}", meta_style),
            Paragraph(f"📍 <b>Município:</b> {municipio}", meta_style),
        ],
        [
            Paragraph(f"⏱️ <b>Ciclo:</b> A cada {intervalo} min | 🎯 <b>Raio:</b> {raio_km} km", meta_style),
            Paragraph(f"🔑 <b>CEMADEN:</b> {modo_auth}", meta_style),
        ],
        [
            Paragraph(f"🗄️ <b>Banco Supabase:</b> {modo_sub}", meta_style),
            Paragraph(f"🛰️ <b>Estações com Telemetria:</b> {resultado_rodada.get('estacoes_ativas', 0)} ativas", meta_style),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[91 * mm, 91 * mm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # 3. Cards de Resumo (KPIs)
    total_pontos = len(resultado_rodada.get("pontos_avaliados", []))
    total_pluviometros = resultado_rodada.get("total_pluviometros", 0)
    maior_chuva_24h = resultado_rodada.get("maior_chuva_24h", 0.0)
    alertas_disparados = resultado_rodada.get("alertas_disparados", 0)

    cor_alerta = "#DC2626" if alertas_disparados > 0 else "#16A34A"
    texto_alerta = f"{alertas_disparados} 🚨" if alertas_disparados > 0 else "0 ✅"

    kpi_data = [
        [
            Paragraph(f"<para align=center><b>{total_pontos}</b><br/><font size=6 color=#64748B>PONTOS VULNERÁVEIS</font></para>", meta_style),
            Paragraph(f"<para align=center><b>{total_pluviometros}</b><br/><font size=6 color=#64748B>PLUVIÔMETROS CADASTRADOS</font></para>", meta_style),
            Paragraph(f"<para align=center><b>{maior_chuva_24h:.1f} mm</b><br/><font size=6 color=#64748B>MAIOR ACUMULADO 24H</font></para>", meta_style),
            Paragraph(f"<para align=center><b><font color={cor_alerta}>{texto_alerta}</font></b><br/><font size=6 color=#64748B>ALERTAS DISPARADOS</font></para>", meta_style),
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[45.5 * mm, 45.5 * mm, 45.5 * mm, 45.5 * mm])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    # 4. Tabela de Análise de Risco dos Pontos Críticos
    story.append(Paragraph("📊 <b>Status dos Pontos Críticos de Alagamento</b>", section_style))
    story.append(Spacer(1, 4))

    table_rows = [
        [
            Paragraph("<b>Bairro / Endereço Crítico</b>", col_header_style),
            Paragraph("<b>Tolerância</b>", col_header_style),
            Paragraph("<b>Chuva 1h / 24h</b>", col_header_style),
            Paragraph("<b>Estação de Referência</b>", col_header_style),
            Paragraph("<b>Status da Rota</b>", col_header_style),
        ]
    ]

    for p in resultado_rodada.get("pontos_avaliados", []):
        bairro = p.get("bairro_regiao", "")
        endereco = p.get("endereco", "")
        tol = p.get("tolerancia_mm", 0.0)
        c1h = p.get("chuva_1h", 0.0)
        c24h = p.get("chuva_24h", 0.0)
        est = p.get("estacao_referencia", "N/A")
        dist = p.get("distancia_km", 0.0)
        excedido = p.get("limiar_excedido", False)

        if excedido:
            status_html = "<b>ALERTA 🚨</b>"
            status_style_p = status_alerta_style
        else:
            status_html = "<b>Normal ✅</b>"
            status_style_p = status_ok_style

        desc_ponto = f"<b>{bairro}</b><br/><font size=6.5 color=#64748B>{endereco}</font>"
        desc_estacao = f"{est}<br/><font size=6.5 color=#64748B>Distância: {dist:.2f} km</font>"

        table_rows.append([
            Paragraph(desc_ponto, cell_style),
            Paragraph(f"<para align=center><b>{tol:.1f} mm</b></para>", cell_style),
            Paragraph(f"<para align=center>1h: {c1h:.1f} mm<br/>24h: {c24h:.1f} mm</para>", cell_style),
            Paragraph(desc_estacao, cell_style),
            Paragraph(status_html, status_style_p)
        ])

    tabela_pontos = Table(table_rows, colWidths=[58 * mm, 20 * mm, 32 * mm, 46 * mm, 26 * mm])
    tabela_pontos.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tabela_pontos)
    story.append(Spacer(1, 10))

    # 5. Mapeamento de Influência Espacial (Raio de 3.0 km)
    story.append(Paragraph("🗺️ <b>Cobertura Espacial por Ponto (Raio de 3.0 km)</b>", section_style))
    story.append(Spacer(1, 4))

    map_rows = [
        [
            Paragraph("<b>Ponto Vulnerável</b>", col_header_style),
            Paragraph("<b>Estações do CEMADEN na Área de Influência</b>", col_header_style)
        ]
    ]

    for p in resultado_rodada.get("pontos_avaliados", []):
        bairro = p.get("bairro_regiao", "")
        vizinhas = p.get("estacoes_vizinhas", [])
        if vizinhas:
            nomes_viz = [f"{v['nome']} ({v['distancia_km']}km)" for v in vizinhas]
            texto_viz = ", ".join(nomes_viz)
        else:
            texto_viz = "<i>Nenhuma estação encontrada a menos de 3.0 km</i>"

        map_rows.append([
            Paragraph(f"📍 <b>{bairro}</b>", cell_bold_style),
            Paragraph(texto_viz, cell_style)
        ])

    tabela_map = Table(map_rows, colWidths=[58 * mm, 124 * mm])
    tabela_map.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
        ("PADDING", (0, 0), (-1, -1), 3.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tabela_map)
    story.append(Spacer(1, 10))

    # 6. Rodapé Informativo
    footer_text = (
        "ℹ️ <i>Relatório gerado automaticamente pelo serviço <b>alert_service</b>. "
        "Integração contínua entre CEMADEN (Gov.br) e banco de dados Supabase (tabela zonas_risco).</i>"
    )
    story.append(Paragraph(footer_text, footer_style))

    # Constrói o PDF
    doc.build(story)
    return os.path.abspath(caminho_saida)

