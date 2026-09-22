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

// O balde "Concluido" da API não quer dizer projeto entregue: é onde caem os
// projetos SEM prazo cadastrado — todos vêm com remaining_days nulo, e entre
// eles há "Aguardando BP", "Pendencia Comercial", "Cancelada". Por isso o
// painel os chama de "sem prazo". O mesmo vale para "Concluída"/"Em Andamento"
// em status_by_region, que é exatamente a mesma divisão.
export const ROTULOS_DE_PRAZO = {
  Concluido: "Sem prazo",
  Urgente: "Urgentes",
  Atrasada: "Atrasados",
};

export const ROTULOS_DE_EQUIPE = {
  "Concluída": "Sem prazo",
  "Em Andamento": "Prazo em aberto",
};

// remaining_days: 0 = vence hoje, positivo = dias restantes, negativo = atraso.
// Sem dia nenhum, a leitura do time é que o projeto está concluído — um traço
// deixaria quem não conhece a base sem saber se é isso ou se faltou dado.
export function descreverPrazo(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return "Concluído";
  if (diasRestantes === 0) return "vence hoje";
  if (diasRestantes < 0) return `${Math.abs(diasRestantes)} ${Math.abs(diasRestantes) === 1 ? "dia" : "dias"} em atraso`;
  return `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
}
