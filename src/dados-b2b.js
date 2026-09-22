// A API devolve várias dimensões como { counts, items }: as contagens alimentam
// os gráficos e os itens são os projetos por trás de cada barra. Formatos
// antigos (só o mapa de contagens) ainda aparecem em snapshots salvos, então
// toda leitura do B2B passa por aqui.

export const DIMENSOES = {
  prazo: "deadline",
  status: "status",
  mes: "projects_by_month",
  equipe: "status_by_region",
  prioridade: "priority_by_requester",
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

// Concluído quer dizer que a etapa de prazo fechou: o prazo é apagado e o
// projeto pode parar ali. Por isso o balde reúne 184 projetos com
// remaining_days nulo e status como "Aguardando BP" ou "Cancelada".
// "Concluída"/"Em Andamento" em status_by_region é a mesma divisão, por equipe.
export const ROTULOS_DE_PRAZO = {
  Concluido: "Concluídos",
  Urgente: "Urgentes",
  Atrasada: "Atrasados",
};

// A API manda doze status operacionais. No gráfico eles viram três situações,
// que é como se fala do projeto: ou está andando, ou entregou, ou morreu.
// "Ativado" é a entrega; inviabilidade técnica e BP não aprovado são fins de
// linha, então contam como cancelado. Status novo que a API inventar cai em
// "Em andamento": existe, não entregou e não morreu.
export const GRUPOS_DE_STATUS = [
  {
    id: "andamento",
    rotulo: "Em andamento",
    status: ["Aguardando BP", "Pendencia Comercial", "Estudo", "Estudo Técnico", "Vistoria", "Configuração", "Execução", "Estoque B2B"],
  },
  { id: "concluido", rotulo: "Concluído", status: ["Ativado"] },
  { id: "cancelado", rotulo: "Cancelado", status: ["Cancelada", "Inviabilidade Técnica", "BP - Não Aprovado"] },
];

export function grupoDoStatus(status) {
  return GRUPOS_DE_STATUS.find((grupo) => grupo.status.includes(status)) ?? GRUPOS_DE_STATUS[0];
}

export const ROTULOS_DE_EQUIPE = {
  "Concluída": "Concluídas",
  "Em Andamento": "Em andamento",
};

// remaining_days: 0 = vence hoje, positivo = dias restantes, negativo = atraso.
// Sem dia nenhum, está concluído — um traço deixaria quem não conhece a base
// sem saber se é isso ou se faltou dado.
export function descreverPrazo(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return "Concluído";
  if (diasRestantes === 0) return "vence hoje";
  if (diasRestantes < 0) return `${Math.abs(diasRestantes)} ${Math.abs(diasRestantes) === 1 ? "dia" : "dias"} em atraso`;
  return `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
}
