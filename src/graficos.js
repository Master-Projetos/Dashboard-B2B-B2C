import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { CORES, FONTE, eixoDeCategoria, eixoDeValor, dicaDeContexto, estiloDeTextoSuave, tamanhoDeFonteDoGrafico } from "./tema.js";
import { formatarNumero, formatarMes } from "./formatadores.js";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, GraphicComponent, CanvasRenderer]);

const instancias = new Map();

// Cada gráfico é criado uma vez e depois só recebe novos dados — o ECharts faz a
// transição animada, sem recriar o canvas a cada atualização.
function desenhar(idDoElemento, opcoes) {
  limparAviso(idDoElemento);
  let instancia = instancias.get(idDoElemento);

  if (!instancia) {
    const elemento = document.getElementById(idDoElemento);
    instancia = echarts.init(elemento, null, { renderer: "canvas" });
    instancias.set(idDoElemento, instancia);

    new ResizeObserver(() => instancia.resize()).observe(elemento);
  }

  instancia.setOption(opcoes, { notMerge: true });
  return instancia;
}

// Quando uma fonte de dados não está disponível, o cartão explica o motivo em
// vez de ficar em branco (o que parece painel quebrado).
export function mostrarAvisoNoGrafico(idDoElemento, mensagem) {
  const instancia = instancias.get(idDoElemento);

  if (instancia) {
    instancia.dispose();
    instancias.delete(idDoElemento);
  }

  document.getElementById(idDoElemento).innerHTML = `<div class="aviso">${mensagem}</div>`;
}

function limparAviso(idDoElemento) {
  const elemento = document.getElementById(idDoElemento);
  const aviso = elemento.querySelector(".aviso");
  if (aviso) elemento.innerHTML = "";
}

function legendaInferior() {
  return {
    bottom: 0,
    icon: "circle",
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 14,
    textStyle: { color: CORES.textoSecundario, fontFamily: FONTE, fontSize: tamanhoDeFonteDoGrafico() },
  };
}

function rotuloDeValor(opcoesExtras = {}) {
  return {
    show: true,
    fontFamily: FONTE,
    fontSize: tamanhoDeFonteDoGrafico(),
    fontWeight: 600,
    color: CORES.textoSecundario,
    formatter: ({ value }) => formatarNumero(value),
    ...opcoesExtras,
  };
}

// ===== Projetos por mês =====

export function desenharProjetosPorMes(b2b) {
  const meses = Object.keys(b2b.projects_by_month).sort();
  const valores = meses.map((mes) => b2b.projects_by_month[mes]);

  const maiorValor = Math.max(...valores);
  const indiceDoPico = valores.indexOf(maiorValor);
  const indiceDoUltimo = valores.length - 1;
  const indicesDestacados = new Set([indiceDoPico, indiceDoUltimo]);

  desenhar("graficoProjetosPorMes", {
    grid: { top: 26, right: 18, bottom: 22, left: 34 },
    // Gatilho por eixo (e não por ponto): a área de acerto é a coluna inteira,
    // então não é preciso acertar a bolinha no pixel.
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: CORES.eixo, width: 1 } },
      formatter: ([ponto]) => `${ponto.axisValue}<br/><b>${formatarNumero(ponto.value)}</b> projetos`,
    }),
    xAxis: eixoDeCategoria({ data: meses.map(formatarMes), boundaryGap: false }),
    yAxis: eixoDeValor({ minInterval: 1 }),
    series: [{
      type: "line",
      data: valores,
      smooth: 0.35,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 2, color: CORES.serie1 },
      itemStyle: { color: CORES.serie1, borderColor: CORES.superficie, borderWidth: 2 },
      emphasis: { scale: 1.6, itemStyle: { borderWidth: 3 } },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: CORES.gradienteArea[0] },
          { offset: 1, color: CORES.gradienteArea[1] },
        ]),
      },
      // Rotular todos os pontos vira ruído: só o pico e o mês mais recente.
      label: rotuloDeValor({
        position: "top",
        distance: 8,
        color: CORES.textoPrimario,
        formatter: ({ value, dataIndex }) => (indicesDestacados.has(dataIndex) ? formatarNumero(value) : ""),
      }),
    }],
  });
}

// ===== Status dos projetos =====

// Status com pouquíssimos projetos viram "Outros": 12 barras não cabem legíveis.
function agruparStatusMenores(status, minimoParaAparecer = 3) {
  const ordenados = Object.entries(status).sort(([, a], [, b]) => a - b);
  const relevantes = ordenados.filter(([, valor]) => valor >= minimoParaAparecer);
  const restante = ordenados
    .filter(([, valor]) => valor < minimoParaAparecer)
    .reduce((soma, [, valor]) => soma + valor, 0);

  return restante > 0 ? [["Outros", restante], ...relevantes] : relevantes;
}

export function desenharStatus(b2b) {
  const status = agruparStatusMenores(b2b.status);

  desenhar("graficoStatus", {
    grid: { top: 6, right: 46, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: ([ponto]) => `${ponto.name}<br/><b>${formatarNumero(ponto.value)}</b> projetos`,
    }),
    xAxis: eixoDeValor({ show: false }),
    yAxis: eixoDeCategoria({ data: status.map(([nome]) => nome), axisLine: { show: false } }),
    series: [{
      type: "bar",
      data: status.map(([, valor]) => valor),
      barMaxWidth: 16,
      itemStyle: { color: CORES.serie1, borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({ position: "right", distance: 6 }),
    }],
  });
}

// ===== Prioridade =====

const ORDEM_DE_PRIORIDADE = ["Baixa", "Média", "Alta", "Atividade Crítica"];

// Clicar numa prioridade abre quem são os solicitantes daquela fatia; clicar de
// novo volta para a visão geral.
let prioridadeAberta = null;

function escreverTituloDaPrioridade(texto) {
  document.getElementById("tituloPrioridade").textContent = texto;
}

// O ECharts tem dois canais de clique — na série (`on`) e na área toda
// (`getZr().on`). Os dois precisam ser limpos ao trocar de visão, senão o
// handler da visão anterior continua ativo.
function limparCliques(instancia) {
  instancia.off("click");
  instancia.getZr().off("click");
}

function desenharSolicitantesDaPrioridade(b2b, prioridade) {
  const porSolicitante = b2b.priority_by_requester[prioridade] ?? {};

  const solicitantes = Object.entries(porSolicitante)
    .filter(([, quantidade]) => quantidade > 0)
    .sort(([, a], [, b]) => a - b);

  escreverTituloDaPrioridade(`${prioridade} · solicitantes (B2B) — clique para voltar`);

  if (solicitantes.length === 0) {
    mostrarAvisoNoGrafico("graficoPrioridade", `Nenhum solicitante em ${prioridade} — clique para voltar`);
    document.getElementById("graficoPrioridade").onclick = () => {
      prioridadeAberta = null;
      desenharPrioridade(b2b);
    };
    return;
  }

  const instancia = desenhar("graficoPrioridade", {
    grid: { top: 6, right: 44, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128,128,128,0.12)" } },
      formatter: ([ponto]) => `${ponto.name}<br/><b>${formatarNumero(ponto.value)}</b> projetos`,
    }),
    xAxis: eixoDeValor({ show: false }),
    yAxis: eixoDeCategoria({ data: solicitantes.map(([nome]) => nome), axisLine: { show: false } }),
    series: [{
      type: "bar",
      data: solicitantes.map(([, quantidade]) => quantidade),
      barMaxWidth: 16,
      itemStyle: { color: CORES.serie1, borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({ position: "right", distance: 6 }),
    }],
  });

  limparCliques(instancia);
  instancia.getZr().on("click", () => {
    prioridadeAberta = null;
    desenharPrioridade(b2b);
  });
}

export function desenharPrioridade(b2b) {
  if (prioridadeAberta) {
    desenharSolicitantesDaPrioridade(b2b, prioridadeAberta);
    return;
  }

  escreverTituloDaPrioridade("Prioridade (B2B)");
  document.getElementById("graficoPrioridade").onclick = null; // deixado pelo caso sem solicitantes
  const prioridades = ORDEM_DE_PRIORIDADE.filter((nome) => nome in b2b.priority);

  const instancia = desenhar("graficoPrioridade", {
    grid: { top: 30, right: 10, bottom: 4, left: 6, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) =>
        `${ponto.name}<br/><b>${formatarNumero(ponto.value)}</b> projetos<br/><span style="opacity:.7">clique para ver os solicitantes</span>`,
    }),
    xAxis: eixoDeCategoria({
      data: prioridades,
      axisLabel: { ...estiloDeTextoSuave(), interval: 0, hideOverlap: false, width: 72, overflow: "break" },
    }),
    yAxis: eixoDeValor({ show: false }),
    series: [{
      type: "bar",
      cursor: "pointer",
      data: prioridades.map((nome, indice) => ({
        value: b2b.priority[nome],
        itemStyle: { color: CORES.rampaPrioridade[indice], borderRadius: [4, 4, 0, 0] },
      })),
      barMaxWidth: 54,
      // A faixa de fundo mostra que a coluna inteira é clicável.
      showBackground: true,
      backgroundStyle: { color: "rgba(128, 128, 128, 0.07)", borderRadius: [4, 4, 0, 0] },
      label: rotuloDeValor({ position: "top", distance: 6, color: CORES.textoPrimario }),
    }],
  });

  limparCliques(instancia);

  // Clique na COLUNA, não na barra: "Atividade Crítica" tem 2 projetos contra
  // 148 da "Baixa", então sua barra teria poucos pixels de altura e seria
  // impossível de acertar.
  instancia.getZr().on("click", (evento) => {
    const [indice] = instancia.convertFromPixel({ seriesIndex: 0 }, [evento.offsetX, evento.offsetY]);
    const nome = prioridades[Math.round(indice)];
    if (!nome) return;

    prioridadeAberta = nome;
    desenharPrioridade(b2b);
  });
}

// ===== Portas por regional =====

export function desenharPortasPorRegional(viabilidade) {
  const regioes = [...viabilidade.regioes].sort((a, b) => a.portas - b.portas);

  const faixas = [
    { rotulo: "Ocupadas", chave: "ocupadas", cor: CORES.serie1 },
    { rotulo: "Livres", chave: "livres", cor: CORES.serie3 },
    { rotulo: "Atendimento cliente", chave: "atendimentoCliente", cor: CORES.serie2 },
  ];

  desenhar("graficoPortasPorRegional", {
    grid: { top: 6, right: 62, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: (pontos) => {
        const regiao = regioes[pontos[0].dataIndex];
        const linhas = pontos.map((p) => `${p.marker} ${p.seriesName}: <b>${formatarNumero(p.value)}</b>`);
        return `${regiao.nome} — ${formatarNumero(regiao.portas)} portas<br/>${linhas.join("<br/>")}`;
      },
    }),
    legend: legendaInferior(),
    xAxis: eixoDeValor({ axisLabel: { ...estiloDeTextoSuave(), formatter: formatarNumero } }),
    yAxis: eixoDeCategoria({ data: regioes.map((regiao) => regiao.nome), axisLine: { show: false } }),
    series: faixas.map(({ rotulo, chave, cor }, indice) => ({
      name: rotulo,
      type: "bar",
      stack: "portas",
      data: regioes.map((regiao) => regiao[chave]),
      barMaxWidth: 26,
      itemStyle: { color: cor, borderColor: CORES.superficie, borderWidth: 1 },
      // O total vai só na última fatia — e usa o total real da regional, que
      // inclui as portas bloqueadas (poucas demais para virarem uma faixa).
      label: indice === faixas.length - 1
        ? rotuloDeValor({
            position: "right",
            distance: 6,
            formatter: ({ dataIndex }) => formatarNumero(regioes[dataIndex].portas),
          })
        : { show: false },
    })),
  });
}

// ===== Cidades com mais portas =====

export function desenharCidades(viabilidade, quantidade = 8) {
  const cidades = viabilidade.cidades.slice(0, quantidade).reverse();

  desenhar("graficoCidades", {
    grid: { top: 6, right: 62, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: ([ponto]) => {
        const cidade = cidades[ponto.dataIndex];
        return `${cidade.cidade} · ${cidade.regiao}<br/><b>${formatarNumero(cidade.portas)}</b> portas<br/>${formatarNumero(cidade.ocupadas)} ocupadas`;
      },
    }),
    xAxis: eixoDeValor({ show: false }),
    yAxis: eixoDeCategoria({ data: cidades.map((cidade) => cidade.cidade), axisLine: { show: false } }),
    series: [{
      type: "bar",
      data: cidades.map((cidade) => cidade.portas),
      barMaxWidth: 16,
      itemStyle: { color: CORES.serie1, borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({ position: "right", distance: 6 }),
    }],
  });
}

// ===== Status por equipe =====

function encurtarNomeDaEquipe(nome) {
  return nome.trim().replace("Regional - ", "").replace("Engenharia - ", "Eng. ").replace("CD - ", "");
}

export function desenharStatusPorEquipe(b2b, quantidade = 8) {
  const concluidas = b2b.status_by_region["Concluída"] ?? {};
  const emAndamento = b2b.status_by_region["Em Andamento"] ?? {};

  const equipes = [...new Set([...Object.keys(concluidas), ...Object.keys(emAndamento)])]
    .map((nome) => ({
      nome: encurtarNomeDaEquipe(nome),
      concluidas: concluidas[nome] ?? 0,
      emAndamento: emAndamento[nome] ?? 0,
    }))
    .sort((a, b) => a.concluidas + a.emAndamento - (b.concluidas + b.emAndamento))
    .slice(-quantidade);

  const faixas = [
    { rotulo: "Concluídas", chave: "concluidas", cor: CORES.serie1 },
    { rotulo: "Em andamento", chave: "emAndamento", cor: CORES.serie2 },
  ];

  desenhar("graficoStatusPorEquipe", {
    grid: { top: 6, right: 40, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
    }),
    legend: legendaInferior(),
    xAxis: eixoDeValor({ minInterval: 1 }),
    yAxis: eixoDeCategoria({ data: equipes.map((equipe) => equipe.nome), axisLine: { show: false } }),
    series: faixas.map(({ rotulo, chave, cor }, indice) => ({
      name: rotulo,
      type: "bar",
      stack: "equipes",
      data: equipes.map((equipe) => equipe[chave]),
      barMaxWidth: 18,
      itemStyle: { color: cor, borderColor: CORES.superficie, borderWidth: 1 },
      label: indice === faixas.length - 1
        ? rotuloDeValor({
            position: "right",
            distance: 6,
            formatter: ({ dataIndex }) => formatarNumero(equipes[dataIndex].concluidas + equipes[dataIndex].emAndamento),
          })
        : { show: false },
    })),
  });
}

// Fontes e paddings mudam com a altura da tela: ao redimensionar, os gráficos
// são redesenhados com os novos tamanhos.
export function aoRedimensionar(redesenhar) {
  let agendado = null;

  window.addEventListener("resize", () => {
    clearTimeout(agendado);
    agendado = setTimeout(redesenhar, 200);
  });
}
