'use client';


import { useEffect, useState } from 'react';
import L from 'leaflet';

// Categorias exibidas na primeira etapa do formulário.

// O campo id é o valor que sera enviado ao supabase;
const CATEGORIAS = [
    { id: 'alagamento', nome: 'Alagamento', icone: 'waves' },
    { id: 'chuva', nome: 'Chuva intensa', icone: 'cloud-rain' },
    { id: 'interdicao', nome: 'Via interditada', icone: 'cone' },
    { id: 'deslizamento', nome: 'Deslizamento', icone: 'mountain' },
    { id: 'outro', nome: 'Outro problema', icone: 'more' },
];

// ícones em svg
function IconeReporte({ nome, tamanho = 22 }) {
    const props = {
        width: tamanho,
        height: tamanho,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
    };

    switch (nome) {
        case 'flag':
            return <svg {...props}><path d="M5 21V4" /><path d="M5 4c5-3 9 3 14 0v11c-5 3-9-3-14 0" /></svg>;
        case 'close':
            return <svg {...props}><path d="m18 6-12 12M6 6l12 12" /></svg>;
        case 'back':
            return <svg {...props}><path d="m15 18-6-6 6-6" /></svg>;
        case 'pin':
            return <svg {...props}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
        case 'gps':
            return <svg {...props}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>;
        case 'waves':
            return <svg {...props}><path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" /><path d="M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" /><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" /></svg>;
        case 'cloud-rain':
            return <svg {...props}><path d="M20 15.5A4.5 4.5 0 0 0 18 7h-1.2A6 6 0 0 0 5 9a4 4 0 0 0 0 8h15" /><path d="m8 19-1 2m6-2-1 2m6-2-1 2" /></svg>;
        case 'cone':
            return <svg {...props}><path d="M9.5 4h5L19 20H5L9.5 4Z" /><path d="M8 10h8M6.5 15h11M4 20h16" /></svg>;
        case 'mountain':
            return <svg {...props}><path d="m2 20 7-12 4 6 2-3 7 9H2Z" /><path d="m7 11 2 2 2-2" /></svg>;
        case 'more':
            return <svg {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
        case 'camera':
            return <svg {...props}><path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" /><circle cx="12" cy="13" r="3.5" /></svg>;
        default:
            return null;
    }
}

/**
 * Interface de reporte de ocorrências.

 * - onEnviarReporte: função que recebe os dados preenchidos e os encaminha ao backend.
 *   sem a função o componente funciona em modo de teste.
 */
export default function BotaoReporte({
    map,
    fase = 'busca',
    listaAberta = true,
    emPerigo = false,
    onEnviarReporte,
}) {

    const [aberto, setAberto] = useState(false);
    const [etapa, setEtapa] = useState('categorias');
    const [categoria, setCategoria] = useState(null);
    const [local, setLocal] = useState(null);
    const [descricao, setDescricao] = useState('');
    const [foto, setFoto] = useState(null);
    const [gpsCarregando, setGpsCarregando] = useState(false);
    const [selecionandoLocal, setSelecionandoLocal] = useState(false);
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [envioRealizado, setEnvioRealizado] = useState(false);


    // modo de seleção no mapa

    useEffect(() => {
        if (!map || !selecionandoLocal) return undefined;

        function selecionarPonto(evento) {
            const { lat, lng } = evento.latlng;
            setLocal({ lat, lng, origem: 'mapa' });
            setSelecionandoLocal(false);
            setAberto(true);
            setEtapa('formulario');
            setErro('');
        }

        map.on('click', selecionarPonto);
        return () => map.off('click', selecionarPonto);
    }, [map, selecionandoLocal]);

    // Fecha a gaveta e ativa o modo em que o próximo toque no mapa escolhe o ponto
    function iniciarSelecaoNoMapa() {
        if (!map) {
            setErro('O mapa ainda está carregando. Tente novamente em alguns segundos.');
            return;
        }

        setErro('');
        setAberto(false);
        setSelecionandoLocal(true);
    }

    // permissão localização
    function usarGPS() {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setErro('Este navegador não oferece suporte à localização.');
            return;
        }

        if (typeof window !== 'undefined' && !window.isSecureContext) {
            setErro('A localização funciona em localhost ou em uma conexão HTTPS.');
            return;
        }

        setGpsCarregando(true);
        setErro('');

        navigator.geolocation.getCurrentPosition(
            (posicao) => {
                const lat = posicao.coords.latitude;
                const lng = posicao.coords.longitude;
                setLocal({ lat, lng, origem: 'gps' });
                setGpsCarregando(false);
                if (map) {
                    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
                }
            },
            (falha) => {
                setGpsCarregando(false);
                if (falha.code === 1) {
                    setErro('A permissão de localização foi negada. Você pode marcar o ponto diretamente no mapa.');
                } else if (falha.code === 2) {
                    setErro('Não foi possível identificar sua localização. Tente marcar no mapa.');
                } else {
                    setErro('A localização demorou para responder. Tente novamente.');
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
    }

    // Fecha a gaveta sem perder os dados
    function fechar() {
        setAberto(false);
        setErro('');
    }

    // guarda a categoria e passa pros detalhes da ocorrência
    function selecionarCategoria(item) {
        setCategoria(item);
        setEtapa('formulario');
        setErro('');
    }

    // botão voltar
    function voltarCategorias() {
        setEtapa('categorias');
        setErro('');
    }


    // A foto é enviado como File
    async function enviarReporte(evento) {
        evento.preventDefault();

        if (!local) {
            setErro('Use a localização pelo GPS ou marque um ponto no mapa.');
            return;
        }

        // estrutura dos dados para a integração com o backend.
        const dadosReporte = {
            categoria: categoria?.id || 'outro',
            categoria_nome: categoria?.nome || 'Outro problema',
            latitude: local.lat,
            longitude: local.lng,
            origem_localizacao: local.origem, // 'gps' ou 'mapa'.
            descricao: descricao.trim(),
            arquivo_foto: foto || null, // arquivo original não é uma URL ainda.
        };

        setErro('');

        // Sem callback
        if (typeof onEnviarReporte !== 'function') {
            setEnvioRealizado(false);
            setEtapa('concluido');
            return;
        }

        // Com callback, passa os dados para onEnviarReport
        try {
            setEnviando(true);
            await onEnviarReporte(dadosReporte);
            setEnvioRealizado(true);
            setEtapa('concluido');
        } catch (falha) {
            setErro(falha?.message || 'Não foi possível enviar o reporte. Tente novamente.');
        } finally {
            setEnviando(false);
        }
    }

    // Limpa os campos para fazer um novo reporte
    function reiniciar() {
        setAberto(false);
        setEtapa('categorias');
        setCategoria(null);
        setLocal(null);
        setDescricao('');
        setFoto(null);
        setErro('');
        setEnviando(false);
        setEnvioRealizado(false);
        setSelecionandoLocal(false);
    }

    const classeBotao = [
        'reporte-flutuante',
        emPerigo ? 'reporte-flutuante--alerta' : '',
        fase === 'itinerario' && listaAberta ? 'reporte-flutuante--itinerario' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className="reporte-root">
            
            <style>{ESTILOS_REPORTE}</style>

            {/* Botão principal que abre a gaveta de reporte */}
            {!selecionandoLocal && (
                <button
                    type="button"
                    className={classeBotao}
                    onClick={() => { setAberto(true); setEtapa(categoria ? 'formulario' : 'categorias'); }}
                    aria-label="Reportar ocorrência"
                >
                    <IconeReporte nome="flag" tamanho={20} />
                    <span>Reportar</span>
                </button>
            )}

            {selecionandoLocal && (
                <div className="reporte-instrucao-mapa">
                    <span><IconeReporte nome="pin" tamanho={18} /> Toque no mapa para marcar o local da ocorrência</span>
                    <button type="button" onClick={() => setSelecionandoLocal(false)}>Cancelar</button>
                </div>
            )}

            {/* Fundo escuro */}
            {aberto && (
                <>
                    <button
                        type="button"
                        className="reporte-fundo"
                        onClick={fechar}
                        aria-label="Fechar formulário de reporte"
                    />

                    <section className="reporte-gaveta" role="dialog" aria-modal="true" aria-labelledby="reporte-titulo">
                        <div className="reporte-alca" aria-hidden="true"><span /></div>

                        <header className="reporte-cabecalho">
                            <div>
                                <p className="reporte-sobretitulo">ALERTA ABC</p>
                                <h2 id="reporte-titulo">
                                    {etapa === 'categorias' && 'O que está acontecendo?'}
                                    {etapa === 'formulario' && 'Detalhes da ocorrência'}
                                    {etapa === 'concluido' && (envioRealizado ? 'Reporte enviado!' : 'Alerta enviado!')}
                                </h2>
                                <p className="reporte-subtitulo">
                                    {etapa === 'concluido' && (envioRealizado
                                        ? 'O reporte foi encaminhado para análise.'
                                        : '')}
                                </p>    
                            </div>
                            <button type="button" className="reporte-fechar" onClick={fechar} aria-label="Fechar">
                                <IconeReporte nome="close" tamanho={20} />
                            </button>
                        </header>

                        {/* seleção do tipo de ocorrência. */}
                        {etapa === 'categorias' && (
                            <div className="reporte-categorias">
                                {CATEGORIAS.map((item) => (
                                    <button
                                        type="button"
                                        key={item.id}
                                        className="reporte-categoria"
                                        onClick={() => selecionarCategoria(item)}
                                    >
                                        <span className="reporte-categoria-icone"><IconeReporte nome={item.icone} tamanho={25} /></span>
                                        <span>{item.nome}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* localização, descrição e foto  */}
                        {etapa === 'formulario' && (
                            <form className="reporte-formulario" onSubmit={enviarReporte}>
                                <button type="button" className="reporte-voltar" onClick={voltarCategorias}>
                                    <IconeReporte nome="back" tamanho={17} /> Alterar categoria
                                </button>

                                <div className="reporte-categoria-escolhida">
                                    <span className="reporte-categoria-icone"><IconeReporte nome={categoria?.icone || 'more'} tamanho={22} /></span>
                                    <span><small>TIPO DE OCORRÊNCIA</small><strong>{categoria?.nome || 'Outro problema'}</strong></span>
                                </div>

                                <div className="reporte-campo-grupo">
                                    
                                    <div className="reporte-acoes-local">
                                        <button type="button" className="reporte-acao-local" onClick={usarGPS} disabled={gpsCarregando}>
                                            <IconeReporte nome="gps" tamanho={18} />
                                            {gpsCarregando ? 'Localizando...' : 'Usar minha localização'}
                                        </button>
                                        <button type="button" className="reporte-acao-local" onClick={iniciarSelecaoNoMapa}>
                                            <IconeReporte nome="pin" tamanho={18} />
                                            Marcar no mapa
                                        </button>
                                    </div>
                                    {local ? (
                                        <div className="reporte-local-confirmado">
                                            <IconeReporte nome="pin" tamanho={17} />
                                            <span>
                                                Local marcado ({local.origem === 'gps' ? 'GPS' : 'mapa'}): {local.lat.toFixed(5)}, {local.lng.toFixed(5)}
                                            </span>
                                        </div>
                                    ) : (
                                        <p className="reporte-ajuda"></p>
                                    )}
                                </div>

                                <div className="reporte-campo-grupo">
                                    <label htmlFor="reporte-descricao">Descrição <span>(opcional)</span></label>
                                    <textarea
                                        id="reporte-descricao"
                                        rows={3}
                                        maxLength={300}
                                        placeholder="Conte o que aconteceu..."
                                        value={descricao}
                                        onChange={(evento) => setDescricao(evento.target.value)}
                                    />
                                    <small className="reporte-contador">{descricao.length}/300</small>
                                </div>

                                <div className="reporte-campo-grupo">
                                    <label htmlFor="reporte-foto">Foto <span>(opcional)</span></label>
                                    <label className="reporte-arquivo" htmlFor="reporte-foto">
                                        <IconeReporte nome="camera" tamanho={19} />
                                        <span>{foto ? foto.name : 'Adicionar uma foto'}</span>
                                        <input id="reporte-foto" type="file" accept="image/*" onChange={(evento) => setFoto(evento.target.files?.[0] || null)} />
                                    </label>
                                    
                                </div>

                                {erro && <p className="reporte-erro" role="alert">{erro}</p>}

                                <button type="submit" className="reporte-enviar" disabled={enviando}>
                                    {enviando ? 'Enviando...' : (onEnviarReporte ? 'Enviar reporte' : 'Enviar')}
                                </button>
                                {!onEnviarReporte && (
                                    <p className="reporte-nota">
                                        
                                    </p>
                                )}
                            </form>
                        )}

                        {/* Tela final: diferencia o envio real do teste local */}
                        {etapa === 'concluido' && (
                            <div className="reporte-sucesso">
                                <div className="reporte-sucesso-icone">✓</div>
                                <h3>{envioRealizado ? 'Reporte enviado!' : 'Alerta enviado!'}</h3>
                                <p>{envioRealizado
                                    ? 'O reporte foi encaminhado para a etapa de análise.'
                                    : 'Obrigado pela contribuição!'}</p>
                                <button type="button" className="reporte-enviar" onClick={reiniciar}>Fechar janela</button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

// CSS 



const ESTILOS_REPORTE = `
/* Área principal do botão e da gaveta. */
.reporte-root {
    position: absolute;
    inset: 0;
    z-index: 1300;
    pointer-events: none;
    font-family: Arial, sans-serif;
}

/* Botão flutuante de reporte. */
.reporte-flutuante {
    position: absolute;
    left: 18px;
    bottom: 22px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 50px;
    padding: 0 19px;
    border: 1px solid #fff;
    border-radius: 25px;
    color: #fff;
    background: #ea580c;
    box-shadow: 0 4px 12px #0003;
    font: bold 14px Arial, sans-serif;
    cursor: pointer;
    pointer-events: auto;
}

.reporte-flutuante:hover {
    background: #c2410c;
}

/* Aviso para selecionar um local no mapa. */
.reporte-instrucao-mapa {
    position: absolute;
    top: 16px;
    left: 50%;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100% - 28px);
    padding: 10px 14px;
    border: 1px solid #fed7aa;
    border-radius: 12px;
    color: #7c2d12;
    background: #fff7ed;
    box-shadow: 0 3px 10px #0003;
    font-size: 13px;
    transform: translateX(-50%);
    pointer-events: auto;
}

.reporte-instrucao-mapa span {
    display: flex;
    align-items: center;
    gap: 7px;
}

.reporte-instrucao-mapa button {
    border: 0;
    color: #c2410c;
    background: none;
    font-weight: bold;
    cursor: pointer;
}

/* Fundo escuro atrás da gaveta. */
.reporte-fundo {
    position: absolute;
    inset: 0;
    z-index: 3;
    width: 100%;
    height: 100%;
    border: 0;
    background: #08142380;
    pointer-events: auto;
}

/* Gaveta que aparece na parte inferior da tela. */
.reporte-gaveta {
    position: absolute;
    left: 50%;
    bottom: 0;
    z-index: 4;
    width: min(100%, 560px);
    max-height: 82vh;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 10px 22px 22px;
    border-radius: 25px 25px 0 0;
    color: #172b45;
    background: #fff;
    box-shadow: 0 -5px 20px #0003;
    transform: translateX(-50%);
    pointer-events: auto;
}

/* Pequena alça no topo da gaveta. */
.reporte-alca {
    display: flex;
    justify-content: center;
    padding: 5px 0 14px;
}

.reporte-alca span {
    width: 42px;
    height: 5px;
    border-radius: 5px;
    background: #d6dee8;
}

/* Título e botão de fechar. */
.reporte-cabecalho {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
}

.reporte-sobretitulo {
    margin: 0 0 6px;
    color: #ea580c;
    font-size: 10px;
    font-weight: bold;
}

.reporte-cabecalho h2 {
    margin: 0;
    color: #0b2545;
    font-size: 22px;
}

.reporte-subtitulo {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
}

.reporte-fechar {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    color: #475569;
    background: #f1f5f9;
    cursor: pointer;
}

/* Opções de ocorrências. */
.reporte-categorias {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.reporte-categoria {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 76px;
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    color: #243b53;
    background: #fff;
    text-align: left;
    font: bold 13px Arial, sans-serif;
    cursor: pointer;
}

.reporte-categoria:hover {
    border-color: #fb923c;
    background: #fff7ed;
}

.reporte-categoria-icone {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    color: #ea580c;
    background: #fff1e8;
}

/* Organização do formulário. */
.reporte-formulario {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.reporte-voltar {
    display: flex;
    align-items: center;
    gap: 5px;
    align-self: flex-start;
    padding: 0;
    border: 0;
    color: #52657a;
    background: none;
    font-weight: bold;
    cursor: pointer;
}

/* Categoria selecionada pelo usuário. */
.reporte-categoria-escolhida {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px 12px;
    border: 1px solid #fed7aa;
    border-radius: 14px;
    background: #fff7ed;
}

.reporte-categoria-escolhida span:last-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.reporte-categoria-escolhida small {
    color: #9a3412;
    font-size: 10px;
    font-weight: bold;
}

.reporte-categoria-escolhida strong {
    color: #7c2d12;
    font-size: 14px;
}

/* Campos de preenchimento. */
.reporte-campo-grupo {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.reporte-campo-grupo > label {
    color: #1e293b;
    font-size: 13px;
    font-weight: bold;
}

.reporte-campo-grupo > label span {
    color: #94a3b8;
    font-weight: normal;
}

/* Botões para escolher a localização. */
.reporte-acoes-local {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.reporte-acao-local {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 43px;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    color: #17436b;
    background: #f8fafc;
    font-size: 12px;
    cursor: pointer;
}

.reporte-acao-local:hover {
    background: #eff6ff;
}

.reporte-acao-local:disabled {
    opacity: 0.6;
    cursor: wait;
}

/* Confirmação da localização escolhida. */
.reporte-local-confirmado {
    display: flex;
    gap: 7px;
    padding: 9px 10px;
    border-radius: 10px;
    color: #166534;
    background: #f0fdf4;
    font-size: 11px;
}

/* Textos de ajuda. */
.reporte-ajuda {
    margin: 0;
    color: #64748b;
    font-size: 11px;
}

/* Campo de descrição. */
.reporte-campo-grupo textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 11px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    color: #1e293b;
    background: #fff;
    font: 13px Arial, sans-serif;
    resize: vertical;
}

.reporte-campo-grupo textarea:focus {
    border-color: #ea580c;
    outline: none;
}

.reporte-contador {
    align-self: flex-end;
    color: #94a3b8;
    font-size: 10px;
}

/* Seleção de foto. */
.reporte-arquivo {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px dashed #cbd5e1;
    border-radius: 12px;
    color: #475569;
    background: #f8fafc;
    font-size: 12px;
    cursor: pointer;
}

.reporte-arquivo span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.reporte-arquivo input {
    display: none;
}

/* Mensagem de erro. */
.reporte-erro {
    margin: 0;
    padding: 9px 11px;
    border-radius: 10px;
    color: #991b1b;
    background: #fef2f2;
    font-size: 12px;
}

/* Botão de envio. */
.reporte-enviar {
    width: 100%;
    min-height: 48px;
    padding: 12px;
    border: 0;
    border-radius: 12px;
    color: #fff;
    background: #ea580c;
    font-weight: bold;
    cursor: pointer;
}

.reporte-enviar:hover {
    background: #c2410c;
}

.reporte-nota {
    margin: -8px 0 0;
    color: #94a3b8;
    text-align: center;
    font-size: 10px;
}

/* Mensagem após o envio. */
.reporte-sucesso {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 12px 4px;
    text-align: center;
}

.reporte-sucesso-icone {
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    color: #166534;
    background: #dcfce7;
    font-size: 30px;
}

.reporte-sucesso h3 {
    margin: 0;
    color: #0b2545;
    font-size: 18px;
}

.reporte-sucesso p {
    max-width: 390px;
    color: #64748b;
    font-size: 13px;
}

/* Ajustes para celulares. */
@media (max-width: 640px) {
    .reporte-flutuante {
        left: 14px;
        bottom: 18px;
        min-height: 48px;
        padding: 0 16px;
    }

    .reporte-flutuante--alerta {
        bottom: 96px;
    }

    .reporte-flutuante--itinerario {
        bottom: 58%;
    }

    .reporte-gaveta {
        width: 100%;
        max-height: 84vh;
        padding-left: 18px;
        padding-right: 18px;
    }

    .reporte-cabecalho h2 {
        font-size: 20px;
    }

    .reporte-categoria {
        min-height: 70px;
        padding: 9px;
        gap: 8px;
        font-size: 12px;
    }

    .reporte-categoria-icone {
        width: 39px;
        height: 39px;
    }

    .reporte-instrucao-mapa {
        top: 12px;
        gap: 8px;
        padding: 9px;
        font-size: 11px;
    }
}

/* Ajustes para telas muito estreitas. */
@media (max-width: 360px) {
    .reporte-categorias,
    .reporte-acoes-local {
        grid-template-columns: 1fr;
    }

    .reporte-categoria {
        min-height: 60px;
    }
}
`;
