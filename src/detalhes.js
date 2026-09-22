import { descreverPrazo } from "./dados-b2b.js";
import { formatarMoeda } from "./formatadores.js";

// Painel sobreposto com os projetos por trás de um número do painel — uma barra
// do gráfico, um chip de prazo, um cartão. Fica por cima da grade para não
// mexer no layout, que precisa caber sem rolagem.

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

const semPrazo = (item) => item.remaining_days === null || item.remaining_days === undefined;

// Verde concluído, vermelho atrasado, amarelo o que ainda está correndo.
function classeDoPrazo(item) {
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
  {
    titulo: "Valor",
    classe: () => "coluna-valor",
    ler: (item) => (item.value === undefined ? undefined : formatarMoeda(item.value)),
  },
  { titulo: "Prazo", classe: classeDoPrazo, ler: (item) => descreverPrazo(item.remaining_days), sempre: true },
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

function fechar() {
  document.getElementById("detalhes").hidden = true;
}

export function abrirDetalhes(titulo, itensRecebidos) {
  const painel = document.getElementById("detalhes");
  const itens = emAndamentoPrimeiro(itensRecebidos);
  const colunas = colunasPara(itens);

  const corpo = itens.length
    ? `<table class="tabela-de-prazos">
         <thead><tr>${colunas.map((coluna) => `<th>${coluna.titulo}</th>`).join("")}</tr></thead>
         <tbody>${itens.map((item) => montarLinha(item, colunas)).join("")}</tbody>
       </table>`
    : `<p class="aviso">Nenhum projeto nesta situação.</p>`;

  painel.innerHTML = `
    <div class="caixa-de-detalhes" role="dialog" aria-label="${escapar(titulo)}">
      <header>
        <h2>${escapar(titulo)} <span>${itens.length}</span></h2>
        <button type="button" class="fechar-detalhes" aria-label="Fechar">✕</button>
      </header>
      <div class="corpo-de-detalhes">${corpo}</div>
    </div>
  `;

  painel.hidden = false;

  painel.querySelector(".fechar-detalhes").onclick = fechar;
  painel.onclick = (evento) => {
    if (evento.target === painel) fechar(); // clique fora da caixa
  };
}

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") fechar();
});
