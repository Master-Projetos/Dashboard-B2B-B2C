import { DIMENSOES, obterContagens, obterItens } from "./dados-b2b.js";

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

const chaveDoProjeto = (projeto) => [projeto.client, projeto.region, projeto.sector].join("|");

function mesmaLinha(um, outro) {
  return chaveDoProjeto(um) === chaveDoProjeto(outro);
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

// Valor e aprovação vêm em duas listas à parte (approved_projects e
// unapproved_projects), sem os campos das outras dimensões. A chave
// cliente/regional/setor é única nas duas, então dá para colar o valor no
// projeto já unido — e daí recompor o financeiro para o recorte.
function indexarValores(financeiro) {
  const porProjeto = new Map();

  const registrar = (lista, aprovado) => {
    for (const projeto of lista ?? []) {
      porProjeto.set(chaveDoProjeto(projeto), { valor: projeto.value, aprovado });
    }
  };

  registrar(financeiro?.approved_projects, true);
  registrar(financeiro?.unapproved_projects, false);

  return porProjeto;
}

const somarValores = (projetos) => projetos.reduce((soma, projeto) => soma + (projeto.value ?? 0), 0);
const maiorValor = (projetos) =>
  projetos.reduce((maior, projeto) => (!maior || projeto.value > maior.value ? projeto : maior), null);

// Nem todo projeto tem valor: são 120 de 188, e os 68 de fora não são zerados,
// é valor que não existe na API (10 de inviabilidade técnica, 24 de pendência
// comercial...). Contá-los como zero derrubaria o ticket médio de R$ 13,5 mil
// para R$ 8,6 mil. A média divide pelos projetos com valor acima de zero:
// projeto sem cobrança não é venda pequena, é venda nenhuma.
function recortarFinanceiro(financeiro, visiveis) {
  const valores = indexarValores(financeiro);

  const comValor = visiveis
    .map((projeto) => ({ ...projeto, ...valores.get(chaveDoProjeto(projeto)) }))
    .filter((projeto) => projeto.valor !== undefined)
    .map(({ valor, ...projeto }) => ({ ...projeto, value: valor }));

  const aprovados = comValor.filter((projeto) => projeto.aprovado);
  const cobrados = comValor.filter((projeto) => projeto.value > 0);
  const total = somarValores(comValor);

  return {
    ...financeiro,
    total_value: total,
    average_value: cobrados.length ? total / cobrados.length : 0,
    highest_value: maiorValor(comValor)?.value ?? 0,
    highest_project: maiorValor(comValor),
    approved_value: somarValores(aprovados),
    approved_projects: aprovados,
    highest_approved_project: maiorValor(aprovados),
  };
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

// Devolve um b2b com o mesmo formato, só que contado sobre o período — o bloco
// financeiro incluído.
export function aplicarPeriodo(b2b, periodo) {
  if (!b2b) return b2b;

  const projetos = unirProjetos(b2b);
  if (!projetos) return b2b;

  const visiveis = ehPeriodoVazio(periodo)
    ? projetos
    : projetos.filter((projeto) => dentroDoPeriodo(projeto, periodo));

  // O financeiro é recomposto mesmo sem recorte: ele é somado dos projetos, e
  // não copiado das contagens da API. Se só recompusesse ao filtrar, o ticket
  // médio mudaria de método conforme o filtro estivesse ligado ou não.
  const financial = recortarFinanceiro(b2b.financial, visiveis);

  // Sem recorte as contagens ficam como vieram da API, mas os itens vão unidos
  // do mesmo jeito: assim toda tabela de detalhe tem status, prazo e mês na
  // mesma linha, e a coluna de situação pode ser igual em todas.
  if (visiveis.length === projetos.length) {
    return {
      ...b2b,
      financial,
      status: { counts: obterContagens(b2b, DIMENSOES.status), items: visiveis },
      status_by_region: { counts: obterContagens(b2b, DIMENSOES.equipe), items: visiveis },
      projects_by_month: { counts: obterContagens(b2b, DIMENSOES.mes), items: visiveis },
      deadline: { counts: obterContagens(b2b, DIMENSOES.prazo), items: visiveis },
      priority_by_requester: { counts: obterContagens(b2b, DIMENSOES.prioridade), items: visiveis },
    };
  }

  return {
    ...b2b,
    financial,
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

// O painel abre nos últimos 12 meses: mais que isso e o gráfico de meses vira
// um amontoado. Para ver mais atrás, é só abrir o seletor — ele continua
// listando todos os meses que existem.
const MESES_POR_PADRAO = 12;

export function mesInicialPadrao(b2b) {
  const meses = mesesDisponiveis(b2b);
  if (!meses.length) return "";

  // Doze meses de calendário contados do mês mais recente, não doze meses
  // presentes na base — a base pode ter buracos.
  const [ano, mes] = meses[meses.length - 1].split("-").map(Number);
  const limite = new Date(Date.UTC(ano, mes - MESES_POR_PADRAO, 1)).toISOString().slice(0, 7);

  return meses.find((mesDisponivel) => mesDisponivel >= limite) ?? meses[0];
}
