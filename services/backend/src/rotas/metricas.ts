import { lerMetricas, type Pool } from '@agente-compras/db';
import type { Metricas } from '@agente-compras/shared';
import type { FastifyPluginAsync } from 'fastify';
import { metricasParaApi } from '../apresentacao.js';

export function rotasMetricas(deps: { pool: Pool }): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (): Promise<Metricas> => metricasParaApi(await lerMetricas(deps.pool)));
  };
}
