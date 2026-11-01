# syntax=docker/dockerfile:1
# Um Dockerfile só, com um target por serviço: mcp-server, backend, chat e testes.
# A instalação das dependências é uma camada compartilhada, então os targets não repetem o npm ci.

FROM node:22-alpine AS base
WORKDIR /app

# 1. Dependências: só os package.json, para o cache sobreviver a mudanças no código
FROM base AS dependencias
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY services/mcp-server/package.json services/mcp-server/
COPY services/backend/package.json services/backend/
COPY apps/chat/package.json apps/chat/
RUN npm ci --no-audit --no-fund

# 2. Código-fonte (com as dependências de desenvolvimento): base do build e dos testes
FROM dependencias AS fonte
COPY tsconfig.base.json tsconfig.json tsconfig.test.json biome.json vitest.config.ts ./
COPY packages packages
COPY services services
COPY apps apps

# 3. Build: TypeScript dos pacotes e serviços, e o bundle do chat
FROM fonte AS build
RUN npx tsc -b && npm run build -w @agente-compras/chat

# 4. Só as dependências de produção, para as imagens finais
FROM dependencias AS producao
RUN npm prune --omit=dev --no-audit --no-fund

# 5. Base das imagens Node: dependências de produção e os pacotes compartilhados já compilados
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=producao /app/node_modules node_modules
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY packages/db/package.json packages/db/
COPY packages/db/migrations packages/db/migrations
COPY --from=build /app/packages/db/dist packages/db/dist
USER node

FROM runtime AS mcp-server
COPY services/mcp-server/package.json services/mcp-server/
COPY --from=build /app/services/mcp-server/dist services/mcp-server/dist
EXPOSE 3001
CMD ["node", "--enable-source-maps", "services/mcp-server/dist/index.js"]

FROM runtime AS backend
COPY services/backend/package.json services/backend/
COPY services/backend/src/agente/prompt.md services/backend/src/agente/prompt.md
COPY --from=build /app/services/backend/dist services/backend/dist
EXPOSE 3000
CMD ["node", "--enable-source-maps", "services/backend/dist/index.js"]

# O chat é estático: o nginx sem root serve o build e repassa /api, /requisicoes e /mcp
FROM nginxinc/nginx-unprivileged:stable-alpine AS chat
COPY apps/chat/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/chat/dist /usr/share/nginx/html
EXPOSE 8080

# Lint, tipos e testes, sem chave de LLM e sem internet (docker compose run --rm testes)
FROM fonte AS testes
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm test"]
