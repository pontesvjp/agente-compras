import pg from 'pg';

export type Pool = pg.Pool;
export type ClienteTransacao = pg.PoolClient;
/** Qualquer coisa que roda SQL: o pool, ou o cliente de uma transação aberta. */
export type Executor = pg.Pool | pg.PoolClient;

export function criarPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
}

/** Roda `trabalho` numa transação: commit no fim, rollback em qualquer erro. */
export async function emTransacao<T>(
  pool: Pool,
  trabalho: (tx: ClienteTransacao) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('begin');
    const resultado = await trabalho(tx);
    await tx.query('commit');
    return resultado;
  } catch (erro) {
    await tx.query('rollback').catch(() => undefined);
    throw erro;
  } finally {
    tx.release();
  }
}
