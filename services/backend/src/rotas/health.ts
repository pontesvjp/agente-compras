import type { Pool } from '@agente-compras/db';
import type { FastifyPluginAsync } from 'fastify';

export interface DependenciasHealth {
  pool: Pool;
  verificarMcp: () => Promise<boolean>;
  llmConfigurado: boolean;
}

/**
 * 200 enquanto o banco responde, mesmo com o MCP fora ou sem chave: o backend continua de pé e
 * explica a falha em cada pedido. O corpo mostra o estado de cada dependência.
 */
export function rotasHealth(deps: DependenciasHealth): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (_request, reply) => {
      const [banco, mcp] = await Promise.all([
        deps.pool.query('select 1').then(
          () => 'ok' as const,
          () => 'fora' as const,
        ),
        deps.verificarMcp().then((ok) => (ok ? ('ok' as const) : ('fora' as const))),
      ]);
      const llm = deps.llmConfigurado ? 'configurado' : 'sem_chave';
      const status = banco === 'ok' && mcp === 'ok' && deps.llmConfigurado ? 'ok' : 'degradado';
      return reply.status(banco === 'ok' ? 200 : 503).send({ status, banco, mcp, llm });
    });
  };
}
