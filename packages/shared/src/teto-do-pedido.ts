import { paraCentavos } from './dinheiro.js';
import type { ItemParaAvaliar } from './politica.js';

const NUMERO = String.raw`\d+(?:[.,]\d+)*`;
const MIL = String.raw`(\s*(?:mil|k)\b)?`;
/** "US$ 2.000", "U$ 50", "USD 700", "$1,099.99". O "$" sozinho não pode vir depois de letra (R$). */
const MOEDA_ANTES = new RegExp(
  String.raw`(?:US\$|U\$|USD|(?<!\p{L})\$)\s*(${NUMERO})${MIL}`,
  'giu',
);
/** "50 dólares", "700 USD". */
const MOEDA_DEPOIS = new RegExp(
  String.raw`(?<![\d.,])(${NUMERO})${MIL}\s*(?:dólares|dolares|dólar|dolar|USD)`,
  'giu',
);

/**
 * Lê "1.099,99", "1,099.99", "2.000" e "50". Separador seguido de 3 dígitos é de milhar;
 * seguido de 1 ou 2, é o decimal.
 */
function lerNumero(bruto: string): number {
  const separador = Math.max(bruto.lastIndexOf('.'), bruto.lastIndexOf(','));
  if (separador === -1) return Number(bruto);
  const inteiro = bruto.slice(0, separador).replace(/[.,]/g, '');
  const final = bruto.slice(separador + 1);
  return final.length <= 2 ? Number(`${inteiro}.${final}`) : Number(`${inteiro}${final}`);
}

/**
 * O maior valor em dólar escrito no pedido, em centavos, ou null se não há nenhum.
 * Nenhum item pode custar mais que isso por unidade, mesmo que o modelo esqueça o limite.
 */
export function tetoCitadoNoPedido(pedido: string): number | null {
  const valores = [...pedido.matchAll(MOEDA_ANTES), ...pedido.matchAll(MOEDA_DEPOIS)]
    .map(([, numero = '', mil]) => lerNumero(numero) * (mil ? 1000 : 1))
    .filter((valor) => Number.isFinite(valor) && valor > 0)
    .map(paraCentavos);
  return valores.length === 0 ? null : Math.max(...valores);
}

/** O teto de cada item fica com o menor entre o que o modelo mandou e o citado no pedido. */
export function aplicarTetoCitado(
  itens: ItemParaAvaliar[],
  tetoCitado: number | null,
): ItemParaAvaliar[] {
  if (tetoCitado === null) return itens;
  return itens.map((item) => ({
    ...item,
    teto_pedido_centavos: Math.min(item.teto_pedido_centavos ?? tetoCitado, tetoCitado),
  }));
}
