import snapshotDeReposicao from "../dados/reposicao.json" with { type: "json" };

const ENDERECO_DA_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";

// Calendário de reposição do estoque por região. Mesmo esquema das outras
// rotas: sem cache, e o último snapshot como rede de segurança.
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const respostaDaApi = await fetch(`${ENDERECO_DA_API}/api/v2/stock/restock-schedule`);
    if (!respostaDaApi.ok) throw new Error(`API respondeu ${respostaDaApi.status}`);

    const dados = await respostaDaApi.json();
    response.status(200).json({ ...dados, origem: "api", atualizadoEm: new Date().toISOString() });
  } catch (erro) {
    response.status(200).json({ ...snapshotDeReposicao, origem: "snapshot" });
  }
}
