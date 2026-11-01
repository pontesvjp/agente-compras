import { z } from 'zod';
import { centavosParaUsd } from './dinheiro.js';
import type { PoliticaCompra, RegraCategoria } from './politica.js';

/** Contrato HTTP do backend, usado pelo backend para responder e pelo chat para ler a resposta. */

export const pedidoSchema = z.object({
  pedido: z
    .string({ error: 'Escreva o pedido.' })
    .trim()
    .min(3, 'Escreva o pedido com pelo menos 3 letras.')
    .max(1000, 'O pedido pode ter até 1.000 caracteres.'),
  solicitante: z.string().trim().min(1).max(120).optional(),
});
export type Pedido = z.infer<typeof pedidoSchema>;

export const chamadaFerramentaSchema = z.object({
  nome: z.string(),
  argumentos: z.record(z.string(), z.unknown()),
  duracao_ms: z.number().int().nonnegative(),
  ok: z.boolean(),
  erro_codigo: z.string().nullable(),
  /** O que a ferramenta devolveu (structuredContent, ou `{codigo, mensagem}` no erro). */
  resultado: z.unknown().optional(),
});
export type ChamadaFerramenta = z.infer<typeof chamadaFerramentaSchema>;

export const statusRequisicaoSchema = z.enum(['aprovada', 'em_aprovacao', 'reprovada']);

export const requisicaoApiSchema = z.object({
  id: z.number().int(),
  numero: z.string(),
  status: statusRequisicaoSchema,
  solicitante: z.string().nullable(),
  justificativa: z.string(),
  itens: z.array(
    z.object({
      produto_id: z.number().int(),
      titulo: z.string(),
      categoria: z.string(),
      quantidade: z.number().int(),
      preco_unitario: z.number(),
      subtotal: z.number(),
    }),
  ),
  valor_total: z.number(),
  moeda: z.string(),
  alcada: z.object({ valor_usd: z.number(), origem: z.string() }),
  atendimento_id: z.string().nullable(),
  criado_em: z.string(),
});
export type RequisicaoApi = z.infer<typeof requisicaoApiSchema>;

export const resultadoAtendimentoSchema = z.enum(['criada', 'nao_atendida', 'erro']);

export const respostaPedidoSchema = z.object({
  resultado: z.enum(['criada', 'nao_atendida']),
  atendimento_id: z.string(),
  requisicao: requisicaoApiSchema.nullable(),
  mensagem: z.string(),
  ferramentas: z.array(chamadaFerramentaSchema),
});
export type RespostaPedido = z.infer<typeof respostaPedidoSchema>;

export const listaRequisicoesSchema = z.object({
  requisicoes: z.array(requisicaoApiSchema),
  proximo_cursor: z.number().int().nullable(),
});
export type ListaRequisicoes = z.infer<typeof listaRequisicoesSchema>;

export const atendimentoApiSchema = z.object({
  id: z.string(),
  pedido: z.string(),
  solicitante: z.string().nullable(),
  resultado: resultadoAtendimentoSchema.nullable(),
  mensagem: z.string().nullable(),
  modelo: z.string().nullable(),
  tokens_entrada: z.number().int().nullable(),
  tokens_saida: z.number().int().nullable(),
  custo_usd: z.number().nullable(),
  duracao_ms: z.number().int().nullable(),
  erro_codigo: z.string().nullable(),
  ferramentas: z.array(chamadaFerramentaSchema),
  requisicao_numero: z.string().nullable(),
  criado_em: z.string(),
});
export type AtendimentoApi = z.infer<typeof atendimentoApiSchema>;

export const metricasSchema = z.object({
  atendimentos: z.number().int(),
  criadas: z.number().int(),
  nao_atendidas: z.number().int(),
  erros: z.number().int(),
  taxa_atendidas: z.number().nullable(),
  tempo_p50_ms: z.number().int().nullable(),
  tempo_p95_ms: z.number().int().nullable(),
  custo_medio_usd: z.number().nullable(),
  tokens_entrada_medio: z.number().int().nullable(),
});
export type Metricas = z.infer<typeof metricasSchema>;

export const regraCategoriaApiSchema = z.object({
  categoria: z.string(),
  permitida: z.boolean(),
  teto_unitario_usd: z.number().nullable(),
  quantidade_maxima: z.number().int().nullable(),
  alcada_usd: z.number().nullable(),
  motivo: z.string().nullable(),
});

export const politicaApiSchema = z.object({
  criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']),
  alcada_geral_usd: z.number(),
  valor_maximo_requisicao_usd: z.number(),
  categorias: z.array(regraCategoriaApiSchema),
});
export type PoliticaApi = z.infer<typeof politicaApiSchema>;

const ALGUM_CAMPO = { error: 'Informe ao menos um campo para alterar.' };

export const alteracaoPoliticaSchema = z
  .strictObject({
    criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']).optional(),
    alcada_usd: z.number().nonnegative().max(1_000_000_000).optional(),
    valor_maximo_requisicao_usd: z.number().positive().max(1_000_000_000).optional(),
  })
  .refine((alteracao) => Object.keys(alteracao).length > 0, ALGUM_CAMPO);
export type AlteracaoPoliticaApi = z.infer<typeof alteracaoPoliticaSchema>;

export const alteracaoRegraCategoriaSchema = z
  .strictObject({
    permitida: z.boolean().optional(),
    teto_unitario_usd: z.number().positive().max(1_000_000_000).nullable().optional(),
    quantidade_maxima: z.number().int().positive().max(1_000_000).nullable().optional(),
    alcada_usd: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
    motivo: z.string().trim().min(3).max(200).nullable().optional(),
  })
  .refine((alteracao) => Object.keys(alteracao).length > 0, ALGUM_CAMPO);
export type AlteracaoRegraCategoriaApi = z.infer<typeof alteracaoRegraCategoriaSchema>;

export const respostaErroSchema = z.object({ codigo: z.string(), mensagem: z.string() });
export type RespostaErro = z.infer<typeof respostaErroSchema>;

const usdOuNulo = (centavos: number | null) =>
  centavos === null ? null : centavosParaUsd(centavos);

export function regraCategoriaEmUsd(regra: RegraCategoria): PoliticaApi['categorias'][number] {
  return {
    categoria: regra.categoria,
    permitida: regra.permitida,
    teto_unitario_usd: usdOuNulo(regra.teto_unitario_centavos),
    quantidade_maxima: regra.quantidade_maxima,
    alcada_usd: usdOuNulo(regra.alcada_centavos),
    motivo: regra.motivo,
  };
}

/** A política como a pessoa e o modelo leem: em dólar, com as regras por categoria em lista. */
export function politicaEmUsd(politica: PoliticaCompra): PoliticaApi {
  return {
    criterio_escolha: politica.criterio_escolha,
    alcada_geral_usd: centavosParaUsd(politica.alcada_centavos),
    valor_maximo_requisicao_usd: centavosParaUsd(politica.valor_maximo_requisicao_centavos),
    categorias: [...politica.regras.values()].map(regraCategoriaEmUsd),
  };
}
