import "./estilo.css";

import { buscarB2b, buscarViabilidade, buscarEstoque, buscarReposicao } from "./api.js";
import { salvarDados, carregarDados } from "./armazenamento.js";
import { desenharIndicadoresB2b, desenharIndicadoresB2c, desenharPrazos } from "./indicadores.js";
import {
  desenharProjetosPorMes,
  desenharStatus,
  desenharPrioridade,
  desenharStatusPorEquipe,
  desenharPortasPorRegional,
  desenharEstoquePorRegional,
  desenharCidades,
  desenharOcupacaoPorRegional,
  mostrarAvisoNoGrafico,
  aoRedimensionar,
} from "./graficos.js";
import { formatarHorario, formatarDataCurta, formatarMes } from "./formatadores.js";
import { restaurarTemaSalvo, alternarTema } from "./tema.js";
import { iniciarNavegacao, telaVisivel } from "./navegacao.js";
import { aplicarPeriodo, mesesDisponiveis, mesInicialPadrao, ultimoDiaDoMes } from "./periodo.js";
import {
  regionaisDosDados,
  normalizarEstoque,
  normalizarReposicao,
  contarPorRegional,
  desenharIndicadoresDeEstoque,
  desenharTabelaDeEstoque,
  desenharReposicao,
} from "./estoque.js";

const INTERVALO_ATUALIZACAO_B2B_MS = 60 * 1000; // rota rápida: recarregada a cada minuto
const INTERVALO_VERIFICACAO_VIABILIDADE_MS = 30 * 60 * 1000; // rota lenta: o cache de 48h fica no servidor

const GRAFICOS_DE_B2B = ["graficoProjetosPorMes", "graficoStatus", "graficoPrioridade", "graficoStatusPorEquipe"];
const GRAFICOS_DE_B2C = ["graficoCidades", "graficoPortasPorRegional", "graficoOcupacao"];

let dadosB2b = null;
let dadosViabilidade = null;
let dadosDeEstoque = null;
let dadosDeReposicao = null;
let periodo = { inicio: "", fim: "" };

function escreverStatus(idDoElemento, texto) {
  document.getElementById(idDoElemento).textContent = texto;
}

function avisarNosGraficos(identificadores, mensagem) {
  identificadores.forEach((identificador) => mostrarAvisoNoGrafico(identificador, mensagem));
}

// ===== Desenho por tela =====
// Um canvas escondido tem tamanho zero, então cada tela só é desenhada quando
// está visível — e é redesenhada ao voltar para ela.

function desenharTelaB2b() {
  // Tudo na tela B2B lê o recorte do período; sem período escolhido, é o
  // próprio dado da API, sem cópia nem recontagem.
  const b2b = aplicarPeriodo(dadosB2b, periodo);

  desenharPrazos(b2b);
  desenharIndicadoresB2b(b2b);

  if (!b2b) {
    avisarNosGraficos(GRAFICOS_DE_B2B, "Sem dados de projetos ainda — tentando novamente");
    return;
  }

  if (!obterContagensDePrioridade(b2b)) {
    avisarNosGraficos(GRAFICOS_DE_B2B, "Nenhum projeto neste período");
    return;
  }

  desenharProjetosPorMes(b2b);
  desenharStatus(b2b);
  desenharPrioridade(b2b);
  desenharStatusPorEquipe(b2b);
}

function obterContagensDePrioridade(b2b) {
  return Object.values(b2b.priority ?? {}).some((quantidade) => quantidade > 0);
}

// ===== Controle de período =====

const campoDeInicio = document.getElementById("periodoInicio");
const campoDeFim = document.getElementById("periodoFim");
const botaoDeLimpar = document.getElementById("limparPeriodo");

// As opções são os meses que têm projeto. Só são remontadas quando a lista
// muda de verdade — refazer a cada desenho apagaria a escolha da pessoa.
let mesesNasOpcoes = "";

function preencherMeses() {
  const meses = dadosB2b ? mesesDisponiveis(dadosB2b) : [];
  if (meses.join() === mesesNasOpcoes) return;

  mesesNasOpcoes = meses.join();
  const opcoes = meses.map((mes) => `<option value="${mes}">${formatarMes(mes)}</option>`).join("");

  const escolhido = { inicio: campoDeInicio.value, fim: campoDeFim.value };

  // O início é sempre um mês de verdade — o primeiro da lista é o mais antigo
  // que existe. Só o fim fica aberto, para meses novos entrarem sozinhos.
  campoDeInicio.innerHTML = opcoes;
  campoDeFim.innerHTML = `<option value="">hoje</option>${opcoes}`;

  // O B2B recarrega a cada minuto; quando um mês novo entra na lista, a
  // escolha de quem está olhando não pode se perder. Mês que sumiu vira "".
  campoDeInicio.value = escolhido.inicio;
  campoDeFim.value = escolhido.fim;

  if (!campoDeInicio.value) voltarAoPadrao();
}

function voltarAoPadrao() {
  campoDeInicio.value = mesInicialPadrao(dadosB2b);
  campoDeFim.value = "";
  periodo = lerPeriodoDosCampos();
}

function ehPadrao() {
  return campoDeInicio.value === mesInicialPadrao(dadosB2b) && campoDeFim.value === "";
}

function atualizarControleDePeriodo() {
  const container = document.getElementById("periodo");
  container.hidden = telaVisivel() !== "b2b" || !dadosB2b;

  preencherMeses();
  botaoDeLimpar.hidden = !dadosB2b || ehPadrao();
}

// O mês escolhido vale inteiro: de 01 ao último dia.
function lerPeriodoDosCampos() {
  let [inicio, fim] = [campoDeInicio.value, campoDeFim.value];

  // Meses invertidos não devolveriam nada; trocar é o que a pessoa quis dizer.
  if (inicio && fim && inicio > fim) {
    [inicio, fim] = [fim, inicio];
    [campoDeInicio.value, campoDeFim.value] = [inicio, fim];
  }

  return { inicio: inicio ? `${inicio}-01` : "", fim: fim ? ultimoDiaDoMes(fim) : "" };
}

function aoMudarPeriodo() {
  periodo = lerPeriodoDosCampos();
  desenharTelaVisivel();
}

// "limpar" devolve ao recorte padrão dos últimos 12 meses, não a tudo.
botaoDeLimpar.addEventListener("click", () => {
  voltarAoPadrao();
  desenharTelaVisivel();
});

campoDeInicio.addEventListener("change", aoMudarPeriodo);
campoDeFim.addEventListener("change", aoMudarPeriodo);

function desenharTelaB2c() {
  desenharPrazos(null); // os prazos são do B2B; não aparecem nesta tela
  desenharIndicadoresB2c(dadosViabilidade);

  if (!dadosViabilidade) {
    avisarNosGraficos(GRAFICOS_DE_B2C, "Sem dados de viabilidade ainda — tentando novamente");
    return;
  }

  desenharCidades(dadosViabilidade, 12);
  desenharPortasPorRegional(dadosViabilidade);
  desenharOcupacaoPorRegional(dadosViabilidade);
}

// ===== Filtro de regional (tela de estoque) =====

const seletorDeRegional = document.getElementById("regionalDoEstoque");

// As cinco regionais aparecem sempre, mesmo sem dado; uma regional nova que a
// API mandar entra na lista a cada desenho.
function preencherRegionais() {
  const escolhida = seletorDeRegional.value;
  seletorDeRegional.innerHTML = `<option value="">Todas</option>${regionaisDosDados(dadosDeEstoque).map(
    ({ sigla, nome }) => `<option value="${sigla}">${sigla === nome ? sigla : `${sigla} · ${nome}`}</option>`,
  ).join("")}`;
  seletorDeRegional.value = escolhida;
  if (seletorDeRegional.value !== escolhida) seletorDeRegional.value = "";
}

preencherRegionais();

// Níveis ligados nos botões. Começam todos ligados: a tela abre mostrando
// tudo, e quem quer recortar desliga o que não interessa.
const niveisEscolhidos = new Set(["critical", "alert", "ok"]);

seletorDeRegional.addEventListener("change", () => desenharTelaVisivel());

document.getElementById("nivelDoEstoque").addEventListener("click", (evento) => {
  const botao = evento.target.closest("button[data-nivel]");
  if (!botao) return;

  const nivel = botao.dataset.nivel;
  if (niveisEscolhidos.has(nivel)) niveisEscolhidos.delete(nivel);
  else niveisEscolhidos.add(nivel);

  botao.setAttribute("aria-pressed", String(niveisEscolhidos.has(nivel)));
  desenharTelaVisivel();
});

function atualizarFiltroDeRegional() {
  document.getElementById("filtrosDoEstoque").hidden = telaVisivel() !== "estoque";
}

function desenharTelaEstoque() {
  desenharPrazos(null); // os prazos são do B2B
  preencherRegionais();
  const estoque = normalizarEstoque(dadosDeEstoque, seletorDeRegional.value);

  desenharIndicadoresDeEstoque(estoque);
  desenharReposicao(normalizarReposicao(dadosDeReposicao), estoque);
  desenharTabelaDeEstoque(estoque, niveisEscolhidos);

  if (!estoque.itens.length) {
    mostrarAvisoNoGrafico("graficoEstoquePorRegional", "Estoque ainda não publicado pela API");
    return;
  }

  desenharEstoquePorRegional(contarPorRegional(estoque));
}

function desenharTelaVisivel() {
  atualizarControleDePeriodo(); // o seletor é do B2B; some nas outras telas
  atualizarFiltroDeRegional(); // e o de regional é só do estoque

  if (telaVisivel() === "b2c") desenharTelaB2c();
  else if (telaVisivel() === "estoque") desenharTelaEstoque();
  else desenharTelaB2b();
}

// ===== Primeira pintura: o que já estava salvo aparece na hora =====

function restaurarDoArmazenamento() {
  const b2bSalvo = carregarDados("b2b");
  const viabilidadeSalva = carregarDados("viabilidade");

  const estoqueSalvo = carregarDados("estoque");
  const reposicaoSalva = carregarDados("reposicao");

  if (b2bSalvo) dadosB2b = b2bSalvo.dados;
  if (viabilidadeSalva) dadosViabilidade = viabilidadeSalva.dados;
  if (estoqueSalvo) dadosDeEstoque = estoqueSalvo.dados;
  if (reposicaoSalva) dadosDeReposicao = reposicaoSalva.dados;

  if (b2bSalvo) escreverStatus("atualizacaoB2b", `B2B de ${formatarHorario(b2bSalvo.salvoEm)} (salvo)`);
}

// ===== Atualizações =====

// O snapshot que a rota devolve quando a origem falha é o gravado no último
// deploy. Se já há dado na mão — da visita anterior ou do minuto anterior —
// ele é mais novo que o snapshot, e trocar faria o painel andar para trás.
function ehRecuo(resposta, dadoAtual) {
  return resposta?.origem === "snapshot" && Boolean(dadoAtual);
}

async function atualizarB2b() {
  try {
    const resposta = await buscarB2b();

    if (ehRecuo(resposta, dadosB2b)) {
      const salvo = carregarDados("b2b");
      escreverStatus("atualizacaoB2b", `B2B sem conexão · dados de ${salvo ? formatarHorario(salvo.salvoEm) : "—"}`);
      return;
    }

    dadosB2b = resposta;
    salvarDados("b2b", dadosB2b);

    desenharTelaVisivel();
    escreverStatus(
      "atualizacaoB2b",
      dadosB2b.origem === "snapshot"
        ? "B2B: última leitura salva"
        : `B2B atualizado às ${formatarHorario(new Date())}`,
    );
  } catch (erro) {
    // Falha de rede não pode apagar dado bom da tela.
    if (dadosB2b) {
      const salvo = carregarDados("b2b");
      escreverStatus("atualizacaoB2b", `B2B sem conexão · dados de ${salvo ? formatarHorario(salvo.salvoEm) : "—"}`);
      return;
    }

    escreverStatus("atualizacaoB2b", "B2B indisponível");
    desenharTelaVisivel();
  }
}

// A rota de estoque é rápida e não tem cache: recarregada junto com o B2B, e
// o calendário de reposição vem na mesma leva.
async function atualizarEstoque() {
  const [estoque, reposicao] = await Promise.allSettled([buscarEstoque(), buscarReposicao()]);

  if (estoque.status === "fulfilled") {
    if (!ehRecuo(estoque.value, dadosDeEstoque)) {
      dadosDeEstoque = estoque.value;
      salvarDados("estoque", dadosDeEstoque);
    }
  } else if (!dadosDeEstoque) {
    // Falha de rede não apaga o que já está na tela.
    dadosDeEstoque = carregarDados("estoque")?.dados ?? null;
  }

  if (reposicao.status === "fulfilled") {
    if (!ehRecuo(reposicao.value, dadosDeReposicao)) {
      dadosDeReposicao = reposicao.value;
      salvarDados("reposicao", dadosDeReposicao);
    }
  } else if (!dadosDeReposicao) {
    dadosDeReposicao = carregarDados("reposicao")?.dados ?? null;
  }

  if (telaVisivel() === "estoque") desenharTelaVisivel();
}

async function atualizarViabilidade() {
  try {
    const resumo = await buscarViabilidade();

    dadosViabilidade = resumo;
    salvarDados("viabilidade", resumo);

    desenharTelaVisivel();

    const renovaEm = formatarDataCurta(new Date(resumo.proximaAtualizacao));
    escreverStatus(
      "atualizacaoViabilidade",
      resumo.origem === "snapshot"
        ? `Viabilidade: última salva · renova em ${renovaEm}`
        : `Viabilidade renova em ${renovaEm}`,
    );
  } catch (erro) {
    if (dadosViabilidade) {
      const salvo = carregarDados("viabilidade");
      escreverStatus(
        "atualizacaoViabilidade",
        `Viabilidade sem conexão · dados de ${salvo ? formatarHorario(salvo.salvoEm) : "—"}`,
      );
      return;
    }

    escreverStatus("atualizacaoViabilidade", "Viabilidade indisponível");
    desenharTelaVisivel();
  }
}

// Fontes e paddings dependem da altura da janela: ao redimensionar, redesenha.
aoRedimensionar(desenharTelaVisivel);

// Tecla T troca entre tema claro (padrão) e escuro. Os gráficos são canvas,
// então precisam ser redesenhados com a nova paleta.
document.addEventListener("keydown", (evento) => {
  if (evento.key.toLowerCase() !== "t" || evento.ctrlKey || evento.altKey || evento.metaKey) return;

  alternarTema();
  desenharTelaVisivel();
});

restaurarTemaSalvo();
restaurarDoArmazenamento();

// Setas ← → trocam de tela; o rodízio automático é de 5 minutos.
iniciarNavegacao(desenharTelaVisivel);

atualizarB2b();
atualizarEstoque();
atualizarViabilidade();

setInterval(atualizarB2b, INTERVALO_ATUALIZACAO_B2B_MS);
setInterval(atualizarEstoque, INTERVALO_ATUALIZACAO_B2B_MS);
setInterval(atualizarViabilidade, INTERVALO_VERIFICACAO_VIABILIDADE_MS);
