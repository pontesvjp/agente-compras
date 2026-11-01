import { produtoDetalhadoSchema } from '@agente-compras/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ClienteDummyJson } from '../dummyjson/cliente.js';
import { paraProdutoDetalhado } from '../dummyjson/mapear.js';
import type { Logger } from '../logger.js';
import { resultadoErro, resultadoOk } from './resultado.js';

export const entradaDetalharProduto = {
  id: z.number().int().positive().describe('O id que veio de buscar_produtos.'),
};

const DESCRICAO = [
  'Devolve um produto do catálogo pelo id: o mesmo que buscar_produtos traz, mais descrição, garantia, prazo de envio e política de devolução.',
  'Quando chamar: depois de buscar_produtos, para conferir um produto que você pretende escolher ou para responder sobre garantia e entrega.',
  'Quando não chamar: para procurar produtos (use buscar_produtos). Não invente ids: use só os que vieram de uma busca.',
].join(' ');

export async function executarDetalharProduto(
  cliente: ClienteDummyJson,
  args: { id: number },
  logger: Logger,
): Promise<CallToolResult> {
  const inicio = performance.now();
  try {
    const produto = paraProdutoDetalhado(await cliente.detalhar(args.id));
    logger.info(
      {
        ferramenta: 'detalhar_produto',
        id: args.id,
        duracao_ms: Math.round(performance.now() - inicio),
      },
      'ferramenta executada',
    );
    return resultadoOk(produto);
  } catch (erro) {
    logger.warn({ ferramenta: 'detalhar_produto', id: args.id, err: erro }, 'ferramenta falhou');
    return resultadoErro(erro, logger);
  }
}

export function registrarDetalharProduto(
  servidor: McpServer,
  cliente: ClienteDummyJson,
  logger: Logger,
): void {
  servidor.registerTool(
    'detalhar_produto',
    {
      title: 'Detalhar um produto do catálogo',
      description: DESCRICAO,
      inputSchema: entradaDetalharProduto,
      outputSchema: produtoDetalhadoSchema.shape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => executarDetalharProduto(cliente, args, logger),
  );
}
