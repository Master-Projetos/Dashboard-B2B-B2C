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

function montarLinha(item, { mostrarValor, mostrarDestaque }) {
  // Verde concluído, vermelho atrasado, amarelo o que ainda está correndo.
  const classeDoPrazo = semPrazo(item)
    ? "prazo-concluido"
    : item.remaining_days < 0
      ? "prazo-atrasado"
      : "prazo-em-aberto";

  return `
    <tr>
      ${mostrarDestaque ? `<td class="coluna-destaque">${escapar(item.destaque)}</td>` : ""}
      <td>${escapar(item.client)}</td>
      <td>${escapar(item.region).replace("Regional - ", "")}</td>
      <td>${escapar(item.sector)}</td>
      ${mostrarValor ? `<td class="coluna-valor">${escapar(formatarMoeda(item.value ?? 0))}</td>` : ""}
      <td class="${classeDoPrazo}">${escapar(descreverPrazo(item.remaining_days))}</td>
    </tr>
  `;
}

function fechar() {
  document.getElementById("detalhes").hidden = true;
}

export function abrirDetalhes(titulo, itensRecebidos) {
  const painel = document.getElementById("detalhes");
  const itens = emAndamentoPrimeiro(itensRecebidos);
  // Valor e destaque só existem nos destaques financeiros; nas demais listas
  // seriam colunas inteiras de vazio.
  const colunas = {
    mostrarValor: itens.some((item) => item.value !== undefined),
    mostrarDestaque: itens.some((item) => item.destaque !== undefined),
  };

  const corpo = itens.length
    ? `<table class="tabela-de-prazos">
         <thead>
           <tr>
             ${colunas.mostrarDestaque ? "<th>Destaque</th>" : ""}
             <th>Cliente</th><th>Regional</th><th>Setor</th>
             ${colunas.mostrarValor ? "<th>Valor</th>" : ""}
             <th>Prazo</th>
           </tr>
         </thead>
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
