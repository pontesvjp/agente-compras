import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../src/migrar.js';
import { lerPolitica } from '../src/politica.js';
import type { Pool } from '../src/pool.js';
import { prepararBancoTeste } from './apoio-banco.js';

let pool: Pool;
beforeAll(async () => {
  pool = await prepararBancoTeste();
});
afterAll(async () => {
  await pool.end();
});

describe('migrations', () => {
  it('não reaplica o que já rodou', async () => {
    expect(await migrar(pool)).toEqual([]);
  });

  it('sobe com a carga inicial da política', async () => {
    const politica = await lerPolitica(pool);

    expect(politica.alcada_centavos).toBe(500_000);
    expect(politica.valor_maximo_requisicao_centavos).toBe(2_000_000);
    expect(politica.regras.get('laptops')).toMatchObject({
      teto_unitario_centavos: 250_000,
      quantidade_maxima: 20,
    });
    expect(politica.regras.get('motorcycle')).toMatchObject({
      permitida: false,
      motivo: 'veículo segue o processo de frota',
    });
  });

  it('registra no histórico, por trigger, a carga inicial e o antes e o depois de cada mudança', async () => {
    const atualizadoEm = async (): Promise<unknown> =>
      (await pool.query("select atualizado_em from regras_categoria where categoria = 'laptops'"))
        .rows[0]?.atualizado_em;
    const antesDaMudanca = await atualizadoEm();

    await pool.query(
      "update regras_categoria set teto_unitario_usd = 1000 where categoria = 'laptops'",
    );

    const { rows } = await pool.query(
      `select operacao, antes ->> 'teto_unitario_usd' as antes, depois ->> 'teto_unitario_usd' as depois
         from politica_historico where tabela = 'regras_categoria' and chave = 'laptops' order by id`,
    );
    expect(rows).toEqual([
      { operacao: 'INSERT', antes: null, depois: '2500.00' },
      { operacao: 'UPDATE', antes: '2500.00', depois: '1000.00' },
    ]);
    expect(await atualizadoEm()).not.toEqual(antesDaMudanca);
  });

  it('numera as requisições em sequência no formato REQ-000001', async () => {
    const { rows } = await pool.query(
      `insert into requisicoes (justificativa, status, valor_total, regras_aplicadas)
       values ('teste', 'aprovada', 10, '{}'), ('teste', 'aprovada', 10, '{}')
       returning numero`,
    );

    expect(rows.map((r: { numero: string }) => r.numero)).toEqual(['REQ-000001', 'REQ-000002']);
  });

  it('recusa item cujo subtotal não bate com preço vezes quantidade', async () => {
    const { rows } = await pool.query(
      `insert into requisicoes (justificativa, status, valor_total, regras_aplicadas)
       values ('teste', 'aprovada', 30, '{}') returning id`,
    );
    const id: unknown = rows[0]?.id;

    await expect(
      pool.query(
        `insert into requisicao_itens
           (requisicao_id, produto_id, titulo, categoria, preco_unitario, quantidade, subtotal)
         values ($1, 1, 'x', 'laptops', 10, 3, 31)`,
        [id],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
