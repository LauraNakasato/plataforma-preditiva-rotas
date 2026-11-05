// Indica que o componente será executado no lado do cliente.
// Isso é necessário porque ele utiliza estados e interações do React.
"use client";

// Importa o hook useState, utilizado para controlar informações
// que podem mudar durante a utilização da interface.
// FormEvent é um tipo do React utilizado para tipar eventos de formulários.
import { useState, type FormEvent } from "react";

// FORMATO DOS ALERTAS

// Define os três níveis de gravidade que um alerta de enchente pode ter.
// O uso de tipos literais impede que sejam utilizados valores diferentes
// de "alto", "moderado" ou "baixo".
export type NivelAlerta = "alto" | "moderado" | "baixo";

// Define a estrutura de dados que cada alerta de enchente deverá possuir.
export type AlertaEnchente = {
  // Identificador único do alerta, utilizado para diferenciá-lo dos demais.
  id: string;

  // Título principal do alerta.
  titulo: string;

  // Local onde a ocorrência foi registrada.
  local: string;

  // Descrição com informações adicionais sobre a situação.
  descricao: string;

  // Nível de gravidade do alerta, seguindo o tipo NivelAlerta.
  nivel: NivelAlerta;

  // Horário em que o alerta foi registrado ou atualizado.
  // O símbolo ? indica que essa informação é opcional.
  horario?: string;
};

// INFORMAÇÕES RECEBIDAS PELO COMPONENTE

// Define as propriedades (Props) que podem ser recebidas
// pelo componente InterfaceEnchentes.
type Props = {
  // Lista de alertas que serão apresentados na interface.
  // É opcional porque o componente pode funcionar sem alertas.
  alertas?: AlertaEnchente[];

  // Informa se o modo chuva está ativado ou desativado.
  modoChuva: boolean;

  // Função recebida do componente pai para alterar o modo chuva.
  // Recebe um valor booleano: true para ativar e false para desativar.
  aoAlternarModoChuva: (ativo: boolean) => void;

  // Função opcional responsável por receber a origem e o destino
  // informados pelo usuário para realizar a busca de uma rota.
  aoBuscarRota?: (origem: string, destino: string) => void;

  // Mensagem opcional de aviso que pode ser exibida na interface.
  // Pode receber um texto ou null quando não existir aviso.
  aviso?: string | null;
};

// COMPONENTE PRINCIPAL DA INTERFACE

// Declara e exporta o componente InterfaceEnchentes.
// Ele recebe as propriedades definidas anteriormente.
// Caso nenhuma lista de alertas seja enviada, utiliza uma lista vazia.
export default function InterfaceEnchentes({
  alertas = [],
  modoChuva,
  aoAlternarModoChuva,
  aoBuscarRota,
  aviso,
}: Props) {

  // Armazena o endereço ou nome do ponto de partida informado pelo usuário.
  // Inicialmente, o campo fica vazio.
  const [origem, setOrigem] = useState("");

  // Armazena o endereço ou nome do destino informado pelo usuário.
  // Inicialmente, o campo também fica vazio.
  const [destino, setDestino] = useState("");

  // Controla a abertura e o fechamento da janela de alertas.
  // false significa que a janela está fechada.
  const [mostrarAlertas, setMostrarAlertas] = useState(false);

  // Armazena mensagens relacionadas à busca de trajetos,
  // como avisos sobre campos que precisam ser preenchidos.
  const [mensagem, setMensagem] = useState("");

  // FUNÇÃO PARA BUSCAR UMA ROTA

  // Executada quando o usuário envia o formulário de busca de trajeto.
  // O parâmetro evento representa o evento de envio do formulário.
  function buscarRota(evento: FormEvent<HTMLFormElement>) {

    // Impede o comportamento padrão do navegador de recarregar a página
    // quando um formulário é enviado.
    evento.preventDefault();

    // Verifica se os campos de origem e destino foram preenchidos.
    // trim() remove espaços em branco no início e no final do texto.
    if (!origem.trim() || !destino.trim()) {

      // Exibe uma mensagem caso algum dos campos esteja vazio.
      setMensagem("Preencha os campos.");

      // Interrompe a execução da função para não continuar a busca.
      return;
    }

    // Verifica se a função responsável por buscar a rota foi recebida
    // pelo componente pai.
    if (!aoBuscarRota) {

      // Limpa qualquer mensagem anterior e encerra a execução.
      setMensagem("");
      return;
    }

    // Limpa mensagens anteriores antes de realizar a busca.
    setMensagem("");

    // Executa a função recebida do componente pai,
    // enviando os valores de origem e destino sem espaços excedentes.
    aoBuscarRota(origem.trim(), destino.trim());
  }

  // FUNÇÃO PARA INVERTER ORIGEM E DESTINO

  // Permite trocar os valores dos campos de origem e destino.
  function inverterCampos() {

    // Coloca o destino atual no campo de origem.
    setOrigem(destino);

    // Coloca a origem atual no campo de destino.
    setDestino(origem);

    // Limpa mensagens anteriores após a inversão.
    setMensagem("");
  }

  // ESTRUTURA VISUAL DO COMPONENTE

  return (
    // Contêiner principal da interface.
    // pointer-events-none permite que os elementos visuais dessa camada
    // não bloqueiem interações com o mapa que estiver atrás dela.
    // absolute inset-0 faz a interface ocupar toda a área disponível.
    // z-[1100] posiciona a interface acima de elementos com menor z-index.
    // flex flex-col organiza os elementos verticalmente.
    <div className="pointer-events-none absolute inset-0 z-[1100] flex flex-col justify-between text-slate-900">

      {/* PARTE SUPERIOR DA INTERFACE
          Contém o título, o botão de alertas e o formulário de rotas. */}

      {/* Ativa novamente os eventos de interação nessa área,
          permitindo clicar nos botões e preencher os campos.
          mx-auto centraliza o conteúdo e max-w-md limita sua largura. */}
      <div className="pointer-events-auto mx-auto w-full max-w-md p-3">

        {/* CABEÇALHO DA APLICAÇÃO */}

        {/* Apresenta o título e a descrição da plataforma,
            além do botão que abre a janela de alertas. */}
        <header className="mb-3 flex items-center justify-between rounded-xl bg-white p-4 shadow-md">

          {/* Agrupa o título e a descrição da plataforma. */}
          <div>

            {/* Exibe o título principal da interface. */}
            <h1 className="text-lg font-bold text-teal-700">
              Título (Alerta ABC?)
            </h1>

            {/* Apresenta uma breve descrição da finalidade do mapa. */}
            <p className="text-xs text-slate-500">
              Mapa de enchentes do ABC Paulista
            </p>
          </div>

          {/* Botão responsável por abrir a janela de alertas.
              O número exibido corresponde à quantidade de alertas recebidos. */}
          <button
            type="button"
            onClick={() => setMostrarAlertas(true)}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
          >
            Alertas ({alertas.length})
          </button>
        </header>

        {/* FORMULÁRIO DE PLANEJAMENTO DE TRAJETO */}

        {/* Ao enviar o formulário, executa a função buscarRota. */}
        <form onSubmit={buscarRota} className="rounded-xl bg-white p-4 shadow-md">

          {/* Título da seção de planejamento de trajeto. */}
          <h2 className="mb-3 font-semibold">Planeje seu trajeto</h2>

          {/* CAMPO DE ORIGEM */}

          {/* Label identifica o campo de origem e melhora sua acessibilidade.
              htmlFor associa o texto ao input que possui id="origem". */}
          <label htmlFor="origem" className="mb-1 block text-sm">
            Sair de
          </label>

          {/* Campo no qual o usuário informa seu ponto de partida. */}
          <input
            id="origem"

            // value conecta o campo ao estado origem.
            // Assim, o conteúdo exibido acompanha o valor armazenado no React.
            value={origem}

            // Atualiza o estado origem sempre que o usuário digita.
            onChange={(evento) => setOrigem(evento.target.value)}

            // Texto apresentado enquanto o campo está vazio.
            placeholder="Escreva seu ponto de partida"

            // Classes responsáveis pela aparência e pelo espaçamento do campo.
            className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          {/* CAMPO DE DESTINO */}

          {/* Identifica o campo destinado ao endereço de chegada. */}
          <label htmlFor="destino" className="mb-1 block text-sm">
            Ir para
          </label>

          {/* Campo no qual o usuário informa seu destino. */}
          <input
            id="destino"

            // Vincula o conteúdo do campo ao estado destino.
            value={destino}

            // Atualiza o estado destino conforme o usuário digita.
            onChange={(evento) => setDestino(evento.target.value)}

            // Orienta o usuário sobre o que deve ser informado.
            placeholder="Escreva seu destino"

            // Define a aparência visual do campo.
            className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />

          {/* BOTÕES DO FORMULÁRIO */}

          {/* Organiza os dois botões lado a lado utilizando Flexbox. */}
          <div className="flex gap-2">

            {/* Botão que troca os valores dos campos de origem e destino.
                type="button" impede que ele envie o formulário. */}
            <button
              type="button"
              onClick={inverterCampos}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              Inverter
            </button>

            {/* Botão responsável por enviar o formulário
                e iniciar o processo de busca da rota. */}
            <button
              type="submit"
              className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Buscar trajeto
            </button>
          </div>

          {/* MENSAGEM DE VALIDAÇÃO */}

          {/* Verifica se existe alguma mensagem.
              Caso exista, ela é exibida abaixo dos botões.
              role="alert" permite que tecnologias assistivas
              identifiquem a mensagem como um alerta. */}
          {mensagem && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {mensagem}
            </p>
          )}
        </form>

        {/* AVISO RECEBIDO DO COMPONENTE PAI */}

        {/* Verifica se existe uma mensagem de aviso.
            Se houver, apresenta o conteúdo em um quadro abaixo do formulário.
            role="status" indica que se trata de uma informação de status. */}
        {aviso && (
          <p role="status" className="mt-2 rounded-lg bg-white p-3 text-sm shadow">
            {aviso}
          </p>
        )}
      </div>

      {/* BOTÃO DO MODO CHUVA */}

      {/* Área inferior da interface, destinada ao controle do modo chuva. */}
      <div className="pointer-events-auto mx-auto w-full max-w-md p-3">

        {/* Alinha o botão à direita da tela. */}
        <div className="flex justify-end">

          {/* Botão que permite ativar ou desativar o modo chuva. */}
          <button
            type="button"

            // aria-pressed informa às tecnologias assistivas
            // se o botão está atualmente ativado.
            aria-pressed={modoChuva}

            // Inverte o estado atual do modo chuva.
            // Se estiver ligado, desliga; se estiver desligado, liga.
            onClick={() => aoAlternarModoChuva(!modoChuva)}

            // Altera a aparência do botão conforme o estado do modo chuva.
            // Quando ativado, apresenta fundo verde-azulado e texto branco.
            // Quando desativado, apresenta fundo branco e texto escuro.
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-md ${modoChuva
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-900"
              }`}
          >
            {/* Exibe o ícone e informa se o modo chuva está ligado ou desligado.
                O texto muda automaticamente conforme o estado do botão. */}
            ☔ Modo chuva: {modoChuva ? "ligado" : "desligado"}
          </button>
        </div>
      </div>

      {/* JANELA DE ALERTAS */}

      {/* Verifica se mostrarAlertas está true.
          Quando o usuário clica no botão Alertas, esta janela é exibida.
          Quando está false, a janela não aparece na interface. */}
      {mostrarAlertas && (

        // Camada que cobre a área disponível e escurece o fundo,
        // destacando a janela de alertas.
        <div className="pointer-events-auto absolute inset-0 flex items-end bg-black/40">

          {/* Janela que apresenta os alertas recebidos.
              role="dialog" identifica o elemento como uma janela de diálogo.
              aria-modal="true" informa que ela funciona como uma janela modal.
              max-h-[75dvh] limita sua altura a 75% da altura dinâmica da tela.
              overflow-y-auto permite rolagem quando existem muitos alertas. */}
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Alertas da região"
            className="max-h-[75dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5"
          >

            {/* CABEÇALHO DA JANELA DE ALERTAS */}

            {/* Organiza o título e o botão de fechamento lado a lado. */}
            <div className="mb-4 flex items-center justify-between">

              {/* Título da janela que reúne os alertas da região. */}
              <h2 className="text-lg font-bold">Alertas da região</h2>

              {/* Botão que fecha a janela de alertas.
                  Altera mostrarAlertas para false. */}
              <button
                type="button"
                onClick={() => setMostrarAlertas(false)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
              >
                Fechar
              </button>
            </div>

            {/* EXIBIÇÃO DOS ALERTAS */}

            {/* Verifica se a lista de alertas está vazia.
                Se não houver alertas, apresenta uma mensagem informativa. */}
            {alertas.length === 0 ? (

              // Mensagem exibida quando nenhum alerta foi recebido.
              <p className="text-sm text-slate-600">
                Nenhum alerta recebido.
              </p>

            ) : (

              // Caso existam alertas, cria uma lista para apresentá-los.
              <ul className="space-y-3">

                {/* Percorre todos os elementos da lista alertas.
                    Para cada alerta, cria um elemento visual independente.
                    map() permite transformar os dados recebidos em elementos da interface. */}
                {alertas.map((alerta) => (

                  // key utiliza o identificador único de cada alerta.
                  // Isso ajuda o React a identificar cada elemento
                  // e atualizar a lista de maneira eficiente.
                  <li key={alerta.id} className="rounded-lg border border-slate-200 p-3">

                    {/* Exibe o nível de gravidade do alerta,
                        acompanhado da palavra "risco".
                        uppercase transforma o texto em letras maiúsculas. */}
                    <p className="text-xs font-semibold uppercase text-teal-700">
                      {alerta.nivel} risco
                    </p>

                    {/* Apresenta o título do alerta. */}
                    <h3 className="font-semibold">{alerta.titulo}</h3>

                    {/* Informa o local da ocorrência. */}
                    <p className="text-sm">{alerta.local}</p>

                    {/* Apresenta a descrição detalhada da situação registrada. */}
                    <p className="mt-1 text-sm text-slate-600">
                      {alerta.descricao}
                    </p>

                    {/* Verifica se o alerta possui um horário informado.
                        Caso possua, apresenta essa informação.
                        Caso contrário, o elemento não é renderizado. */}
                    {alerta.horario && (
                      <p className="mt-1 text-xs text-slate-500">
                        {alerta.horario}
                      </p>
                    )}
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