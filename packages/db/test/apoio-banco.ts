import { migrar } from '../src/migrar.js';
import { criarPool, type Pool } from '../src/pool.js';

export const URL_BANCO_TESTE =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/compras_teste';

/**
 * Recria o schema do banco de teste e aplica as migrations.
 * Só aceita banco com "teste" no nome, para nunca apagar um banco de verdade.
 */
export async function prepararBancoTeste(): Promise<Pool> {
  const nome = new URL(URL_BANCO_TESTE).pathname.slice(1);
  if (!nome.includes('teste')) {
    throw new Error(`TEST_DATABASE_URL precisa apontar para um banco de teste; veio "${nome}".`);
  }
  const pool = criarPool(URL_BANCO_TESTE);
  try {
    await pool.query('drop schema if exists public cascade; create schema public;');
  } catch (erro) {
    await pool.end();
    throw new Error(
      `Postgres de teste fora do ar em ${URL_BANCO_TESTE}. Suba com "npm run db:teste".`,
      { cause: erro },
    );
  }
  await migrar(pool);
  return pool;
}
