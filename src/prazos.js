// A API passou a devolver `deadline` como { counts, items } — antes era só um
// mapa de contagens. O snapshot de reserva pode estar em qualquer um dos dois
// formatos, então tudo que lê prazos passa por aqui.

export const TIPOS_DE_PRAZO = ["Concluido", "Urgente", "Atrasada"];

export function obterContagensDePrazo(b2b) {
  const prazo = b2b?.deadline ?? {};
  return prazo.counts ?? prazo;
}

export function obterItensDePrazo(b2b, tipo) {
  const itens = b2b?.deadline?.items ?? [];
  return itens.filter((item) => item.deadline === tipo);
}

export function temDetalhesDePrazo(b2b) {
  return Array.isArray(b2b?.deadline?.items) && b2b.deadline.items.length > 0;
}

// remaining_days: 0 = vence hoje, positivo = dias restantes, negativo = atraso.
export function descreverPrazo(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return "—";
  if (diasRestantes === 0) return "vence hoje";
  if (diasRestantes < 0) return `${Math.abs(diasRestantes)} ${Math.abs(diasRestantes) === 1 ? "dia" : "dias"} em atraso`;
  return `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
}
