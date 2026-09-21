// Regera os snapshots em dados/. Eles são o que as rotas /api servem quando a
// API original está fora do ar, então vale atualizá-los de tempos em tempos.
//
// Uso: npm run snapshot

import { writeFile } from "node:fs/promises";

const ENDERECO_DO_PAINEL = "https://master-projetos-painel.vercel.app";

const ROTAS = [
  { nome: "b2b", caminho: "/api/b2b" },
  { nome: "viabilidade", caminho: "/api/viabilidade" },
];

let houveFalha = false;

for (const { nome, caminho } of ROTAS) {
  const resposta = await fetch(`${ENDERECO_DO_PAINEL}${caminho}`);

  if (!resposta.ok) {
    console.error(`${nome}: painel respondeu ${resposta.status}; snapshot mantido.`);
    houveFalha = true;
    continue;
  }

  const dados = await resposta.json();

  // Se o painel devolveu o próprio snapshot, a origem está fora do ar e não há
  // nada novo para gravar.
  if (dados.origem === "snapshot") {
    console.error(`${nome}: API original fora do ar; snapshot mantido.`);
    houveFalha = true;
    continue;
  }

  delete dados.origem;
  delete dados.atualizadoEm;

  const destino = new URL(`../dados/${nome}.json`, import.meta.url);
  await writeFile(destino, `${JSON.stringify(dados, null, 2)}\n`);
  console.log(`${nome}: snapshot atualizado.`);
}

process.exit(houveFalha ? 1 : 0);
