"use client";

import { useState, type FormEvent } from "react";

{/* formato dos alertas */}

export type NivelAlerta = "alto" | "moderado" | "baixo";

export type AlertaEnchente = {
  id: string;
  titulo: string;
  local: string;
  descricao: string;
  nivel: NivelAlerta;
  horario?: string;
};

{/* informações pra puxar do mapa */}

type Props = {
  alertas?: AlertaEnchente[];
  modoChuva: boolean;
  aoAlternarModoChuva: (ativo: boolean) => void;
  aoBuscarRota?: (origem: string, destino: string) => void;
  aviso?: string | null;
};

export default function InterfaceEnchentes({
  alertas = [],
  modoChuva,
  aoAlternarModoChuva,
  aoBuscarRota,
  aviso,
}: Props) {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [mostrarAlertas, setMostrarAlertas] = useState(false);
  const [mensagem, setMensagem] = useState("");

  function buscarRota(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); 

    if (!origem.trim() || !destino.trim()) {
      setMensagem("Preencha os campos.");
      return;
    }

    if (!aoBuscarRota) {
      setMensagem("");
      return;
    }

    setMensagem("");
    aoBuscarRota(origem.trim(), destino.trim());
  }

  function inverterCampos() {
    setOrigem(destino);
    setDestino(origem);
    setMensagem("");
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[1100] flex flex-col justify-between text-slate-900">

      {/* parte de cima */}

      <div className="pointer-events-auto mx-auto w-full max-w-md p-3">
        <header className="mb-3 flex items-center justify-between rounded-xl bg-white p-4 shadow-md">
          <div>
            <h1 className="text-lg font-bold text-teal-700">Título (Alerta ABC?)</h1>
            <p className="text-xs text-slate-500">Mapa de enchentes do ABC Paulista</p>
          </div>
          <button type="button" onClick={() => setMostrarAlertas(true)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
            Alertas ({alertas.length})
          </button>
        </header>

        <form onSubmit={buscarRota} className="rounded-xl bg-white p-4 shadow-md">
          <h2 className="mb-3 font-semibold">Planeje seu trajeto</h2>

          <label htmlFor="origem" className="mb-1 block text-sm">Sair de</label>
          <input
            id="origem"
            value={origem}
            onChange={(evento) => setOrigem(evento.target.value)}
            placeholder="Escreva seu ponto de partida"
            className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          <label htmlFor="destino" className="mb-1 block text-sm">Ir para</label>
          <input
            id="destino"
            value={destino}
            onChange={(evento) => setDestino(evento.target.value)}
            placeholder="Escreva seu destino"
            className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          <div className="flex gap-2">
            <button type="button" onClick={inverterCampos} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              Inverter
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
              Buscar trajeto
            </button>
          </div>
          {mensagem && <p role="alert" className="mt-2 text-sm text-red-600">{mensagem}</p>}
        </form>
        {aviso && <p role="status" className="mt-2 rounded-lg bg-white p-3 text-sm shadow">{aviso}</p>}
      </div>

      {/* botão modo chuva */}
    
      <div className="pointer-events-auto mx-auto w-full max-w-md p-3">
        <div className="flex justify-end">
          <button
            type="button"
            aria-pressed={modoChuva}
            onClick={() => aoAlternarModoChuva(!modoChuva)}
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-md ${modoChuva ? "bg-teal-700 text-white" : "bg-white text-slate-900"}`}
          >
            ☔ Modo chuva: {modoChuva ? "ligado" : "desligado"}
          </button>
        </div>
      </div>

      {/* janela de alertas */}
    
      {mostrarAlertas && (
        <div className="pointer-events-auto absolute inset-0 flex items-end bg-black/40">
          <section role="dialog" aria-modal="true" aria-label="Alertas da região" className="max-h-[75dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Alertas da região</h2>
              <button type="button" onClick={() => setMostrarAlertas(false)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
                Fechar
              </button>
            </div>
            {alertas.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhum alerta recebido.</p>
            ) : (
              <ul className="space-y-3">
                {alertas.map((alerta) => (
                  <li key={alerta.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-teal-700">{alerta.nivel} risco</p>
                    <h3 className="font-semibold">{alerta.titulo}</h3>
                    <p className="text-sm">{alerta.local}</p>
                    <p className="mt-1 text-sm text-slate-600">{alerta.descricao}</p>
                    {alerta.horario && <p className="mt-1 text-xs text-slate-500">{alerta.horario}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
