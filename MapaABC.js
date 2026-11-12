"use client";

import BotaoReporte from '../components/BotaoReporte';

// Importa os hooks do React utilizados para controlar estados,
// executar efeitos, guardar referências e memorizar funções.
import { useCallback, useEffect, useRef, useState } from 'react';

// Importa a biblioteca Leaflet, responsável pela criação e manipulação do mapa.
import L from 'leaflet';

// Importa os arquivos CSS necessários para a aparência do mapa e das rotas.
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Importa o plugin que permite criar rotas utilizando o Leaflet.
import 'leaflet-routing-machine';

// Importa a conexão com o Supabase, utilizada para acessar o banco de dados.
import { supabase } from './supabase';


// ───────────────────────── CONSTANTES ─────────────────────────

// Define as coordenadas geográficas do centro da região do ABC Paulista.
const CENTRO_ABC = { lat: -23.6552, lng: -46.5276 };

// Define os limites geográficos da área de pesquisa.
// A ordem dos valores é: longitude mínima, latitude mínima,
// longitude máxima e latitude máxima.
const BBOX_ABC = '-46.75,-23.95,-46.30,-23.50';

// Endereço da API Photon, utilizada para pesquisar locais e endereços.
const PHOTON_URL = 'https://photon.komoot.io/api/';

// Define o raio de 150 metros utilizado para identificar zonas de risco.
const RAIO_RISCO_M = 150;

// Define o deslocamento utilizado para calcular uma posição alternativa
// quando é necessário evitar uma região de risco.
const OFFSET_FUGA = 0.003;

// Define o intervalo de espera antes de executar uma pesquisa.
// Esse tempo evita várias requisições enquanto o usuário está digitando.
const DEBOUNCE_MS = 350;

// Determina a quantidade mínima de caracteres necessária para iniciar uma pesquisa.
const MIN_CHARS = 3;

// Define quantas rotas alternativas serão solicitadas ao serviço OSRM.
// Com isso, podem existir até três rotas: uma principal e duas alternativas.
const MAX_ALTERNATIVAS = 2;

// Define o número máximo de rotas que poderão ser apresentadas ao usuário.
const MAX_ROTAS = 3;

// Define o raio de 30 metros utilizado para identificar a chegada ao destino.
const RAIO_CHEGADA_M = 30;

// Define a distância máxima de 60 metros utilizada como referência
// para identificar se o usuário está fora da rota planejada.

const LIMITE_FORA_ROTA_M = 60;


// ───────────────────────── GPS: AJUSTE E SENSIBILIDADE ─────────────────────────

// Define a distância máxima entre o GPS e a rota para que o marcador
// seja ajustado visualmente para cima da linha da rota.
const LIMITE_SNAP_M = 35;

// Define o deslocamento mínimo de 3 metros necessário para atualizar
// a posição do marcador. Isso evita atualizações causadas por pequenas
// oscilações naturais do sinal GPS.
const LIMIAR_DESLOCAMENTO_M = 3;

// Define a variação mínima de 10 graus necessária para atualizar
// a direção de rotação do ícone que representa o usuário.
const LIMIAR_ANGULO_GRAUS = 10;


// ───────────────────────── CÂMERA IMERSIVA ─────────────────────────

// Define a distância de perspectiva utilizada para simular profundidade no mapa.
const PERSPECTIVA_PX = 1000;

// Define a inclinação do mapa no efeito tridimensional.
const INCLINACAO_GRAUS = 55;

// Define a posição vertical desejada para o marcador na tela.
// O valor 0 representa o topo e o valor 1 representa a parte inferior.
const MARCADOR_ALTURA_TELA = 0.75;

// Determina se o mapa será rotacionado de acordo com a direção do usuário.
// Quando ativado, a direção de deslocamento fica voltada para cima da tela.
const ROTACIONAR_MAPA_NA_VISAO_3D = true;

// Define o nível mínimo de aproximação do mapa na navegação convencional.
const ZOOM_NAVEGACAO = 17;

// Define o nível mínimo de aproximação utilizado na visualização imersiva.
const ZOOM_IMERSIVO = 18;

// Define a duração, em milissegundos, das transições visuais do mapa.
const DURACAO_TRANSICAO_MS = 800;


// ───────────────────────── PALETA DE CORES ─────────────────────────

// Define as cores principais utilizadas na interface do mapa.
// A paleta utiliza diferentes tonalidades de azul.
const COR_MARINHO = '#0b2545';
const COR_MARINHO_2 = '#134074';
const COR_AZUL = '#3d8bd9';
const COR_AZUL_CLARO = '#8fc3f5';


// Define se a integração com dados reais de transporte público via GTFS
// está ativada. Quando false, o transporte público utiliza uma rota simulada.
const TRANSPORTE_PUBLICO_REAL = false;


// ───────────────────────── MODOS DE TRANSPORTE ─────────────────────────

// Armazena as configurações de cada modalidade de transporte.
// Cada modalidade possui um nome, um ícone, um serviço de roteamento
// e um estilo visual próprio para representar a rota no mapa.
const MODOS = {
    // Configurações para deslocamento de carro.
    driving: {
        rotulo: 'Carro',
        icone: 'car',
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',
        estilo: {
            color: COR_MARINHO_2,
            weight: 6,
            opacity: 0.95
        }
    },

    // Configurações para deslocamento a pé.
    foot: {
        rotulo: 'A pé',
        icone: 'walk',
        servico: 'https://routing.openstreetmap.de/routed-foot/route/v1',
        estilo: {
            color: '#16a34a',
            weight: 6,
            opacity: 0.95,
            dashArray: '1, 12',
            lineCap: 'round'
        }
    },

    // Configurações para deslocamento de bicicleta.
    bike: {
        rotulo: 'Bicicleta',
        icone: 'bike',
        servico: 'https://routing.openstreetmap.de/routed-bike/route/v1',
        estilo: {
            color: '#ea580c',
            weight: 6,
            opacity: 0.95
        }
    },

    // Configurações para transporte público.
    transit: {
        rotulo: 'Transporte público',
        icone: 'bus',

        // Utiliza o serviço de roteamento de carro como base
        // para simular o trajeto enquanto a integração GTFS não estiver ativa.
        servico: 'https://routing.openstreetmap.de/routed-car/route/v1',

        // A rota possui transparência para diferenciá-la das demais modalidades.
        estilo: {
            color: '#7c3aed',
            weight: 6,
            opacity: 0.35
        },

        // Informa ao usuário que o trajeto é estimado e não utiliza
        // informações reais de linhas, horários e baldeações.
        aviso:
            'Rota mista simulada: os trechos são estimados a partir do traçado viário. Linhas, horários e baldeações reais exigem uma API GTFS.'
    }
};


// Define os estilos visuais utilizados para cada tipo de trecho
// em uma rota de transporte público.
const ESTILOS_TRECHO = {
    caminhada: {
        color: '#16a34a',
        weight: 6,
        opacity: 0.95,
        dashArray: '1, 12',
        lineCap: 'round'
    },

    onibus: {
        color: '#7c3aed',
        weight: 7,
        opacity: 0.95
    },

    trem: {
        color: COR_AZUL,
        weight: 7,
        opacity: 0.95
    }
};


// Armazena as cores correspondentes a cada tipo de trecho.
// Também define uma cor vermelha para representar a chegada ao destino.
const CORES_TRECHO = {
    caminhada: '#16a34a',
    onibus: '#7c3aed',
    trem: COR_AZUL,
    chegada: '#dc2626'
};


// ───────────────────────── ÍCONES SVG ─────────────────────────

// Armazena os desenhos dos ícones utilizados na interface.
// Cada valor é um caminho SVG (Scalable Vector Graphics),
// que descreve geometricamente o formato de um ícone.
const ICONES = {
    // Desenho utilizado para representar um carro.
    car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',

    // Desenho utilizado para representar uma pessoa caminhando.
    walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',

    // Desenho utilizado para representar uma bicicleta.
    bike: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zM10.8 10.5l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.5l-2.2-2zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z',

    // Desenho utilizado para representar um ônibus.
    bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',

    // Desenho utilizado para representar um trem.
    train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',

    // Desenho utilizado para representar um ponto de localização no mapa.
    pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',

    // Desenho utilizado para indicar uma seta de direção para cima.
    arrow: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',

    // Desenho utilizado para representar a troca ou inversão de posições.
    swap: 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z',

    // Desenho utilizado para representar o fechamento de uma janela ou elemento.
    close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',

    // Desenho utilizado para indicar um aviso ou situação de atenção.
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',

    // Desenho utilizado para representar a ação de voltar.
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',

    // Desenho utilizado para representar navegação ou orientação.
    navigation: 'M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z',

    // Desenho utilizado para representar a localização atual do usuário.
    locate: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',

    // Desenho utilizado para representar uma lista de informações.
    list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',

    // Desenho utilizado para representar uma bússola.
    compass: 'M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z'
};


// ───────────────────────── COMPONENTE DE ÍCONE ─────────────────────────

// Cria um componente reutilizável para exibir os ícones SVG.
// Recebe o nome do ícone, seu tamanho e uma possível rotação.
function Icone({ nome, size = 20, rotacao = 0 }) {
    return (
        <svg
            // Define a área de desenho do SVG e suas dimensões.
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="currentColor"
            aria-hidden="true"

            // Aplica uma rotação somente quando o valor recebido é diferente de zero.
            style={rotacao ? { transform: `rotate(${rotacao}deg)` } : undefined}
        >
            {/* Desenha o ícone utilizando o caminho SVG correspondente ao nome recebido. */}
            <path d={ICONES[nome]} />
        </svg>
    );
}


// ───────────────────────── UTILITÁRIOS GEOMÉTRICOS ─────────────────────────

// Calcula a projeção de um ponto sobre um segmento de reta.
// Recebe o ponto p e as extremidades a e b do segmento.
// Retorna a menor distância entre o ponto e o segmento, em metros,
// e o valor t, que indica a posição da projeção dentro do segmento.
function projetarNoSegmento(p, a, b) {

    // Aproxima a quantidade de metros correspondente a um grau de latitude.
    const kLat = 111320;

    // Calcula a quantidade de metros correspondente a um grau de longitude.
    // Essa medida varia conforme a latitude.
    const kLng = 111320 * Math.cos((p.lat * Math.PI) / 180);

    // Converte as coordenadas geográficas para distâncias aproximadas em metros,
    // considerando o ponto p como origem de um plano local.
    const ax = (a.lng - p.lng) * kLng;
    const ay = (a.lat - p.lat) * kLat;
    const bx = (b.lng - p.lng) * kLng;
    const by = (b.lat - p.lat) * kLat;

    // Calcula a diferença entre as coordenadas das extremidades do segmento.
    const dx = bx - ax;
    const dy = by - ay;

    // Calcula o comprimento do segmento elevado ao quadrado.
    const len2 = dx * dx + dy * dy;

    // Calcula a posição da projeção do ponto sobre o segmento.
    // O valor é limitado entre 0 e 1 para impedir que a projeção
    // fique fora dos limites do segmento.
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));

    // Calcula a distância entre o ponto original e sua projeção.
    // Math.hypot calcula a distância utilizando os componentes horizontal e vertical.
    return {
        distanciaM: Math.hypot(ax + t * dx, ay + t * dy),
        t
    };
}


// Calcula somente a distância entre um ponto e um segmento.
// Reutiliza a função projetarNoSegmento para evitar repetir os cálculos.
function distanciaPontoSegmentoM(p, a, b) {
    return projetarNoSegmento(p, a, b).distanciaM;
}


// Identifica a primeira zona de risco atravessada por uma rota.
// Recebe as coordenadas da rota e a lista de zonas de risco.
// Retorna a zona encontrada ou null caso não exista colisão.
function encontrarColisao(coordenadas, zonas) {

    // Verifica se existem coordenadas para analisar.
    if (!coordenadas?.length) return null;

    // Percorre todas as zonas de risco cadastradas.
    for (const zona of zonas) {

        // Transforma as coordenadas da zona em um objeto geográfico.
        const centro = { lat: zona.lat, lng: zona.lng };

        // Trata separadamente uma rota que possui apenas um ponto.
        if (coordenadas.length === 1) {

            // Verifica se esse ponto está dentro do raio de risco.
            if (distanciaPontoSegmentoM(centro, coordenadas[0], coordenadas[0]) <= RAIO_RISCO_M) {
                return zona;
            }

            continue;
        }

        // Percorre os segmentos que formam a rota.
        for (let i = 0; i < coordenadas.length - 1; i++) {

            // Verifica se algum segmento passa a até 150 metros
            // do centro da zona de risco.
            if (distanciaPontoSegmentoM(centro, coordenadas[i], coordenadas[i + 1]) <= RAIO_RISCO_M) {
                return zona;
            }
        }
    }

    // Retorna null quando nenhuma zona de risco é encontrada.
    return null;
}


// Calcula a distância acumulada ao longo de todos os pontos de uma rota.
// Cada posição do resultado representa a distância percorrida desde o início
// da rota até o ponto correspondente.
function acumularDistancias(coords) {

    // O primeiro ponto sempre possui distância acumulada igual a zero.
    const acum = [0];

    // Percorre os pontos da rota a partir do segundo.
    for (let i = 1; i < coords.length; i++) {

        // Soma a distância do segmento atual à distância acumulada anterior.
        acum.push(acum[i - 1] + coords[i - 1].distanceTo(coords[i]));
    }

    return acum;
}


// Encontra o índice do ponto correspondente a uma distância acumulada.
// Utiliza busca binária para localizar o valor de maneira mais eficiente.
function indiceNaDistancia(acum, d) {

    // Define os limites inicial e final da pesquisa.
    let lo = 0;
    let hi = acum.length - 1;

    // Continua a pesquisa enquanto os limites não se encontrarem.
    while (lo < hi) {

        // Calcula o índice central do intervalo.
        const mid = (lo + hi) >> 1;

        // Se a distância central for menor que a desejada,
        // a pesquisa continua na metade direita.
        if (acum[mid] < d) lo = mid + 1;

        // Caso contrário, continua na metade esquerda.
        else hi = mid;
    }

    // Retorna o índice encontrado.
    return lo;
}


// Extrai uma parte da rota entre duas distâncias acumuladas.
// Recebe a lista de coordenadas, as distâncias acumuladas,
// a distância inicial e a distância final.
function fatiarCoordenadas(coords, acum, d0, d1) {

    // Utiliza os índices encontrados para selecionar os pontos desejados.
    // O +1 garante a inclusão do ponto final.
    return coords.slice(indiceNaDistancia(acum, d0), indiceNaDistancia(acum, d1) + 1);
}


// Calcula o rumo geográfico entre dois pontos.
// O resultado varia de 0 a 360 graus, sendo 0 o norte.
function calcularRumo(a, b) {

    // Converte graus para radianos, unidade utilizada nas funções trigonométricas.
    const rad = (g) => (g * Math.PI) / 180;

    // Calcula os componentes utilizados para determinar a direção.
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));

    const x =
        Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
        Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));

    // Utiliza atan2 para encontrar o ângulo e converte o resultado para graus.
    // A operação final mantém o resultado dentro do intervalo de 0 a 360.
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}


// Calcula a menor diferença angular entre duas direções.
// O resultado fica entre 0 e 180 graus, mesmo quando os ângulos
// ultrapassam 360 graus ou possuem valores negativos.
function difAngular(a, b) {
    return Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
}


// Decodifica uma polyline, que é uma sequência compactada de coordenadas geográficas.
// Esse formato é utilizado por serviços de roteamento, como OTP e Google.
function decodificarPolyline(str, precisao = 5) {

    // Define o fator de divisão de acordo com a precisão da polyline.
    const fator = 10 ** precisao;

    // Cria o vetor que armazenará as coordenadas decodificadas.
    const out = [];

    // Inicializa o índice de leitura e as coordenadas acumuladas.
    let index = 0;
    let lat = 0;
    let lng = 0;

    // Percorre toda a sequência codificada.
    while (index < str.length) {

        // Decodifica a diferença de latitude.
        let b;
        let shift = 0;
        let result = 0;

        // Lê os caracteres codificados e reconstrói o valor numérico.
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        // Converte o valor codificado para o formato numérico original.
        lat += result & 1 ? ~(result >> 1) : result >> 1;

        // Reinicia as variáveis para decodificar a longitude.
        shift = 0;
        result = 0;

        // Decodifica a diferença de longitude.
        do {
            b = str.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        // Converte o valor codificado para longitude.
        lng += result & 1 ? ~(result >> 1) : result >> 1;

        // Divide as coordenadas pelo fator de precisão e transforma
        // o resultado em um objeto de localização do Leaflet.
        out.push(L.latLng(lat / fator, lng / fator));
    }

    // Retorna todas as coordenadas decodificadas.
    return out;
}


// ───────────────────────── SNAP-TO-ROUTE ─────────────────────────

// Ajusta a posição recebida pelo GPS para o ponto mais próximo da rota.
// Esse processo é chamado de snap-to-route e evita que o marcador
// apareça deslocado em relação ao caminho planejado.
function projetarNaRota(coords, lat, lng, indiceHint) {

    // Obtém a quantidade de coordenadas da rota.
    const n = coords.length;

    // Uma rota com menos de dois pontos não possui segmentos para analisar.
    if (n < 2) return null;

    // Cria um objeto representando a posição atual recebida pelo GPS.
    const p = { lat, lng };

    // Função interna responsável por procurar o segmento mais próximo
    // dentro de um intervalo específico da rota.
    const buscar = (ini, fim) => {

        // Inicializa a menor distância com infinito.
        let melhor = Infinity;

        // Armazena o índice do segmento mais próximo.
        let idx = ini;

        // Armazena a posição da projeção dentro do segmento.
        let t = 0;

        // Percorre os segmentos dentro do intervalo informado.
        for (let i = ini; i < fim; i++) {

            // Calcula a distância entre a posição GPS e o segmento atual.
            const r = projetarNoSegmento(p, coords[i], coords[i + 1]);

            // Atualiza o melhor resultado quando encontra uma distância menor.
            if (r.distanciaM < melhor) {
                melhor = r.distanciaM;
                idx = i;
                t = r.t;
            }
        }

        // Retorna a menor distância, o índice do segmento e a projeção.
        return { melhor, idx, t };
    };

    // Inicializa o resultado da pesquisa.
    let r = null;

    // Se já existe um índice de referência, pesquisa primeiro
    // próximo do segmento anteriormente identificado.
    if (indiceHint != null) {

        // Limita a pesquisa a uma janela da rota.
        // Isso evita que o marcador pule para outro trecho próximo
        // quando a rota passa por locais semelhantes.
        r = buscar(
            Math.max(0, indiceHint - 10),
            Math.min(n - 1, indiceHint + 300)
        );

        // Se o resultado estiver muito distante, descarta a pesquisa local.
        if (r.melhor > LIMITE_FORA_ROTA_M) r = null;
    }

    // Caso a pesquisa local não encontre um resultado adequado,
    // realiza a busca considerando todos os segmentos da rota.
    if (!r) r = buscar(0, n - 1);

    // Recupera os dois pontos que formam o segmento encontrado.
    const a = coords[r.idx];
    const b = coords[r.idx + 1];

    // Retorna as informações necessárias para acompanhar a posição do usuário.
    return {

        // Índice do segmento mais próximo.
        idx: r.idx,

        // Posição proporcional dentro do segmento.
        t: r.t,

        // Calcula as coordenadas exatas da projeção sobre a rota.
        ponto: L.latLng(
            a.lat + (b.lat - a.lat) * r.t,
            a.lng + (b.lng - a.lng) * r.t
        ),

        // Distância entre o GPS original e a rota.
        desvioM: r.melhor,

        // Direção geográfica do segmento encontrado.
        rumoSegmento: calcularRumo(a, b)
    };
}


// Calcula o progresso do usuário ao longo da rota.
// Recebe os dados da rota, a projeção da posição atual
// e um valor de precisão utilizado para avaliar possíveis desvios.
function calcularProgresso(rota, proj, precisao = 0) {

    // Verifica se existem informações suficientes para realizar o cálculo.
    if (!rota || !proj || !rota.passos.length) return null;

    // Calcula a distância já percorrida pelo usuário.
    // Soma a distância acumulada até o início do segmento
    // com a distância entre o início do segmento e a posição projetada.
    const percorrido =
        rota.acumulada[proj.idx] +
        rota.coordenadas[proj.idx].distanceTo(proj.ponto);

    // Calcula a distância restante até o destino.
    // Math.max impede que o resultado seja negativo.
    const restanteM = Math.max(0, rota.total - percorrido);

    // Estima o tempo restante proporcionalmente à distância que falta.
    const restanteS = rota.total
        ? rota.tempo * (restanteM / rota.total)
        : 0;

    // Procura a próxima instrução cujo ponto ainda está à frente
    // da posição atual do usuário.
    let idxProximo = rota.passos.findIndex(
        (s) => s.indiceCoord > proj.idx
    );

    // Caso não exista uma próxima instrução, utiliza a última disponível.
    if (idxProximo === -1) idxProximo = rota.passos.length - 1;

    // Recupera os dados da próxima instrução de navegação.
    const alvo = rota.passos[idxProximo];

    // Calcula a distância até a próxima instrução.
    const distProximo = Math.max(
        0,
        rota.acumulada[
        Math.min(alvo.indiceCoord, rota.acumulada.length - 1)
        ] - percorrido
    );

    // Retorna um objeto com as informações atualizadas do progresso.
    return {
        idxProximo,
        distProximo,
        restanteM,
        restanteS,

        // Informa a distância entre a posição GPS e a rota.
        desvioM: proj.desvioM,

        // Indica se o usuário está fora da rota.
        // O limite considera tanto a distância mínima configurada
        // quanto a margem relacionada à precisão do GPS.
        foraDaRota:
            proj.desvioM > Math.max(LIMITE_FORA_ROTA_M, precisao * 1.5)
    };
}


// ───────────────────────── CÂMERA IMERSIVA: CÁLCULOS MATEMÁTICOS ─────────────────────────

// Calcula as dimensões necessárias para que o mapa preencha
// corretamente a área visível depois da aplicação da perspectiva 3D.
// Recebe a largura, a altura da tela e informa se haverá rotação do mapa.
function dimensoesCena3D(largura, altura, comRotacao) {

    // Calcula o seno do ângulo de inclinação convertido para radianos.
    const sen = Math.sin((INCLINACAO_GRAUS * Math.PI) / 180);

    // Define a distância máxima utilizada para calcular a área distante da cena.
    const yLonge = Math.min(900, Math.max(600, altura * 0.95));

    // Calcula a metade da largura necessária para compensar
    // a distorção causada pela perspectiva.
    const meiaLarguraLonge =
        (largura / 2) * (1 + (yLonge * sen) / PERSPECTIVA_PX);

    // Se não houver rotação, calcula a largura e a altura
    // necessárias para preencher a área inclinada.
    if (!comRotacao) {
        return {
            w: Math.ceil(meiaLarguraLonge * 2),
            h: Math.ceil(yLonge * 2)
        };
    }

    // Calcula o raio necessário para a cena quando existe rotação.
    // O limite de 1150 evita que partes do plano ultrapassem
    // o limite da perspectiva definido em 1000 pixels.
    const raio = Math.min(
        1150,
        Math.ceil(Math.hypot(meiaLarguraLonge, yLonge))
    );

    // Retorna uma área quadrada suficiente para a rotação do mapa.
    return {
        w: raio * 2,
        h: raio * 2
    };
}


// Calcula o deslocamento vertical da câmera em relação ao marcador.
// O objetivo é manter o marcador na posição desejada da tela,
// mesmo depois da aplicação da inclinação e da perspectiva.
function offsetCameraPx(alturaCena) {

    // Recupera a distância de perspectiva configurada.
    const P = PERSPECTIVA_PX;

    // Converte o ângulo de inclinação para radianos.
    const th = (INCLINACAO_GRAUS * Math.PI) / 180;

    // Calcula a posição vertical desejada do marcador em relação ao centro.
    const yTela = (MARCADOR_ALTURA_TELA - 0.5) * alturaCena;

    // Calcula o deslocamento necessário considerando a transformação
    // de perspectiva e a inclinação do mapa.
    return (
        (yTela * P) /
        (P * Math.cos(th) + yTela * Math.sin(th))
    );
}


// ───────────────────────── INSTRUÇÕES EM PORTUGUÊS ─────────────────────────

// Define as traduções das direções geográficas para português.
// Essas direções são utilizadas na montagem das instruções de navegação.
const DIRECOES_PT = {
    N: 'norte',
    NE: 'nordeste',
    E: 'leste',
    SE: 'sudeste',
    S: 'sul',
    SW: 'sudoeste',
    W: 'oeste',
    NW: 'noroeste'
};


// Lista de tipos de vias que normalmente utilizam o artigo feminino.
// Essa lista permite construir instruções gramaticalmente corretas.
const VIAS_FEMININAS = [
    'rua', 'avenida', 'alameda', 'estrada', 'rodovia', 'travessa', 'via',
    'praça', 'ladeira', 'marginal', 'ponte', 'passarela', 'vila', 'viela',
    'servidão', 'rotatória', 'transversal', 'ligação', 'passagem',
    'galeria', 'r.', 'av.', 'rod.', 'al.', 'estr.', 'tv.', 'pça.', 'pç.'
];


// Lista de tipos de vias que normalmente utilizam o artigo masculino.
const VIAS_MASCULINAS = [
    'viaduto', 'largo', 'túnel', 'anel', 'corredor', 'beco', 'elevado',
    'eixo', 'trevo', 'contorno', 'parque', 'pátio', 'rodoanel',
    'acesso', 'caminho', 'complexo', 'boulevard'
];


// Identifica o gênero gramatical de uma via a partir de seu primeiro termo.
// Retorna 'f' para feminino, 'm' para masculino ou null quando desconhecido.
function generoDaVia(nome) {

    // Separa o nome da via em palavras, seleciona a primeira
    // e converte para letras minúsculas.
    const primeira = nome.trim().split(/\s+/)[0].toLowerCase();

    // Verifica se o primeiro termo está na lista de vias femininas.
    if (VIAS_FEMININAS.includes(primeira)) return 'f';

    // Verifica se o primeiro termo está na lista de vias masculinas.
    if (VIAS_MASCULINAS.includes(primeira)) return 'm';

    // Retorna null quando não é possível identificar o gênero.
    return null;
}


// Monta a expressão "na" ou "no" antes do nome de uma via.
// Quando o gênero não é conhecido, utiliza a preposição neutra "em".
function emVia(nome) {

    // Identifica o gênero gramatical da via.
    const g = generoDaVia(nome);

    // Retorna a expressão adequada de acordo com o gênero identificado.
    return g === 'f'
        ? `na ${nome}`
        : g === 'm'
            ? `no ${nome}`
            : `em ${nome}`;
}


// Monta a expressão "pela" ou "pelo" antes do nome de uma via.
// Quando o gênero não é conhecido, utiliza a preposição "por".
function porVia(nome) {

    // Identifica o gênero gramatical da via.
    const g = generoDaVia(nome);

    // Retorna a expressão adequada de acordo com o gênero identificado.
    return g === 'f'
        ? `pela ${nome}`
        : g === 'm'
            ? `pelo ${nome}`
            : `por ${nome}`;
}


// ───────────────────────── GERAÇÃO DE INSTRUÇÕES DE NAVEGAÇÃO ─────────────────────────

// Converte os comandos técnicos recebidos do sistema de roteamento
// em instruções compreensíveis em português.
// Recebe um objeto instr contendo o tipo de movimento, a direção
// e o nome da rua, quando essas informações estão disponíveis.
function textoInstrucaoPt(instr) {

    // Recupera o nome da via e remove espaços desnecessários.
    const rua = (instr.road || '').trim();

    // Recupera o tipo de instrução enviado pelo serviço de roteamento.
    const tipo = instr.type;

    // Recupera o modificador de direção.
    // Caso não exista, utiliza o próprio tipo da instrução.
    const mod = instr.modifier || tipo || '';

    // Identifica se a instrução envolve uma conversão para a esquerda ou direita.
    const lado = /Left/i.test(mod)
        ? 'esquerda'
        : /Right/i.test(mod)
            ? 'direita'
            : null;

    // Monta a expressão com a preposição adequada antes do nome da rua.
    const em = rua ? ` ${emVia(rua)}` : '';

    // Monta a expressão com a preposição adequada para indicar o caminho percorrido.
    const por = rua ? ` ${porVia(rua)}` : '';

    // Analisa o tipo de instrução e retorna a mensagem correspondente em português.
    switch (tipo) {

        // Indica a direção inicial que o usuário deve seguir.
        case 'Head': {
            const dir = DIRECOES_PT[instr.direction];
            return `Siga${dir ? ` para o ${dir}` : ''}${por}`;
        }

        // Indica que o usuário deve continuar em frente.
        case 'Continue':
        case 'Straight':
            return `Continue em frente${por}`;

        // Indica uma conversão leve para a direita.
        case 'SlightRight':
            return `Vire levemente à direita${em}`;

        // Indica uma conversão para a direita.
        case 'Right':
            return `Vire à direita${em}`;

        // Indica uma curva fechada para a direita.
        case 'SharpRight':
            return `Faça uma curva fechada à direita${em}`;

        // Indica uma conversão leve para a esquerda.
        case 'SlightLeft':
            return `Vire levemente à esquerda${em}`;

        // Indica uma conversão para a esquerda.
        case 'Left':
            return `Vire à esquerda${em}`;

        // Indica uma curva fechada para a esquerda.
        case 'SharpLeft':
            return `Faça uma curva fechada à esquerda${em}`;

        // Indica que o usuário deve realizar um retorno de direção.
        case 'TurnAround':
        case 'Uturn':
            return `Faça o retorno${em}`;

        // Indica que o usuário deve realizar uma conversão para a direita
        // ao entrar em uma rotatória, ou seguir pela rotatória caso
        // o serviço de roteamento não informe qual saída utilizar.
        case 'Roundabout': {
            const saida = instr.exit
                ? `pegue a ${instr.exit}ª saída`
                : 'siga pela rotatória';

            return `Na rotatória, ${saida}${em}`;
        }

        // Indica que o usuário deve entrar em outra via,
        // utilizando a direção informada pelo serviço de roteamento.
        case 'Merge':
            return `Una-se à via${lado ? ` à ${lado}` : ''}${em}`;

        // Indica uma bifurcação na via.
        // Caso exista uma direção definida, informa para qual lado seguir.
        // Caso contrário, orienta o usuário a continuar em frente.
        case 'Fork':
            return `${lado
                    ? `Na bifurcação, mantenha-se à ${lado}`
                    : 'Na bifurcação, continue em frente'
                }${em}`;

        // Indica que o usuário deve acessar uma via de entrada,
        // como uma alça de acesso ou entrada de rodovia.
        case 'OnRamp':
            return `Pegue o acesso${lado ? ` à ${lado}` : ''}${em}`;

        // Indica que o usuário deve utilizar uma saída da via,
        // como uma saída de rodovia ou de uma via expressa.
        case 'OffRamp':
            return `Pegue a saída${lado ? ` à ${lado}` : ''}${em}`;

        // Indica que a via atual está terminando e que o usuário
        // deverá realizar uma conversão na direção informada.
        case 'EndOfRoad':
            return `No fim da via, vire${lado ? ` à ${lado}` : ''}${em}`;

        // Informa que o usuário chegou a um ponto intermediário da rota.
        case 'WaypointReached':
            return 'Ponto de passagem alcançado';

        // Informa que o usuário chegou ao destino final.
        case 'DestinationReached':
            return 'Você chegou ao destino';

        // Caso o tipo de instrução não seja reconhecido,
        // retorna null para permitir que outro método tente gerar o texto.
        default:
            return null;
    }
}


// ───────────────────────── TRATAMENTO DE ERROS DO GPS ─────────────────────────

// Converte os códigos de erro da geolocalização do navegador
// em mensagens que podem ser compreendidas pelo usuário.
function mensagemErroGPS(err) {

    // Código 1: o usuário não autorizou o acesso à localização.
    if (err?.code === 1) {
        return 'Permissão de localização negada. Libere o acesso nos ajustes do navegador (no iPhone: Ajustes › Privacidade e Segurança › Serviços de Localização).';
    }

    // Código 3: o navegador não conseguiu obter a localização dentro do tempo limite.
    if (err?.code === 3) {
        return 'Tempo esgotado ao obter sua localização.';
    }

    // Para outros erros, apresenta uma mensagem genérica.
    return 'Não foi possível obter sua localização agora.';
}


// ───────────────────────── UTILITÁRIOS DE TEXTO ─────────────────────────

// Organiza os dados recebidos da API Photon para apresentar
// sugestões de endereços no campo de pesquisa.
function formatarSugestao(feature) {

    // Recupera as propriedades do local encontrado.
    // Caso não existam, utiliza um objeto vazio.
    const p = feature.properties || {};

    // Recupera as coordenadas geográficas do resultado.
    // A API fornece primeiro a longitude e depois a latitude.
    const [lng, lat] = feature.geometry.coordinates;

    // Junta o nome da rua e o número do imóvel, quando disponíveis.
    const rua = [p.street, p.housenumber].filter(Boolean).join(', ');

    // Define o título principal da sugestão.
    // Utiliza o nome do local, endereço, bairro ou cidade,
    // seguindo essa ordem de prioridade.
    const titulo = p.name || rua || p.district || p.city || 'Local sem nome';

    // Monta as informações complementares da sugestão,
    // separando o nome da rua, bairro e cidade.
    const detalhes = [
        p.name ? rua : null,
        p.district,
        p.city
    ].filter(Boolean).join(' · ');

    // Retorna um objeto padronizado com os dados necessários
    // para identificar e selecionar o endereço.
    return {
        // Cria um identificador utilizando os dados do OpenStreetMap.
        // Se não houver identificador, utiliza as próprias coordenadas.
        id: `${p.osm_type || 'x'}-${p.osm_id || `${lat},${lng}`}`,

        // Informações utilizadas na apresentação da sugestão.
        titulo,
        detalhes,

        // Texto completo que poderá ser utilizado no campo de pesquisa.
        texto: [titulo, p.district, p.city].filter(Boolean).join(', '),

        // Coordenadas utilizadas para posicionar o local no mapa.
        lat,
        lng
    };
}


// Formata distâncias para facilitar a leitura pelo usuário.
// Valores menores que 1.000 metros são apresentados em metros;
// valores maiores são convertidos para quilômetros.
function formatarDistancia(metros) {

    // Para distâncias menores que 1 km, arredonda o valor para
    // dezenas de metros, facilitando a visualização.
    if (metros < 1000) {
        return `${Math.round(metros / 10) * 10 || Math.round(metros)} m`;
    }

    // Converte metros para quilômetros e utiliza a formatação brasileira,
    // com vírgula como separador decimal e no máximo uma casa decimal.
    return `${(metros / 1000).toLocaleString('pt-BR', {
        maximumFractionDigits: 1
    })} km`;
}


// Converte um tempo expresso em segundos para um formato legível.
// Pode apresentar o resultado em minutos ou horas e minutos.
function formatarTempo(segundos) {

    // Converte segundos em minutos e arredonda o resultado.
    const min = Math.round(segundos / 60);

    // Quando o tempo é inferior a um minuto,
    // apresenta uma mensagem específica.
    if (min < 1) return '< 1 min';

    // Para tempos menores que uma hora, apresenta somente os minutos.
    if (min < 60) return `${min} min`;

    // Calcula a quantidade de horas completas.
    const h = Math.floor(min / 60);

    // Calcula os minutos restantes depois de retirar as horas completas.
    const m = min % 60;

    // Retorna horas e minutos quando existem minutos restantes.
    // Caso contrário, apresenta somente as horas.
    return m ? `${h} h ${m} min` : `${h} h`;
}


// ───────────────────────── ROTAÇÃO DOS ÍCONES DE MANOBRA ─────────────────────────

// Define o ângulo de rotação da seta de navegação de acordo
// com o tipo de manobra que o usuário deverá realizar.
// Quando o tipo é genérico, utiliza o modificador de direção.
function rotacaoDaManobra(tipo, modificador) {

    // Relaciona cada tipo de manobra ao ângulo correspondente.
    const mapa = {
        Straight: 0,
        Head: 0,
        Continue: 0,
        StartAt: 0,

        // Conversões para a direita.
        SlightRight: 45,
        Right: 90,
        SharpRight: 135,

        // Retorno de 180 graus.
        TurnAround: 180,
        Uturn: 180,

        // Conversões para a esquerda.
        SharpLeft: -135,
        Left: -90,
        SlightLeft: -45,

        // Rotatória.
        Roundabout: 90
    };

    // Retorna o ângulo correspondente ao tipo ou modificador.
    // Se nenhum deles estiver cadastrado, utiliza zero grau.
    return mapa[tipo] ?? mapa[modificador] ?? 0;
}


// ───────────────────────── ÍCONE DE CADA PASSO ─────────────────────────

// Componente responsável por selecionar o ícone correto
// para cada etapa do itinerário.
function IconeDoPasso({ passo, size = 20 }) {

    // Quando o passo representa um trecho de transporte público,
    // seleciona o ícone de acordo com a modalidade utilizada.
    if (passo.tipo === 'trecho') {

        // Relaciona cada modalidade ao seu respectivo ícone.
        // Caso a modalidade não seja reconhecida, utiliza o ícone de localização.
        const nome = {
            caminhada: 'walk',
            onibus: 'bus',
            trem: 'train'
        }[passo.modalidade] || 'pin';

        // Retorna o componente de ícone com o tamanho solicitado.
        return <Icone nome={nome} size={size} />;
    }

    // Quando o usuário chega ao destino, apresenta o ícone de localização.
    if (passo.manobra === 'DestinationReached') {
        return <Icone nome="pin" size={size} />;
    }

    // Para as demais instruções, apresenta uma seta rotacionada
    // de acordo com a direção da manobra.
    return (
        <Icone
            nome="arrow"
            size={size}
            rotacao={rotacaoDaManobra(
                passo.manobra,
                passo.modificador
            )}
        />
    );
}


// ───────────────────────── ROTEAMENTO DIRETO ─────────────────────────
// Esta parte controla a solicitação de rotas, alternativas e desvios
// utilizando o serviço de roteamento OSRM integrado ao Leaflet.


// Transforma o método router.route, que utiliza callbacks,
// em uma Promise para permitir o uso de async/await.
// Recebe o roteador, os pontos do percurso e as opções da solicitação.
function rotearViaRouter(router, pontos, opcoes) {

    // Cria uma Promise para controlar o resultado da solicitação.
    return new Promise((resolve, reject) => {

        // Solicita o cálculo da rota ao serviço de roteamento.
        router.route(

            // Transforma cada coordenada recebida em um waypoint do Leaflet.
            pontos.map((ll) => L.Routing.waypoint(ll)),

            // Callback executado quando o serviço retorna uma resposta.
            // Se houver erro, rejeita a Promise; caso contrário,
            // retorna as rotas encontradas.
            (err, rotas) => (
                err ? reject(err) : resolve(rotas)
            ),

            // Argumento utilizado para informações adicionais do roteamento.
            null,

            // Opções utilizadas na solicitação da rota.
            opcoes
        );
    });
}


// Converte uma rota retornada pelo OSRM/Leaflet Routing Machine
// em um objeto padronizado chamado candidata.
// Esse objeto contém as coordenadas, distâncias, tempo estimado
// e instruções de navegação em português.
function montarCandidata(rota, formatter, desviada) {

    // Recupera a sequência de coordenadas que forma o caminho da rota.
    const coordenadas = rota.coordinates;

    // Calcula a distância acumulada entre todos os pontos da rota.
    const acumulada = acumularDistancias(coordenadas);

    // Obtém a distância total percorrida.
    // Caso não seja possível calculá-la pelas coordenadas,
    // utiliza a distância informada pelo serviço de roteamento.
    const total = acumulada[acumulada.length - 1] || rota.summary.totalDistance;

    // Recupera as instruções de navegação e remove os pontos
    // de passagem intermediários, que não devem aparecer no itinerário.
    const instrucoes = (rota.instructions || []).filter(
        (i) => i.type !== 'WaypointReached'
    );

    // Converte cada instrução em um passo padronizado.
    const passos = instrucoes.map((instr, k) => {

        // Primeiro tenta gerar a instrução utilizando o tradutor próprio.
        let texto = textoInstrucaoPt(instr);

        // Se o tipo de instrução não for reconhecido,
        // tenta utilizar o formatador padrão do Leaflet Routing Machine.
        if (!texto) {

            try {
                texto = formatter.formatInstruction(instr, k);
            } catch {
                // Se ocorrer um erro na formatação,
                // deixa o texto vazio para utilizar uma alternativa abaixo.
                texto = null;
            }
        }

        // Retorna os dados organizados de cada passo da navegação.
        return {
            id: `m-${k}`,
            tipo: 'manobra',
            manobra: instr.type,
            modificador: instr.modifier,

            // Utiliza o texto traduzido, o nome da rua ou uma mensagem padrão.
            texto: texto || instr.road || 'Continue',

            // Formata a distância do trecho quando ela é maior que zero.
            detalhe: instr.distance > 0
                ? `por ${formatarDistancia(instr.distance)}`
                : '',

            // Armazena o índice da coordenada correspondente à instrução.
            indiceCoord: instr.index
        };
    });

    // Retorna a rota candidata com todas as informações necessárias.
    return {
        id: '',
        coordenadas,
        acumulada,
        total,

        // Recupera o tempo estimado de viagem em segundos.
        tempo: rota.summary.totalTime,

        passos,

        // Indica se a rota precisou ser desviada de uma zona de risco.
        desviada
    };
}


// ───────────────────────── TRANSPORTE PÚBLICO: ROTA MISTA ─────────────────────────
//
// Esta parte organiza o funcionamento das rotas que combinam
// diferentes modalidades de transporte público.
//
// A interface utiliza uma estrutura padronizada, independentemente
// de os dados serem simulados ou provenientes de uma integração GTFS.
//
// Estrutura esperada:
// {
//     simulado: boolean,
//     trechos: Trecho[]
// }
//
// Cada trecho pode conter:
// - modalidade: caminhada, ônibus ou trem;
// - texto: instrução apresentada ao usuário;
// - linha: identificação da linha, quando disponível;
// - de e para: pontos de embarque e desembarque;
// - distanciaM: distância do trecho em metros;
// - duracaoS: duração estimada em segundos;
// - coordenadas: pontos geográficos do percurso.


// Função assíncrona responsável por obter uma rota de transporte público.
// Recebe a origem, o destino e a rota viária utilizada como referência.
async function obterRotaTransportePublico({
    origem,
    destino,
    rotaViaria
}) {

    // Enquanto a integração com dados GTFS reais estiver desativada,
    // utiliza a função de simulação de transporte público.
    if (!TRANSPORTE_PUBLICO_REAL) {
        return simularRotaMista(rotaViaria);
    }

    // ┌─ [GTFS-1] SUBSTITUIR ESTE BLOCO PELA API GTFS ────────────────────────
    //
    // Para implementar o transporte público com informações reais:
    //
    // 1. Criar um Route Handler no Next.js, por exemplo:
    //    app/api/transporte-publico/route.js.
    //
    // 2. Esse Route Handler deverá receber as coordenadas de origem
    //    e destino por meio dos parâmetros from e to.
    //
    // 3. A requisição à API externa deverá acontecer no servidor.
    //    Assim, eventuais chaves de acesso não ficam expostas no navegador.
    //
    // 4. Ativar TRANSPORTE_PUBLICO_REAL, alterando seu valor para true.
    //
    // 5. Realizar a chamada ao Route Handler e transformar a resposta
    //    para o formato padronizado { simulado: false, trechos }.
    //
    // OPÇÃO 1: OpenTripPlanner (OTP)
    //
    // Pode ser hospedado com dados GTFS e OpenStreetMap da região.
    //
    // Endpoint de planejamento:
    // GET {OTP}/otp/routers/default/plan
    //
    // Parâmetros:
    // - fromPlace: latitude e longitude de origem.
    // - toPlace: latitude e longitude de destino.
    // - mode: modalidades permitidas, como TRANSIT e WALK.
    // - date e time: data e horário da viagem.
    //
    // Os dados podem ser obtidos de:
    // plan.itineraries[0].legs[]
    //
    // Cada trecho informa a modalidade, linha, pontos de embarque,
    // desembarque, distância, duração e geometria do percurso.
    //
    // Conversão das modalidades:
    // WALK → caminhada
    // BUS → ônibus
    // RAIL, SUBWAY e TRAM → trem
    //
    // A geometria pode ser convertida utilizando:
    // decodificarPolyline(leg.legGeometry.points)
    //
    // A estrutura dos parâmetros depende da versão do OTP utilizada.
    //
    // OPÇÃO 2: Google Routes API
    //
    // Endpoint:
    // POST https://routes.googleapis.com/directions/v2:computeRoutes
    //
    // A requisição utiliza:
    // - X-Goog-Api-Key: chave de autenticação.
    // - X-Goog-FieldMask: campos que serão retornados.
    //
    // No corpo da requisição, são informados origem, destino
    // e travelMode: 'TRANSIT'.
    //
    // Os resultados podem ser obtidos em:
    // routes[0].legs[0].steps[]
    //
    // Entre os dados disponíveis estão:
    // - travelMode: modalidade de transporte;
    // - distanceMeters: distância;
    // - staticDuration: duração estimada;
    // - polyline.encodedPolyline: geometria do trecho;
    // - transitDetails: informações sobre linhas e paradas.
    //
    // FONTES DE DADOS DA REGIÃO:
    // Verificar os dados GTFS disponibilizados por SPTrans,
    // Metrô/CPTM e EMTU.
    //
    // └─────────────────────────────────────────────────────────────────────

    // Enquanto a integração real não estiver implementada,
    // gera um erro para impedir que o sistema apresente
    // uma rota real inexistente como se estivesse disponível.
    throw new Error(
        'Integração GTFS ainda não implementada (veja [GTFS-1]).'
    );
}


// ───────────────────────── SIMULAÇÃO DE TRANSPORTE PÚBLICO ─────────────────────────

// Cria uma estimativa de rota mista utilizando caminhada,
// ônibus e, em viagens mais longas, trem ou metrô.
//
// IMPORTANTE: os valores são estimativas matemáticas.
// A função não consulta linhas, horários ou paradas reais.
function simularRotaMista(rotaViaria) {

    // Recupera a distância total da rota viária.
    // Caso não exista uma rota válida, utiliza zero.
    const total = rotaViaria?.total || 0;

    // Define as velocidades médias estimadas de cada modalidade,
    // expressas em metros por segundo.
    const V_CAMINHADA = 1.4;
    const V_ONIBUS = 5.5;
    const V_TREM = 10;

    // Função auxiliar que cria um trecho padronizado de transporte.
    // Calcula automaticamente a duração a partir da distância e velocidade.
    const mk = (modalidade, texto, linha, distanciaM, v) => ({
        modalidade,
        texto,
        linha,
        distanciaM,
        duracaoS: distanciaM / v
    });

    // Para trajetos menores que 800 metros,
    // considera que o deslocamento será feito inteiramente a pé.
    if (total < 800) {
        return {
            simulado: true,
            trechos: [
                mk(
                    'caminhada',
                    'Siga a pé até o destino',
                    null,
                    total,
                    V_CAMINHADA
                )
            ]
        };
    }

    // Calcula a distância estimada de caminhada no início e no final da viagem.
    // O valor é limitado a 450 metros ou 12% da distância total.
    const cam = Math.min(450, total * 0.12);

    // Calcula a distância intermediária, destinada ao transporte motorizado.
    const miolo = total - 2 * cam;

    // Inicializa a lista de trechos com a caminhada até o ponto de embarque.
    const trechos = [
        mk(
            'caminhada',
            'Caminhe até o ponto de embarque',
            null,
            cam,
            V_CAMINHADA
        )
    ];

    // Para viagens de pelo menos 6 km, simula uma combinação
    // de ônibus e trem/metrô.
    if (total >= 6000) {

        // O primeiro trecho motorizado representa o ônibus,
        // responsável por 35% da distância intermediária.
        trechos.push(
            mk(
                'onibus',
                'Embarque no ônibus',
                'Linha a definir',
                miolo * 0.35,
                V_ONIBUS
            )
        );

        // O segundo trecho representa uma baldeação para trem ou metrô,
        // responsável pelos 65% restantes.
        trechos.push(
            mk(
                'trem',
                'Faça a baldeação para trem/metrô',
                'Linha a definir',
                miolo * 0.65,
                V_TREM
            )
        );

    } else {

        // Para trajetos menores que 6 km, utiliza somente ônibus
        // no trecho intermediário.
        trechos.push(
            mk(
                'onibus',
                'Embarque no ônibus',
                'Linha a definir',
                miolo,
                V_ONIBUS
            )
        );
    }

    // Adiciona a caminhada final entre o desembarque e o destino.
    trechos.push(
        mk(
            'caminhada',
            'Desça e caminhe até o destino',
            null,
            cam,
            V_CAMINHADA
        )
    );

    // Retorna a rota completa e informa que os dados são simulados.
    return {
        simulado: true,
        trechos
    };
}


// ───────────────────────── CONVERSÃO DE TRECHOS EM PASSOS ─────────────────────────

// Converte os trechos de transporte público em passos de navegação.
// Assim, a rota mista utiliza uma estrutura semelhante à rota convencional,
// permitindo que ambas sejam apresentadas pela mesma interface.
function montarPassosMistos(trechos, acumulada) {

    // Inicializa a distância percorrida antes do primeiro trecho.
    let d = 0;

    // Percorre os trechos de transporte para criar os passos do itinerário.
    const passos = trechos.map((t, k) => {

        // Define o índice da coordenada inicial do trecho.
        // Se o trecho já possuir um índice específico, utiliza esse valor.
        // Caso contrário, encontra o índice correspondente à distância acumulada.
        const indiceCoord = t.indiceInicio ?? indiceNaDistancia(acumulada, d);

        // Atualiza a distância acumulada para o próximo trecho.
        d += t.distanciaM;

        // Retorna o passo com as informações necessárias para a interface.
        return {
            id: `t-${k}`,
            tipo: 'trecho',
            modalidade: t.modalidade,
            texto: t.texto,

            // Monta os detalhes do trecho com linha, paradas,
            // duração e distância, quando essas informações existem.
            detalhe: [
                t.linha,
                t.de && t.para ? `${t.de} → ${t.para}` : null,
                formatarTempo(t.duracaoS),
                formatarDistancia(t.distanciaM)
            ].filter(Boolean).join(' · '),

            // Define a cor de acordo com a modalidade de transporte.
            cor: CORES_TRECHO[t.modalidade],

            // Armazena a posição do trecho dentro da geometria da rota.
            indiceCoord
        };
    });

    // Adiciona um último passo indicando a chegada ao destino.
    passos.push({
        id: 'chegada',
        tipo: 'trecho',
        modalidade: 'chegada',
        texto: 'Chegada ao destino',
        detalhe: '',
        cor: CORES_TRECHO.chegada,

        // Utiliza o índice da última coordenada da rota.
        indiceCoord: Math.max(0, acumulada.length - 1)
    });

    // Retorna a lista completa de passos do itinerário misto.
    return passos;
}


// ───────────────────────── CONFIGURAÇÃO DO ROTEADOR ─────────────────────────

// Altera dinamicamente o serviço OSRM utilizado pelo Leaflet Routing Machine.
// Isso permite trocar entre os servidores de carro, caminhada e bicicleta.
function aplicarModoNoRouter(routing, modo) {

    // Recupera o roteador associado ao controle de rotas.
    // Utiliza getRouter quando disponível ou acessa a propriedade interna
    // _router como alternativa.
    const router = routing.getRouter?.() || routing._router;

    // Se o roteador existir, altera seu endereço de serviço
    // de acordo com a modalidade de transporte selecionada.
    if (router) {
        router.options.serviceUrl = MODOS[modo].servico;
    }
}


// ───────────────────────── AJUSTE DA VISUALIZAÇÃO DO MAPA ─────────────────────────

// Ajusta o enquadramento do mapa para que a rota inteira fique visível.
// Recebe o mapa Leaflet e os limites geográficos da rota.
function ajustarMapa(map, bounds) {

    // Interrompe a execução caso o mapa ou os limites não existam.
    if (!map || !bounds) return;

    // Identifica se a tela está em formato de celular.
    const mobile = window.innerWidth <= 640;

    // Ajusta o enquadramento para mostrar toda a rota.
    // Os espaçamentos são diferentes para celular e computador,
    // pois a interface possui painéis em posições distintas.
    map.fitBounds(
        bounds,

        mobile
            ? {
                // No celular, reserva espaço na parte inferior
                // para o painel de informações da rota.
                paddingTopLeft: [24, 24],
                paddingBottomRight: [24, 330]
            }
            : {
                // No computador, reserva espaço na lateral esquerda
                // para o painel de itinerário.
                paddingTopLeft: [400, 40],
                paddingBottomRight: [40, 40]
            }
    );
}


// ───────────────────────── LISTA DE PASSOS DO ITINERÁRIO ─────────────────────────

// Componente responsável por exibir as instruções da rota.
// Recebe os passos, o índice do passo atualmente ativo
// e uma informação que indica se a rota ainda está sendo carregada.
function ListaPassos({
    passos,
    indiceAtivo = -1,
    carregando
}) {

    // Enquanto a rota mista está sendo calculada,
    // apresenta uma mensagem de carregamento.
    if (carregando) {
        return (
            <div className="mabc-carregando">
                Montando rota mista…
            </div>
        );
    }

    // Quando os dados estão disponíveis, apresenta os passos em uma lista.
    return (
        <ol className="mabc-passos">

            {/* Percorre todos os passos e cria um item para cada instrução. */}
            {passos.map((p, i) => (

                <li
                    // Utiliza o identificador único do passo como chave do React.
                    key={p.id}

                    // Adiciona a classe "ativo" ao passo que corresponde
                    // à posição atual da navegação.
                    className={`mabc-passo${i === indiceAtivo ? ' ativo' : ''}`}
                >

                    {/* Área responsável por exibir o ícone do passo. */}
                    <span
                        className="mabc-passo-icone"

                        // Quando o passo possui uma cor específica,
                        // aplica essa cor ao fundo e ao ícone.
                        style={
                            p.cor
                                ? {
                                    background: `${p.cor}1f`,
                                    color: p.cor
                                }
                                : undefined
                        }
                    >
                        {/* Seleciona automaticamente o ícone da modalidade
                            ou da manobra correspondente. */}
                        <IconeDoPasso passo={p} size={20} />
                    </span>

                    {/* Área que contém o texto principal e os detalhes do passo. */}
                    <span className="mabc-passo-textos">

                        {/* Apresenta a instrução principal de navegação. */}
                        <span className="mabc-passo-titulo">
                            {p.texto}
                        </span>

                        {/* Apresenta informações complementares,
                            como distância, duração ou linha de transporte,
                            somente quando esses dados existem. */}
                        {p.detalhe
                            ? (
                                <span className="mabc-passo-detalhe">
                                    {p.detalhe}
                                </span>
                            )
                            : null}
                    </span>
                </li>
            ))}
        </ol>
    );
}


// ───────────────────────── COMPONENTE PRINCIPAL ─────────────────────────

// Componente principal da aplicação de navegação do ABC Paulista.
// Reúne o mapa, pesquisa de endereços, cálculo de rotas,
// alternativas de percurso, GPS e interface de navegação.
export default function MapaABC() {

    // ───────────────────────── REFERÊNCIAS DO DOM ─────────────────────────

    // Referência ao elemento principal que envolve o componente.
    const rootRef = useRef(null);

    // Referência ao elemento que contém a cena do mapa,
    // utilizada nos efeitos de perspectiva e câmera 3D.
    const cenaRef = useRef(null);

    // Referência ao campo de pesquisa do destino.
    const inputDestinoRef = useRef(null);


    // ───────────────────────── REFERÊNCIAS DO LEAFLET ─────────────────────────

    // Armazena a instância principal do mapa Leaflet.
    const mapRef = useRef(null);

    // Armazena o controle responsável pelo cálculo das rotas.
    const routingRef = useRef(null);

    // Armazena o formatador de instruções do Leaflet Routing Machine.
    const formatterRef = useRef(null);

    // Armazena as camadas de elementos gráficos do mapa.
    const camadaMarcadoresRef = useRef(null);
    const camadaRotasRef = useRef(null);
    const camadaRotulosRef = useRef(null);
    const camadaMistaRef = useRef(null);

    // Armazena a referência do marcador que representa o usuário.
    const marcadorUsuarioRef = useRef(null);

    // Armazena a camada visual que representa a precisão do GPS.
    const precisaoRef = useRef(null);


    // ───────────────────────── REFERÊNCIAS DE CONTROLE DA APLICAÇÃO ─────────────────────────

    // Guarda as zonas de risco obtidas do banco de dados.
    const zonasRiscoRef = useRef([]);

    // Armazena os pontos de início e fim da rota solicitada.
    const rotaRef = useRef(null);

    // Guarda o modo de transporte atualmente selecionado.
    const modoRef = useRef('driving');

    // Armazena a etapa atual da aplicação:
    // busca, itinerário ou navegação.
    const faseRef = useRef('busca');

    // Armazena os dados da rota atualmente selecionada.
    const rotaAtualRef = useRef(null);

    // Guarda todas as rotas alternativas encontradas.
    const candidatasRef = useRef([]);

    // Contador utilizado para identificar solicitações de rota.
    // Impede que respostas antigas substituam resultados mais recentes.
    const calcReqRef = useRef(0);

    // Contador específico das solicitações de transporte público.
    const mistaReqRef = useRef(0);

    // Controla o formato do parâmetro de alternativas enviado ao OSRM.
    // true: solicita uma quantidade numérica de alternativas.
    // false: utiliza alternatives=true como alternativa de compatibilidade.
    const altNumericoRef = useRef(true);

    // Guarda referências das funções de processamento e seleção de rotas.
    const processarRotasRef = useRef(null);
    const selecionarRotaRef = useRef(null);


    // ───────────────────────── REFERÊNCIAS DO GPS E DA CÂMERA ─────────────────────────

    // Indica se o mapa deve acompanhar automaticamente a localização do usuário.
    const seguirRef = useRef(true);

    // Armazena a última coordenada recebida diretamente do GPS.
    const ultimaPosRef = useRef(null);

    // Guarda a posição que está sendo exibida no mapa,
    // que pode estar ajustada para a linha da rota.
    const posExibidaRef = useRef(null);

    // Armazena a última posição aprovada pelo filtro de deslocamento mínimo.
    const filtroPosRef = useRef(null);

    // Guarda o último segmento identificado na rota.
    const idxRotaRef = useRef(null);

    // Armazena o último ponto utilizado para calcular a direção do movimento.
    const refRumoRef = useRef(null);

    // Guarda o ângulo acumulado de rotação do marcador e do mapa.
    const anguloRef = useRef(0);

    // Controla se o zoom inicial da navegação já foi aplicado.
    const zoomInicialRef = useRef(false);

    // Indica se a câmera imersiva está ativada.
    const cameraImersivaRef = useRef(false);

    // Armazena o identificador do monitoramento contínuo do GPS.
    const watchIdRef = useRef(null);

    // Guarda a referência do Wake Lock, utilizado para tentar impedir
    // que a tela seja suspensa durante a navegação.
    const wakeLockRef = useRef(null);


    // ───────────────────────── REFERÊNCIAS DO AUTOCOMPLETE ─────────────────────────

    // Armazena os temporizadores de pesquisa de origem e destino.
    // São utilizados para implementar o debounce.
    const timersRef = useRef({
        origem: null,
        destino: null
    });

    // Armazena os controladores de cancelamento das pesquisas.
    // Permite interromper requisições anteriores quando uma nova pesquisa começa.
    const abortRef = useRef({
        origem: null,
        destino: null
    });


    // ───────────────────────── ESTADOS DA INTERFACE ─────────────────────────

    // Controla o endereço de origem e suas respectivas coordenadas.
    const [origem, setOrigem] = useState({
        texto: '',
        coord: null
    });

    // Controla o endereço de destino e suas respectivas coordenadas.
    const [destino, setDestino] = useState({
        texto: '',
        coord: null
    });

    // Armazena as sugestões de endereços encontradas para origem e destino.
    const [sugestoes, setSugestoes] = useState({
        origem: [],
        destino: []
    });

    // Identifica qual campo de pesquisa está aberto no momento.
    const [campoAberto, setCampoAberto] = useState(null);

    // Controla o índice da sugestão atualmente selecionada.
    const [idxAtivo, setIdxAtivo] = useState(-1);

    // Controla a modalidade de transporte escolhida pelo usuário.
    const [modo, setModo] = useState('driving');

    // Indica se todas as alternativas de rota apresentam situação de risco.
    const [emPerigo, setEmPerigo] = useState(false);

    // Armazena mensagens de erro relacionadas ao cálculo das rotas.
    const [erroRota, setErroRota] = useState('');

    // Indica se o sistema está tentando obter a localização do usuário.
    const [localizando, setLocalizando] = useState(false);

    // Controla a etapa atual da interface.
    // Os valores possíveis são: busca, itinerário e navegando.
    const [fase, setFase] = useState('busca');

    // Armazena as rotas alternativas disponíveis.
    const [candidatas, setCandidatas] = useState([]);

    // Controla qual rota alternativa está selecionada.
    const [selecionada, setSelecionada] = useState(0);

    // Armazena as geometrias das rotas que foram bloqueadas
    // por atravessarem zonas de risco.
    const [bloqueadas, setBloqueadas] = useState([]);

    // Guarda os dados da rota atualmente exibida.
    const [rotaAtual, setRotaAtual] = useState(null);

    // Controla a abertura ou o fechamento da lista de instruções.
    const [listaAberta, setListaAberta] = useState(true);

    // Controla se o mapa deve acompanhar automaticamente o usuário.
    const [seguir, setSeguirState] = useState(true);

    // Armazena as informações de progresso da navegação.
    const [progresso, setProgresso] = useState(null);

    // Indica se o usuário já chegou ao destino.
    const [chegou, setChegou] = useState(false);


    // ───────────────────────── ESTADOS DA CÂMERA ─────────────────────────

    // Controla o modo visual da câmera.
    // A sequência pode ser: 2d, prep, 3d, saindo e novamente 2d.
    const [camera, setCamera] = useState('2d');

    // Armazena as dimensões calculadas para a cena tridimensional.
    const [dim3d, setDim3d] = useState(null);


    // Cria um objeto que relaciona cada campo de endereço
    // à função responsável por atualizar seu estado.
    const setters = {
        origem: setOrigem,
        destino: setDestino
    };


    // ───────────────────────── SINCRONIZAÇÃO DE ESTADOS E REFERÊNCIAS ─────────────────────────

    // Sempre que o modo de transporte mudar,
    // atualiza a referência utilizada por funções externas ao React.
    useEffect(() => {
        modoRef.current = modo;
    }, [modo]);

    // Atualiza a referência da etapa atual da aplicação.
    useEffect(() => {
        faseRef.current = fase;
    }, [fase]);

    // Sempre que a rota atual mudar, atualiza sua referência.
    useEffect(() => {

        rotaAtualRef.current = rotaAtual;

        // Uma nova rota exige que o ajuste GPS para a linha
        // seja reiniciado a partir da rota inteira.
        idxRotaRef.current = null;

    }, [rotaAtual]);


    // ───────────────────────── CONTROLE DO ACOMPANHAMENTO DO MAPA ─────────────────────────

    // Atualiza o estado que determina se o mapa deve seguir o usuário.
    // A função modifica tanto a referência quanto o estado do React.
    function definirSeguir(v) {
        seguirRef.current = v;
        setSeguirState(v);
    }


    // ───────────────────────── ENTRADA NO ITINERÁRIO ─────────────────────────

    // Altera a interface para a etapa de apresentação do itinerário.
    // Recebe os limites geográficos que deverão ser exibidos no mapa.
    function entrarNoItinerario(bounds) {

        // Se a navegação ainda não começou e existem limites válidos,
        // ajusta o mapa para enquadrar toda a rota.
        if (faseRef.current !== 'navegando' && bounds) {
            ajustarMapa(mapRef.current, bounds);
        }

        // Altera a etapa somente quando a aplicação ainda está na busca.
        setFase((f) => (
            f === 'busca' ? 'itinerario' : f
        ));
    }


    // ───────────────────────── PUBLICAÇÃO DA ROTA MISTA ─────────────────────────

    // Transforma os dados recebidos da simulação ou de uma API GTFS
    // em uma rota que pode ser exibida pela interface.
    function publicarRotaMista(res, coordenadas) {

        // Calcula as distâncias acumuladas entre os pontos da rota.
        const acumulada = acumularDistancias(coordenadas);

        // Recupera a distância total do percurso.
        const total = acumulada[acumulada.length - 1] || 0;

        // Transforma os trechos de transporte em passos de navegação.
        const passos = montarPassosMistos(res.trechos, acumulada);

        // Soma a duração de todos os trechos para obter o tempo total.
        const tempo = res.trechos.reduce(
            (soma, t) => soma + t.duracaoS,
            0
        );

        // Atualiza a rota atual com todos os dados necessários
        // para sua apresentação na interface.
        setRotaAtual({
            coordenadas,
            acumulada,
            total,
            tempo,
            passos,
            trechos: res.trechos,

            // Identifica se os dados são simulados.
            simulado: !!res.simulado,

            // Indica que o processamento da rota foi concluído.
            carregando: false
        });
    }


    // ───────────────────────── CONSTRUÇÃO DA ROTA ATUAL ─────────────────────────

    // Define uma candidata como rota atual da aplicação.
    // Quando o modo escolhido é transporte público,
    // solicita também a montagem dos trechos de transporte.
    function construirRotaAtual(c) {

        // Cria a estrutura básica da rota a partir da candidata selecionada.
        const base = {
            coordenadas: c.coordenadas,
            acumulada: c.acumulada,
            total: c.total,
            tempo: c.tempo,
            passos: c.passos,
            trechos: null,
            simulado: false,
            carregando: false
        };

        // Verifica se a modalidade escolhida é transporte público.
        if (modoRef.current === 'transit') {

            // Incrementa o identificador da solicitação.
            // Isso permite identificar se uma resposta ficou desatualizada.
            const id = ++mistaReqRef.current;

            // Atualiza a interface indicando que a rota mista está sendo calculada.
            setRotaAtual({
                ...base,
                passos: [],
                carregando: true,
                simulado: true
            });

            // Solicita a montagem dos trechos de transporte público.
            obterRotaTransportePublico({
                origem: rotaRef.current?.inicio,
                destino: rotaRef.current?.fim,
                rotaViaria: base
            })

                // Quando a solicitação é concluída, verifica se ainda é a mais recente.
                .then((res) => {

                    // Ignora respostas de solicitações anteriores.
                    if (id !== mistaReqRef.current) return;

                    // Publica os dados da rota mista na interface.
                    publicarRotaMista(res, c.coordenadas);
                })

                // Trata erros ocorridos durante a montagem da rota.
                .catch(() => {

                    // Ignora erros de solicitações que já foram substituídas.
                    if (id !== mistaReqRef.current) return;

                    // Remove a rota atual e apresenta uma mensagem de erro.
                    setRotaAtual(null);
                    setErroRota(
                        'Não foi possível montar a rota de transporte público.'
                    );
                });

        } else {

            // Invalida eventuais solicitações anteriores de transporte público.
            mistaReqRef.current++;

            // Para os demais modos, utiliza diretamente a rota viária.
            setRotaAtual(base);
        }
    }


    // ───────────────────────── SELEÇÃO DE ROTAS ALTERNATIVAS ─────────────────────────

    // Seleciona uma rota alternativa a partir de seu índice na lista.
    // A seleção pode acontecer por meio de um clique no mapa ou no card da rota.
    function selecionarRota(idx) {

        // Recupera a rota correspondente ao índice selecionado.
        const c = candidatasRef.current[idx];

        // Impede a seleção quando a rota não existe
        // ou quando a navegação já foi iniciada.
        if (!c || faseRef.current === 'navegando') return;

        // Atualiza o índice da rota selecionada.
        setSelecionada(idx);

        // Constrói a rota escolhida e atualiza a interface.
        construirRotaAtual(c);
    }


    // ───────────────────────── PROCESSAMENTO DAS ROTAS ENCONTRADAS ─────────────────────────

    // Recebe todas as alternativas retornadas pelo OSRM.
    // Analisa cada percurso para identificar zonas de risco,
    // tenta calcular desvios e disponibiliza as rotas válidas.
    async function processarRotas(rotasOSRM) {

        // Gera um identificador para esta solicitação.
        // O contador permite ignorar resultados antigos.
        const reqId = ++calcReqRef.current;

        // Recupera o controle de roteamento e os pontos da rota solicitada.
        const routing = routingRef.current;
        const alvo = rotaRef.current;

        // Interrompe a função se o roteador ou a rota não estiverem disponíveis.
        if (!routing || !alvo) return;

        // Recupera o roteador interno do Leaflet Routing Machine.
        const router = routing.getRouter?.() || routing._router;

        // Recupera as zonas de risco armazenadas na aplicação.
        const zonas = zonasRiscoRef.current;

        // Recupera o formatador utilizado para gerar instruções de navegação.
        const formatter = formatterRef.current;


        // ───────────────────────── ANÁLISE DE CADA ALTERNATIVA ─────────────────────────

        // Analisa as rotas em paralelo para reduzir o tempo de processamento.
        const resolvidas = await Promise.all(

            // Limita a análise à quantidade máxima de rotas configurada.
            rotasOSRM.slice(0, MAX_ROTAS).map(async (rota) => {

                // Verifica se a rota atravessa alguma zona de risco.
                const zona = encontrarColisao(
                    rota.coordinates,
                    zonas
                );

                // Quando não existe colisão, mantém a rota original.
                if (!zona) {
                    return {
                        rota,
                        desviada: false,
                        bloqueada: false
                    };
                }

                // Cria um ponto alternativo próximo da zona de risco.
                // Esse ponto funciona como um waypoint intermediário
                // para tentar obrigar o roteador a contornar a região.
                const fuga = L.latLng(
                    zona.lat + OFFSET_FUGA,
                    zona.lng + OFFSET_FUGA
                );

                try {

                    // Solicita uma nova rota passando pela origem,
                    // pelo ponto de fuga e pelo destino.
                    // A opção semAlternativas evita solicitar outros caminhos.
                    const novas = await rotearViaRouter(
                        router,
                        [alvo.inicio, fuga, alvo.fim],
                        { semAlternativas: true }
                    );

                    // Recupera a primeira rota recalculada.
                    const nova = novas?.[0];

                    // Verifica se o novo percurso existe e não atravessa
                    // nenhuma das zonas de risco cadastradas.
                    if (
                        nova &&
                        !encontrarColisao(nova.coordinates, zonas)
                    ) {
                        return {
                            rota: nova,
                            desviada: true,
                            bloqueada: false
                        };
                    }

                } catch (err) {

                    // Registra no console eventuais erros durante
                    // o cálculo do desvio.
                    console.warn(
                        'Falha ao recalcular o desvio:',
                        err
                    );
                }

                // Se não foi possível encontrar um desvio seguro,
                // identifica a rota como bloqueada.
                return {
                    rota,
                    desviada: true,
                    bloqueada: true
                };
            })
        );


        // ───────────────────────── VALIDAÇÃO DAS RESPOSTAS ─────────────────────────

        // Verifica se outra solicitação foi iniciada durante o processamento.
        // Se isso aconteceu, ignora os resultados antigos.
        if (reqId !== calcReqRef.current) return;


        // Cria a lista de rotas que poderão ser apresentadas ao usuário.
        const lista = [];

        // Armazena as geometrias das rotas que não conseguiram
        // encontrar um desvio seguro.
        const geometriasBloqueadas = [];

        // Cria um conjunto para identificar e eliminar rotas duplicadas.
        const vistos = new Set();


        // ───────────────────────── ORGANIZAÇÃO DAS ROTAS ─────────────────────────

        // Percorre os resultados obtidos após a análise de risco.
        for (const r of resolvidas) {

            // Se a rota estiver bloqueada, guarda sua geometria
            // e não a adiciona à lista de opções disponíveis.
            if (r.bloqueada) {
                geometriasBloqueadas.push(r.rota.coordinates);
                continue;
            }

            // Transforma a rota em um objeto padronizado.
            const c = montarCandidata(
                r.rota,
                formatter,
                r.desviada
            );

            // Ignora rotas que não possuem coordenadas.
            if (!c.coordenadas.length) continue;


            // ───────────────────────── REMOÇÃO DE ROTAS DUPLICADAS ─────────────────────────

            // Desvios diferentes podem resultar praticamente no mesmo caminho.
            // Para evitar apresentar alternativas repetidas, calcula uma
            // assinatura utilizando a distância total e o ponto central da rota.
            const meio = c.coordenadas[
                indiceNaDistancia(c.acumulada, c.total / 2)
            ];

            // Cria uma identificação aproximada para comparar os percursos.
            const assinatura =
                `${Math.round(c.total / 40)}|${meio.lat.toFixed(3)}|${meio.lng.toFixed(3)}`;

            // Se essa assinatura já foi encontrada, ignora a rota duplicada.
            if (vistos.has(assinatura)) continue;

            // Registra a assinatura para evitar novas duplicações.
            vistos.add(assinatura);

            // Adiciona a candidata à lista de rotas válidas.
            lista.push(c);
        }


        // ───────────────────────── ORDENAÇÃO DAS ALTERNATIVAS ─────────────────────────

        // Organiza as rotas em ordem crescente de tempo estimado.
        // Assim, as opções mais rápidas aparecem primeiro.
        lista.sort((a, b) => a.tempo - b.tempo);

        // Atribui um identificador único para cada rota organizada.
        lista.forEach((c, i) => {
            c.id = `r-${i}`;
        });


        // ───────────────────────── ATUALIZAÇÃO DA INTERFACE ─────────────────────────

        // Atualiza a referência e o estado com as rotas disponíveis.
        candidatasRef.current = lista;
        setCandidatas(lista);

        // Atualiza as rotas que foram bloqueadas por zonas de risco.
        setBloqueadas(geometriasBloqueadas);

        // Seleciona inicialmente a primeira rota da lista.
        setSelecionada(0);


        // ───────────────────────── TRATAMENTO DE AUSÊNCIA DE ROTAS SEGURAS ─────────────────────────

        // Se nenhuma alternativa válida foi encontrada,
        // informa que todas as opções apresentam risco.
        if (!lista.length) {

            // Remove a rota atualmente selecionada.
            setRotaAtual(null);

            // Ativa o indicador visual de perigo.
            setEmPerigo(true);

            return;
        }


        // ───────────────────────── PUBLICAÇÃO DA MELHOR ALTERNATIVA ─────────────────────────

        // Desativa o indicador de perigo quando existe uma rota válida.
        setEmPerigo(false);

        // Limpa eventuais mensagens de erro anteriores.
        setErroRota('');

        // Constrói a primeira rota da lista, que é a mais rápida
        // de acordo com o tempo estimado pelo serviço de roteamento.
        construirRotaAtual(lista[0]);


        // ───────────────────────── ENQUADRAMENTO DO MAPA ─────────────────────────

        // Junta os limites geográficos de todas as rotas válidas.
        // Isso permite que o mapa mostre todas as alternativas ao mesmo tempo.
        const bounds = lista.reduce(
            (b, c) => b.extend(
                L.latLngBounds(c.coordenadas)
            ),
            L.latLngBounds(lista[0].coordenadas)
        );

        // Entra na etapa de apresentação do itinerário
        // e ajusta o enquadramento do mapa.
        entrarNoItinerario(bounds);
    }


    // ───────────────────────── INICIALIZAÇÃO DO MAPA, ROTEAMENTO E ZONAS DE RISCO ─────────────────────────

    // Este efeito é responsável por inicializar o mapa Leaflet,
    // configurar os serviços de roteamento, criar as camadas visuais
    // e carregar as zonas de risco armazenadas no Supabase.
    useEffect(() => {

        // Verifica se o código está sendo executado no navegador.
        // Também impede que o mapa seja inicializado mais de uma vez.
        if (
            typeof window === 'undefined' ||
            mapRef.current
        ) return;

        // Variável utilizada para identificar se o componente
        // foi desmontado antes do término das operações assíncronas.
        let cancelado = false;


        // ───────────────────────── CRIAÇÃO DO MAPA ─────────────────────────

        // Cria a instância do mapa Leaflet dentro do elemento HTML
        // identificado como mapa-container.
        //
        // Desativa os controles padrão de zoom e atribuição,
        // pois eles serão configurados separadamente.
        //
        // Define o centro inicial na região do ABC Paulista,
        // com nível de zoom 13.
        const map = L.map(
            'mapa-container',
            {
                zoomControl: false,
                attributionControl: false
            }
        ).setView(
            [CENTRO_ABC.lat, CENTRO_ABC.lng],
            13
        );


        // Adiciona os controles de zoom no canto inferior direito.
        // Também define os textos apresentados ao passar o mouse
        // sobre os botões de aproximação e afastamento.
        L.control.zoom({
            position: 'bottomright',
            zoomInTitle: 'Aproximar',
            zoomOutTitle: 'Afastar'
        }).addTo(map);


        // Adiciona a camada de imagens do OpenStreetMap.
        // Os endereços das imagens são preenchidos automaticamente
        // de acordo com as coordenadas e o nível de zoom.
        L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ).addTo(map);


        // Armazena a instância criada na referência do React.
        mapRef.current = map;


        // ───────────────────────── ORGANIZAÇÃO DAS CAMADAS ─────────────────────────

        // Cria camadas independentes para controlar a ordem de exibição
        // dos diferentes elementos gráficos do mapa.
        //
        // O zIndex determina quais elementos aparecem na frente dos outros.
        map.createPane('rotasAlt').style.zIndex = 410;
        map.createPane('rotas').style.zIndex = 430;
        map.createPane('mista').style.zIndex = 450;


        // Cria uma camada para representar as zonas de risco.
        const camadaZonas = L.layerGroup().addTo(map);

        // Cria e adiciona as camadas utilizadas para organizar
        // os marcadores, rotas, rótulos e trechos de transporte público.
        camadaMarcadoresRef.current = L.layerGroup().addTo(map);
        camadaRotasRef.current = L.layerGroup().addTo(map);
        camadaRotulosRef.current = L.layerGroup().addTo(map);
        camadaMistaRef.current = L.layerGroup().addTo(map);


        // ───────────────────────── FORMATADOR DE INSTRUÇÕES ─────────────────────────

        // Cria o formatador padrão do Leaflet Routing Machine em português.
        // Ele funciona como alternativa quando a função própria
        // de tradução não reconhece determinado tipo de instrução.
        formatterRef.current = new L.Routing.Formatter({
            language: 'pt'
        });


        // ───────────────────────── CONTROLE DA CÂMERA LIVRE ─────────────────────────

        // Quando o usuário arrasta manualmente o mapa,
        // desativa o acompanhamento automático da localização.
        //
        // Dessa forma, o mapa não volta imediatamente para a posição
        // do usuário enquanto ele estiver explorando outra região.
        map.on('dragstart', () => {

            // Verifica se o acompanhamento automático estava ativado.
            if (seguirRef.current) {

                // Desativa o acompanhamento na referência.
                seguirRef.current = false;

                // Atualiza o estado para refletir a alteração na interface.
                setSeguirState(false);
            }
        });


        // ───────────────────────── CONFIGURAÇÃO DO SERVIÇO OSRM ─────────────────────────

        // Cria o roteador OSRM utilizado para calcular os percursos.
        // Inicialmente, utiliza o serviço de roteamento para carros.
        //
        // useHints: false desativa o uso de informações de referência
        // anteriores do OSRM nas solicitações.
        const router = L.Routing.osrmv1({
            serviceUrl: MODOS.driving.servico,
            profile: 'driving',
            useHints: false
        });


        // ───────────────────────── PERSONALIZAÇÃO DAS ALTERNATIVAS DO OSRM ─────────────────────────

        // Guarda a função original responsável por construir
        // a URL de solicitação de rotas do OSRM.
        const construirUrlOriginal = router.buildRouteUrl.bind(router);

        // Substitui a construção original da URL para permitir
        // solicitar uma quantidade específica de rotas alternativas.
        router.buildRouteUrl = (wps, opts) => {

            // Gera a URL original utilizando os parâmetros recebidos.
            const url = construirUrlOriginal(wps, opts);

            // Quando a solicitação é destinada a um desvio,
            // desativa a busca por alternativas adicionais.
            if (opts?.semAlternativas) {
                return url.replace(
                    'alternatives=true',
                    'alternatives=false'
                );
            }

            // Quando a opção numérica está ativada,
            // solicita a quantidade de alternativas configurada.
            //
            // Caso contrário, mantém o formato alternatives=true,
            // utilizado como alternativa de compatibilidade.
            return altNumericoRef.current
                ? url.replace(
                    'alternatives=true',
                    `alternatives=${MAX_ALTERNATIVAS}`
                )
                : url;
        };


        // ───────────────────────── ESTILO DAS ROTAS NATIVAS ─────────────────────────

        // Define um estilo invisível para as linhas criadas
        // automaticamente pelo Leaflet Routing Machine.
        //
        // Isso acontece porque as rotas serão desenhadas manualmente,
        // permitindo controlar melhor suas cores, espessuras,
        // interações e identificação visual.
        const estiloInvisivel = {
            styles: [
                {
                    color: '#000',
                    opacity: 0,
                    weight: 1
                }
            ]
        };


        // ───────────────────────── CRIAÇÃO DO CONTROLE DE ROTEAMENTO ─────────────────────────

        // Cria o controle principal do Leaflet Routing Machine.
        const routing = L.Routing.control({

            // Inicialmente, não existem pontos definidos para o percurso.
            waypoints: [],

            // Utiliza o roteador OSRM configurado anteriormente.
            router,

            // Define o idioma utilizado pelo formatador padrão.
            // As instruções principais são geradas pela função própria.
            language: 'pt',

            // Oculta a interface padrão do Leaflet Routing Machine.
            show: false,

            // Permite receber as rotas alternativas retornadas pelo OSRM.
            showAlternatives: true,

            // Impede que o mapa seja ajustado automaticamente
            // para a rota selecionada pelo controle.
            fitSelectedRoutes: false,

            // Impede que a rota seja recalculada automaticamente
            // durante o arraste dos pontos.
            routeWhileDragging: false,

            // Impede que o usuário adicione novos pontos pelo controle padrão.
            addWaypoints: false,

            // Impede que os pontos da rota sejam arrastados.
            draggableWaypoints: false,

            // Aplica o estilo invisível à rota principal.
            lineOptions: estiloInvisivel,

            // Aplica o mesmo estilo às rotas alternativas.
            altLineOptions: estiloInvisivel,


            // Define como as linhas das rotas serão criadas.
            // Em vez de desenhar as linhas automaticamente,
            // cria uma camada vazia que mantém os limites geográficos.
            routeLine: (route) => {

                // Cria uma camada vazia do Leaflet.
                const vazio = L.layerGroup();

                // Define os limites geográficos da rota.
                // Esses limites continuam disponíveis para os cálculos
                // de enquadramento do mapa.
                vazio.getBounds = () => (
                    L.latLngBounds(route.coordinates)
                );

                // Retorna a camada vazia.
                return vazio;
            },

            // Impede a criação automática de marcadores para os waypoints.
            // Isso mantém invisível também o ponto de fuga utilizado nos desvios.
            createMarker: () => null

        }).addTo(map);


        // Armazena o controle de roteamento para ser utilizado
        // pelas demais funções do componente.
        routingRef.current = routing;


        // ───────────────────────── EVENTO: ROTAS ENCONTRADAS ─────────────────────────

        // Escuta o evento routesfound, disparado quando o OSRM
        // retorna uma ou mais rotas calculadas.
        routing.on('routesfound', (e) => {

            // Envia todas as rotas encontradas para a função
            // responsável por analisar zonas de risco e alternativas.
            processarRotasRef.current?.(e.routes);
        });


        // ───────────────────────── EVENTO: ERRO DE ROTEAMENTO ─────────────────────────

        // Escuta erros ocorridos durante a solicitação de rotas.
        routing.on('routingerror', () => {

            // Alguns servidores OSRM não aceitam alternatives
            // acompanhado de um valor numérico.
            //
            // Se a primeira tentativa falhar, altera o formato
            // da solicitação e tenta novamente.
            if (altNumericoRef.current) {

                // Desativa o formato numérico de alternativas.
                altNumericoRef.current = false;

                // Solicita novamente o cálculo da rota.
                routing.route();

                return;
            }

            // Se a tentativa alternativa também falhar,
            // apresenta uma mensagem de erro ao usuário.
            setErroRota(
                'Não foi possível calcular a rota. Tente novamente em instantes.'
            );
        });


        // ───────────────────────── CARREGAMENTO DAS ZONAS DE RISCO ─────────────────────────

        // Executa uma função assíncrona para consultar o banco de dados.
        // As zonas de risco são armazenadas na tabela zonas_risco do Supabase.
        (async () => {

            // Consulta todos os registros da tabela zonas_risco.
            const {
                data,
                error
            } = await supabase
                .from('zonas_risco')
                .select('*');

            // Verifica se o componente foi desmontado,
            // se ocorreu algum erro ou se não existem dados.
            if (cancelado || error || !data) return;


            // ───────────────────────── TRATAMENTO DOS DADOS RECEBIDOS ─────────────────────────

            // Organiza os registros retornados pelo Supabase.
            const zonas = data

                // Converte latitude e longitude para números decimais.
                .map((z) => ({
                    ...z,
                    lat: parseFloat(z.latitude),
                    lng: parseFloat(z.longitude)
                }))

                // Remove registros que não possuem coordenadas numéricas válidas.
                .filter((z) => (
                    Number.isFinite(z.lat) &&
                    Number.isFinite(z.lng)
                ));


            // Armazena as zonas válidas na referência da aplicação.
            zonasRiscoRef.current = zonas;


            // ───────────────────────── DESENHO DAS ZONAS NO MAPA ─────────────────────────

            // Percorre todas as zonas cadastradas para representá-las visualmente.
            zonas.forEach((z) => {

                // Cria um círculo ao redor das coordenadas da zona.
                // O raio corresponde ao limite de risco configurado.
                L.circle(
                    [z.lat, z.lng],
                    {
                        color: 'red',
                        fillColor: '#f03',
                        fillOpacity: 0.5,
                        radius: RAIO_RISCO_M
                    }
                )

                    // Adiciona uma mensagem explicativa ao clicar no círculo.
                    .bindPopup('⚠️ Zona de Alagamento')

                    // Adiciona o círculo à camada de zonas de risco do mapa.
                    .addTo(camadaZonas);
            });

        })();


        // ───────────────────────── LIMPEZA DO COMPONENTE ─────────────────────────

        // Executa quando o componente é desmontado.
        // Evita que operações assíncronas continuem tentando atualizar
        // uma interface que já não existe.
        return () => {

            // Informa às operações assíncronas que o componente foi desmontado.
            cancelado = true;

            // Remove o mapa e seus elementos associados,
            // liberando os recursos utilizados pelo Leaflet.
            map.remove();
            // ───── Finalização da limpeza do mapa ─────

            // Remove as referências dos elementos do mapa.
            // Isso evita que o componente continue apontando para objetos que já foram destruídos.
            mapRef.current = null;
            routingRef.current = null;
            camadaMarcadoresRef.current = null;
            camadaRotasRef.current = null;
            camadaRotulosRef.current = null;
            camadaMistaRef.current = null;
            marcadorUsuarioRef.current = null;
            precisaoRef.current = null;
        };

        // Executa a limpeza quando o componente é desmontado.
    }, []);

    // ───── Atualização das referências das funções ─────

    // Mantém as referências atualizadas com as versões mais recentes das funções.
    // Isso é importante porque os eventos do Leaflet podem continuar utilizando
    // funções registradas anteriormente.
    useEffect(() => {
        processarRotasRef.current = processarRotas;
        selecionarRotaRef.current = selecionarRota;
    });

    // ───── Limpeza geral dos recursos ─────

    useEffect(() => {
        const timers = timersRef.current;
        const aborts = abortRef.current;

        // Esta função é executada quando o componente é desmontado.
        return () => {
            // Cancela todos os temporizadores pendentes.
            Object.values(timers).forEach(clearTimeout);

            // Cancela requisições que ainda estejam em andamento.
            Object.values(aborts).forEach((c) => c?.abort());

            // Interrompe o monitoramento contínuo da localização GPS.
            if (watchIdRef.current != null && typeof navigator !== 'undefined') {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }

            // Libera o bloqueio que impede a tela de apagar durante a navegação.
            wakeLockRef.current?.release?.().catch(() => { });
        };
    }, []);

    // ───── Câmera imersiva ─────

    // Atualiza as dimensões internas do mapa quando a dimensão da câmera 3D muda.
    useEffect(() => {
        mapRef.current?.invalidateSize({ animate: false });
    }, [dim3d]);

    // Controla a transição entre a câmera 2D e a câmera imersiva 3D.
    useEffect(() => {
        // Informa às outras funções se a câmera está no modo imersivo.
        cameraImersivaRef.current = camera === '3d';

        // Função auxiliar para centralizar novamente o mapa na posição do usuário.
        const recentrar = (animar) => {
            const pos = posExibidaRef.current;

            if (pos && mapRef.current) {
                centralizarCamera(pos, animar);
            }
        };

        // Estado de preparação: aguarda um pequeno intervalo antes de ativar o 3D.
        if (camera === 'prep') {
            const t = setTimeout(() => setCamera('3d'), 60);
            return () => clearTimeout(t);
        }

        // Quando a câmera está em 3D, atualiza sua rotação e centraliza o mapa.
        if (camera === '3d') {
            atualizarGiro();
            recentrar(true);
            return undefined;
        }

        // Estado de saída: anima o retorno e depois restaura a visão 2D.
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

    // Recalcula as dimensões da cena 3D quando a janela é redimensionada.
    useEffect(() => {
        if (camera === '2d') return undefined;

        const aoRedimensionar = () => {
            const cena = cenaRef.current;
            if (!cena) return;

            setDim3d(
                dimensoesCena3D(
                    cena.clientWidth,
                    cena.clientHeight,
                    ROTACIONAR_MAPA_NA_VISAO_3D
                )
            );
        };

        // Registra o evento de redimensionamento da janela.
        window.addEventListener('resize', aoRedimensionar);

        // Remove o evento quando necessário.
        return () => window.removeEventListener('resize', aoRedimensionar);
    }, [camera]);

    // Se a navegação for encerrada, restaura automaticamente a câmera 2D.
    useEffect(() => {
        if (fase !== 'navegando' && camera !== '2d') {
            resetarCamera();
        }
    }, [fase, camera]);

    // Alterna entre a visão superior 2D e a visão imersiva 3D.
    function alternarCamera() {
        if (camera === '2d') {
            const cena = cenaRef.current;
            if (!cena) return;

            // Calcula o tamanho necessário para a cena inclinada.
            setDim3d(
                dimensoesCena3D(
                    cena.clientWidth,
                    cena.clientHeight,
                    ROTACIONAR_MAPA_NA_VISAO_3D
                )
            );

            // Na visão 3D, a câmera acompanha obrigatoriamente o motorista.
            definirSeguir(true);

            // Inicia a transição para o modo 3D.
            setCamera('prep');
        } else if (camera === '3d') {
            // Inicia a transição de volta para o modo 2D.
            setCamera('saindo');
        }
    }

    // Restaura a câmera para a visão superior.
    function resetarCamera() {
        cameraImersivaRef.current = false;
        setCamera('2d');
        setDim3d(null);
    }

    // Atualiza a rotação do mapa de acordo com a direção do usuário.
    function atualizarGiro() {
        const giro = ROTACIONAR_MAPA_NA_VISAO_3D
            ? -anguloRef.current
            : 0;

        // A rotação é aplicada por meio de uma variável CSS.
        rootRef.current?.style.setProperty('--mabc-giro', `${giro}deg`);
    }

    // Centraliza o mapa na posição atual do motorista.
    function centralizarCamera(ll, animar = true) {
        const map = mapRef.current;
        if (!map) return;

        // Com a câmera 2D, o mapa é centralizado diretamente na posição recebida.
        if (!cameraImersivaRef.current) {
            // O zoom mínimo é aplicado apenas na primeira localização.
            // Depois disso, o zoom escolhido pelo usuário é preservado.
            const zoom = zoomInicialRef.current
                ? map.getZoom()
                : Math.max(map.getZoom(), ZOOM_NAVEGACAO);

            zoomInicialRef.current = true;

            map.setView(ll, zoom, {
                animate: animar,
                duration: 0.8
            });

            return;
        }

        // Na visão 3D, mantém um nível de zoom mínimo.
        const zoom = Math.max(map.getZoom(), ZOOM_IMERSIVO);

        // Obtém a altura disponível para a cena.
        const alturaCena = cenaRef.current?.clientHeight || window.innerHeight;

        // Calcula o deslocamento da câmera em pixels.
        const offset = offsetCameraPx(alturaCena);

        // Converte o ângulo atual para radianos.
        const rad = ROTACIONAR_MAPA_NA_VISAO_3D
            ? (anguloRef.current * Math.PI) / 180
            : 0;

        // Converte a coordenada geográfica em coordenadas de pixel.
        const p = map.project(ll, zoom);

        // Calcula o centro deslocado para manter o motorista em uma posição
        // mais baixa na tela, permitindo visualizar melhor o caminho à frente.
        const centro = map.unproject(
            L.point(
                p.x + Math.sin(rad) * offset,
                p.y - Math.cos(rad) * offset
            ),
            zoom
        );

        // Aplica a nova posição central do mapa.
        map.setView(centro, zoom, {
            animate: animar,
            duration: 0.8
        });
    }

    // Botão flutuante "Centralizar": ativa novamente o acompanhamento do usuário.
    function centralizar() {
        definirSeguir(true);

        const pos = posExibidaRef.current;

        if (pos) {
            centralizarCamera(pos, true);
        }
    }

    // ───── Marcadores de origem e destino ─────

    useEffect(() => {
        const camada = camadaMarcadoresRef.current;
        if (!camada) return;

        // Remove os marcadores anteriores antes de desenhar os novos.
        camada.clearLayers();

        // Desenha um círculo azul para representar o ponto de origem.
        if (origem.coord) {
            L.circleMarker(
                [origem.coord.lat, origem.coord.lng],
                {
                    radius: 9,
                    color: '#fff',
                    weight: 3,
                    fillColor: COR_AZUL,
                    fillOpacity: 1
                }
            )
                .bindTooltip('Origem')
                .addTo(camada);
        }

        // Desenha um círculo azul-marinho para representar o destino.
        if (destino.coord) {
            L.circleMarker(
                [destino.coord.lat, destino.coord.lng],
                {
                    radius: 9,
                    color: '#fff',
                    weight: 3,
                    fillColor: COR_MARINHO,
                    fillOpacity: 1
                }
            )
                .bindTooltip('Destino')
                .addTo(camada);
        }
    }, [origem.coord, destino.coord]);

    // ───── Desenho das rotas ─────
    // A rota selecionada recebe destaque visual.
    // As rotas alternativas permanecem clicáveis para permitir a troca.

    useEffect(() => {
        const camada = camadaRotasRef.current;
        const rotulos = camadaRotulosRef.current;

        if (!camada || !rotulos) return;

        // Limpa os desenhos anteriores.
        camada.clearLayers();
        rotulos.clearLayers();

        const navegando = fase === 'navegando';
        const estilo = MODOS[modo].estilo;

        // Antes da navegação, desenha em vermelho as rotas bloqueadas.
        if (!navegando) {
            bloqueadas.forEach((coords) => {
                L.polyline(coords, {
                    color: '#dc2626',
                    weight: 4,
                    opacity: 0.75,
                    dashArray: '8, 8',
                    pane: 'rotasAlt',
                    interactive: false
                }).addTo(camada);
            });
        }

        // Percorre todas as rotas disponíveis.
        candidatas.forEach((c, i) => {
            const sel = i === selecionada;

            // Durante a navegação, somente a rota escolhida é exibida.
            if (navegando && !sel) return;

            if (sel) {
                // Desenha uma linha branca mais larga por baixo da rota principal.
                // Isso cria um contorno que melhora sua visibilidade.
                L.polyline(c.coordenadas, {
                    color: '#fff',
                    weight: estilo.weight + 5,
                    opacity: 0.95,
                    pane: 'rotas',
                    interactive: false
                }).addTo(camada);

                // Desenha a rota principal por cima do contorno.
                L.polyline(c.coordenadas, {
                    ...estilo,
                    pane: 'rotas',
                    interactive: false
                }).addTo(camada);
            } else {
                // Desenha as rotas alternativas com uma cor mais clara.
                L.polyline(c.coordenadas, {
                    color: COR_AZUL_CLARO,
                    weight: 7,
                    opacity: 0.9,
                    pane: 'rotasAlt',
                    interactive: false
                }).addTo(camada);

                // Cria uma linha transparente mais larga para facilitar o clique.
                L.polyline(c.coordenadas, {
                    color: '#000',
                    weight: 24,
                    opacity: 0.01,
                    pane: 'rotasAlt',
                    bubblingMouseEvents: false
                })
                    .on('click', () => selecionarRotaRef.current?.(i))
                    .addTo(camada);
            }

            // Mostra o tempo estimado ou o número da opção sobre cada rota.
            if (!navegando && candidatas.length > 1) {
                const frac = [0.5, 0.35, 0.65][i] ?? 0.5;

                // Escolhe uma posição ao longo da rota para colocar o rótulo.
                const ponto = c.coordenadas[
                    indiceNaDistancia(c.acumulada, c.total * frac)
                ];

                const texto = modo === 'transit'
                    ? `Opção ${i + 1}`
                    : formatarTempo(c.tempo);

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

    // ───── Trechos da rota mista ─────
    // Desenha separadamente os segmentos da rota que utilizam modalidades diferentes,
    // como caminhada e transporte público.

    useEffect(() => {
        const camada = camadaMistaRef.current;
        if (!camada) return;

        camada.clearLayers();

        // Se não houver trechos cadastrados, não há nada para desenhar.
        if (!rotaAtual?.trechos) return;

        let d = 0;

        rotaAtual.trechos.forEach((t) => {
            // Utiliza as coordenadas próprias do trecho.
            // Se elas não existirem, extrai as coordenadas da rota completa.
            const pontos = t.coordenadas
                || fatiarCoordenadas(
                    rotaAtual.coordenadas,
                    rotaAtual.acumulada,
                    d,
                    d + t.distanciaM
                );

            d += t.distanciaM;

            // Desenha o trecho somente quando existem pelo menos dois pontos.
            if (pontos.length > 1) {
                L.polyline(pontos, {
                    ...ESTILOS_TRECHO[t.modalidade],
                    pane: 'mista',
                    interactive: false
                }).addTo(camada);
            }
        });
    }, [rotaAtual]);

    // ───── Autocomplete de endereços (Photon) ─────

    // Busca sugestões de endereços conforme o usuário digita.
    const buscarSugestoes = useCallback(async (campo, termo) => {
        // Cancela a busca anterior do mesmo campo.
        abortRef.current[campo]?.abort();

        // Cria um controlador para permitir cancelar a nova requisição.
        const controller = new AbortController();
        abortRef.current[campo] = controller;

        try {
            // Prepara os parâmetros enviados para a API Photon.
            const params = new URLSearchParams({
                q: termo,
                limit: '5',
                lat: String(CENTRO_ABC.lat),
                lon: String(CENTRO_ABC.lng),
                bbox: BBOX_ABC
            });

            // Faz a consulta à API de busca de lugares.
            const res = await fetch(
                `${PHOTON_URL}?${params}`,
                { signal: controller.signal }
            );

            if (!res.ok) throw new Error(`Photon ${res.status}`);

            const json = await res.json();

            // Utiliza um Set para impedir sugestões duplicadas.
            const vistos = new Set();
            const lista = [];

            for (const feature of json.features || []) {
                const s = formatarSugestao(feature);

                if (vistos.has(s.id)) continue;

                vistos.add(s.id);
                lista.push(s);
            }

            // Atualiza somente a lista do campo que realizou a busca.
            setSugestoes((prev) => ({
                ...prev,
                [campo]: lista
            }));

            setIdxAtivo(-1);
        } catch (err) {
            // O cancelamento de uma busca não deve ser tratado como erro.
            if (err.name !== 'AbortError') {
                console.error('Erro no autocomplete:', err);

                setSugestoes((prev) => ({
                    ...prev,
                    [campo]: []
                }));
            }
        }
    }, []);

    // Atualiza o campo de origem ou destino conforme o usuário digita.
    function handleChange(campo, valor) {
        // Salva o texto digitado e limpa a coordenada anterior,
        // pois o novo endereço ainda não foi selecionado.
        setters[campo]({ texto: valor, coord: null });

        setCampoAberto(campo);
        setIdxAtivo(-1);

        // Cancela o temporizador e a busca anterior.
        clearTimeout(timersRef.current[campo]);
        abortRef.current[campo]?.abort();

        const termo = valor.trim();

        // Exige uma quantidade mínima de caracteres para pesquisar.
        if (termo.length < MIN_CHARS) {
            setSugestoes((prev) => ({
                ...prev,
                [campo]: []
            }));
            return;
        }

        // Aguarda um intervalo antes de consultar a API.
        // Isso evita fazer uma requisição a cada tecla digitada.
        timersRef.current[campo] = setTimeout(
            () => buscarSugestoes(campo, termo),
            DEBOUNCE_MS
        );
    }

    // Seleciona uma sugestão e registra suas coordenadas.
    // A seleção não calcula a rota automaticamente.
    function selecionarSugestao(campo, s) {
        setters[campo]({
            texto: s.texto,
            coord: {
                lat: s.lat,
                lng: s.lng
            }
        });

        // Fecha a lista de sugestões e limpa o estado de seleção.
        setSugestoes((prev) => ({
            ...prev,
            [campo]: []
        }));

        setCampoAberto(null);
        setIdxAtivo(-1);
        setErroRota('');

        // Move o mapa para o endereço selecionado.
        mapRef.current?.panTo([s.lat, s.lng]);
    }

    // ───── Botão "Meu Local" ─────
    // Obtém a localização atual do usuário em uma única leitura,
    // sem iniciar o acompanhamento contínuo do GPS.

    function usarMeuLocal() {
        // Verifica se o navegador oferece suporte à geolocalização.
        if (
            typeof navigator === 'undefined'
            || !('geolocation' in navigator)
        ) {
            setErroRota('Seu navegador não suporta geolocalização.');
            return;
        }

        // A geolocalização exige uma conexão segura, normalmente HTTPS.
        if (!window.isSecureContext) {
            setErroRota('A localização só funciona em conexão segura (HTTPS).');
            return;
        }

        // Solicita a posição atual do dispositivo.
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const {
                    latitude: lat,
                    longitude: lng
                } = pos.coords;

                // Define a posição atual como origem.
                setOrigem({
                    texto: 'Minha localização',
                    coord: { lat, lng }
                });

                // Limpa as sugestões anteriores.
                setSugestoes((prev) => ({
                    ...prev,
                    origem: []
                }));

                setCampoAberto(null);
                setErroRota('');
                setLocalizando(false);

                // Centraliza o mapa na posição obtida.
                const map = mapRef.current;

                if (map) {
                    map.setView(
                        [lat, lng],
                        Math.max(map.getZoom(), 15),
                        { animate: true }
                    );
                }

                // Coloca o foco no campo de destino.
                inputDestinoRef.current?.focus();
            },
            (err) => {
                // Trata falhas de localização e encerra o indicador de carregamento.
                setLocalizando(false);
                setErroRota(mensagemErroGPS(err));
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 10000
            }
        );

        setErroRota('');
        setLocalizando(true);
    }

    // ───── Cálculo de rota ─────

    // Recebe as coordenadas de origem e destino e solicita o cálculo do trajeto.
    function calcular(inicio, fim) {
        const routing = routingRef.current;

        if (!routing) return;

        // Limpa mensagens anteriores e registra os pontos da rota.
        setErroRota('');
        setEmPerigo(false);
        setCampoAberto(null);

        rotaRef.current = { inicio, fim };

        // No modo de transporte público real, utiliza a API própria de transporte.
        // Nesse caso, não utiliza o OSRM para construir a geometria da rota.
        if (modoRef.current === 'transit' && TRANSPORTE_PUBLICO_REAL) {
            carregarRotaMistaReal(inicio, fim);
            return;
        }

        // Define os pontos de partida e chegada no sistema de roteamento.
        // O evento "routesfound" será responsável por processar os resultados.
        routing.setWaypoints([inicio, fim]);
    }

    // Carrega uma rota de transporte público diretamente da API GTFS.
    // A geometria dos trechos é fornecida pela própria API.
    async function carregarRotaMistaReal(inicio, fim) {
        // Gera um identificador para diferenciar solicitações.
        // Isso impede que uma resposta antiga substitua uma rota mais recente.
        const id = ++mistaReqRef.current;

        calcReqRef.current++;

        // Limpa as rotas anteriores.
        routingRef.current?.setWaypoints([]);
        candidatasRef.current = [];

        setCandidatas([]);
        setBloqueadas([]);

        try {
            // Consulta a API para obter os trechos de transporte público.
            const res = await obterRotaTransportePublico({
                origem: inicio,
                destino: fim,
                rotaViaria: null
            });

            // Ignora a resposta se uma nova solicitação tiver sido feita.
            if (id !== mistaReqRef.current) return;

            const coordenadas = [];

            // Junta as coordenadas de todos os trechos em uma única sequência.
            res.trechos.forEach((t) => {
                t.indiceInicio = coordenadas.length;
                coordenadas.push(...(t.coordenadas || []));
            });

            // Publica a rota montada e ajusta o enquadramento do mapa.
            publicarRotaMista(res, coordenadas);

            entrarNoItinerario(L.latLngBounds(coordenadas));
        } catch (err) {
            // Também ignora erros de solicitações antigas.
            if (id !== mistaReqRef.current) return;

            console.error(err);

            setRotaAtual(null);
            setErroRota('Não foi possível montar a rota de transporte público.');
        }
    }

    // Inicia o cálculo quando o usuário pressiona Enter com origem e destino definidos.
    function tracarRota() {
        if (!origem.coord || !destino.coord) {
            setErroRota(
                'Defina origem e destino (use as sugestões ou "Meu local") e pressione Enter.'
            );
            return;
        }

        // Converte as coordenadas salvas em objetos LatLng do Leaflet.
        calcular(
            L.latLng(origem.coord.lat, origem.coord.lng),
            L.latLng(destino.coord.lat, destino.coord.lng)
        );
    }

    // Altera o meio de transporte e recalcula a rota atual, se existir.
    function mudarModo(novo) {
        modoRef.current = novo;
        setModo(novo);

        const routing = routingRef.current;
        if (!routing) return;

        // Atualiza as configurações do mecanismo de roteamento.
        aplicarModoNoRouter(routing, novo);

        // Se já houver uma rota, solicita um novo cálculo com o modo escolhido.
        if (rotaRef.current) {
            calcular(
                rotaRef.current.inicio,
                rotaRef.current.fim
            );
        }
    }

    // Inverte os pontos de origem e destino.
    function inverter() {
        const novaOrigem = destino;
        const novoDestino = origem;

        setOrigem(novaOrigem);
        setDestino(novoDestino);

        // Limpa as sugestões dos dois campos.
        setSugestoes({
            origem: [],
            destino: []
        });

        // Se já havia uma rota calculada, calcula novamente no sentido inverso.
        if (
            rotaRef.current
            && novaOrigem.coord
            && novoDestino.coord
        ) {
            calcular(
                L.latLng(novaOrigem.coord.lat, novaOrigem.coord.lng),
                L.latLng(novoDestino.coord.lat, novoDestino.coord.lng)
            );
        }
    }

    // Limpa a rota e retorna a aplicação ao estado inicial.
    function limparRota() {
        // Interrompe o GPS e restaura a câmera.
        pararGPS();
        resetarCamera();

        // Invalida solicitações que ainda estejam em andamento.
        calcReqRef.current++;
        mistaReqRef.current++;

        // Remove os pontos do sistema de roteamento.
        routingRef.current?.setWaypoints([]);

        rotaRef.current = null;
        candidatasRef.current = [];

        // Limpa os dados e estados da rota.
        setCandidatas([]);
        setBloqueadas([]);
        setSelecionada(0);

        setOrigem({ texto: '', coord: null });
        setDestino({ texto: '', coord: null });

        setSugestoes({
            origem: [],
            destino: []
        });

        setRotaAtual(null);
        setProgresso(null);
        setChegou(false);
        setEmPerigo(false);
        setErroRota('');

        // Retorna à tela de busca.
        setListaAberta(true);
        setFase('busca');
    }

    // Controla a navegação por teclado dentro da lista de sugestões.
    function handleKeyDown(e, campo) {
        const lista = sugestoes[campo];

        const dropdownVisivel =
            campoAberto === campo && lista.length > 0;

        // Seta para baixo: avança na lista.
        if (e.key === 'ArrowDown' && dropdownVisivel) {
            e.preventDefault();

            setIdxAtivo((i) => (i + 1) % lista.length);
        }

        // Seta para cima: retorna ao item anterior.
        else if (e.key === 'ArrowUp' && dropdownVisivel) {
            e.preventDefault();

            setIdxAtivo((i) =>
                i <= 0 ? lista.length - 1 : i - 1
            );
        }

        // Escape: fecha a lista de sugestões.
        else if (e.key === 'Escape') {
            setCampoAberto(null);
        }

        // Enter: seleciona a sugestão ativa ou calcula a rota.
        else if (e.key === 'Enter') {
            e.preventDefault();

            if (
                dropdownVisivel
                && idxAtivo >= 0
                && lista[idxAtivo]
            ) {
                selecionarSugestao(campo, lista[idxAtivo]);
            } else {
                tracarRota();
            }
        }
    }

    // ───── Navegação em tempo real (GPS) ─────

    // Solicita ao navegador que mantenha a tela ligada durante a navegação.
    async function pedirWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            }
        } catch {
            // O recurso é opcional. Se não estiver disponível, a navegação continua.
        }
    }

    // Libera o bloqueio de tela ligado ao Wake Lock.
    function soltarWakeLock() {
        wakeLockRef.current?.release?.().catch(() => { });
        wakeLockRef.current = null;
    }

    // Interrompe o acompanhamento do GPS e remove os elementos relacionados.
    function pararGPS() {
        if (
            watchIdRef.current != null
            && typeof navigator !== 'undefined'
        ) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }

        watchIdRef.current = null;

        // Remove o marcador de posição e o círculo de precisão.
        marcadorUsuarioRef.current?.remove();
        precisaoRef.current?.remove();

        marcadorUsuarioRef.current = null;
        precisaoRef.current = null;

        // Limpa os dados usados para calcular direção e deslocamento.
        refRumoRef.current = null;
        filtroPosRef.current = null;
        posExibidaRef.current = null;
        idxRotaRef.current = null;

        anguloRef.current = 0;

        // Retorna a rotação do mapa ao valor inicial.
        rootRef.current?.style.setProperty('--mabc-giro', '0deg');

        soltarWakeLock();
    }

    // Aplica a direção de deslocamento à seta que representa o motorista.
    // A rotação ocorre no elemento interno, pois o Leaflet controla a posição
    // do elemento externo por meio de transformações próprias.
    function aplicarRumoNaSeta() {
        const el = marcadorUsuarioRef.current?.getElement();

        const rot = el?.querySelector('.mabc-seta-rot');

        if (rot) {
            rot.style.transform = `rotate(${anguloRef.current}deg)`;
        }
    }

    // Processa cada atualização recebida pelo GPS.
    // O processamento ocorre em três etapas:
    // 1. Ajuste da posição à rota.
    // 2. Filtro de deslocamento e direção.
    // 3. Atualização do marcador, da câmera e do progresso.
    function aoReceberPosicao(pos) {
        const map = mapRef.current;
        if (!map) return;

        const {
            latitude: lat,
            longitude: lng,
            accuracy,
            heading,
            speed
        } = pos.coords;

        // Cria uma coordenada geográfica com a posição recebida.
        const bruto = L.latLng(lat, lng);

        // Guarda a última posição real recebida pelo GPS.
        ultimaPosRef.current = { lat, lng };

        // 1. SNAP-TO-ROUTE
        // Procura o ponto da rota selecionada mais próximo da localização GPS.
        const rota = rotaAtualRef.current;

        const proj = rota?.coordenadas?.length > 1
            ? projetarNaRota(
                rota.coordenadas,
                lat,
                lng,
                idxRotaRef.current
            )
            : null;

        // Define a distância máxima aceita para considerar o usuário sobre a rota.
        const limiteSnap = Math.max(
            LIMITE_SNAP_M,
            Math.min(accuracy || 0, 60)
        );

        const colado = !!proj && proj.desvioM <= limiteSnap;

        // Se estiver suficientemente próximo, utiliza a posição projetada na rota.
        // Caso contrário, utiliza a posição real do GPS.
        const exibido = colado ? proj.ponto : bruto;

        if (colado) {
            idxRotaRef.current = proj.idx;
        }

        // 2. FILTRO DE SENSIBILIDADE
        // Verifica se houve deslocamento significativo desde a última leitura.
        const anteriorFiltro = filtroPosRef.current;

        const deslocou =
            !anteriorFiltro
            || anteriorFiltro.distanceTo(exibido) > LIMIAR_DESLOCAMENTO_M;

        // Determina a direção de movimento.
        // A prioridade é: direção do segmento da rota, direção do GPS
        // e, por último, direção calculada entre duas posições.
        const refRumo = refRumoRef.current;

        const moveuParaRumo = refRumo
            ? refRumo.distanceTo(exibido) > 5
            : false;

        const rumoGPS =
            Number.isFinite(heading)
                && (speed == null || speed > 0.8)
                ? heading
                : null;

        let rumo = null;

        if (colado) {
            // Se o GPS indicar direção muito diferente da rota,
            // considera que o usuário pode estar retornando ou em sentido contrário.
            rumo =
                rumoGPS != null
                    && difAngular(rumoGPS, proj.rumoSegmento) > 90
                    ? rumoGPS
                    : proj.rumoSegmento;
        } else {
            // Fora da rota, utiliza a direção do GPS ou calcula a direção
            // a partir do deslocamento entre as leituras.
            rumo = rumoGPS
                ?? (moveuParaRumo ? calcularRumo(refRumo, exibido) : null);
        }

        // Atualiza a referência utilizada para calcular a direção.
        if (!refRumo || moveuParaRumo) {
            refRumoRef.current = exibido;
        }

        // Verifica se a mudança de direção é suficientemente grande.
        const girou =
            rumo != null
            && difAngular(rumo, anguloRef.current) >= LIMIAR_ANGULO_GRAUS;

        // Ignora pequenas variações causadas por imprecisões do GPS.
        if (!deslocou && !girou) return;

        if (girou) {
            // Calcula a menor diferença angular entre a direção anterior e a nova.
            // Isso evita que a seta gire pelo caminho mais longo, como de 359° para 1°.
            const delta =
                ((((rumo - anguloRef.current + 540) % 360) + 360) % 360) - 180;

            anguloRef.current += delta;
        }

        // 3. ATUALIZAÇÃO DO MARCADOR
        let criouAgora = false;

        if (deslocou) {
            filtroPosRef.current = exibido;
            posExibidaRef.current = exibido;

            // Se ainda não existe marcador, cria a seta que representa o usuário.
            if (!marcadorUsuarioRef.current) {
                criouAgora = true;

                marcadorUsuarioRef.current = L.marker(exibido, {
                    icon: L.divIcon({
                        className: 'mabc-seta',
                        html:
                            '<div class="mabc-seta-wrap"><span class="mabc-seta-pulso"></span>' +
                            `<div class="mabc-seta-rot"><svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="${COR_AZUL_CLARO}" stroke="${COR_MARINHO}" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>`,
                        iconSize: [44, 44],
                        iconAnchor: [22, 22]
                    }),
                    interactive: false,
                    keyboard: false,
                    zIndexOffset: 1000
                }).addTo(map);

                // Cria um círculo que representa a margem de precisão do GPS.
                precisaoRef.current = L.circle(exibido, {
                    radius: colado ? 0 : accuracy,
                    stroke: false,
                    fillColor: COR_AZUL,
                    fillOpacity: 0.14,
                    interactive: false
                }).addTo(map);
            } else {
                // Atualiza a posição do marcador existente.
                marcadorUsuarioRef.current.setLatLng(exibido);

                // Atualiza o círculo de precisão.
                // Ele desaparece quando o usuário está ajustado à rota.
                precisaoRef.current
                    .setLatLng(exibido)
                    .setRadius(colado ? 0 : accuracy);
            }
        }

        // Atualiza a orientação da seta e a rotação do mapa.
        if (girou || criouAgora) {
            aplicarRumoNaSeta();
            atualizarGiro();
        }

        // A câmera acompanha o usuário somente quando o modo de acompanhamento
        // está ativo. Na visão imersiva, também acompanha mudanças de direção.
        if (
            seguirRef.current
            && posExibidaRef.current
            && (deslocou || (girou && cameraImersivaRef.current))
        ) {
            centralizarCamera(posExibidaRef.current);
        }

        // Atualiza o progresso quando a posição foi ajustada à rota.
        if (deslocou && proj) {
            const prog = calcularProgresso(rota, proj, accuracy);

            if (prog) {
                setProgresso(prog);

                // Verifica se o usuário chegou suficientemente perto do destino.
                if (prog.restanteM <= RAIO_CHEGADA_M) {
                    setChegou(true);

                    // Encerra o monitoramento do GPS.
                    if (watchIdRef.current != null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                    }

                    watchIdRef.current = null;

                    // Libera o bloqueio que mantinha a tela ligada.
                    soltarWakeLock();
                }
            }
        }
    }

    // Trata erros recebidos durante o acompanhamento do GPS.
    function aoErroPosicao(err) {
        setErroRota(mensagemErroGPS(err));

        // Se o usuário negar a permissão de localização, encerra a navegação.
        if (err.code === 1) {
            encerrarNavegacao();
        }
    }

    // Botão "Ir Agora": inicia a navegação em tempo real.
    function iniciarNavegacao() {
        const rota = rotaAtualRef.current;

        // Não inicia se não houver rota ou se ela ainda estiver sendo carregada.
        if (!rota || rota.carregando) return;

        // Verifica o suporte do navegador à geolocalização.
        if (
            typeof navigator === 'undefined'
            || !('geolocation' in navigator)
        ) {
            setErroRota('Seu navegador não suporta geolocalização.');
            return;
        }

        // Exige conexão segura para utilizar o GPS.
        if (!window.isSecureContext) {
            setErroRota('A navegação por GPS só funciona em conexão segura (HTTPS).');
            return;
        }

        // Encerra um monitoramento anterior, caso exista.
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }

        // Inicia o monitoramento contínuo da posição do usuário.
        watchIdRef.current = navigator.geolocation.watchPosition(
            aoReceberPosicao,
            aoErroPosicao,
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 20000
            }
        );

        // Reinicia as referências utilizadas no processamento das posições.
        filtroPosRef.current = null;
        posExibidaRef.current = null;
        refRumoRef.current = null;
        idxRotaRef.current = null;
        zoomInicialRef.current = false;

        // Atualiza os estados da interface para iniciar a navegação.
        setErroRota('');
        setChegou(false);
        setProgresso(null);
        setListaAberta(true);

        // Ativa o acompanhamento automático da câmera.
        definirSeguir(true);

        // Altera a fase da aplicação para navegação.
        setFase('navegando');

        // Solicita que a tela permaneça ligada.
        pedirWakeLock();
    }

    // Encerra a navegação em tempo real e retorna ao itinerário.
    function encerrarNavegacao() {
        pararGPS();
        resetarCamera();

        setChegou(false);
        setProgresso(null);
        setListaAberta(true);

        // Só altera a fase se a aplicação estiver efetivamente navegando.
        setFase((f) => (f === 'navegando' ? 'itinerario' : f));
    }

    // Se o usuário sair da rota, permite recalcular o trajeto a partir
    // da última posição GPS registrada.
    function recalcularDaqui() {
        const pos = ultimaPosRef.current;
        const r = rotaRef.current;

        if (!pos || !r) return;

        // Atualiza a origem para a localização atual.
        setOrigem({
            texto: 'Minha localização',
            coord: pos
        });

        // Calcula novamente o caminho até o destino original.
        calcular(
            L.latLng(pos.lat, pos.lng),
            r.fim
        );
    }

    // ───── Preparação dos dados utilizados na renderização ─────

    // Recupera as configurações do meio de transporte selecionado.
    const cfgModo = MODOS[modo];

    // Exibe um aviso quando o transporte público ainda não utiliza a API real.
    const avisoModo =
        modo === 'transit' && !TRANSPORTE_PUBLICO_REAL
            ? cfgModo.aviso
            : null;

    // Identifica a próxima instrução de navegação com base no progresso.
    const proximoPasso =
        progresso && rotaAtual
            ? rotaAtual.passos[progresso.idxProximo]
            : null;

    // Define se a câmera está na visão imersiva ou em preparação para ela.
    const imersiva = camera === '3d' || camera === 'prep';

    // Calcula o posicionamento e as dimensões do mapa na cena 3D.
    const estiloMapa = dim3d
        ? {
            left: '50%',
            top: '50%',
            right: 'auto',
            bottom: 'auto',
            width: dim3d.w,
            height: dim3d.h,
            marginLeft: -dim3d.w / 2,
            marginTop: -dim3d.h / 2
        }
        : undefined;

    // ───── Renderização dos modos de transporte ─────

    // Cria os botões para escolher o meio de transporte.
    // O parâmetro comLimpar define se o botão de limpar rota será exibido.
    function renderModos(comLimpar) {
        return (
            <div
                className="mabc-modos"
                role="group"
                aria-label="Meio de transporte"
            >
                {/* Percorre os modos disponíveis e cria um botão para cada um. */}
                {Object.entries(MODOS).map(([chave, m]) => (
                    <button
                        key={chave}
                        type="button"
                        className={`mabc-modo${modo === chave ? ' ativo' : ''}`}
                        onClick={() => mudarModo(chave)}
                        aria-pressed={modo === chave}
                        aria-label={m.rotulo}
                        title={m.rotulo}
                    >
                        <Icone nome={m.icone} size={20} />
                    </button>
                ))}

                {/* Exibe o botão de limpeza quando solicitado. */}
                {comLimpar && (
                    <button
                        type="button"
                        className="mabc-icone-btn"
                        onClick={limparRota}
                        aria-label="Limpar rota"
                        title="Limpar"
                    >
                        <Icone nome="close" size={18} />
                    </button>
                )}
            </div>
        );
    }

    // ───── Renderização dos campos de origem e destino ─────

    // Cria um campo de texto com autocomplete.
    // O mesmo componente é utilizado tanto para origem quanto para destino.
    function renderCampo(campo, estado, placeholder, acaoExtra) {
        const lista = sugestoes[campo];

        // Verifica se as sugestões daquele campo devem aparecer.
        const mostrar = campoAberto === campo && lista.length > 0;

        return (
            <div className="mabc-campo">
                <input
                    // A referência é atribuída somente ao campo de destino.
                    ref={campo === 'destino' ? inputDestinoRef : undefined}
                    type="text"
                    className={`mabc-input${estado.coord ? ' definido' : ''}${acaoExtra ? ' com-acao' : ''}`}
                    value={estado.texto}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={placeholder}
                    onChange={(e) => handleChange(campo, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, campo)}
                    onFocus={() => setCampoAberto(campo)}
                    onBlur={() => setCampoAberto(null)}
                />

                {/* Permite adicionar uma ação extra ao campo, como o botão Meu Local. */}
                {acaoExtra}

                {/* Lista suspensa com as sugestões encontradas pela API. */}
                {mostrar && (
                    <ul className="mabc-dropdown" role="listbox">
                        {lista.map((s, i) => (
                            <li
                                key={`${s.id}-${i}`}
                                role="option"
                                aria-selected={i === idxAtivo}
                                className={`mabc-item${i === idxAtivo ? ' ativo' : ''}`}
                                // Evita perder o foco do input antes de selecionar a sugestão.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selecionarSugestao(campo, s)}
                                onMouseEnter={() => setIdxAtivo(i)}
                            >
                                <span className="mabc-item-icone">
                                    <Icone nome="pin" size={18} />
                                </span>

                                <span className="mabc-item-textos">
                                    <span className="mabc-item-titulo">
                                        {s.titulo}
                                    </span>

                                    {s.detalhes && (
                                        <span className="mabc-item-detalhes">
                                            {s.detalhes}
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    // ───── Renderização principal da interface ─────

    return (
        <div
            ref={rootRef}
            className={`mabc-root mabc-cam-${camera}`}
        >
            {/* Insere as regras CSS específicas deste componente. */}
            <style>{CSS}</style>

            {/* Camada de fundo: contém o mapa e os elementos visuais da cena. */}
            <div ref={cenaRef} className="mabc-cena">
                {/* Container onde o Leaflet renderiza o mapa. */}
                <div
                    id="mapa-container"
                    className="mabc-mapa"
                    style={estiloMapa}
                />

                {/* Elemento visual utilizado como efeito de horizonte na câmera 3D. */}
                <div className="mabc-ceu" />
            </div>

            {/* Camada superior da interface, onde ficam os painéis e botões. */}
            <div className="mabc-overlay">

                {/* ───── Fase 1: busca de origem e destino ───── */}
                {fase === 'busca' && (
                    <div className="mabc-painel">
                        {/* Botões de escolha do meio de transporte. */}
                        {renderModos(true)}

                        <div className="mabc-campos">
                            {/* Elementos decorativos que conectam origem e destino. */}
                            <div className="mabc-trilho" aria-hidden="true">
                                <span className="mabc-bolinha" />
                                <span className="mabc-linha" />
                                <span className="mabc-pino">
                                    <Icone nome="pin" size={18} />
                                </span>
                            </div>

                            <div className="mabc-inputs">
                                {/* Campo de origem com botão para usar a localização atual. */}
                                {renderCampo(
                                    'origem',
                                    origem,
                                    'Origem',
                                    (
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
                                    )
                                )}

                                {/* Campo de destino. */}
                                {renderCampo(
                                    'destino',
                                    destino,
                                    'Destino — Enter para traçar'
                                )}
                            
            
                            </div>

                            {/* Botão para trocar a origem e o destino de posição. */}
                            <button
                                type="button"
                                className="mabc-icone-btn"
                                onClick={inverter}
                                aria-label="Inverter origem e destino"
                                title="Inverter"
                            >
                                <Icone nome="swap" size={20} />
                            </button>
                        </div>

                        {/* Aviso relacionado ao meio de transporte selecionado. */}
                        {avisoModo && (
                            <div className="mabc-aviso">{avisoModo}</div>
                        )}

                        {/* Exibe mensagens de erro, quando existirem. */}
                        {erroRota && (
                            <div className="mabc-erro">{erroRota}</div>
                        )}

                        {/* Permite acessar o itinerário caso já exista uma rota. */}
                        {rotaAtual && (
                            <button
                                type="button"
                                className="mabc-btn-sec compacto"
                                onClick={() => setFase('itinerario')}
                            >
                                <Icone nome="list" size={16} />
                                Ver rotas e passos
                            </button>
                        )}
                    </div>
                )}

                {/* ───── Fase 2: escolha da rota e visualização do itinerário ───── */}
                {fase === 'itinerario' && rotaAtual && (
                    <div
                        className={`mabc-painel mabc-itin${listaAberta ? '' : ' recolhido'}`}
                    >
                        {/* Alça que permite recolher ou expandir a lista de passos. */}
                        <button
                            type="button"
                            className="mabc-alca"
                            onClick={() => setListaAberta((v) => !v)}
                            aria-label={listaAberta ? 'Recolher passos' : 'Expandir passos'}
                        >
                            <span />
                        </button>

                        <div className="mabc-itin-topo">
                            {/* Volta para a tela de edição dos endereços. */}
                            <button
                                type="button"
                                className="mabc-icone-btn"
                                onClick={() => setFase('busca')}
                                aria-label="Editar origem e destino"
                                title="Editar"
                            >
                                <Icone nome="back" size={20} />
                            </button>

                            {/* Mostra os nomes dos pontos da rota. */}
                            <div className="mabc-itin-titulo">
                                <span>{origem.texto || 'Origem'}</span>
                                <span className="mabc-seta-txt">→</span>
                                <span>{destino.texto || 'Destino'}</span>
                            </div>

                            {/* Botão para limpar completamente a rota. */}
                            <button
                                type="button"
                                className="mabc-icone-btn"
                                onClick={limparRota}
                                aria-label="Limpar rota"
                                title="Limpar"
                            >
                                <Icone nome="close" size={18} />
                            </button>
                        </div>

                        {/* Permite trocar o meio de transporte. */}
                        {renderModos(false)}

                        {/* Exibe as alternativas quando houver mais de uma rota. */}
                        {candidatas.length > 1 && (
                            <div
                                className="mabc-opcoes"
                                role="radiogroup"
                                aria-label="Rotas disponíveis"
                            >
                                {candidatas.map((c, i) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={i === selecionada}
                                        className={`mabc-opcao${i === selecionada ? ' ativo' : ''}`}
                                        onClick={() => selecionarRota(i)}
                                    >
                                        <span className="mabc-opcao-tempo">
                                            {modo === 'transit'
                                                ? `Opção ${i + 1}`
                                                : formatarTempo(c.tempo)}
                                        </span>

                                        <span className="mabc-opcao-dist">
                                            {formatarDistancia(c.total)}
                                        </span>

                                        {/* Identifica a rota mais rápida. */}
                                        {i === 0 && modo !== 'transit' && (
                                            <span className="mabc-tag">
                                                Mais rápida
                                            </span>
                                        )}

                                        {/* Indica se a rota precisou de um desvio. */}
                                        {c.desviada && (
                                            <span className="mabc-tag desvio">
                                                Com desvio
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Informa quantas rotas foram descartadas por alagamento. */}
                        {bloqueadas.length > 0 && (
                            <div className="mabc-aviso-zona">
                                {bloqueadas.length === 1
                                    ? '1 rota descartada: cruza zona de alagamento sem desvio possível.'
                                    : `${bloqueadas.length} rotas descartadas: cruzam zona de alagamento sem desvio possível.`}
                            </div>
                        )}

                        {/* Resumo com tempo e distância da rota selecionada. */}
                        <div className="mabc-resumo">
                            {rotaAtual.carregando ? (
                                <span className="mabc-resumo-dist">
                                    Montando rota mista…
                                </span>
                            ) : (
                                <>
                                    <span className="mabc-resumo-tempo">
                                        {formatarTempo(rotaAtual.tempo)}
                                    </span>

                                    <span className="mabc-resumo-dist">
                                        {formatarDistancia(rotaAtual.total)}
                                    </span>

                                    {/* Identifica rotas que utilizam dados simulados. */}
                                    {rotaAtual.simulado && (
                                        <span className="mabc-selo">
                                            Simulado
                                        </span>
                                    )}
                                </>
                            )}
                        </div>

                        {avisoModo && (
                            <div className="mabc-aviso">{avisoModo}</div>
                        )}

                        {erroRota && (
                            <div className="mabc-erro">{erroRota}</div>
                        )}

                        {/* Inicia a navegação usando o GPS. */}
                        <button
                            type="button"
                            className="mabc-btn-ir"
                            onClick={iniciarNavegacao}
                            disabled={rotaAtual.carregando}
                        >
                            <Icone nome="navigation" size={22} />
                            Ir Agora
                        </button>

                        {/* Mostra as instruções detalhadas do itinerário. */}
                        {listaAberta && (
                            <ListaPassos
                                passos={rotaAtual.passos}
                                carregando={rotaAtual.carregando}
                            />
                        )}
                    </div>
                )}

                {/* ───── Fase 3: navegação em tempo real ───── */}
                {fase === 'navegando' && rotaAtual && (
                    <div className="mabc-painel mabc-nav">

                        {/* Exibe uma mensagem diferente quando o destino é alcançado. */}
                        {chegou ? (
                            <div className="mabc-nav-banner chegou">
                                <span className="mabc-nav-icone">
                                    <Icone nome="pin" size={30} />
                                </span>

                                <div>
                                    <div className="mabc-nav-texto">
                                        Você chegou ao destino
                                    </div>

                                    <div className="mabc-nav-dist">
                                        {destino.texto}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Enquanto o usuário está em deslocamento,
                            // mostra a próxima instrução de navegação.
                            <div className="mabc-nav-banner">
                                <span className="mabc-nav-icone">
                                    {proximoPasso
                                        ? <IconeDoPasso passo={proximoPasso} size={30} />
                                        : <Icone nome="locate" size={30} />}
                                </span>

                                <div style={{ minWidth: 0 }}>
                                    <div className="mabc-nav-dist">
                                        {progresso
                                            ? `Em ${formatarDistancia(progresso.distProximo)}`
                                            : 'Obtendo sua localização…'}
                                    </div>

                                    <div className="mabc-nav-texto">
                                        {proximoPasso
                                            ? proximoPasso.texto
                                            : 'Aguardando sinal do GPS'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Exibe o tempo e a distância restantes até o destino. */}
                        {progresso && !chegou && (
                            <div className="mabc-nav-resumo">
                                <strong>
                                    {formatarTempo(progresso.restanteS)}
                                </strong>

                                <span>
                                    {formatarDistancia(progresso.restanteM)}
                                </span>

                                {rotaAtual.simulado && (
                                    <span className="mabc-selo">
                                        Simulado
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Avisa quando o usuário está distante da rota calculada. */}
                        {progresso?.foraDaRota && !chegou && (
                            <div className="mabc-fora">
                                Você saiu da rota ({formatarDistancia(progresso.desvioM)}).

                                <button
                                    type="button"
                                    onClick={recalcularDaqui}
                                >
                                    Recalcular daqui
                                </button>
                            </div>
                        )}

                        {erroRota && (
                            <div className="mabc-erro">{erroRota}</div>
                        )}

                        {/* Botões para mostrar os passos ou encerrar a navegação. */}
                        <div className="mabc-nav-acoes">
                            <button
                                type="button"
                                className="mabc-btn-sec compacto"
                                onClick={() => setListaAberta((v) => !v)}
                            >
                                <Icone nome="list" size={16} />
                                {listaAberta ? 'Ocultar passos' : 'Passos'}
                            </button>

                            <button
                                type="button"
                                className="mabc-btn-enc"
                                onClick={encerrarNavegacao}
                            >
                                {chegou ? 'Concluir' : 'Encerrar'}
                            </button>
                        </div>

                        {/* Lista de instruções com destaque para o passo atual. */}
                        {listaAberta && (
                            <ListaPassos
                                passos={rotaAtual.passos}
                                indiceAtivo={
                                    progresso
                                        ? Math.max(0, progresso.idxProximo - 1)
                                        : -1
                                }
                            />
                        )}
                    </div>
                )}

                {/* Botão que reaparece quando o usuário arrasta o mapa manualmente. */}
                {fase === 'navegando' && !seguir && camera === '2d' && (
                    <button
                        type="button"
                        className="mabc-btn-centralizar"
                        onClick={centralizar}
                    >
                        <Icone nome="locate" size={20} />
                        Centralizar
                    </button>
                )}
            <BotaoReporte 
                map={mapRef.current} 
                fase={fase} 
                listaAberta={listaAberta} 
                emPerigo={emPerigo}
                onEnviarReporte={async (dados) => {
                    // ----------------------------------------------------
                    // AQUI É O PONTO DE INTEGRAÇÃO COM O BACK-END
                    // ----------------------------------------------------
                    console.log("Payload recebido pelo Front-end:", dados);
                    
                    // Exemplo de como o back-end vai receber (se usar fetch):
                    /*
                    const response = await fetch('/api/reportes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            categoria: dados.categoria,
                            latitude: dados.latitude,
                            longitude: dados.longitude,
                            descricao: dados.descricao,
                            // Se tiver foto, o back-end precisa receber um FormData
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Falha ao enviar para o servidor');
                    }
                    */
                }}
            />
                {/* Botão para alternar entre visão superior 2D e visão imersiva 3D. */}
                {fase === 'navegando' && (
                    <button
                        type="button"
                        className={`mabc-btn-camera${imersiva ? ' ativo' : ''}`}
                        onClick={alternarCamera}
                        disabled={camera === 'prep' || camera === 'saindo'}
                        aria-pressed={imersiva}
                        aria-label={
                            imersiva
                                ? 'Voltar para a Visão Superior'
                                : 'Ativar a Visão Imersiva'
                        }
                        title={imersiva ? 'Visão Superior' : 'Visão Imersiva'}
                    >
                        <Icone nome="compass" size={22} />
                        <span>{imersiva ? '2D' : '3D'}</span>
                    </button>
                )}

                {/* Alerta exibido quando nenhuma rota alternativa evita a área alagada. */}
                {emPerigo && (
                    <div className="mabc-alerta" role="alert">
                        <Icone nome="warning" size={22} />
                        <span>
                            <strong>ALERTA:</strong>
                            A área está bloqueada e não há desvios seguros.
                        </span>
                    </div>
                )}

                {/* Crédito obrigatório dos dados cartográficos do OpenStreetMap. */}
                <a
                    className="mabc-atribuicao"
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    © OpenStreetMap contributors
                </a>
            </div>
        </div>
    );
}

// ───────────────────────── CSS ─────────────────────────

// Define a aparência visual do mapa, dos painéis, dos botões,
// dos marcadores e dos elementos da navegação.
const CSS = `
/* ───── Estrutura principal ───── */

/* Organiza as camadas da aplicação e define as cores principais. */
.mabc-root {
    /* Variáveis CSS utilizadas para manter a identidade visual. */
    --mc-marinho: ${COR_MARINHO};
    --mc-marinho-2: ${COR_MARINHO_2};
    --mc-azul: ${COR_AZUL};
    --mc-azul-claro: ${COR_AZUL_CLARO};
    --mc-azul-palido: #e4f0fc;
    --mc-texto-2: #5a7391;
    --mabc-giro: 0deg;

    position: relative;
    isolation: isolate;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #e5e7eb;

    /* Define a fonte e a cor padrão dos textos. */
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: var(--mc-marinho);
}

/* Camada que contém os painéis e controles sobre o mapa. */
.mabc-overlay {
    position: absolute;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
}

/* Permite interações somente nos elementos internos do overlay. */
.mabc-overlay > * {
    pointer-events: auto;
}

/* Esconde o painel padrão de instruções criado pelo Leaflet Routing. */
.leaflet-routing-container {
    display: none !important;
}

.leaflet-routing-add-waypoint {
    display: none !important;
}

/* ───── Cena e câmera ───── */

/* Container que recorta o mapa quando ele é inclinado para a visão 3D. */
.mabc-cena {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background: linear-gradient(#cfe0f3, #e6eef8);
}

/* Define o posicionamento e as transformações do mapa. */
.mabc-mapa {
    position: absolute;
    inset: 0;
    z-index: 0;
    transform-origin: 50% 50%;

    /* Estado inicial: mapa sem inclinação. */
    transform: perspective(${PERSPECTIVA_PX}px) rotateX(0deg) rotateZ(0deg);

    /* Suaviza a transição entre as posições da câmera. */
    transition: transform ${DURACAO_TRANSICAO_MS}ms cubic-bezier(.4, 0, .2, 1);
    will-change: transform;
}

/* Aplica a inclinação e a rotação quando a câmera está em 3D. */
.mabc-cam-3d .mabc-mapa {
    transform:
        perspective(${PERSPECTIVA_PX}px)
        rotateX(${INCLINACAO_GRAUS}deg)
        rotateZ(var(--mabc-giro, 0deg));
}

/* Desativa interações com o mapa durante a transição 3D. */
.mabc-cam-prep .mabc-mapa,
.mabc-cam-3d .mabc-mapa,
.mabc-cam-saindo .mabc-mapa {
    pointer-events: none;
}

/* Esconde os controles padrão do Leaflet na visão imersiva. */
.mabc-cam-prep .leaflet-control-container,
.mabc-cam-3d .leaflet-control-container,
.mabc-cam-saindo .leaflet-control-container {
    display: none;
}

/* Ajusta a posição vertical dos controles inferiores do mapa. */
.mabc-root .leaflet-bottom {
    margin-bottom: 22px;
}

/* Efeito visual de céu e horizonte da câmera imersiva. */
.mabc-ceu {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 42%;
    z-index: 2;
    pointer-events: none;
    opacity: 0;

    transition: opacity ${DURACAO_TRANSICAO_MS}ms ease;

    background: linear-gradient(
        to bottom,
        rgba(214, 228, 243, 1) 0%,
        rgba(214, 228, 243, .9) 25%,
        rgba(214, 228, 243, .5) 55%,
        rgba(214, 228, 243, 0) 100%
    );
}

/* Torna o efeito de horizonte visível no modo 3D. */
.mabc-cam-3d .mabc-ceu {
    opacity: 1;
}

/* ───── Botões flutuantes de câmera ───── */

/* Botão circular para alternar entre os modos 2D e 3D. */
.mabc-btn-camera {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: 16px;

    width: 54px;
    height: 54px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    cursor: pointer;

    font: 800 10.5px system-ui, sans-serif;
    letter-spacing: .04em;

    color: var(--mc-marinho);
    background: rgba(255, 255, 255, 0.82);

    -webkit-backdrop-filter: blur(14px) saturate(1.5);
    backdrop-filter: blur(14px) saturate(1.5);

    box-shadow: 0 6px 20px rgba(11, 37, 69, 0.22);

    transition: background .15s, color .15s, transform .12s;
}

/* Altera a aparência do botão quando o modo imersivo está ativo. */
.mabc-btn-camera.ativo {
    color: #fff;
    background: var(--mc-marinho);
}

/* Efeito de redução ao pressionar o botão. */
.mabc-btn-camera:active {
    transform: scale(.94);
}

/* Indica visualmente quando o botão está desabilitado. */
.mabc-btn-camera:disabled {
    opacity: .75;
    cursor: default;
}

/* Botão que recentraliza o mapa na localização do usuário. */
.mabc-btn-centralizar {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);

    bottom: calc(44px + env(safe-area-inset-bottom, 0px));

    display: inline-flex;
    align-items: center;
    gap: 8px;

    height: 46px;
    padding: 0 20px;

    border: none;
    border-radius: 999px;
    cursor: pointer;

    font: 700 15px system-ui, sans-serif;
    color: #fff;

    background: linear-gradient(
        135deg,
        var(--mc-marinho-2),
        var(--mc-marinho)
    );

    box-shadow: 0 8px 22px rgba(11, 37, 69, 0.4);
    transition: filter .15s;
}

.mabc-btn-centralizar:hover {
    filter: brightness(1.12);
}

/* ───── Crédito do OpenStreetMap ───── */

.mabc-atribuicao {
    position: absolute;
    right: 8px;
    bottom: calc(4px + env(safe-area-inset-bottom, 0px));

    padding: 2px 8px;

    font-size: 11px;
    color: var(--mc-texto-2);
    text-decoration: none;

    background: rgba(255, 255, 255, 0.82);
    border-radius: 6px;
}

/* ───── Painéis da aplicação ───── */

/* Aparência geral dos painéis de busca e itinerário. */
.mabc-painel {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top, 0px));
    left: 14px;

    width: min(344px, calc(100% - 28px));
    box-sizing: border-box;
    padding: 10px;

    /* Efeito de transparência e desfoque do fundo. */
    background: rgba(255, 255, 255, 0.72);

    -webkit-backdrop-filter: blur(18px) saturate(1.6);
    backdrop-filter: blur(18px) saturate(1.6);

    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 24px;

    box-shadow:
        0 10px 30px rgba(11, 37, 69, 0.16),
        0 1px 2px rgba(11, 37, 69, 0.08);
}

/* Organiza verticalmente os painéis de itinerário e navegação. */
.mabc-itin,
.mabc-nav {
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 28px - env(safe-area-inset-top, 0px));
}

/* Define a largura máxima do painel de itinerário. */
.mabc-itin {
    width: min(372px, calc(100% - 28px));
}

/* ───── Modos de transporte e botões ───── */

/* Organiza os botões de seleção dos meios de transporte. */
.mabc-modos {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 8px;
}

/* Aparência individual de cada opção de transporte. */
.mabc-modo {
    flex: 1;
    height: 34px;

    display: flex;
    align-items: center;
    justify-content: center;

    border: none;
    border-radius: 12px;

    background: transparent;
    color: var(--mc-texto-2);

    cursor: pointer;
    transition: background .15s, color .15s;
}

.mabc-modo:hover {
    background: rgba(143, 195, 245, 0.28);
}

/* Destaca o meio de transporte selecionado. */
.mabc-modo.ativo {
    background: var(--mc-marinho);
    color: #fff;
}

/* Botões circulares de ações secundárias. */
.mabc-icone-btn {
    width: 34px;
    height: 34px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border: none;
    border-radius: 50%;

    background: transparent;
    color: var(--mc-texto-2);

    cursor: pointer;
    transition: background .15s;
}

.mabc-icone-btn:hover {
    background: rgba(143, 195, 245, 0.28);
}

/* Estilo compartilhado dos botões secundários e de encerramento. */
.mabc-btn-sec,
.mabc-btn-enc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    height: 42px;
    padding: 0 16px;

    border: none;
    border-radius: 14px;

    cursor: pointer;
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;

    transition: filter .15s, background .15s;
}

/* Botão secundário padrão. */
.mabc-btn-sec {
    background: var(--mc-azul-palido);
    color: var(--mc-marinho-2);
}

.mabc-btn-sec:hover {
    background: #d3e6fa;
}

/* Versão compacta do botão secundário. */
.mabc-btn-sec.compacto {
    height: 36px;
    padding: 0 12px;
    font-size: 13.5px;
}

/* Botão para encerrar a navegação. */
.mabc-btn-enc {
    height: 36px;
    padding: 0 14px;
    font-size: 13.5px;

    background: #fee2e2;
    color: #b91c1c;

    margin-left: auto;
}

.mabc-btn-enc:hover {
    background: #fecaca;
}

/* Faz o botão secundário ocupar toda a largura do painel de busca. */
.mabc-painel > .mabc-btn-sec {
    width: 100%;
    margin-top: 8px;
}

/* ───── Botão "Ir Agora" ───── */

/* Botão principal utilizado para iniciar a navegação GPS. */
.mabc-btn-ir {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;

    width: 100%;
    height: 52px;
    margin-top: 10px;

    border: none;
    border-radius: 16px;
    cursor: pointer;

    font: inherit;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: .01em;

    color: #fff;

    background: linear-gradient(
        135deg,
        #2a6fc2,
        var(--mc-marinho)
    );

    box-shadow: 0 8px 20px rgba(11, 37, 69, 0.35);
    transition: transform .12s, filter .15s;
}

.mabc-btn-ir:hover {
    filter: brightness(1.1);
}

.mabc-btn-ir:active {
    transform: scale(.98);
}

/* Aparência do botão enquanto a rota está sendo carregada. */
.mabc-btn-ir:disabled {
    background: #94a3b8;
    box-shadow: none;
    cursor: default;
}

/* ───── Campos de origem e destino ───── */

/* Organiza os campos e os elementos visuais que os conectam. */
.mabc-campos {
    display: flex;
    align-items: center;
    gap: 6px;
}

/* Trilho vertical que representa o percurso entre os campos. */
.mabc-trilho {
    width: 18px;
    height: 86px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;

    padding: 12px 0 10px;
    box-sizing: border-box;
    flex-shrink: 0;
}

/* Círculo que representa o início do percurso. */
.mabc-bolinha {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 3px solid var(--mc-azul);
    box-sizing: border-box;
}

/* Linha pontilhada que conecta origem e destino. */
.mabc-linha {
    flex: 1;
    border-left: 2px dotted var(--mc-azul-claro);
    margin: 3px 0;
}

/* Ícone que representa o destino. */
.mabc-pino {
    color: var(--mc-marinho);
    display: flex;
}

/* Organiza verticalmente os dois campos de texto. */
.mabc-inputs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

/* Define o posicionamento relativo para a lista de sugestões. */
.mabc-campo {
    position: relative;
}

/* Aparência padrão dos campos de origem e destino. */
.mabc-input {
    width: 100%;
    height: 40px;
    box-sizing: border-box;
    padding: 0 12px;

    font-size: 16px;
    font-family: inherit;
    color: var(--mc-marinho);

    background: rgba(228, 240, 252, 0.78);
    border: 1px solid transparent;
    border-radius: 14px;
    outline: none;

    transition: background .15s, border-color .15s, box-shadow .15s;
}

/* Reserva espaço para o botão de localização dentro do campo. */
.mabc-input.com-acao {
    padding-right: 42px;
}

/* Cor do texto de orientação dos campos vazios. */
.mabc-input::placeholder {
    color: #7f98b5;
}

/* Destaque visual quando o campo está selecionado. */
.mabc-input:focus {
    background: #fff;
    border-color: var(--mc-azul);
    box-shadow: 0 0 0 3px rgba(61, 139, 217, 0.22);
}

/* Indica que o campo já possui uma coordenada selecionada. */
.mabc-input.definido {
    background: rgba(214, 233, 252, 0.95);
    border-color: var(--mc-azul-claro);
}

.mabc-input.definido:focus {
    background: #fff;
    border-color: var(--mc-azul);
}

/* ───── Botão de localização atual ───── */

/* Posiciona o botão de GPS dentro do campo de origem. */
.mabc-input-acao {
    position: absolute;
    right: 4px;
    top: 4px;

    width: 32px;
    height: 32px;

    display: flex;
    align-items: center;
    justify-content: center;

    border: none;
    border-radius: 10px;

    background: transparent;
    color: var(--mc-marinho-2);

    cursor: pointer;
    transition: background .15s;
}

.mabc-input-acao:hover {
    background: rgba(143, 195, 245, 0.4);
}

/* Anima o botão enquanto a localização está sendo obtida. */
.mabc-input-acao.carregando {
    animation: mabc-pisca 1s ease-in-out infinite;
}

@keyframes mabc-pisca {
    0%, 100% {
        opacity: 1;
    }

    50% {
        opacity: .3;
    }
}

/* ───── Lista suspensa de sugestões ───── */

/* Posiciona a lista de endereços abaixo do campo de texto. */
.mabc-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 10;

    margin: 0;
    padding: 6px;
    list-style: none;

    max-height: 280px;
    overflow-y: auto;

    background: rgba(255, 255, 255, 0.98);
    border-radius: 16px;

    box-shadow:
        0 12px 32px rgba(11, 37, 69, 0.22),
        0 0 0 1px rgba(11, 37, 69, 0.05);
}

/* Organiza cada endereço sugerido. */
.mabc-item {
    display: flex;
    align-items: center;
    gap: 10px;

    padding: 8px 10px;
    border-radius: 12px;
    cursor: pointer;
}

/* Destaca a sugestão selecionada pelo teclado ou pelo mouse. */
.mabc-item.ativo {
    background: var(--mc-azul-palido);
}

/* Ícone exibido ao lado de cada endereço. */
.mabc-item-icone {
    width: 30px;
    height: 30px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 50%;
    background: var(--mc-azul-palido);
    color: var(--mc-marinho-2);
}

.mabc-item.ativo .mabc-item-icone {
    background: var(--mc-marinho);
    color: #fff;
}

/* Organiza o título e os detalhes do endereço. */
.mabc-item-textos {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

/* Texto principal da sugestão. */
.mabc-item-titulo {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Informações complementares do endereço. */
.mabc-item-detalhes {
    font-size: 12px;
    color: var(--mc-texto-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ───── Avisos e mensagens ───── */

/* Aviso informativo relacionado ao modo de transporte. */
.mabc-aviso {
    margin-top: 8px;
    padding: 7px 10px;

    font-size: 12.5px;
    line-height: 1.4;

    color: #5b21b6;
    background: #f5f3ff;
    border-radius: 12px;
}

/* Mensagem que informa a existência de rotas bloqueadas. */
.mabc-aviso-zona {
    margin-top: 8px;
    padding: 7px 10px;

    font-size: 12.5px;
    line-height: 1.4;

    color: #991b1b;
    background: #fee2e2;
    border-radius: 12px;
}

/* Mensagens de erro ou falha nas operações. */
.mabc-erro {
    margin-top: 8px;
    padding: 7px 10px;

    font-size: 12.5px;
    line-height: 1.4;

    color: #92400e;
    background: #fef3c7;
    border-radius: 12px;
}

/* Selo utilizado para identificar informações especiais, como rotas simuladas. */
.mabc-selo {
    padding: 2px 8px;

    font-size: 11px;
    font-weight: 700;
    letter-spacing: .03em;
    text-transform: uppercase;

    color: #92400e;
    background: #fef3c7;
    border-radius: 999px;
}

/* ───── Opções de rota ───── */

/* Organiza horizontalmente as alternativas de trajeto. */
.mabc-opcoes {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
}

/* Aparência de cada alternativa de rota. */
.mabc-opcao {
    flex: 1 0 auto;
    min-width: 100px;

    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;

    padding: 7px 11px;
    text-align: left;

    font: inherit;
    color: var(--mc-marinho-2);

    background: rgba(228, 240, 252, 0.7);
    border: 2px solid transparent;
    border-radius: 14px;

    cursor: pointer;
    transition: background .15s, border-color .15s;
}

.mabc-opcao:hover {
    background: var(--mc-azul-palido);
}

/* Destaca a alternativa selecionada. */
.mabc-opcao.ativo {
    background: #fff;
    border-color: var(--mc-marinho-2);
}

/* Tempo estimado da alternativa. */
.mabc-opcao-tempo {
    font-size: 15.5px;
    font-weight: 700;
    color: var(--mc-marinho);
}

/* Distância total da alternativa. */
.mabc-opcao-dist {
    font-size: 12.5px;
    color: var(--mc-texto-2);
}

/* Selo de identificação da rota mais rápida. */
.mabc-tag {
    margin-top: 2px;
    padding: 1px 7px;

    font-size: 10.5px;
    font-weight: 700;

    color: var(--mc-marinho);
    background: var(--mc-azul-claro);
    border-radius: 999px;
}

/* Selo utilizado para identificar rotas com desvio. */
.mabc-tag.desvio {
    color: #92400e;
    background: #fef3c7;
}

/* ───── Rótulos sobre as rotas no mapa ───── */

/* Remove o fundo padrão do marcador que contém o rótulo. */
.mabc-rotulo-rota {
    background: none;
    border: none;
}

/* Aparência do texto com o tempo ou número da rota. */
.mabc-rotulo-rota span {
    position: absolute;
    transform: translate(-50%, -50%);

    white-space: nowrap;
    cursor: pointer;

    padding: 4px 10px;

    font: 700 13px system-ui, sans-serif;
    color: var(--mc-marinho-2);

    background: #fff;
    border-radius: 999px;

    box-shadow: 0 2px 8px rgba(11, 37, 69, 0.3);
}

/* Diferencia visualmente o rótulo da rota selecionada. */
.mabc-rotulo-rota span.sel {
    color: #fff;
    background: var(--mc-marinho);
}

/* ───── Itinerário e lista de passos ───── */

/* Alça que permite recolher o painel em dispositivos móveis. */
.mabc-alca {
    display: none;
    align-self: center;

    width: 100%;
    padding: 0 0 8px;

    border: none;
    background: none;
    cursor: pointer;

    justify-content: center;
}

/* Desenha a pequena barra central da alça. */
.mabc-alca span {
    width: 40px;
    height: 4px;

    border-radius: 4px;
    background: var(--mc-azul-claro);
}

/* Organiza o cabeçalho do itinerário. */
.mabc-itin-topo {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 6px;
}

/* Organiza os textos de origem e destino. */
.mabc-itin-titulo {
    flex: 1;
    min-width: 0;

    display: flex;
    align-items: center;
    gap: 6px;

    font-size: 14px;
    font-weight: 600;
}

/* Evita que nomes longos ultrapassem o espaço disponível. */
.mabc-itin-titulo span:not(.mabc-seta-txt) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Cor da seta que separa origem e destino. */
.mabc-seta-txt {
    color: var(--mc-azul);
    flex-shrink: 0;
}

/* Caixa que apresenta o resumo da rota selecionada. */
.mabc-resumo {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;

    margin-top: 8px;
    padding: 9px 12px;

    background: rgba(228, 240, 252, 0.7);
    border-radius: 14px;
}

/* Destaca o tempo estimado da rota. */
.mabc-resumo-tempo {
    font-size: 21px;
    font-weight: 700;
    color: var(--mc-marinho);
}

/* Estilo da distância total. */
.mabc-resumo-dist {
    font-size: 14px;
    color: var(--mc-texto-2);
}

/* Mensagem exibida durante o carregamento de informações. */
.mabc-carregando {
    margin-top: 12px;
    font-size: 14px;
    color: var(--mc-texto-2);
    text-align: center;
}

/* Lista rolável de instruções da rota. */
.mabc-passos {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;

    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;

    overscroll-behavior: contain;
}

/* Organiza cada instrução individual do percurso. */
.mabc-passo {
    display: flex;
    align-items: center;
    gap: 12px;

    padding: 8px 6px;
    border-radius: 14px;
}

/* Adiciona uma divisão visual entre as instruções. */
.mabc-passo + .mabc-passo {
    border-top: 1px solid rgba(11, 37, 69, 0.06);
}

/* Destaca o passo atual da navegação. */
.mabc-passo.ativo {
    background: var(--mc-azul-palido);
}

/* Área circular do ícone de cada instrução. */
.mabc-passo-icone {
    width: 34px;
    height: 34px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 50%;
    background: var(--mc-azul-palido);
    color: var(--mc-marinho-2);
}

/* Organiza o texto principal e o detalhe de cada passo. */
.mabc-passo-textos {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

/* Texto principal da instrução. */
.mabc-passo-titulo {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
}

/* Informação complementar da instrução. */
.mabc-passo-detalhe {
    font-size: 12.5px;
    color: var(--mc-texto-2);
}

/* ───── Painel de navegação ───── */

/* Deixa espaço lateral para o botão de alternância da câmera. */
.mabc-nav {
    width: min(372px, calc(100% - 100px));
}

/* Banner com a próxima instrução de navegação. */
.mabc-nav-banner {
    display: flex;
    align-items: center;
    gap: 12px;

    padding: 11px;

    color: #fff;
    background: linear-gradient(
        135deg,
        var(--mc-marinho-2),
        var(--mc-marinho)
    );

    border-radius: 16px;
}

/* Muda a cor do banner quando o usuário chega ao destino. */
.mabc-nav-banner.chegou {
    background: linear-gradient(135deg, #1f8a5b, #14633f);
}

/* Área que contém o ícone da instrução. */
.mabc-nav-icone {
    width: 46px;
    height: 46px;
    flex-shrink: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    background: rgba(143, 195, 245, 0.25);
    border-radius: 13px;
}

/* Texto que apresenta a distância até a próxima instrução. */
.mabc-nav-dist {
    font-size: 13px;
    opacity: .9;
}

/* Texto principal da orientação de navegação. */
.mabc-nav-texto {
    font-size: 16.5px;
    font-weight: 700;
    line-height: 1.25;
}

/* Organiza o tempo e a distância restantes. */
.mabc-nav-resumo {
    display: flex;
    align-items: baseline;
    gap: 10px;

    margin-top: 8px;
    font-size: 14px;
    color: var(--mc-texto-2);
}

/* Destaca o tempo restante. */
.mabc-nav-resumo strong {
    font-size: 18px;
    color: var(--mc-marinho);
}

/* Aviso exibido quando o usuário sai do trajeto calculado. */
.mabc-fora {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    margin-top: 8px;
    padding: 7px 10px;

    font-size: 13px;
    color: #92400e;

    background: #fef3c7;
    border-radius: 12px;
}

/* Botão para recalcular o trajeto a partir da posição atual. */
.mabc-fora button {
    border: none;
    border-radius: 9px;
    padding: 6px 10px;

    font: inherit;
    font-weight: 600;

    color: #fff;
    background: #d97706;

    cursor: pointer;
    white-space: nowrap;
}

/* Organiza os botões de ação do painel de navegação. */
.mabc-nav-acoes {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

/* Limita a altura da lista de instruções no painel de navegação. */
.mabc-nav .mabc-passos {
    max-height: 38vh;
}

/* ───── Alerta de bloqueio ───── */

/* Exibe um alerta destacado quando não há desvios seguros. */
.mabc-alerta {
    position: absolute;

    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);

    width: min(560px, calc(100% - 32px));
    box-sizing: border-box;

    display: flex;
    align-items: center;
    gap: 12px;

    padding: 14px 16px;

    font-size: 14px;
    color: #991b1b;

    background: #fee2e2;
    border: 2px solid #ef4444;
    border-radius: 16px;

    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

/* ───── Marcador de localização do motorista ───── */

/* Remove o fundo padrão do marcador personalizado. */
.mabc-seta {
    background: none;
    border: none;
}

/* Define a área que contém a seta e o efeito de pulso. */
.mabc-seta-wrap {
    position: relative;
    width: 44px;
    height: 44px;
}

/* Círculo animado que destaca a localização atual. */
.mabc-seta-pulso {
    position: absolute;
    inset: 6px;

    border-radius: 50%;
    background: rgba(61, 139, 217, 0.35);

    animation: mabc-pulso 1.8s ease-out infinite;
}

/* Elemento interno que recebe a rotação da seta. */
.mabc-seta-rot {
    position: absolute;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    transition: transform .35s ease-out;
    will-change: transform;
}

/* Define o tamanho e a sombra da seta em SVG. */
.mabc-seta-rot svg {
    width: 36px;
    height: 36px;

    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
}

/* Animação de expansão e desaparecimento do círculo de localização. */
@keyframes mabc-pulso {
    0% {
        transform: scale(.6);
        opacity: .9;
    }

    100% {
        transform: scale(1.7);
        opacity: 0;
    }
}

/* ───── Ajustes para dispositivos móveis ───── */

/* Modifica o layout para telas com largura de até 640 pixels. */
@media (max-width: 640px) {

    /* Painéis ocupam quase toda a largura disponível. */
    .mabc-painel,
    .mabc-itin {
        left: 8px;
        right: 8px;
        width: auto;

        top: calc(8px + env(safe-area-inset-top, 0px));
        border-radius: 22px;
    }

    /* Ajusta a altura máxima do painel de navegação. */
    .mabc-nav {
        width: auto;
        max-height: calc(100% - 120px);
    }

    /* Transforma o itinerário em um painel inferior expansível. */
    .mabc-itin {
        top: auto;

        bottom: calc(26px + env(safe-area-inset-bottom, 0px));

        max-height: 58%;
        border-radius: 24px;
    }

    /* Mostra a alça de recolhimento no celular. */
    .mabc-alca {
        display: flex;
    }

    /* Reduz a altura da lista de instruções na navegação móvel. */
    .mabc-nav .mabc-passos {
        max-height: 30vh;
    }

    /* Posiciona o botão 2D/3D no canto inferior direito. */
    .mabc-btn-camera {
        top: auto;
        right: 12px;

        bottom: calc(44px + env(safe-area-inset-bottom, 0px));
    }

    /* Esconde o controle de zoom padrão, pois o celular utiliza gestos de pinça. */
    .leaflet-control-zoom {
        display: none;
    }
}
`;
