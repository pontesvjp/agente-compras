import type { Pool } from '@agente-compras/db';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClienteDummyJson } from './dummyjson/cliente.js';
import { registrarBuscarProdutos } from './ferramentas/buscar-produtos.js';
import { registrarConsultarPolitica } from './ferramentas/consultar-politica.js';
import { registrarCriarRequisicao } from './ferramentas/criar-requisicao.js';
import { registrarDetalharProduto } from './ferramentas/detalhar-produto.js';
import type { Logger } from './logger.js';

export interface DependenciasServidor {
  cliente: ClienteDummyJson;
  pool: Pool;
  logger: Logger;
  /** Atendimento do backend que originou a chamada (header x-atendimento-id), se houver. */
  atendimentoId?: string | null;
}

export function criarServidorMcp(deps: DependenciasServidor): McpServer {
  const { cliente, pool, logger } = deps;
  const servidor = new McpServer({ name: 'agente-compras-catalogo', version: '0.2.0' });
  registrarBuscarProdutos(servidor, cliente, logger);
  registrarDetalharProduto(servidor, cliente, logger);
  registrarConsultarPolitica(servidor, pool, logger);
  registrarCriarRequisicao(servidor, {
    cliente,
    pool,
    logger,
    atendimentoId: deps.atendimentoId ?? null,
  });
  return servidor;
}
