import "./estilo.css";

import { buscarB2b, buscarViabilidade } from "./api.js";
import { salvarDados, carregarDados } from "./armazenamento.js";
import { desenharIndicadores, desenharPrazos } from "./indicadores.js";
import {
  desenharProjetosPorMes,
  desenharStatus,
  desenharPrioridade,
  desenharPortasPorRegional,
  desenharCidades,
  desenharStatusPorEquipe,
  mostrarAvisoNoGrafico,
  aoRedimensionar,
} from "./graficos.js";
import { formatarHorario, formatarDataCurta } from "./formatadores.js";
import { restaurarTemaSalvo, alternarTema } from "./tema.js";

const INTERVALO_ATUALIZACAO_B2B_MS = 60 * 1000; // rota rápida: recarregada a cada minuto
const INTERVALO_VERIFICACAO_VIABILIDADE_MS = 30 * 60 * 1000; // rota lenta: o cache de 48h fica no servidor

const GRAFICOS_DE_B2B = ["graficoProjetosPorMes", "graficoStatus", "graficoPrioridade", "graficoStatusPorEquipe"];
const GRAFICOS_DE_VIABILIDADE = ["graficoPortasPorRegional", "graficoCidades"];

let dadosB2b = null;
let dadosViabilidade = null;

function escreverStatus(idDoElemento, texto) {
  document.getElementById(idDoElemento).textContent = texto;
}

function desenharTudoDoB2b() {
  desenharPrazos(dadosB2b);
  desenharProjetosPorMes(dadosB2b);
  desenharStatus(dadosB2b);
  desenharPrioridade(dadosB2b);
  desenharStatusPorEquipe(dadosB2b);
}

function desenharTudoDaViabilidade() {
  desenharPortasPorRegional(dadosViabilidade);
  desenharCidades(dadosViabilidade);
}

function avisarNosGraficos(identificadores, mensagem) {
  identificadores.forEach((identificador) => mostrarAvisoNoGrafico(identificador, mensagem));
}

// ===== Primeira pintura: o que já estava salvo aparece na hora =====
// Assim o painel nunca abre vazio, mesmo sem rede.

function restaurarDoArmazenamento() {
  const b2bSalvo = carregarDados("b2b");
  const viabilidadeSalva = carregarDados("viabilidade");

  if (b2bSalvo) {
    dadosB2b = b2bSalvo.dados;
    desenharTudoDoB2b();
    escreverStatus("atualizacaoB2b", `B2B de ${formatarHorario(b2bSalvo.salvoEm)} (salvo)`);
  }

  if (viabilidadeSalva) {
    dadosViabilidade = viabilidadeSalva.dados;
    desenharTudoDaViabilidade();
  }

  if (b2bSalvo || viabilidadeSalva) {
    desenharIndicadores(dadosB2b, dadosViabilidade);
  }
}

// ===== Atualizações =====

async function atualizarB2b() {
  try {
    dadosB2b = await buscarB2b();
    salvarDados("b2b", dadosB2b);

    desenharTudoDoB2b();
    desenharIndicadores(dadosB2b, dadosViabilidade);
    escreverStatus(
      "atualizacaoB2b",
      dadosB2b.origem === "snapshot"
        ? "B2B: última leitura salva"
        : `B2B atualizado às ${formatarHorario(new Date())}`,
    );
  } catch (erro) {
    // Falha de rede não pode apagar dado bom da tela: mantemos o que já existe
    // e apenas sinalizamos que ele está parado.
    if (dadosB2b) {
      const salvo = carregarDados("b2b");
      const horario = salvo ? formatarHorario(salvo.salvoEm) : "—";
      escreverStatus("atualizacaoB2b", `B2B sem conexão · dados de ${horario}`);
      return;
    }

    escreverStatus("atualizacaoB2b", "B2B indisponível");
    desenharIndicadores(null, dadosViabilidade);
    avisarNosGraficos(GRAFICOS_DE_B2B, "Sem dados de projetos ainda — tentando novamente");
  }
}

async function atualizarViabilidade() {
  try {
    const resumo = await buscarViabilidade();

    dadosViabilidade = resumo;
    salvarDados("viabilidade", resumo);

    desenharTudoDaViabilidade();
    desenharIndicadores(dadosB2b, dadosViabilidade);

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
      const horario = salvo ? formatarHorario(salvo.salvoEm) : "—";
      escreverStatus("atualizacaoViabilidade", `Viabilidade sem conexão · dados de ${horario}`);
      return;
    }

    escreverStatus("atualizacaoViabilidade", "Viabilidade indisponível");
    desenharIndicadores(dadosB2b, null);
    avisarNosGraficos(GRAFICOS_DE_VIABILIDADE, "Sem dados de viabilidade ainda — tentando novamente");
  }
}

function redesenharTudo() {
  if (dadosB2b) desenharTudoDoB2b();
  if (dadosViabilidade) desenharTudoDaViabilidade();
}

// Os tamanhos de fonte dos gráficos dependem da altura da janela.
aoRedimensionar(redesenharTudo);

// Tecla T troca entre tema claro (padrão) e escuro. Os gráficos são desenhados
// em canvas, então precisam ser redesenhados com a nova paleta.
document.addEventListener("keydown", (evento) => {
  if (evento.key.toLowerCase() !== "t" || evento.ctrlKey || evento.altKey || evento.metaKey) return;

  alternarTema();
  redesenharTudo();
});

restaurarTemaSalvo();
restaurarDoArmazenamento();

atualizarB2b();
atualizarViabilidade();

setInterval(atualizarB2b, INTERVALO_ATUALIZACAO_B2B_MS);
setInterval(atualizarViabilidade, INTERVALO_VERIFICACAO_VIABILIDADE_MS);
