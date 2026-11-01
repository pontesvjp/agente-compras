import { setTimeout as esperar } from 'node:timers/promises';
import { criarPool, migrar, type Pool } from '@agente-compras/db';
import { lerConfig } from './config.js';
import { criarClienteDummyJson } from './dummyjson/cliente.js';
import { criarServidorHttp } from './http.js';
import { criarLogger, type Logger } from './logger.js';

/** O Postgres pode estar terminando de subir: tenta migrar por até ~30 s antes de desistir. */
async function migrarComEspera(pool: Pool, logger: Logger): Promise<void> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const aplicadas = await migrar(pool);
      logger.info({ aplicadas }, 'banco pronto');
      return;
    } catch (erro) {
      if (tentativa >= 15) throw erro;
      logger.warn({ tentativa, err: erro }, 'banco ainda não respondeu; nova tentativa em 2 s');
      await esperar(2000);
    }
  }
}

const config = lerConfig();
const logger = criarLogger(config.LOG_LEVEL);
const pool = criarPool(config.DATABASE_URL);
const cliente = criarClienteDummyJson({
  baseUrl: config.DUMMYJSON_BASE_URL,
  timeoutMs: config.DUMMYJSON_TIMEOUT_MS,
});

await migrarComEspera(pool, logger);

const servidorHttp = criarServidorHttp({ cliente, pool, logger });
servidorHttp.listen(config.MCP_PORTA, () => {
  logger.info({ porta: config.MCP_PORTA, catalogo: config.DUMMYJSON_BASE_URL }, 'mcp-server no ar');
});

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    logger.info({ sinal }, 'encerrando');
    servidorHttp.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
