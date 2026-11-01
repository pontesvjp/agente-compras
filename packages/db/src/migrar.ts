import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Pool } from './pool.js';

/** Chave da trava do Postgres: duas réplicas subindo juntas não aplicam a mesma migration. */
const CHAVE_TRAVA = 7_234_001;
const PASTA_MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

const linhaVersao = z.object({ versao: z.string() });

/** Aplica, em ordem e cada uma numa transação, as migrations que ainda não rodaram. */
export async function migrar(pool: Pool, pasta: string = PASTA_MIGRATIONS): Promise<string[]> {
  const conexao = await pool.connect();
  try {
    await conexao.query('select pg_advisory_lock($1)', [CHAVE_TRAVA]);
    await conexao.query(
      `create table if not exists schema_migrations (
         versao text primary key,
         aplicada_em timestamptz not null default now()
       )`,
    );
    const { rows } = await conexao.query('select versao from schema_migrations');
    const aplicadas = new Set(rows.map((linha) => linhaVersao.parse(linha).versao));

    const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort();
    const novas: string[] = [];
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const sql = await readFile(join(pasta, arquivo), 'utf8');
      await conexao.query('begin');
      try {
        await conexao.query(sql);
        await conexao.query('insert into schema_migrations (versao) values ($1)', [arquivo]);
        await conexao.query('commit');
      } catch (erro) {
        await conexao.query('rollback').catch(() => undefined);
        throw new Error(`Falha na migration ${arquivo}`, { cause: erro });
      }
      novas.push(arquivo);
    }
    return novas;
  } finally {
    await conexao.query('select pg_advisory_unlock($1)', [CHAVE_TRAVA]).catch(() => undefined);
    conexao.release();
  }
}
