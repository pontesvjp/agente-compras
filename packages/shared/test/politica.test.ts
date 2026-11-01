import { describe, expect, it } from 'vitest';
import {
  avaliarRequisicao,
  type ItemParaAvaliar,
  type PoliticaCompra,
  type RegraCategoria,
} from '../src/politica.js';

function regra(parcial: Partial<RegraCategoria> & { categoria: string }): RegraCategoria {
  return {
    permitida: true,
    teto_unitario_centavos: null,
    quantidade_maxima: null,
    alcada_centavos: null,
    motivo: null,
    ...parcial,
  };
}

const politica: PoliticaCompra = {
  criterio_escolha: 'menor_preco',
  alcada_centavos: 500_000,
  valor_maximo_requisicao_centavos: 2_000_000,
  regras: new Map([
    [
      'laptops',
      regra({ categoria: 'laptops', teto_unitario_centavos: 250_000, quantidade_maxima: 20 }),
    ],
    ['furniture', regra({ categoria: 'furniture', alcada_centavos: 200_000 })],
    [
      'motorcycle',
      regra({
        categoria: 'motorcycle',
        permitida: false,
        motivo: 'veículo segue o processo de frota',
      }),
    ],
  ]),
};

function item(parcial: Partial<ItemParaAvaliar> = {}): ItemParaAvaliar {
  return {
    produto_id: 81,
    titulo: 'Lenovo Yoga 920',
    categoria: 'laptops',
    preco_centavos: 109_999,
    estoque: 40,
    pedido_minimo: 1,
    quantidade: 3,
    teto_pedido_centavos: 200_000,
    ...parcial,
  };
}

function regrasVioladas(itens: ItemParaAvaliar[]) {
  const avaliacao = avaliarRequisicao(itens, politica);
  return avaliacao.aprovavel ? [] : avaliacao.violacoes.map((v) => v.regra);
}

describe('política de compras', () => {
  it('aprova o pedido de exemplo dentro da alçada, com total em centavos', () => {
    const avaliacao = avaliarRequisicao([item()], politica);

    expect(avaliacao).toMatchObject({
      aprovavel: true,
      status: 'aprovada',
      valor_total_centavos: 329_997,
      regras_aplicadas: { alcada_centavos: 500_000, origem_alcada: 'geral' },
    });
  });

  it('manda para aprovação quando o total passa a alçada geral', () => {
    const avaliacao = avaliarRequisicao(
      [item({ produto_id: 78, titulo: 'MacBook Pro 14', preco_centavos: 199_999 })],
      politica,
    );

    expect(avaliacao).toMatchObject({ aprovavel: true, status: 'em_aprovacao' });
  });

  it('usa a alçada da categoria quando ela existe', () => {
    const cadeiras = item({
      produto_id: 14,
      titulo: 'Knoll Saarinen',
      categoria: 'furniture',
      preco_centavos: 49_999,
      pedido_minimo: 5,
      quantidade: 5,
      teto_pedido_centavos: null,
    });

    expect(avaliarRequisicao([cadeiras], politica)).toMatchObject({
      status: 'em_aprovacao',
      regras_aplicadas: { alcada_centavos: 200_000, origem_alcada: 'categoria furniture' },
    });
  });

  it('barra categoria bloqueada com o motivo cadastrado', () => {
    const avaliacao = avaliarRequisicao(
      [item({ categoria: 'motorcycle', quantidade: 1, teto_pedido_centavos: null })],
      politica,
    );

    expect(avaliacao.aprovavel).toBe(false);
    if (!avaliacao.aprovavel) {
      expect(avaliacao.violacoes[0]?.mensagem).toContain('veículo segue o processo de frota');
    }
  });

  it('barra preço acima do limite que a pessoa pediu', () => {
    expect(regrasVioladas([item({ teto_pedido_centavos: 100_000 })])).toEqual([
      'acima_do_teto_do_pedido',
    ]);
  });

  it('barra preço acima do teto da categoria', () => {
    expect(
      regrasVioladas([
        item({ preco_centavos: 299_999, teto_pedido_centavos: null, quantidade: 1 }),
      ]),
    ).toEqual(['acima_do_teto_da_categoria']);
  });

  it('barra quantidade acima do máximo da categoria', () => {
    expect(regrasVioladas([item({ quantidade: 21, estoque: 100 })])).toContain(
      'acima_da_quantidade_maxima',
    );
  });

  it('barra quantidade abaixo do pedido mínimo do fornecedor', () => {
    expect(regrasVioladas([item({ pedido_minimo: 5, quantidade: 2 })])).toEqual([
      'abaixo_do_pedido_minimo',
    ]);
  });

  it('barra quantidade acima do estoque', () => {
    expect(regrasVioladas([item({ estoque: 2 })])).toEqual(['estoque_insuficiente']);
  });

  it('barra o total acima do valor máximo por requisição', () => {
    const caro = item({ preco_centavos: 240_000, quantidade: 9, teto_pedido_centavos: null });

    expect(regrasVioladas([caro])).toEqual(['acima_do_valor_maximo']);
  });

  it('junta as violações de todos os itens numa resposta só', () => {
    const violacoes = regrasVioladas([
      item({ teto_pedido_centavos: 100_000 }),
      item({ produto_id: 113, categoria: 'motorcycle', teto_pedido_centavos: null }),
    ]);

    expect(violacoes).toEqual(['acima_do_teto_do_pedido', 'categoria_bloqueada']);
  });
});
