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

  it('registra no histórico, por trigger, o antes e o depois de cada mudança na política', async () => {
    await pool.query(
      "update regras_categoria set teto_unitario_usd = 1000 where categoria = 'laptops'",
    );

    const { rows } = await pool.query(
      `select operacao, antes ->> 'teto_unitario_usd' as antes, depois ->> 'teto_unitario_usd' as depois
         from politica_historico where tabela = 'regras_categoria' and chave = 'laptops'`,
    );
    expect(rows).toEqual([{ operacao: 'UPDATE', antes: '2500.00', depois: '1000.00' }]);
  });

  it('numera as requisições em sequência no formato REQ-000001', async () => {
    const { rows } = await pool.query(
      `insert into requisicoes (justificativa, status, valor_total, regras_aplicadas)
       values ('teste', 'aprovada', 10, '{}'), ('teste', 'aprovada', 10, '{}')
       returning numero`,
    );

    expect(rows.map((r: { numero: string }) => r.numero)).toEqual(['REQ-000001', 'REQ-000002']);
  });
});
