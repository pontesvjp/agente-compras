import { criarPool } from '@agente-compras/db';
import { atenderPedido } from './agente/atender.js';
import { criarModeloOpenRouter } from './agente/openrouter.js';
import { lerPrompt } from './agente/prompt.js';
import { lerConfig } from './config.js';
import { abrirSessaoMcp, mcpNoAr } from './mcp/cliente.js';
import { criarServidor } from './servidor.js';

const config = lerConfig();
const pool = criarPool(config.DATABASE_URL);
const prompt = await lerPrompt();
const modelo = criarModeloOpenRouter({
  baseUrl: config.OPENROUTER_BASE_URL,
  chave: config.OPENROUTER_API_KEY,
  modelo: config.LLM_MODELO,
  modeloReserva: config.LLM_MODELO_RESERVA,
});
const llmConfigurado = config.OPENROUTER_API_KEY !== '';

const app = await criarServidor(
  {
    pool,
    atender: (entrada) =>
      atenderPedido(
        {
          pool,
          modelo,
          prompt,
          timeoutMs: config.LLM_TIMEOUT_MS,
          abrirMcp: (contexto) => abrirSessaoMcp(config.MCP_URL, contexto),
        },
        entrada,
      ),
    verificarMcp: () => mcpNoAr(config.MCP_URL),
    llmConfigurado,
  },
  { logger: { name: 'backend', level: config.LOG_LEVEL } },
);

if (!llmConfigurado) {
  app.log.warn('OPENROUTER_API_KEY vazia: o backend sobe, e cada pedido avisa que falta a chave');
}
await app.listen({ port: config.BACKEND_PORTA, host: '0.0.0.0' });
app.log.info(
  { modelo: config.LLM_MODELO, reserva: config.LLM_MODELO_RESERVA, mcp: config.MCP_URL },
  'backend no ar',
);

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    app.log.info({ sinal }, 'encerrando');
    void app
      .close()
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
}
