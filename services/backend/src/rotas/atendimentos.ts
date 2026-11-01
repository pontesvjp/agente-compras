import { buscarAtendimento, type Pool, requisicaoDoAtendimento } from '@agente-compras/db';
import { type AtendimentoApi, ErroAgente } from '@agente-compras/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { atendimentoParaApi } from '../apresentacao.js';

const idSchema = z.object({ id: z.uuid() });

/** Trilha de auditoria: o que o modelo chamou, com que argumentos, em quanto tempo e a que custo. */
export function rotasAtendimentos(deps: { pool: Pool }): FastifyPluginAsync {
  return async (app) => {
    app.get('/:id', async (request): Promise<AtendimentoApi> => {
      const { id } = idSchema.parse(request.params);
      const atendimento = await buscarAtendimento(deps.pool, id);
      if (!atendimento) throw new ErroAgente('NAO_ENCONTRADO', `O atendimento ${id} não existe.`);
      const requisicao = await requisicaoDoAtendimento(deps.pool, id);
      return atendimentoParaApi(atendimento, requisicao?.numero ?? null);
    });
  };
}
