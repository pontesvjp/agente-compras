import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const caminho = (relativo: string) => fileURLToPath(new URL(relativo, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@agente-compras/shared': caminho('./packages/shared/src/index.ts'),
      '@agente-compras/db': caminho('./packages/db/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'services/*/test/**/*.test.ts'],
    testTimeout: 10_000,
    // Os testes de banco recriam o schema do Postgres de teste: um arquivo por vez.
    fileParallelism: false,
  },
});
