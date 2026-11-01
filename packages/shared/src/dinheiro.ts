/** Converte um valor decimal em dólar (ex.: 1099.99) para centavos inteiros. */
export function paraCentavos(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new RangeError(`Valor monetário inválido: ${valor}`);
  }
  return Math.round(valor * 100);
}

/** Lê o numeric(12,2) que o Postgres devolve como texto ("2500.00") sem passar por float. */
export function decimalParaCentavos(texto: string): number {
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!partes) throw new RangeError(`Decimal inválido: ${texto}`);
  const [, inteiro = '0', fracao = ''] = partes;
  return Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
}

/** Valor em dólar para mostrar ao modelo como número: 109999 -> 1099.99. */
export function centavosParaUsd(centavos: number): number {
  return Number(centavosParaDecimal(centavos));
}

/** Texto decimal para gravar em numeric(12,2), sem passar por float: 109999 -> "1099.99". */
export function centavosParaDecimal(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError(`Centavos inválidos: ${centavos}`);
  }
  const inteiro = Math.trunc(centavos / 100);
  const resto = centavos % 100;
  return `${inteiro}.${resto.toString().padStart(2, '0')}`;
}

/** Texto para o usuário: 109999 -> "US$ 1.099,99". */
export function formatarUsd(centavos: number): string {
  const [inteiro = '0', fracao = '00'] = centavosParaDecimal(centavos).split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `US$ ${comMilhar},${fracao}`;
}
