import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { CORES, FONTE, eixoDeCategoria, eixoDeValor, dicaDeContexto, estiloDeTextoSuave, tamanhoDeFonteDoGrafico } from "./tema.js";
import { formatarNumero, formatarMes } from "./formatadores.js";
import { DIMENSOES, GRUPOS_DE_STATUS, ROTULOS_DE_EQUIPE, grupoDoStatus, obterContagens, obterItens } from "./dados-b2b.js";
import { abrirDetalhes } from "./detalhes.js";

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

const DICA_DE_CLIQUE = '<span style="opacity:.7">clique para ver os projetos</span>';

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
        `${ponto.axisValue}<br/><b>${formatarNumero(ponto.value)}</b> projetos<br/>${DICA_DE_CLIQUE}`,
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

export function desenharStatus(b2b) {
  const contagens = obterContagens(b2b, DIMENSOES.status);
  const itens = obterItens(b2b, DIMENSOES.status);

  const cores = { andamento: CORES.serie1, concluido: CORES.statusBom, cancelado: CORES.statusCritico };

  const grupos = GRUPOS_DE_STATUS.map((grupo) => ({
    ...grupo,
    // Conta pelos status que a API mandou de fato, não pela lista fixa: um
    // status novo entra em "Em andamento" por grupoDoStatus.
    quantidade: Object.entries(contagens)
      .filter(([status]) => grupoDoStatus(status).id === grupo.id)
      .reduce((soma, [, valor]) => soma + valor, 0),
  })).reverse(); // o eixo cresce de baixo para cima

  const instancia = desenhar("graficoStatus", {
    grid: { top: 6, right: 52, bottom: 4, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(128, 128, 128, 0.12)" } },
      formatter: ([ponto]) => {
        const grupo = grupos[ponto.dataIndex];
        const detalhe = Object.entries(contagens)
          .filter(([status]) => grupoDoStatus(status).id === grupo.id)
          .sort(([, a], [, b]) => b - a)
          .map(([status, valor]) => `${status}: ${formatarNumero(valor)}`)
          .join("<br/>");

        return `<b>${grupo.rotulo}</b> — ${formatarNumero(ponto.value)} projetos<br/>${detalhe}<br/>${DICA_DE_CLIQUE}`;
      },
    }),
    xAxis: eixoDeValor({ show: false }),
    yAxis: eixoDeCategoria({ data: grupos.map((grupo) => grupo.rotulo), axisLine: { show: false } }),
    series: [{
      type: "bar",
      cursor: "pointer",
      data: grupos.map((grupo) => ({ value: grupo.quantidade, itemStyle: { color: cores[grupo.id], borderRadius: [0, 4, 4, 0] } })),
      barMaxWidth: 34,
      showBackground: true,
      backgroundStyle: { color: "rgba(128, 128, 128, 0.07)", borderRadius: [0, 4, 4, 0] },
      label: rotuloDeValor({ position: "right", distance: 6, color: CORES.textoPrimario }),
    }],
  });

  aoClicarNaFaixa(instancia, "y", (indice) => {
    const grupo = grupos[indice];
    if (!grupo) return;

    abrirDetalhes(`Status: ${grupo.rotulo}`, itens.filter((item) => grupoDoStatus(item.status).id === grupo.id));
  });
}

// ===== Prioridade =====

const ORDEM_DE_PRIORIDADE = ["Baixa", "Média", "Alta", "Atividade Crítica"];

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

  const prioridades = ORDEM_DE_PRIORIDADE.filter((nome) => nome in b2b.priority);
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

  const faixas = [
    { rotulo: "Críticos", chave: "criticos", cor: CORES.statusCritico },
    { rotulo: "Em alerta", chave: "alertas", cor: CORES.statusAtencao },
  ];

  desenhar("graficoEstoquePorRegional", {
    grid: { top: 6, right: 34, bottom: 26, left: 4, containLabel: true },
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
    xAxis: eixoDeValor({ minInterval: 1 }),
    yAxis: eixoDeCategoria({ data: regionais.map((regional) => regional.sigla), axisLine: { show: false } }),
    series: faixas.map(({ rotulo, chave, cor }, indice) => ({
      name: rotulo,
      type: "bar",
      stack: "estoque",
      data: regionais.map((regional) => regional[chave]),
      barMaxWidth: 22,
      itemStyle: { color: cor, borderColor: CORES.superficie, borderWidth: 1 },
      label: indice === faixas.length - 1
        ? rotuloDeValor({
            position: "right",
            distance: 6,
            formatter: ({ dataIndex }) => {
              const total = regionais[dataIndex].criticos + regionais[dataIndex].alertas;
              return total ? formatarNumero(total) : "";
            },
          })
        : { show: false },
    })),
  });
}

// ===== Status por equipe =====

function encurtarNomeDaEquipe(nome) {
  return nome.trim().replace("Regional - ", "").replace("Engenharia - ", "Eng. ").replace("CD - ", "");
}

export function desenharStatusPorEquipe(b2b, quantidade = 8) {
  const porEquipe = obterContagens(b2b, DIMENSOES.equipe);
  const concluidas = porEquipe["Concluída"] ?? {};
  const emAndamento = porEquipe["Em Andamento"] ?? {};

  // O nome completo fica guardado: é por ele que os projetos são filtrados no
  // clique, já que o eixo mostra a versão encurtada.
  const equipes = [...new Set([...Object.keys(concluidas), ...Object.keys(emAndamento)])]
    .map((nome) => ({
      nome: encurtarNomeDaEquipe(nome),
      nomeCompleto: nome,
      concluidas: concluidas[nome] ?? 0,
      emAndamento: emAndamento[nome] ?? 0,
    }))
    .sort((a, b) => a.concluidas + a.emAndamento - (b.concluidas + b.emAndamento))
    .slice(-quantidade);

  const faixas = [
    { rotulo: ROTULOS_DE_EQUIPE["Concluída"], chave: "concluidas", cor: CORES.serie1 },
    { rotulo: ROTULOS_DE_EQUIPE["Em Andamento"], chave: "emAndamento", cor: CORES.serie2 },
  ];

  const instancia = desenhar("graficoStatusPorEquipe", {
    grid: { top: 6, right: 40, bottom: 26, left: 4, containLabel: true },
    tooltip: dicaDeContexto({
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
      formatter: (pontos) => {
        const linhas = pontos.map((p) => `${p.marker} ${p.seriesName}: <b>${formatarNumero(p.value)}</b>`);
        return `${pontos[0].axisValue}<br/>${linhas.join("<br/>")}<br/>${DICA_DE_CLIQUE}`;
      },
    }),
    legend: legendaInferior(),
    xAxis: eixoDeValor({ minInterval: 1 }),
    yAxis: eixoDeCategoria({ data: equipes.map((equipe) => equipe.nome), axisLine: { show: false } }),
    series: faixas.map(({ rotulo, chave, cor }, indice) => ({
      name: rotulo,
      type: "bar",
      stack: "equipes",
      cursor: "pointer",
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
