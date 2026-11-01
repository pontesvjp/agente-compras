import { randomUUID } from 'node:crypto';
import type { Pool } from '@agente-compras/db';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { z } from 'zod';
import type { Atendido, EntradaAtendimento } from './agente/atender.js';
import { tratarErro } from './erros.js';
import { rotasAtendimentos } from './rotas/atendimentos.js';
import { rotasHealth } from './rotas/health.js';
import { rotasMetricas } from './rotas/metricas.js';
import { rotasPolitica } from './rotas/politica.js';
import { rotasRequisicoes } from './rotas/requisicoes.js';

z.config(z.locales.pt());

export interface DependenciasServidor {
  pool: Pool;
  atender: (entrada: EntradaAtendimento) => Promise<Atendido>;
  verificarMcp: () => Promise<boolean>;
  llmConfigurado: boolean;
}

/** Rotas na raiz: o nginx do chat repassa `/api/*` para cá sem o prefixo. */
export async function criarServidor(
  deps: DependenciasServidor,
  opcoes: { logger: FastifyServerOptions['logger'] },
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opcoes.logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    genReqId: () => randomUUID(),
    // Só o nginx (o salto 0) é proxy confiável: com `true`, o IP do limite de pedidos viria do
    // primeiro X-Forwarded-For, que o cliente escreve como quiser e assim escaparia do limite.
    trustProxy: (_endereco, salto) => salto === 0,
    bodyLimit: 64 * 1024,
  });

  app.setErrorHandler(tratarErro);
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      codigo: 'NAO_ENCONTRADO',
      mensagem: `A rota ${request.method} ${request.url} não existe.`,
    });
  });
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(rateLimit, { global: false });
  await app.register(rotasRequisicoes(deps), { prefix: '/requisicoes' });
  await app.register(rotasAtendimentos(deps), { prefix: '/atendimentos' });
  await app.register(rotasMetricas(deps), { prefix: '/metricas' });
  await app.register(rotasPolitica(deps), { prefix: '/politica' });
  await app.register(rotasHealth(deps), { prefix: '/health' });
  return app;
}
