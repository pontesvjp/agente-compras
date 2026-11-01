import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from '@agente-compras/db';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prepararBancoTeste } from '../../../packages/db/test/apoio-banco.js';
import { criarServidorHttp } from '../src/http.js';
import { criarServidorMcp } from '../src/servidor.js';
import { BASE_URL, clienteComMock, ehBusca, fixture, loggerSilencioso, novoMock } from './apoio.js';

let pool: Pool;
let agente = novoMock();
beforeAll(async () => {
  pool = await prepararBancoTeste();
});
afterAll(async () => {
  await pool.end();
});
afterEach(async () => {
  await agente.close();
  agente = novoMock();
});

async function subirHttp(): Promise<{ servidor: Server; url: URL }> {
  const servidor = criarServidorHttp({
    cliente: clienteComMock(agente),
    pool,
    logger: loggerSilencioso,
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.address() as AddressInfo;
  return { servidor, url: new URL(`http://127.0.0.1:${port}`) };
}

describe('contrato MCP', () => {
  it('um cliente MCP de verdade lista as quatro ferramentas, com schema de saída', async () => {
    const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
    await criarServidorMcp({
      cliente: clienteComMock(agente),
      pool,
      logger: loggerSilencioso,
    }).connect(ladoServidor);
    const cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(ladoCliente);

    const { tools } = await cliente.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'buscar_produtos',
      'consultar_politica',
      'criar_requisicao',
      'detalhar_produto',
    ]);
    for (const ferramenta of tools) {
      expect(ferramenta.outputSchema).toBeDefined();
      expect(ferramenta.description).toContain('Quando chamar');
      expect(ferramenta.annotations?.readOnlyHint).toBe(ferramenta.name !== 'criar_requisicao');
    }
    await cliente.close();
  });

  it('atende por Streamable HTTP em /mcp, sem sessão', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'));
    const { servidor, url } = await subirHttp();

    const cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(new StreamableHTTPClientTransport(new URL('/mcp', url)));
    const resultado = await cliente.callTool({
      name: 'buscar_produtos',
      arguments: { termo: 'laptop' },
    });

    expect(resultado.structuredContent).toMatchObject({ termo: 'laptop', total: 5 });
    await cliente.close();
    await new Promise((fechado) => servidor.close(fechado));
  });

  it('liga a requisição ao atendimento do backend pelo header x-atendimento-id', async () => {
    agente.get(BASE_URL).intercept({ path: '/products/81' }).reply(200, fixture('produto-81.json'));
    const { servidor, url } = await subirHttp();
    const atendimentoId = randomUUID();

    const cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', url), {
        requestInit: { headers: { 'x-atendimento-id': atendimentoId, 'x-request-id': 'teste-1' } },
      }),
    );
    const resultado = await cliente.callTool({
      name: 'criar_requisicao',
      arguments: { itens: [{ produto_id: 81, quantidade: 3 }], justificativa: 'time de vendas' },
    });
    const numero = (resultado.structuredContent as { numero: string }).numero;

    const { rows } = await pool.query('select atendimento_id from requisicoes where numero = $1', [
      numero,
    ]);
    expect(rows).toEqual([{ atendimento_id: atendimentoId }]);
    await cliente.close();
    await new Promise((fechado) => servidor.close(fechado));
  });

  it('recusa Origin de fora da máquina (DNS rebinding) e aceita página do localhost', async () => {
    const { servidor, url } = await subirHttp();
    const inicializar = (origin: string) =>
      fetch(new URL('/mcp', url), {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'teste', version: '1.0.0' },
          },
        }),
      });

    const [deFora, semHost, local] = await Promise.all([
      inicializar('http://site-malicioso.example'),
      inicializar('null'),
      inicializar('http://localhost:8080'),
    ]);

    expect(deFora.status).toBe(403);
    expect(semHost.status).toBe(403);
    expect(local.status).toBe(200);
    await new Promise((fechado) => servidor.close(fechado));
  });

  it('responde /health para o healthcheck do compose', async () => {
    const { servidor, url } = await subirHttp();

    const resposta = await fetch(new URL('/health', url));

    expect(await resposta.json()).toEqual({ status: 'ok' });
    await new Promise((fechado) => servidor.close(fechado));
  });
});
