import "./estilo.css";

import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import {
  CORES, FONTE, restaurarTemaSalvo, alternarTema,
  eixoDeCategoria, eixoDeValor, dicaDeContexto, tamanhoDeFonteDoGrafico,
} from "./tema.js";
import { formatarMoeda, formatarMoedaCompacta, formatarNumero, formatarMes } from "./formatadores.js";
import { salvarDados, carregarDados } from "./armazenamento.js";
import { confirmar } from "./confirmacao.js";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

// Página à parte do painel, aberta só por quem tem o endereço (/dividas).
//
// A senha é conferida no navegador: o que fica no código é o hash de
// "usuário:senha", não o texto. Serve para quem abrir o link sem querer não
// ver nada — não é cofre: quem souber mexer no navegador contorna.
//
// As dívidas ficam guardadas neste navegador (localStorage). Outro
// computador, outro navegador ou uma limpeza de dados começa do zero.

const HASH_DE_ACESSO = "e758422d0b58a80a460bf25dc0ccd105003112bc5e2fa033171db2d14ffd567d";
const CHAVE_DA_SESSAO = "master-dividas:sessao";
const CHAVE_DAS_DIVIDAS = "dividas";

let dividas = carregarDados(CHAVE_DAS_DIVIDAS)?.dados ?? [];

// ===== Entrada =====

async function calcularHash(texto) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jaEntrou() {
  try {
    return sessionStorage.getItem(CHAVE_DA_SESSAO) === HASH_DE_ACESSO;
  } catch (erro) {
    return false;
  }
}

function mostrarPagina() {
  document.getElementById("entrada").hidden = true;
  document.getElementById("paginaDeDividas").hidden = false;
  desenharTudo();
}

document.getElementById("formularioDeEntrada").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const usuario = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value;

  if ((await calcularHash(`${usuario}:${senha}`)) !== HASH_DE_ACESSO) {
    document.getElementById("erroDeEntrada").hidden = false;
    document.getElementById("senha").value = "";
    return;
  }

  try {
    sessionStorage.setItem(CHAVE_DA_SESSAO, HASH_DE_ACESSO);
  } catch (erro) {
    // Navegação privada: entra do mesmo jeito, só pede a senha de novo ao recarregar.
  }
  mostrarPagina();
});

document.getElementById("sair").addEventListener("click", () => {
  try {
    sessionStorage.removeItem(CHAVE_DA_SESSAO);
  } catch (erro) {
    // nada a limpar
  }
  window.location.reload();
});

// ===== Dados =====

function salvar() {
  salvarDados(CHAVE_DAS_DIVIDAS, dividas);
}

const emAberto = (lista) => lista.filter((divida) => !divida.paga);
const pagas = (lista) => lista.filter((divida) => divida.paga);
const somar = (lista) => lista.reduce((soma, divida) => soma + divida.valor, 0);

function porMembro() {
  const membros = new Map();
  for (const divida of dividas) {
    const membro = membros.get(divida.membro) ?? { nome: divida.membro, aberto: 0, pago: 0 };
    membro[divida.paga ? "pago" : "aberto"] += divida.valor;
    membros.set(divida.membro, membro);
  }
  return [...membros.values()];
}

function porMes() {
  const meses = new Map();
  for (const divida of dividas) {
    const chave = divida.data.slice(0, 7);
    const mes = meses.get(chave) ?? { chave, aberto: 0, pago: 0 };
    mes[divida.paga ? "pago" : "aberto"] += divida.valor;
    meses.set(chave, mes);
  }
  return [...meses.values()].sort((um, outro) => um.chave.localeCompare(outro.chave));
}

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

const formatarData = (texto) => `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(2, 4)}`;

// ===== Cadastro =====

const campoDeData = document.getElementById("data");
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
campoDeData.value = hoje();

document.getElementById("formularioDeDivida").addEventListener("submit", (evento) => {
  evento.preventDefault();

  dividas.push({
    id: crypto.randomUUID(),
    membro: document.getElementById("membro").value.trim(),
    descricao: document.getElementById("descricao").value.trim(),
    valor: Math.round(Number(document.getElementById("valor").value) * 100) / 100,
    data: campoDeData.value,
    paga: false,
  });
  salvar();

  evento.target.reset();
  campoDeData.value = hoje();
  document.getElementById("membro").focus();
  desenharTudo();
});

// ===== Indicadores =====

function desenharIndicadores() {
  const abertas = emAberto(dividas);
  const devedores = porMembro().filter((membro) => membro.aberto > 0).sort((a, b) => b.aberto - a.aberto);
  const maior = devedores[0];

  const cartoes = [
    {
      rotulo: "Em aberto",
      valor: formatarMoeda(somar(abertas)),
      detalhe: `${formatarNumero(abertas.length)} ${abertas.length === 1 ? "dívida" : "dívidas"}`,
      realce: CORES.statusAtencao,
    },
    {
      rotulo: "Já pago",
      valor: formatarMoeda(somar(pagas(dividas))),
      detalhe: `${formatarNumero(pagas(dividas).length)} quitadas`,
      realce: CORES.serie3,
    },
    {
      rotulo: "Membros devendo",
      valor: formatarNumero(devedores.length),
      detalhe: `de ${formatarNumero(porMembro().length)} cadastrados`,
      realce: CORES.serie1,
    },
    {
      rotulo: "Maior dívida em aberto",
      valor: maior ? escapar(maior.nome) : "—",
      detalhe: maior ? formatarMoeda(maior.aberto) : "ninguém devendo",
      realce: CORES.statusCritico,
    },
  ];

  document.getElementById("indicadoresDeDividas").innerHTML = cartoes
    .map(({ rotulo, valor, detalhe, realce }) => `
      <div class="indicador" style="--realce: ${realce}">
        <div class="rotulo">${rotulo}</div>
        <div class="valor">${valor}</div>
        <div class="detalhe">${detalhe}</div>
      </div>`)
    .join("");
}

// ===== Gráficos =====

const instancias = new Map();

function desenhar(id, opcoes) {
  let instancia = instancias.get(id);
  if (!instancia) {
    const elemento = document.getElementById(id);
    instancia = echarts.init(elemento, null, { renderer: "canvas" });
    instancias.set(id, instancia);
    new ResizeObserver(() => instancia.resize()).observe(elemento);
  }
  instancia.setOption(opcoes, { notMerge: true });
  return instancia;
}

function mostrarVazio(id, mensagem) {
  instancias.get(id)?.dispose();
  instancias.delete(id);
  document.getElementById(id).innerHTML = `<div class="aviso">${mensagem}</div>`;
}

const legenda = () => ({
  bottom: 0,
  icon: "circle",
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 14,
  textStyle: { color: CORES.textoSecundario, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico() },
});

const rotulo = (extras) => ({
  show: true,
  fontFamily: FONTE,
  fontSize: tamanhoDeFonteDoGrafico(),
  fontWeight: 600,
  color: CORES.textoPrimario,
  ...extras,
});

const FAIXAS = [
  { chave: "aberto", nome: "Em aberto", cor: () => CORES.statusAtencao },
  { chave: "pago", nome: "Pago", cor: () => CORES.serie3 },
];

function dicaEmReais() {
  return dicaDeContexto({
    trigger: "axis",
    axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
    formatter: (pontos) => `${pontos[0].axisValue}<br/>${pontos
      .map((ponto) => `${ponto.marker} ${ponto.seriesName}: <b>${formatarMoeda(ponto.value)}</b>`)
      .join("<br/>")}`,
  });
}

function desenharPorMembro() {
  if (!dividas.length) return mostrarVazio("graficoPorMembro", "Nenhuma dívida cadastrada");

  // Quem deve mais em cima; o eixo cresce de baixo para cima.
  const membros = porMembro().sort((a, b) => a.aberto - b.aberto || a.pago - b.pago);

  const instancia = desenhar("graficoPorMembro", {
    grid: { top: 6, right: 70, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaEmReais(),
    legend: legenda(),
    xAxis: eixoDeValor({ axisLabel: { color: CORES.textoSuave, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico(), formatter: formatarMoedaCompacta } }),
    yAxis: eixoDeCategoria({ data: membros.map((membro) => membro.nome), axisLine: { show: false } }),
    series: FAIXAS.map(({ chave, nome, cor }, indice) => ({
      name: nome,
      type: "bar",
      stack: "membros",
      cursor: "pointer",
      data: membros.map((membro) => membro[chave]),
      barMaxWidth: 20,
      itemStyle: { color: cor(), borderColor: CORES.superficie, borderWidth: 1 },
      // O número ao lado da barra é o que ainda falta pagar.
      label: indice === FAIXAS.length - 1
        ? rotulo({
            position: "right",
            distance: 6,
            formatter: ({ dataIndex }) => (membros[dataIndex].aberto ? formatarMoedaCompacta(membros[dataIndex].aberto) : "quitado"),
          })
        : { show: false },
    })),
  });

  // Clicar no membro filtra a lista embaixo por ele.
  instancia.off("click");
  instancia.on("click", ({ dataIndex }) => {
    document.getElementById("filtroDeMembro").value = membros[dataIndex].nome;
    desenharLista();
    document.getElementById("listaDeDividas").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function desenharPorMes() {
  if (!dividas.length) return mostrarVazio("graficoPorMes", "Nenhuma dívida cadastrada");

  const meses = porMes();

  desenhar("graficoPorMes", {
    grid: { top: 24, right: 10, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaEmReais(),
    legend: legenda(),
    xAxis: eixoDeCategoria({ data: meses.map((mes) => formatarMes(mes.chave)) }),
    yAxis: eixoDeValor({ axisLabel: { color: CORES.textoSuave, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico(), formatter: formatarMoedaCompacta } }),
    series: FAIXAS.map(({ chave, nome, cor }, indice) => ({
      name: nome,
      type: "bar",
      stack: "meses",
      data: meses.map((mes) => mes[chave]),
      barMaxWidth: 38,
      itemStyle: { color: cor(), borderColor: CORES.superficie, borderWidth: 1 },
      label: indice === FAIXAS.length - 1
        ? rotulo({
            position: "top",
            distance: 4,
            formatter: ({ dataIndex }) => formatarMoedaCompacta(meses[dataIndex].aberto + meses[dataIndex].pago),
          })
        : { show: false },
    })),
  });
}

// ===== Lista =====

const filtroDeMembro = document.getElementById("filtroDeMembro");
const filtroDeSituacao = document.getElementById("filtroDeSituacao");
filtroDeMembro.addEventListener("change", desenharLista);
filtroDeSituacao.addEventListener("change", desenharLista);

function preencherMembros() {
  const nomes = [...new Set(dividas.map((divida) => divida.membro))].sort((a, b) => a.localeCompare(b));
  const escolhido = filtroDeMembro.value;

  filtroDeMembro.innerHTML = `<option value="">Todos os membros</option>${nomes
    .map((nome) => `<option value="${escapar(nome)}">${escapar(nome)}</option>`)
    .join("")}`;
  filtroDeMembro.value = nomes.includes(escolhido) ? escolhido : "";

  document.getElementById("membrosConhecidos").innerHTML = nomes
    .map((nome) => `<option value="${escapar(nome)}"></option>`)
    .join("");
}

function desenharLista() {
  const alvo = document.getElementById("listaDeDividas");
  const membro = filtroDeMembro.value;
  const situacao = filtroDeSituacao.value;

  // Abertas primeiro; dentro de cada grupo, a mais recente em cima.
  const visiveis = dividas
    .filter((divida) => !membro || divida.membro === membro)
    .filter((divida) => !situacao || (situacao === "paga") === divida.paga)
    .sort((a, b) => Number(a.paga) - Number(b.paga) || b.data.localeCompare(a.data));

  if (!visiveis.length) {
    alvo.innerHTML = `<p class="aviso">${dividas.length ? "Nenhuma dívida neste filtro" : "Cadastre a primeira dívida acima"}</p>`;
    return;
  }

  alvo.innerHTML = `
    <table class="tabela-de-prazos tabela-de-dividas">
      <thead><tr><th>Membro</th><th>Descrição</th><th>Data</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${visiveis.map((divida) => `
        <tr>
          <td>${escapar(divida.membro)}</td>
          <td>${escapar(divida.descricao)}</td>
          <td class="coluna-data">${formatarData(divida.data)}</td>
          <td class="coluna-valor">${formatarMoeda(divida.valor)}</td>
          <td class="${divida.paga ? "prazo-concluido" : "prazo-em-aberto"}">${divida.paga ? `Paga em ${formatarData(divida.pagaEm)}` : "Em aberto"}</td>
          <td class="acoes-da-divida">
            <button type="button" data-acao="alternar" data-id="${divida.id}">${divida.paga ? "Reabrir" : "Marcar paga"}</button>
            <button type="button" data-acao="excluir" data-id="${divida.id}" aria-label="Excluir">✕</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

document.getElementById("listaDeDividas").addEventListener("click", async (evento) => {
  const botao = evento.target.closest("button[data-acao]");
  if (!botao) return;

  const divida = dividas.find((item) => item.id === botao.dataset.id);
  if (!divida) return;

  if (botao.dataset.acao === "alternar") {
    divida.paga = !divida.paga;
    divida.pagaEm = divida.paga ? hoje() : undefined;
  }

  if (botao.dataset.acao === "excluir") {
    const excluir = await confirmar({
      titulo: `Excluir a dívida de ${divida.membro}?`,
      mensagem: `${divida.descricao} · ${formatarMoeda(divida.valor)}`,
      confirmarTexto: "Excluir",
      perigo: true,
    });
    if (!excluir) return;
    dividas = dividas.filter((item) => item !== divida);
  }

  salvar();
  desenharTudo();
});

// ===== Desenho =====

function desenharTudo() {
  preencherMembros();
  desenharIndicadores();
  desenharPorMembro();
  desenharPorMes();
  desenharLista();
}

restaurarTemaSalvo();

// Mesmo atalho escondido do painel para trocar o tema.
document.addEventListener("keydown", (evento) => {
  if (evento.key.toLowerCase() !== "t" || evento.target.closest("input, select, textarea")) return;
  alternarTema();
  if (jaEntrou()) desenharTudo();
});

if (jaEntrou()) mostrarPagina();
