// A API devolve várias dimensões como { counts, items }: as contagens alimentam
// os gráficos e os itens são os projetos por trás de cada barra. Formatos
// antigos (só o mapa de contagens) ainda aparecem em snapshots salvos, então
// toda leitura do B2B passa por aqui.

export const DIMENSOES = {
  prazo: "deadline",
  status: "status",
  mes: "projects_by_month",
  equipe: "status_by_region",
};

export function obterContagens(b2b, dimensao) {
  const bloco = b2b?.[dimensao] ?? {};
  return bloco.counts ?? bloco;
}

export function obterItens(b2b, dimensao) {
  const itens = b2b?.[dimensao]?.items;
  return Array.isArray(itens) ? itens : [];
}

export function temDetalhes(b2b, dimensao) {
  return obterItens(b2b, dimensao).length > 0;
}

// remaining_days: 0 = vence hoje, positivo = dias restantes, negativo = atraso.
export function descreverPrazo(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return "—";
  if (diasRestantes === 0) return "vence hoje";
  if (diasRestantes < 0) return `${Math.abs(diasRestantes)} ${Math.abs(diasRestantes) === 1 ? "dia" : "dias"} em atraso`;
  return `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
}
