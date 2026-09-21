// Regra única do ciclo de 48h, usada tanto pelo cron que regenera o relatório
// quanto pela rota de leitura que define por quanto tempo o cache vale.

const INTERVALO_EM_DIAS = 2; // 48 horas
const FUSO_DO_BRASIL_EM_HORAS = -3;
const HORA_DE_EXPIRAR_O_CACHE = 1; // 01h de Brasília: a geração da meia-noite já terminou

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;
const UMA_HORA_EM_MS = 60 * 60 * 1000;

function diasDesdeAEpoca(data) {
  return Math.floor(data.getTime() / UM_DIA_EM_MS);
}

// O cron roda todo dia à meia-noite, mas só regenera em dias alternados.
export function ehDiaDeRegenerar(data) {
  return diasDesdeAEpoca(data) % INTERVALO_EM_DIAS === 0;
}

// Próxima expiração do cache: 01h de Brasília do próximo dia de regeneração,
// para o painel seguir mostrando o dado anterior enquanto o novo é gerado.
export function calcularProximaAtualizacao(agora) {
  const horarioDeBrasilia = new Date(agora.getTime() + FUSO_DO_BRASIL_EM_HORAS * UMA_HORA_EM_MS);

  for (let diasAFrente = 1; diasAFrente <= INTERVALO_EM_DIAS; diasAFrente += 1) {
    const candidato = new Date(horarioDeBrasilia);
    candidato.setUTCHours(HORA_DE_EXPIRAR_O_CACHE, 0, 0, 0);
    candidato.setUTCDate(candidato.getUTCDate() + diasAFrente);

    const emUtc = new Date(candidato.getTime() - FUSO_DO_BRASIL_EM_HORAS * UMA_HORA_EM_MS);
    if (ehDiaDeRegenerar(emUtc)) return emUtc;
  }

  // Inalcançável: dentro de INTERVALO_EM_DIAS sempre existe um dia de regeneração.
  throw new Error("Nenhum dia de regeneração encontrado no ciclo");
}
