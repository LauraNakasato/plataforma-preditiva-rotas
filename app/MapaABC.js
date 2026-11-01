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
const RAIO_CHEGADA_M = 30;      // a partir daqui consideramos que o usuário chegou
const LIMITE_FORA_ROTA_M = 60;  // distância mínima da rota para avisar "fora da rota"

// Interruptor da integração GTFS. Veja os pontos [GTFS-1] e [GTFS-2] abaixo.
const TRANSPORTE_PUBLICO_REAL = false;

// Cada modo aponta para uma instância OSRM com o perfil correspondente
// (o servidor router.project-osrm.org responde sempre como carro).
const MODOS = {
    driving: {
        rotulo: 'Carro', icone: 'car',
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',
        estilo: { color: '#2563eb', weight: 6, opacity: 0.9 }
    },
    foot: {
        rotulo: 'A pé', icone: 'walk',
        servico: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        estilo: { color: '#16a34a', weight: 6, opacity: 0.95, dashArray: '1, 12', lineCap: 'round' }
    },
    bike: {
        rotulo: 'Bicicleta', icone: 'bike',
        servico: 'https://routing.openstreetmap.de/routed-bike/route/v1',
        estilo: { color: '#ea580c', weight: 6, opacity: 0.9 }
    },
    transit: {
        rotulo: 'Transporte público', icone: 'bus',
        // Enquanto não há GTFS, o OSRM só fornece o "corredor" viário; os trechos são simulados.
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',
        estilo: { color: '#7c3aed', weight: 6, opacity: 0.35 },
        aviso:
            'Rota mista simulada: os trechos são estimados a partir do traçado viário. Linhas, horários e baldeações reais exigem uma API GTFS.'
    }
};

// Estilos dos trechos da Rota Mista desenhados sobre o mapa
const ESTILOS_TRECHO = {
    caminhada: { color: '#16a34a', weight: 6, opacity: 0.95, dashArray: '1, 12', lineCap: 'round' },
    onibus: { color: '#7c3aed', weight: 7, opacity: 0.95 },
    trem: { color: '#0ea5e9', weight: 7, opacity: 0.95 }
};
const CORES_TRECHO = { caminhada: '#16a34a', onibus: '#7c3aed', trem: '#0ea5e9', chegada: '#dc2626' };

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
    list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z'
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

// Distância (m) de um ponto a um segmento, em projeção plana local.
function distanciaPontoSegmentoM(p, a, b) {
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
    return Math.hypot(ax + t * dx, ay + t * dy);
}

// Primeira zona de risco atravessada pela rota (ou null). Independe do modo de transporte.
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

// acum[i] = distância (m) do início da rota até a coordenada i
function acumularDistancias(coords) {
    const acum = [0];
    for (let i = 1; i < coords.length; i++) acum.push(acum[i - 1] + coords[i - 1].distanceTo(coords[i]));
    return acum;
}

// Primeiro índice cuja distância acumulada é >= d
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

// Posição do usuário em relação à rota: trecho mais próximo, próximo passo, restante, desvio.
function calcularProgresso(rota, lat, lng, precisao = 0) {
    const c = rota?.coordenadas;
    if (!c || c.length < 2 || !rota.passos.length) return null;

    const p = { lat, lng };
    let melhor = Infinity;
    let idx = 0;
    for (let i = 0; i < c.length - 1; i++) {
        const d = distanciaPontoSegmentoM(p, c[i], c[i + 1]);
        if (d < melhor) { melhor = d; idx = i; }
    }

    const percorrido = rota.acumulada[idx];
    const restanteM = Math.max(0, rota.total - percorrido);
    const restanteS = rota.total ? rota.tempo * (restanteM / rota.total) : 0;

    let idxProximo = rota.passos.findIndex((s) => s.indiceCoord > idx);
    if (idxProximo === -1) idxProximo = rota.passos.length - 1;
    const alvo = rota.passos[idxProximo];
    const distProximo = Math.max(
        0,
        rota.acumulada[Math.min(alvo.indiceCoord, rota.acumulada.length - 1)] - percorrido
    );

    return {
        idxProximo, distProximo, restanteM, restanteS,
        desvioM: melhor,
        foraDaRota: melhor > Math.max(LIMITE_FORA_ROTA_M, precisao * 1.5)
    };
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

// Giro da seta (graus) conforme o tipo de manobra do LRM
function rotacaoDaManobra(tipo) {
    const mapa = {
        Straight: 0, Head: 0, Continue: 0, StartAt: 0,
        SlightRight: 45, Right: 90, SharpRight: 135,
        TurnAround: 180,
        SharpLeft: -135, Left: -90, SlightLeft: -45,
        Roundabout: 90
    };
    return mapa[tipo] ?? 0;
}

function IconeDoPasso({ passo, size = 20 }) {
    if (passo.tipo === 'trecho') {
        const nome = { caminhada: 'walk', onibus: 'bus', trem: 'train' }[passo.modalidade] || 'pin';
        return <Icone nome={nome} size={size} />;
    }
    if (passo.manobra === 'DestinationReached') return <Icone nome="pin" size={size} />;
    return <Icone nome="arrow" size={size} rotacao={rotacaoDaManobra(passo.manobra)} />;
}

// ───────────────────────── Transporte público: Rota Mista ─────────────────────────
//
// Formato que a interface espera de QUALQUER fonte (simulada ou GTFS real):
//   { simulado: boolean, trechos: Trecho[] }
//   Trecho = {
//     modalidade: 'caminhada' | 'onibus' | 'trem',   // trem = trem/metrô/monotrilho
//     texto:      string,                            // ação ("Embarque no ônibus…")
//     linha:      string | null,                     // "Linha 10 – Turquesa", "6020-10"…
//     de, para:   string | undefined,                // nomes das paradas/estações
//     distanciaM: number, duracaoS: number,
//     coordenadas?: L.LatLng[]                       // geometria própria (API real)
//   }

async function obterRotaTransportePublico({ origem, destino, rotaViaria }) {
    if (!TRANSPORTE_PUBLICO_REAL) return simularRotaMista(rotaViaria);

    // ┌─ [GTFS-1] SUBSTITUA ESTE BLOCO PELA SUA API GTFS ────────────────────────
    // 1. Crie um Route Handler (app/api/transporte-publico/route.js) que receba
    //    ?from=lat,lng&to=lat,lng e chame a API ESCOLHIDA NO SERVIDOR, para a chave
    //    nunca ir para o bundle do navegador.
    // 2. Mude TRANSPORTE_PUBLICO_REAL para true (lá em cima).
    // 3. Aqui, chame o seu Route Handler e converta a resposta para o formato
    //    { simulado: false, trechos } descrito acima, SEMPRE com `coordenadas` em
    //    cada trecho (é a geometria real que será desenhada no mapa).
    //
    //  OpenTripPlanner (hospedado por você, com GTFS + OSM da região):
    //    GET {OTP}/otp/routers/default/plan?fromPlace=lat,lng&toPlace=lat,lng&mode=TRANSIT,WALK&date=…&time=…
    //    plan.itineraries[0].legs[] → cada leg tem:
    //      mode ('WALK' | 'BUS' | 'RAIL' | 'SUBWAY' | 'TRAM'), routeShortName,
    //      from.name, to.name, distance (m), duration (s), legGeometry.points
    //    Mapeamento: WALK→'caminhada'; BUS→'onibus'; RAIL/SUBWAY/TRAM→'trem';
    //                coordenadas = decodificarPolyline(leg.legGeometry.points)
    //    (parâmetros mudam entre OTP 1.x e 2.x: confira a documentação da sua versão)
    //
    //  Google Routes API:
    //    POST https://routes.googleapis.com/directions/v2:computeRoutes
    //    headers: X-Goog-Api-Key e X-Goog-FieldMask (liste os campos de legs/steps que usar)
    //    body: { origin:{location:{latLng:{latitude,longitude}}}, destination:{…}, travelMode:'TRANSIT' }
    //    routes[0].legs[0].steps[] → cada step tem:
    //      travelMode ('WALK' | 'TRANSIT'), distanceMeters, staticDuration (ex.: "420s"),
    //      polyline.encodedPolyline,
    //      transitDetails.transitLine { nameShort, vehicle.type } e
    //      transitDetails.stopDetails { departureStop.name, arrivalStop.name }
    //    Mapeamento: WALK→'caminhada'; vehicle.type BUS→'onibus'; SUBWAY/HEAVY_RAIL/…→'trem'.
    //
    //  Dados GTFS na região: verifique os feeds publicados por SPTrans, Metrô/CPTM e EMTU.
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

// Converte trechos em "passos" (mesma estrutura do itinerário de ruas), com o índice da
// coordenada onde cada trecho começa — assim a navegação GPS funciona igual nos dois casos.
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

// Troca dinamicamente o servidor OSRM e o estilo da linha conforme o modo.
function aplicarModoNoRouter(routing, modo) {
    const cfg = MODOS[modo];
    const router = routing.getRouter?.() || routing._router;
    if (router) router.options.serviceUrl = cfg.servico;
    routing.options.lineOptions = { styles: [cfg.estilo] };
}

function ajustarMapa(map, coords) {
    if (!map || !coords?.length) return;
    const mobile = window.innerWidth <= 640;
    // O padding evita que o painel (lateral no desktop, "bottom sheet" no mobile) cubra a rota
    map.fitBounds(
        L.latLngBounds(coords),
        mobile
            ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, 300] }
            : { paddingTopLeft: [430, 40], paddingBottomRight: [40, 40] }
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
    // Refs do Leaflet
    const mapRef = useRef(null);
    const routingRef = useRef(null);
    const formatterRef = useRef(null);
    const camadaMarcadoresRef = useRef(null);
    const camadaMistaRef = useRef(null);
    const marcadorUsuarioRef = useRef(null);
    const precisaoRef = useRef(null);

    // Refs de lógica (evitam closures velhas nos eventos do Leaflet e do GPS)
    const zonasRiscoRef = useRef([]);
    const tentativaRef = useRef(0); // 0 = rota direta, 1 = desvio já tentado
    const rotaRef = useRef(null);   // { inicio, fim } da rota pedida
    const modoRef = useRef('driving');
    const faseRef = useRef('busca');
    const rotaAtualRef = useRef(null);
    const reqRef = useRef(0);
    const seguirRef = useRef(true);
    const ultimaPosRef = useRef(null);
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
    const [fase, setFase] = useState('busca'); // 'busca' | 'itinerario' | 'navegando'
    const [rotaAtual, setRotaAtual] = useState(null);
    const [listaAberta, setListaAberta] = useState(true);
    const [seguir, setSeguirState] = useState(true);
    const [progresso, setProgresso] = useState(null);
    const [chegou, setChegou] = useState(false);

    const setters = { origem: setOrigem, destino: setDestino };

    useEffect(() => { modoRef.current = modo; }, [modo]);
    useEffect(() => { faseRef.current = fase; }, [fase]);
    useEffect(() => { rotaAtualRef.current = rotaAtual; }, [rotaAtual]);

    function definirSeguir(v) {
        seguirRef.current = v;
        setSeguirState(v);
    }

    // Sai do modo "busca" quando há rota final e enquadra o mapa (sem mexer no zoom durante a navegação)
    function entrarNoItinerario(coords) {
        if (faseRef.current !== 'navegando') ajustarMapa(mapRef.current, coords);
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

    // ───── Inicialização do mapa, routing e zonas de risco ─────
    useEffect(() => {
        if (typeof window === 'undefined' || mapRef.current) return;

        let cancelado = false;

        const map = L.map('mapa-container', { zoomControl: false }).setView(
            [CENTRO_ABC.lat, CENTRO_ABC.lng], 13
        );
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        mapRef.current = map;

        // Camada própria (acima da linha do LRM) para os trechos da Rota Mista
        map.createPane('mista');
        map.getPane('mista').style.zIndex = 450;

        const camadaZonas = L.layerGroup().addTo(map);
        camadaMarcadoresRef.current = L.layerGroup().addTo(map);
        camadaMistaRef.current = L.layerGroup().addTo(map);

        // Gera o texto das instruções (as instruções cruas do LRM não trazem `text`)
        formatterRef.current = new L.Routing.Formatter({ language: 'pt' });

        // Arrastar o mapa durante a navegação desliga o "seguir"
        map.on('dragstart', () => {
            if (seguirRef.current) {
                seguirRef.current = false;
                setSeguirState(false);
            }
        });

        const routing = L.Routing.control({
            waypoints: [],
            router: L.Routing.osrmv1({
                serviceUrl: MODOS.driving.servico,
                profile: 'driving',
                useHints: false
            }),
            language: 'pt',
            show: false,                // interface nativa oculta
            showAlternatives: false,
            fitSelectedRoutes: false,   // o enquadramento é feito por ajustarMapa()
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            lineOptions: { styles: [MODOS.driving.estilo] },
            createMarker: () => null    // o waypoint de fuga permanece invisível
        }).addTo(map);
        routingRef.current = routing;

        routing.on('routesfound', (e) => {
            const rota = e.routes[0];
            const zona = encontrarColisao(rota.coordinates, zonasRiscoRef.current);

            // ── Rota limpa: monta o itinerário ──
            if (!zona) {
                setEmPerigo(false);
                setErroRota('');

                const coords = rota.coordinates;
                const acumulada = acumularDistancias(coords);
                const total = acumulada[acumulada.length - 1] || rota.summary.totalDistance;
                const base = {
                    coordenadas: coords, acumulada, total,
                    tempo: rota.summary.totalTime,
                    passos: [], trechos: null, simulado: false, carregando: false
                };
                const reqId = ++reqRef.current;

                if (modoRef.current === 'transit') {
                    // Placeholder enquanto a Rota Mista é montada (instantâneo na simulação; assíncrono com API real)
                    setRotaAtual({ ...base, carregando: true, simulado: true });
                    obterRotaTransportePublico({
                        origem: rotaRef.current?.inicio,
                        destino: rotaRef.current?.fim,
                        rotaViaria: base
                    })
                        .then((res) => {
                            if (reqId !== reqRef.current) return;
                            publicarRotaMista(res, coords);
                        })
                        .catch(() => {
                            if (reqId !== reqRef.current) return;
                            setRotaAtual(null);
                            setErroRota('Não foi possível montar a rota de transporte público.');
                        });
                } else {
                    // Instruções passo a passo (sem o WaypointReached do ponto de fuga)
                    const formatter = formatterRef.current;
                    const instrucoes = (rota.instructions || []).filter((i) => i.type !== 'WaypointReached');
                    base.passos = instrucoes.map((instr, k) => {
                        let texto;
                        try { texto = formatter.formatInstruction(instr, k); } catch { texto = null; }
                        return {
                            id: `m-${k}`,
                            tipo: 'manobra',
                            manobra: instr.type,
                            texto: texto || instr.road || 'Continue',
                            detalhe: instr.distance > 0 ? `por ${formatarDistancia(instr.distance)}` : '',
                            indiceCoord: instr.index
                        };
                    });
                    setRotaAtual(base);
                }

                entrarNoItinerario(coords);
                return;
            }

            // ── 1ª colisão: waypoint de fuga silencioso → OSRM recalcula contornando a água ──
            if (tentativaRef.current === 0 && rotaRef.current) {
                tentativaRef.current = 1;
                const { inicio, fim } = rotaRef.current;
                const pontoFuga = L.latLng(zona.lat + OFFSET_FUGA, zona.lng + OFFSET_FUGA);
                routing.setWaypoints([inicio, pontoFuga, fim]);
                return;
            }

            // ── Recálculo também colidiu → alerta vermelho ──
            reqRef.current++;
            setRotaAtual(null);
            setEmPerigo(true);
        });

        routing.on('routingerror', () => {
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
            camadaMistaRef.current = null;
            marcadorUsuarioRef.current = null;
            precisaoRef.current = null;
        };
    }, []);

    // Limpeza geral ao desmontar: timers, buscas, GPS e wake lock
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

    // ───── Marcadores de origem/destino ─────
    useEffect(() => {
        const camada = camadaMarcadoresRef.current;
        if (!camada) return;
        camada.clearLayers();
        if (origem.coord) {
            L.circleMarker([origem.coord.lat, origem.coord.lng], {
                radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1
            }).bindTooltip('Origem').addTo(camada);
        }
        if (destino.coord) {
            L.circleMarker([destino.coord.lat, destino.coord.lng], {
                radius: 9, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1
            }).bindTooltip('Destino').addTo(camada);
        }
    }, [origem.coord, destino.coord]);

    // ───── Trechos da Rota Mista desenhados sobre o mapa ─────
    useEffect(() => {
        const camada = camadaMistaRef.current;
        if (!camada) return;
        camada.clearLayers();
        if (!rotaAtual?.trechos) return;

        let d = 0;
        rotaAtual.trechos.forEach((t) => {
            // Com API real, cada trecho traz a própria geometria; na simulação fatiamos o corredor viário
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

    // ───── Cálculo de rota ─────
    function calcular(inicio, fim) {
        const routing = routingRef.current;
        if (!routing) return;

        setErroRota('');
        setEmPerigo(false);
        setCampoAberto(null);

        tentativaRef.current = 0;
        rotaRef.current = { inicio, fim };

        // [GTFS-2] Com API real, o OSRM não é usado no modo transporte público:
        // a geometria vem dos próprios trechos (veja carregarRotaMistaReal).
        if (modoRef.current === 'transit' && TRANSPORTE_PUBLICO_REAL) {
            carregarRotaMistaReal(inicio, fim);
            return;
        }

        routing.setWaypoints([inicio, fim]);
    }

    // [GTFS-2] Caminho 100% GTFS: sem OSRM, geometria vinda da API.
    // Obs.: o desvio de alagamento (waypoint de fuga) não se aplica aqui, pois o trajeto é
    // definido pela API; se quiser, valide os trechos a pé com encontrarColisao().
    async function carregarRotaMistaReal(inicio, fim) {
        const reqId = ++reqRef.current;
        routingRef.current?.setWaypoints([]); // remove a linha do OSRM
        setRotaAtual((r) => (r ? { ...r, carregando: true } : r));

        try {
            const res = await obterRotaTransportePublico({ origem: inicio, destino: fim, rotaViaria: null });
            if (reqId !== reqRef.current) return;

            const coordenadas = [];
            res.trechos.forEach((t) => {
                t.indiceInicio = coordenadas.length; // onde o trecho começa na polilinha única
                coordenadas.push(...(t.coordenadas || []));
            });

            publicarRotaMista(res, coordenadas);
            entrarNoItinerario(coordenadas);
        } catch (err) {
            if (reqId !== reqRef.current) return;
            console.error(err);
            setRotaAtual(null);
            setErroRota('Não foi possível montar a rota de transporte público.');
        }
    }

    // Gatilho: Enter com origem e destino definidos
    function tracarRota() {
        if (!origem.coord || !destino.coord) {
            setErroRota('Escolha origem e destino na lista de sugestões e pressione Enter.');
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
        reqRef.current++;
        routingRef.current?.setWaypoints([]);
        rotaRef.current = null;
        tentativaRef.current = 0;
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
        } catch { /* opcional: ignora se o navegador negar */ }
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
        soltarWakeLock();
    }

    function aoReceberPosicao(pos) {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        ultimaPosRef.current = { lat, lng };

        const map = mapRef.current;
        if (!map) return;
        const ll = L.latLng(lat, lng);

        if (!marcadorUsuarioRef.current) {
            marcadorUsuarioRef.current = L.marker(ll, {
                icon: L.divIcon({
                    className: 'mabc-gps',
                    html: '<span class="mabc-gps-pulso"></span><span class="mabc-gps-ponto"></span>',
                    iconSize: [28, 28], iconAnchor: [14, 14]
                }),
                interactive: false, zIndexOffset: 1000
            }).addTo(map);
            precisaoRef.current = L.circle(ll, {
                radius: accuracy, stroke: false, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false
            }).addTo(map);
        } else {
            marcadorUsuarioRef.current.setLatLng(ll);
            precisaoRef.current.setLatLng(ll).setRadius(accuracy);
        }

        // Centraliza no usuário enquanto "seguir" estiver ligado
        if (seguirRef.current) map.setView(ll, Math.max(map.getZoom(), 17), { animate: true });

        const prog = calcularProgresso(rotaAtualRef.current, lat, lng, accuracy);
        if (!prog) return;
        setProgresso(prog);

        if (prog.restanteM <= RAIO_CHEGADA_M) {
            setChegou(true);
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            soltarWakeLock();
        }
    }

    function aoErroPosicao(err) {
        const mensagens = {
            1: 'Permissão de localização negada. Libere o acesso nas configurações do navegador.',
            2: 'Não foi possível obter sua localização agora.',
            3: 'Tempo esgotado ao obter sua localização.'
        };
        setErroRota(mensagens[err.code] || 'Erro ao acessar o GPS.');
        if (err.code === 1) encerrarNavegacao();
    }

    function iniciarNavegacao() {
        const rota = rotaAtualRef.current;
        if (!rota || rota.carregando) return;

        // A Geolocation API exige contexto seguro (HTTPS ou localhost)
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setErroRota('Seu navegador não suporta geolocalização.');
            return;
        }

        setErroRota('');
        setChegou(false);
        setProgresso(null);
        setListaAberta(false);
        definirSeguir(true);
        setFase('navegando');
        pedirWakeLock();

        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(aoReceberPosicao, aoErroPosicao, {
            enableHighAccuracy: true, maximumAge: 1000, timeout: 20000
        });
    }

    function encerrarNavegacao() {
        pararGPS();
        setChegou(false);
        setProgresso(null);
        setListaAberta(true);
        setFase((f) => (f === 'navegando' ? 'itinerario' : f));
    }

    function recentralizar() {
        definirSeguir(true);
        const pos = ultimaPosRef.current;
        if (pos) mapRef.current?.setView([pos.lat, pos.lng], Math.max(mapRef.current.getZoom(), 17), { animate: true });
    }

    // Fora da rota: recalcula a partir da posição atual (mantém o desvio de alagamentos)
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
                        <Icone nome={m.icone} size={22} />
                    </button>
                ))}
                {comLimpar && (
                    <button type="button" className="mabc-icone-btn" onClick={limparRota} aria-label="Limpar rota" title="Limpar">
                        <Icone nome="close" size={20} />
                    </button>
                )}
            </div>
        );
    }

    function renderCampo(campo, estado, placeholder) {
        const lista = sugestoes[campo];
        const mostrar = campoAberto === campo && lista.length > 0;

        return (
            <div className="mabc-campo">
                <input
                    type="text"
                    className={`mabc-input${estado.coord ? ' definido' : ''}`}
                    value={estado.texto}
                    placeholder={placeholder}
                    autoComplete="off" spellCheck={false} aria-label={placeholder}
                    onChange={(e) => handleChange(campo, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, campo)}
                    onFocus={() => setCampoAberto(campo)}
                    onBlur={() => setCampoAberto(null)}
                />

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
        <div className="mabc-root">
            <style>{CSS}</style>

            {/* Camada 0: mapa (todos os panes/popups/controles do Leaflet ficam presos aqui dentro) */}
            <div id="mapa-container" className="mabc-mapa" />

            {/* Camada 1000: overlay isolado; só os painéis recebem cliques */}
            <div className="mabc-overlay">
                {/* ───── Fase 1: busca ───── */}
                {fase === 'busca' && (
                    <div className="mabc-painel">
                        {renderModos(true)}

                        <div className="mabc-campos">
                            <div className="mabc-trilho" aria-hidden="true">
                                <span className="mabc-bolinha" />
                                <span className="mabc-linha" />
                                <span className="mabc-pino"><Icone nome="pin" size={20} /></span>
                            </div>
                            <div className="mabc-inputs">
                                {renderCampo('origem', origem, 'Escolha o ponto de partida')}
                                {renderCampo('destino', destino, 'Escolha o destino')}
                            </div>
                            <button type="button" className="mabc-icone-btn" onClick={inverter} aria-label="Inverter origem e destino" title="Inverter">
                                <Icone nome="swap" size={22} />
                            </button>
                        </div>

                        {avisoModo && <div className="mabc-aviso">{avisoModo}</div>}
                        {erroRota && <div className="mabc-erro">{erroRota}</div>}

                        {rotaAtual && (
                            <button type="button" className="mabc-btn-sec" onClick={() => setFase('itinerario')}>
                                <Icone nome="list" size={18} /> Ver passos da rota
                            </button>
                        )}

                        <div className="mabc-dica">
                            Escolha as sugestões e pressione <kbd>Enter</kbd> para traçar a rota
                        </div>
                    </div>
                )}

                {/* ───── Fase 2: itinerário (inputs ocultos) ───── */}
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
                                <Icone nome="back" size={22} />
                            </button>
                            <div className="mabc-itin-titulo">
                                <span>{origem.texto || 'Origem'}</span>
                                <span className="mabc-seta">→</span>
                                <span>{destino.texto || 'Destino'}</span>
                            </div>
                            <button type="button" className="mabc-icone-btn" onClick={limparRota} aria-label="Limpar rota" title="Limpar">
                                <Icone nome="close" size={20} />
                            </button>
                        </div>

                        {renderModos(false)}

                        <div className="mabc-resumo">
                            {rotaAtual.carregando ? (
                                <span className="mabc-resumo-dist">Montando rota mista…</span>
                            ) : (
                                <>
                                    <span className="mabc-resumo-tempo" style={{ color: cfgModo.estilo.color }}>
                                        {formatarTempo(rotaAtual.tempo)}
                                    </span>
                                    <span className="mabc-resumo-dist">{formatarDistancia(rotaAtual.total)}</span>
                                    {rotaAtual.simulado && <span className="mabc-selo">Simulado</span>}
                                </>
                            )}
                        </div>

                        {avisoModo && <div className="mabc-aviso">{avisoModo}</div>}
                        {erroRota && <div className="mabc-erro">{erroRota}</div>}

                        <button
                            type="button" className="mabc-btn-prim"
                            onClick={iniciarNavegacao} disabled={rotaAtual.carregando}
                        >
                            <Icone nome="navigation" size={18} /> Iniciar navegação
                        </button>

                        {listaAberta && (
                            <ListaPassos passos={rotaAtual.passos} carregando={rotaAtual.carregando} />
                        )}
                    </div>
                )}

                {/* ───── Fase 3: navegação com GPS ───── */}
                {fase === 'navegando' && rotaAtual && (
                    <div className="mabc-painel mabc-nav">
                        {chegou ? (
                            <div className="mabc-nav-banner chegou">
                                <span className="mabc-nav-icone"><Icone nome="pin" size={32} /></span>
                                <div>
                                    <div className="mabc-nav-texto">Você chegou ao destino</div>
                                    <div className="mabc-nav-dist">{destino.texto}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="mabc-nav-banner">
                                <span className="mabc-nav-icone">
                                    {proximoPasso ? <IconeDoPasso passo={proximoPasso} size={32} /> : <Icone nome="locate" size={32} />}
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
                            {!seguir && (
                                <button type="button" className="mabc-btn-sec" onClick={recentralizar}>
                                    <Icone nome="locate" size={18} /> Recentralizar
                                </button>
                            )}
                            <button type="button" className="mabc-btn-sec" onClick={() => setListaAberta((v) => !v)}>
                                <Icone nome="list" size={18} /> Passos
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

                {/* Alerta vermelho flutuante: o desvio também falhou */}
                {emPerigo && (
                    <div className="mabc-alerta" role="alert">
                        <Icone nome="warning" size={22} />
                        <span><strong>ALERTA:</strong> A área está bloqueada e não há desvios seguros.</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ───────────────────────── CSS ─────────────────────────
const CSS = `
/* Pilha de camadas: mapa (0) → overlay (1000). Nada do Leaflet escapa do contexto do mapa. */
.mabc-root {
    position: relative; isolation: isolate; width: 100%;
    height: 100vh; height: 100dvh; overflow: hidden; background: #e5e7eb;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a;
}
.mabc-mapa { position: absolute; inset: 0; z-index: 0; }
.mabc-overlay { position: absolute; inset: 0; z-index: 1000; pointer-events: none; }
.mabc-overlay > * { pointer-events: auto; }
.leaflet-routing-container { display: none !important; }
.leaflet-routing-add-waypoint { display: none !important; }

/* Painel base (glassmorphism) */
.mabc-painel {
    position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); left: 16px;
    width: min(390px, calc(100% - 32px)); box-sizing: border-box; padding: 12px;
    background: rgba(255, 255, 255, 0.93);
    -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 20px;
    box-shadow: 0 10px 32px rgba(15, 23, 42, 0.18), 0 1px 3px rgba(15, 23, 42, 0.08);
}
.mabc-itin, .mabc-nav {
    display: flex; flex-direction: column;
    max-height: calc(100% - 32px - env(safe-area-inset-top, 0px));
}

/* Modos de transporte e botões */
.mabc-modos { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
.mabc-modo {
    flex: 1; height: 42px; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 12px; background: transparent; color: #64748b; cursor: pointer;
    transition: background .15s, color .15s;
}
.mabc-modo:hover { background: #f1f5f9; }
.mabc-modo.ativo { background: #dbeafe; color: #1d4ed8; }
.mabc-icone-btn {
    width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 50%; background: transparent; color: #64748b; cursor: pointer; transition: background .15s;
}
.mabc-icone-btn:hover { background: #f1f5f9; }
.mabc-btn-prim, .mabc-btn-sec, .mabc-btn-enc {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 44px; padding: 0 16px; border: none; border-radius: 12px; cursor: pointer;
    font: inherit; font-size: 15px; font-weight: 600; transition: filter .15s, background .15s;
}
.mabc-btn-prim { width: 100%; margin-top: 10px; background: #2563eb; color: #fff; }
.mabc-btn-prim:hover { filter: brightness(1.08); }
.mabc-btn-prim:disabled { background: #94a3b8; cursor: default; }
.mabc-btn-sec { background: #f1f5f9; color: #334155; }
.mabc-btn-sec:hover { background: #e2e8f0; }
.mabc-btn-enc { background: #fee2e2; color: #b91c1c; margin-left: auto; }
.mabc-btn-enc:hover { background: #fecaca; }
.mabc-painel > .mabc-btn-sec { width: 100%; margin-top: 10px; }

/* Inputs */
.mabc-campos { display: flex; align-items: center; gap: 8px; }
.mabc-trilho {
    width: 20px; height: 96px; display: flex; flex-direction: column; align-items: center;
    justify-content: space-between; padding: 14px 0 12px; box-sizing: border-box; flex-shrink: 0;
}
.mabc-bolinha { width: 12px; height: 12px; border-radius: 50%; border: 3px solid #2563eb; box-sizing: border-box; }
.mabc-linha { flex: 1; border-left: 2px dotted #94a3b8; margin: 4px 0; }
.mabc-pino { color: #dc2626; display: flex; }
.mabc-inputs { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.mabc-campo { position: relative; }
.mabc-input {
    width: 100%; height: 44px; box-sizing: border-box; padding: 0 14px;
    font-size: 16px; font-family: inherit; color: #0f172a;
    background: #f1f5f9; border: 1px solid transparent; border-radius: 12px; outline: none;
    transition: background .15s, border-color .15s, box-shadow .15s;
}
.mabc-input::placeholder { color: #94a3b8; }
.mabc-input:focus { background: #fff; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18); }
.mabc-input.definido { background: #f0fdf4; border-color: #bbf7d0; }
.mabc-input.definido:focus { background: #fff; border-color: #3b82f6; }

/* Dropdown de sugestões (dentro do overlay: sempre acima do mapa) */
.mabc-dropdown {
    position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 10;
    margin: 0; padding: 6px; list-style: none; max-height: 300px; overflow-y: auto;
    background: #fff; border-radius: 14px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.05);
}
.mabc-item { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 10px; cursor: pointer; }
.mabc-item.ativo { background: #eff6ff; }
.mabc-item-icone {
    width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: #f1f5f9; color: #64748b;
}
.mabc-item.ativo .mabc-item-icone { background: #dbeafe; color: #2563eb; }
.mabc-item-textos { display: flex; flex-direction: column; min-width: 0; }
.mabc-item-titulo { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mabc-item-detalhes { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Avisos */
.mabc-aviso { margin-top: 10px; padding: 8px 10px; font-size: 12.5px; line-height: 1.4; color: #5b21b6; background: #f5f3ff; border-radius: 10px; }
.mabc-erro { margin-top: 10px; padding: 8px 10px; font-size: 13px; color: #92400e; background: #fef3c7; border-radius: 10px; }
.mabc-dica { margin-top: 10px; font-size: 12px; color: #94a3b8; text-align: center; }
.mabc-dica kbd { padding: 1px 6px; font-family: inherit; font-size: 11px; color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; }
.mabc-selo { padding: 2px 8px; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: #92400e; background: #fef3c7; border-radius: 999px; }

/* Itinerário */
.mabc-alca { display: none; align-self: center; width: 100%; padding: 0 0 8px; border: none; background: none; cursor: pointer; justify-content: center; }
.mabc-alca span { width: 40px; height: 4px; border-radius: 4px; background: #cbd5e1; }
.mabc-itin-topo { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
.mabc-itin-titulo { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; }
.mabc-itin-titulo span:not(.mabc-seta) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mabc-seta { color: #94a3b8; flex-shrink: 0; }
.mabc-resumo { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; padding: 10px 12px; background: #f8fafc; border-radius: 12px; }
.mabc-resumo-tempo { font-size: 22px; font-weight: 700; }
.mabc-resumo-dist { font-size: 14px; color: #64748b; }
.mabc-carregando { margin-top: 12px; font-size: 14px; color: #64748b; text-align: center; }
.mabc-passos { list-style: none; margin: 12px 0 0; padding: 0; overflow-y: auto; flex: 1 1 auto; min-height: 0; overscroll-behavior: contain; }
.mabc-passo { display: flex; align-items: center; gap: 12px; padding: 9px 6px; border-radius: 12px; }
.mabc-passo + .mabc-passo { border-top: 1px solid #f1f5f9; }
.mabc-passo.ativo { background: #eff6ff; }
.mabc-passo-icone {
    width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: #f1f5f9; color: #334155;
}
.mabc-passo-textos { display: flex; flex-direction: column; min-width: 0; }
.mabc-passo-titulo { font-size: 14px; font-weight: 600; line-height: 1.3; }
.mabc-passo-detalhe { font-size: 12.5px; color: #64748b; }

/* Navegação */
.mabc-nav-banner { display: flex; align-items: center; gap: 14px; padding: 12px; color: #fff; background: #1d4ed8; border-radius: 14px; }
.mabc-nav-banner.chegou { background: #15803d; }
.mabc-nav-icone { width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.18); border-radius: 12px; }
.mabc-nav-dist { font-size: 13px; opacity: .9; }
.mabc-nav-texto { font-size: 17px; font-weight: 700; line-height: 1.25; }
.mabc-nav-resumo { display: flex; align-items: baseline; gap: 10px; margin-top: 10px; font-size: 14px; color: #64748b; }
.mabc-nav-resumo strong { font-size: 18px; color: #0f172a; }
.mabc-fora { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 8px 10px; font-size: 13px; color: #92400e; background: #fef3c7; border-radius: 10px; }
.mabc-fora button { border: none; border-radius: 8px; padding: 6px 10px; font: inherit; font-weight: 600; color: #fff; background: #d97706; cursor: pointer; white-space: nowrap; }
.mabc-nav-acoes { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.mabc-nav .mabc-passos { max-height: 38vh; }

/* Alerta de bloqueio */
.mabc-alerta {
    position: absolute; bottom: calc(28px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
    width: min(560px, calc(100% - 32px)); box-sizing: border-box; display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; font-size: 14px; color: #991b1b; background: #fee2e2;
    border: 2px solid #ef4444; border-radius: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

/* Marcador GPS */
.mabc-gps { background: none; border: none; }
.mabc-gps-pulso { position: absolute; left: 0; top: 0; width: 28px; height: 28px; border-radius: 50%; background: rgba(37, 99, 235, 0.35); animation: mabc-pulso 1.8s ease-out infinite; }
.mabc-gps-ponto { position: absolute; left: 6px; top: 6px; width: 16px; height: 16px; box-sizing: border-box; border-radius: 50%; background: #2563eb; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
@keyframes mabc-pulso { 0% { transform: scale(.5); opacity: .9; } 100% { transform: scale(1.6); opacity: 0; } }

/* Mobile: painel de busca/navegação no topo, itinerário como "bottom sheet" */
@media (max-width: 640px) {
    .mabc-painel { left: 8px; right: 8px; width: auto; top: calc(8px + env(safe-area-inset-top, 0px)); border-radius: 18px; }
    .mabc-itin {
        top: auto; bottom: calc(26px + env(safe-area-inset-bottom, 0px)); /* deixa a atribuição do OSM visível */
        max-height: 55%; border-radius: 22px;
    }
    .mabc-alca { display: flex; }
    .mabc-nav { max-height: calc(100% - 120px); }
    .mabc-nav .mabc-passos { max-height: 30vh; }
    .leaflet-control-zoom { display: none; } /* no celular, zoom por gesto de pinça */
}
`;