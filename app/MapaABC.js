"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import { supabase } from './supabase';

// ───────────────────────── Constantes ─────────────────────────
const CENTRO_ABC = { lat: -23.6552, lng: -46.5276 };
const BBOX_ABC = '-46.75,-23.95,-46.30,-23.50'; // minLon,minLat,maxLon,maxLat
const PHOTON_URL = 'https://photon.komoot.io/api/';
const RAIO_RISCO_M = 150;
const OFFSET_FUGA = 0.003;
const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;
const MAX_ALTERNATIVAS = 2;     // pedido ao OSRM → até 3 rotas no total (principal + 2)
const MAX_ROTAS = 3;
const RAIO_CHEGADA_M = 30;
const LIMITE_FORA_ROTA_M = 60;

// ── GPS: snap-to-route e filtro de sensibilidade ──
const LIMITE_SNAP_M = 35;           // distância máxima da rota para "colar" o marcador na linha
const LIMIAR_DESLOCAMENTO_M = 3;    // abaixo disso a posição é ruído e não atualiza mapa/marcador
const LIMIAR_ANGULO_GRAUS = 10;     // variação mínima para girar o ícone

// ── Câmera imersiva (perspectiva simulada via CSS) ──
const PERSPECTIVA_PX = 1000;              // perspective(1000px)
const INCLINACAO_GRAUS = 55;              // rotateX(55deg)
const MARCADOR_ALTURA_TELA = 0.75;        // onde o marcador aparece na visão 3D (0 = topo, 1 = base)
const ROTACIONAR_MAPA_NA_VISAO_3D = true; // true: "heading-up"
const ZOOM_NAVEGACAO = 17;                // zoom mínimo no 1º fix da visão superior
const ZOOM_IMERSIVO = 18;                 // zoom mínimo na visão imersiva
const DURACAO_TRANSICAO_MS = 800;

// ── Paleta: azul marinho + azul claro ──
const COR_MARINHO = '#0b2545';
const COR_MARINHO_2 = '#134074';
const COR_AZUL = '#3d8bd9';
const COR_AZUL_CLARO = '#8fc3f5';

// Interruptor da integração GTFS (veja [GTFS-1] e [GTFS-2]).
const TRANSPORTE_PUBLICO_REAL = false;

// Cada modo aponta para uma instância OSRM com o perfil correspondente
// (o servidor router.project-osrm.org responde sempre como carro).
const MODOS = {
    driving: {
        rotulo: 'Carro', icone: 'car',
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',
        estilo: { color: COR_MARINHO_2, weight: 6, opacity: 0.95 }
    },
    foot: {
        rotulo: 'A pé', icone: 'walk',
        servico: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        estilo: { color: '#16a34a', weight: 6, opacity: 0.95, dashArray: '1, 12', lineCap: 'round' }
    },
    bike: {
        rotulo: 'Bicicleta', icone: 'bike',
        servico: 'https://routing.openstreetmap.de/routed-bike/route/v1',
        estilo: { color: '#ea580c', weight: 6, opacity: 0.95 }
    },
    transit: {
        rotulo: 'Transporte público', icone: 'bus',
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',
        estilo: { color: '#7c3aed', weight: 6, opacity: 0.35 },
        aviso:
            'Rota mista simulada: os trechos são estimados a partir do traçado viário. Linhas, horários e baldeações reais exigem uma API GTFS.'
    }
};

const ESTILOS_TRECHO = {
    caminhada: { color: '#16a34a', weight: 6, opacity: 0.95, dashArray: '1, 12', lineCap: 'round' },
    onibus: { color: '#7c3aed', weight: 7, opacity: 0.95 },
    trem: { color: COR_AZUL, weight: 7, opacity: 0.95 }
};
const CORES_TRECHO = { caminhada: '#16a34a', onibus: '#7c3aed', trem: COR_AZUL, chegada: '#dc2626' };

// ───────────────────────── Ícones (SVG inline) ─────────────────────────
const ICONES = {
    car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
    bike: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zM10.8 10.5l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.5l-2.2-2zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z',
    bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
    train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    arrow: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
    swap: 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z',
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    navigation: 'M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z',
    locate: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
    list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
    compass: 'M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z'
};

function Icone({ nome, size = 20, rotacao = 0 }) {
    return (
        <svg
            viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"
            style={rotacao ? { transform: `rotate(${rotacao}deg)` } : undefined}
        >
            <path d={ICONES[nome]} />
        </svg>
    );
}

// ───────────────────────── Utilitários geométricos ─────────────────────────

// Projeta o ponto p no segmento a→b (plano local). Retorna a distância (m) e a fração t ∈ [0,1].
function projetarNoSegmento(p, a, b) {
    const kLat = 111320;
    const kLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
    const ax = (a.lng - p.lng) * kLng;
    const ay = (a.lat - p.lat) * kLat;
    const bx = (b.lng - p.lng) * kLng;
    const by = (b.lat - p.lat) * kLat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { distanciaM: Math.hypot(ax + t * dx, ay + t * dy), t };
}

function distanciaPontoSegmentoM(p, a, b) {
    return projetarNoSegmento(p, a, b).distanciaM;
}

// Primeira zona de risco atravessada pela rota (ou null). Independe do modo de transporte.
// Hoje cada zona é um círculo (lat/lng + 150 m). Se migrar para polígonos reais,
// esta é a ÚNICA função a trocar (ponto-em-polígono / interseção de segmentos).
function encontrarColisao(coordenadas, zonas) {
    if (!coordenadas?.length) return null;
    for (const zona of zonas) {
        const centro = { lat: zona.lat, lng: zona.lng };
        if (coordenadas.length === 1) {
            if (distanciaPontoSegmentoM(centro, coordenadas[0], coordenadas[0]) <= RAIO_RISCO_M) return zona;
            continue;
        }
        for (let i = 0; i < coordenadas.length - 1; i++) {
            if (distanciaPontoSegmentoM(centro, coordenadas[i], coordenadas[i + 1]) <= RAIO_RISCO_M) return zona;
        }
    }
    return null;
}

function acumularDistancias(coords) {
    const acum = [0];
    for (let i = 1; i < coords.length; i++) acum.push(acum[i - 1] + coords[i - 1].distanceTo(coords[i]));
    return acum;
}

function indiceNaDistancia(acum, d) {
    let lo = 0;
    let hi = acum.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (acum[mid] < d) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function fatiarCoordenadas(coords, acum, d0, d1) {
    return coords.slice(indiceNaDistancia(acum, d0), indiceNaDistancia(acum, d1) + 1);
}

// Rumo (0–360°, 0 = norte) do ponto a para o ponto b
function calcularRumo(a, b) {
    const rad = (g) => (g * Math.PI) / 180;
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x =
        Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
        Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Diferença angular absoluta (0–180°), tolerante a ângulos "desenrolados" (>360)
function difAngular(a, b) {
    return Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
}

// Decodifica polylines codificadas (OTP e Google usam precisão 5).
function decodificarPolyline(str, precisao = 5) {
    const fator = 10 ** precisao;
    const out = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < str.length) {
        let b;
        let shift = 0;
        let result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += result & 1 ? ~(result >> 1) : result >> 1;
        shift = 0;
        result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += result & 1 ? ~(result >> 1) : result >> 1;
        out.push(L.latLng(lat / fator, lng / fator));
    }
    return out;
}

// ── SNAP-TO-ROUTE ──
// Acha o segmento da rota mais próximo da coordenada crua e devolve o ponto projetado sobre a linha.
// Usa uma janela em torno do último segmento (progresso monotônico): evita "pular" para outro trecho
// quando a rota passa duas vezes pelo mesmo lugar. Se perder a rota na janela, busca na rota toda.
function projetarNaRota(coords, lat, lng, indiceHint) {
    const n = coords.length;
    if (n < 2) return null;

    const p = { lat, lng };
    const buscar = (ini, fim) => {
        let melhor = Infinity;
        let idx = ini;
        let t = 0;
        for (let i = ini; i < fim; i++) {
            const r = projetarNoSegmento(p, coords[i], coords[i + 1]);
            if (r.distanciaM < melhor) { melhor = r.distanciaM; idx = i; t = r.t; }
        }
        return { melhor, idx, t };
    };

    let r = null;
    if (indiceHint != null) {
        r = buscar(Math.max(0, indiceHint - 10), Math.min(n - 1, indiceHint + 300));
        if (r.melhor > LIMITE_FORA_ROTA_M) r = null;
    }
    if (!r) r = buscar(0, n - 1);

    const a = coords[r.idx];
    const b = coords[r.idx + 1];
    return {
        idx: r.idx,
        t: r.t,
        ponto: L.latLng(a.lat + (b.lat - a.lat) * r.t, a.lng + (b.lng - a.lng) * r.t),
        desvioM: r.melhor,
        rumoSegmento: calcularRumo(a, b)
    };
}

// Progresso na rota a partir da projeção (já colada ou não)
function calcularProgresso(rota, proj, precisao = 0) {
    if (!rota || !proj || !rota.passos.length) return null;

    const percorrido = rota.acumulada[proj.idx] + rota.coordenadas[proj.idx].distanceTo(proj.ponto);
    const restanteM = Math.max(0, rota.total - percorrido);
    const restanteS = rota.total ? rota.tempo * (restanteM / rota.total) : 0;

    let idxProximo = rota.passos.findIndex((s) => s.indiceCoord > proj.idx);
    if (idxProximo === -1) idxProximo = rota.passos.length - 1;
    const alvo = rota.passos[idxProximo];
    const distProximo = Math.max(
        0,
        rota.acumulada[Math.min(alvo.indiceCoord, rota.acumulada.length - 1)] - percorrido
    );

    return {
        idxProximo, distProximo, restanteM, restanteS,
        desvioM: proj.desvioM,
        foraDaRota: proj.desvioM > Math.max(LIMITE_FORA_ROTA_M, precisao * 1.5)
    };
}

// ───────────────────────── Câmera imersiva: matemática ─────────────────────────

// Tamanho (px) que o container do mapa precisa ter para preencher a cena depois do tilt.
function dimensoesCena3D(largura, altura, comRotacao) {
    const sen = Math.sin((INCLINACAO_GRAUS * Math.PI) / 180);
    const yLonge = Math.min(900, Math.max(600, altura * 0.95));
    const meiaLarguraLonge = (largura / 2) * (1 + (yLonge * sen) / PERSPECTIVA_PX);

    if (!comRotacao) {
        return { w: Math.ceil(meiaLarguraLonge * 2), h: Math.ceil(yLonge * 2) };
    }
    // Limite 1150: acima disso, pontos do plano passam do "olho" da perspectiva (z ≥ 1000px)
    const raio = Math.min(1150, Math.ceil(Math.hypot(meiaLarguraLonge, yLonge)));
    return { w: raio * 2, h: raio * 2 };
}

// Deslocamento (px) do centro do mapa em relação ao marcador para que ele apareça em
// MARCADOR_ALTURA_TELA da altura da tela (inverte a projeção em perspectiva).
function offsetCameraPx(alturaCena) {
    const P = PERSPECTIVA_PX;
    const th = (INCLINACAO_GRAUS * Math.PI) / 180;
    const yTela = (MARCADOR_ALTURA_TELA - 0.5) * alturaCena;
    return (yTela * P) / (P * Math.cos(th) + yTela * Math.sin(th));
}

// ───────────────────────── Instruções em português ─────────────────────────
// O texto vem de um gerador próprio em PT-BR: não depende de a localização do LRM existir/estar completa.

const DIRECOES_PT = { N: 'norte', NE: 'nordeste', E: 'leste', SE: 'sudeste', S: 'sul', SW: 'sudoeste', W: 'oeste', NW: 'noroeste' };

const VIAS_FEMININAS = [
    'rua', 'avenida', 'alameda', 'estrada', 'rodovia', 'travessa', 'via', 'praça', 'ladeira', 'marginal',
    'ponte', 'passarela', 'vila', 'viela', 'servidão', 'rotatória', 'transversal', 'ligação', 'passagem',
    'galeria', 'r.', 'av.', 'rod.', 'al.', 'estr.', 'tv.', 'pça.', 'pç.'
];
const VIAS_MASCULINAS = [
    'viaduto', 'largo', 'túnel', 'anel', 'corredor', 'beco', 'elevado', 'eixo', 'trevo', 'contorno',
    'parque', 'pátio', 'rodoanel', 'acesso', 'caminho', 'complexo', 'boulevard'
];

function generoDaVia(nome) {
    const primeira = nome.trim().split(/\s+/)[0].toLowerCase();
    if (VIAS_FEMININAS.includes(primeira)) return 'f';
    if (VIAS_MASCULINAS.includes(primeira)) return 'm';
    return null; // desconhecido → usa "em"/"por", que servem para qualquer gênero
}

function emVia(nome) {
    const g = generoDaVia(nome);
    return g === 'f' ? `na ${nome}` : g === 'm' ? `no ${nome}` : `em ${nome}`;
}

function porVia(nome) {
    const g = generoDaVia(nome);
    return g === 'f' ? `pela ${nome}` : g === 'm' ? `pelo ${nome}` : `por ${nome}`;
}

// Tipos do LRM: Head, Continue, Straight, SlightRight, Right, SharpRight, Uturn/TurnAround, SharpLeft,
// Left, SlightLeft, Roundabout, Merge, Fork, OnRamp, OffRamp, EndOfRoad, WaypointReached, DestinationReached
function textoInstrucaoPt(instr) {
    const rua = (instr.road || '').trim();
    const tipo = instr.type;
    const mod = instr.modifier || tipo || '';
    const lado = /Left/i.test(mod) ? 'esquerda' : /Right/i.test(mod) ? 'direita' : null;
    const em = rua ? ` ${emVia(rua)}` : '';
    const por = rua ? ` ${porVia(rua)}` : '';

    switch (tipo) {
        case 'Head': {
            const dir = DIRECOES_PT[instr.direction];
            return `Siga${dir ? ` para o ${dir}` : ''}${por}`;
        }
        case 'Continue':
        case 'Straight': return `Continue em frente${por}`;
        case 'SlightRight': return `Vire levemente à direita${em}`;
        case 'Right': return `Vire à direita${em}`;
        case 'SharpRight': return `Faça uma curva fechada à direita${em}`;
        case 'SlightLeft': return `Vire levemente à esquerda${em}`;
        case 'Left': return `Vire à esquerda${em}`;
        case 'SharpLeft': return `Faça uma curva fechada à esquerda${em}`;
        case 'TurnAround':
        case 'Uturn': return `Faça o retorno${em}`;
        case 'Roundabout': {
            const saida = instr.exit ? `pegue a ${instr.exit}ª saída` : 'siga pela rotatória';
            return `Na rotatória, ${saida}${em}`;
        }
        case 'Merge': return `Una-se à via${lado ? ` à ${lado}` : ''}${em}`;
        case 'Fork': return `${lado ? `Na bifurcação, mantenha-se à ${lado}` : 'Na bifurcação, continue em frente'}${em}`;
        case 'OnRamp': return `Pegue o acesso${lado ? ` à ${lado}` : ''}${em}`;
        case 'OffRamp': return `Pegue a saída${lado ? ` à ${lado}` : ''}${em}`;
        case 'EndOfRoad': return `No fim da via, vire${lado ? ` à ${lado}` : ''}${em}`;
        case 'WaypointReached': return 'Ponto de passagem alcançado';
        case 'DestinationReached': return 'Você chegou ao destino';
        default: return null;
    }
}

function mensagemErroGPS(err) {
    if (err?.code === 1) {
        return 'Permissão de localização negada. Libere o acesso nos ajustes do navegador (no iPhone: Ajustes › Privacidade e Segurança › Serviços de Localização).';
    }
    if (err?.code === 3) return 'Tempo esgotado ao obter sua localização.';
    return 'Não foi possível obter sua localização agora.';
}

// ───────────────────────── Utilitários de texto ─────────────────────────
function formatarSugestao(feature) {
    const p = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    const rua = [p.street, p.housenumber].filter(Boolean).join(', ');
    const titulo = p.name || rua || p.district || p.city || 'Local sem nome';
    const detalhes = [p.name ? rua : null, p.district, p.city].filter(Boolean).join(' · ');
    return {
        id: `${p.osm_type || 'x'}-${p.osm_id || `${lat},${lng}`}`,
        titulo, detalhes,
        texto: [titulo, p.district, p.city].filter(Boolean).join(', '),
        lat, lng
    };
}

function formatarDistancia(metros) {
    if (metros < 1000) return `${Math.round(metros / 10) * 10 || Math.round(metros)} m`;
    return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function formatarTempo(segundos) {
    const min = Math.round(segundos / 60);
    if (min < 1) return '< 1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

// Giro da seta do passo: pelo tipo da manobra ou, nos tipos genéricos (Fork, Merge…), pelo modificador
function rotacaoDaManobra(tipo, modificador) {
    const mapa = {
        Straight: 0, Head: 0, Continue: 0, StartAt: 0,
        SlightRight: 45, Right: 90, SharpRight: 135,
        TurnAround: 180, Uturn: 180,
        SharpLeft: -135, Left: -90, SlightLeft: -45,
        Roundabout: 90
    };
    return mapa[tipo] ?? mapa[modificador] ?? 0;
}

function IconeDoPasso({ passo, size = 20 }) {
    if (passo.tipo === 'trecho') {
        const nome = { caminhada: 'walk', onibus: 'bus', trem: 'train' }[passo.modalidade] || 'pin';
        return <Icone nome={nome} size={size} />;
    }
    if (passo.manobra === 'DestinationReached') return <Icone nome="pin" size={size} />;
    return <Icone nome="arrow" size={size} rotacao={rotacaoDaManobra(passo.manobra, passo.modificador)} />;
}

// ───────────────────────── Roteamento direto (alternativas + desvios) ─────────────────────────

// Promessa em volta de router.route (interface IRouter do LRM)
function rotearViaRouter(router, pontos, opcoes) {
    return new Promise((resolve, reject) => {
        router.route(
            pontos.map((ll) => L.Routing.waypoint(ll)),
            (err, rotas) => (err ? reject(err) : resolve(rotas)),
            null,
            opcoes
        );
    });
}

// Transforma uma rota do OSRM/LRM em "candidata" (geometria + passos do itinerário em português)
function montarCandidata(rota, formatter, desviada) {
    const coordenadas = rota.coordinates;
    const acumulada = acumularDistancias(coordenadas);
    const total = acumulada[acumulada.length - 1] || rota.summary.totalDistance;

    // WaypointReached é o waypoint de fuga: fica invisível no itinerário.
    const instrucoes = (rota.instructions || []).filter((i) => i.type !== 'WaypointReached');
    const passos = instrucoes.map((instr, k) => {
        let texto = textoInstrucaoPt(instr);
        if (!texto) {
            // Tipo desconhecido: tenta o formatter do LRM (language 'pt') e, por fim, o nome da via
            try { texto = formatter.formatInstruction(instr, k); } catch { texto = null; }
        }
        return {
            id: `m-${k}`,
            tipo: 'manobra',
            manobra: instr.type,
            modificador: instr.modifier,
            texto: texto || instr.road || 'Continue',
            detalhe: instr.distance > 0 ? `por ${formatarDistancia(instr.distance)}` : '',
            indiceCoord: instr.index
        };
    });

    return { id: '', coordenadas, acumulada, total, tempo: rota.summary.totalTime, passos, desviada };
}

// ───────────────────────── Transporte público: Rota Mista ─────────────────────────
//
// Formato que a interface espera de QUALQUER fonte (simulada ou GTFS real):
//   { simulado: boolean, trechos: Trecho[] }
//   Trecho = {
//     modalidade: 'caminhada' | 'onibus' | 'trem',   // trem = trem/metrô/monotrilho
//     texto: string, linha: string | null, de?: string, para?: string,
//     distanciaM: number, duracaoS: number,
//     coordenadas?: L.LatLng[]                       // geometria própria (API real)
//   }

async function obterRotaTransportePublico({ origem, destino, rotaViaria }) {
    if (!TRANSPORTE_PUBLICO_REAL) return simularRotaMista(rotaViaria);

    // ┌─ [GTFS-1] SUBSTITUA ESTE BLOCO PELA SUA API GTFS ────────────────────────
    // 1. Crie um Route Handler (app/api/transporte-publico/route.js) que receba
    //    ?from=lat,lng&to=lat,lng e chame a API escolhida NO SERVIDOR (a chave não vai pro navegador).
    // 2. Mude TRANSPORTE_PUBLICO_REAL para true (lá em cima).
    // 3. Aqui, chame o seu Route Handler e converta a resposta para
    //    { simulado: false, trechos } SEMPRE com `coordenadas` em cada trecho.
    //
    //  OpenTripPlanner (hospedado por você, com GTFS + OSM da região):
    //    GET {OTP}/otp/routers/default/plan?fromPlace=lat,lng&toPlace=lat,lng&mode=TRANSIT,WALK&date=…&time=…
    //    plan.itineraries[0].legs[] → mode ('WALK'|'BUS'|'RAIL'|'SUBWAY'|'TRAM'), routeShortName,
    //    from.name, to.name, distance (m), duration (s), legGeometry.points
    //    WALK→'caminhada'; BUS→'onibus'; RAIL/SUBWAY/TRAM→'trem';
    //    coordenadas = decodificarPolyline(leg.legGeometry.points)
    //    (parâmetros mudam entre OTP 1.x e 2.x: confira a documentação da sua versão)
    //
    //  Google Routes API:
    //    POST https://routes.googleapis.com/directions/v2:computeRoutes
    //    headers: X-Goog-Api-Key e X-Goog-FieldMask (liste os campos de legs/steps que usar)
    //    body: { origin:{location:{latLng:{latitude,longitude}}}, destination:{…}, travelMode:'TRANSIT' }
    //    routes[0].legs[0].steps[] → travelMode ('WALK'|'TRANSIT'), distanceMeters, staticDuration ("420s"),
    //    polyline.encodedPolyline, transitDetails.transitLine { nameShort, vehicle.type },
    //    transitDetails.stopDetails { departureStop.name, arrivalStop.name }
    //
    //  Feeds GTFS da região: verifique os publicados por SPTrans, Metrô/CPTM e EMTU.
    // └────────────────────────────────────────────────────────────────────────────
    throw new Error('Integração GTFS ainda não implementada (veja [GTFS-1]).');
}

// Simulação: divide o corredor viário em caminhada + ônibus (+ trem/metrô em viagens longas).
// Os números são ESTIMATIVAS; nenhuma linha, horário ou parada real é inventada.
function simularRotaMista(rotaViaria) {
    const total = rotaViaria?.total || 0;
    const V_CAMINHADA = 1.4; // m/s
    const V_ONIBUS = 5.5;
    const V_TREM = 10;

    const mk = (modalidade, texto, linha, distanciaM, v) => ({
        modalidade, texto, linha, distanciaM, duracaoS: distanciaM / v
    });

    if (total < 800) {
        return { simulado: true, trechos: [mk('caminhada', 'Siga a pé até o destino', null, total, V_CAMINHADA)] };
    }

    const cam = Math.min(450, total * 0.12);
    const miolo = total - 2 * cam;
    const trechos = [mk('caminhada', 'Caminhe até o ponto de embarque', null, cam, V_CAMINHADA)];

    if (total >= 6000) {
        trechos.push(mk('onibus', 'Embarque no ônibus', 'Linha a definir', miolo * 0.35, V_ONIBUS));
        trechos.push(mk('trem', 'Faça a baldeação para trem/metrô', 'Linha a definir', miolo * 0.65, V_TREM));
    } else {
        trechos.push(mk('onibus', 'Embarque no ônibus', 'Linha a definir', miolo, V_ONIBUS));
    }

    trechos.push(mk('caminhada', 'Desça e caminhe até o destino', null, cam, V_CAMINHADA));
    return { simulado: true, trechos };
}

// Converte trechos em "passos" (mesma estrutura do itinerário de ruas)
function montarPassosMistos(trechos, acumulada) {
    let d = 0;
    const passos = trechos.map((t, k) => {
        const indiceCoord = t.indiceInicio ?? indiceNaDistancia(acumulada, d);
        d += t.distanciaM;
        return {
            id: `t-${k}`,
            tipo: 'trecho',
            modalidade: t.modalidade,
            texto: t.texto,
            detalhe: [
                t.linha,
                t.de && t.para ? `${t.de} → ${t.para}` : null,
                formatarTempo(t.duracaoS),
                formatarDistancia(t.distanciaM)
            ].filter(Boolean).join(' · '),
            cor: CORES_TRECHO[t.modalidade],
            indiceCoord
        };
    });

    passos.push({
        id: 'chegada', tipo: 'trecho', modalidade: 'chegada', texto: 'Chegada ao destino',
        detalhe: '', cor: CORES_TRECHO.chegada, indiceCoord: Math.max(0, acumulada.length - 1)
    });
    return passos;
}

// Troca dinamicamente o servidor OSRM conforme o modo (as linhas são desenhadas por nós).
function aplicarModoNoRouter(routing, modo) {
    const router = routing.getRouter?.() || routing._router;
    if (router) router.options.serviceUrl = MODOS[modo].servico;
}

function ajustarMapa(map, bounds) {
    if (!map || !bounds) return;
    const mobile = window.innerWidth <= 640;
    // O padding evita que o painel (lateral no desktop, "bottom sheet" no mobile) cubra as rotas
    map.fitBounds(
        bounds,
        mobile
            ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, 330] }
            : { paddingTopLeft: [400, 40], paddingBottomRight: [40, 40] }
    );
}

// ───────────────────────── Lista de passos ─────────────────────────
function ListaPassos({ passos, indiceAtivo = -1, carregando }) {
    if (carregando) return <div className="mabc-carregando">Montando rota mista…</div>;
    return (
        <ol className="mabc-passos">
            {passos.map((p, i) => (
                <li key={p.id} className={`mabc-passo${i === indiceAtivo ? ' ativo' : ''}`}>
                    <span
                        className="mabc-passo-icone"
                        style={p.cor ? { background: `${p.cor}1f`, color: p.cor } : undefined}
                    >
                        <IconeDoPasso passo={p} size={20} />
                    </span>
                    <span className="mabc-passo-textos">
                        <span className="mabc-passo-titulo">{p.texto}</span>
                        {p.detalhe ? <span className="mabc-passo-detalhe">{p.detalhe}</span> : null}
                    </span>
                </li>
            ))}
        </ol>
    );
}

// ───────────────────────── Componente ─────────────────────────
export default function MapaABC() {
    // Refs do DOM
    const rootRef = useRef(null);
    const cenaRef = useRef(null);
    const inputDestinoRef = useRef(null);

    // Refs do Leaflet
    const mapRef = useRef(null);
    const routingRef = useRef(null);
    const formatterRef = useRef(null);
    const camadaMarcadoresRef = useRef(null);
    const camadaRotasRef = useRef(null);
    const camadaRotulosRef = useRef(null);
    const camadaMistaRef = useRef(null);
    const marcadorUsuarioRef = useRef(null);
    const precisaoRef = useRef(null);

    // Refs de lógica (evitam closures velhas nos eventos do Leaflet e do GPS)
    const zonasRiscoRef = useRef([]);
    const rotaRef = useRef(null);          // { inicio, fim } da rota pedida
    const modoRef = useRef('driving');
    const faseRef = useRef('busca');
    const rotaAtualRef = useRef(null);
    const candidatasRef = useRef([]);
    const calcReqRef = useRef(0);
    const mistaReqRef = useRef(0);
    const altNumericoRef = useRef(true);   // true: alternatives=2; false: alternatives=true
    const processarRotasRef = useRef(null);
    const selecionarRotaRef = useRef(null);

    // Refs do GPS / câmera
    const seguirRef = useRef(true);
    const ultimaPosRef = useRef(null);     // última posição CRUA do GPS (usada no "recalcular daqui")
    const posExibidaRef = useRef(null);    // posição desenhada (colada na rota ou crua)
    const filtroPosRef = useRef(null);     // última posição que passou pelo filtro de 3 m
    const idxRotaRef = useRef(null);       // último segmento da rota (janela do snap)
    const refRumoRef = useRef(null);       // último ponto usado para deduzir o rumo
    const anguloRef = useRef(0);           // ângulo "desenrolado" (seta + giro do mapa)
    const zoomInicialRef = useRef(false);  // o zoom mínimo é aplicado só no 1º fix
    const cameraImersivaRef = useRef(false);
    const watchIdRef = useRef(null);
    const wakeLockRef = useRef(null);

    // Refs do autocomplete
    const timersRef = useRef({ origem: null, destino: null });
    const abortRef = useRef({ origem: null, destino: null });

    // Estado da UI
    const [origem, setOrigem] = useState({ texto: '', coord: null });
    const [destino, setDestino] = useState({ texto: '', coord: null });
    const [sugestoes, setSugestoes] = useState({ origem: [], destino: [] });
    const [campoAberto, setCampoAberto] = useState(null);
    const [idxAtivo, setIdxAtivo] = useState(-1);
    const [modo, setModo] = useState('driving');
    const [emPerigo, setEmPerigo] = useState(false);
    const [erroRota, setErroRota] = useState('');
    const [localizando, setLocalizando] = useState(false);
    const [fase, setFase] = useState('busca'); // 'busca' | 'itinerario' | 'navegando'
    const [candidatas, setCandidatas] = useState([]);
    const [selecionada, setSelecionada] = useState(0);
    const [bloqueadas, setBloqueadas] = useState([]);
    const [rotaAtual, setRotaAtual] = useState(null);
    const [listaAberta, setListaAberta] = useState(true);
    const [seguir, setSeguirState] = useState(true);
    const [progresso, setProgresso] = useState(null);
    const [chegou, setChegou] = useState(false);

    // Câmera: '2d' → 'prep' → '3d' → 'saindo' → '2d'
    const [camera, setCamera] = useState('2d');
    const [dim3d, setDim3d] = useState(null);

    const setters = { origem: setOrigem, destino: setDestino };

    useEffect(() => { modoRef.current = modo; }, [modo]);
    useEffect(() => { faseRef.current = fase; }, [fase]);
    useEffect(() => {
        rotaAtualRef.current = rotaAtual;
        idxRotaRef.current = null; // rota nova: o snap volta a buscar na rota inteira
    }, [rotaAtual]);

    function definirSeguir(v) {
        seguirRef.current = v;
        setSeguirState(v);
    }

    function entrarNoItinerario(bounds) {
        if (faseRef.current !== 'navegando' && bounds) ajustarMapa(mapRef.current, bounds);
        setFase((f) => (f === 'busca' ? 'itinerario' : f));
    }

    // Converte { trechos } em rota exibível (usado pela simulação e pela API real)
    function publicarRotaMista(res, coordenadas) {
        const acumulada = acumularDistancias(coordenadas);
        const total = acumulada[acumulada.length - 1] || 0;
        const passos = montarPassosMistos(res.trechos, acumulada);
        const tempo = res.trechos.reduce((soma, t) => soma + t.duracaoS, 0);
        setRotaAtual({
            coordenadas, acumulada, total, tempo, passos,
            trechos: res.trechos, simulado: !!res.simulado, carregando: false
        });
    }

    // Define a rota "ativa" (itinerário + navegação) a partir de uma candidata
    function construirRotaAtual(c) {
        const base = {
            coordenadas: c.coordenadas, acumulada: c.acumulada, total: c.total,
            tempo: c.tempo, passos: c.passos, trechos: null, simulado: false, carregando: false
        };

        if (modoRef.current === 'transit') {
            const id = ++mistaReqRef.current;
            setRotaAtual({ ...base, passos: [], carregando: true, simulado: true });
            obterRotaTransportePublico({
                origem: rotaRef.current?.inicio,
                destino: rotaRef.current?.fim,
                rotaViaria: base
            })
                .then((res) => {
                    if (id !== mistaReqRef.current) return;
                    publicarRotaMista(res, c.coordenadas);
                })
                .catch(() => {
                    if (id !== mistaReqRef.current) return;
                    setRotaAtual(null);
                    setErroRota('Não foi possível montar a rota de transporte público.');
                });
        } else {
            mistaReqRef.current++;
            setRotaAtual(base);
        }
    }

    // Seleciona uma das alternativas (clique no mapa ou no card) — só antes de iniciar a viagem
    function selecionarRota(idx) {
        const c = candidatasRef.current[idx];
        if (!c || faseRef.current === 'navegando') return;
        setSelecionada(idx);
        construirRotaAtual(c);
    }

    // Recebe TODAS as rotas do OSRM, aplica o filtro de alagamento em cada uma
    // (waypoint de fuga individual) e publica as candidatas válidas.
    async function processarRotas(rotasOSRM) {
        const reqId = ++calcReqRef.current;
        const routing = routingRef.current;
        const alvo = rotaRef.current;
        if (!routing || !alvo) return;

        const router = routing.getRouter?.() || routing._router;
        const zonas = zonasRiscoRef.current;
        const formatter = formatterRef.current;

        const resolvidas = await Promise.all(
            rotasOSRM.slice(0, MAX_ROTAS).map(async (rota) => {
                const zona = encontrarColisao(rota.coordinates, zonas);
                if (!zona) return { rota, desviada: false, bloqueada: false };

                // Gatilho: waypoint de fuga silencioso força o OSRM a contornar a água nesta rota
                const fuga = L.latLng(zona.lat + OFFSET_FUGA, zona.lng + OFFSET_FUGA);
                try {
                    const novas = await rotearViaRouter(router, [alvo.inicio, fuga, alvo.fim], { semAlternativas: true });
                    const nova = novas?.[0];
                    if (nova && !encontrarColisao(nova.coordinates, zonas)) {
                        return { rota: nova, desviada: true, bloqueada: false };
                    }
                } catch (err) {
                    console.warn('Falha ao recalcular o desvio:', err);
                }
                return { rota, desviada: true, bloqueada: true };
            })
        );

        if (reqId !== calcReqRef.current) return; // chegou um pedido mais novo

        const lista = [];
        const geometriasBloqueadas = [];
        const vistos = new Set();

        for (const r of resolvidas) {
            if (r.bloqueada) { geometriasBloqueadas.push(r.rota.coordinates); continue; }

            const c = montarCandidata(r.rota, formatter, r.desviada);
            if (!c.coordenadas.length) continue;

            // Desvios podem convergir para o mesmo caminho: remove duplicatas
            const meio = c.coordenadas[indiceNaDistancia(c.acumulada, c.total / 2)];
            const assinatura = `${Math.round(c.total / 40)}|${meio.lat.toFixed(3)}|${meio.lng.toFixed(3)}`;
            if (vistos.has(assinatura)) continue;
            vistos.add(assinatura);
            lista.push(c);
        }

        lista.sort((a, b) => a.tempo - b.tempo);
        lista.forEach((c, i) => { c.id = `r-${i}`; });

        candidatasRef.current = lista;
        setCandidatas(lista);
        setBloqueadas(geometriasBloqueadas);
        setSelecionada(0);

        // Todas as alternativas cruzam a água mesmo após o desvio → alerta vermelho
        if (!lista.length) {
            setRotaAtual(null);
            setEmPerigo(true);
            return;
        }

        setEmPerigo(false);
        setErroRota('');
        construirRotaAtual(lista[0]);

        const bounds = lista.reduce(
            (b, c) => b.extend(L.latLngBounds(c.coordenadas)),
            L.latLngBounds(lista[0].coordenadas)
        );
        entrarNoItinerario(bounds);
    }

    // ───── Inicialização do mapa, routing e zonas de risco ─────
    useEffect(() => {
        if (typeof window === 'undefined' || mapRef.current) return;

        let cancelado = false;

        // attributionControl desligado: o crédito do OSM fica no overlay (fora do container inclinado)
        const map = L.map('mapa-container', { zoomControl: false, attributionControl: false }).setView(
            [CENTRO_ABC.lat, CENTRO_ABC.lng], 13
        );
        L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        mapRef.current = map;

        // Panes próprios: alternativas < rota selecionada < trechos da Rota Mista
        map.createPane('rotasAlt').style.zIndex = 410;
        map.createPane('rotas').style.zIndex = 430;
        map.createPane('mista').style.zIndex = 450;

        const camadaZonas = L.layerGroup().addTo(map);
        camadaMarcadoresRef.current = L.layerGroup().addTo(map);
        camadaRotasRef.current = L.layerGroup().addTo(map);
        camadaRotulosRef.current = L.layerGroup().addTo(map);
        camadaMistaRef.current = L.layerGroup().addTo(map);

        // Fallback de texto (o texto principal vem de textoInstrucaoPt)
        formatterRef.current = new L.Routing.Formatter({ language: 'pt' });

        // CÂMERA LIVRE: arrastar o mapa suspende o setView do GPS até o usuário tocar em "Centralizar".
        // (movestart não serve aqui: ele também dispara nos movimentos programáticos do próprio follow)
        map.on('dragstart', () => {
            if (seguirRef.current) {
                seguirRef.current = false;
                setSeguirState(false);
            }
        });

        const router = L.Routing.osrmv1({
            serviceUrl: MODOS.driving.servico,
            profile: 'driving',
            useHints: false
        });

        // O LRM só pede `alternatives=true` (1 alternativa). Pedimos até MAX_ALTERNATIVAS.
        // Desvios individuais usam { semAlternativas: true }.
        const construirUrlOriginal = router.buildRouteUrl.bind(router);
        router.buildRouteUrl = (wps, opts) => {
            const url = construirUrlOriginal(wps, opts);
            if (opts?.semAlternativas) return url.replace('alternatives=true', 'alternatives=false');
            return altNumericoRef.current
                ? url.replace('alternatives=true', `alternatives=${MAX_ALTERNATIVAS}`)
                : url;
        };

        const estiloInvisivel = { styles: [{ color: '#000', opacity: 0, weight: 1 }] };

        const routing = L.Routing.control({
            waypoints: [],
            router,
            // Português: 'pt' (ou 'pt-BR' se a sua versão do LRM tiver essa localização).
            // O texto dos passos NÃO depende disso: vem de textoInstrucaoPt().
            language: 'pt',
            show: false,                  // interface nativa oculta
            showAlternatives: true,       // o OSRM devolve as alternativas em e.routes
            fitSelectedRoutes: false,
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            lineOptions: estiloInvisivel,
            altLineOptions: estiloInvisivel,
            // As linhas são desenhadas por nós (seleção clicável, rótulos, estilos por modo)
            routeLine: (route) => {
                const vazio = L.layerGroup();
                vazio.getBounds = () => L.latLngBounds(route.coordinates);
                return vazio;
            },
            createMarker: () => null      // o waypoint de fuga permanece invisível
        }).addTo(map);
        routingRef.current = routing;

        routing.on('routesfound', (e) => {
            processarRotasRef.current?.(e.routes);
        });

        routing.on('routingerror', () => {
            // Alguns servidores OSRM não aceitam alternatives=<número>: volta para alternatives=true
            if (altNumericoRef.current) {
                altNumericoRef.current = false;
                routing.route();
                return;
            }
            setErroRota('Não foi possível calcular a rota. Tente novamente em instantes.');
        });

        // Zonas de risco (Supabase)
        (async () => {
            const { data, error } = await supabase.from('zonas_risco').select('*');
            if (cancelado || error || !data) return;

            const zonas = data
                .map((z) => ({ ...z, lat: parseFloat(z.latitude), lng: parseFloat(z.longitude) }))
                .filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng));
            zonasRiscoRef.current = zonas;

            zonas.forEach((z) => {
                L.circle([z.lat, z.lng], {
                    color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: RAIO_RISCO_M
                }).bindPopup('⚠️ Zona de Alagamento').addTo(camadaZonas);
            });
        })();

        return () => {
            cancelado = true;
            map.remove();
            mapRef.current = null;
            routingRef.current = null;
            camadaMarcadoresRef.current = null;
            camadaRotasRef.current = null;
            camadaRotulosRef.current = null;
            camadaMistaRef.current = null;
            marcadorUsuarioRef.current = null;
            precisaoRef.current = null;
        };
    }, []);

    // Mantém as refs apontando para as funções mais recentes (usadas por eventos do Leaflet)
    useEffect(() => {
        processarRotasRef.current = processarRotas;
        selecionarRotaRef.current = selecionarRota;
    });

    // Limpeza geral ao desmontar
    useEffect(() => {
        const timers = timersRef.current;
        const aborts = abortRef.current;
        return () => {
            Object.values(timers).forEach(clearTimeout);
            Object.values(aborts).forEach((c) => c?.abort());
            if (watchIdRef.current != null && typeof navigator !== 'undefined') {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            wakeLockRef.current?.release?.().catch(() => { });
        };
    }, []);

    // ───── Câmera imersiva ─────
    useEffect(() => {
        mapRef.current?.invalidateSize({ animate: false });
    }, [dim3d]);

    useEffect(() => {
        cameraImersivaRef.current = camera === '3d';
        const recentrar = (animar) => {
            const pos = posExibidaRef.current;
            if (pos && mapRef.current) centralizarCamera(pos, animar);
        };

        if (camera === 'prep') {
            const t = setTimeout(() => setCamera('3d'), 60);
            return () => clearTimeout(t);
        }
        if (camera === '3d') {
            atualizarGiro();
            recentrar(true);
            return undefined;
        }
        if (camera === 'saindo') {
            recentrar(true);
            const t = setTimeout(() => {
                setCamera('2d');
                setDim3d(null);
            }, DURACAO_TRANSICAO_MS + 60);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [camera]);

    useEffect(() => {
        if (camera === '2d') return undefined;
        const aoRedimensionar = () => {
            const cena = cenaRef.current;
            if (!cena) return;
            setDim3d(dimensoesCena3D(cena.clientWidth, cena.clientHeight, ROTACIONAR_MAPA_NA_VISAO_3D));
        };
        window.addEventListener('resize', aoRedimensionar);
        return () => window.removeEventListener('resize', aoRedimensionar);
    }, [camera]);

    useEffect(() => {
        if (fase !== 'navegando' && camera !== '2d') resetarCamera();
    }, [fase, camera]);

    function alternarCamera() {
        if (camera === '2d') {
            const cena = cenaRef.current;
            if (!cena) return;
            setDim3d(dimensoesCena3D(cena.clientWidth, cena.clientHeight, ROTACIONAR_MAPA_NA_VISAO_3D));
            definirSeguir(true); // sem arrastar na visão 3D: a câmera sempre segue o motorista
            setCamera('prep');
        } else if (camera === '3d') {
            setCamera('saindo');
        }
    }

    function resetarCamera() {
        cameraImersivaRef.current = false;
        setCamera('2d');
        setDim3d(null);
    }

    function atualizarGiro() {
        const giro = ROTACIONAR_MAPA_NA_VISAO_3D ? -anguloRef.current : 0;
        rootRef.current?.style.setProperty('--mabc-giro', `${giro}deg`);
    }

    // Centraliza o mapa no motorista (na visão imersiva, com offset em pixels: marcador desce na tela)
    function centralizarCamera(ll, animar = true) {
        const map = mapRef.current;
        if (!map) return;

        if (!cameraImersivaRef.current) {
            // O zoom mínimo só vale no 1º fix: depois disso o zoom escolhido pelo usuário é respeitado
            const zoom = zoomInicialRef.current ? map.getZoom() : Math.max(map.getZoom(), ZOOM_NAVEGACAO);
            zoomInicialRef.current = true;
            map.setView(ll, zoom, { animate: animar, duration: 0.8 });
            return;
        }

        const zoom = Math.max(map.getZoom(), ZOOM_IMERSIVO);
        const alturaCena = cenaRef.current?.clientHeight || window.innerHeight;
        const offset = offsetCameraPx(alturaCena);
        const rad = ROTACIONAR_MAPA_NA_VISAO_3D ? (anguloRef.current * Math.PI) / 180 : 0;

        // Frente do motorista em pixels do mapa: (sen h, −cos h) — norte é −y
        const p = map.project(ll, zoom);
        const centro = map.unproject(L.point(p.x + Math.sin(rad) * offset, p.y - Math.cos(rad) * offset), zoom);
        map.setView(centro, zoom, { animate: animar, duration: 0.8 });
    }

    // Botão flutuante "Centralizar": retoma o follow
    function centralizar() {
        definirSeguir(true);
        const pos = posExibidaRef.current;
        if (pos) centralizarCamera(pos, true);
    }

    // ───── Marcadores de origem/destino ─────
    useEffect(() => {
        const camada = camadaMarcadoresRef.current;
        if (!camada) return;
        camada.clearLayers();
        if (origem.coord) {
            L.circleMarker([origem.coord.lat, origem.coord.lng], {
                radius: 9, color: '#fff', weight: 3, fillColor: COR_AZUL, fillOpacity: 1
            }).bindTooltip('Origem').addTo(camada);
        }
        if (destino.coord) {
            L.circleMarker([destino.coord.lat, destino.coord.lng], {
                radius: 9, color: '#fff', weight: 3, fillColor: COR_MARINHO, fillOpacity: 1
            }).bindTooltip('Destino').addTo(camada);
        }
    }, [origem.coord, destino.coord]);

    // ───── Desenho das rotas: selecionada em destaque, alternativas clicáveis ─────
    useEffect(() => {
        const camada = camadaRotasRef.current;
        const rotulos = camadaRotulosRef.current;
        if (!camada || !rotulos) return;
        camada.clearLayers();
        rotulos.clearLayers();

        const navegando = fase === 'navegando';
        const estilo = MODOS[modo].estilo;

        if (!navegando) {
            bloqueadas.forEach((coords) => {
                L.polyline(coords, {
                    color: '#dc2626', weight: 4, opacity: 0.75, dashArray: '8, 8',
                    pane: 'rotasAlt', interactive: false
                }).addTo(camada);
            });
        }

        candidatas.forEach((c, i) => {
            const sel = i === selecionada;
            if (navegando && !sel) return;

            if (sel) {
                L.polyline(c.coordenadas, {
                    color: '#fff', weight: estilo.weight + 5, opacity: 0.95, pane: 'rotas', interactive: false
                }).addTo(camada);
                L.polyline(c.coordenadas, { ...estilo, pane: 'rotas', interactive: false }).addTo(camada);
            } else {
                L.polyline(c.coordenadas, {
                    color: COR_AZUL_CLARO, weight: 7, opacity: 0.9, pane: 'rotasAlt', interactive: false
                }).addTo(camada);
                L.polyline(c.coordenadas, {
                    color: '#000', weight: 24, opacity: 0.01, pane: 'rotasAlt', bubblingMouseEvents: false
                })
                    .on('click', () => selecionarRotaRef.current?.(i))
                    .addTo(camada);
            }

            if (!navegando && candidatas.length > 1) {
                const frac = [0.5, 0.35, 0.65][i] ?? 0.5;
                const ponto = c.coordenadas[indiceNaDistancia(c.acumulada, c.total * frac)];
                const texto = modo === 'transit' ? `Opção ${i + 1}` : formatarTempo(c.tempo);
                L.marker(ponto, {
                    icon: L.divIcon({
                        className: 'mabc-rotulo-rota',
                        html: `<span class="${sel ? 'sel' : ''}">${texto}</span>`,
                        iconSize: [0, 0]
                    }),
                    keyboard: false
                })
                    .on('click', () => selecionarRotaRef.current?.(i))
                    .addTo(rotulos);
            }
        });
    }, [candidatas, selecionada, bloqueadas, fase, modo]);

    // ───── Trechos da Rota Mista desenhados sobre a rota selecionada ─────
    useEffect(() => {
        const camada = camadaMistaRef.current;
        if (!camada) return;
        camada.clearLayers();
        if (!rotaAtual?.trechos) return;

        let d = 0;
        rotaAtual.trechos.forEach((t) => {
            const pontos = t.coordenadas
                || fatiarCoordenadas(rotaAtual.coordenadas, rotaAtual.acumulada, d, d + t.distanciaM);
            d += t.distanciaM;
            if (pontos.length > 1) {
                L.polyline(pontos, { ...ESTILOS_TRECHO[t.modalidade], pane: 'mista', interactive: false }).addTo(camada);
            }
        });
    }, [rotaAtual]);

    // ───── Autocomplete (Photon) ─────
    const buscarSugestoes = useCallback(async (campo, termo) => {
        abortRef.current[campo]?.abort();
        const controller = new AbortController();
        abortRef.current[campo] = controller;

        try {
            const params = new URLSearchParams({
                q: termo, limit: '5',
                lat: String(CENTRO_ABC.lat), lon: String(CENTRO_ABC.lng),
                bbox: BBOX_ABC
            });
            const res = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
            if (!res.ok) throw new Error(`Photon ${res.status}`);
            const json = await res.json();

            const vistos = new Set();
            const lista = [];
            for (const feature of json.features || []) {
                const s = formatarSugestao(feature);
                if (vistos.has(s.id)) continue;
                vistos.add(s.id);
                lista.push(s);
            }
            setSugestoes((prev) => ({ ...prev, [campo]: lista }));
            setIdxAtivo(-1);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Erro no autocomplete:', err);
                setSugestoes((prev) => ({ ...prev, [campo]: [] }));
            }
        }
    }, []);

    function handleChange(campo, valor) {
        setters[campo]({ texto: valor, coord: null });
        setCampoAberto(campo);
        setIdxAtivo(-1);

        clearTimeout(timersRef.current[campo]);
        abortRef.current[campo]?.abort();

        const termo = valor.trim();
        if (termo.length < MIN_CHARS) {
            setSugestoes((prev) => ({ ...prev, [campo]: [] }));
            return;
        }
        timersRef.current[campo] = setTimeout(() => buscarSugestoes(campo, termo), DEBOUNCE_MS);
    }

    // Selecionar só preenche o texto e salva a coordenada. NÃO calcula rota.
    function selecionarSugestao(campo, s) {
        setters[campo]({ texto: s.texto, coord: { lat: s.lat, lng: s.lng } });
        setSugestoes((prev) => ({ ...prev, [campo]: [] }));
        setCampoAberto(null);
        setIdxAtivo(-1);
        setErroRota('');
        mapRef.current?.panTo([s.lat, s.lng]);
    }

    // ───── "Meu Local": origem = posição atual, em UMA leitura (sem navegação GPS ativa) ─────
    // iOS/Safari: o pedido de permissão só é aceito dentro de um gesto do usuário. Por isso
    // getCurrentPosition é chamado DIRETO no onClick do botão (nunca em useEffect, nunca após um await).
    function usarMeuLocal() {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setErroRota('Seu navegador não suporta geolocalização.');
            return;
        }
        if (!window.isSecureContext) {
            setErroRota('A localização só funciona em conexão segura (HTTPS).');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setOrigem({ texto: 'Minha localização', coord: { lat, lng } });
                setSugestoes((prev) => ({ ...prev, origem: [] }));
                setCampoAberto(null);
                setErroRota('');
                setLocalizando(false);
                const map = mapRef.current;
                if (map) map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
                inputDestinoRef.current?.focus();
            },
            (err) => {
                setLocalizando(false);
                setErroRota(mensagemErroGPS(err));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );

        setErroRota('');
        setLocalizando(true);
    }

    // ───── Cálculo de rota ─────
    function calcular(inicio, fim) {
        const routing = routingRef.current;
        if (!routing) return;

        setErroRota('');
        setEmPerigo(false);
        setCampoAberto(null);
        rotaRef.current = { inicio, fim };

        // [GTFS-2] Com API real, o OSRM não é usado no modo transporte público:
        // a geometria vem dos próprios trechos (veja carregarRotaMistaReal).
        if (modoRef.current === 'transit' && TRANSPORTE_PUBLICO_REAL) {
            carregarRotaMistaReal(inicio, fim);
            return;
        }

        // O controle busca as rotas e dispara 'routesfound' → processarRotas()
        routing.setWaypoints([inicio, fim]);
    }

    // [GTFS-2] Caminho 100% GTFS: sem OSRM, geometria vinda da API.
    // O desvio de alagamento não se aplica aqui (o trajeto é definido pela API);
    // se quiser, valide os trechos a pé com encontrarColisao().
    async function carregarRotaMistaReal(inicio, fim) {
        const id = ++mistaReqRef.current;
        calcReqRef.current++;
        routingRef.current?.setWaypoints([]);
        candidatasRef.current = [];
        setCandidatas([]);
        setBloqueadas([]);

        try {
            const res = await obterRotaTransportePublico({ origem: inicio, destino: fim, rotaViaria: null });
            if (id !== mistaReqRef.current) return;

            const coordenadas = [];
            res.trechos.forEach((t) => {
                t.indiceInicio = coordenadas.length;
                coordenadas.push(...(t.coordenadas || []));
            });

            publicarRotaMista(res, coordenadas);
            entrarNoItinerario(L.latLngBounds(coordenadas));
        } catch (err) {
            if (id !== mistaReqRef.current) return;
            console.error(err);
            setRotaAtual(null);
            setErroRota('Não foi possível montar a rota de transporte público.');
        }
    }

    // Gatilho: Enter com origem e destino definidos (a origem pode ser digitada, escolhida ou "Meu Local")
    function tracarRota() {
        if (!origem.coord || !destino.coord) {
            setErroRota('Defina origem e destino (use as sugestões ou "Meu local") e pressione Enter.');
            return;
        }
        calcular(
            L.latLng(origem.coord.lat, origem.coord.lng),
            L.latLng(destino.coord.lat, destino.coord.lng)
        );
    }

    function mudarModo(novo) {
        modoRef.current = novo;
        setModo(novo);
        const routing = routingRef.current;
        if (!routing) return;

        aplicarModoNoRouter(routing, novo);
        if (rotaRef.current) calcular(rotaRef.current.inicio, rotaRef.current.fim);
    }

    function inverter() {
        const novaOrigem = destino;
        const novoDestino = origem;
        setOrigem(novaOrigem);
        setDestino(novoDestino);
        setSugestoes({ origem: [], destino: [] });

        if (rotaRef.current && novaOrigem.coord && novoDestino.coord) {
            calcular(
                L.latLng(novaOrigem.coord.lat, novaOrigem.coord.lng),
                L.latLng(novoDestino.coord.lat, novoDestino.coord.lng)
            );
        }
    }

    function limparRota() {
        pararGPS();
        resetarCamera();
        calcReqRef.current++;
        mistaReqRef.current++;
        routingRef.current?.setWaypoints([]);
        rotaRef.current = null;
        candidatasRef.current = [];
        setCandidatas([]);
        setBloqueadas([]);
        setSelecionada(0);
        setOrigem({ texto: '', coord: null });
        setDestino({ texto: '', coord: null });
        setSugestoes({ origem: [], destino: [] });
        setRotaAtual(null);
        setProgresso(null);
        setChegou(false);
        setEmPerigo(false);
        setErroRota('');
        setListaAberta(true);
        setFase('busca');
    }

    function handleKeyDown(e, campo) {
        const lista = sugestoes[campo];
        const dropdownVisivel = campoAberto === campo && lista.length > 0;

        if (e.key === 'ArrowDown' && dropdownVisivel) {
            e.preventDefault();
            setIdxAtivo((i) => (i + 1) % lista.length);
        } else if (e.key === 'ArrowUp' && dropdownVisivel) {
            e.preventDefault();
            setIdxAtivo((i) => (i <= 0 ? lista.length - 1 : i - 1));
        } else if (e.key === 'Escape') {
            setCampoAberto(null);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (dropdownVisivel && idxAtivo >= 0 && lista[idxAtivo]) {
                selecionarSugestao(campo, lista[idxAtivo]);
            } else {
                tracarRota();
            }
        }
    }

    // ───── Navegação em tempo real (GPS) ─────
    async function pedirWakeLock() {
        try {
            if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch { /* opcional */ }
    }

    function soltarWakeLock() {
        wakeLockRef.current?.release?.().catch(() => { });
        wakeLockRef.current = null;
    }

    function pararGPS() {
        if (watchIdRef.current != null && typeof navigator !== 'undefined') {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
        marcadorUsuarioRef.current?.remove();
        precisaoRef.current?.remove();
        marcadorUsuarioRef.current = null;
        precisaoRef.current = null;
        refRumoRef.current = null;
        filtroPosRef.current = null;
        posExibidaRef.current = null;
        idxRotaRef.current = null;
        anguloRef.current = 0;
        rootRef.current?.style.setProperty('--mabc-giro', '0deg');
        soltarWakeLock();
    }

    // Rotaciona só o filho interno: o elemento raiz do marcador é posicionado pelo Leaflet via transform
    function aplicarRumoNaSeta() {
        const el = marcadorUsuarioRef.current?.getElement();
        const rot = el?.querySelector('.mabc-seta-rot');
        if (rot) rot.style.transform = `rotate(${anguloRef.current}deg)`;
    }

    // Cada leitura do GPS passa por: (1) snap-to-route → (2) filtro de sensibilidade → (3) marcador/câmera/progresso
    function aoReceberPosicao(pos) {
        const map = mapRef.current;
        if (!map) return;

        const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
        const bruto = L.latLng(lat, lng);
        ultimaPosRef.current = { lat, lng };

        // 1) SNAP-TO-ROUTE: projeta a coordenada crua no segmento mais próximo da rota selecionada
        const rota = rotaAtualRef.current;
        const proj = rota?.coordenadas?.length > 1
            ? projetarNaRota(rota.coordenadas, lat, lng, idxRotaRef.current)
            : null;
        const limiteSnap = Math.max(LIMITE_SNAP_M, Math.min(accuracy || 0, 60));
        const colado = !!proj && proj.desvioM <= limiteSnap;
        const exibido = colado ? proj.ponto : bruto; // fora da rota mostra a posição real
        if (colado) idxRotaRef.current = proj.idx;

        // 2) FILTRO DE SENSIBILIDADE
        const anteriorFiltro = filtroPosRef.current;
        const deslocou = !anteriorFiltro || anteriorFiltro.distanceTo(exibido) > LIMIAR_DESLOCAMENTO_M;

        // Rumo candidato: segmento da rota (se colado) > heading do GPS > deslocamento entre leituras
        const refRumo = refRumoRef.current;
        const moveuParaRumo = refRumo ? refRumo.distanceTo(exibido) > 5 : false;
        const rumoGPS = Number.isFinite(heading) && (speed == null || speed > 0.8) ? heading : null;
        let rumo = null;
        if (colado) {
            // Se o GPS aponta para o sentido oposto da rota (contramão/retorno), confia no GPS
            rumo = rumoGPS != null && difAngular(rumoGPS, proj.rumoSegmento) > 90 ? rumoGPS : proj.rumoSegmento;
        } else {
            rumo = rumoGPS ?? (moveuParaRumo ? calcularRumo(refRumo, exibido) : null);
        }
        if (!refRumo || moveuParaRumo) refRumoRef.current = exibido;

        const girou = rumo != null && difAngular(rumo, anguloRef.current) >= LIMIAR_ANGULO_GRAUS;

        // Dentro do ruído do GPS: não mexe em marcador, mapa nem ícone
        if (!deslocou && !girou) return;

        if (girou) {
            // "Desenrola" o ângulo para a seta (e o giro do mapa) não darem a volta longa (359° → 1°)
            const delta = ((((rumo - anguloRef.current + 540) % 360) + 360) % 360) - 180;
            anguloRef.current += delta;
        }

        // 3) MARCADOR sobre a linha
        let criouAgora = false;
        if (deslocou) {
            filtroPosRef.current = exibido;
            posExibidaRef.current = exibido;

            if (!marcadorUsuarioRef.current) {
                criouAgora = true;
                marcadorUsuarioRef.current = L.marker(exibido, {
                    icon: L.divIcon({
                        className: 'mabc-seta',
                        html:
                            '<div class="mabc-seta-wrap"><span class="mabc-seta-pulso"></span>' +
                            `<div class="mabc-seta-rot"><svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="${COR_AZUL_CLARO}" stroke="${COR_MARINHO}" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>`,
                        iconSize: [44, 44], iconAnchor: [22, 22]
                    }),
                    interactive: false, keyboard: false, zIndexOffset: 1000
                }).addTo(map);
                precisaoRef.current = L.circle(exibido, {
                    radius: colado ? 0 : accuracy, stroke: false,
                    fillColor: COR_AZUL, fillOpacity: 0.14, interactive: false
                }).addTo(map);
            } else {
                marcadorUsuarioRef.current.setLatLng(exibido);
                // O círculo de precisão só aparece quando o marcador NÃO está colado na rota
                precisaoRef.current.setLatLng(exibido).setRadius(colado ? 0 : accuracy);
            }
        }

        if (girou || criouAgora) {
            aplicarRumoNaSeta();
            atualizarGiro();
        }

        // Câmera: só acompanha se o usuário não arrastou o mapa (CÂMERA LIVRE)
        if (seguirRef.current && posExibidaRef.current && (deslocou || (girou && cameraImersivaRef.current))) {
            centralizarCamera(posExibidaRef.current);
        }

        // Progresso na rota / chegada
        if (deslocou && proj) {
            const prog = calcularProgresso(rota, proj, accuracy);
            if (prog) {
                setProgresso(prog);
                if (prog.restanteM <= RAIO_CHEGADA_M) {
                    setChegou(true);
                    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
                    watchIdRef.current = null;
                    soltarWakeLock();
                }
            }
        }
    }

    function aoErroPosicao(err) {
        setErroRota(mensagemErroGPS(err));
        if (err.code === 1) encerrarNavegacao();
    }

    // Botão "Ir Agora"
    // iOS/Safari: o watchPosition é disparado AQUI, de forma síncrona no onClick (gesto do usuário),
    // antes de qualquer setState/await. Não há chamada de geolocalização em nenhum useEffect.
    function iniciarNavegacao() {
        const rota = rotaAtualRef.current;
        if (!rota || rota.carregando) return;

        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setErroRota('Seu navegador não suporta geolocalização.');
            return;
        }
        if (!window.isSecureContext) {
            setErroRota('A navegação por GPS só funciona em conexão segura (HTTPS).');
            return;
        }

        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(aoReceberPosicao, aoErroPosicao, {
            enableHighAccuracy: true, maximumAge: 1000, timeout: 20000
        });

        // Estado novo de navegação (o 1º fix sempre passa pelo filtro e aplica o zoom mínimo)
        filtroPosRef.current = null;
        posExibidaRef.current = null;
        refRumoRef.current = null;
        idxRotaRef.current = null;
        zoomInicialRef.current = false;

        setErroRota('');
        setChegou(false);
        setProgresso(null);
        setListaAberta(true);   // só o painel de instruções fica visível
        definirSeguir(true);
        setFase('navegando');
        pedirWakeLock();
    }

    function encerrarNavegacao() {
        pararGPS();
        resetarCamera();
        setChegou(false);
        setProgresso(null);
        setListaAberta(true);
        setFase((f) => (f === 'navegando' ? 'itinerario' : f));
    }

    // Fora da rota: recalcula a partir da posição atual (alternativas + desvio de alagamento de novo)
    function recalcularDaqui() {
        const pos = ultimaPosRef.current;
        const r = rotaRef.current;
        if (!pos || !r) return;
        setOrigem({ texto: 'Minha localização', coord: pos });
        calcular(L.latLng(pos.lat, pos.lng), r.fim);
    }

    // ───── Render ─────
    const cfgModo = MODOS[modo];
    const avisoModo = modo === 'transit' && !TRANSPORTE_PUBLICO_REAL ? cfgModo.aviso : null;
    const proximoPasso = progresso && rotaAtual ? rotaAtual.passos[progresso.idxProximo] : null;
    const imersiva = camera === '3d' || camera === 'prep';

    const estiloMapa = dim3d
        ? {
            left: '50%', top: '50%', right: 'auto', bottom: 'auto',
            width: dim3d.w, height: dim3d.h,
            marginLeft: -dim3d.w / 2, marginTop: -dim3d.h / 2
        }
        : undefined;

    function renderModos(comLimpar) {
        return (
            <div className="mabc-modos" role="group" aria-label="Meio de transporte">
                {Object.entries(MODOS).map(([chave, m]) => (
                    <button
                        key={chave} type="button"
                        className={`mabc-modo${modo === chave ? ' ativo' : ''}`}
                        onClick={() => mudarModo(chave)}
                        aria-pressed={modo === chave} aria-label={m.rotulo} title={m.rotulo}
                    >
                        <Icone nome={m.icone} size={20} />
                    </button>
                ))}
                {comLimpar && (
                    <button type="button" className="mabc-icone-btn" onClick={limparRota} aria-label="Limpar rota" title="Limpar">
                        <Icone nome="close" size={18} />
                    </button>
                )}
            </div>
        );
    }

    function renderCampo(campo, estado, placeholder, acaoExtra) {
        const lista = sugestoes[campo];
        const mostrar = campoAberto === campo && lista.length > 0;

        return (
            <div className="mabc-campo">
                <input
                    ref={campo === 'destino' ? inputDestinoRef : undefined}
                    type="text"
                    className={`mabc-input${estado.coord ? ' definido' : ''}${acaoExtra ? ' com-acao' : ''}`}
                    value={estado.texto}
                    placeholder={placeholder}
                    autoComplete="off" spellCheck={false} aria-label={placeholder}
                    onChange={(e) => handleChange(campo, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, campo)}
                    onFocus={() => setCampoAberto(campo)}
                    onBlur={() => setCampoAberto(null)}
                />
                {acaoExtra}

                {mostrar && (
                    <ul className="mabc-dropdown" role="listbox">
                        {lista.map((s, i) => (
                            <li
                                key={`${s.id}-${i}`}
                                role="option" aria-selected={i === idxAtivo}
                                className={`mabc-item${i === idxAtivo ? ' ativo' : ''}`}
                                onMouseDown={(e) => e.preventDefault()}  // mantém o foco no input (sem blur prematuro)
                                onClick={() => selecionarSugestao(campo, s)}
                                onMouseEnter={() => setIdxAtivo(i)}
                            >
                                <span className="mabc-item-icone"><Icone nome="pin" size={18} /></span>
                                <span className="mabc-item-textos">
                                    <span className="mabc-item-titulo">{s.titulo}</span>
                                    {s.detalhes && <span className="mabc-item-detalhes">{s.detalhes}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <div ref={rootRef} className={`mabc-root mabc-cam-${camera}`}>
            <style>{CSS}</style>

            {/* Camada 0: cena (recorta o mapa inclinado) → container do mapa → névoa do horizonte */}
            <div ref={cenaRef} className="mabc-cena">
                <div id="mapa-container" className="mabc-mapa" style={estiloMapa} />
                <div className="mabc-ceu" />
            </div>

            {/* Camada 1000: overlay isolado; só os painéis recebem cliques */}
            <div className="mabc-overlay">
                {/* ───── Fase 1: busca (painel compacto) ───── */}
                {fase === 'busca' && (
                    <div className="mabc-painel">
                        {renderModos(true)}

                        <div className="mabc-campos">
                            <div className="mabc-trilho" aria-hidden="true">
                                <span className="mabc-bolinha" />
                                <span className="mabc-linha" />
                                <span className="mabc-pino"><Icone nome="pin" size={18} /></span>
                            </div>
                            <div className="mabc-inputs">
                                {renderCampo('origem', origem, 'Origem', (
                                    // Ícone "Localização atual": origem = posição do GPS, em uma leitura única
                                    <button
                                        type="button"
                                        className={`mabc-input-acao${localizando ? ' carregando' : ''}`}
                                        onClick={usarMeuLocal}
                                        disabled={localizando}
                                        aria-label="Usar minha localização atual"
                                        title="Meu local"
                                    >
                                        <Icone nome="locate" size={20} />
                                    </button>
                                ))}
                                {renderCampo('destino', destino, 'Destino — Enter para traçar')}
                            </div>
                            <button type="button" className="mabc-icone-btn" onClick={inverter} aria-label="Inverter origem e destino" title="Inverter">
                                <Icone nome="swap" size={20} />
                            </button>
                        </div>

                        {avisoModo && <div className="mabc-aviso">{avisoModo}</div>}
                        {erroRota && <div className="mabc-erro">{erroRota}</div>}

                        {rotaAtual && (
                            <button type="button" className="mabc-btn-sec compacto" onClick={() => setFase('itinerario')}>
                                <Icone nome="list" size={16} /> Ver rotas e passos
                            </button>
                        )}
                    </div>
                )}

                {/* ───── Fase 2: escolha da rota + itinerário ───── */}
                {fase === 'itinerario' && rotaAtual && (
                    <div className={`mabc-painel mabc-itin${listaAberta ? '' : ' recolhido'}`}>
                        <button
                            type="button" className="mabc-alca"
                            onClick={() => setListaAberta((v) => !v)}
                            aria-label={listaAberta ? 'Recolher passos' : 'Expandir passos'}
                        >
                            <span />
                        </button>

                        <div className="mabc-itin-topo">
                            <button type="button" className="mabc-icone-btn" onClick={() => setFase('busca')} aria-label="Editar origem e destino" title="Editar">
                                <Icone nome="back" size={20} />
                            </button>
                            <div className="mabc-itin-titulo">
                                <span>{origem.texto || 'Origem'}</span>
                                <span className="mabc-seta-txt">→</span>
                                <span>{destino.texto || 'Destino'}</span>
                            </div>
                            <button type="button" className="mabc-icone-btn" onClick={limparRota} aria-label="Limpar rota" title="Limpar">
                                <Icone nome="close" size={18} />
                            </button>
                        </div>

                        {renderModos(false)}

                        {candidatas.length > 1 && (
                            <div className="mabc-opcoes" role="radiogroup" aria-label="Rotas disponíveis">
                                {candidatas.map((c, i) => (
                                    <button
                                        key={c.id} type="button" role="radio"
                                        aria-checked={i === selecionada}
                                        className={`mabc-opcao${i === selecionada ? ' ativo' : ''}`}
                                        onClick={() => selecionarRota(i)}
                                    >
                                        <span className="mabc-opcao-tempo">
                                            {modo === 'transit' ? `Opção ${i + 1}` : formatarTempo(c.tempo)}
                                        </span>
                                        <span className="mabc-opcao-dist">{formatarDistancia(c.total)}</span>
                                        {i === 0 && modo !== 'transit' && <span className="mabc-tag">Mais rápida</span>}
                                        {c.desviada && <span className="mabc-tag desvio">Com desvio</span>}
                                    </button>
                                ))}
                            </div>
                        )}

                        {bloqueadas.length > 0 && (
                            <div className="mabc-aviso-zona">
                                {bloqueadas.length === 1
                                    ? '1 rota descartada: cruza zona de alagamento sem desvio possível.'
                                    : `${bloqueadas.length} rotas descartadas: cruzam zona de alagamento sem desvio possível.`}
                            </div>
                        )}

                        <div className="mabc-resumo">
                            {rotaAtual.carregando ? (
                                <span className="mabc-resumo-dist">Montando rota mista…</span>
                            ) : (
                                <>
                                    <span className="mabc-resumo-tempo">{formatarTempo(rotaAtual.tempo)}</span>
                                    <span className="mabc-resumo-dist">{formatarDistancia(rotaAtual.total)}</span>
                                    {rotaAtual.simulado && <span className="mabc-selo">Simulado</span>}
                                </>
                            )}
                        </div>

                        {avisoModo && <div className="mabc-aviso">{avisoModo}</div>}
                        {erroRota && <div className="mabc-erro">{erroRota}</div>}

                        <button
                            type="button" className="mabc-btn-ir"
                            onClick={iniciarNavegacao} disabled={rotaAtual.carregando}
                        >
                            <Icone nome="navigation" size={22} /> Ir Agora
                        </button>

                        {listaAberta && (
                            <ListaPassos passos={rotaAtual.passos} carregando={rotaAtual.carregando} />
                        )}
                    </div>
                )}

                {/* ───── Fase 3: navegação (só o painel de instruções) ───── */}
                {fase === 'navegando' && rotaAtual && (
                    <div className="mabc-painel mabc-nav">
                        {chegou ? (
                            <div className="mabc-nav-banner chegou">
                                <span className="mabc-nav-icone"><Icone nome="pin" size={30} /></span>
                                <div>
                                    <div className="mabc-nav-texto">Você chegou ao destino</div>
                                    <div className="mabc-nav-dist">{destino.texto}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="mabc-nav-banner">
                                <span className="mabc-nav-icone">
                                    {proximoPasso ? <IconeDoPasso passo={proximoPasso} size={30} /> : <Icone nome="locate" size={30} />}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                    <div className="mabc-nav-dist">
                                        {progresso ? `Em ${formatarDistancia(progresso.distProximo)}` : 'Obtendo sua localização…'}
                                    </div>
                                    <div className="mabc-nav-texto">{proximoPasso ? proximoPasso.texto : 'Aguardando sinal do GPS'}</div>
                                </div>
                            </div>
                        )}

                        {progresso && !chegou && (
                            <div className="mabc-nav-resumo">
                                <strong>{formatarTempo(progresso.restanteS)}</strong>
                                <span>{formatarDistancia(progresso.restanteM)}</span>
                                {rotaAtual.simulado && <span className="mabc-selo">Simulado</span>}
                            </div>
                        )}

                        {progresso?.foraDaRota && !chegou && (
                            <div className="mabc-fora">
                                Você saiu da rota ({formatarDistancia(progresso.desvioM)}).
                                <button type="button" onClick={recalcularDaqui}>Recalcular daqui</button>
                            </div>
                        )}

                        {erroRota && <div className="mabc-erro">{erroRota}</div>}

                        <div className="mabc-nav-acoes">
                            <button type="button" className="mabc-btn-sec compacto" onClick={() => setListaAberta((v) => !v)}>
                                <Icone nome="list" size={16} /> {listaAberta ? 'Ocultar passos' : 'Passos'}
                            </button>
                            <button type="button" className="mabc-btn-enc" onClick={encerrarNavegacao}>
                                {chegou ? 'Concluir' : 'Encerrar'}
                            </button>
                        </div>

                        {listaAberta && (
                            <ListaPassos
                                passos={rotaAtual.passos}
                                indiceAtivo={progresso ? Math.max(0, progresso.idxProximo - 1) : -1}
                            />
                        )}
                    </div>
                )}

                {/* Botão flutuante "Centralizar": aparece quando o usuário arrastou o mapa */}
                {fase === 'navegando' && !seguir && camera === '2d' && (
                    <button type="button" className="mabc-btn-centralizar" onClick={centralizar}>
                        <Icone nome="locate" size={20} /> Centralizar
                    </button>
                )}

                {/* Botão flutuante: Visão Superior (2D) ⇄ Visão Imersiva (3D) — só na navegação ativa */}
                {fase === 'navegando' && (
                    <button
                        type="button"
                        className={`mabc-btn-camera${imersiva ? ' ativo' : ''}`}
                        onClick={alternarCamera}
                        disabled={camera === 'prep' || camera === 'saindo'}
                        aria-pressed={imersiva}
                        aria-label={imersiva ? 'Voltar para a Visão Superior' : 'Ativar a Visão Imersiva'}
                        title={imersiva ? 'Visão Superior' : 'Visão Imersiva'}
                    >
                        <Icone nome="compass" size={22} />
                        <span>{imersiva ? '2D' : '3D'}</span>
                    </button>
                )}

                {/* Alerta vermelho flutuante: nenhuma alternativa escapa da água */}
                {emPerigo && (
                    <div className="mabc-alerta" role="alert">
                        <Icone nome="warning" size={22} />
                        <span><strong>ALERTA:</strong> A área está bloqueada e não há desvios seguros.</span>
                    </div>
                )}

                {/* Crédito obrigatório do OpenStreetMap (fora do container inclinado) */}
                <a
                    className="mabc-atribuicao"
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank" rel="noopener noreferrer"
                >
                    © OpenStreetMap contributors
                </a>
            </div>
        </div>
    );
}

// ───────────────────────── CSS ─────────────────────────
const CSS = `
/* Pilha de camadas: cena (0) → overlay (1000). Nada do Leaflet escapa do contexto da cena. */
.mabc-root {
    /* Paleta: azul marinho + azul claro */
    --mc-marinho: ${COR_MARINHO};
    --mc-marinho-2: ${COR_MARINHO_2};
    --mc-azul: ${COR_AZUL};
    --mc-azul-claro: ${COR_AZUL_CLARO};
    --mc-azul-palido: #e4f0fc;
    --mc-texto-2: #5a7391;
    --mabc-giro: 0deg;

    position: relative; isolation: isolate; width: 100%;
    height: 100vh; height: 100dvh; overflow: hidden; background: #e5e7eb;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--mc-marinho);
}
.mabc-overlay { position: absolute; inset: 0; z-index: 1000; pointer-events: none; }
.mabc-overlay > * { pointer-events: auto; }
.leaflet-routing-container { display: none !important; }
.leaflet-routing-add-waypoint { display: none !important; }

/* ── Cena + câmera ──
   O tilt vai no CONTAINER do mapa, não no .leaflet-map-pane: o Leaflet escreve
   transform: translate3d(...) inline no pane a cada pan e quebraria. */
.mabc-cena {
    position: absolute; inset: 0; z-index: 0; overflow: hidden;
    background: linear-gradient(#cfe0f3, #e6eef8);
}
.mabc-mapa {
    position: absolute; inset: 0; z-index: 0; transform-origin: 50% 50%;
    transform: perspective(${PERSPECTIVA_PX}px) rotateX(0deg) rotateZ(0deg);
    transition: transform ${DURACAO_TRANSICAO_MS}ms cubic-bezier(.4, 0, .2, 1);
    will-change: transform;
}
.mabc-cam-3d .mabc-mapa {
    transform: perspective(${PERSPECTIVA_PX}px) rotateX(${INCLINACAO_GRAUS}deg) rotateZ(var(--mabc-giro, 0deg));
}
.mabc-cam-prep .mabc-mapa, .mabc-cam-3d .mabc-mapa, .mabc-cam-saindo .mabc-mapa { pointer-events: none; }
.mabc-cam-prep .leaflet-control-container, .mabc-cam-3d .leaflet-control-container, .mabc-cam-saindo .leaflet-control-container { display: none; }
.mabc-root .leaflet-bottom { margin-bottom: 22px; }

.mabc-ceu {
    position: absolute; left: 0; right: 0; top: 0; height: 42%; z-index: 2; pointer-events: none; opacity: 0;
    transition: opacity ${DURACAO_TRANSICAO_MS}ms ease;
    background: linear-gradient(to bottom,
        rgba(214, 228, 243, 1) 0%, rgba(214, 228, 243, .9) 25%,
        rgba(214, 228, 243, .5) 55%, rgba(214, 228, 243, 0) 100%);
}
.mabc-cam-3d .mabc-ceu { opacity: 1; }

/* Botões flutuantes: 2D/3D e Centralizar */
.mabc-btn-camera {
    position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); right: 16px;
    width: 54px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 50%; cursor: pointer;
    font: 800 10.5px system-ui, sans-serif; letter-spacing: .04em; color: var(--mc-marinho);
    background: rgba(255, 255, 255, 0.82);
    -webkit-backdrop-filter: blur(14px) saturate(1.5); backdrop-filter: blur(14px) saturate(1.5);
    box-shadow: 0 6px 20px rgba(11, 37, 69, 0.22);
    transition: background .15s, color .15s, transform .12s;
}
.mabc-btn-camera.ativo { color: #fff; background: var(--mc-marinho); }
.mabc-btn-camera:active { transform: scale(.94); }
.mabc-btn-camera:disabled { opacity: .75; cursor: default; }

.mabc-btn-centralizar {
    position: absolute; left: 50%; transform: translateX(-50%);
    bottom: calc(44px + env(safe-area-inset-bottom, 0px));
    display: inline-flex; align-items: center; gap: 8px; height: 46px; padding: 0 20px;
    border: none; border-radius: 999px; cursor: pointer; font: 700 15px system-ui, sans-serif;
    color: #fff; background: linear-gradient(135deg, var(--mc-marinho-2), var(--mc-marinho));
    box-shadow: 0 8px 22px rgba(11, 37, 69, 0.4);
    transition: filter .15s;
}
.mabc-btn-centralizar:hover { filter: brightness(1.12); }

/* Crédito do OSM */
.mabc-atribuicao {
    position: absolute; right: 8px; bottom: calc(4px + env(safe-area-inset-bottom, 0px));
    padding: 2px 8px; font-size: 11px; color: var(--mc-texto-2); text-decoration: none;
    background: rgba(255, 255, 255, 0.82); border-radius: 6px;
}

/* ── Painel base: glassmorphism compacto ── */
.mabc-painel {
    position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); left: 14px;
    width: min(344px, calc(100% - 28px)); box-sizing: border-box; padding: 10px;
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 24px;
    box-shadow: 0 10px 30px rgba(11, 37, 69, 0.16), 0 1px 2px rgba(11, 37, 69, 0.08);
}
.mabc-itin, .mabc-nav {
    display: flex; flex-direction: column;
    max-height: calc(100% - 28px - env(safe-area-inset-top, 0px));
}
.mabc-itin { width: min(372px, calc(100% - 28px)); }

/* Modos de transporte e botões */
.mabc-modos { display: flex; align-items: center; gap: 2px; margin-bottom: 8px; }
.mabc-modo {
    flex: 1; height: 34px; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 12px; background: transparent; color: var(--mc-texto-2); cursor: pointer;
    transition: background .15s, color .15s;
}
.mabc-modo:hover { background: rgba(143, 195, 245, 0.28); }
.mabc-modo.ativo { background: var(--mc-marinho); color: #fff; }
.mabc-icone-btn {
    width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 50%; background: transparent; color: var(--mc-texto-2); cursor: pointer; transition: background .15s;
}
.mabc-icone-btn:hover { background: rgba(143, 195, 245, 0.28); }
.mabc-btn-sec, .mabc-btn-enc {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 42px; padding: 0 16px; border: none; border-radius: 14px; cursor: pointer;
    font: inherit; font-size: 14.5px; font-weight: 600; transition: filter .15s, background .15s;
}
.mabc-btn-sec { background: var(--mc-azul-palido); color: var(--mc-marinho-2); }
.mabc-btn-sec:hover { background: #d3e6fa; }
.mabc-btn-sec.compacto { height: 36px; padding: 0 12px; font-size: 13.5px; }
.mabc-btn-enc { height: 36px; padding: 0 14px; font-size: 13.5px; background: #fee2e2; color: #b91c1c; margin-left: auto; }
.mabc-btn-enc:hover { background: #fecaca; }
.mabc-painel > .mabc-btn-sec { width: 100%; margin-top: 8px; }

/* Botão de destaque "Ir Agora" */
.mabc-btn-ir {
    display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
    height: 52px; margin-top: 10px; border: none; border-radius: 16px; cursor: pointer;
    font: inherit; font-size: 18px; font-weight: 800; letter-spacing: .01em; color: #fff;
    background: linear-gradient(135deg, #2a6fc2, var(--mc-marinho));
    box-shadow: 0 8px 20px rgba(11, 37, 69, 0.35);
    transition: transform .12s, filter .15s;
}
.mabc-btn-ir:hover { filter: brightness(1.1); }
.mabc-btn-ir:active { transform: scale(.98); }
.mabc-btn-ir:disabled { background: #94a3b8; box-shadow: none; cursor: default; }

/* Inputs */
.mabc-campos { display: flex; align-items: center; gap: 6px; }
.mabc-trilho {
    width: 18px; height: 86px; display: flex; flex-direction: column; align-items: center;
    justify-content: space-between; padding: 12px 0 10px; box-sizing: border-box; flex-shrink: 0;
}
.mabc-bolinha { width: 11px; height: 11px; border-radius: 50%; border: 3px solid var(--mc-azul); box-sizing: border-box; }
.mabc-linha { flex: 1; border-left: 2px dotted var(--mc-azul-claro); margin: 3px 0; }
.mabc-pino { color: var(--mc-marinho); display: flex; }
.mabc-inputs { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.mabc-campo { position: relative; }
.mabc-input {
    width: 100%; height: 40px; box-sizing: border-box; padding: 0 12px;
    font-size: 16px; font-family: inherit; color: var(--mc-marinho);
    background: rgba(228, 240, 252, 0.78); border: 1px solid transparent; border-radius: 14px; outline: none;
    transition: background .15s, border-color .15s, box-shadow .15s;
}
.mabc-input.com-acao { padding-right: 42px; }
.mabc-input::placeholder { color: #7f98b5; }
.mabc-input:focus { background: #fff; border-color: var(--mc-azul); box-shadow: 0 0 0 3px rgba(61, 139, 217, 0.22); }
.mabc-input.definido { background: rgba(214, 233, 252, 0.95); border-color: var(--mc-azul-claro); }
.mabc-input.definido:focus { background: #fff; border-color: var(--mc-azul); }

/* Ícone "Meu local" dentro do input de Origem */
.mabc-input-acao {
    position: absolute; right: 4px; top: 4px; width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 10px; background: transparent; color: var(--mc-marinho-2); cursor: pointer;
    transition: background .15s;
}
.mabc-input-acao:hover { background: rgba(143, 195, 245, 0.4); }
.mabc-input-acao.carregando { animation: mabc-pisca 1s ease-in-out infinite; }
@keyframes mabc-pisca { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

/* Dropdown de sugestões */
.mabc-dropdown {
    position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 10;
    margin: 0; padding: 6px; list-style: none; max-height: 280px; overflow-y: auto;
    background: rgba(255, 255, 255, 0.98); border-radius: 16px;
    box-shadow: 0 12px 32px rgba(11, 37, 69, 0.22), 0 0 0 1px rgba(11, 37, 69, 0.05);
}
.mabc-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; cursor: pointer; }
.mabc-item.ativo { background: var(--mc-azul-palido); }
.mabc-item-icone {
    width: 30px; height: 30px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: var(--mc-azul-palido); color: var(--mc-marinho-2);
}
.mabc-item.ativo .mabc-item-icone { background: var(--mc-marinho); color: #fff; }
.mabc-item-textos { display: flex; flex-direction: column; min-width: 0; }
.mabc-item-titulo { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mabc-item-detalhes { font-size: 12px; color: var(--mc-texto-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Avisos */
.mabc-aviso { margin-top: 8px; padding: 7px 10px; font-size: 12.5px; line-height: 1.4; color: #5b21b6; background: #f5f3ff; border-radius: 12px; }
.mabc-aviso-zona { margin-top: 8px; padding: 7px 10px; font-size: 12.5px; line-height: 1.4; color: #991b1b; background: #fee2e2; border-radius: 12px; }
.mabc-erro { margin-top: 8px; padding: 7px 10px; font-size: 12.5px; line-height: 1.4; color: #92400e; background: #fef3c7; border-radius: 12px; }
.mabc-selo { padding: 2px 8px; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: #92400e; background: #fef3c7; border-radius: 999px; }

/* Opções de rota */
.mabc-opcoes { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; padding-bottom: 2px; }
.mabc-opcao {
    flex: 1 0 auto; min-width: 100px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 7px 11px; text-align: left; font: inherit; color: var(--mc-marinho-2); background: rgba(228, 240, 252, 0.7);
    border: 2px solid transparent; border-radius: 14px; cursor: pointer; transition: background .15s, border-color .15s;
}
.mabc-opcao:hover { background: var(--mc-azul-palido); }
.mabc-opcao.ativo { background: #fff; border-color: var(--mc-marinho-2); }
.mabc-opcao-tempo { font-size: 15.5px; font-weight: 700; color: var(--mc-marinho); }
.mabc-opcao-dist { font-size: 12.5px; color: var(--mc-texto-2); }
.mabc-tag { margin-top: 2px; padding: 1px 7px; font-size: 10.5px; font-weight: 700; color: var(--mc-marinho); background: var(--mc-azul-claro); border-radius: 999px; }
.mabc-tag.desvio { color: #92400e; background: #fef3c7; }

/* Rótulos de tempo sobre as rotas no mapa */
.mabc-rotulo-rota { background: none; border: none; }
.mabc-rotulo-rota span {
    position: absolute; transform: translate(-50%, -50%); white-space: nowrap; cursor: pointer;
    padding: 4px 10px; font: 700 13px system-ui, sans-serif; color: var(--mc-marinho-2); background: #fff;
    border-radius: 999px; box-shadow: 0 2px 8px rgba(11, 37, 69, 0.3);
}
.mabc-rotulo-rota span.sel { color: #fff; background: var(--mc-marinho); }

/* Itinerário */
.mabc-alca { display: none; align-self: center; width: 100%; padding: 0 0 8px; border: none; background: none; cursor: pointer; justify-content: center; }
.mabc-alca span { width: 40px; height: 4px; border-radius: 4px; background: var(--mc-azul-claro); }
.mabc-itin-topo { display: flex; align-items: center; gap: 2px; margin-bottom: 6px; }
.mabc-itin-titulo { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.mabc-itin-titulo span:not(.mabc-seta-txt) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mabc-seta-txt { color: var(--mc-azul); flex-shrink: 0; }
.mabc-resumo { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-top: 8px; padding: 9px 12px; background: rgba(228, 240, 252, 0.7); border-radius: 14px; }
.mabc-resumo-tempo { font-size: 21px; font-weight: 700; color: var(--mc-marinho); }
.mabc-resumo-dist { font-size: 14px; color: var(--mc-texto-2); }
.mabc-carregando { margin-top: 12px; font-size: 14px; color: var(--mc-texto-2); text-align: center; }
.mabc-passos { list-style: none; margin: 10px 0 0; padding: 0; overflow-y: auto; flex: 1 1 auto; min-height: 0; overscroll-behavior: contain; }
.mabc-passo { display: flex; align-items: center; gap: 12px; padding: 8px 6px; border-radius: 14px; }
.mabc-passo + .mabc-passo { border-top: 1px solid rgba(11, 37, 69, 0.06); }
.mabc-passo.ativo { background: var(--mc-azul-palido); }
.mabc-passo-icone {
    width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: var(--mc-azul-palido); color: var(--mc-marinho-2);
}
.mabc-passo-textos { display: flex; flex-direction: column; min-width: 0; }
.mabc-passo-titulo { font-size: 14px; font-weight: 600; line-height: 1.3; }
.mabc-passo-detalhe { font-size: 12.5px; color: var(--mc-texto-2); }

/* Navegação */
.mabc-nav { width: min(372px, calc(100% - 100px)); } /* deixa espaço para o botão 2D/3D */
.mabc-nav-banner { display: flex; align-items: center; gap: 12px; padding: 11px; color: #fff; background: linear-gradient(135deg, var(--mc-marinho-2), var(--mc-marinho)); border-radius: 16px; }
.mabc-nav-banner.chegou { background: linear-gradient(135deg, #1f8a5b, #14633f); }
.mabc-nav-icone { width: 46px; height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(143, 195, 245, 0.25); border-radius: 13px; }
.mabc-nav-dist { font-size: 13px; opacity: .9; }
.mabc-nav-texto { font-size: 16.5px; font-weight: 700; line-height: 1.25; }
.mabc-nav-resumo { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; font-size: 14px; color: var(--mc-texto-2); }
.mabc-nav-resumo strong { font-size: 18px; color: var(--mc-marinho); }
.mabc-fora { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding: 7px 10px; font-size: 13px; color: #92400e; background: #fef3c7; border-radius: 12px; }
.mabc-fora button { border: none; border-radius: 9px; padding: 6px 10px; font: inherit; font-weight: 600; color: #fff; background: #d97706; cursor: pointer; white-space: nowrap; }
.mabc-nav-acoes { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.mabc-nav .mabc-passos { max-height: 38vh; }

/* Alerta de bloqueio */
.mabc-alerta {
    position: absolute; bottom: calc(28px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100% - 32px)); box-sizing: border-box; display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; font-size: 14px; color: #991b1b; background: #fee2e2;
    border: 2px solid #ef4444; border-radius: 16px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

/* Seta do motorista (o Leaflet posiciona a raiz; giramos só o filho .mabc-seta-rot) */
.mabc-seta { background: none; border: none; }
.mabc-seta-wrap { position: relative; width: 44px; height: 44px; }
.mabc-seta-pulso { position: absolute; inset: 6px; border-radius: 50%; background: rgba(61, 139, 217, 0.35); animation: mabc-pulso 1.8s ease-out infinite; }
.mabc-seta-rot { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transition: transform .35s ease-out; will-change: transform; }
.mabc-seta-rot svg { width: 36px; height: 36px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45)); }
@keyframes mabc-pulso { 0% { transform: scale(.6); opacity: .9; } 100% { transform: scale(1.7); opacity: 0; } }

/* Mobile: busca/navegação no topo, itinerário como "bottom sheet" */
@media (max-width: 640px) {
    .mabc-painel, .mabc-itin { left: 8px; right: 8px; width: auto; top: calc(8px + env(safe-area-inset-top, 0px)); border-radius: 22px; }
    .mabc-nav { width: auto; max-height: calc(100% - 120px); }
    .mabc-itin {
        top: auto; bottom: calc(26px + env(safe-area-inset-bottom, 0px)); /* deixa o crédito do OSM visível */
        max-height: 58%; border-radius: 24px;
    }
    .mabc-alca { display: flex; }
    .mabc-nav .mabc-passos { max-height: 30vh; }
    /* O botão 2D/3D sai do topo (ocupado pelo painel) e vai para o canto inferior direito */
    .mabc-btn-camera { top: auto; right: 12px; bottom: calc(44px + env(safe-area-inset-bottom, 0px)); }
    .leaflet-control-zoom { display: none; } /* no celular, zoom por gesto de pinça */
}
`;