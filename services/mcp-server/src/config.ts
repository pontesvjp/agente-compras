import { z } from 'zod';

const configSchema = z.object({
  MCP_PORTA: z.coerce.number().int().positive().default(3001),
  DUMMYJSON_BASE_URL: z.url().default('https://dummyjson.com'),
  DUMMYJSON_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = configSchema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida do mcp-server: ${problemas}`);
  }
  return resultado.data;
}
