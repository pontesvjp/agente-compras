import {
  centavosParaDecimal,
  decimalParaCentavos,
  type ItemAvaliado,
  type RegrasAplicadas,
  type StatusRequisicao,
} from '@agente-compras/shared';
import { z } from 'zod';
import type { ClienteTransacao, Executor } from './pool.js';

export interface NovaRequisicao {
  solicitante: string | null;
  justificativa: string;
  status: StatusRequisicao;
  valor_total_centavos: number;
  regras_aplicadas: RegrasAplicadas;
  atendimento_id: string | null;
  itens: ItemAvaliado[];
}

const linhaCriada = z.object({
  id: z.coerce.number().int().positive(),
  numero: z.string(),
  criado_em: z.date(),
});
export type RequisicaoCriada = z.infer<typeof linhaCriada>;

/** Grava a requisição e os itens. Deve rodar dentro de `emTransacao`. */
export async function inserirRequisicao(
  tx: ClienteTransacao,
  nova: NovaRequisicao,
): Promise<RequisicaoCriada> {
  const cabecalho = await tx.query(
    `insert into requisicoes (solicitante, justificativa, status, valor_total, regras_aplicadas, atendimento_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id, numero, criado_em`,
    [
      nova.solicitante,
      nova.justificativa,
      nova.status,
      centavosParaDecimal(nova.valor_total_centavos),
      JSON.stringify(nova.regras_aplicadas),
      nova.atendimento_id,
    ],
  );
  const criada = linhaCriada.parse(cabecalho.rows[0]);

  await tx.query(
    `insert into requisicao_itens
       (requisicao_id, produto_id, titulo, categoria, preco_unitario, quantidade, subtotal)
     select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::numeric[], $6::int[], $7::numeric[])`,
    [
      criada.id,
      nova.itens.map((item) => item.produto_id),
      nova.itens.map((item) => item.titulo),
      nova.itens.map((item) => item.categoria),
      nova.itens.map((item) => centavosParaDecimal(item.preco_centavos)),
      nova.itens.map((item) => item.quantidade),
      nova.itens.map((item) => centavosParaDecimal(item.subtotal_centavos)),
    ],
  );
  return criada;
}

const linhaRequisicao = z.object({
  id: z.coerce.number().int().positive(),
  numero: z.string(),
  solicitante: z.string().nullable(),
  justificativa: z.string(),
  status: z.enum(['aprovada', 'em_aprovacao', 'reprovada']),
  valor_total: z.string(),
  moeda: z.string(),
  alcada: z.object({ alcada_centavos: z.number().int(), origem_alcada: z.string() }),
  atendimento_id: z.string().nullable(),
  criado_em: z.date(),
  itens: z.array(
    z.object({
      produto_id: z.number().int(),
      titulo: z.string(),
      categoria: z.string(),
      quantidade: z.number().int(),
      preco_unitario: z.string(),
      subtotal: z.string(),
    }),
  ),
});

export interface RequisicaoGravada {
  id: number;
  numero: string;
  solicitante: string | null;
  justificativa: string;
  status: StatusRequisicao;
  valor_total_centavos: number;
  moeda: string;
  alcada_centavos: number;
  origem_alcada: string;
  atendimento_id: string | null;
  criado_em: Date;
  itens: {
    produto_id: number;
    titulo: string;
    categoria: string;
    quantidade: number;
    preco_unitario_centavos: number;
    subtotal_centavos: number;
  }[];
}

/** Os valores saem como texto (`::text`) para virar centavos sem passar por float. */
const SELECT_REQUISICAO = `
  select r.id, r.numero, r.solicitante, r.justificativa, r.status, r.valor_total::text as valor_total,
         r.moeda, r.regras_aplicadas as alcada, r.atendimento_id, r.criado_em,
         coalesce(
           json_agg(json_build_object(
             'produto_id', i.produto_id, 'titulo', i.titulo, 'categoria', i.categoria,
             'quantidade', i.quantidade, 'preco_unitario', i.preco_unitario::text,
             'subtotal', i.subtotal::text
           ) order by i.id) filter (where i.id is not null),
           '[]'
         ) as itens
    from requisicoes r
    left join requisicao_itens i on i.requisicao_id = r.id`;

function paraRequisicao(linha: unknown): RequisicaoGravada {
  const r = linhaRequisicao.parse(linha);
  return {
    id: r.id,
    numero: r.numero,
    solicitante: r.solicitante,
    justificativa: r.justificativa,
    status: r.status,
    valor_total_centavos: decimalParaCentavos(r.valor_total),
    moeda: r.moeda,
    alcada_centavos: r.alcada.alcada_centavos,
    origem_alcada: r.alcada.origem_alcada,
    atendimento_id: r.atendimento_id,
    criado_em: r.criado_em,
    itens: r.itens.map((item) => ({
      produto_id: item.produto_id,
      titulo: item.titulo,
      categoria: item.categoria,
      quantidade: item.quantidade,
      preco_unitario_centavos: decimalParaCentavos(item.preco_unitario),
      subtotal_centavos: decimalParaCentavos(item.subtotal),
    })),
  };
}

/** Mais recentes primeiro. O cursor é o id da última requisição da página anterior. */
export async function listarRequisicoes(
  db: Executor,
  pagina: { limite: number; antesDoId: number | null },
): Promise<RequisicaoGravada[]> {
  const { rows } = await db.query(
    `${SELECT_REQUISICAO}
      where $1::bigint is null or r.id < $1
      group by r.id
      order by r.id desc
      limit $2`,
    [pagina.antesDoId, pagina.limite],
  );
  return rows.map(paraRequisicao);
}

export async function buscarRequisicao(
  db: Executor,
  id: number,
): Promise<RequisicaoGravada | null> {
  const { rows } = await db.query(`${SELECT_REQUISICAO} where r.id = $1 group by r.id`, [id]);
  return rows.length === 0 ? null : paraRequisicao(rows[0]);
}

/** A requisição que o atendimento gravou. O índice único garante que é no máximo uma. */
export async function requisicaoDoAtendimento(
  db: Executor,
  atendimentoId: string,
): Promise<RequisicaoGravada | null> {
  const { rows } = await db.query(
    `${SELECT_REQUISICAO} where r.atendimento_id = $1 group by r.id`,
    [atendimentoId],
  );
  return rows.length === 0 ? null : paraRequisicao(rows[0]);
}
