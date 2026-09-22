// O painel continua sendo uma página só: as telas são seções que se alternam,
// e o endereço muda junto (#/b2b, #/b2c) para cada uma ter sua própria URL.

export const TELAS = [
  { id: "b2b", titulo: "Projetos B2B", rotulo: "B2B" },
  { id: "b2c", titulo: "Viabilidade B2C", rotulo: "B2C" },
];

const INTERVALO_DE_RODIZIO_MS = 5 * 60 * 1000;

let telaAtual = TELAS[0].id;
let aoTrocarDeTela = () => {};
let temporizadorDoRodizio = null;

function indiceDaTela(id) {
  const indice = TELAS.findIndex((tela) => tela.id === id);
  return indice === -1 ? 0 : indice;
}

function lerTelaDoEndereco() {
  const id = window.location.hash.replace(/^#\/?/, "");
  return TELAS.some((tela) => tela.id === id) ? id : TELAS[0].id;
}

function desenharAbas() {
  document.getElementById("abas").innerHTML = TELAS.map(({ id, rotulo }) =>
    `<button type="button" class="aba${id === telaAtual ? " ativa" : ""}" data-tela="${id}">${rotulo}</button>`
  ).join("");

  document.querySelectorAll(".aba").forEach((botao) => {
    botao.onclick = () => irParaTela(botao.dataset.tela);
  });
}

function mostrarTela(id) {
  document.querySelectorAll(".tela").forEach((secao) => {
    secao.hidden = secao.dataset.tela !== id;
  });

  document.getElementById("tituloDaTela").textContent = TELAS[indiceDaTela(id)].titulo;
  desenharAbas();
}

// O rodízio reinicia a cada troca manual, para a tela escolhida não sumir
// logo em seguida.
function reiniciarRodizio() {
  clearInterval(temporizadorDoRodizio);
  temporizadorDoRodizio = setInterval(avancarTela, INTERVALO_DE_RODIZIO_MS);
}

export function irParaTela(id, { reiniciarContagem = true } = {}) {
  telaAtual = TELAS.some((tela) => tela.id === id) ? id : TELAS[0].id;

  if (window.location.hash !== `#/${telaAtual}`) {
    window.location.hash = `#/${telaAtual}`;
  }

  mostrarTela(telaAtual);
  if (reiniciarContagem) reiniciarRodizio();

  aoTrocarDeTela(telaAtual);
}

export function avancarTela(passo = 1) {
  const proximo = (indiceDaTela(telaAtual) + passo + TELAS.length) % TELAS.length;
  irParaTela(TELAS[proximo].id);
}

export function telaVisivel() {
  return telaAtual;
}

export function iniciarNavegacao(aoTrocar) {
  aoTrocarDeTela = aoTrocar;

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowRight") avancarTela(1);
    if (evento.key === "ArrowLeft") avancarTela(-1);
  });

  // Abrir ou compartilhar a URL de uma tela específica leva direto a ela.
  window.addEventListener("hashchange", () => irParaTela(lerTelaDoEndereco()));

  irParaTela(lerTelaDoEndereco());
}
