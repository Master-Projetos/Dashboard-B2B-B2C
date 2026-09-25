import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { CORES, CORES_DOS_STATUS, FONTE, corDe, eixoDeCategoria, eixoDeValor, dicaDeContexto, estiloDeTextoSuave, tamanhoDeFonteDoGrafico } from "./tema.js";
import { formatarNumero, formatarMes } from "./formatadores.js";
import { DIMENSOES, obterContagens, obterItens } from "./dados-b2b.js";
import { abrirDetalhes, ehCelular } from "./detalhes.js";

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

// Numa tela de toque não existe "sair com o mouse": a dica aberta no toque
// fica presa na tela, inclusive por cima da caixa de detalhes, já que o
// ECharts a desenha com z-index próprio bem alto.
export function esconderDicas(idDoGraficoPreservado) {
  instancias.forEach((instancia, id) => {
    if (id !== idDoGraficoPreservado) instancia.dispatchAction({ type: "hideTip" });
  });
}

// Só no toque. No mouse, o próprio ECharts esconde a dica ao sair do gráfico,
// e mexer nisso estragaria o comportamento que já funciona. Cada toque deixa
// no máximo uma dica em pé: a do gráfico tocado, ou nenhuma se foi fora.
document.addEventListener("pointerdown", (evento) => {
  if (evento.pointerType === "mouse") return;

  esconderDicas(evento.target.closest(".area-grafico")?.id);
});

// O ECharts tem dois canais de clique — na série (`on`) e na área toda
// (`getZr().on`). Os dois precisam ser limpos ao redesenhar, senão o handler
// anterior continua ativo.
function limparCliques(instancia) {
  instancia.off("click");
  instancia.getZr().off("click");
}

// Clique na faixa inteira (a coluna ou a linha do eixo), não só na barra: um
// status com 1 projeto contra 86 renderiza poucos pixels e seria impossível de
// acertar. `eixo` diz em qual coordenada está a categoria.
function aoClicarNaFaixa(instancia, eixo, aoEscolher) {
  limparCliques(instancia);

  instancia.getZr().on("click", (evento) => {
    const posicao = instancia.convertFromPixel({ seriesIndex: 0 }, [evento.offsetX, evento.offsetY]);
    const indice = Math.round(eixo === "x" ? posicao[0] : posicao[1]);
    if (indice < 0) return;

    esconderDicas(); // no toque ela ficaria por cima da caixa que vai abrir
    aoEscolher(indice);
  });
}

// No celular o clique não abre nada, então a dica não aparece.
const dicaDeClique = () => (ehCelular() ? "" : '<br/><span style="opacity:.7">clique para ver os projetos</span>');

// ===== Projetos por mês =====

export function desenharProjetosPorMes(b2b) {
  const contagens = obterContagens(b2b, DIMENSOES.mes);
  const meses = Object.keys(contagens).sort();
  const valores = meses.map((mes) => contagens[mes]);

  const instancia = desenhar("graficoProjetosPorMes", {
    // Folga em cima para o número do ponto mais alto não encostar na borda.
    grid: { top: 30, right: 22, bottom: 22, left: 34 },
    // Gatilho por eixo (e não por ponto): a área de acerto é a coluna inteira,
    // então não é preciso acertar a bolinha no pixel.
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: CORES.eixo, width: 1 } },
      formatter: ([ponto]) =>
        `${ponto.axisValue}<br/><b>${formatarNumero(ponto.value)}</b> projetos${dicaDeClique()}`,
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
      label: rotuloDeValor({ position: "top", distance: 9, color: CORES.textoPrimario }),
    }],
  });

  aoClicarNaFaixa(instancia, "x", (indice) => {
    const mes = meses[indice];
    if (!mes) return;

    const itens = obterItens(b2b, DIMENSOES.mes).filter((item) => item.month === mes);
    abrirDetalhes(`Projetos de ${formatarMes(mes)}`, itens);
  });
}

// ===== Status dos projetos =====

// Coluna status da rota status_by_region: Concluída ou Em Andamento. Vale para
// os dois gráficos de status. Os itens unidos pelo filtro de período guardam
// esse valor em grupoDaEquipe, porque status ali é o status real.
// cor: nome da paleta (tema.js) ou hex direto, como "#9b7fd6".
const FAIXAS_CONHECIDAS = [
  { chave: "Não Iniciada", rotulo: "Não iniciada", cor: "serie1" },
  { chave: "Em Andamento", rotulo: "Em andamento", cor: "statusAtencao" },
  { chave: "Atrasada", rotulo: "Atrasada", cor: "serie2" },
  { chave: "Aguardando BP", rotulo: "Aguardando BP", cor: "lilas" },
  { chave: "Concluída", rotulo: "Concluída", cor: "serie3" },
  { chave: "Cancelada", rotulo: "Cancelada", cor: "statusCritico" },
];

// Status que a API passar a mandar sem estar na lista entram assim mesmo, com
// o nome que vieram — sumir com eles faria o total não bater.
function faixasDeStatus(porStatus) {
  const novas = Object.keys(porStatus)
    .filter((chave) => !FAIXAS_CONHECIDAS.some((faixa) => faixa.chave === chave))
    .map((chave) => ({ chave, rotulo: chave, cor: "lilas" }));

  return [...FAIXAS_CONHECIDAS, ...novas].filter(({ chave }) =>
    Object.values(porStatus[chave] ?? {}).some((quantidade) => quantidade > 0));
}

const statusDaEquipe = (item) => item.grupoDaEquipe ?? item.status;

// A mesma coluna status do gráfico por equipe (rota status_by_region), somada
// de todas as equipes. As situações detalhadas (demandas do setor
// finalizadas, cancelado...) ficam na tabela de detalhes.
export function desenharStatus(b2b) {
  const porStatus = obterContagens(b2b, DIMENSOES.equipe);
  const faixas = faixasDeStatus(porStatus).map((faixa) => ({
    ...faixa,
    quantidade: Object.values(porStatus[faixa.chave] ?? {}).reduce((soma, valor) => soma + valor, 0),
  }));

  const instancia = desenhar("graficoStatus", {
    // Mesmo estilo do gráfico de status por equipe — eixo com números e grade
    // visível — só que sem legenda: aqui cada barra já é uma cor diferente, uma
    // fileira de bolinhas embaixo só repetiria o que a barra já diz.
    grid: { top: 6, right: 52, bottom: 20, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) => `<b>${ponto.name}</b> — ${formatarNumero(ponto.value)} projetos${dicaDeClique()}`,
    }),
    xAxis: eixoDeValor({ minInterval: 1 }),
    yAxis: eixoDeCategoria({ data: faixas.map((faixa) => faixa.rotulo), axisLine: { show: false } }),
    series: [{
      type: "bar",
      cursor: "pointer",
      data: faixas.map((faixa) => ({
        value: faixa.quantidade,
        itemStyle: { color: corDe(faixa.cor), borderRadius: [0, 4, 4, 0] },
      })),
      barMaxWidth: 34,
      label: rotuloDeValor({ position: "right", distance: 6, color: CORES.textoPrimario }),
    }],
  });

  aoClicarNaFaixa(instancia, "y", (indice) => {
    const faixa = faixas[indice];
    if (!faixa) return;

    const itens = obterItens(b2b, DIMENSOES.equipe).filter((item) => statusDaEquipe(item) === faixa.chave);
    abrirDetalhes(`Status: ${faixa.rotulo}`, itens);
  });
}

// ===== Projetos por status =====

// Um status real por barra (Aguardando BP, Estudo...), como vem da rota de
// status — o modelo antigo, com o detalhe que o gráfico de cima agrupa.
// As cores ficam em tema.js, em CORES_DOS_STATUS.

export function desenharProjetosPorStatus(b2b) {
  const itens = obterItens(b2b, DIMENSOES.status);
  const statusOrdenados = Object.entries(obterContagens(b2b, DIMENSOES.status))
    .filter(([, quantidade]) => quantidade > 0)
    .sort(([, a], [, b]) => a - b); // o eixo cresce de baixo para cima

  const instancia = desenhar("graficoProjetosPorStatus", {
    grid: { top: 4, right: 44, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) => `<b>${ponto.name}</b> — ${formatarNumero(ponto.value)} projetos${dicaDeClique()}`,
    }),
    xAxis: eixoDeValor({ show: false }),
    yAxis: eixoDeCategoria({
      data: statusOrdenados.map(([status]) => status),
      axisLine: { show: false },
      axisLabel: { ...estiloDeTextoSuave(), interval: 0, width: 132, overflow: "truncate" },
    }),
    series: [{
      type: "bar",
      cursor: "pointer",
      data: statusOrdenados.map(([status, quantidade]) => ({
        value: quantidade,
        itemStyle: { color: corDe(CORES_DOS_STATUS[status] ?? "serie1"), borderRadius: [0, 4, 4, 0] },
      })),
      barMaxWidth: 16,
      showBackground: true,
      backgroundStyle: { color: "rgba(128, 128, 128, 0.07)", borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({ position: "right", distance: 6, color: CORES.textoPrimario }),
    }],
  });

  aoClicarNaFaixa(instancia, "y", (indice) => {
    const [status] = statusOrdenados[indice] ?? [];
    if (status) abrirDetalhes(`Status: ${status}`, itens.filter((item) => item.status === status));
  });
}

// ===== Prioridade =====

const ORDEM_DE_PRIORIDADE = ["Baixa", "Média", "Alta", "Atividade Crítica"];

// Cada prioridade tem cor própria em vez de tons de um azul só: crítica em
// vermelho, alta em amarelo, média em lilás e baixa em verde.
// cor: nome da paleta (tema.js) ou hex direto, como "#9b7fd6".
const CORES_DA_PRIORIDADE = {
  "Baixa": "serie3",
  "Média": "lilas",
  "Alta": "statusAtencao",
  "Atividade Crítica": "statusCritico",
};

// A API passou a mandar os projetos de cada prioridade, com o solicitante em
// cada linha. Antes o clique trocava o gráfico por uma barra de solicitantes e
// o clique seguinte voltava — dois significados para o mesmo gesto, diferente
// de todos os outros gráficos do painel. Agora o clique abre a lista, igual ao
// resto, e o solicitante aparece como coluna.
function abrirProjetosDaPrioridade(b2b, prioridade) {
  const itens = obterItens(b2b, DIMENSOES.prioridade).filter((item) => item.priority === prioridade);
  abrirDetalhes(`Prioridade: ${prioridade}`, itens, { filtrarPorSolicitante: true });
}

// Enquanto a API não trouxer os itens, o clique continua abrindo os
// solicitantes daquela prioridade — melhor que um clique que não faz nada.
let prioridadeAberta = null;

function escreverTituloDaPrioridade(texto) {
  document.getElementById("tituloPrioridade").textContent = texto;
}

function desenharSolicitantesDaPrioridade(b2b, prioridade) {
  const porPrioridade = obterContagens(b2b, DIMENSOES.prioridade);

  const solicitantes = Object.entries(porPrioridade[prioridade] ?? {})
    .filter(([, quantidade]) => quantidade > 0)
    .sort(([, a], [, b]) => a - b);

  escreverTituloDaPrioridade(`${prioridade} · solicitantes — clique para voltar`);

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
    esconderDicas();
    prioridadeAberta = null;
    desenharPrioridade(b2b);
  });
}

export function desenharPrioridade(b2b) {
  const temItens = obterItens(b2b, DIMENSOES.prioridade).length > 0;

  if (prioridadeAberta && !temItens) {
    desenharSolicitantesDaPrioridade(b2b, prioridadeAberta);
    return;
  }

  prioridadeAberta = null;
  escreverTituloDaPrioridade("Prioridade");
  document.getElementById("graficoPrioridade").onclick = null; // deixado pelo caso sem solicitantes

  // Prioridade nova da API entra depois das conhecidas, em azul.
  const prioridades = [
    ...ORDEM_DE_PRIORIDADE.filter((nome) => nome in b2b.priority),
    ...Object.keys(b2b.priority).filter((nome) => !ORDEM_DE_PRIORIDADE.includes(nome)),
  ];
  const dica = temItens ? "clique para ver os projetos" : "clique para ver os solicitantes";

  const instancia = desenhar("graficoPrioridade", {
    grid: { top: 30, right: 10, bottom: 4, left: 6, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) =>
        `${ponto.name}<br/><b>${formatarNumero(ponto.value)}</b> projetos<br/><span style="opacity:.7">${dica}</span>`,
    }),
    xAxis: eixoDeCategoria({
      data: prioridades,
      axisLabel: { ...estiloDeTextoSuave(), interval: 0, hideOverlap: false, width: 72, overflow: "break" },
    }),
    yAxis: eixoDeValor({ show: false }),
    series: [{
      type: "bar",
      cursor: "pointer",
      data: prioridades.map((nome) => ({
        value: b2b.priority[nome],
        itemStyle: { color: corDe(CORES_DA_PRIORIDADE[nome] ?? "serie1"), borderRadius: [4, 4, 0, 0] },
      })),
      barMaxWidth: 54,
      // A faixa de fundo mostra que a coluna inteira é clicável.
      showBackground: true,
      backgroundStyle: { color: "rgba(128, 128, 128, 0.07)", borderRadius: [4, 4, 0, 0] },
      label: rotuloDeValor({ position: "top", distance: 6, color: CORES.textoPrimario }),
    }],
  });

  aoClicarNaFaixa(instancia, "x", (indice) => {
    const nome = prioridades[indice];
    if (!nome) return;

    if (temItens) {
      abrirProjetosDaPrioridade(b2b, nome);
      return;
    }

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
    // No celular o eixo é estreito: números que não cabem somem em vez de se sobrepor.
    xAxis: eixoDeValor({ axisLabel: { ...estiloDeTextoSuave(), formatter: formatarNumero, hideOverlap: true } }),
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

// ===== Ocupação por regional =====

export function desenharOcupacaoPorRegional(viabilidade) {
  const regioes = [...viabilidade.regioes]
    .map((regiao) => ({ ...regiao, ocupacao: (regiao.ocupadas / regiao.portas) * 100 }))
    .sort((a, b) => a.ocupacao - b.ocupacao);

  desenhar("graficoOcupacao", {
    grid: { top: 6, right: 48, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) => {
        const regiao = regioes[ponto.dataIndex];
        return `${regiao.nome}<br/><b>${ponto.value.toFixed(1).replace(".", ",")}%</b> ocupadas<br/>${formatarNumero(regiao.ocupadas)} de ${formatarNumero(regiao.portas)}`;
      },
    }),
    xAxis: eixoDeValor({ show: false, max: 100 }),
    yAxis: eixoDeCategoria({ data: regioes.map((regiao) => regiao.nome), axisLine: { show: false } }),
    series: [{
      type: "bar",
      data: regioes.map((regiao) => Number(regiao.ocupacao.toFixed(1))),
      barMaxWidth: 22,
      itemStyle: { color: CORES.serie1, borderRadius: [0, 4, 4, 0] },
      showBackground: true,
      backgroundStyle: { color: "rgba(128, 128, 128, 0.07)", borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({
        position: "right",
        distance: 6,
        formatter: ({ value }) => `${String(value).replace(".", ",")}%`,
      }),
    }],
  });
}

// ===== Estoque por regional =====

export function desenharEstoquePorRegional(porRegional) {
  const regionais = [...porRegional].reverse(); // o eixo cresce de baixo para cima

  // Com o verde, cada barra soma todos os itens da regional e as cinco ficam
  // do mesmo comprimento: a leitura vira proporção — quanto de cada regional
  // está em falta, no limite ou em ordem. O número vai dentro de cada faixa.
  const faixas = [
    { rotulo: "Críticos", chave: "criticos", cor: CORES.statusCritico, texto: "#ffffff" },
    { rotulo: "Em alerta", chave: "alertas", cor: CORES.statusAtencao, texto: "#1f1a0a" },
    { rotulo: "Normais", chave: "normais", cor: CORES.serie3, texto: "#ffffff" },
  ];

  const maiorTotal = Math.max(1, ...regionais.map((r) => r.criticos + r.alertas + r.normais));

  desenhar("graficoEstoquePorRegional", {
    // Barra empilhada crescendo do zero mostra buracos entre as faixas no meio
    // da animação, e a tela redesenha a cada minuto e a cada filtro: parecia
    // defeito. Sem animação, as faixas já nascem coladas.
    animation: false,
    grid: { top: 6, right: 10, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: (pontos) => {
        const regional = regionais[pontos[0].dataIndex];
        const linhas = pontos.map((p) => `${p.marker} ${p.seriesName}: <b>${formatarNumero(p.value)}</b>`);
        return `${regional.sigla} — ${regional.nome}<br/>${linhas.join("<br/>")}`;
      },
    }),
    legend: legendaInferior(),
    xAxis: eixoDeValor({ show: false, max: maiorTotal }),
    yAxis: eixoDeCategoria({ data: regionais.map((regional) => regional.sigla), axisLine: { show: false } }),
    series: faixas.map(({ rotulo, chave, cor, texto }) => ({
      name: rotulo,
      type: "bar",
      stack: "estoque",
      data: regionais.map((regional) => regional[chave]),
      barMaxWidth: 26,
      itemStyle: { color: cor, borderColor: CORES.superficie, borderWidth: 1 },
      label: rotuloDeValor({
        position: "inside",
        color: texto,
        formatter: ({ value }) => (value ? formatarNumero(value) : ""),
      }),
    })),
  });
}

// ===== Status por equipe =====

function encurtarNomeDaEquipe(nome) {
  return nome.trim().replace("Regional - ", "").replace("Engenharia - ", "Eng. ").replace("CD - ", "");
}

export function desenharStatusPorEquipe(b2b, quantidade = 8) {
  const porStatus = obterContagens(b2b, DIMENSOES.equipe);
  const faixas = faixasDeStatus(porStatus);

  // O nome completo fica guardado: é por ele que os projetos são filtrados no
  // clique, já que o eixo mostra a versão encurtada.
  const nomes = new Set(faixas.flatMap(({ chave }) => Object.keys(porStatus[chave] ?? {})));
  const equipes = [...nomes]
    .map((nome) => {
      const equipe = { nome: encurtarNomeDaEquipe(nome), nomeCompleto: nome, total: 0 };
      for (const { chave } of faixas) {
        equipe[chave] = porStatus[chave]?.[nome] ?? 0;
        equipe.total += equipe[chave];
      }
      return equipe;
    })
    .filter((equipe) => equipe.total > 0)
    .sort((a, b) => a.total - b.total) // as maiores em cima, o eixo cresce para cima
    .slice(-quantidade);

  const instancia = desenhar("graficoStatusPorEquipe", {
    grid: { top: 6, right: 40, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: (pontos) => {
        const linhas = pontos
          .filter((p) => p.value)
          .map((p) => `${p.marker} ${p.seriesName}: <b>${formatarNumero(p.value)}</b>`);
        return `${pontos[0].axisValue}<br/>${linhas.join("<br/>")}${dicaDeClique()}`;
      },
    }),
    legend: legendaInferior(),
    xAxis: eixoDeValor({ minInterval: 1 }),
    yAxis: eixoDeCategoria({ data: equipes.map((equipe) => equipe.nome), axisLine: { show: false } }),
    series: faixas.map(({ chave, rotulo, cor }, indice) => ({
      name: rotulo,
      type: "bar",
      stack: "equipes",
      cursor: "pointer",
      data: equipes.map((equipe) => equipe[chave]),
      barMaxWidth: 18,
      itemStyle: { color: corDe(cor), borderColor: CORES.superficie, borderWidth: 1 },
      label: indice === faixas.length - 1
        ? rotuloDeValor({
            position: "right",
            distance: 6,
            formatter: ({ dataIndex }) => formatarNumero(equipes[dataIndex].total),
          })
        : { show: false },
    })),
  });

  aoClicarNaFaixa(instancia, "y", (indice) => {
    const equipe = equipes[indice];
    if (!equipe) return;

    const itens = obterItens(b2b, DIMENSOES.equipe).filter((item) => item.region === equipe.nomeCompleto);
    abrirDetalhes(`Equipe: ${equipe.nome}`, itens);
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
