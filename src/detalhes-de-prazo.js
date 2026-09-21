import { obterItensDePrazo, descreverPrazo } from "./prazos.js";

// Painel sobreposto com os projetos de um prazo (urgentes, atrasados...).
// Fica por cima do painel para não mexer na grade, que precisa caber sem rolagem.

const TITULOS = {
  Concluido: "Projetos concluídos",
  Urgente: "Projetos urgentes",
  Atrasada: "Projetos atrasados",
};

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

function montarLinha(item) {
  const atrasado = item.remaining_days < 0;
  const venceHoje = item.remaining_days === 0;
  const classeDoPrazo = atrasado ? "prazo-atrasado" : venceHoje ? "prazo-hoje" : "";

  return `
    <tr>
      <td>${escapar(item.client)}</td>
      <td>${escapar(item.region).replace("Regional - ", "")}</td>
      <td>${escapar(item.sector)}</td>
      <td class="${classeDoPrazo}">${escapar(descreverPrazo(item.remaining_days))}</td>
    </tr>
  `;
}

function fechar() {
  document.getElementById("detalhesDePrazo").hidden = true;
}

export function abrirDetalhesDePrazo(b2b, tipo) {
  const itens = obterItensDePrazo(b2b, tipo);
  const painel = document.getElementById("detalhesDePrazo");

  const corpo = itens.length
    ? `<table class="tabela-de-prazos">
         <thead><tr><th>Cliente</th><th>Regional</th><th>Setor</th><th>Prazo</th></tr></thead>
         <tbody>${itens.map(montarLinha).join("")}</tbody>
       </table>`
    : `<p class="aviso">Nenhum projeto nesta situação.</p>`;

  painel.innerHTML = `
    <div class="caixa-de-detalhes" role="dialog" aria-label="${escapar(TITULOS[tipo] ?? tipo)}">
      <header>
        <h2>${escapar(TITULOS[tipo] ?? tipo)} <span>${itens.length}</span></h2>
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
