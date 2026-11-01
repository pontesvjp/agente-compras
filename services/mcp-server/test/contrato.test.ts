import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { criarServidorHttp } from '../src/http.js';
import { criarServidorMcp } from '../src/servidor.js';
import { BASE_URL, clienteComMock, ehBusca, fixture, loggerSilencioso, novoMock } from './apoio.js';

let agente = novoMock();
afterEach(async () => {
  await agente.close();
  agente = novoMock();
});

describe('contrato MCP', () => {
  it('um cliente MCP de verdade lista as ferramentas, com schema de saída e só leitura', async () => {
    const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
    await criarServidorMcp({ cliente: clienteComMock(agente), logger: loggerSilencioso }).connect(
      ladoServidor,
    );
    const cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(ladoCliente);

    const { tools } = await cliente.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(['buscar_produtos', 'detalhar_produto']);
    for (const ferramenta of tools) {
      expect(ferramenta.outputSchema).toBeDefined();
      expect(ferramenta.annotations?.readOnlyHint).toBe(true);
      expect(ferramenta.description).toContain('Quando chamar');
    }
    await cliente.close();
  });

  it('atende por Streamable HTTP em /mcp, sem sessão', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'));
    const servidorHttp = criarServidorHttp(clienteComMock(agente), loggerSilencioso);
    await new Promise<void>((pronto) => servidorHttp.listen(0, '127.0.0.1', pronto));
    const { port } = servidorHttp.address() as AddressInfo;

    const cliente = new Client({ name: 'teste', version: '1.0.0' });
    await cliente.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { 'x-request-id': 'teste-123' } },
      }),
    );
    const resultado = await cliente.callTool({
      name: 'buscar_produtos',
      arguments: { termo: 'laptop' },
    });

    expect(resultado.structuredContent).toMatchObject({ termo: 'laptop', total: 5 });
    await cliente.close();
    await new Promise((fechado) => servidorHttp.close(fechado));
  });

  it('responde /health para o healthcheck do compose', async () => {
    const servidorHttp = criarServidorHttp(clienteComMock(agente), loggerSilencioso);
    await new Promise<void>((pronto) => servidorHttp.listen(0, '127.0.0.1', pronto));
    const { port } = servidorHttp.address() as AddressInfo;

    const resposta = await fetch(`http://127.0.0.1:${port}/health`);

    expect(await resposta.json()).toEqual({ status: 'ok' });
    await new Promise((fechado) => servidorHttp.close(fechado));
  });
});
