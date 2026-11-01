import type { RequisicaoGravada } from '@agente-compras/db';
import type { RespostaPedido } from '@agente-compras/shared';
import { describe, expect, it } from 'vitest';
import { conferir, type Persona } from './avaliar.js';

const LAPTOPS: Persona = {
  id: 1,
  persona: 'teste',
  pedido: '3 laptops até US$ 2.000',
  esperado: { resultado: 'criada', quantidade: 3, categoria: 'laptops', preco_maximo_usd: 2000 },
};

function gravada(parcial: Partial<RequisicaoGravada['itens'][number]> = {}): RequisicaoGravada {
  return {
    id: 1,
    numero: 'REQ-000001',
    solicitante: null,
    justificativa: 'x',
    status: 'aprovada',
    valor_total_centavos: 329_997,
    moeda: 'USD',
    alcada_centavos: 500_000,
    origem_alcada: 'geral',
    atendimento_id: 'a',
    criado_em: new Date(),
    itens: [
      {
        produto_id: 81,
        titulo: 'Lenovo Yoga 920',
        categoria: 'laptops',
        quantidade: 3,
        preco_unitario_centavos: 109_999,
        subtotal_centavos: 329_997,
        ...parcial,
      },
    ],
  };
}

function resposta(parcial: Partial<RespostaPedido>): RespostaPedido {
  return {
    resultado: 'criada',
    atendimento_id: 'a',
    requisicao: null,
    mensagem: '',
    ferramentas: [],
    ...parcial,
  };
}

const respostaCriada = resposta({
  requisicao: {
    id: 1,
    numero: 'REQ-000001',
    status: 'aprovada',
    solicitante: null,
    justificativa: 'x',
    itens: [],
    valor_total: 3299.97,
    moeda: 'USD',
    alcada: { valor_usd: 5000, origem: 'geral' },
    atendimento_id: 'a',
    criado_em: '2026-11-01T00:00:00.000Z',
  },
});

describe('conferência da avaliação, feita no banco', () => {
  it('aceita a requisição gravada que cumpre quantidade, categoria e teto', () => {
    expect(conferir(LAPTOPS, respostaCriada, gravada())).toEqual([]);
  });

  it('acusa preço acima do teto e quantidade errada, lidos do banco', () => {
    const falhas = conferir(
      LAPTOPS,
      respostaCriada,
      gravada({ quantidade: 2, preco_unitario_centavos: 249_999 }),
    );

    expect(falhas).toEqual(['quantidade 2, esperada 3', 'item 81 passa de US$ 2000']);
  });

  it('acusa gravação num pedido que não devia ser atendido', () => {
    const moto: Persona = {
      id: 6,
      persona: 'teste',
      pedido: 'uma moto',
      esperado: { resultado: 'nao_atendida', mensagem_cita: ['frota'] },
    };

    const falhas = conferir(
      moto,
      resposta({ resultado: 'nao_atendida', mensagem: 'Veículo segue o processo de FROTA.' }),
      gravada(),
    );

    expect(falhas).toEqual(['gravou REQ-000001, mas o pedido não devia ser atendido']);
  });

  it('compara a mensagem sem diferenciar acento e maiúscula', () => {
    const cadeiras: Persona = {
      id: 4,
      persona: 'teste',
      pedido: '2 cadeiras',
      esperado: { resultado: 'nao_atendida', mensagem_cita: ['mínimo'] },
    };

    const falhas = conferir(
      cadeiras,
      resposta({ resultado: 'nao_atendida', mensagem: 'O pedido MINIMO é de 5 unidades.' }),
      null,
    );

    expect(falhas).toEqual([]);
  });
});
