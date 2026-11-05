// Indica que o componente será executado no navegador,
// permitindo utilizar estados e interações do React.
"use client";

// Importa o hook useState para controlar os estados da página.
import { useState } from "react";

// Importa o componente responsável pela interface de enchentes
// e o tipo utilizado para estruturar os dados dos alertas.
import InterfaceEnchentes, {
  type AlertaEnchente,
} from "@/components/InterfaceEnchentes";

// EXEMPLO DE ALERTA

// Cria uma lista de alertas fictícios para testar a interface.
// Cada elemento precisa seguir a estrutura definida por AlertaEnchente.
const alertasExemplo: AlertaEnchente[] = [
  {
    // Identificador único do alerta.
    id: "exemplo-1",

    // Título apresentado ao usuário.
    titulo: "Alerta de exemplo",

    // Local onde ocorre a situação informada.
    local: "Local x",

    // Descrição com detalhes sobre a ocorrência.
    descricao: "Defesa civil informa regiões de alagamento em região y",

    // Classificação do nível de risco do alerta.
    nivel: "moderado",
  },
];

// COMPONENTE PRINCIPAL DA PÁGINA DE TESTES

// Exporta o componente que apresenta a interface de enchentes
// em um ambiente de teste, simulando a visualização de um celular.
export default function PaginaTesteInterface() {

  // Cria o estado responsável por controlar o modo chuva.
  // Inicialmente, o modo está desativado (false).
  // setModoChuva permite ativar ou desativar essa configuração.
  const [modoChuva, setModoChuva] = useState(false);

  // Cria o estado responsável por armazenar mensagens de aviso.
  // Inicialmente, não existe nenhuma mensagem (null).
  // setAviso permite atualizar o aviso exibido na interface.
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    // Elemento principal da página.
    // Ocupa pelo menos toda a altura da tela e utiliza Flexbox
    // para centralizar o conteúdo horizontalmente.
    // Em telas médias, também centraliza verticalmente e adiciona espaçamento.
    <main className="flex min-h-screen justify-center bg-slate-200 md:items-center md:p-6">

      {/* CONTÊINER QUE SIMULA A TELA DE UM CELULAR */}

      {/* Define a área onde a interface será apresentada.
          A largura máxima é de 430 pixels e a altura mínima é de 640 pixels.
          Em telas médias, utiliza altura de 780 pixels,
          bordas arredondadas e sombra.
          overflow-hidden impede que elementos ultrapassem os limites. */}
      <div className="relative h-[100dvh] min-h-[640px] w-full max-w-[430px] overflow-hidden bg-slate-100 md:h-[780px] md:rounded-3xl md:shadow-2xl">

        {/* ESPAÇO RESERVADO PARA O MAPA */}

        {/* Posiciona um texto no centro vertical da tela,
            indicando onde o mapa será apresentado futuramente. */}
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-slate-400">
          <p className="text-sm font-semibold">Espaço pro mapa</p>
        </div>

        {/* INTERFACE DE ALERTAS DE ENCHENTES */}

        {/* Renderiza o componente InterfaceEnchentes,
            enviando os estados e os dados necessários para seu funcionamento. */}
        <InterfaceEnchentes

          // Envia o estado atual do modo chuva.
          modoChuva={modoChuva}

          // Envia a função que permite ao componente filho
          // modificar o estado do modo chuva.
          aoAlternarModoChuva={setModoChuva}

          // Envia a lista de alertas fictícios para exibição.
          alertas={alertasExemplo}

          // Envia a mensagem de aviso atual, caso exista.
          aviso={aviso}
        />
      </div>
    </main>
  );
}