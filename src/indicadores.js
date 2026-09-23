import { CORES, corDe } from "./tema.js";
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

const ROTULOS_B2B = ["Projetos B2B", "Prazos em aberto", "Valor total não aprovado", "Valor total aprovado", "Ticket médio", "Maior projeto"];
const ROTULOS_B2C = ["Portas", "Portas livres", "Ocupação", "Cobertura", "Equipamentos", "Em atendimento"];

export function desenharIndicadoresB2b(b2b) {
  if (!b2b) {
    escreverIndicadores("indicadoresB2b", indicadoresVazios(ROTULOS_B2B, "aguardando dados"));
    return;
  }

  const totalDeProjetos = Object.values(b2b.priority).reduce((soma, valor) => soma + valor, 0);
  const contagens = obterContagens(b2b, DIMENSOES.prazo);
  const itensEmAberto = obterItens(b2b, DIMENSOES.prazo).filter((item) => item.deadline !== "Concluido");
  const aprovados = b2b.financial?.approved_projects ?? [];
  const destaques = destaquesFinanceiros(b2b);
  const maiorAprovado = b2b.financial?.highest_approved_project ?? null;
  const temValores = (b2b.financial?.total_value ?? 0) > 0;
  const valorNaoAprovado = (b2b.financial?.total_value ?? 0) - (b2b.financial?.approved_value ?? 0);
  // Tudo que não é Concluido está em aberto, inclusive um tipo novo da API.
  const prazosEmAberto = Object.entries(contagens)
    .filter(([tipo]) => tipo !== "Concluido")
    .reduce((soma, [, quantidade]) => soma + quantidade, 0);

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
      // O total geral é aprovado + não aprovado; fica no detalhe para não se perder.
      rotulo: "Valor total não aprovado",
      valor: temValores ? formatarMoedaCompacta(valorNaoAprovado) : "—",
      detalhe: temValores
        ? `${formatarMoeda(valorNaoAprovado)} · total geral ${formatarMoedaCompacta(b2b.financial.total_value)}`
        : "nenhum projeto com valor no período",
      realce: CORES.serie1,
    },
    {
      rotulo: "Valor total aprovado",
      // "R$ 0" parece um total apurado; o traço deixa claro que não houve.
      valor: aprovados.length ? formatarMoedaCompacta(b2b.financial.approved_value) : "—",
      // A lista soma exatamente o approved_value, então a contagem cabe aqui
      // sem tirar o valor exato de vista.
      detalhe: aprovados.length
        ? `${formatarNumero(aprovados.length)} projetos · ${formatarMoeda(b2b.financial.approved_value)}`
        : "nenhum aprovado no período",
      realce: CORES.serie1,
      clicavel: aprovados.length > 0,
      acao: "projetos-aprovados",
    },
    {
      rotulo: "Ticket médio",
      valor: temValores ? formatarMoedaCompacta(b2b.financial.average_value) : "—",
      detalhe: temValores ? formatarMoeda(b2b.financial.average_value) : "sem base para a média",
      realce: CORES.serie1,
    },
    {
      // O número em destaque é o do maior projeto APROVADO — dinheiro que
      // entrou. O maior proposto sai no clique, para não confundir proposta
      // com fechamento.
      rotulo: "Maior projeto",
      valor: maiorAprovado ? formatarMoedaCompacta(maiorAprovado.value) : "—",
      // "aprovado" vem antes do cliente porque nome de cliente é longo e o
      // fim da linha é cortado.
      detalhe: maiorAprovado ? `aprovado · ${maiorAprovado.client}` : "nenhum aprovado no período",
      realce: CORES.serie1,
      clicavel: destaques.length > 0,
      acao: "maiores-projetos",
    },
  ]);

  ligarCliques("indicadoresB2b", {
    "prazos-em-aberto": () => abrirDetalhes("Prazos em aberto", itensEmAberto),
    "projetos-aprovados": () => abrirDetalhes("Projetos aprovados", aprovados),
    "maiores-projetos": () => abrirDetalhes("Maiores projetos", destaques),
  });
}

const mesmoProjeto = (um, outro) =>
  um && outro && um.client === outro.client && um.region === outro.region && um.sector === outro.sector;

// O aprovado primeiro, porque é o número do cartão. O proposto só entra quando
// é outro projeto — quando o maior de todos já foi aprovado, repeti-lo seria
// mostrar a mesma linha duas vezes.
function destaquesFinanceiros(b2b) {
  const { highest_project: proposto, highest_approved_project: aprovado } = b2b.financial ?? {};

  return [
    aprovado && { ...aprovado, destaque: "Aprovado" },
    !mesmoProjeto(proposto, aprovado) && proposto && { ...proposto, destaque: "Proposto, não aprovado" },
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
    // Mesmo verde da barra "Concluído" ao lado: dois verdes diferentes para a
    // mesma coisa, na mesma tela, pareceria erro.
    // Nome da paleta (tema.js) ou hex direto, como "#fab219".
    { tipo: "Concluido", cor: "serie3" },
    { tipo: "Urgente", cor: "statusAtencao" },
    { tipo: "Atrasada", cor: "serie2" },
  ];
  // Tipo de prazo novo vira chip com o nome que veio.
  for (const tipo of Object.keys(contagens)) {
    if (!prazos.some((prazo) => prazo.tipo === tipo)) prazos.push({ tipo, cor: "serie1" });
  }

  container.innerHTML = prazos
    .map(({ tipo, cor }) => {
      const rotulo = ROTULOS_DE_PRAZO[tipo] ?? tipo;
      const valor = formatarNumero(contagens[tipo] ?? 0);
      const atributos = clicavel
        ? `class="prazo clicavel" data-prazo="${tipo}" title="Ver os projetos"`
        : `class="prazo"`;

      return `<span ${atributos} style="--marcador: ${corDe(cor)}"><strong>${valor}</strong> ${rotulo}</span>`;
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
