import { CORES } from "./tema.js";
import { formatarNumero } from "./formatadores.js";

// As cinco regionais aparecem sempre, na mesma ordem e sempre todas: os itens
// se repetem nas cinco, então uma coluna vazia é informação (falta ali), não
// motivo para sumir com a coluna.
export const REGIONAIS = [
  { sigla: "CD", nome: "Divinópolis" },
  { sigla: "LAV", nome: "Lavras" },
  { sigla: "TAU", nome: "Taubaté" },
  { sigla: "UNA", nome: "Unaí" },
  { sigla: "MOC", nome: "Montes Claros" },
];

const NIVEIS = {
  critical: { rotulo: "Crítico", classe: "nivel-critico", ordem: 0 },
  alert: { rotulo: "Alerta", classe: "nivel-alerta", ordem: 1 },
  ok: { rotulo: "Normal", classe: "nivel-normal", ordem: 2 },
};

// ===== Leitura do que a API manda =====
//
// A rota devolve uma linha por item e regional:
//   { site, code, description, unit, min_stock, safe_stock, balance, alert,
//     critical_alert, total }
//
// `alert` e `critical_alert` vêm nulos quando o item não tem mínimo cadastrado.
// Nesse caso o mínimo vale zero, e qualquer saldo o atende: a linha é normal.
// O que falta segue dito na dica da célula, para ninguém achar que o item foi
// conferido quando na verdade não há parâmetro.
// Esta é a única função que conhece esse formato; o resto da tela trabalha
// sobre { itens: [{ nome, codigo, unidade, porRegional: { SIGLA: {...} } }] }.

function nivelDaLinha(linha) {
  if (linha.critical_alert) return "critical";
  if (linha.alert) return "alert";
  return "ok";
}

// A API manda a sigla ("CD"), mas o mapa dela parte dos nomes sem acento
// ("DIVINOPOLIS", "TAUBATE", "UNAI"). Comparar sem acento aceita os dois sem
// depender de qual lado chegar.
const semAcento = (texto) =>
  String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

function encontrarSigla(chave) {
  const texto = semAcento(chave);
  return REGIONAIS.find(
    (regional) => regional.sigla === texto || semAcento(regional.nome) === texto,
  )?.sigla;
}

export function normalizarEstoque(bruto) {
  const linhas = bruto?.items ?? [];
  const porCodigo = new Map();

  for (const linha of linhas) {
    const sigla = encontrarSigla(linha.site);
    if (!sigla) continue;

    const codigo = String(linha.code ?? linha.description ?? "");
    if (!porCodigo.has(codigo)) {
      porCodigo.set(codigo, {
        codigo,
        nome: linha.description ?? codigo,
        unidade: linha.unit ?? "",
        // O mínimo é do item, não da regional: nos 31 itens ele vem igual nas
        // cinco. Sem mínimo cadastrado, vale zero.
        minimo: linha.min_stock ?? 0,
        minimoCadastrado: linha.min_stock !== null && linha.min_stock !== undefined,
        porRegional: {},
      });
    }

    porCodigo.get(codigo).porRegional[sigla] = {
      quantidade: Number(linha.balance ?? 0),
      minimo: linha.min_stock ?? 0,
      minimoCadastrado: linha.min_stock !== null && linha.min_stock !== undefined,
      seguro: linha.safe_stock ?? null,
      nivel: nivelDaLinha(linha),
    };
  }

  const regionaisComDados = REGIONAIS.filter(({ sigla }) =>
    [...porCodigo.values()].some((item) => item.porRegional[sigla]),
  );

  return { itens: [...porCodigo.values()], regionaisComDados };
}

// ===== Contas da tela =====

// Célula ausente é regional sem dado para o item — não é "normal", e não pode
// entrar em contagem nenhuma.
function celula(item, sigla) {
  return item.porRegional[sigla] ?? null;
}

function niveisDoItem(item) {
  return REGIONAIS.map(({ sigla }) => celula(item, sigla)?.nivel).filter(Boolean);
}

function piorNivelDoItem(item) {
  return niveisDoItem(item).sort((um, outro) => NIVEIS[um].ordem - NIVEIS[outro].ordem)[0] ?? "ok";
}

const contarNivel = (niveis, alvo) => niveis.filter((nivel) => nivel === alvo).length;

export function contarNiveis(estoque) {
  const niveis = estoque.itens.flatMap(niveisDoItem);

  return {
    critical: contarNivel(niveis, "critical"),
    alert: contarNivel(niveis, "alert"),
    ok: contarNivel(niveis, "ok"),
  };
}

export function contarPorRegional(estoque) {
  return REGIONAIS.map(({ sigla, nome }) => {
    const niveis = estoque.itens.map((item) => celula(item, sigla)?.nivel).filter(Boolean);

    return {
      sigla,
      nome,
      criticos: contarNivel(niveis, "critical"),
      alertas: contarNivel(niveis, "alert"),
    };
  });
}

// Crítico primeiro, depois alerta; dentro do mesmo nível, quem tem mais
// regionais afetadas vem antes.
function ordenarPorGravidade(itens) {
  const peso = (item) => {
    const niveis = niveisDoItem(item);
    return {
      pior: NIVEIS[piorNivelDoItem(item)].ordem,
      criticos: contarNivel(niveis, "critical"),
      alertas: contarNivel(niveis, "alert"),
    };
  };

  return [...itens].sort((um, outro) => {
    const a = peso(um);
    const b = peso(outro);
    return a.pior - b.pior || b.criticos - a.criticos || b.alertas - a.alertas || um.nome.localeCompare(outro.nome);
  });
}

// Quantos itens precisam de ação — é o número do cartão, não o que a tabela
// mostra: a tabela lista todos, e são estes que ela põe no topo.
export function itensParaAtencao(estoque) {
  const precisa = (item) => ["critical", "alert"].includes(piorNivelDoItem(item));
  return estoque.itens.filter(precisa);
}

// A tabela mostra o estoque inteiro, do mais grave ao normal. Esconder o que
// está em ordem economizava três linhas e fazia a lista não bater com os 31
// itens monitorados.
export function itensOrdenados(estoque) {
  return ordenarPorGravidade(estoque.itens);
}

// ===== Desenho =====

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

function descreverCelula(dados, nome) {
  if (!dados) return `${nome} — regional não informada pela API`;

  const minimo = dados.minimoCadastrado ? `mínimo ${formatarNumero(dados.minimo)}` : "sem mínimo cadastrado";
  const seguro = dados.seguro === null ? "" : ` · seguro ${formatarNumero(dados.seguro)}`;
  return `${nome} — ${NIVEIS[dados.nivel].rotulo}
saldo ${formatarNumero(dados.quantidade)} · ${minimo}${seguro}`;
}

export function desenharTabelaDeEstoque(estoque) {
  const alvo = document.getElementById("tabelaDeEstoque");

  if (!estoque.itens.length) {
    alvo.innerHTML = `<p class="aviso">Estoque ainda não publicado pela API</p>`;
    return;
  }

  const itens = itensOrdenados(estoque);

  const colunas = `<col class="coluna-unidade"><col class="coluna-item"><col class="coluna-minimo">${REGIONAIS.map(() => '<col class="coluna-regional">').join("")}`;
  const cabecalho = REGIONAIS.map(({ sigla, nome }) => `<th title="${escapar(nome)}">${sigla}</th>`).join("");

  const linhas = itens
    .map((item) => {
      const celulas = REGIONAIS.map(({ sigla, nome }) => {
        const dados = celula(item, sigla);
        // Regional que a API não devolveu conta como zero — é o que ela
        // significa no estoque, e um traço só faria a coluna parecer quebrada.
        const classe = dados ? NIVEIS[dados.nivel].classe : "nivel-normal";
        const texto = formatarNumero(dados?.quantidade ?? 0);
        return `<td class="${classe}" title="${escapar(descreverCelula(dados, nome))}">${texto}</td>`;
      }).join("");

      const minimo = formatarNumero(item.minimo);

      return `
        <tr>
          <td class="coluna-da-unidade" title="Unidade de medida">${escapar(item.unidade || "—")}</td>
          <th scope="row" title="${escapar(`${item.codigo} · ${item.nome}`)}">${escapar(item.nome)}</th>
          <td class="coluna-do-minimo" title="Estoque mínimo">${minimo}</td>
          ${celulas}
        </tr>
      `;
    })
    .join("");

  alvo.innerHTML = `
    <table class="grade-de-estoque">
      <colgroup>${colunas}</colgroup>
      <thead>
        <tr>
          <th scope="col" title="Unidade de medida">Un.</th>
          <th scope="col">Item</th>
          <th scope="col" title="Estoque mínimo">Mín.</th>
          ${cabecalho}
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

// Azul para o que é só contagem, amarelo/laranja/vermelho conforme a gravidade.
// Verde fica reservado à tela B2C.
export function desenharIndicadoresDeEstoque(estoque) {
  const contagem = contarNiveis(estoque);
  const porRegional = contarPorRegional(estoque);
  const pior = [...porRegional].sort((um, outro) => outro.criticos - um.criticos || outro.alertas - um.alertas)[0];
  const temAlerta = pior && (pior.criticos || pior.alertas);
  const vazio = estoque.itens.length === 0;
  const comDados = estoque.regionaisComDados ?? [];

  const cartoes = [
    {
      rotulo: "Críticos",
      valor: contagem.critical,
      detalhe: "item · regional em falta",
      realce: CORES.statusCritico,
    },
    {
      rotulo: "Em alerta",
      valor: contagem.alert,
      detalhe: "item · regional no limite",
      realce: CORES.statusAtencao,
    },
    {
      rotulo: "Itens afetados",
      valor: itensParaAtencao(estoque).length,
      detalhe: `de ${formatarNumero(estoque.itens.length)} monitorados`,
      realce: CORES.serie2,
    },
    {
      rotulo: "Normais",
      valor: contagem.ok,
      detalhe: "item · regional com folga",
      realce: CORES.serie1,
    },
    {
      rotulo: "Regional mais crítica",
      valor: temAlerta ? pior.sigla : "—",
      // Enquanto só uma regional manda dado, dizer isso é mais honesto do que
      // apontar a "pior" de uma comparação que não existe.
      detalhe: comDados.length < 2
        ? `${comDados.length ? comDados[0].nome : "nenhuma regional"} · única com dados`
        : temAlerta ? `${pior.nome} · ${formatarNumero(pior.criticos)} críticos` : "nenhuma em falta",
      realce: CORES.statusCritico,
      texto: true,
    },
  ];

  document.getElementById("indicadoresEstoque").innerHTML = cartoes
    .map(({ rotulo, valor, detalhe, realce, texto }) => `
      <div class="indicador${vazio ? " aguardando" : ""}" style="--realce: ${realce}">
        <div class="rotulo">${rotulo}</div>
        <div class="valor">${vazio ? "—" : texto ? escapar(valor) : formatarNumero(valor)}</div>
        <div class="detalhe">${vazio ? "aguardando a rota de estoque" : escapar(detalhe)}</div>
      </div>
    `)
    .join("");
}
