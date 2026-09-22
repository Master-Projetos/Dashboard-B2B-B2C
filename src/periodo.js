import { DIMENSOES, obterItens } from "./dados-b2b.js";

// Filtro de período do B2B.
//
// A API manda as mesmas 188 linhas em cinco listas, cada uma com um campo a
// mais (status, mês, equipe...). Unindo por índice sai um projeto só, com tudo
// junto, e daí as contagens são refeitas para o período escolhido — os gráficos
// e os cartões continuam recebendo o mesmo formato de sempre.

const LISTAS = [DIMENSOES.status, DIMENSOES.equipe, DIMENSOES.mes, DIMENSOES.prazo, DIMENSOES.prioridade];

// Ainda não existe data por projeto: o que a API manda é o mês
// (projects_by_month). Quando a data chegar, ela entra nesta lista e o filtro
// passa a valer por dia sem mais nada mudar.
const CAMPOS_DE_DATA = ["date", "created_at", "opened_at", "start_date", "data"];

function mesmaLinha(um, outro) {
  return um.client === outro.client && um.region === outro.region && um.sector === outro.sector;
}

// Só une se as listas realmente casarem linha a linha. Se a API mudar a ordem
// ou o tamanho de alguma, é melhor não filtrar do que mostrar número errado.
export function unirProjetos(b2b) {
  const listas = LISTAS.map((dimensao) => obterItens(b2b, dimensao));
  const [base] = listas;

  if (!base.length) return null;
  if (listas.some((lista) => lista.length !== base.length)) return null;

  const projetos = [];

  for (let linha = 0; linha < base.length; linha += 1) {
    const partes = listas.map((lista) => lista[linha]);
    if (partes.some((parte) => !mesmaLinha(parte, base[linha]))) return null;

    // O `status` de status_by_region é o par Concluída/Em Andamento, não o
    // status real do projeto — por isso entra com outro nome.
    const [porStatus, porEquipe, porMes, porPrazo, porPrioridade] = partes;
    projetos.push({
      ...porPrazo,
      ...porPrioridade,
      status: porStatus.status,
      grupoDaEquipe: porEquipe.status,
      month: porMes.month,
    });
  }

  return projetos;
}

// Um projeto com data cheia ocupa um dia; um que só tem mês ocupa o mês todo.
// Comparação é de texto (AAAA-MM-DD ordena sozinho), e o dia 31 serve de teto
// mesmo em meses mais curtos.
function intervaloDoProjeto(projeto) {
  for (const campo of CAMPOS_DE_DATA) {
    const valor = projeto[campo];
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
      const dia = valor.slice(0, 10);
      return { inicio: dia, fim: dia };
    }
  }

  if (/^\d{4}-\d{2}$/.test(projeto.month ?? "")) {
    return { inicio: `${projeto.month}-01`, fim: `${projeto.month}-31` };
  }

  return null;
}

function dentroDoPeriodo(projeto, { inicio, fim }) {
  const intervalo = intervaloDoProjeto(projeto);
  if (!intervalo) return false; // sem data, fica de fora de qualquer recorte

  if (inicio && intervalo.fim < inicio) return false;
  if (fim && intervalo.inicio > fim) return false;
  return true;
}

function contar(projetos, ler) {
  const contagem = {};

  for (const projeto of projetos) {
    const chave = ler(projeto);
    if (chave != null) contagem[chave] = (contagem[chave] ?? 0) + 1;
  }

  return contagem;
}

function contarCruzado(projetos, lerGrupo, lerChave) {
  const contagem = {};

  for (const projeto of projetos) {
    const grupo = lerGrupo(projeto);
    const chave = lerChave(projeto);
    if (grupo == null || chave == null) continue;

    contagem[grupo] ??= {};
    contagem[grupo][chave] = (contagem[grupo][chave] ?? 0) + 1;
  }

  return contagem;
}

export function ehPeriodoVazio(periodo) {
  return !periodo?.inicio && !periodo?.fim;
}

// Devolve um b2b com o mesmo formato, só que contado sobre o período. O bloco
// financeiro fica como veio: a API só manda valor por projeto nos aprovados, e
// nenhum deles traz data, então não há como recompor total nem ticket médio.
export function aplicarPeriodo(b2b, periodo) {
  if (!b2b || ehPeriodoVazio(periodo)) return b2b;

  const projetos = unirProjetos(b2b);
  if (!projetos) return b2b;

  const visiveis = projetos.filter((projeto) => dentroDoPeriodo(projeto, periodo));

  return {
    ...b2b,
    priority: contar(visiveis, (projeto) => projeto.priority),
    status: { counts: contar(visiveis, (projeto) => projeto.status), items: visiveis },
    status_by_region: {
      counts: contarCruzado(visiveis, (projeto) => projeto.grupoDaEquipe, (projeto) => projeto.region),
      items: visiveis,
    },
    projects_by_month: { counts: contar(visiveis, (projeto) => projeto.month), items: visiveis },
    deadline: { counts: contar(visiveis, (projeto) => projeto.deadline), items: visiveis },
    priority_by_requester: {
      counts: contarCruzado(visiveis, (projeto) => projeto.priority, (projeto) => projeto.requester),
      items: visiveis,
    },
    financeiroNaoFiltrado: true,
  };
}

export function ultimoDiaDoMes(mes) {
  const [ano, numeroDoMes] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, numeroDoMes, 0)).toISOString().slice(0, 10);
}

// O seletor lista só os meses que têm projeto: assim não dá para escolher um
// recorte vazio sem querer.
export function mesesDisponiveis(b2b) {
  const meses = obterItens(b2b, DIMENSOES.mes)
    .map((projeto) => projeto.month)
    .filter((mes) => /^\d{4}-\d{2}$/.test(mes ?? ""));

  return [...new Set(meses)].sort();
}
