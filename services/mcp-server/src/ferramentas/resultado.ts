import { ErroAgente } from '@agente-compras/shared';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '../logger.js';

export function resultadoOk<T extends Record<string, unknown>>(saida: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(saida) }],
    structuredContent: saida,
  };
}

/** Erro de ferramenta: o modelo lê o texto, e o backend lê o `codigo` sem depender do modelo. */
export function resultadoErro(erro: unknown, logger: Logger): CallToolResult {
  const conhecido =
    erro instanceof ErroAgente
      ? erro
      : new ErroAgente('CATALOGO_INDISPONIVEL', 'Erro inesperado ao consultar o catálogo.', {
          cause: erro,
        });
  if (!(erro instanceof ErroAgente)) logger.error({ err: erro }, 'erro inesperado na ferramenta');
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ codigo: conhecido.codigo, mensagem: conhecido.message }),
      },
    ],
  };
}
