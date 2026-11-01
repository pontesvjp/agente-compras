import {
  decimalParaCentavos,
  type PoliticaCompra,
  type RegraCategoria,
} from '@agente-compras/shared';
import { z } from 'zod';
import type { Executor } from './pool.js';

const linhaPolitica = z.object({
  criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']),
  alcada_usd: z.string(),
  valor_maximo_requisicao_usd: z.string(),
});

const linhaRegra = z.object({
  categoria: z.string(),
  permitida: z.boolean(),
  teto_unitario_usd: z.string().nullable(),
  quantidade_maxima: z.number().int().nullable(),
  alcada_usd: z.string().nullable(),
  motivo: z.string().nullable(),
});

const centavosOuNulo = (valor: string | null) =>
  valor === null ? null : decimalParaCentavos(valor);

/** Lê a política que vale agora. Chamada a cada pedido: mudou na tabela, vale no pedido seguinte. */
export async function lerPolitica(db: Executor): Promise<PoliticaCompra> {
  const geral = await db.query(
    'select criterio_escolha, alcada_usd, valor_maximo_requisicao_usd from politica_compra where id = 1',
  );
  if (geral.rows.length === 0) {
    throw new Error('A política de compras não está cadastrada (tabela politica_compra vazia).');
  }
  const politica = linhaPolitica.parse(geral.rows[0]);

  const { rows } = await db.query(
    `select categoria, permitida, teto_unitario_usd, quantidade_maxima, alcada_usd, motivo
       from regras_categoria order by categoria`,
  );
  const regras = new Map<string, RegraCategoria>();
  for (const linha of rows) {
    const regra = linhaRegra.parse(linha);
    regras.set(regra.categoria, {
      categoria: regra.categoria,
      permitida: regra.permitida,
      teto_unitario_centavos: centavosOuNulo(regra.teto_unitario_usd),
      quantidade_maxima: regra.quantidade_maxima,
      alcada_centavos: centavosOuNulo(regra.alcada_usd),
      motivo: regra.motivo,
    });
  }

  return {
    criterio_escolha: politica.criterio_escolha,
    alcada_centavos: decimalParaCentavos(politica.alcada_usd),
    valor_maximo_requisicao_centavos: decimalParaCentavos(politica.valor_maximo_requisicao_usd),
    regras,
  };
}
