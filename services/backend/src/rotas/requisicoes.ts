import { buscarRequisicao, listarRequisicoes, type Pool } from '@agente-compras/db';
import { ErroAgente, type ListaRequisicoes, pedidoSchema } from '@agente-compras/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Atendido, EntradaAtendimento } from '../agente/atender.js';
import { requisicaoParaApi } from '../apresentacao.js';

export interface DependenciasRequisicoes {
  pool: Pool;
  atender: (entrada: EntradaAtendimento) => Promise<Atendido>;
}

const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();
const paginaSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** Folgado de propósito: quem avalia roda a avaliação inteira sem ser barrado. */
const LIMITE_PEDIDOS = { max: 60, timeWindow: '1 minute' };

export function rotasRequisicoes(deps: DependenciasRequisicoes): FastifyPluginAsync {
  return async (app) => {
    app.post('/', { config: { rateLimit: LIMITE_PEDIDOS } }, async (request, reply) => {
      const pedido = pedidoSchema.parse(request.body);
      const idempotencyKey = idempotencyKeySchema.parse(request.headers['idempotency-key']);
      const { resposta, repetido } = await deps.atender({
        pedido: pedido.pedido,
        solicitante: pedido.solicitante ?? null,
        idempotencyKey: idempotencyKey ?? null,
        requestId: request.id,
        logger: request.log,
      });
      if (repetido) void reply.header('idempotent-replayed', 'true');
      return reply.status(!repetido && resposta.resultado === 'criada' ? 201 : 200).send(resposta);
    });

    app.get('/', async (request): Promise<ListaRequisicoes> => {
      const { limite, cursor } = paginaSchema.parse(request.query);
      const linhas = await listarRequisicoes(deps.pool, {
        limite: limite + 1,
        antesDoId: cursor ?? null,
      });
      const pagina = linhas.slice(0, limite);
      return {
        requisicoes: pagina.map(requisicaoParaApi),
        proximo_cursor: linhas.length > limite ? (pagina.at(-1)?.id ?? null) : null,
      };
    });

    app.get('/:id', async (request) => {
      const { id } = idSchema.parse(request.params);
      const requisicao = await buscarRequisicao(deps.pool, id);
      if (!requisicao) throw new ErroAgente('NAO_ENCONTRADO', `A requisição ${id} não existe.`);
      return requisicaoParaApi(requisicao);
    });
  };
}
