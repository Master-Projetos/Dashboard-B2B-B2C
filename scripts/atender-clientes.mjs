// Atende uma lista de clientes no Geogrid direto na porta da caixa mais próxima,
// sem criar ponto de acesso, grupo nem cabo drop.
//
// O /integracao/atender só liga direto na porta quando o local informado está a
// menos de 2 m do equipamento. Por isso o local enviado é sempre a coordenada da
// própria caixa, e não a do cliente; a do cliente só serve para achar a caixa.
//
// Uso:
//   GEOGRID_URL=https://suaempresa.geogridmaps.com.br GEOGRID_API_KEY=... \
//     node scripts/atender-clientes.mjs clientes.json            (só simula)
//     node scripts/atender-clientes.mjs clientes.json --executar (grava no Geogrid)
//
// clientes.json é uma lista de objetos com:
//   codigo     identificador único do cliente no seu sistema (vira o codigoIntegracao)
//   nome, latitude, longitude
//   cpfCnpj, telefone, celular, email, cep, endereco, bairro, cidade, estado (opcionais)
//
// O resultado de cada cliente vai para atendimentos.json. Quem já está lá com
// sucesso é pulado, então dá para rodar de novo depois de uma falha.

import { readFile, writeFile } from "node:fs/promises";

const RAIO_EM_METROS = 200;

const BASE = `${process.env.GEOGRID_URL}/api/v3`;
const CHAVE = process.env.GEOGRID_API_KEY;
const [arquivoClientes] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const executar = process.argv.includes("--executar");

if (!process.env.GEOGRID_URL || !CHAVE || !arquivoClientes) {
  console.error("Informe GEOGRID_URL, GEOGRID_API_KEY e o arquivo de clientes.");
  process.exit(1);
}

const ARQUIVO_RESULTADO = new URL("../atendimentos.json", import.meta.url);

async function geogrid(metodo, caminho, corpo) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "api-key": CHAVE, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(`${metodo} ${caminho} respondeu ${resposta.status}`);
    erro.detalhes = dados;
    throw erro;
  }
  return dados;
}

// Caixas com equipamento de atendimento e porta livre no raio, da mais próxima
// para a mais distante.
async function caixasProximas({ latitude, longitude }) {
  const parametros = new URLSearchParams({
    latitude,
    longitude,
    raio: RAIO_EM_METROS,
    consultarIndividual: "S",
    possuiEquipamentosAtendimento: "S",
    "equipamentosAtendimento[]": "S",
    "modoProjeto[]": "N",
    "ordenarCampos[]": "distancia",
    "ordenarPor[]": "asc",
  });
  const { registros = [] } = await geogrid("GET", `/viabilidade/raio?${parametros}`);
  return registros.filter((caixa) => caixa.portasLivres > 0);
}

async function primeiraPortaLivre(idCaixa) {
  const parametros = new URLSearchParams({
    disponivel: "S",
    "tipo[]": "S",
    "equipamentosAtendimento[]": "S",
    "modoProjeto[]": "N",
  });
  const { registros = [] } = await geogrid(
    "GET",
    `/viabilidade/${idCaixa}/portas?${parametros}`,
  );
  return registros[0]?.dados;
}

// Reaproveita o cliente se ele já foi cadastrado com esse código; senão cadastra.
async function idDoCliente(cliente) {
  try {
    const { dados } = await geogrid(
      "GET",
      `/clientes/integrado/${encodeURIComponent(cliente.codigo)}`,
    );
    return dados.id;
  } catch (erro) {
    if (!erro.detalhes?.naoEncontrado) throw erro;
  }

  if (!executar) return "(novo)";

  const { latitude, longitude, codigo, ...cadastro } = cliente;
  const { dados } = await geogrid("POST", "/clientes", {
    dados: { ...cadastro, codigoIntegracao: String(codigo) },
  });
  return dados.id;
}

async function atender(cliente) {
  const caixas = await caixasProximas(cliente);

  for (const caixa of caixas) {
    const porta = await primeiraPortaLivre(caixa.id);
    if (!porta) continue;

    const idCliente = await idDoCliente(cliente);
    const resumo = {
      caixa: caixa.sigla,
      idCaixa: caixa.id,
      distancia: Math.round(caixa.distancia),
      porta: porta.label,
      idPorta: porta.id,
      idCliente,
    };

    if (executar) {
      await geogrid("POST", "/integracao/atender", {
        idPorta: porta.id,
        idCliente,
        local: { latitude: caixa.latitude, longitude: caixa.longitude },
      });
    }
    return resumo;
  }

  throw new Error(`nenhuma caixa com porta livre em ${RAIO_EM_METROS} m`);
}

const clientes = JSON.parse(await readFile(arquivoClientes, "utf8"));
const resultados = JSON.parse(await readFile(ARQUIVO_RESULTADO, "utf8").catch(() => "{}"));

console.log(executar ? "Gravando no Geogrid." : "Simulação: nada será gravado.");

let atendidos = 0;
let falhas = 0;

// Um por vez: cada atendimento ocupa uma porta, e o próximo cliente precisa ver
// a caixa já com ela ocupada.
for (const cliente of clientes) {
  if (resultados[cliente.codigo]?.ok) continue;

  try {
    const resumo = await atender(cliente);
    atendidos++;
    console.log(`${cliente.codigo} ${cliente.nome}: ${resumo.caixa} porta ${resumo.porta} (${resumo.distancia} m)`);
    if (executar) resultados[cliente.codigo] = { ok: true, ...resumo };
  } catch (erro) {
    falhas++;
    console.error(`${cliente.codigo} ${cliente.nome}: ${erro.message}`, erro.detalhes ?? "");
    if (executar) resultados[cliente.codigo] = { ok: false, erro: erro.message, detalhes: erro.detalhes };
  }

  if (executar) await writeFile(ARQUIVO_RESULTADO, `${JSON.stringify(resultados, null, 2)}\n`);
}

console.log(`${atendidos} atendidos, ${falhas} com falha.`);
