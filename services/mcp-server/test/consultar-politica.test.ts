import type { Pool } from '@agente-compras/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararBancoTeste } from '../../../packages/db/test/apoio-banco.js';
import { executarConsultarPolitica } from '../src/ferramentas/consultar-politica.js';
import { loggerSilencioso } from './apoio.js';

let pool: Pool;
beforeAll(async () => {
  pool = await prepararBancoTeste();
});
afterAll(async () => {
  await pool.end();
});

describe('consultar_politica', () => {
  it('devolve a política inteira em dólar', async () => {
    const resultado = await executarConsultarPolitica(pool, {}, loggerSilencioso);

    expect(resultado.structuredContent).toMatchObject({
      criterio_escolha: 'menor_preco',
      alcada_geral_usd: 5000,
      valor_maximo_requisicao_usd: 20000,
    });
    expect(resultado.structuredContent?.categorias).toHaveLength(7);
  });

  it('filtra pela categoria, sem diferenciar maiúscula', async () => {
    const resultado = await executarConsultarPolitica(
      pool,
      { categoria: 'Motorcycle' },
      loggerSilencioso,
    );

    expect(resultado.structuredContent?.categorias).toEqual([
      {
        categoria: 'motorcycle',
        permitida: false,
        teto_unitario_usd: null,
        quantidade_maxima: null,
        alcada_usd: null,
        motivo: 'veículo segue o processo de frota',
      },
    ]);
  });

  it('avisa quando a categoria não tem regra própria', async () => {
    const resultado = await executarConsultarPolitica(
      pool,
      { categoria: 'tablets' },
      loggerSilencioso,
    );

    expect(resultado.structuredContent).toMatchObject({ categorias: [] });
    expect(resultado.structuredContent?.observacao).toContain('valem a alçada geral');
  });
});
