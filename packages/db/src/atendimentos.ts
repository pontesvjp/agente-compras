import { type ChamadaFerramenta, chamadaFerramentaSchema } from '@agente-compras/shared';
import { z } from 'zod';
import type { Executor } from './pool.js';

export type ResultadoAtendimento = 'criada' | 'nao_atendida' | 'erro';

export interface NovoAtendimento {
  id: string;
  pedido: string;
  solicitante: string | null;
  idempotency_key: string | null;
}

export interface ConclusaoAtendimento {
  resultado: ResultadoAtendimento;
  mensagem: string;
  modelo: string | null;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number | null;
  duracao_ms: number;
  chamadas: ChamadaFerramenta[];
  erro_codigo: string | null;
}

const linhaAtendimento = z.object({
  id: z.string(),
  pedido: z.string(),
  solicitante: z.string().nullable(),
  resultado: z.enum(['criada', 'nao_atendida', 'erro']).nullable(),
  mensagem: z.string().nullable(),
  modelo: z.string().nullable(),
  tokens_entrada: z.number().int().nullable(),
  tokens_saida: z.number().int().nullable(),
  custo_usd: z.string().nullable(),
  duracao_ms: z.number().int().nullable(),
  chamadas: z.array(chamadaFerramentaSchema),
  erro_codigo: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  criado_em: z.date(),
});
export type Atendimento = z.infer<typeof linhaAtendimento>;

const COLUNAS = `id, pedido, solicitante, resultado, mensagem, modelo, tokens_entrada, tokens_saida,
  custo_usd, duracao_ms, chamadas, erro_codigo, idempotency_key, criado_em`;

/**
 * Abre a trilha do atendimento. Com uma Idempotency-Key já usada, não cria outra linha:
 * devolve o atendimento que já existe, para quem chamou decidir o que fazer.
 */
export async function iniciarAtendimento(
  db: Executor,
  novo: NovoAtendimento,
): Promise<{ criado: true } | { criado: false; existente: Atendimento }> {
  const { rowCount } = await db.query(
    `insert into atendimentos (id, pedido, solicitante, idempotency_key)
     values ($1, $2, $3, $4)
     on conflict (idempotency_key) do nothing`,
    [novo.id, novo.pedido, novo.solicitante, novo.idempotency_key],
  );
  if (rowCount === 1) return { criado: true };

  const existente = await buscarAtendimentoPorChave(db, novo.idempotency_key ?? '');
  if (!existente) throw new Error('Conflito de Idempotency-Key sem atendimento correspondente.');
  return { criado: false, existente };
}

export async function concluirAtendimento(
  db: Executor,
  id: string,
  conclusao: ConclusaoAtendimento,
): Promise<void> {
  await db.query(
    `update atendimentos
        set resultado = $2, mensagem = $3, modelo = $4, tokens_entrada = $5, tokens_saida = $6,
            custo_usd = $7, duracao_ms = $8, chamadas = $9, erro_codigo = $10
      where id = $1`,
    [
      id,
      conclusao.resultado,
      conclusao.mensagem,
      conclusao.modelo,
      conclusao.tokens_entrada,
      conclusao.tokens_saida,
      conclusao.custo_usd === null ? null : conclusao.custo_usd.toFixed(6),
      conclusao.duracao_ms,
      JSON.stringify(conclusao.chamadas),
      conclusao.erro_codigo,
    ],
  );
}

/** Solta a chave de um atendimento que terminou em erro, para o mesmo pedido poder ser refeito. */
export async function liberarChaveIdempotencia(db: Executor, id: string): Promise<void> {
  await db.query('update atendimentos set idempotency_key = null where id = $1', [id]);
}

export async function buscarAtendimento(db: Executor, id: string): Promise<Atendimento | null> {
  const { rows } = await db.query(`select ${COLUNAS} from atendimentos where id = $1`, [id]);
  return rows.length === 0 ? null : linhaAtendimento.parse(rows[0]);
}

async function buscarAtendimentoPorChave(db: Executor, chave: string): Promise<Atendimento | null> {
  const { rows } = await db.query(
    `select ${COLUNAS} from atendimentos where idempotency_key = $1`,
    [chave],
  );
  return rows.length === 0 ? null : linhaAtendimento.parse(rows[0]);
}

const linhaMetricas = z.object({
  atendimentos: z.number().int(),
  criadas: z.number().int(),
  nao_atendidas: z.number().int(),
  erros: z.number().int(),
  tempo_p50_ms: z.number().nullable(),
  tempo_p95_ms: z.number().nullable(),
  custo_medio_usd: z.number().nullable(),
  tokens_entrada_medio: z.number().nullable(),
});
export type MetricasAtendimento = z.infer<typeof linhaMetricas>;

/** Resumo dos atendimentos concluídos: volume, resultado, tempo e custo. */
export async function lerMetricas(db: Executor): Promise<MetricasAtendimento> {
  const { rows } = await db.query(
    `select count(*)::int                                              as atendimentos,
            count(*) filter (where resultado = 'criada')::int          as criadas,
            count(*) filter (where resultado = 'nao_atendida')::int    as nao_atendidas,
            count(*) filter (where resultado = 'erro')::int            as erros,
            percentile_cont(0.5) within group (order by duracao_ms)    as tempo_p50_ms,
            percentile_cont(0.95) within group (order by duracao_ms)   as tempo_p95_ms,
            avg(custo_usd)::float8                                     as custo_medio_usd,
            avg(tokens_entrada)::float8                                as tokens_entrada_medio
       from atendimentos
      where resultado is not null`,
  );
  return linhaMetricas.parse(rows[0]);
}
