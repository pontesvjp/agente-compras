import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ClienteDummyJson } from './dummyjson/cliente.js';
import type { Logger } from './logger.js';
import { criarServidorMcp } from './servidor.js';

const LIMITE_CORPO_BYTES = 1_000_000;

function responderJson(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(corpo));
}

function erroJsonRpc(res: ServerResponse, status: number, code: number, message: string): void {
  responderJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

async function lerCorpoJson(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of req) {
    const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(String(parte));
    tamanho += buffer.length;
    if (tamanho > LIMITE_CORPO_BYTES) throw new Error('corpo grande demais');
    partes.push(buffer);
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

/** Um McpServer e um transporte por requisição: o servidor é stateless e escala sem sessão. */
async function atenderMcp(
  req: IncomingMessage,
  res: ServerResponse,
  cliente: ClienteDummyJson,
  logger: Logger,
): Promise<void> {
  if (req.method !== 'POST') {
    erroJsonRpc(res, 405, -32000, 'Use POST: este servidor MCP é stateless.');
    return;
  }
  let corpo: unknown;
  try {
    corpo = await lerCorpoJson(req);
  } catch {
    erroJsonRpc(res, 400, -32700, 'JSON inválido.');
    return;
  }
  const servidor = criarServidorMcp({ cliente, logger });
  const transporte = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transporte.close();
    void servidor.close();
  });
  await servidor.connect(transporte);
  await transporte.handleRequest(req, res, corpo);
}

export function criarServidorHttp(cliente: ClienteDummyJson, logger: Logger): Server {
  return createServer((req, res) => {
    const cabecalho = req.headers['x-request-id'];
    const requestId = typeof cabecalho === 'string' && cabecalho !== '' ? cabecalho : randomUUID();
    const log = logger.child({ request_id: requestId });
    const caminho = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (caminho === '/health') {
      responderJson(res, 200, { status: 'ok' });
      return;
    }
    if (caminho === '/mcp') {
      atenderMcp(req, res, cliente, log).catch((erro: unknown) => {
        log.error({ err: erro }, 'falha ao atender /mcp');
        if (!res.headersSent) erroJsonRpc(res, 500, -32603, 'Erro interno do servidor MCP.');
      });
      return;
    }
    responderJson(res, 404, { erro: 'rota não encontrada' });
  });
}
