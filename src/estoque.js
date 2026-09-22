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
  semMinimo: { rotulo: "Sem mínimo cadastrado", classe: "nivel-sem-minimo", ordem: 2 },
  ok: { rotulo: "Normal", classe: "nivel-normal", ordem: 3 },
};

// ===== Leitura do que a API manda =====
//
// A rota devolve uma linha por item e regional:
//   { site, code, description, unit, min_stock, safe_stock, balance, alert,
//     critical_alert, total }
//
// `alert` e `critical_alert` vêm nulos quando o item não tem mínimo
// cadastrado — aí não dá para dizer que está bem, só que não dá para julgar.
// Mínimo ZERO é diferente de mínimo ausente: o item tem parâmetro, ele é zero,
// e a API julga normalmente. Quem manda é o par de booleanos, não o mínimo.
// Esta é a única função que conhece esse formato; o resto da tela trabalha
// sobre { itens: [{ nome, codigo, unidade, porRegional: { SIGLA: {...} } }] }.

function nivelDaLinha(linha) {
  if (linha.critical_alert) return "critical";
  if (linha.alert) return "alert";
  if (linha.alert === null || linha.alert === undefined) return "semMinimo";
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
        // cinco. Se algum dia divergir, a coluna mostra o do primeiro e o
        // valor de cada regional continua na dica da célula.
        minimo: linha.min_stock ?? null,
        porRegional: {},
      });
    }

    porCodigo.get(codigo).porRegional[sigla] = {
      quantidade: Number(linha.balance ?? 0),
      minimo: linha.min_stock ?? null,
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
    semMinimo: contarNivel(niveis, "semMinimo"),
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

// Só alerta e crítico: "sem mínimo" é falta de cadastro, não falta de peça —
// aparece no cartão próprio, para não diluir a lista de quem precisa de ação.
export function itensParaAtencao(estoque) {
  const precisa = (item) => ["critical", "alert"].includes(piorNivelDoItem(item));
  return ordenarPorGravidade(estoque.itens.filter(precisa));
}

// ===== Desenho =====

function escapar(texto) {
  return String(texto ?? "—").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

function descreverCelula(dados, nome) {
  if (!dados) return `${nome}: sem dado`;

  const minimo = dados.minimo === null ? "sem mínimo" : `mínimo ${formatarNumero(dados.minimo)}`;
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

  const itens = itensParaAtencao(estoque);
  if (!itens.length) {
    alvo.innerHTML = `<p class="aviso">Nenhum item em alerta ou crítico</p>`;
    return;
  }

  const colunas = `<col class="coluna-unidade"><col class="coluna-item"><col class="coluna-minimo">${REGIONAIS.map(() => '<col class="coluna-regional">').join("")}`;
  const cabecalho = REGIONAIS.map(({ sigla, nome }) => `<th title="${escapar(nome)}">${sigla}</th>`).join("");

  const linhas = itens
    .map((item) => {
      const celulas = REGIONAIS.map(({ sigla, nome }) => {
        const dados = celula(item, sigla);
        const classe = dados ? NIVEIS[dados.nivel].classe : "nivel-sem-dado";
        const texto = dados ? formatarNumero(dados.quantidade) : "—";
        return `<td class="${classe}" title="${escapar(descreverCelula(dados, nome))}">${texto}</td>`;
      }).join("");

      const minimo = item.minimo === null ? "—" : formatarNumero(item.minimo);

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
