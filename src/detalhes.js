import { descreverPrazo, grupoDoProjeto } from "./dados-b2b.js";
import { formatarMoeda } from "./formatadores.js";

// Painel sobreposto com os projetos por trás de um número do painel — uma barra
// do gráfico, um chip de prazo, um cartão. Fica por cima da grade para não
// mexer no layout, que precisa caber sem rolagem.

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

const semPrazo = (item) => item.remaining_days === null || item.remaining_days === undefined;

// O prazo sozinho dizia "Concluído" para 184 dos 188 projetos, inclusive os
// cancelados e os que estão só esperando outro setor. Com o status na mão, a
// coluna conta a mesma história do gráfico de status.
function descreverSituacao(item) {
  if (item.status) {
    const grupo = grupoDoProjeto(item);
    if (grupo === "cancelado") return "Cancelado";
    if (grupo === "entregue") return "Esperando setor responsável";
    if (grupo === "ativado") return "Concluído";
  }

  return descreverPrazo(item.remaining_days);
}

// Mesmas cores dos gráficos de status: verde concluído, azul parado com outro
// setor, amarelo o que está correndo, vermelho atrasado; cancelado fica neutro,
// não é falha de prazo.
function classeDoPrazo(item) {
  if (item.status) {
    const grupo = grupoDoProjeto(item);
    if (grupo === "cancelado") return "prazo-cancelado";
    if (grupo === "entregue") return "prazo-outro-setor";
    if (grupo === "ativado") return "prazo-concluido";
  }

  if (semPrazo(item)) return "prazo-concluido";
  return item.remaining_days < 0 ? "prazo-atrasado" : "prazo-em-aberto";
}

// Cada lista traz campos diferentes: só os maiores projetos têm destaque, só os
// financeiros têm valor, só a prioridade tem solicitante. A coluna entra quando
// algum item da lista a preenche — senão seria uma coluna inteira de vazio.
const COLUNAS = [
  { titulo: "Destaque", classe: () => "coluna-destaque", ler: (item) => item.destaque },
  { titulo: "Cliente", ler: (item) => item.client, sempre: true },
  { titulo: "Solicitante", ler: (item) => item.requester },
  { titulo: "Regional", ler: (item) => String(item.region ?? "").replace("Regional - ", ""), sempre: true },
  { titulo: "Setor", ler: (item) => item.sector, sempre: true },
  // O gráfico agrupa os doze status em três; aqui aparece o status real, que
  // é o que some ao agrupar.
  { titulo: "Status", ler: (item) => item.status },
  {
    titulo: "Valor",
    classe: () => "coluna-valor",
    ler: (item) => (item.value === undefined ? undefined : formatarMoeda(item.value)),
  },
  { titulo: "Situação", classe: classeDoPrazo, ler: descreverSituacao, sempre: true },
];

function colunasPara(itens) {
  return COLUNAS.filter((coluna) => coluna.sempre || itens.some((item) => coluna.ler(item) !== undefined));
}

// Quem ainda tem prazo correndo vai para o topo: numa lista de 184 concluídos,
// os poucos em andamento sumiriam no meio da rolagem. Entre eles, o mais
// atrasado primeiro. A ordem original é preservada no resto (ordenação estável).
function emAndamentoPrimeiro(itens) {
  return [...itens].sort((primeiro, segundo) => {
    if (semPrazo(primeiro) !== semPrazo(segundo)) return semPrazo(primeiro) ? 1 : -1;
    if (semPrazo(primeiro)) return 0;
    return primeiro.remaining_days - segundo.remaining_days;
  });
}

function montarLinha(item, colunas) {
  const celulas = colunas.map((coluna) => {
    const classe = coluna.classe ? ` class="${coluna.classe(item)}"` : "";
    return `<td${classe}>${escapar(coluna.ler(item))}</td>`;
  });

  return `<tr>${celulas.join("")}</tr>`;
}

function montarTabela(itens, colunas) {
  if (!itens.length) return `<p class="aviso">Nenhum projeto nesta situação.</p>`;

  return `<table class="tabela-de-prazos">
            <thead><tr>${colunas.map((coluna) => `<th>${coluna.titulo}</th>`).join("")}</tr></thead>
            <tbody>${itens.map((item) => montarLinha(item, colunas)).join("")}</tbody>
          </table>`;
}

// A API manda algum projeto sem solicitante. Sem uma opção para eles, essas
// linhas só apareceriam em "todos" — somem ao filtrar e o total não fecha.
// Do maior para o menor: quem tem mais projetos é quem se costuma procurar.
function contarPorSolicitante(itens) {
  const contagem = new Map();

  for (const item of itens) {
    contagem.set(item.requester ?? null, (contagem.get(item.requester ?? null) ?? 0) + 1);
  }

  return [...contagem]
    .sort(([, a], [, b]) => b - a)
    .map(([nome, quantidade]) => ({ nome, quantidade }));
}

function montarFiltro(solicitantes) {
  if (solicitantes.length < 2) return ""; // com um só na lista o filtro não filtra nada

  // O valor da opção é a posição na lista, não o nome: nome vira texto de
  // atributo HTML, e um projeto sem solicitante não teria valor nenhum.
  const opcoes = solicitantes
    .map(({ nome, quantidade }, indice) =>
      `<option value="${indice}">${escapar(nome ?? "Sem solicitante")} (${quantidade})</option>`)
    .join("");

  return `<select class="filtro-de-detalhes" aria-label="Filtrar por solicitante">
            <option value="">Todos os solicitantes</option>${opcoes}
          </select>`;
}

function fechar() {
  document.getElementById("detalhes").hidden = true;
}

export function abrirDetalhes(titulo, itensRecebidos, { filtrarPorSolicitante = false } = {}) {
  const painel = document.getElementById("detalhes");
  const itens = emAndamentoPrimeiro(itensRecebidos);
  // Colunas calculadas sobre a lista inteira: se saíssem do resultado filtrado,
  // a tabela mudaria de formato a cada escolha.
  const colunas = colunasPara(itens);
  const solicitantes = filtrarPorSolicitante ? contarPorSolicitante(itens) : [];

  painel.innerHTML = `
    <div class="caixa-de-detalhes" role="dialog" aria-label="${escapar(titulo)}">
      <header>
        <h2>${escapar(titulo)} <span>${itens.length}</span></h2>
        ${montarFiltro(solicitantes)}
        <button type="button" class="fechar-detalhes" aria-label="Fechar">✕</button>
      </header>
      <div class="corpo-de-detalhes"></div>
    </div>
  `;

  const corpo = painel.querySelector(".corpo-de-detalhes");
  const contador = painel.querySelector("h2 span");
  const filtro = painel.querySelector(".filtro-de-detalhes");

  function mostrar(posicaoEscolhida) {
    const escolhido = solicitantes[Number(posicaoEscolhida)];
    const visiveis = posicaoEscolhida === ""
      ? itens
      : itens.filter((item) => (item.requester ?? null) === escolhido.nome);

    contador.textContent = visiveis.length;
    corpo.innerHTML = montarTabela(visiveis, colunas);
    corpo.scrollTop = 0;
  }

  mostrar("");
  if (filtro) filtro.onchange = () => mostrar(filtro.value);

  painel.hidden = false;

  painel.querySelector(".fechar-detalhes").onclick = fechar;
  painel.onclick = (evento) => {
    if (evento.target === painel) fechar(); // clique fora da caixa
  };
}

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") fechar();
});
