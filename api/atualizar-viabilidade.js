import { ehDiaDeRegenerar } from "../lib/ciclo-de-atualizacao.js";

const ENDERECO_DA_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";
const NOME_DO_RELATORIO = "viabilidade";

// Chamada pelo cron da Vercel à meia-noite de Brasília. Como a geração apaga o
// relatório atual por alguns minutos, ela acontece só aqui — nunca no caminho
// de leitura do painel.
export default async function handler(request, response) {
  const agora = new Date();

  if (!ehDiaDeRegenerar(agora)) {
    response.status(200).json({ status: "ignorado", motivo: "fora do ciclo de 48h" });
    return;
  }

  const respostaDaApi = await fetch(`${ENDERECO_DA_API}/api/v1/${NOME_DO_RELATORIO}`, { method: "POST" });

  response.status(respostaDaApi.ok ? 200 : 502).json({
    status: respostaDaApi.ok ? "geracao solicitada" : "falha ao solicitar geracao",
    executadoEm: agora.toISOString(),
  });
}
