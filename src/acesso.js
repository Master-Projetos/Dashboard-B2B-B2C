import { createClient } from "@supabase/supabase-js";
import { abrirConteudo } from "./detalhes.js";
import { confirmar, avisar } from "./confirmacao.js";
import { aplicarTema, nomeDoTemaAtual } from "./tema.js";

// Login do painel pelo Supabase.
//
// Cadastro com nome, e-mail @soumaster.com.br e senha. O pedido nasce
// "pendente" e só vira acesso quando o admin aprova. O primeiro cadastro do
// projeto é o admin. As regras valem no banco (supabase/acessos.sql); aqui é
// só a tela.
//
// A chave publicável é feita para ficar no navegador: o que protege os dados
// são as políticas do banco, não o segredo dela.

const SUPABASE_URL = "https://dkwbcrxiegejzmyblxnd.supabase.co";
const SUPABASE_CHAVE_PUBLICAVEL = "sb_publishable_fVIyu3cpfSm-vSjqrOitnQ_UkyjrAfO";

const DOMINIO = "@soumaster.com.br";
const INTERVALO_DE_SOLICITACOES_MS = 60 * 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL);

const areaDeAcesso = document.getElementById("acesso");
const conteudo = document.getElementById("conteudoDoAcesso");

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, (caractere) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caractere]);
}

// O Supabase responde em inglês; quem usa o painel lê em português.
function traduzirErro(erro) {
  const mensagem = erro?.message ?? "";
  if (/invalid login credentials/i.test(mensagem)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(mensagem)) return "Confirme seu e-mail pelo link que chegou na caixa de entrada.";
  if (/already registered|already been registered|já tem cadastro/i.test(mensagem)) return "Este e-mail já tem cadastro. Use Entrar.";
  if (/at least 6 characters|password should be|pelo menos 6/i.test(mensagem)) return "A senha precisa de pelo menos 6 caracteres.";
  if (/soumaster|database error saving new user/i.test(mensagem)) return `Só e-mails ${DOMINIO} podem se cadastrar.`;
  if (/rate limit/i.test(mensagem)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (/failed to fetch|network/i.test(mensagem)) return "Sem conexão com o servidor de login.";
  return "Não deu certo. Tente de novo em instantes.";
}

// ===== Telas de entrada =====

function mostrarAcesso(html) {
  document.getElementById("painel").hidden = true;
  document.getElementById("rodape").hidden = true;
  areaDeAcesso.hidden = false;
  conteudo.innerHTML = html;
}

function titulo(texto, subtitulo) {
  return `
    <header class="titulo-do-acesso">
      <h1>${texto}</h1>
      <p>${subtitulo}</p>
    </header>`;
}

// Campo de senha com botão de mostrar/esconder: digitar senha às cegas no
// celular é onde mais se erra.
function campoDeSenha(autocomplete, placeholder = "") {
  return `
    <label class="campo">
      <span>Senha</span>
      <div class="campo-com-acao">
        <input name="senha" type="password" autocomplete="${autocomplete}" required placeholder="${placeholder}">
        <button type="button" class="mostrar-senha" aria-label="Mostrar senha">mostrar</button>
      </div>
    </label>`;
}

function ligarFormulario() {
  conteudo.querySelectorAll("[data-ir]").forEach((link) => {
    link.onclick = () => (link.dataset.ir === "entrar" ? telaDeEntrar() : telaDeCadastro());
  });

  const botao = conteudo.querySelector(".mostrar-senha");
  if (botao) {
    botao.onclick = () => {
      const campo = botao.previousElementSibling;
      const mostrando = campo.type === "text";
      campo.type = mostrando ? "password" : "text";
      botao.textContent = mostrando ? "mostrar" : "esconder";
      botao.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Esconder senha");
    };
  }
}

function mostrarMensagem(texto, tipo = "erro") {
  const alvo = conteudo.querySelector(".mensagem-de-acesso");
  alvo.textContent = texto;
  alvo.className = `mensagem-de-acesso ${tipo}`;
  alvo.hidden = false;
}

function ocupado(formulario, sim) {
  const botao = formulario.querySelector("button[type=submit]");
  botao.disabled = sim;
  botao.dataset.texto ??= botao.textContent;
  botao.textContent = sim ? "Aguarde…" : botao.dataset.texto;
}

function telaDeEntrar(aviso) {
  mostrarAcesso(`
    ${titulo("Bem-vindo de volta", `Entre com seu e-mail ${DOMINIO}.`)}
    <form class="formulario-de-acesso" novalidate>
      <label class="campo"><span>E-mail</span>
        <input name="email" type="email" autocomplete="username" required placeholder="nome${DOMINIO}">
      </label>
      ${campoDeSenha("current-password")}
      <p class="mensagem-de-acesso" hidden></p>
      <button type="submit" class="botao-de-acesso">Entrar</button>
    </form>
    <p class="troca-de-tela">Ainda não tem acesso? <button type="button" data-ir="cadastrar">Criar conta</button></p>`);
  ligarFormulario();
  if (aviso) mostrarMensagem(aviso, "sucesso");

  const formulario = conteudo.querySelector("form");
  formulario.email.focus();
  formulario.onsubmit = async (evento) => {
    evento.preventDefault();
    ocupado(formulario, true);

    const { error } = await supabase.auth.signInWithPassword({
      email: formulario.email.value.trim().toLowerCase(),
      password: formulario.senha.value,
    });

    ocupado(formulario, false);
    if (error) {
      mostrarMensagem(traduzirErro(error));
      return;
    }
    verificarAcesso();
  };
}

function telaDeCadastro() {
  mostrarAcesso(`
    ${titulo("Criar conta", "Seu pedido vai para o admin do painel aprovar.")}
    <form class="formulario-de-acesso" novalidate>
      <label class="campo"><span>Nome</span>
        <input name="nome" autocomplete="name" required placeholder="Como você é chamado">
      </label>
      <label class="campo"><span>E-mail</span>
        <input name="email" type="email" autocomplete="username" required placeholder="nome${DOMINIO}">
      </label>
      ${campoDeSenha("new-password", "Pelo menos 6 caracteres")}
      <p class="mensagem-de-acesso" hidden></p>
      <button type="submit" class="botao-de-acesso">Pedir acesso</button>
    </form>
    <p class="troca-de-tela">Já tem conta? <button type="button" data-ir="entrar">Entrar</button></p>`);
  ligarFormulario();

  const formulario = conteudo.querySelector("form");
  formulario.nome.focus();
  formulario.onsubmit = async (evento) => {
    evento.preventDefault();
    const nome = formulario.nome.value.trim();
    const email = formulario.email.value.trim().toLowerCase();
    const senha = formulario.senha.value;

    // Avisa antes de mandar; o banco recusa de qualquer jeito.
    if (!nome) return mostrarMensagem("Informe seu nome.");
    if (!email.endsWith(DOMINIO)) return mostrarMensagem(`Use seu e-mail ${DOMINIO}.`);
    if (senha.length < 6) return mostrarMensagem("A senha precisa de pelo menos 6 caracteres.");

    // Cadastro pela função do banco, não pelo signUp do Supabase: o signUp
    // manda e-mail de confirmação e esbarra no limite de envios por hora.
    // Aqui quem confirma é o admin; a conta nasce pronta e já entra.
    ocupado(formulario, true);
    const { error } = await supabase.rpc("pedir_acesso", { nome, email, senha });
    if (error) {
      ocupado(formulario, false);
      mostrarMensagem(traduzirErro(error));
      return;
    }

    const { error: erroAoEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });
    ocupado(formulario, false);
    if (erroAoEntrar) {
      telaDeEntrar("Pedido enviado. Quando o admin aprovar, entre com seu e-mail e senha.");
      return;
    }
    verificarAcesso();
  };
}

function telaDeEspera(perfil) {
  const recusado = perfil.situacao === "recusado";
  mostrarAcesso(`
    <div class="espera-de-acesso">
      <span class="sinal-de-espera ${recusado ? "recusado" : ""}" aria-hidden="true"></span>
      <h1>${recusado ? "Acesso recusado" : "Aguardando aprovação"}</h1>
      <p>${recusado
        ? "O admin recusou este pedido. Fale com ele se achar que foi engano."
        : `Olá, ${escapar(perfil.nome)}. Seu pedido chegou ao admin; assim que ele aprovar, o painel abre aqui.`}</p>
      <div class="botoes-de-espera">
        ${recusado ? "" : '<button type="button" class="botao-de-acesso" data-acao="conferir">Conferir de novo</button>'}
        <button type="button" class="botao-de-acesso secundario" data-acao="sair">Sair</button>
      </div>
    </div>`);

  conteudo.querySelector('[data-acao="sair"]').onclick = sair;
  const conferir = conteudo.querySelector('[data-acao="conferir"]');
  if (conferir) conferir.onclick = verificarAcesso;
}

// ===== Sessão =====

let aoAprovar = () => {};
let aoTrocarTema = () => {};
let painelIniciado = false;
let meuPerfil = null;

async function sair() {
  await supabase.auth.signOut();
  window.location.reload();
}

async function lerPerfil(usuario) {
  const { data, error } = await supabase.from("perfis").select("*").eq("id", usuario.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function verificarAcesso() {
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  if (!usuario) return telaDeEntrar();

  let perfil;
  try {
    perfil = await lerPerfil(usuario);
  } catch (erro) {
    mostrarAcesso(`
      <div class="espera-de-acesso">
        <span class="sinal-de-espera recusado" aria-hidden="true"></span>
        <h1>Sem conexão</h1>
        <p>Não foi possível conferir seu acesso agora.</p>
        <div class="botoes-de-espera"><button type="button" class="botao-de-acesso">Tentar de novo</button></div>
      </div>`);
    conteudo.querySelector("button").onclick = verificarAcesso;
    return;
  }

  if (!perfil || perfil.situacao !== "aprovado") return telaDeEspera(perfil ?? { situacao: "pendente", nome: "" });

  meuPerfil = perfil;

  // O tema salvo na conta vale em qualquer computador: entra antes do
  // primeiro desenho, para os gráficos já nascerem na cor certa.
  if (perfil.tema) aplicarPreferenciaDeTema(perfil.tema);

  areaDeAcesso.hidden = true;
  document.getElementById("painel").hidden = false;
  document.getElementById("rodape").hidden = false;
  prepararMenuDaConta(perfil);
  if (perfil.admin) iniciarAdmin();

  if (!painelIniciado) {
    painelIniciado = true;
    aoAprovar();
    vigiarSessao();
  }
}

// ===== Sessão encerrada em outro lugar =====
//
// "Encerrar sessões" (ou um admin removendo o acesso) vale no servidor na
// hora, mas este navegador só descobriria ao renovar o login, em até uma
// hora. Então, a cada minuto e sempre que a aba volta a ficar visível, o
// painel confere a sessão e o perfil; se não valem mais, volta à entrada.
const INTERVALO_DE_CONFERIR_SESSAO_MS = 60 * 1000;

async function conferirSessao() {
  const { error } = await supabase.auth.getUser();

  // 401/403 é resposta do servidor dizendo que a sessão acabou. Falha de rede
  // não conta: quem está numa TV sem internet não pode ser deslogado por isso.
  if (error && [401, 403].includes(error.status)) {
    await supabase.auth.signOut({ scope: "local" });
    window.location.reload();
    return;
  }
  if (error) return;

  try {
    const perfil = await lerPerfil({ id: meuPerfil.id });
    if (!perfil || perfil.situacao !== "aprovado") window.location.reload();
  } catch (erro) {
    // Sem conexão: confere de novo na próxima volta.
  }
}

function vigiarSessao() {
  setInterval(conferirSessao, INTERVALO_DE_CONFERIR_SESSAO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") conferirSessao();
  });
}

const papelDe = (perfil) => (perfil.master ? "master" : perfil.admin ? "admin" : "");

// "Eduardo Viana" → "EV"; um nome só → as duas primeiras letras.
function iniciais(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const botaoDaConta = document.getElementById("botaoDaConta");
const menuDaConta = document.getElementById("menuDaConta");

function abrirMenuDaConta(abrir) {
  menuDaConta.hidden = !abrir;
  botaoDaConta.setAttribute("aria-expanded", String(abrir));
}

function prepararMenuDaConta(perfil) {
  const papel = papelDe(perfil);
  document.getElementById("iniciaisDaConta").textContent = iniciais(perfil.nome);
  document.getElementById("nomeNoMenu").textContent = perfil.nome;
  document.getElementById("emailNoMenu").textContent = perfil.email;

  const selo = document.getElementById("papelNoMenu");
  selo.hidden = !papel;
  selo.textContent = papel;
  selo.classList.toggle("selo-master", papel === "master");

  botaoDaConta.onclick = () => abrirMenuDaConta(menuDaConta.hidden);

  // Cada item fecha o menu antes de agir.
  const item = (id, acao) => {
    document.getElementById(id).onclick = () => {
      abrirMenuDaConta(false);
      acao();
    };
  };
  item("minhaConta", () => abrirMinhaConta());
  item("sairDoPainel", sair);
}

// Clique fora ou Esc fecham o menu.
document.addEventListener("click", (evento) => {
  if (!menuDaConta.hidden && !evento.target.closest(".menu-da-conta")) abrirMenuDaConta(false);
});
document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && !menuDaConta.hidden) abrirMenuDaConta(false);
});

// ===== Admin: pedidos de acesso =====

let adminIniciado = false;

async function lerPerfis() {
  const { data, error } = await supabase.from("perfis").select("*").order("criado_em", { ascending: false });
  if (error) throw error;
  return data;
}

async function atualizarContadorDeSolicitacoes() {
  try {
    const perfis = await lerPerfis();
    const pendentes = perfis.filter((perfil) => perfil.situacao === "pendente").length;
    // O número aparece no avatar e no item Membros do menu só quando há
    // pedido esperando — como a notificação de qualquer aplicativo.
    const texto = pendentes > 9 ? "9+" : String(pendentes);
    for (const id of ["pedidosNoAvatar", "pedidosNoMenu"]) {
      const alvo = document.getElementById(id);
      alvo.hidden = pendentes === 0;
      alvo.textContent = texto;
    }
    botaoDaConta.title = pendentes
      ? `Minha conta · ${pendentes} ${pendentes === 1 ? "pedido de acesso esperando" : "pedidos de acesso esperando"}`
      : "Minha conta";
  } catch (erro) {
    // Sem conexão: o aviso fica como estava até a próxima conferida.
  }
}

const formatarDataHora = (texto) =>
  new Date(texto).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const ROTULO_DA_SITUACAO = {
  pendente: { texto: "Pendente", classe: "prazo-em-aberto" },
  aprovado: { texto: "Aprovado", classe: "prazo-concluido" },
  recusado: { texto: "Recusado", classe: "prazo-atrasado" },
};

// Cada ação da janela de membros vira uma chamada a uma função do banco, que
// confere de novo se quem pediu é admin.
const ACOES = {
  aprovar: { rotulo: "Aprovar", chamar: (id) => supabase.rpc("decidir_acesso", { usuario: id, aprovar: true }) },
  recusar: { rotulo: "Recusar", chamar: (id) => supabase.rpc("decidir_acesso", { usuario: id, aprovar: false }) },
  remover: {
    rotulo: "Remover acesso",
    confirmar: (perfil) => ({
      titulo: `Remover o acesso de ${perfil.nome}?`,
      mensagem: "Ele deixa de ver o painel até ser aprovado de novo.",
      confirmarTexto: "Remover acesso",
      perigo: true,
    }),
    chamar: (id) => supabase.rpc("decidir_acesso", { usuario: id, aprovar: false }),
  },
  promover: {
    rotulo: "Tornar admin",
    confirmar: (perfil) => ({
      titulo: `Tornar ${perfil.nome} admin?`,
      mensagem: "Ele vai poder aprovar, remover e promover membros.",
      confirmarTexto: "Tornar admin",
    }),
    chamar: (id) => supabase.rpc("definir_admin", { usuario: id, tornar_admin: true }),
  },
  rebaixar: { rotulo: "Tirar admin", chamar: (id) => supabase.rpc("definir_admin", { usuario: id, tornar_admin: false }) },
  excluir: {
    rotulo: "Excluir",
    perigo: true,
    confirmar: (perfil) => ({
      titulo: `Excluir o cadastro de ${perfil.nome}?`,
      mensagem: "A conta é apagada. Para voltar, ele precisa pedir acesso de novo.",
      confirmarTexto: "Excluir",
      perigo: true,
    }),
    chamar: (id) => supabase.rpc("excluir_membro", { usuario: id }),
  },
};

// O que cada membro pode receber depende da situação dele e de quem está
// olhando. A master ninguém toca; outros admins, só a master; promover e
// rebaixar, também só a master. O banco confere tudo de novo.
function acoesDoMembro(perfil) {
  const souMaster = Boolean(meuPerfil?.master);
  if (perfil.master) return [];
  if (perfil.admin && !souMaster) return [];

  if (perfil.situacao === "pendente") return ["aprovar", "recusar", "excluir"];
  if (perfil.situacao === "recusado") return ["aprovar", "excluir"];
  if (perfil.admin) return ["rebaixar", "remover", "excluir"];
  return souMaster ? ["promover", "remover", "excluir"] : ["remover", "excluir"];
}

async function abrirGerenciador() {
  let perfis;
  try {
    perfis = await lerPerfis();
  } catch (erro) {
    abrirConteudo("Membros do painel", `<p class="aviso">Não foi possível carregar os membros.</p>`);
    return;
  }

  const { data } = await supabase.auth.getSession();
  const eu = data.session?.user.id;

  // Pendentes em cima: é o que o admin veio resolver.
  const ordem = { pendente: 0, aprovado: 1, recusado: 2 };
  perfis.sort((a, b) =>
    Number(b.master) - Number(a.master) || ordem[a.situacao] - ordem[b.situacao] || Number(b.admin) - Number(a.admin));

  const linhas = perfis.map((perfil) => {
    const situacao = ROTULO_DA_SITUACAO[perfil.situacao];
    const papel = perfil.master
      ? ' <span class="selo-admin selo-master">master</span>'
      : perfil.admin ? ' <span class="selo-admin">admin</span>' : "";
    const botoes = acoesDoMembro(perfil)
      .map((acao) => `<button type="button" class="${ACOES[acao].perigo ? "perigo" : ""}" data-id="${perfil.id}" data-acao="${acao}">${ACOES[acao].rotulo}</button>`)
      .join("");
    const acoes = perfil.id === eu
      ? '<span class="texto-suave">você</span>'
      : botoes || `<span class="texto-suave">${perfil.master ? "protegida" : "só a master altera"}</span>`;

    return `
      <tr>
        <td>${escapar(perfil.nome)}${papel}</td>
        <td>${escapar(perfil.email)}</td>
        <td class="coluna-data">${formatarDataHora(perfil.criado_em)}</td>
        <td class="${situacao.classe}">${situacao.texto}</td>
        <td class="acoes-de-linha">${acoes}</td>
      </tr>`;
  }).join("");

  abrirConteudo(
    "Membros do painel",
    `<table class="tabela-de-prazos">
       <thead><tr><th>Nome</th><th>E-mail</th><th>Pedido em</th><th>Situação</th><th></th></tr></thead>
       <tbody>${linhas}</tbody>
     </table>`,
  );

  document.querySelectorAll("#detalhes .acoes-de-linha [data-acao]").forEach((botao) => {
    botao.onclick = async () => {
      const acao = ACOES[botao.dataset.acao];
      const perfil = perfis.find((item) => item.id === botao.dataset.id);
      if (acao.confirmar && !(await confirmar(acao.confirmar(perfil)))) return;

      botao.disabled = true;
      const { error } = await acao.chamar(perfil.id);
      if (error) {
        botao.disabled = false;
        avisar({ titulo: "Não foi possível salvar", mensagem: "Confira a conexão e tente de novo." });
        return;
      }
      await atualizarContadorDeSolicitacoes();
      abrirGerenciador();
    };
  });
}

function iniciarAdmin() {
  if (adminIniciado) return;
  adminIniciado = true;

  const gerenciar = document.getElementById("gerenciarAcessos");
  gerenciar.hidden = false;
  gerenciar.onclick = () => {
    abrirMenuDaConta(false);
    abrirGerenciador();
  };

  atualizarContadorDeSolicitacoes();
  setInterval(atualizarContadorDeSolicitacoes, INTERVALO_DE_SOLICITACOES_MS);
}

// ===== Minha conta =====
//
// Janela de configurações: menu à esquerda com quem está conectado e as
// seções; à direita, linhas com rótulo e descrição de um lado e o controle
// do outro. O que precisa de formulário (e-mail, senha) abre logo abaixo da
// própria linha ao clicar em "Alterar", e fecha ao salvar ou cancelar.

const ROTULO_DO_PAPEL = { master: "Master", admin: "Admin", "": "Membro" };

const ICONES_DA_CONTA = {
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  seguranca: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/>',
  aparencia: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  escuro: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sistema: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};

const icone = (nome) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES_DA_CONTA[nome]}</svg>`;

const formatarDataLonga = (texto) =>
  texto ? new Date(texto).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

// Uma linha de ajuste: texto à esquerda, controle à direita e, opcionalmente,
// um formulário escondido que abre embaixo.
function linhaDeAjuste({ id = "", titulo, descricao = "", controle = "", formulario = "" }) {
  return `
    <div class="linha-de-ajuste"${id ? ` data-linha="${id}"` : ""}>
      <div class="texto-da-linha">
        <h3>${titulo}</h3>
        ${descricao ? `<p>${descricao}</p>` : ""}
      </div>
      <div class="controle-da-linha">${controle}</div>
      ${formulario ? `<div class="expansao-da-linha" hidden>${formulario}</div>` : ""}
    </div>`;
}

function campoSuave({ rotulo, nome, tipo = "text", valor = "", autocomplete = "off", placeholder = "" }) {
  const senha = tipo === "password";
  return `
    <label class="campo-suave">
      <span>${rotulo}</span>
      <div class="caixa-do-campo">
        <input name="${nome}" type="${tipo}" value="${escapar(valor)}" autocomplete="${autocomplete}" placeholder="${placeholder}">
        ${senha ? '<button type="button" class="mostrar-senha" aria-label="Mostrar senha">mostrar</button>' : ""}
      </div>
    </label>`;
}

const botoesDoFormulario = (salvar) => `
  <div class="acoes-do-formulario">
    <p class="erro-do-formulario" role="alert" hidden></p>
    <button type="button" class="botao-pequeno secundario" data-cancelar>Cancelar</button>
    <button type="submit" class="botao-pequeno">${salvar}</button>
  </div>`;

// ----- Perfil -----

function painelDePerfil() {
  const papel = papelDe(meuPerfil);
  return `
    <div class="identidade-no-perfil">
      <span class="avatar-grande" aria-hidden="true">${iniciais(meuPerfil.nome)}</span>
      <div>
        <strong data-nome-atual>${escapar(meuPerfil.nome)}</strong>
        <span data-email-atual>${escapar(meuPerfil.email)}</span>
      </div>
    </div>

    <form class="campo-com-salvar" data-formulario="nome" novalidate>
      ${campoSuave({ rotulo: "Nome", nome: "nome", valor: meuPerfil.nome, autocomplete: "name" })}
      <button type="submit" class="botao-pequeno" disabled>Salvar</button>
    </form>
    <p class="ajuda-do-campo">Como você aparece no painel e na lista de membros.</p>

    ${linhaDeAjuste({
      id: "email",
      titulo: "E-mail",
      descricao: `<span data-email-atual>${escapar(meuPerfil.email)}</span> · é com ele que você entra`,
      controle: '<button type="button" class="botao-pequeno secundario" data-abrir="email">Alterar</button>',
      formulario: `
        <form data-formulario="email" novalidate>
          <div class="campos-lado-a-lado">
            ${campoSuave({ rotulo: "Novo e-mail", nome: "email", tipo: "email", autocomplete: "username", placeholder: `nome${DOMINIO}` })}
            ${campoSuave({ rotulo: "Senha atual", nome: "senha", tipo: "password", autocomplete: "current-password" })}
          </div>
          ${botoesDoFormulario("Salvar e-mail")}
        </form>`,
    })}

    <h4 class="subtitulo-da-aba">Detalhes da conta</h4>
    ${linhaDeAjuste({ titulo: "Papel", controle: `<span class="etiqueta ${papel || "membro"}">${ROTULO_DO_PAPEL[papel]}</span>` })}
    ${linhaDeAjuste({ titulo: "Situação", controle: '<span class="etiqueta aprovado">Aprovado</span>' })}
    ${linhaDeAjuste({ titulo: "Membro desde", controle: `<span class="valor-da-linha">${formatarDataLonga(meuPerfil.criado_em)}</span>` })}
    ${linhaDeAjuste({
      titulo: "Aprovado em",
      controle: `<span class="valor-da-linha">${meuPerfil.master ? "Conta master" : formatarDataLonga(meuPerfil.decidido_em)}</span>`,
    })}`;
}

// ----- Segurança -----

// Força da senha pelo que costuma importar: tamanho e variedade.
function forcaDaSenha(senha) {
  if (!senha) return { nivel: 0, rotulo: "" };
  if (senha.length < 6) return { nivel: 1, rotulo: "Curta demais" };
  let pontos = 0;
  if (senha.length >= 8) pontos += 1;
  if (senha.length >= 12) pontos += 1;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos += 1;
  if (/\d/.test(senha)) pontos += 1;
  if (/[^A-Za-z0-9]/.test(senha)) pontos += 1;
  const nivel = Math.min(4, Math.max(1, pontos));
  return { nivel, rotulo: ["", "Fraca", "Razoável", "Boa", "Forte"][nivel] };
}

function painelDeSeguranca() {
  return `
    ${linhaDeAjuste({
      id: "senha",
      titulo: "Senha",
      descricao: "Pelo menos 8 caracteres, misturando letras, números e símbolos.",
      controle: '<button type="button" class="botao-pequeno secundario" data-abrir="senha">Alterar senha</button>',
      formulario: `
        <form data-formulario="senha" novalidate>
          ${campoSuave({ rotulo: "Senha atual", nome: "atual", tipo: "password", autocomplete: "current-password" })}
          <div class="campos-lado-a-lado">
            ${campoSuave({ rotulo: "Nova senha", nome: "nova", tipo: "password", autocomplete: "new-password" })}
            ${campoSuave({ rotulo: "Repita a nova senha", nome: "repetida", tipo: "password", autocomplete: "new-password" })}
          </div>
          <div class="forca-da-senha" data-nivel="0" aria-live="polite">
            <span></span><span></span><span></span><span></span>
            <small></small>
          </div>
          ${botoesDoFormulario("Salvar senha")}
        </form>`,
    })}

    ${linhaDeAjuste({
      titulo: "Outros dispositivos",
      descricao: "Esqueceu o painel aberto em outro computador ou na TV? Encerre as outras sessões; esta continua aberta.",
      controle: '<button type="button" class="botao-pequeno secundario" data-acao-da-conta="sair-dos-outros">Encerrar sessões</button>',
    })}

    ${linhaDeAjuste({
      titulo: "Sair desta conta",
      descricao: "Volta para a tela de entrada neste computador.",
      controle: '<button type="button" class="botao-pequeno perigo" data-acao-da-conta="sair">Sair</button>',
    })}`;
}

// ----- Aparência -----

const TEMAS = [
  { id: "claro", rotulo: "Claro" },
  { id: "escuro", rotulo: "Escuro" },
  { id: "sistema", rotulo: "Automático" },
];

function painelDeAparencia() {
  const atual = meuPerfil.tema ?? "claro";
  return linhaDeAjuste({
    titulo: "Tema",
    descricao: "Fica salvo na sua conta e vale em qualquer computador em que você entrar. Automático segue o sistema.",
    controle: `
      <div class="seletor-segmentado" role="radiogroup" aria-label="Tema">
        ${TEMAS.map(({ id, rotulo }) => `
          <button type="button" role="radio" data-tema="${id}" aria-checked="${atual === id}">
            ${icone(id)}${rotulo}
          </button>`).join("")}
      </div>`,
  });
}

// ----- Aviso rápido (canto de baixo da janela) -----

let temporizadorDoAviso = null;

function avisoRapido(texto) {
  const alvo = document.querySelector("#detalhes .aviso-rapido");
  if (!alvo) return;
  alvo.textContent = texto;
  alvo.classList.add("visivel");
  clearTimeout(temporizadorDoAviso);
  temporizadorDoAviso = setTimeout(() => alvo.classList.remove("visivel"), 2400);
}

// ----- Montagem e comportamento -----

const ABAS_DA_CONTA = [
  { id: "perfil", rotulo: "Perfil", montar: painelDePerfil },
  { id: "seguranca", rotulo: "Segurança", montar: painelDeSeguranca },
  { id: "aparencia", rotulo: "Aparência", montar: painelDeAparencia },
];

function erroNoFormulario(formulario, texto) {
  const alvo = formulario.querySelector(".erro-do-formulario");
  alvo.textContent = texto;
  alvo.hidden = !texto;
}

function abrirMinhaConta(abaInicial = "perfil") {
  const papel = papelDe(meuPerfil);

  abrirConteudo(
    "Minha conta",
    `<div class="conta">
      <nav class="menu-lateral-da-conta" aria-label="Seções da conta">
        <div class="quem-sou-no-menu">
          <span class="avatar-pequeno" aria-hidden="true">${iniciais(meuPerfil.nome)}</span>
          <strong data-nome-atual>${escapar(meuPerfil.nome)}</strong>
          <small>${ROTULO_DO_PAPEL[papel]} · configurações da conta</small>
        </div>
        ${ABAS_DA_CONTA.map(({ id, rotulo }) => `
          <button type="button" data-aba-da-conta="${id}">${icone(id)}${rotulo}</button>`).join("")}
        <button type="button" class="sair-no-menu" data-acao-da-conta="sair">${icone("sair")}Sair</button>
      </nav>
      <section class="conteudo-da-conta">
        <div class="topo-da-aba">
          <h2></h2>
          <button type="button" class="fechar-conta" aria-label="Fechar">${icone("fechar")}</button>
        </div>
        <div class="corpo-da-aba"></div>
        <div class="aviso-rapido" role="status" aria-live="polite"></div>
      </section>
    </div>`,
    { classe: "caixa-da-conta" },
  );

  const janela = document.querySelector("#detalhes .conta");
  const corpo = janela.querySelector(".corpo-da-aba");

  janela.querySelector(".fechar-conta").onclick = () => document.querySelector("#detalhes .fechar-detalhes").click();

  janela.querySelectorAll('[data-acao-da-conta="sair"]').forEach((botao) => {
    botao.onclick = sair;
  });

  function mostrarAba(id) {
    const aba = ABAS_DA_CONTA.find((item) => item.id === id) ?? ABAS_DA_CONTA[0];
    janela.querySelectorAll("[data-aba-da-conta]").forEach((botao) => {
      if (botao.dataset.abaDaConta === aba.id) botao.setAttribute("aria-current", "page");
      else botao.removeAttribute("aria-current");
    });
    janela.querySelector(".topo-da-aba h2").textContent = aba.rotulo;
    corpo.innerHTML = aba.montar();
    corpo.scrollTop = 0;
    ligarAba();
  }

  janela.querySelectorAll("[data-aba-da-conta]").forEach((botao) => {
    botao.onclick = () => mostrarAba(botao.dataset.abaDaConta);
  });

  function ligarAba() {
    // Mostrar/esconder senha
    corpo.querySelectorAll(".mostrar-senha").forEach((botao) => {
      botao.onclick = () => {
        const campo = botao.previousElementSibling;
        const mostrando = campo.type === "text";
        campo.type = mostrando ? "password" : "text";
        botao.textContent = mostrando ? "mostrar" : "esconder";
      };
    });

    // "Alterar" abre o formulário embaixo da linha; "Cancelar" fecha e limpa.
    corpo.querySelectorAll("[data-abrir]").forEach((botao) => {
      const linha = botao.closest(".linha-de-ajuste");
      const expansao = linha.querySelector(".expansao-da-linha");
      const formulario = expansao.querySelector("form");

      botao.onclick = () => {
        expansao.hidden = false;
        botao.hidden = true;
        formulario.querySelector("input").focus();
      };
      formulario.querySelector("[data-cancelar]").onclick = () => fecharExpansao(linha);
    });

    function fecharExpansao(linha) {
      const expansao = linha.querySelector(".expansao-da-linha");
      const formulario = expansao.querySelector("form");
      formulario.reset();
      erroNoFormulario(formulario, "");
      const medidor = formulario.querySelector(".forca-da-senha");
      if (medidor) {
        medidor.dataset.nivel = 0;
        medidor.querySelector("small").textContent = "";
      }
      expansao.hidden = true;
      linha.querySelector("[data-abrir]").hidden = false;
    }

    // Nome: o botão só acende quando o nome muda.
    const formularioDeNome = corpo.querySelector('[data-formulario="nome"]');
    if (formularioDeNome) {
      const botao = formularioDeNome.querySelector("button[type=submit]");
      formularioDeNome.nome.oninput = () => {
        const nome = formularioDeNome.nome.value.trim();
        botao.disabled = nome.length < 2 || nome === meuPerfil.nome;
      };
      formularioDeNome.onsubmit = async (evento) => {
        evento.preventDefault();
        const nome = formularioDeNome.nome.value.trim();
        if (nome.length < 2 || nome === meuPerfil.nome) return;

        ocupado(formularioDeNome, true);
        const { error } = await supabase.rpc("alterar_meu_nome", { novo_nome: nome });
        ocupado(formularioDeNome, false);
        if (error) {
          avisar({ titulo: "Não foi possível salvar o nome", mensagem: traduzirErroDaConta(error) });
          return;
        }

        meuPerfil.nome = nome;
        prepararMenuDaConta(meuPerfil);
        janela.querySelectorAll("[data-nome-atual]").forEach((alvo) => (alvo.textContent = nome));
        janela.querySelectorAll(".avatar-grande, .avatar-pequeno").forEach((alvo) => (alvo.textContent = iniciais(nome)));
        botao.disabled = true;
        avisoRapido("Nome salvo");
      };
    }

    const formularioDeEmail = corpo.querySelector('[data-formulario="email"]');
    if (formularioDeEmail) {
      formularioDeEmail.onsubmit = async (evento) => {
        evento.preventDefault();
        const email = formularioDeEmail.email.value.trim().toLowerCase();
        if (!email.endsWith(DOMINIO)) return erroNoFormulario(formularioDeEmail, `Use um e-mail ${DOMINIO}.`);
        if (email === meuPerfil.email) return erroNoFormulario(formularioDeEmail, "Esse já é o seu e-mail.");
        if (!formularioDeEmail.senha.value) return erroNoFormulario(formularioDeEmail, "Informe a senha atual.");

        ocupado(formularioDeEmail, true);
        const { error } = await supabase.rpc("alterar_meu_email", { novo_email: email, senha_atual: formularioDeEmail.senha.value });
        ocupado(formularioDeEmail, false);
        if (error) return erroNoFormulario(formularioDeEmail, traduzirErroDaConta(error));

        await supabase.auth.refreshSession(); // a sessão passa a carregar o e-mail novo
        meuPerfil.email = email;
        prepararMenuDaConta(meuPerfil);
        janela.querySelectorAll("[data-email-atual]").forEach((alvo) => (alvo.textContent = email));
        fecharExpansao(formularioDeEmail.closest(".linha-de-ajuste"));
        avisoRapido("E-mail alterado");
      };
    }

    const formularioDeSenha = corpo.querySelector('[data-formulario="senha"]');
    if (formularioDeSenha) {
      const medidor = formularioDeSenha.querySelector(".forca-da-senha");
      formularioDeSenha.nova.oninput = () => {
        const { nivel, rotulo } = forcaDaSenha(formularioDeSenha.nova.value);
        medidor.dataset.nivel = nivel;
        medidor.querySelector("small").textContent = rotulo;
      };

      formularioDeSenha.onsubmit = async (evento) => {
        evento.preventDefault();
        const { atual, nova, repetida } = formularioDeSenha;
        if (!atual.value) return erroNoFormulario(formularioDeSenha, "Informe a senha atual.");
        if (nova.value.length < 6) return erroNoFormulario(formularioDeSenha, "A nova senha precisa de pelo menos 6 caracteres.");
        if (nova.value !== repetida.value) return erroNoFormulario(formularioDeSenha, "As duas senhas novas não são iguais.");

        ocupado(formularioDeSenha, true);
        const { error } = await supabase.rpc("alterar_minha_senha", { senha_atual: atual.value, nova_senha: nova.value });
        ocupado(formularioDeSenha, false);
        if (error) return erroNoFormulario(formularioDeSenha, traduzirErroDaConta(error));

        fecharExpansao(formularioDeSenha.closest(".linha-de-ajuste"));
        avisoRapido("Senha alterada");
      };
    }

    const sairDosOutros = corpo.querySelector('[data-acao-da-conta="sair-dos-outros"]');
    if (sairDosOutros) {
      sairDosOutros.onclick = async () => {
        const encerrar = await confirmar({
          titulo: "Encerrar as outras sessões?",
          mensagem: "Quem estiver com o painel aberto com a sua conta em outro lugar vai precisar entrar de novo.",
          confirmarTexto: "Encerrar sessões",
        });
        if (!encerrar) return;

        sairDosOutros.disabled = true;
        const { error } = await supabase.auth.signOut({ scope: "others" });
        sairDosOutros.disabled = false;
        if (error) {
          avisar({ titulo: "Não foi possível encerrar", mensagem: "Tente de novo em instantes." });
          return;
        }
        avisoRapido("Só esta sessão continua aberta");
      };
    }

    const sairDaqui = corpo.querySelector('[data-acao-da-conta="sair"]');
    if (sairDaqui) sairDaqui.onclick = sair;

    corpo.querySelectorAll("[data-tema]").forEach((botao) => {
      botao.onclick = async () => {
        const tema = botao.dataset.tema;
        corpo.querySelectorAll("[data-tema]").forEach((outro) => outro.setAttribute("aria-checked", String(outro === botao)));

        meuPerfil.tema = tema;
        aplicarPreferenciaDeTema(tema);

        const { error } = await supabase.rpc("salvar_tema", { tema });
        avisoRapido(error ? "Vale neste computador, mas não foi salvo na conta" : "Tema salvo na sua conta");
      };
    });
  }

  mostrarAba(abaInicial);
}

// "Automático" segue o tema do sistema e acompanha se ele mudar (o Windows
// que escurece à noite, por exemplo).
const temaDoSistema = window.matchMedia("(prefers-color-scheme: dark)");

function aplicarPreferenciaDeTema(preferencia) {
  const tema = preferencia === "sistema" ? (temaDoSistema.matches ? "escuro" : "claro") : preferencia;
  if (tema !== nomeDoTemaAtual()) {
    aplicarTema(tema);
    if (painelIniciado) aoTrocarTema();
  }
}

temaDoSistema.addEventListener("change", () => {
  if (meuPerfil?.tema === "sistema") aplicarPreferenciaDeTema("sistema");
});

function traduzirErroDaConta(erro) {
  const mensagem = erro?.message ?? "";
  if (/senha atual incorreta/i.test(mensagem)) return "Senha atual incorreta.";
  if (/já tem cadastro/i.test(mensagem)) return "Esse e-mail já é de outra conta.";
  if (/soumaster/i.test(mensagem)) return `Use um e-mail ${DOMINIO}.`;
  if (/pelo menos 6/i.test(mensagem)) return "A nova senha precisa de pelo menos 6 caracteres.";
  if (/informe seu nome/i.test(mensagem)) return "Informe pelo menos 2 caracteres.";
  return traduzirErro(erro);
}

// Chamado pelo painel: só começa a buscar e desenhar depois do acesso aprovado.
export function exigirAcesso(iniciarPainel, redesenhar = () => {}) {
  aoAprovar = iniciarPainel;
  aoTrocarTema = redesenhar;

  // Saiu em outra aba, ou a sessão expirou de vez: volta para a entrada.
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") window.location.reload();
  });

  verificarAcesso();
}
