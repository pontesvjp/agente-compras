import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClienteDummyJson } from './dummyjson/cliente.js';
import { registrarBuscarProdutos } from './ferramentas/buscar-produtos.js';
import { registrarDetalharProduto } from './ferramentas/detalhar-produto.js';
import type { Logger } from './logger.js';

export interface DependenciasServidor {
  cliente: ClienteDummyJson;
  logger: Logger;
}

export function criarServidorMcp({ cliente, logger }: DependenciasServidor): McpServer {
  const servidor = new McpServer({ name: 'agente-compras-catalogo', version: '0.1.0' });
  registrarBuscarProdutos(servidor, cliente, logger);
  registrarDetalharProduto(servidor, cliente, logger);
  return servidor;
}
