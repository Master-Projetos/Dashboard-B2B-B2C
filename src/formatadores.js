const numero = new Intl.NumberFormat("pt-BR");
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCompacta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 2,
});
const horario = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export const formatarNumero = (valor) => numero.format(valor);
export const formatarMoeda = (valor) => moeda.format(valor);
export const formatarMoedaCompacta = (valor) => moedaCompacta.format(valor);
export const formatarHorario = (data) => horario.format(data);
export const formatarDataCurta = (data) => dataCurta.format(data);

export function formatarPorcentagem(valor, casas = 1) {
  return `${valor.toFixed(casas).replace(".", ",")}%`;
}

const NOMES_DOS_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "2026-06" -> "jun/26"
export function formatarMes(chaveDoMes) {
  const [ano, mes] = chaveDoMes.split("-");
  return `${NOMES_DOS_MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}
