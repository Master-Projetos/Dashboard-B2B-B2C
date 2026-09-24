import { CORES } from "./tema.js";
import { formatarNumero } from "./formatadores.js";
import { abrirConteudo } from "./detalhes.js";

// As cinco regionais aparecem sempre, na mesma ordem e sempre todas: os itens
// se repetem nas cinco, então uma coluna vazia é informação (falta ali), não
// motivo para sumir com a coluna.
export const REGIONAIS = [
  { sigla: "CD", nome: "Divinópolis" },
  { sigla: "LAV", nome: "Lavras" },
  { sigla: "TAU", nome: "Taubaté", apelidos: ["TTE"] }, // TTE é como o calendário de reposição chama Taubaté
  { sigla: "UNA", nome: "Unaí" },
  { sigla: "MOC", nome: "Montes Claros" },
];

const NIVEIS = {
  critical: { rotulo: "Crítico", classe: "nivel-critico", ordem: 0 },
  alert: { rotulo: "Alerta", classe: "nivel-alerta", ordem: 1 },
  ok: { rotulo: "Normal", classe: "nivel-normal", ordem: 2 },
};

// Famílias de material do catálogo interno ("Cópia de TCX-LM-XXX-0000-00.xlsx",
// aba MATERIAIS), na mesma ordem da planilha: ancoragem, cabo, fusão e por
// fim o equipamento de data center. O código é o que não muda quando a API
// reescreve a descrição — por isso o agrupamento parte dele, não do nome.
// Um item novo que a API mandar sem estar em nenhuma lista cai em "Outros",
// ao final, em vez de entrar num grupo errado por engano.
const GRUPOS_DE_MATERIAL = [
  {
    nome: "Ancoragem",
    codigos: ["993138", "993170", "993184", "993456", "993546", "995796"],
  },
  {
    nome: "Cabos",
    codigos: ["993339"],
  },
  {
    nome: "Fusão",
    codigos: ["993552", "999213"],
  },
  {
    nome: "Data center",
    codigos: [
      "990801", "990987", "990988", "991084", "991085", "991445", "991706", "991949",
      "992761", "993002", "993073", "993161", "993223", "993352", "993996", "993997",
      "995838", "995971", "997174", "997984", "998222", "999485",
    ],
  },
];

const GRUPO_OUTROS = "Outros";

function grupoDoCodigo(codigo) {
  return GRUPOS_DE_MATERIAL.find((grupo) => grupo.codigos.includes(codigo))?.nome ?? GRUPO_OUTROS;
}

// ===== Leitura do que a API manda =====
//
// A rota devolve uma linha por item e regional:
//   { site, code, description, unit, min_stock, safe_stock, balance, alert,
//     critical_alert, total }
//
// `alert` e `critical_alert` vêm nulos quando o item não tem mínimo cadastrado.
// O que falta segue dito na dica da célula, para ninguém achar que o item foi
// conferido quando na verdade não há parâmetro.
// Esta é a única função que conhece esse formato; o resto da tela trabalha
// sobre { itens: [{ nome, codigo, unidade, porRegional: { SIGLA: {...} } }] }.

function nivelDaLinha(linha) {
  // Mínimo zero — cadastrado como zero ou ausente — é atendido por qualquer
  // saldo, inclusive zero: não há o que repor. A API marca algumas dessas
  // linhas como críticas; aqui elas são normais, e por isso a contagem de
  // críticos do painel pode ficar abaixo do critical_alert_rows dela.
  if (!(linha.min_stock > 0)) return "ok";

  if (linha.critical_alert) return "critical";
  if (linha.alert) return "alert";
  return "ok";
}

// A API manda a sigla ("CD"), mas o mapa dela parte dos nomes sem acento
// ("DIVINOPOLIS", "TAUBATE", "UNAI"). Comparar sem acento aceita os dois sem
// depender de qual lado chegar.
const semAcento = (texto) =>
  String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// Regional que a API passar a mandar fora das cinco entra com o nome que
// veio, depois delas — sumir com ela esconderia falta de estoque.
export function regionaisDosDados(bruto) {
  const novas = new Map();
  for (const linha of bruto?.items ?? []) {
    if (encontrarSigla(linha.site)) continue;
    const sigla = semAcento(linha.site);
    if (sigla && !novas.has(sigla)) novas.set(sigla, { sigla, nome: String(linha.site).trim() });
  }
  return [...REGIONAIS, ...novas.values()];
}

const siglaDaLinha = (linha) => encontrarSigla(linha.site) ?? semAcento(linha.site);

function encontrarSigla(chave) {
  const texto = semAcento(chave);
  return REGIONAIS.find(
    (regional) =>
      regional.sigla === texto || semAcento(regional.nome) === texto || (regional.apelidos ?? []).includes(texto),
  )?.sigla;
}

// ===== Calendário de reposição =====
//
// A rota restock-schedule agrupa por região com várias cidades num nome só
// ("LAV/VGA/PSO", "UNAÍ/PTU"). A região vira sigla do estoque se alguma das
// cidades for uma das cinco regionais. "BET/IAN" não bate com nenhuma pelo
// nome, e não ligo por conta própria: aparece com o nome que veio.
function siglaDaRegiao(nome) {
  for (const parte of String(nome ?? "").split("/")) {
    const sigla = encontrarSigla(parte);
    if (sigla) return sigla;
  }
  return null;
}

export function normalizarReposicao(bruto) {
  return (bruto?.regions ?? []).map((regiao) => ({
    nome: regiao.region,
    sigla: siglaDaRegiao(regiao.region),
    meses: (regiao.months ?? []).map((mes) => ({
      rotulo: mes.label,
      texto: mes.text,
      janelas: (mes.windows ?? []).map((janela) => ({ inicio: janela.start, fim: janela.end ?? janela.start })),
    })),
  }));
}

const hojeLocal = (agora = new Date()) =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

const diasAte = (dataTexto, hoje) => Math.round((Date.parse(dataTexto) - Date.parse(hoje)) / UM_DIA_MS);

// A próxima janela que ainda não acabou — a de hoje conta, está acontecendo.
function proximaJanela(regioes, hoje = hojeLocal()) {
  return regioes
    .flatMap((regiao) => regiao.meses.flatMap((mes) => mes.janelas.map((janela) => ({ ...janela, regiao }))))
    .filter((janela) => janela.fim >= hoje)
    .sort((uma, outra) => uma.inicio.localeCompare(outra.inicio))[0] ?? null;
}

const diaEMesTexto = (texto) => `${texto.slice(8, 10)}/${texto.slice(5, 7)}`;

function descreverJanela(janela) {
  return janela.inicio === janela.fim ? diaEMesTexto(janela.inicio) : `${diaEMesTexto(janela.inicio)} a ${diaEMesTexto(janela.fim)}`;
}

// Lista embaixo do gráfico por regional: a próxima janela de cada região, da
// mais próxima para a mais distante; sem data marcada vai para o fim. Com uma
// regional no filtro, só ela — igual ao resto da tela.
export function desenharReposicao(reposicao, estoque) {
  const alvo = document.getElementById("listaDeReposicao");
  const cartao = document.getElementById("cartaoDeReposicao");

  if (!reposicao?.length) {
    alvo.innerHTML = `<p class="aviso">Calendário ainda não carregado</p>`;
    cartao.onclick = null;
    return;
  }

  cartao.onclick = () => abrirCalendarioDeReposicao(reposicao);

  const hoje = hojeLocal();
  const siglaFiltrada = estoque.filtrada ? estoque.regionais[0].sigla : null;
  const regioes = siglaFiltrada ? reposicao.filter((regiao) => regiao.sigla === siglaFiltrada) : reposicao;

  if (!regioes.length) {
    alvo.innerHTML = `<p class="aviso">Sem calendário de reposição para ${siglaFiltrada}</p>`;
    return;
  }

  const linhas = regioes
    .map((regiao) => {
      const janela = proximaJanela([regiao], hoje);
      const aDefinir = !janela && regiao.meses.some((mes) => /definir/i.test(mes.texto ?? ""));
      return { regiao, janela, aDefinir };
    })
    .sort((uma, outra) => (uma.janela?.inicio ?? "9999").localeCompare(outra.janela?.inicio ?? "9999"));

  const primeira = linhas.find((linha) => linha.janela)?.janela;

  alvo.innerHTML = `<div class="lista-de-reposicao">${linhas
    .map(({ regiao, janela, aDefinir }) => {
      const nome = escapar(regiao.sigla ?? regiao.nome);
      const titulo = escapar(regiao.nome);
      if (!janela) {
        return `<span class="regiao" title="${titulo}">${nome}</span><span class="sem-data">${aDefinir ? "a definir" : "sem data"}</span><span></span>`;
      }
      const faltam = diasAte(janela.inicio, hoje);
      const falta = faltam <= 0 ? "agora" : `em ${faltam} ${faltam === 1 ? "dia" : "dias"}`;
      const destaque = janela === primeira ? " proxima" : "";
      return `<span class="regiao" title="${titulo}">${nome}</span><span class="quando${destaque}">${descreverJanela(janela)}</span><span class="falta">${falta}</span>`;
    })
    .join("")}</div>`;
}

function abrirCalendarioDeReposicao(reposicao) {
  const hoje = hojeLocal();
  const meses = reposicao[0]?.meses.map((mes) => mes.rotulo) ?? [];

  const linhas = reposicao
    .map((regiao) => {
      const proxima = proximaJanela([regiao], hoje);
      const celulas = regiao.meses
        .map((mes) => `<td class="${mes.texto ? "" : "coluna-data"}">${escapar(mes.texto ?? "—")}</td>`)
        .join("");
      const sigla = regiao.sigla ? `<span class="sigla-da-regiao">${regiao.sigla}</span>` : "";
      return `
        <tr>
          <td>${escapar(regiao.nome)} ${sigla}</td>
          ${celulas}
          <td class="${proxima ? "prazo-em-aberto" : ""}">${proxima ? descreverJanela(proxima) : "—"}</td>
        </tr>
      `;
    })
    .join("");

  abrirConteudo(
    "Calendário de reposição do estoque",
    `<table class="tabela-de-prazos">
       <thead><tr><th>Região</th>${meses.map((mes) => `<th>${escapar(mes)}</th>`).join("")}<th>Próxima</th></tr></thead>
       <tbody>${linhas}</tbody>
     </table>`,
  );
}

// `siglaFiltrada` restringe a tela a uma regional: as linhas das outras nem
// entram, e toda conta daí para frente — cartões, tabela, gráfico — já sai
// só dela.
export function normalizarEstoque(bruto, siglaFiltrada = "") {
  const linhas = bruto?.items ?? [];
  const porCodigo = new Map();
  const todas = regionaisDosDados(bruto);
  const regionais = siglaFiltrada ? todas.filter(({ sigla }) => sigla === siglaFiltrada) : todas;

  for (const linha of linhas) {
    const sigla = siglaDaLinha(linha);
    if (!sigla || !regionais.some((regional) => regional.sigla === sigla)) continue;

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

  const regionaisComDados = regionais.filter(({ sigla }) =>
    [...porCodigo.values()].some((item) => item.porRegional[sigla]),
  );

  return { itens: [...porCodigo.values()], regionais, regionaisComDados, filtrada: Boolean(siglaFiltrada) };
}

// ===== Ciclo de atualização =====
//
// O estoque é atualizado na origem a cada 15 dias, a partir de 22/09/2026. O
// painel conta os ciclos a partir dessa data para saber qual foi a última e
// qual é a próxima, sem ninguém precisar mexer aqui a cada quinzena.
const PRIMEIRA_ATUALIZACAO = Date.UTC(2026, 8, 22);
const DIAS_ENTRE_ATUALIZACOES = 15;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Conta em dias de calendário do lugar onde o painel está aberto: meia-noite
// local vira meia-noite UTC, para a diferença sair sempre em dias inteiros.
function hojeEmDias(agora) {
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

export function cicloDeAtualizacao(agora = new Date()) {
  const hoje = hojeEmDias(agora);
  const ciclos = Math.max(0, Math.floor((hoje - PRIMEIRA_ATUALIZACAO) / UM_DIA_MS / DIAS_ENTRE_ATUALIZACOES));

  const ultima = PRIMEIRA_ATUALIZACAO + ciclos * DIAS_ENTRE_ATUALIZACOES * UM_DIA_MS;
  const proxima = ultima + DIAS_ENTRE_ATUALIZACOES * UM_DIA_MS;

  return {
    ultima: new Date(ultima),
    proxima: new Date(proxima),
    faltam: Math.round((proxima - hoje) / UM_DIA_MS),
    atualizadoHoje: ultima === hoje,
  };
}

const diaEMes = (data) =>
  `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;

// ===== Contas da tela =====

// Célula ausente é regional sem dado para o item — não é "normal", e não pode
// entrar em contagem nenhuma.
function celula(item, sigla) {
  return item.porRegional[sigla] ?? null;
}

function niveisDoItem(item) {
  return Object.values(item.porRegional).map((dados) => dados.nivel);
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
  return estoque.regionais.map(({ sigla, nome }) => {
    const niveis = estoque.itens.map((item) => celula(item, sigla)?.nivel).filter(Boolean);

    return {
      sigla,
      nome,
      criticos: contarNivel(niveis, "critical"),
      alertas: contarNivel(niveis, "alert"),
      normais: contarNivel(niveis, "ok"),
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

// A tabela mostra o estoque inteiro, do mais grave ao normal — mas separado
// por família de material: ancoragem, cabo, fusão e data center têm cada um
// sua faixa própria, e dentro dela o mais grave continua vindo primeiro.
// Um grupo sem item nenhum (por causa do filtro de nível, por exemplo) não
// aparece.
export function itensAgrupados(estoque) {
  const baldes = new Map([...GRUPOS_DE_MATERIAL.map(({ nome }) => nome), GRUPO_OUTROS].map((nome) => [nome, []]));

  for (const item of estoque.itens) baldes.get(grupoDoCodigo(item.codigo)).push(item);

  return [...baldes]
    .map(([grupo, itens]) => ({ grupo, itens: ordenarPorGravidade(itens) }))
    .filter(({ itens }) => itens.length > 0);
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

// O `title` só aparece com o mouse parado em cima; numa TV ou tablet ninguém
// vê. O clique mostra o mesmo conteúdo numa caixa presa à célula.
function montarDica(dados, nome, item) {
  if (!dados) return `<strong>${escapar(nome)}</strong><span>Regional não informada pela API</span>`;

  const seguro = dados.seguro === null
    ? "<span>Sem estoque seguro cadastrado</span>"
    : `<span>Saudável a partir de <strong>${formatarNumero(dados.seguro)}</strong></span>`;

  const minimo = dados.minimoCadastrado
    ? `<span>Mínimo <strong>${formatarNumero(dados.minimo)}</strong></span>`
    : "<span>Sem mínimo cadastrado</span>";

  return `
    <strong>${escapar(item.nome)}</strong>
    <span>${escapar(nome)} · ${NIVEIS[dados.nivel].rotulo}</span>
    <span>Saldo <strong>${formatarNumero(dados.quantidade)}</strong> ${escapar(item.unidade || "")}</span>
    ${minimo}
    ${seguro}
  `;
}

function fecharDica() {
  document.querySelector(".dica-de-celula")?.remove();
  document.querySelector(".celula-aberta")?.classList.remove("celula-aberta");
}

function abrirDicaDaCelula(celulaDoDom, conteudo) {
  const jaAberta = celulaDoDom.classList.contains("celula-aberta");
  fecharDica();
  if (jaAberta) return; // clicar de novo na mesma célula fecha

  const caixa = document.createElement("div");
  caixa.className = "dica-de-celula";
  caixa.innerHTML = conteudo;
  document.body.append(caixa);

  const area = celulaDoDom.getBoundingClientRect();
  const dica = caixa.getBoundingClientRect();

  // Abre para o lado que tem espaço, para não vazar da tela.
  const esquerda = Math.min(Math.max(8, area.left + area.width / 2 - dica.width / 2), window.innerWidth - dica.width - 8);
  const acima = area.top - dica.height - 8;
  caixa.style.left = `${esquerda}px`;
  caixa.style.top = `${acima > 8 ? acima : area.bottom + 8}px`;

  celulaDoDom.classList.add("celula-aberta");
}

document.addEventListener("click", (evento) => {
  if (!evento.target.closest(".dica-de-celula") && !evento.target.closest(".grade-de-estoque td")) fecharDica();
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") fecharDica();
});

// O filtro de nível escolhe quais itens entram na tabela — basta uma regional
// visível naquele nível — e, dentro da linha, só as células daquele nível
// mostram número. As outras ficam vazias: filtrando "Críticos", ver ao lado
// uma regional normal só atrapalha a leitura.
function temNivel(item, nivel, regionais) {
  return regionais.some(({ sigla }) => celula(item, sigla)?.nivel === nivel);
}

const DESCRICAO_DO_NIVEL = { critical: "crítico", alert: "em alerta", ok: "normal" };

// `niveis` é o conjunto de níveis ligados nos botões. Os três ligados é a
// tabela inteira; nenhum ligado não mostra nada.
export function desenharTabelaDeEstoque(estoque, niveis = new Set(Object.keys(NIVEIS))) {
  const alvo = document.getElementById("tabelaDeEstoque");

  if (!estoque.itens.length) {
    alvo.innerHTML = `<p class="aviso">Estoque ainda não publicado pela API</p>`;
    return;
  }

  if (!niveis.size) {
    alvo.innerHTML = `<p class="aviso">Ligue ao menos um nível para ver os itens</p>`;
    return;
  }

  const filtrando = niveis.size < Object.keys(NIVEIS).length;
  const passaNoFiltro = (item) =>
    !filtrando || [...niveis].some((nivel) => temNivel(item, nivel, estoque.regionais));

  const grupos = itensAgrupados(estoque)
    .map(({ grupo, itens }) => ({ grupo, itens: itens.filter(passaNoFiltro) }))
    .filter(({ itens }) => itens.length > 0);

  if (!grupos.length) {
    const descricao = [...niveis].map((nivel) => DESCRICAO_DO_NIVEL[nivel]).join(" ou ");
    alvo.innerHTML = `<p class="aviso">Nenhum item ${descricao}${estoque.filtrada ? " nesta regional" : ""}</p>`;
    return;
  }

  // As colunas são as regionais visíveis: com filtro, uma só — e as outras não
  // podem aparecer como zero, que é como regional sem dado é mostrada.
  const totalDeColunas = 3 + estoque.regionais.length;
  const colunas = `<col class="coluna-unidade"><col class="coluna-item"><col class="coluna-minimo">${estoque.regionais.map(() => '<col class="coluna-regional">').join("")}`;
  const cabecalho = estoque.regionais.map(({ sigla, nome }) => `<th title="${escapar(nome)}">${sigla}</th>`).join("");

  function montarLinhaDoItem(item) {
    const celulas = estoque.regionais.map(({ sigla, nome }) => {
      const dados = celula(item, sigla);
      const nivelDaCelula = dados?.nivel ?? "ok";
      if (filtrando && !niveis.has(nivelDaCelula)) return `<td class="celula-fora-do-filtro"></td>`;

      // Regional que a API não devolveu conta como zero — é o que ela
      // significa no estoque, e um traço só faria a coluna parecer quebrada.
      const classe = dados ? NIVEIS[dados.nivel].classe : "nivel-normal";
      const texto = formatarNumero(dados?.quantidade ?? 0);
      const dica = escapar(montarDica(dados, nome, item));
      return `<td class="${classe} celula-clicavel" title="${escapar(descreverCelula(dados, nome))}" data-dica="${dica}">${texto}</td>`;
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
  }

  // Uma linha inteira com o nome da família antes dos itens dela — a mesma
  // divisão do catálogo interno (ancoragem, cabo, fusão, data center).
  const linhas = grupos
    .map(
      ({ grupo, itens }) => `
        <tr class="linha-de-grupo"><th colspan="${totalDeColunas}">${escapar(grupo)}</th></tr>
        ${itens.map(montarLinhaDoItem).join("")}
      `,
    )
    .join("");

  alvo.onclick = (evento) => {
    const celulaDoDom = evento.target.closest("td.celula-clicavel");
    if (celulaDoDom) abrirDicaDaCelula(celulaDoDom, celulaDoDom.dataset.dica);
  };

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

  const ciclo = cicloDeAtualizacao();

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
    // Com uma regional escolhida, "a mais crítica" não compara nada: o cartão
    // passa a dizer qual regional está na tela.
    estoque.filtrada
      ? {
          rotulo: "Regional",
          valor: estoque.regionais[0].sigla,
          detalhe: `${estoque.regionais[0].nome} · ${formatarNumero(contagem.critical)} críticos`,
          realce: CORES.serie1,
          texto: true,
        }
      : {
          rotulo: "Regional mais crítica",
          valor: temAlerta ? pior.sigla : "—",
          // Enquanto só uma regional manda dado, dizer isso é mais honesto do
          // que apontar a "pior" de uma comparação que não existe.
          detalhe: comDados.length < 2
            ? `${comDados.length ? comDados[0].nome : "nenhuma regional"} · única com dados`
            : temAlerta ? `${pior.nome} · ${formatarNumero(pior.criticos)} críticos` : "nenhuma em falta",
          realce: CORES.statusCritico,
          texto: true,
        },
  ];

  // A data vale mesmo sem dado da API: é do calendário, não do estoque.
  cartoes.push({
    rotulo: "Próxima atualização",
    valor: diaEMes(ciclo.proxima),
    detalhe: ciclo.atualizadoHoje
      ? `atualizado hoje · a cada ${DIAS_ENTRE_ATUALIZACOES} dias`
      : `em ${ciclo.faltam} ${ciclo.faltam === 1 ? "dia" : "dias"} · última em ${diaEMes(ciclo.ultima)}`,
    realce: CORES.serie1,
    texto: true,
    semprePreenchido: true,
  });

  document.getElementById("indicadoresEstoque").innerHTML = cartoes
    .map(({ rotulo, valor, detalhe, realce, texto, semprePreenchido }) => {
      const esperando = vazio && !semprePreenchido;
      return `
        <div class="indicador${esperando ? " aguardando" : ""}" style="--realce: ${realce}">
          <div class="rotulo">${rotulo}</div>
          <div class="valor">${esperando ? "—" : texto ? escapar(valor) : formatarNumero(valor)}</div>
          <div class="detalhe">${esperando ? "aguardando a rota de estoque" : escapar(detalhe)}</div>
        </div>
      `;
    })
    .join("");
}
