import { describe, expect, it } from 'vitest';
import type { ItemParaAvaliar } from '../src/politica.js';
import { aplicarTetoCitado, tetoCitadoNoPedido } from '../src/teto-do-pedido.js';

describe('tetoCitadoNoPedido', () => {
  it.each([
    ['10 iPhones até US$ 50', 5_000],
    ['Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.', 200_000],
    ['um notebook de no máximo US$ 1.099,99', 109_999],
    ['monitor até $1,099.99', 109_999],
    ['monitor até US$ 1,099.99', 109_999],
    ['até US$ 2.000,00 por unidade', 200_000],
    ['2 mil dólares no total', 200_000],
    ['4 tablets até U$ 700', 70_000],
    ['cadeira até 600 dólares', 60_000],
    ['teclado até USD 49.90', 4_990],
    ['orçamento de US$ 2 mil', 200_000],
    ['laptop até US$ 1.5k', 150_000],
    ['2 monitores até US$ 300 e 1 teclado até US$ 50', 30_000],
  ])('"%s" -> %i centavos', (pedido, esperado) => {
    expect(tetoCitadoNoPedido(pedido)).toBe(esperado);
  });

  it.each([
    '10 monitores para o time de desenvolvimento',
    'monitor de 27 polegadas, 2 unidades',
    'cadeira até R$ 600',
    'notebook até R$ 500,00',
  ])('sem valor em dólar: "%s" -> null', (pedido) => {
    expect(tetoCitadoNoPedido(pedido)).toBeNull();
  });
});

describe('aplicarTetoCitado', () => {
  const item = (teto: number | null): ItemParaAvaliar => ({
    produto_id: 1,
    titulo: 'iPhone 9',
    categoria: 'smartphones',
    preco_centavos: 19_999,
    estoque: 100,
    pedido_minimo: 1,
    quantidade: 10,
    teto_pedido_centavos: teto,
  });

  it('o modelo esqueceu o limite: vale o citado no pedido', () => {
    expect(aplicarTetoCitado([item(null)], 5_000)[0]?.teto_pedido_centavos).toBe(5_000);
  });

  it('o modelo mandou um limite maior que o do pedido: vale o do pedido', () => {
    expect(aplicarTetoCitado([item(200_000)], 5_000)[0]?.teto_pedido_centavos).toBe(5_000);
  });

  it('o modelo mandou um limite menor (um de dois itens): vale o dele', () => {
    expect(aplicarTetoCitado([item(5_000)], 30_000)[0]?.teto_pedido_centavos).toBe(5_000);
  });

  it('pedido sem valor: o item fica como veio', () => {
    expect(aplicarTetoCitado([item(null)], null)[0]?.teto_pedido_centavos).toBeNull();
  });
});
