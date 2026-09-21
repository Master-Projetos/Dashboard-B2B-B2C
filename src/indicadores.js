import { CORES } from "./tema.js";
import { formatarNumero, formatarMoeda, formatarMoedaCompacta, formatarPorcentagem } from "./formatadores.js";
import { obterContagensDePrazo, temDetalhesDePrazo } from "./prazos.js";
import { abrirDetalhesDePrazo } from "./detalhes-de-prazo.js";

function montarIndicador({ rotulo, valor, detalhe, realce, aguardando }) {
  return `
    <div class="indicador${aguardando ? " aguardando" : ""}" style="--realce: ${realce}">
      <div class="rotulo">${rotulo}</div>
      <div class="valor">${valor}</div>
      <div class="detalhe">${detalhe}</div>
    </div>
  `;
}

// Sem os dados de viabilidade os quatro primeiros cartões viram espaço
// reservado: a grade de 6 colunas continua igual, sem esticar os outros.
function indicadoresDeViabilidadeVazios() {
  return ["Portas", "Portas livres", "Ocupação", "Cobertura"].map((rotulo) => ({
    rotulo,
    valor: "—",
    detalhe: "aguardando relatório",
    realce: "transparent",
    aguardando: true,
  }));
}

export function desenharIndicadores(b2b, viabilidade) {
  const indicadores = [];

  if (!viabilidade) {
    indicadores.push(...indicadoresDeViabilidadeVazios());
  }

  if (viabilidade) {
    const { totais, cidades, regioes } = viabilidade;
    const ocupacao = (totais.ocupadas / totais.portas) * 100;

    indicadores.push(
      {
        rotulo: "Portas",
        valor: formatarNumero(totais.portas),
        detalhe: `${formatarNumero(totais.equipamentos)} equipamentos`,
        realce: CORES.serie1,
      },
      {
        rotulo: "Portas livres",
        valor: formatarNumero(totais.livres),
        detalhe: `${formatarNumero(totais.atendimentoCliente)} em atendimento`,
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
        detalhe: `cidades em ${regioes.length} regionais`,
        realce: CORES.serie1,
      },
    );
  }

  if (!b2b) {
    indicadores.push(
      { rotulo: "Projetos B2B", valor: "—", detalhe: "aguardando dados", realce: "transparent", aguardando: true },
      { rotulo: "Valor total", valor: "—", detalhe: "aguardando dados", realce: "transparent", aguardando: true },
    );
  }

  if (b2b) {
    const totalDeProjetos = Object.values(b2b.priority).reduce((soma, valor) => soma + valor, 0);

    indicadores.push(
      {
        rotulo: "Projetos B2B",
        valor: formatarNumero(totalDeProjetos),
        detalhe: `${formatarNumero(obterContagensDePrazo(b2b).Concluido ?? 0)} concluídos`,
        realce: CORES.serie2,
      },
      {
        rotulo: "Valor total",
        valor: formatarMoedaCompacta(b2b.financial.total_value),
        detalhe: formatarMoeda(b2b.financial.total_value),
        realce: CORES.serie2,
      },
    );
  }

  document.getElementById("indicadores").innerHTML = indicadores.map(montarIndicador).join("");
}

export function desenharPrazos(b2b) {
  const contagens = obterContagensDePrazo(b2b);
  const clicavel = temDetalhesDePrazo(b2b);

  const prazos = [
    { tipo: "Concluido", rotulo: "Concluídos", cor: CORES.statusBom },
    { tipo: "Urgente", rotulo: "Urgentes", cor: CORES.statusAtencao },
    { tipo: "Atrasada", rotulo: "Atrasados", cor: CORES.statusCritico },
  ];

  const container = document.getElementById("prazos");

  container.innerHTML = prazos
    .map(({ tipo, rotulo, cor }) => {
      const valor = formatarNumero(contagens[tipo] ?? 0);
      const atributos = clicavel
        ? `class="prazo clicavel" data-prazo="${tipo}" title="Ver os projetos"`
        : `class="prazo"`;

      return `<span ${atributos} style="--marcador: ${cor}"><strong>${valor}</strong> ${rotulo}</span>`;
    })
    .join("");

  if (!clicavel) return;

  container.querySelectorAll(".prazo").forEach((chip) => {
    chip.onclick = () => abrirDetalhesDePrazo(b2b, chip.dataset.prazo);
  });
}
