// Duas paletas escolhidas uma a uma (não é inversão automática do tema claro):
// cada conjunto foi validado para daltonismo e contraste contra a sua própria
// superfície — branco no tema claro, #151a24 no escuro.

const PALETAS = {
  claro: {
    serie1: "#2a78d6",
    serie2: "#eb6834",
    serie3: "#17a06f", // um passo mais escuro que o padrão, para cruzar 3:1 no branco
    lilas: "#9b7fd6", // prioridade média; 3,3:1 sobre branco
    gradienteArea: ["rgba(42, 120, 214, 0.28)", "rgba(42, 120, 214, 0.02)"],

    superficie: "#ffffff",
    grade: "rgba(11, 11, 11, 0.07)",
    eixo: "rgba(11, 11, 11, 0.16)",
    textoPrimario: "#0b0b0b",
    textoSecundario: "#52514e",
    textoSuave: "#7b7a75",
    fundoDica: "#ffffff",
    bordaDica: "rgba(11, 11, 11, 0.14)",
  },

  escuro: {
    serie1: "#3987e5",
    serie2: "#d95926",
    serie3: "#199e70",
    lilas: "#a88be0",
    gradienteArea: ["rgba(57, 135, 229, 0.38)", "rgba(57, 135, 229, 0.02)"],

    superficie: "#151a24",
    grade: "rgba(255, 255, 255, 0.06)",
    eixo: "rgba(255, 255, 255, 0.12)",
    textoPrimario: "#ffffff",
    textoSecundario: "#c3c2b7",
    textoSuave: "#8b93a3",
    fundoDica: "#0d1017",
    bordaDica: "rgba(255, 255, 255, 0.12)",
  },
};

// Cores de estado nunca mudam com o tema: elas significam bom/atenção/crítico.
// Sempre acompanhadas de rótulo, para não depender só da cor.
const CORES_DE_ESTADO = {
  statusBom: "#0ca30c",
  statusAtencao: "#fab219",
  statusCritico: "#d03b3b",
};

const CHAVE_DO_TEMA = "master-painel:tema";
const TEMA_PADRAO = "claro";

// Objeto mutável: os gráficos leem daqui na hora de desenhar, então trocar o
// tema é atualizar estes valores e mandar redesenhar.
export const CORES = { ...PALETAS[TEMA_PADRAO], ...CORES_DE_ESTADO };

// Cor de cada barra do gráfico "Projetos por status". Status que não estiver
// aqui sai em azul (serie1). Vale nome da paleta ou hex.
export const CORES_DOS_STATUS = {
  "Aguardando BP": "#2a78d6",
  "Ativado": "#2a78d6",
  "Pendencia Comercial": "#2a78d6",
  "Inviabilidade Técnica": "#2a78d6",
  "Configuração": "#2a78d6",
  "Estudo": "#2a78d6",
  "Estudo Técnico": "#2a78d6",
  "Vistoria": "#2a78d6",
  "Execução": "#2a78d6",
  "Estoque B2B": "#2a78d6",
  "BP - Não Aprovado": "#2a78d6",
  "Cancelada": "#d03b3b",
};

// As listas de cor por categoria (status, prioridade, prazo) aceitam o nome de
// uma cor da paleta ("lilas", que acompanha o tema) ou um hex direto
// ("#9b7fd6", igual nos dois temas).
export function corDe(nomeOuHex) {
  return CORES[nomeOuHex] ?? nomeOuHex;
}

let temaAtual = TEMA_PADRAO;

export function nomeDoTemaAtual() {
  return temaAtual;
}

export function aplicarTema(nome) {
  temaAtual = PALETAS[nome] ? nome : TEMA_PADRAO;

  Object.assign(CORES, PALETAS[temaAtual]);
  document.documentElement.dataset.tema = temaAtual;

  try {
    localStorage.setItem(CHAVE_DO_TEMA, temaAtual);
  } catch (erro) {
    // Navegação privada: o tema simplesmente não persiste entre sessões.
  }
}

export function alternarTema() {
  aplicarTema(temaAtual === "claro" ? "escuro" : "claro");
  return temaAtual;
}

export function restaurarTemaSalvo() {
  let salvo = null;

  try {
    salvo = localStorage.getItem(CHAVE_DO_TEMA);
  } catch (erro) {
    salvo = null;
  }

  aplicarTema(salvo ?? TEMA_PADRAO);
}

export const FONTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// O painel roda em telas de 768px a 1080p: as fontes do gráfico acompanham a altura.
export function tamanhoDeFonteDoGrafico() {
  return Math.round(Math.min(13, Math.max(9, window.innerHeight * 0.0105)));
}

export function estiloDeTextoSuave() {
  return { color: CORES.textoSuave, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico() };
}

export function eixoDeCategoria(opcoesExtras = {}) {
  return {
    type: "category",
    axisLine: { lineStyle: { color: CORES.eixo } },
    axisTick: { show: false },
    axisLabel: estiloDeTextoSuave(),
    splitLine: { show: false },
    ...opcoesExtras,
  };
}

export function eixoDeValor(opcoesExtras = {}) {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: estiloDeTextoSuave(),
    splitLine: { lineStyle: { color: CORES.grade, type: "solid" } },
    ...opcoesExtras,
  };
}

export function dicaDeContexto(opcoesExtras = {}) {
  return {
    backgroundColor: CORES.fundoDica,
    borderColor: CORES.bordaDica,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: CORES.textoPrimario, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico() + 1 },
    ...opcoesExtras,
  };
}
