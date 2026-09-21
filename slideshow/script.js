// ===== Configuração dos slides =====

const duracaoPadraoPrint = 60000; // cada imagem fica 1 minuto na tela (ms)
const duracaoImagemMasterProjetos = 60000; // Master Projetos também fica 1 minuto
const intervaloEntreExibicoesMaster = 5; // a cada quantos prints o slide Master Projetos aparece de novo

const imagemMasterProjetos = "imagens/master-projetos.png";

// Coloque aqui os nomes dos prints que forem enviados, dentro da pasta "imagens/"
const prints = [
  "imagens/print1.png",
  "imagens/print2.png",
  "imagens/print3.png",
  "imagens/print4.png",
  "imagens/print5.png",
  "imagens/print6.png",
  "imagens/print7.png",
  "imagens/print8.png",
  "imagens/print9.png",
  "imagens/print10.png",
];

// ===== Monta a sequência final de slides, intercalando o Master Projetos =====

const slideMasterProjetos = { tipo: "master-projetos", duracao: duracaoImagemMasterProjetos };

function montarSequenciaDeSlides() {
  const sequencia = [slideMasterProjetos];

  prints.forEach((caminhoDoPrint, indice) => {
    sequencia.push({ tipo: "print", caminho: caminhoDoPrint, duracao: duracaoPadraoPrint });

    const chegouNoIntervalo = (indice + 1) % intervaloEntreExibicoesMaster === 0;
    if (chegouNoIntervalo) {
      sequencia.push(slideMasterProjetos);
    }
  });

  return sequencia;
}

function montarHtmlDoSlide(dadosDoSlide) {
  if (dadosDoSlide.tipo === "master-projetos") {
    return `
      <div class="conteudo-master-projetos">
        <img src="${imagemMasterProjetos}" alt="Master Projetos">
      </div>
    `;
  }

  return `<img class="imagem-print" src="${dadosDoSlide.caminho}" alt="print">`;
}

const sequenciaDeSlides = montarSequenciaDeSlides();

// ===== Controle do slideshow =====

const elementosDeSlide = [document.getElementById("slideAtual"), document.getElementById("slideProximo")];

const intervaloDeVerificacaoMs = 250; // frequência com que checamos se já é hora de trocar o slide

let indiceSlideAtual = 0;
let indiceElementoVisivel = 0; // alterna entre 0 e 1, indicando qual slide está na frente
let horarioDaUltimaTroca = 0;

function proximoIndice(indice) {
  return (indice + 1) % sequenciaDeSlides.length;
}

function indiceAnterior(indice) {
  return (indice - 1 + sequenciaDeSlides.length) % sequenciaDeSlides.length;
}

function exibirSlideInicial() {
  const elementoVisivel = elementosDeSlide[indiceElementoVisivel];
  elementoVisivel.innerHTML = montarHtmlDoSlide(sequenciaDeSlides[indiceSlideAtual]);
  elementoVisivel.classList.add("slide-visivel");

  horarioDaUltimaTroca = Date.now();
  setInterval(verificarSeDeveTrocarDeSlide, intervaloDeVerificacaoMs);
}

// baseado no horário real (Date.now), em vez de encadear setTimeout, para não perder o passo
// se a aba ficar em segundo plano e o navegador atrasar os timers
function verificarSeDeveTrocarDeSlide() {
  const duracaoDoSlideAtual = sequenciaDeSlides[indiceSlideAtual].duracao;
  const tempoNoSlideAtual = Date.now() - horarioDaUltimaTroca;

  if (tempoNoSlideAtual >= duracaoDoSlideAtual) {
    trocarSlide(proximoIndice(indiceSlideAtual), "direita");
  }
}

function irParaProximoSlide() {
  trocarSlide(proximoIndice(indiceSlideAtual), "direita");
}

function irParaSlideAnterior() {
  trocarSlide(indiceAnterior(indiceSlideAtual), "esquerda");
}

function trocarSlide(indiceDoProximo, ladoDeEntrada) {
  const elementoQueSai = elementosDeSlide[indiceElementoVisivel];
  const elementoQueEntra = elementosDeSlide[1 - indiceElementoVisivel];
  const dadosDoProximoSlide = sequenciaDeSlides[indiceDoProximo];

  const classeLadoDeEntrada = ladoDeEntrada === "direita" ? "slide-fora-direita" : "slide-fora-esquerda";
  const classeLadoDeSaida = ladoDeEntrada === "direita" ? "slide-fora-esquerda" : "slide-fora-direita";

  elementoQueEntra.innerHTML = montarHtmlDoSlide(dadosDoProximoSlide);
  elementoQueEntra.classList.remove("slide-fora-direita", "slide-fora-esquerda", "slide-visivel");
  elementoQueEntra.classList.add(classeLadoDeEntrada);

  // força o navegador a aplicar a classe antes de animar
  void elementoQueEntra.offsetWidth;

  elementoQueSai.classList.remove("slide-visivel");
  elementoQueSai.classList.add(classeLadoDeSaida);
  elementoQueEntra.classList.remove(classeLadoDeEntrada);
  elementoQueEntra.classList.add("slide-visivel");

  tentarAtivarEasterEgg();

  indiceSlideAtual = indiceDoProximo;
  indiceElementoVisivel = 1 - indiceElementoVisivel;
  horarioDaUltimaTroca = Date.now();
}

exibirSlideInicial();

// ===== Controle pelo teclado =====

document.addEventListener("keydown", (evento) => {
  if (evento.repeat) return; // ignora repetição automática de tecla segurada

  if (evento.code === "ArrowRight") irParaProximoSlide();
  if (evento.code === "ArrowLeft") irParaSlideAnterior();

  if (evento.code === "Space") {
    evento.preventDefault(); // evita rolar a página
    ativarEasterEggAleatorio();
  }
});

// ===== Easter eggs aleatórios =====

const chanceDeAparecerEasterEgg = 0.01; // 1% de chance a cada troca de slide, deve ser raríssimo
const intervaloMinimoEntreEasterEggsMs = 60 * 60 * 1000; // só pode sortear de novo depois de 1 hora

const duracaoDeCadaImagemMs = 5; // flash subliminar, quase imperceptível
const imagensDoEasterEgg = [
  "imagens/batida1.png",
  "imagens/batida2.png",
  "imagens/batida3.png",
];

const containerEasterEgg = document.getElementById("containerEasterEgg");
const imagemEasterEgg = document.getElementById("imagemEasterEgg");

// pré-carrega as imagens para não haver atraso na hora de exibir o flash
imagensDoEasterEgg.forEach((caminhoDaImagem) => {
  new Image().src = caminhoDaImagem;
});

let horarioDoUltimoEasterEgg = 0; // 0 permite acontecer assim que a página carrega
let easterEggEmAndamento = false; // evita que cliques repetidos no espaço sobreponham vários flashes

function tentarAtivarEasterEgg() {
  const passouTempoSuficiente = Date.now() - horarioDoUltimoEasterEgg >= intervaloMinimoEntreEasterEggsMs;
  const sorteou = Math.random() < chanceDeAparecerEasterEgg;

  if (passouTempoSuficiente && sorteou) ativarEasterEggAleatorio();
}

function ativarEasterEggAleatorio() {
  if (easterEggEmAndamento) return;

  easterEggEmAndamento = true;
  horarioDoUltimoEasterEgg = Date.now();
  mostrarFlashDeUmaImagem();
}

function mostrarFlashDeUmaImagem() {
  const imagemSorteada = imagensDoEasterEgg[Math.floor(Math.random() * imagensDoEasterEgg.length)];

  containerEasterEgg.classList.remove("easter-egg-escondido");
  imagemEasterEgg.src = imagemSorteada;

  setTimeout(() => {
    containerEasterEgg.classList.add("easter-egg-escondido");
    easterEggEmAndamento = false;
  }, duracaoDeCadaImagemMs);
}
