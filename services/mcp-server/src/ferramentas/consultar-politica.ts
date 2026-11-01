import { lerPolitica, type Pool } from '@agente-compras/db';
import { centavosParaUsd, type RegraCategoria } from '@agente-compras/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Logger } from '../logger.js';
import { resultadoErro, resultadoOk } from './resultado.js';

export const entradaConsultarPolitica = {
  categoria: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .optional()
    .describe(
      'Categoria do catálogo, como vem de buscar_produtos (ex.: "laptops"). Sem ela, volta a política inteira.',
    ),
};

const regraSaida = z.object({
  categoria: z.string(),
  permitida: z.boolean(),
  teto_unitario_usd: z.number().nullable(),
  quantidade_maxima: z.number().int().nullable(),
  alcada_usd: z.number().nullable(),
  motivo: z.string().nullable(),
});

export const saidaConsultarPolitica = {
  criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']),
  alcada_geral_usd: z.number(),
  valor_maximo_requisicao_usd: z.number(),
  categorias: z.array(regraSaida),
  observacao: z.string().optional(),
};

const DESCRICAO = [
  'Devolve a política de compras que vale agora: critério de escolha, alçada geral, valor máximo por requisição e as regras por categoria (bloqueada ou não, teto por unidade, quantidade máxima, alçada própria e motivo).',
  'Quando chamar: antes de escolher produtos, para escolher dentro da regra, ou para explicar por que um pedido foi barrado.',
  'Quando não chamar: para validar a compra. Quem garante a regra é criar_requisicao, que confere tudo de novo ao gravar.',
].join(' ');

const usdOuNulo = (centavos: number | null) =>
  centavos === null ? null : centavosParaUsd(centavos);

function paraSaida(regra: RegraCategoria) {
  return {
    categoria: regra.categoria,
    permitida: regra.permitida,
    teto_unitario_usd: usdOuNulo(regra.teto_unitario_centavos),
    quantidade_maxima: regra.quantidade_maxima,
    alcada_usd: usdOuNulo(regra.alcada_centavos),
    motivo: regra.motivo,
  };
}

export async function executarConsultarPolitica(
  pool: Pool,
  args: { categoria?: string | undefined },
  logger: Logger,
): Promise<CallToolResult> {
  try {
    const politica = await lerPolitica(pool);
    const categoria = args.categoria?.trim().toLowerCase();
    const regras = [...politica.regras.values()].filter(
      (regra) => categoria === undefined || regra.categoria === categoria,
    );
    return resultadoOk({
      criterio_escolha: politica.criterio_escolha,
      alcada_geral_usd: centavosParaUsd(politica.alcada_centavos),
      valor_maximo_requisicao_usd: centavosParaUsd(politica.valor_maximo_requisicao_centavos),
      categorias: regras.map(paraSaida),
      ...(categoria !== undefined && regras.length === 0
        ? {
            observacao: `A categoria "${categoria}" não tem regra própria: valem a alçada geral e o valor máximo por requisição.`,
          }
        : {}),
    });
  } catch (erro) {
    logger.error({ ferramenta: 'consultar_politica', err: erro }, 'ferramenta falhou');
    return resultadoErro(erro, logger);
  }
}

export function registrarConsultarPolitica(servidor: McpServer, pool: Pool, logger: Logger): void {
  servidor.registerTool(
    'consultar_politica',
    {
      title: 'Consultar a política de compras',
      description: DESCRICAO,
      inputSchema: entradaConsultarPolitica,
      outputSchema: saidaConsultarPolitica,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => executarConsultarPolitica(pool, args, logger),
  );
}
