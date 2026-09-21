// Guarda o último dado bom de cada fonte no navegador. É o que garante que o
// painel nunca fique vazio: se a API falhar, continuamos mostrando o que já
// tínhamos, em vez de apagar a tela.

const PREFIXO = "master-painel:";

export function salvarDados(chave, dados) {
  try {
    const pacote = { dados, salvoEm: new Date().toISOString() };
    localStorage.setItem(PREFIXO + chave, JSON.stringify(pacote));
  } catch (erro) {
    // Cota cheia ou navegação privada: seguir sem cache não quebra o painel.
  }
}

export function carregarDados(chave) {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;

    const pacote = JSON.parse(bruto);
    return { dados: pacote.dados, salvoEm: new Date(pacote.salvoEm) };
  } catch (erro) {
    return null;
  }
}
