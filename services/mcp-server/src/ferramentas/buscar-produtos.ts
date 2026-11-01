import { produtoResumidoSchema } from '@agente-compras/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ClienteDummyJson } from '../dummyjson/cliente.js';
import { paraProdutoResumido } from '../dummyjson/mapear.js';
import type { Logger } from '../logger.js';
import { resultadoErro, resultadoOk } from './resultado.js';

export const entradaBuscarProdutos = {
  termo: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .describe('Uma palavra em inglês e no singular, como "laptop", "tablet" ou "chair".'),
  limite: z.number().int().min(1).max(20).default(10).describe('Máximo de produtos. Padrão: 10.'),
};

export const saidaBuscarProdutos = {
  termo: z.string(),
  total: z.number().int().nonnegative(),
  produtos: z.array(produtoResumidoSchema),
  dica: z.string().optional(),
};

const DESCRICAO = [
  'Busca produtos no catálogo por uma palavra e devolve id, título, preço em USD, estoque, pedido mínimo, categoria, marca e avaliação.',
  'Quando chamar: sempre que precisar saber se um produto existe e quanto custa. A busca só acha em inglês e no singular ("laptop" acha, "laptops" e "notebook" não).',
  'Quando não chamar: para ver garantia ou prazo de envio de um produto já encontrado (use detalhar_produto).',
  'A busca é textual e traz ruído: confira se cada resultado é de fato o que foi pedido antes de escolher.',
].join(' ');

function dicaParaVazio(termo: string): string {
  const singular = termo.endsWith('s') ? ` Tente "${termo.slice(0, -1)}".` : '';
  return `Nenhum produto para "${termo}". A busca só acha em inglês e no singular.${singular} Se ainda vier vazio, tente um termo mais genérico (ex.: "notebook" -> "laptop", "cadeira" -> "chair").`;
}

export async function executarBuscarProdutos(
  cliente: ClienteDummyJson,
  args: { termo: string; limite: number },
  logger: Logger,
): Promise<CallToolResult> {
  const termo = args.termo.trim().toLowerCase();
  const inicio = performance.now();
  try {
    const produtos = (await cliente.buscar(termo, args.limite)).map(paraProdutoResumido);
    logger.info(
      {
        ferramenta: 'buscar_produtos',
        termo,
        total: produtos.length,
        duracao_ms: Math.round(performance.now() - inicio),
      },
      'ferramenta executada',
    );
    return resultadoOk({
      termo,
      total: produtos.length,
      produtos,
      ...(produtos.length === 0 ? { dica: dicaParaVazio(termo) } : {}),
    });
  } catch (erro) {
    logger.warn({ ferramenta: 'buscar_produtos', termo, err: erro }, 'ferramenta falhou');
    return resultadoErro(erro, logger);
  }
}

export function registrarBuscarProdutos(
  servidor: McpServer,
  cliente: ClienteDummyJson,
  logger: Logger,
): void {
  servidor.registerTool(
    'buscar_produtos',
    {
      title: 'Buscar produtos no catálogo',
      description: DESCRICAO,
      inputSchema: entradaBuscarProdutos,
      outputSchema: saidaBuscarProdutos,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => executarBuscarProdutos(cliente, args, logger),
  );
}
