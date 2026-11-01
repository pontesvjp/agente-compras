import { lerConfig } from './config.js';
import { criarClienteDummyJson } from './dummyjson/cliente.js';
import { criarServidorHttp } from './http.js';
import { criarLogger } from './logger.js';

const config = lerConfig();
const logger = criarLogger(config.LOG_LEVEL);
const cliente = criarClienteDummyJson({
  baseUrl: config.DUMMYJSON_BASE_URL,
  timeoutMs: config.DUMMYJSON_TIMEOUT_MS,
});

const servidorHttp = criarServidorHttp(cliente, logger);
servidorHttp.listen(config.MCP_PORTA, () => {
  logger.info({ porta: config.MCP_PORTA, catalogo: config.DUMMYJSON_BASE_URL }, 'mcp-server no ar');
});

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    logger.info({ sinal }, 'encerrando');
    servidorHttp.close(() => process.exit(0));
  });
}
