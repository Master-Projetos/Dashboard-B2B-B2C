import { calcularProximaAtualizacao } from "../lib/ciclo-de-atualizacao.js";
import snapshotDeViabilidade from "../dados/viabilidade.json" with { type: "json" };

const ENDERECO_DA_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";
const NOME_DO_RELATORIO = "viabilidade";

// Os totais de "Portas" da API consideram apenas CTOs (conferido contra
// estatisticas_regiao), então a soma por cidade segue o mesmo critério.
function somarPortasPorCidade(agrupamentoPorRegiao) {
  const portasPorCidade = new Map();

  for (const [regiao, cidades] of Object.entries(agrupamentoPorRegiao)) {
    for (const [cidade, registros] of Object.entries(cidades)) {
      const chave = `${regiao}|${cidade}`;
      const atual = portasPorCidade.get(chave) ?? { cidade, regiao, portas: 0, ocupadas: 0, equipamentos: 0 };

      for (const registro of registros) {
        atual.portas += registro["Quantidade portas"] ?? 0;
        atual.ocupadas += registro["Portas ocupadas"] ?? 0;
        atual.equipamentos += registro["Quantidade equip."] ?? 0;
      }

      portasPorCidade.set(chave, atual);
    }
  }

  return portasPorCidade;
}

function contarRegistros(agrupamentoPorRegiao) {
  return Object.values(agrupamentoPorRegiao)
    .flatMap((cidades) => Object.values(cidades))
    .reduce((total, registros) => total + registros.length, 0);
}

// O retorno bruto da API tem ~6,5 MB (milhares de CTOs/CEOs). O painel só precisa
// dos totais, então resumimos aqui e mandamos poucos KB para o navegador.
function resumirViabilidade(dados) {
  const portasPorCidade = somarPortasPorCidade(dados.ctos);

  const regioes = Object.entries(dados.estatisticas_regiao).map(([nome, estatisticas]) => ({
    nome,
    equipamentos: estatisticas["Equipamentos"],
    portas: estatisticas["Portas"],
    ocupadas: estatisticas["Portas ocupadas"],
    livres: estatisticas["Portas livres"],
    bloqueadas: estatisticas["Portas bloqueadas"],
    atendimentoCliente: estatisticas["Portas atendimento cliente"],
  }));

  return {
    totais: {
      equipamentos: dados.estatisticas["Equipamentos"],
      portas: dados.estatisticas["Portas"],
      ocupadas: dados.estatisticas["Portas ocupadas"],
      livres: dados.estatisticas["Portas livres"],
      bloqueadas: dados.estatisticas["Portas bloqueadas"],
      atendimentoCliente: dados.estatisticas["Portas atendimento cliente"],
    },
    regioes: regioes.sort((a, b) => b.portas - a.portas),
    cidades: [...portasPorCidade.values()].sort((a, b) => b.portas - a.portas),
    quantidadeDeCtos: contarRegistros(dados.ctos),
    quantidadeDeCeos: contarRegistros(dados.ceos),
  };
}

// Busca o relatório na API original. Devolve null tanto para erro HTTP quanto
// para falha de rede — nos dois casos o painel deve cair no snapshot.
async function buscarRelatorio() {
  try {
    const respostaDaApi = await fetch(`${ENDERECO_DA_API}/api/v1/viability`);
    if (!respostaDaApi.ok) return null;
    return await respostaDaApi.json();
  } catch (erro) {
    return null;
  }
}

export default async function handler(request, response) {
  const agora = new Date();
  const dados = await buscarRelatorio();

  // Sem relatório disponível (geração em andamento, que leva ~3 min, ou origem
  // fora do ar): pede a geração e devolve o último snapshot salvo. O painel
  // nunca fica sem dado — no máximo mostra um dado mais antigo, sinalizado.
  if (!dados) {
    await fetch(`${ENDERECO_DA_API}/api/v1/${NOME_DO_RELATORIO}`, { method: "POST" }).catch(() => {});

    response.setHeader("Cache-Control", "s-maxage=60");
    response.status(200).json({
      ...snapshotDeViabilidade,
      origem: "snapshot",
      proximaAtualizacao: calcularProximaAtualizacao(agora).toISOString(),
    });
    return;
  }

  const proximaAtualizacao = calcularProximaAtualizacao(agora);
  const segundosDeCache = Math.floor((proximaAtualizacao.getTime() - agora.getTime()) / 1000);

  response.setHeader("Cache-Control", `s-maxage=${segundosDeCache}, stale-while-revalidate=86400`);
  response.status(200).json({
    ...resumirViabilidade(dados),
    origem: "api",
    atualizadoEm: agora.toISOString(),
    proximaAtualizacao: proximaAtualizacao.toISOString(),
  });
}
