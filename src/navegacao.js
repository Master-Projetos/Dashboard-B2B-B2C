// O painel continua sendo uma página só: as telas são seções que se alternam,
// e o endereço muda junto (#/b2b, #/b2c) para cada uma ter sua própria URL.

// `entraNoRodizio: false` tira a tela do revezamento automático — ela continua
// acessível pelas setas, pela aba e pela própria URL, mas o painel deixado
// sozinho numa TV nunca para nela.
export const TELAS = [
  { id: "b2b", titulo: "Projetos B2B", rotulo: "B2B", entraNoRodizio: true },
  { id: "estoque", titulo: "Estoque", rotulo: "Estoque", entraNoRodizio: true },
  { id: "b2c", titulo: "Viabilidade B2C", rotulo: "B2C", entraNoRodizio: true },
];

const TELAS_DO_RODIZIO = TELAS.filter((tela) => tela.entraNoRodizio);

const INTERVALO_DE_RODIZIO_MS = 2 * 60 * 1000;

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

  // Os três títulos ficam empilhados no mesmo lugar e só o da tela atual
  // aparece. Assim o título tem sempre a largura do maior deles, e as abas ao
  // lado não pulam quando "Estoque" vira "Viabilidade B2C".
  document.getElementById("tituloDaTela").innerHTML = TELAS.map(({ id: idDaTela, titulo }) =>
    idDaTela === id ? `<span>${titulo}</span>` : `<span class="titulo-reservado" aria-hidden="true">${titulo}</span>`
  ).join("");
  desenharAbas();
}

// O rodízio reinicia a cada troca manual, para a tela escolhida não sumir
// logo em seguida.
function reiniciarRodizio() {
  clearInterval(temporizadorDoRodizio);
  temporizadorDoRodizio = setInterval(rodar, INTERVALO_DE_RODIZIO_MS);
}

// O rodízio anda só entre as telas que participam dele. Estando numa tela de
// fora, o próximo giro leva para a primeira do revezamento.
function rodar() {
  const atual = TELAS_DO_RODIZIO.findIndex((tela) => tela.id === telaAtual);
  const proxima = TELAS_DO_RODIZIO[(atual + 1) % TELAS_DO_RODIZIO.length];
  irParaTela(proxima.id, { reiniciarContagem: false });
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

// As setas andam por todas as telas, inclusive as que ficam fora do rodízio.
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
