import snapshotDeEstoque from "../dados/estoque.json" with { type: "json" };

const ENDERECO_DA_API = "https://george-ocon-leclerc-piastri.fastapicloud.dev";

// Rota rápida, igual à do B2B: consultada a cada request, sem cache, e com o
// último snapshot como rede de segurança se a origem falhar.
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const respostaDaApi = await fetch(`${ENDERECO_DA_API}/api/v2/stock/dashboard`);
    if (!respostaDaApi.ok) throw new Error(`API respondeu ${respostaDaApi.status}`);

    const dados = await respostaDaApi.json();
    response.status(200).json({ ...dados, origem: "api", atualizadoEm: new Date().toISOString() });
  } catch (erro) {
    response.status(200).json({ ...snapshotDeEstoque, origem: "snapshot" });
  }
}
