import { lerPolitica, type Pool } from '@agente-compras/db';
import { politicaEmUsd, regraCategoriaApiSchema } from '@agente-compras/shared';
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

export const saidaConsultarPolitica = {
  criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']),
  alcada_geral_usd: z.number(),
  valor_maximo_requisicao_usd: z.number(),
  categorias: z.array(regraCategoriaApiSchema),
  observacao: z.string().optional(),
};

const DESCRICAO = [
  'Devolve a política de compras que vale agora: critério de escolha, alçada geral, valor máximo por requisição e as regras por categoria (bloqueada ou não, teto por unidade, quantidade máxima, alçada própria e motivo).',
  'Quando chamar: antes de escolher produtos, para escolher dentro da regra, ou para explicar por que um pedido foi barrado.',
  'Quando não chamar: para validar a compra. Quem garante a regra é criar_requisicao, que confere tudo de novo ao gravar.',
].join(' ');

export async function executarConsultarPolitica(
  pool: Pool,
  args: { categoria?: string | undefined },
  logger: Logger,
): Promise<CallToolResult> {
  try {
    const politica = politicaEmUsd(await lerPolitica(pool));
    const categoria = args.categoria?.trim().toLowerCase();
    const regras = politica.categorias.filter(
      (regra) => categoria === undefined || regra.categoria === categoria,
    );
    return resultadoOk({
      ...politica,
      categorias: regras,
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
