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

// O rodízio só liga depois de 10 minutos sem ninguém mexer: com gente usando o
// painel, trocar de tela sozinho no meio de uma leitura atrapalha. Qualquer
// toque, clique, tecla, rolagem ou movimento de mouse zera a contagem.
const TEMPO_OCIOSO_MS = 10 * 60 * 1000;
const VERIFICACAO_MS = 5 * 1000;
const EVENTOS_DE_ATIVIDADE = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

let telaAtual = TELAS[0].id;
let aoTrocarDeTela = () => {};
let ultimaAtividade = Date.now();
let ultimaTroca = Date.now();

function indiceDaTela(id) {
  const indice = TELAS.findIndex((tela) => tela.id === id);
  return indice === -1 ? 0 : indice;
}

function lerTelaDoEndereco() {
  const id = window.location.hash.replace(/^#\/?/, "");
  return TELAS.some((tela) => tela.id === id) ? id : TELAS[0].id;
}

// Ícones de traço fino da barra lateral, um por tela.
const ICONES_DAS_TELAS = {
  b2b: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  estoque: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  b2c: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/><path d="M1.5 9a15 15 0 0 1 21 0"/>',
};

function desenharAbas() {
  document.getElementById("abas").innerHTML = TELAS.map(({ id, titulo }) => `
    <button type="button" class="aba${id === telaAtual ? " ativa" : ""}" data-tela="${id}" data-rotulo="${titulo}" aria-label="${titulo}"${id === telaAtual ? ' aria-current="page"' : ""}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES_DAS_TELAS[id] ?? ""}</svg>
      <span>${titulo}</span>
    </button>`
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

function registrarAtividade() {
  ultimaAtividade = Date.now();
}

// O rodízio anda só entre as telas que participam dele. Estando numa tela de
// fora, o próximo giro leva para a primeira do revezamento.
function rodar() {
  const atual = TELAS_DO_RODIZIO.findIndex((tela) => tela.id === telaAtual);
  const proxima = TELAS_DO_RODIZIO[(atual + 1) % TELAS_DO_RODIZIO.length];
  // Se alguém rolou até o rodapé e saiu, o rodízio volta a mostrar o painel.
  window.scrollTo({ top: 0 });
  irParaTela(proxima.id);
}

// Conferido a cada poucos segundos em vez de um temporizador de 2 minutos: a
// condição depende de dois relógios (atividade e última troca), e um só
// intervalo fixo erraria o momento em que o painel fica ocioso.
function verificarRodizio() {
  const agora = Date.now();
  if (agora - ultimaAtividade < TEMPO_OCIOSO_MS) return;
  if (agora - ultimaTroca < INTERVALO_DE_RODIZIO_MS) return;
  rodar();
}

export function irParaTela(id) {
  telaAtual = TELAS.some((tela) => tela.id === id) ? id : TELAS[0].id;
  ultimaTroca = Date.now();

  if (window.location.hash !== `#/${telaAtual}`) {
    window.location.hash = `#/${telaAtual}`;
  }

  mostrarTela(telaAtual);
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

// Barra lateral recolhida: só os ícones, num canto. A escolha fica salva
// neste navegador; os gráficos se ajustam sozinhos à largura nova.
const CHAVE_DA_LATERAL = "master-painel:lateral-recolhida";

function recolherLateral(recolher) {
  document.getElementById("painel").classList.toggle("lateral-recolhida", recolher);
  const botao = document.getElementById("recolherLateral");
  botao.setAttribute("aria-expanded", String(!recolher));
  botao.title = recolher ? "Abrir menu" : "Recolher menu";
  botao.setAttribute("aria-label", botao.title);
  try {
    localStorage.setItem(CHAVE_DA_LATERAL, recolher ? "1" : "0");
  } catch (erro) {
    // Navegação privada: vale só enquanto a página estiver aberta.
  }
}

function prepararLateral() {
  let recolhida = false;
  try {
    recolhida = localStorage.getItem(CHAVE_DA_LATERAL) === "1";
  } catch (erro) {
    recolhida = false;
  }
  recolherLateral(recolhida);
  document.getElementById("recolherLateral").onclick = () =>
    recolherLateral(!document.getElementById("painel").classList.contains("lateral-recolhida"));
}

export function iniciarNavegacao(aoTrocar) {
  aoTrocarDeTela = aoTrocar;
  prepararLateral();

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowRight") avancarTela(1);
    if (evento.key === "ArrowLeft") avancarTela(-1);
  });

  // Abrir ou compartilhar a URL de uma tela específica leva direto a ela.
  window.addEventListener("hashchange", () => irParaTela(lerTelaDoEndereco()));

  for (const evento of EVENTOS_DE_ATIVIDADE) {
    document.addEventListener(evento, registrarAtividade, { passive: true });
  }
  setInterval(verificarRodizio, VERIFICACAO_MS);

  irParaTela(lerTelaDoEndereco());
}
