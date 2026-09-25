// Caixa de confirmação e de aviso no visual do painel, no lugar do
// confirm()/alert() do navegador. Abre por cima de tudo, inclusive da janela
// de detalhes, e devolve uma Promise: true se a pessoa confirmou.

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

// Ícones de traço fino, no mesmo peso do resto do painel.
const ICONES = {
  perigo: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  info: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  erro: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
};

function abrirCaixa({ titulo, mensagem, botoes, tipo = "info" }) {
  return new Promise((resolver) => {
    const camada = document.createElement("div");
    camada.className = "camada-de-confirmacao";
    camada.innerHTML = `
      <div class="caixa-de-confirmacao ${tipo}" role="alertdialog" aria-modal="true" aria-labelledby="tituloDaConfirmacao">
        <div class="corpo-da-confirmacao">
          <span class="icone-da-confirmacao" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[tipo]}</svg>
          </span>
          <div>
            <h2 id="tituloDaConfirmacao">${escapar(titulo)}</h2>
            ${mensagem ? `<p>${escapar(mensagem)}</p>` : ""}
          </div>
        </div>
        <div class="botoes-da-confirmacao">
          ${botoes.map(({ texto, classe }, indice) =>
            `<button type="button" class="${classe}" data-indice="${indice}">${escapar(texto)}</button>`).join("")}
        </div>
      </div>`;

    const fechar = (resposta) => {
      window.removeEventListener("keydown", aoTeclar, true);
      camada.classList.add("saindo");
      setTimeout(() => camada.remove(), 120);
      resolver(resposta);
    };

    // Esc fecha só esta caixa: sem o stop, a janela de detalhes embaixo
    // também fecharia junto.
    function aoTeclar(evento) {
      if (evento.key !== "Escape") return;
      evento.stopImmediatePropagation();
      fechar(false);
    }

    camada.querySelectorAll("[data-indice]").forEach((botao) => {
      botao.onclick = () => fechar(botoes[Number(botao.dataset.indice)].valor);
    });
    camada.onclick = (evento) => {
      if (evento.target === camada) fechar(false);
    };
    window.addEventListener("keydown", aoTeclar, true);

    document.body.append(camada);
    // Em ação destrutiva o foco fica no "Cancelar": Enter por engano não apaga nada.
    const foco = botoes.findIndex((botao) => botao.foco);
    camada.querySelector(`[data-indice="${foco === -1 ? botoes.length - 1 : foco}"]`).focus();
  });
}

export function confirmar({ titulo, mensagem, confirmarTexto = "Confirmar", perigo = false }) {
  return abrirCaixa({
    titulo,
    mensagem,
    tipo: perigo ? "perigo" : "info",
    botoes: [
      { texto: "Cancelar", classe: "botao-de-acesso secundario", valor: false, foco: perigo },
      { texto: confirmarTexto, classe: `botao-de-acesso${perigo ? " perigo" : ""}`, valor: true },
    ],
  });
}

export function avisar({ titulo, mensagem }) {
  return abrirCaixa({ titulo, mensagem, tipo: "erro", botoes: [{ texto: "Entendi", classe: "botao-de-acesso", valor: true }] });
}
