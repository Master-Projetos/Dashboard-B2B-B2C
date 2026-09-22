import "./estilo.css";

import { buscarB2b, buscarViabilidade } from "./api.js";
import { salvarDados, carregarDados } from "./armazenamento.js";
import { desenharIndicadoresB2b, desenharIndicadoresB2c, desenharPrazos } from "./indicadores.js";
import {
  desenharProjetosPorMes,
  desenharStatus,
  desenharPrioridade,
  desenharStatusPorEquipe,
  desenharPortasPorRegional,
  desenharCidades,
  desenharOcupacaoPorRegional,
  mostrarAvisoNoGrafico,
  aoRedimensionar,
} from "./graficos.js";
import { formatarHorario, formatarDataCurta } from "./formatadores.js";
import { restaurarTemaSalvo, alternarTema } from "./tema.js";
import { iniciarNavegacao, telaVisivel } from "./navegacao.js";
import { aplicarPeriodo, ehPeriodoVazio, faixaDeDatas } from "./periodo.js";

const INTERVALO_ATUALIZACAO_B2B_MS = 60 * 1000; // rota rápida: recarregada a cada minuto
const INTERVALO_VERIFICACAO_VIABILIDADE_MS = 30 * 60 * 1000; // rota lenta: o cache de 48h fica no servidor

const GRAFICOS_DE_B2B = ["graficoProjetosPorMes", "graficoStatus", "graficoPrioridade", "graficoStatusPorEquipe"];
const GRAFICOS_DE_B2C = ["graficoCidades", "graficoPortasPorRegional", "graficoOcupacao"];

let dadosB2b = null;
let dadosViabilidade = null;
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

function atualizarControleDePeriodo() {
  const container = document.getElementById("periodo");
  container.hidden = telaVisivel() !== "b2b" || !dadosB2b;
  botaoDeLimpar.hidden = ehPeriodoVazio(periodo);

  // Fora da faixa não existe projeto nenhum para achar.
  const faixa = dadosB2b && faixaDeDatas(dadosB2b);
  for (const campo of [campoDeInicio, campoDeFim]) {
    campo.min = faixa?.primeiro ?? "";
    campo.max = faixa?.ultimo ?? "";
  }
}

function lerPeriodoDosCampos() {
  // Datas invertidas não devolveriam nada; trocar é o que a pessoa quis dizer.
  const [inicio, fim] = [campoDeInicio.value, campoDeFim.value];
  return inicio && fim && inicio > fim ? { inicio: fim, fim: inicio } : { inicio, fim };
}

function aoMudarPeriodo() {
  periodo = lerPeriodoDosCampos();
  campoDeInicio.value = periodo.inicio;
  campoDeFim.value = periodo.fim;
  desenharTelaVisivel();
}

campoDeInicio.addEventListener("change", aoMudarPeriodo);
campoDeFim.addEventListener("change", aoMudarPeriodo);

botaoDeLimpar.addEventListener("click", () => {
  campoDeInicio.value = "";
  campoDeFim.value = "";
  aoMudarPeriodo();
});

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

function desenharTelaVisivel() {
  atualizarControleDePeriodo(); // o seletor é do B2B; some na outra tela
  if (telaVisivel() === "b2c") desenharTelaB2c();
  else desenharTelaB2b();
}

// ===== Primeira pintura: o que já estava salvo aparece na hora =====

function restaurarDoArmazenamento() {
  const b2bSalvo = carregarDados("b2b");
  const viabilidadeSalva = carregarDados("viabilidade");

  if (b2bSalvo) dadosB2b = b2bSalvo.dados;
  if (viabilidadeSalva) dadosViabilidade = viabilidadeSalva.dados;

  if (b2bSalvo) escreverStatus("atualizacaoB2b", `B2B de ${formatarHorario(b2bSalvo.salvoEm)} (salvo)`);
}

// ===== Atualizações =====

async function atualizarB2b() {
  try {
    dadosB2b = await buscarB2b();
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
atualizarViabilidade();

setInterval(atualizarB2b, INTERVALO_ATUALIZACAO_B2B_MS);
setInterval(atualizarViabilidade, INTERVALO_VERIFICACAO_VIABILIDADE_MS);
