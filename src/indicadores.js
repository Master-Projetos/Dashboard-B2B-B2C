import { CORES } from "./tema.js";
import { formatarNumero, formatarMoeda, formatarMoedaCompacta, formatarPorcentagem } from "./formatadores.js";
import { DIMENSOES, ROTULOS_DE_PRAZO, obterContagens, obterItens, temDetalhes } from "./dados-b2b.js";
import { abrirDetalhes } from "./detalhes.js";

function montarIndicador({ rotulo, valor, detalhe, realce, aguardando, clicavel, acao }) {
  return `
    <div class="indicador${aguardando ? " aguardando" : ""}${clicavel ? " clicavel" : ""}"
         ${clicavel ? `data-acao="${acao}" title="Ver os projetos"` : ""}
         style="--realce: ${realce}">
      <div class="rotulo">${rotulo}</div>
      <div class="valor">${valor}</div>
      <div class="detalhe">${detalhe}</div>
    </div>
  `;
}

function escreverIndicadores(idDoContainer, indicadores) {
  document.getElementById(idDoContainer).innerHTML = indicadores.map(montarIndicador).join("");
}

// Os cartões são reescritos a cada atualização, então o clique é religado aqui
// depois de cada desenho.
function ligarCliques(idDoContainer, acoes) {
  const container = document.getElementById(idDoContainer);

  for (const [acao, aoClicar] of Object.entries(acoes)) {
    const cartao = container.querySelector(`[data-acao="${acao}"]`);
    if (cartao) cartao.onclick = aoClicar;
  }
}

// Sem dados, os cartões viram espaço reservado: a grade não estica e fica claro
// que o número está por vir, em vez de sumir da tela.
function indicadoresVazios(rotulos, detalhe) {
  return rotulos.map((rotulo) => ({
    rotulo,
    valor: "—",
    detalhe,
    realce: "transparent",
    aguardando: true,
  }));
}

const ROTULOS_B2B = ["Projetos B2B", "Prazos em aberto", "Valor total", "Valor aprovado", "Ticket médio", "Maior projeto"];
const ROTULOS_B2C = ["Portas", "Portas livres", "Ocupação", "Cobertura", "Equipamentos", "Em atendimento"];

export function desenharIndicadoresB2b(b2b) {
  if (!b2b) {
    escreverIndicadores("indicadoresB2b", indicadoresVazios(ROTULOS_B2B, "aguardando dados"));
    return;
  }

  const totalDeProjetos = Object.values(b2b.priority).reduce((soma, valor) => soma + valor, 0);
  const contagens = obterContagens(b2b, DIMENSOES.prazo);
  const destaques = destaquesFinanceiros(b2b);
  const itensEmAberto = obterItens(b2b, DIMENSOES.prazo).filter((item) => item.deadline !== "Concluido");
  const prazosEmAberto = (contagens.Urgente ?? 0) + (contagens.Atrasada ?? 0);

  escreverIndicadores("indicadoresB2b", [
    {
      rotulo: "Projetos B2B",
      valor: formatarNumero(totalDeProjetos),
      detalhe: `${formatarNumero(contagens.Concluido ?? 0)} concluídos`,
      realce: CORES.serie2,
    },
    {
      // Só os projetos com prazo cadastrado entram aqui: o resto da base vem da
      // API sem data nenhuma, e contá-los como concluídos seria inventar.
      rotulo: "Prazos em aberto",
      valor: formatarNumero(prazosEmAberto),
      detalhe: `${formatarNumero(contagens.Atrasada ?? 0)} atrasados · ${formatarNumero(contagens.Urgente ?? 0)} urgentes`,
      realce: prazosEmAberto > 0 ? CORES.statusAtencao : CORES.serie2,
      clicavel: itensEmAberto.length > 0,
      acao: "prazos-em-aberto",
    },
    {
      rotulo: "Valor total",
      valor: formatarMoedaCompacta(b2b.financial.total_value),
      detalhe: formatarMoeda(b2b.financial.total_value),
      realce: CORES.serie1,
    },
    {
      rotulo: "Valor aprovado",
      valor: formatarMoedaCompacta(b2b.financial.approved_value),
      detalhe: formatarMoeda(b2b.financial.approved_value),
      realce: CORES.serie1,
    },
    {
      rotulo: "Ticket médio",
      valor: formatarMoedaCompacta(b2b.financial.average_value),
      detalhe: formatarMoeda(b2b.financial.average_value),
      realce: CORES.serie1,
    },
    {
      rotulo: "Maior projeto",
      valor: formatarMoedaCompacta(b2b.financial.highest_value),
      // Com o cliente à mostra o cartão já responde "qual é" antes do clique.
      detalhe: destaques.length ? destaques[0].client : formatarMoeda(b2b.financial.highest_value),
      realce: CORES.serie1,
      clicavel: destaques.length > 0,
      acao: "maiores-projetos",
    },
  ]);

  ligarCliques("indicadoresB2b", {
    "prazos-em-aberto": () => abrirDetalhes("Prazos em aberto", itensEmAberto),
    "maiores-projetos": () => abrirDetalhes("Maiores projetos", destaques),
  });
}

// A API destaca o maior projeto e o maior já aprovado; juntos eles explicam a
// diferença entre "valor total" e "valor aprovado" nos cartões ao lado.
function destaquesFinanceiros(b2b) {
  const { highest_project: maior, highest_approved_project: maiorAprovado } = b2b.financial ?? {};

  return [
    maior && { ...maior, destaque: "Maior valor" },
    maiorAprovado && { ...maiorAprovado, destaque: "Maior aprovado" },
  ].filter(Boolean);
}

export function desenharIndicadoresB2c(viabilidade) {
  if (!viabilidade) {
    escreverIndicadores("indicadoresB2c", indicadoresVazios(ROTULOS_B2C, "aguardando relatório"));
    return;
  }

  const { totais, cidades, regioes } = viabilidade;
  const ocupacao = (totais.ocupadas / totais.portas) * 100;

  escreverIndicadores("indicadoresB2c", [
    {
      rotulo: "Portas",
      valor: formatarNumero(totais.portas),
      detalhe: `em ${formatarNumero(regioes.length)} regionais`,
      realce: CORES.serie1,
    },
    {
      rotulo: "Portas livres",
      valor: formatarNumero(totais.livres),
      detalhe: `${formatarPorcentagem((totais.livres / totais.portas) * 100)} do total`,
      realce: CORES.serie3,
    },
    {
      rotulo: "Ocupação",
      valor: formatarPorcentagem(ocupacao),
      detalhe: `${formatarNumero(totais.ocupadas)} portas ocupadas`,
      realce: CORES.serie3,
    },
    {
      rotulo: "Cobertura",
      valor: formatarNumero(cidades.length),
      detalhe: "cidades atendidas",
      realce: CORES.serie1,
    },
    {
      rotulo: "Equipamentos",
      valor: formatarNumero(totais.equipamentos),
      detalhe: `${formatarNumero(viabilidade.quantidadeDeCtos ?? 0)} CTOs`,
      realce: CORES.serie1,
    },
    {
      rotulo: "Em atendimento",
      valor: formatarNumero(totais.atendimentoCliente),
      detalhe: `${formatarNumero(totais.bloqueadas)} bloqueadas`,
      realce: CORES.serie2,
    },
  ]);
}

export function desenharPrazos(b2b) {
  const container = document.getElementById("prazos");

  if (!b2b) {
    container.innerHTML = "";
    return;
  }

  const contagens = obterContagens(b2b, DIMENSOES.prazo);
  const clicavel = temDetalhes(b2b, DIMENSOES.prazo);

  const prazos = [
    { tipo: "Concluido", cor: CORES.statusBom },
    { tipo: "Urgente", cor: CORES.statusAtencao },
    { tipo: "Atrasada", cor: CORES.statusCritico },
  ];

  container.innerHTML = prazos
    .map(({ tipo, cor }) => {
      const rotulo = ROTULOS_DE_PRAZO[tipo];
      const valor = formatarNumero(contagens[tipo] ?? 0);
      const atributos = clicavel
        ? `class="prazo clicavel" data-prazo="${tipo}" title="Ver os projetos"`
        : `class="prazo"`;

      return `<span ${atributos} style="--marcador: ${cor}"><strong>${valor}</strong> ${rotulo}</span>`;
    })
    .join("");

  if (!clicavel) return;

  container.querySelectorAll(".prazo").forEach((chip) => {
    const tipo = chip.dataset.prazo;
    chip.onclick = () => {
      const itens = obterItens(b2b, DIMENSOES.prazo).filter((item) => item.deadline === tipo);
      abrirDetalhes(`Projetos: ${ROTULOS_DE_PRAZO[tipo] ?? tipo}`, itens);
    };
  });
}
