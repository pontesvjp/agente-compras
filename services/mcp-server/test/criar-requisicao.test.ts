import { randomUUID } from 'node:crypto';
import { iniciarAtendimento, type Pool } from '@agente-compras/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prepararBancoTeste } from '../../../packages/db/test/apoio-banco.js';
import { executarCriarRequisicao } from '../src/ferramentas/criar-requisicao.js';
import {
  BASE_URL,
  clienteComMock,
  erroDaFerramenta,
  fixture,
  loggerSilencioso,
  novoMock,
} from './apoio.js';

let pool: Pool;
let agente = novoMock();
beforeAll(async () => {
  pool = await prepararBancoTeste();
});
afterAll(async () => {
  await pool.end();
});
afterEach(async () => {
  await agente.close();
  agente = novoMock();
});

function produtoNaFonte(id: number): void {
  agente
    .get(BASE_URL)
    .intercept({ path: `/products/${id}` })
    .reply(200, fixture(`produto-${id}.json`));
}

function criar(
  itens: { produto_id: number; quantidade: number; preco_maximo_unitario_usd?: number }[],
) {
  return executarCriarRequisicao(
    { cliente: clienteComMock(agente), pool, logger: loggerSilencioso, atendimentoId: null },
    { itens, justificativa: 'time de vendas', solicitante: 'Time de vendas' },
  );
}

async function contarRequisicoes(): Promise<number> {
  const { rows } = await pool.query('select count(*)::int as total from requisicoes');
  return (rows[0] as { total: number }).total;
}

/** O atendimento como o backend abre: o pedido original fica no banco, fora do alcance do modelo. */
async function novoAtendimento(pedido: string): Promise<string> {
  const id = randomUUID();
  await iniciarAtendimento(pool, { id, pedido, solicitante: null, idempotency_key: null });
  return id;
}

function criarNoAtendimento(
  atendimentoId: string,
  itens: { produto_id: number; quantidade: number; preco_maximo_unitario_usd?: number }[],
) {
  return executarCriarRequisicao(
    { cliente: clienteComMock(agente), pool, logger: loggerSilencioso, atendimentoId },
    { itens, justificativa: 'pedido do chat' },
  );
}

async function requisicoesDoAtendimento(atendimentoId: string): Promise<number> {
  const { rows } = await pool.query(
    'select count(*)::int as total from requisicoes where atendimento_id = $1',
    [atendimentoId],
  );
  return (rows[0] as { total: number }).total;
}

describe('criar_requisicao', () => {
  it('grava o pedido de exemplo com o preço lido na fonte e o total em centavos', async () => {
    produtoNaFonte(81);

    const resultado = await criar([
      { produto_id: 81, quantidade: 3, preco_maximo_unitario_usd: 2000 },
    ]);

    expect(resultado.isError).toBeUndefined();
    expect(resultado.structuredContent).toMatchObject({
      status: 'aprovada',
      valor_total_usd: 3299.97,
      valor_total_texto: 'US$ 3.299,97',
      itens: [
        { produto_id: 81, titulo: 'Lenovo Yoga 920', quantidade: 3, preco_unitario_usd: 1099.99 },
      ],
    });
    const numero = (resultado.structuredContent as { numero: string }).numero;
    const { rows } = await pool.query(
      `select r.status, r.valor_total, i.preco_unitario, i.subtotal
         from requisicoes r join requisicao_itens i on i.requisicao_id = r.id
        where r.numero = $1`,
      [numero],
    );
    expect(rows).toEqual([
      {
        status: 'aprovada',
        valor_total: '3299.97',
        preco_unitario: '1099.99',
        subtotal: '3299.97',
      },
    ]);
  });

  it('grava acima da alçada com status em_aprovacao e o motivo', async () => {
    produtoNaFonte(78);

    const resultado = await criar([{ produto_id: 78, quantidade: 3 }]);

    expect(resultado.structuredContent).toMatchObject({
      status: 'em_aprovacao',
      valor_total_texto: 'US$ 5.999,97',
    });
    expect((resultado.structuredContent as { motivo_status: string }).motivo_status).toContain(
      'US$ 5.000,00 (geral)',
    );
  });

  it('não grava categoria bloqueada e devolve REGRA_VIOLADA com o motivo', async () => {
    produtoNaFonte(113);
    const antes = await contarRequisicoes();

    const erro = erroDaFerramenta(await criar([{ produto_id: 113, quantidade: 1 }]));

    expect(erro.codigo).toBe('REGRA_VIOLADA');
    expect(erro.mensagem).toContain('veículo segue o processo de frota');
    expect(await contarRequisicoes()).toBe(antes);
  });

  it('não grava abaixo do pedido mínimo do fornecedor', async () => {
    produtoNaFonte(14);

    const erro = erroDaFerramenta(await criar([{ produto_id: 14, quantidade: 2 }]));

    expect(erro.codigo).toBe('REGRA_VIOLADA');
    expect(erro.mensagem).toContain('pedido mínimo de 5');
  });

  it('não grava quando o preço da fonte passa o limite que a pessoa pediu', async () => {
    produtoNaFonte(81);

    const erro = erroDaFerramenta(
      await criar([{ produto_id: 81, quantidade: 5, preco_maximo_unitario_usd: 1000 }]),
    );

    expect(erro.codigo).toBe('REGRA_VIOLADA');
    expect(erro.mensagem).toContain('US$ 1.099,99');
  });

  it('a mudança na política vale no pedido seguinte, sem reiniciar', async () => {
    produtoNaFonte(81);
    await pool.query(
      "update regras_categoria set teto_unitario_usd = 1000 where categoria = 'laptops'",
    );
    try {
      const erro = erroDaFerramenta(await criar([{ produto_id: 81, quantidade: 3 }]));

      expect(erro.codigo).toBe('REGRA_VIOLADA');
      expect(erro.mensagem).toContain('teto de US$ 1.000,00');
    } finally {
      await pool.query(
        "update regras_categoria set teto_unitario_usd = 2500 where categoria = 'laptops'",
      );
    }
  });

  it('id que não existe no catálogo volta como PRODUTO_NAO_ENCONTRADO', async () => {
    agente.get(BASE_URL).intercept({ path: '/products/99999' }).reply(404, { message: 'x' });

    const erro = erroDaFerramenta(await criar([{ produto_id: 99999, quantidade: 1 }]));

    expect(erro.codigo).toBe('PRODUTO_NAO_ENCONTRADO');
  });

  it('recusa o mesmo produto repetido em dois itens', async () => {
    const erro = erroDaFerramenta(
      await criar([
        { produto_id: 81, quantidade: 1 },
        { produto_id: 81, quantidade: 2 },
      ]),
    );

    expect(erro.codigo).toBe('PEDIDO_INVALIDO');
  });

  it('atendimento que não existe no banco: PEDIDO_INVALIDO, sem gravar', async () => {
    produtoNaFonte(81);

    const erro = erroDaFerramenta(
      await criarNoAtendimento(randomUUID(), [{ produto_id: 81, quantidade: 1 }]),
    );

    expect(erro.codigo).toBe('PEDIDO_INVALIDO');
  });

  it.each([
    ['iPhones', 121],
    ['laptops', 81],
  ] as const)(
    'o modelo esquece o limite escrito no pedido (10 %s até US$ 50): o código aplica o teto citado',
    async (produto, id) => {
      produtoNaFonte(id);
      const atendimentoId = await novoAtendimento(`10 ${produto} até US$ 50`);

      const erro = erroDaFerramenta(
        await criarNoAtendimento(atendimentoId, [{ produto_id: id, quantidade: 10 }]),
      );

      expect(erro.codigo).toBe('REGRA_VIOLADA');
      expect(erro.mensagem).toContain('acima do limite pedido de US$ 50,00');
      expect(await requisicoesDoAtendimento(atendimentoId)).toBe(0);
    },
  );

  it('o modelo manda um limite maior que o escrito no pedido: vale o do pedido', async () => {
    produtoNaFonte(81);
    const atendimentoId = await novoAtendimento('3 laptops até US$ 1.000 cada');

    const erro = erroDaFerramenta(
      await criarNoAtendimento(atendimentoId, [
        { produto_id: 81, quantidade: 3, preco_maximo_unitario_usd: 2000 },
      ]),
    );

    expect(erro.mensagem).toContain('acima do limite pedido de US$ 1.000,00');
  });

  it('dentro do limite escrito no pedido, grava mesmo sem o modelo repetir o limite', async () => {
    produtoNaFonte(81);
    const atendimentoId = await novoAtendimento(
      'Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.',
    );

    const resultado = await criarNoAtendimento(atendimentoId, [{ produto_id: 81, quantidade: 3 }]);

    expect(resultado.structuredContent).toMatchObject({
      status: 'aprovada',
      valor_total_texto: 'US$ 3.299,97',
    });
  });

  it('segunda chamada no mesmo atendimento: REGRA_VIOLADA com o número da primeira, sem gravar outra', async () => {
    produtoNaFonte(81);
    produtoNaFonte(81);
    const atendimentoId = await novoAtendimento('5 laptops para o time');

    const primeira = await criarNoAtendimento(atendimentoId, [{ produto_id: 81, quantidade: 4 }]);
    const erro = erroDaFerramenta(
      await criarNoAtendimento(atendimentoId, [{ produto_id: 81, quantidade: 1 }]),
    );

    const numero = (primeira.structuredContent as { numero: string }).numero;
    expect(erro.codigo).toBe('REGRA_VIOLADA');
    expect(erro.mensagem).toContain(numero);
    expect(await requisicoesDoAtendimento(atendimentoId)).toBe(1);
  });

  it('duas chamadas ao mesmo tempo no mesmo atendimento: só uma grava', async () => {
    produtoNaFonte(81);
    produtoNaFonte(81);
    const atendimentoId = await novoAtendimento('5 laptops para o time');

    const resultados = await Promise.all([
      criarNoAtendimento(atendimentoId, [{ produto_id: 81, quantidade: 3 }]),
      criarNoAtendimento(atendimentoId, [{ produto_id: 81, quantidade: 2 }]),
    ]);

    const erros = resultados.filter((r) => r.isError === true);
    expect(erros).toHaveLength(1);
    expect(erros.map((r) => erroDaFerramenta(r).codigo)).toEqual(['REGRA_VIOLADA']);
    expect(await requisicoesDoAtendimento(atendimentoId)).toBe(1);
  });

  it('o solicitante informado no chat vence o que o modelo mandar', async () => {
    produtoNaFonte(81);
    const atendimentoId = randomUUID();
    await iniciarAtendimento(pool, {
      id: atendimentoId,
      pedido: '1 notebook pro financeiro',
      solicitante: 'Clínicas Carla',
      idempotency_key: null,
    });

    const resultado = await executarCriarRequisicao(
      { cliente: clienteComMock(agente), pool, logger: loggerSilencioso, atendimentoId },
      {
        itens: [{ produto_id: 81, quantidade: 1 }],
        justificativa: 'notebook pro financeiro',
        solicitante: 'Financeiro',
      },
    );

    expect(resultado.structuredContent).toMatchObject({ solicitante: 'Clínicas Carla' });
    const { rows } = await pool.query(
      'select solicitante from requisicoes where atendimento_id = $1',
      [atendimentoId],
    );
    expect(rows).toEqual([{ solicitante: 'Clínicas Carla' }]);
  });
});
