"use client";

import { useState } from "react";
import InterfaceEnchentes, {
  type AlertaEnchente,
} from "@/components/InterfaceEnchentes";

// exemplo de alerta

const alertasExemplo: AlertaEnchente[] = [
  {
    id: "exemplo-1",
    titulo: "Alerta de exemplo",
    local: "Local x",
    descricao: "Defesa civil informa regiões de alagamento em região y",
    nivel: "moderado",
  },
];

export default function PaginaTesteInterface() {
  const [modoChuva, setModoChuva] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);


  return (
    <main className="flex min-h-screen justify-center bg-slate-200 md:items-center md:p-6">

      
      <div className="relative h-[100dvh] min-h-[640px] w-full max-w-[430px] overflow-hidden bg-slate-100 md:h-[780px] md:rounded-3xl md:shadow-2xl">
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-slate-400">
          <p className="text-sm font-semibold">Espaço pro mapa</p>
        </div>

        <InterfaceEnchentes
          modoChuva={modoChuva}
          aoAlternarModoChuva={setModoChuva}
          alertas={alertasExemplo}
          aviso={aviso}
        />
      </div>
    </main>
  );
}
