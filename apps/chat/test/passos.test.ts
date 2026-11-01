import type { ChamadaFerramenta } from '@agente-compras/shared';
import { describe, expect, it } from 'vitest';
import { descreverPasso, resumoTecnico } from '../src/passos';

function chamada(parcial: Partial<ChamadaFerramenta> & { nome: string }): ChamadaFerramenta {
  return { argumentos: {}, duracao_ms: 10, ok: true, erro_codigo: null, ...parcial };
}

const BUSCA_LAPTOP = {
  termo: 'laptop',
  total: 2,
  produtos: [
    { id: 81, preco_usd: 1099.99 },
    { id: 78, preco_usd: 1999.99 },
  ],
};

describe('passos do agente em linguagem de quem compra', () => {
  it('busca: quantos resultados e a faixa de preço, lidos do resultado da ferramenta', () => {
    expect(
      descreverPasso(chamada({ nome: 'buscar_produtos', resultado: BUSCA_LAPTOP })).texto,
    ).toBe('Consultei o catálogo: 2 resultados para "laptop", de US$ 1.099,99 a US$ 1.999,99');
  });

  it('busca vazia diz que não achou nada', () => {
    const vazia = { termo: 'notebook', total: 0, produtos: [] };
    expect(descreverPasso(chamada({ nome: 'buscar_produtos', resultado: vazia })).texto).toBe(
      'Consultei o catálogo: nada para "notebook"',
    );
  });

  it('política: teto da categoria pedida, ou que ela está bloqueada', () => {
    const politica = {
      categorias: [
        { categoria: 'laptops', permitida: true, teto_unitario_usd: 2500, alcada_usd: null },
        { categoria: 'motorcycle', permitida: false, teto_unitario_usd: null, alcada_usd: null },
      ],
    };
    const teto = chamada({
      nome: 'consultar_politica',
      argumentos: { categoria: 'laptops' },
      resultado: politica,
    });
    const bloqueada = chamada({
      nome: 'consultar_politica',
      argumentos: { categoria: 'motorcycles' },
      resultado: {
        categorias: [
          { categoria: 'motorcycle', permitida: false, teto_unitario_usd: null, alcada_usd: null },
        ],
      },
    });

    expect(descreverPasso(teto).texto).toBe(
      'Conferi a política de compras: teto de US$ 2.500,00 por unidade em Notebooks',
    );
    expect(descreverPasso(bloqueada)).toMatchObject({
      texto: 'Conferi a política de compras: a categoria Motos está bloqueada',
      barrou: true,
    });
    expect(descreverPasso(teto).barrou).toBe(false);
  });

  it('gravação mostra o número que a ferramenta devolveu', () => {
    const criada = { numero: 'REQ-000001', status: 'aprovada', valor_total_texto: 'US$ 3.299,97' };
    const passo = chamada({ nome: 'criar_requisicao', resultado: criada });

    expect(descreverPasso(passo)).toEqual({
      icone: 'gravado',
      texto: 'Gravei a requisição REQ-000001',
      falhou: false,
      barrou: false,
    });
    expect(resumoTecnico(passo)).toBe('REQ-000001 · aprovada · total US$ 3.299,97');
  });

  it('política barrando a gravação aparece como passo barrado', () => {
    const barrada = chamada({
      nome: 'criar_requisicao',
      ok: false,
      erro_codigo: 'REGRA_VIOLADA',
      resultado: { codigo: 'REGRA_VIOLADA', mensagem: 'A categoria motorcycle está bloqueada.' },
    });

    expect(descreverPasso(barrada)).toMatchObject({ icone: 'barrado', falhou: true, barrou: true });
    expect(resumoTecnico(barrada)).toBe('REGRA_VIOLADA: A categoria motorcycle está bloqueada.');
  });

  it('sem resultado na trilha (formato antigo), cai numa frase genérica', () => {
    expect(descreverPasso(chamada({ nome: 'buscar_produtos' })).texto).toBe('Consultei o catálogo');
  });
});
