// As rotas passam por funções serverless: a API original não envia
// cabeçalho CORS, então o navegador não consegue chamá-la diretamente.
// Ambas devolvem um snapshot salvo quando a origem falha, então só chegam a
// dar erro aqui se o próprio painel estiver fora do ar.

const TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 1500;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Uma falha isolada (cold start, oscilação de rede) não pode derrubar a carga:
// insistimos algumas vezes antes de desistir.
async function buscarComTentativas(rota) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(rota, { cache: "no-store" });
      if (!resposta.ok) throw new Error(`${rota} respondeu ${resposta.status}`);
      return await resposta.json();
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < TENTATIVAS) await esperar(ESPERA_ENTRE_TENTATIVAS_MS);
    }
  }

  throw ultimoErro;
}

export function buscarB2b() {
  return buscarComTentativas("/api/b2b");
}

export function buscarViabilidade() {
  return buscarComTentativas("/api/viabilidade");
}

export function buscarEstoque() {
  return buscarComTentativas("/api/estoque");
}
