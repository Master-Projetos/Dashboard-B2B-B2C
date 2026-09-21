import snapshotDeB2b from "../dados/b2b.json" with { type: "json" };

const ENDERECO_DA_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";

// Rota rápida: consultada a cada request, sem cache. Se a API original falhar
// (inclusive por lentidão momentânea), devolvemos o último snapshot salvo —
// o painel nunca deve ficar sem dado por causa de uma falha passageira.
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const respostaDaApi = await fetch(`${ENDERECO_DA_API}/api/v2/b2b/dashboard`);
    if (!respostaDaApi.ok) throw new Error(`API respondeu ${respostaDaApi.status}`);

    const dados = await respostaDaApi.json();
    response.status(200).json({ ...dados, origem: "api", atualizadoEm: new Date().toISOString() });
  } catch (erro) {
    response.status(200).json({ ...snapshotDeB2b, origem: "snapshot" });
  }
}
