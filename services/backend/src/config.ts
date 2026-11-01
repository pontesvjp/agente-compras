import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'informe a URL do Postgres'),
  MCP_URL: z.url().default('http://localhost:3001/mcp'),
  OPENROUTER_API_KEY: z.string().trim().default(''),
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  LLM_MODELO: z.string().trim().min(1).default('anthropic/claude-haiku-5.5'),
  LLM_MODELO_RESERVA: z.string().trim().default('deepseek/deepseek-v4.1-flash'),
  POLITICA_TOKEN: z.string().trim().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  BACKEND_PORTA: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = configSchema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida do backend: ${problemas}`);
  }
  return resultado.data;
}
