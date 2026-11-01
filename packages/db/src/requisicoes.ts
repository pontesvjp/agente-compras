import {
  centavosParaDecimal,
  type ItemAvaliado,
  type RegrasAplicadas,
  type StatusRequisicao,
} from '@agente-compras/shared';
import { z } from 'zod';
import type { ClienteTransacao } from './pool.js';

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
