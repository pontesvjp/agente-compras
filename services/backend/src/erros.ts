import { type CodigoErro, ErroAgente, type RespostaErro } from '@agente-compras/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/** Único lugar em que código de erro vira status HTTP. */
const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  PEDIDO_INVALIDO: 400,
  NAO_ENCONTRADO: 404,
  PRODUTO_NAO_ENCONTRADO: 404,
  REGRA_VIOLADA: 422,
  SEM_PERMISSAO: 403,
  MUITOS_PEDIDOS: 429,
  ERRO_INTERNO: 500,
  CATALOGO_INDISPONIVEL: 503,
  CATALOGO_LENTO: 503,
  MCP_INDISPONIVEL: 503,
  LLM_CHAVE_INVALIDA: 503,
  LLM_INDISPONIVEL: 503,
};

/** Erros do Fastify e dos plugins (JSON malformado, 415, rate limit) trazem `statusCode`. */
function statusDe(erro: unknown): number | null {
  return typeof erro === 'object' &&
    erro !== null &&
    'statusCode' in erro &&
    typeof erro.statusCode === 'number'
    ? erro.statusCode
    : null;
}

function paraResposta(erro: unknown): { status: number; corpo: RespostaErro } {
  if (erro instanceof ErroAgente) {
    return {
      status: STATUS_POR_CODIGO[erro.codigo],
      corpo: { codigo: erro.codigo, mensagem: erro.message },
    };
  }
  if (erro instanceof ZodError) {
    const primeiro = erro.issues[0];
    const campo = primeiro?.path.join('.');
    return {
      status: 400,
      corpo: {
        codigo: 'PEDIDO_INVALIDO',
        mensagem: `${campo ? `${campo}: ` : ''}${primeiro?.message ?? 'entrada inválida'}`,
      },
    };
  }
  const status = statusDe(erro);
  if (status === 429) {
    return {
      status: 429,
      corpo: {
        codigo: 'MUITOS_PEDIDOS',
        mensagem: 'Muitos pedidos em sequência. Espere um minuto e tente de novo.',
      },
    };
  }
  if (status !== null && status >= 400 && status < 500) {
    return {
      status,
      corpo: {
        codigo: 'PEDIDO_INVALIDO',
        mensagem: erro instanceof Error ? erro.message : 'Pedido inválido.',
      },
    };
  }
  return {
    status: 500,
    corpo: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno. O detalhe ficou no log.' },
  };
}

export function tratarErro(erro: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { status, corpo } = paraResposta(erro);
  if (status >= 500) request.log.error({ err: erro, codigo: corpo.codigo }, 'requisição falhou');
  else request.log.info({ codigo: corpo.codigo, mensagem: corpo.mensagem }, 'requisição recusada');
  void reply.status(status).send(corpo);
}
