import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Em desenvolvimento o Vite faz o papel do nginx: repassa /api ao backend, sem o prefixo. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@agente-compras/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
    },
  },
});
