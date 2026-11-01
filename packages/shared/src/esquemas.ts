import { z } from 'zod';

/** Produto como as ferramentas do MCP devolvem ao modelo: só os campos que servem para decidir. */
export const produtoResumidoSchema = z.object({
  id: z.number().int().positive(),
  titulo: z.string(),
  preco_usd: z.number().nonnegative(),
  estoque: z.number().int().nonnegative(),
  pedido_minimo: z.number().int().positive(),
  disponibilidade: z.string(),
  categoria: z.string(),
  marca: z.string().nullable(),
  avaliacao: z.number(),
});
export type ProdutoResumido = z.infer<typeof produtoResumidoSchema>;

export const produtoDetalhadoSchema = produtoResumidoSchema.extend({
  descricao: z.string(),
  garantia: z.string().nullable(),
  prazo_envio: z.string().nullable(),
  politica_devolucao: z.string().nullable(),
});
export type ProdutoDetalhado = z.infer<typeof produtoDetalhadoSchema>;
