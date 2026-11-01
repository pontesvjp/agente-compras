import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from '@agente-compras/db';
import type { FastifyInstance } from 'fastify';
import type { MockAgent } from 'undici';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prepararBancoTeste } from '../../../packages/db/test/apoio-banco.js';
import { criarServidorHttp } from '../../mcp-server/src/http.js';
import {
  BASE_URL,
  clienteComMock,
  ehBusca,
  fixture,
  loggerSilencioso,
  novoMock,
} from '../../mcp-server/test/apoio.js';
import { atenderPedido } from '../src/agente/atender.js';
import { criarModeloOpenRouter } from '../src/agente/openrouter.js';
import type { ModeloLlm } from '../src/agente/tipos.js';
import { abrirSessaoMcp } from '../src/mcp/cliente.js';
import { criarServidor } from '../src/servidor.js';
import { llmRoteirizado, type Passo } from './apoio.js';

/**
 * Integração sem rede externa: backend real, servidor MCP real (no mesmo processo), Postgres de
 * teste, DummyJSON simulada pelo MockAgent e LLM roteirizado.
 */

const PEDIDO_EXEMPLO = 'Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.';

const ROTEIRO_EXEMPLO: Passo[] = [
  { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
  {
    chamadas: [
      {
        nome: 'criar_requisicao',
        argumentos: {
          itens: [{ produto_id: 81, quantidade: 3, preco_maximo_unitario_usd: 2000 }],
          justificativa: 'time de vendas',
          solicitante: 'Financeiro',
        },
      },
    ],
  },
  { texto: 'Criei a requisição com 3 Lenovo Yoga 920.' },
];

let pool: Pool;
let dummy: MockAgent;
let mcp: Server;
let urlMcp: string;
const abertos: FastifyInstance[] = [];

beforeAll(async () => {
  pool = await prepararBancoTeste();
});
afterAll(async () => {
  await pool.end();
});
afterEach(async () => {
  await Promise.all(abertos.splice(0).map((app) => app.close()));
  await new Promise((fechado) => mcp.close(fechado));
  await dummy.close();
});

async function subir(modelo: ModeloLlm, opcoes: { mcpUrl?: string } = {}) {
  dummy = novoMock();
  mcp = criarServidorHttp({ cliente: clienteComMock(dummy), pool, logger: loggerSilencioso });
  await new Promise<void>((pronto) => mcp.listen(0, '127.0.0.1', pronto));
  urlMcp = `http://127.0.0.1:${(mcp.address() as AddressInfo).port}/mcp`;

  const app = await criarServidor(
    {
      pool,
      atender: (entrada) =>
        atenderPedido(
          {
            pool,
            modelo,
            prompt: 'prompt de teste',
            timeoutMs: 10_000,
            intervaloEsperaMs: 20,
            abrirMcp: (contexto) => abrirSessaoMcp(opcoes.mcpUrl ?? urlMcp, contexto),
          },
          entrada,
        ),
      verificarMcp: async () => true,
      llmConfigurado: true,
    },
    { logger: false },
  );
  abertos.push(app);
  return app;
}

function catalogoDeLaptops(): void {
  dummy
    .get(BASE_URL)
    .intercept({ path: ehBusca('laptop') })
    .reply(200, fixture('busca-laptop.json'));
  dummy
    .get(BASE_URL)
    .intercept({ path: '/products/81' })
    .reply(200, fixture('produto-81.json'))
    .persist();
}

const pedir = (app: FastifyInstance, corpo: object, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/requisicoes', payload: corpo, headers });

describe('POST /requisicoes', () => {
  it('pedido de exemplo: o modelo busca e grava, e a resposta traz a requisição lida do banco', async () => {
    const llm = llmRoteirizado(ROTEIRO_EXEMPLO);
    const app = await subir(llm.modelo);
    catalogoDeLaptops();

    const resposta = await pedir(app, { pedido: PEDIDO_EXEMPLO, solicitante: 'Time de vendas' });
    const corpo = resposta.json();

    expect(resposta.statusCode).toBe(201);
    expect(corpo).toMatchObject({
      resultado: 'criada',
      mensagem: 'Criei a requisição com 3 Lenovo Yoga 920.',
      requisicao: {
        status: 'aprovada',
        solicitante: 'Time de vendas',
        valor_total: 3299.97,
        moeda: 'USD',
        atendimento_id: corpo.atendimento_id,
        alcada: { valor_usd: 5000, origem: 'geral' },
        itens: [{ produto_id: 81, quantidade: 3, preco_unitario: 1099.99, subtotal: 3299.97 }],
      },
    });
    expect(corpo.ferramentas.map((f: { nome: string }) => f.nome)).toEqual([
      'buscar_produtos',
      'criar_requisicao',
    ]);
    expect(corpo.ferramentas[0].resultado).toMatchObject({ termo: 'laptop', total: 5 });
    expect(llm.recebido[0]?.[1]?.content).toContain(
      'Solicitante informado no formulário: Time de vendas',
    );
    expect(corpo.ferramentas[1].resultado).toMatchObject({
      numero: corpo.requisicao.numero,
      valor_total_texto: 'US$ 3.299,97',
    });

    const trilha = await app.inject({ url: `/atendimentos/${corpo.atendimento_id}` });
    expect(trilha.json()).toMatchObject({
      resultado: 'criada',
      requisicao_numero: corpo.requisicao.numero,
      modelo: 'roteiro/falso',
      tokens_entrada: 300,
      custo_usd: 0.000375,
      erro_codigo: null,
    });
  });

  it('nada atende: 200, nao_atendida, e nada é gravado', async () => {
    const app = await subir(
      llmRoteirizado([
        { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
        { texto: 'Não criei a requisição: nenhum laptop sai por até US$ 1.000.' },
      ]).modelo,
    );
    catalogoDeLaptops();

    const resposta = await pedir(app, { pedido: '5 laptops até US$ 1.000 cada' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ resultado: 'nao_atendida', requisicao: null });
    const { rows } = await pool.query(
      'select count(*)::int as n from requisicoes where atendimento_id = $1',
      [resposta.json().atendimento_id],
    );
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('política barra no criar_requisicao: o modelo recebe REGRA_VIOLADA e nada é gravado', async () => {
    const app = await subir(
      llmRoteirizado([
        {
          chamadas: [
            {
              nome: 'criar_requisicao',
              argumentos: { itens: [{ produto_id: 81, quantidade: 30 }], justificativa: 'time' },
            },
          ],
        },
        { texto: 'Não criei a requisição: a política permite até 20 laptops.' },
      ]).modelo,
    );
    catalogoDeLaptops();

    const resposta = await pedir(app, { pedido: '30 laptops' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      resultado: 'nao_atendida',
      ferramentas: [{ nome: 'criar_requisicao', ok: false, erro_codigo: 'REGRA_VIOLADA' }],
    });
  });

  it('Idempotency-Key: o mesmo pedido reenviado devolve a mesma resposta sem rodar o agente de novo', async () => {
    const llm = llmRoteirizado(ROTEIRO_EXEMPLO);
    const app = await subir(llm.modelo);
    catalogoDeLaptops();
    const chave = { 'idempotency-key': 'pedido-123' };

    const primeiro = await pedir(app, { pedido: PEDIDO_EXEMPLO }, chave);
    const segundo = await pedir(app, { pedido: PEDIDO_EXEMPLO }, chave);

    expect(primeiro.statusCode).toBe(201);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.headers['idempotent-replayed']).toBe('true');
    expect(segundo.json()).toEqual(primeiro.json());
    expect(llm.recebido).toHaveLength(3);
  });

  it('a mesma Idempotency-Key com outro pedido é recusada', async () => {
    const app = await subir(llmRoteirizado([{ texto: 'Não entendi o pedido.' }]).modelo);
    const chave = { 'idempotency-key': 'pedido-456' };

    await pedir(app, { pedido: 'um pedido' }, chave);
    const outro = await pedir(app, { pedido: 'outro pedido' }, chave);

    expect(outro.statusCode).toBe(400);
    expect(outro.json()).toMatchObject({ codigo: 'PEDIDO_INVALIDO' });
  });

  it('corpo sem pedido: 400 com a mensagem em português', async () => {
    const app = await subir(llmRoteirizado([]).modelo);

    const resposta = await pedir(app, { pedido: '' });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      codigo: 'PEDIDO_INVALIDO',
      mensagem: 'pedido: Escreva o pedido com pelo menos 3 letras.',
    });
  });

  it('sem chave da OpenRouter: 503 LLM_CHAVE_INVALIDA, e o atendimento fica na trilha com o erro', async () => {
    const semChave = criarModeloOpenRouter({
      baseUrl: 'https://openrouter.ai/api/v1',
      chave: '',
      modelo: 'anthropic/claude-haiku-5.5',
      modeloReserva: '',
    });
    const app = await subir(semChave);

    const resposta = await pedir(app, { pedido: PEDIDO_EXEMPLO });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().codigo).toBe('LLM_CHAVE_INVALIDA');
    const { rows } = await pool.query(
      'select resultado, erro_codigo from atendimentos order by criado_em desc limit 1',
    );
    expect(rows[0]).toEqual({ resultado: 'erro', erro_codigo: 'LLM_CHAVE_INVALIDA' });
  });

  it('servidor MCP fora: 503 MCP_INDISPONIVEL', async () => {
    const app = await subir(llmRoteirizado([]).modelo, { mcpUrl: 'http://127.0.0.1:1/mcp' });

    const resposta = await pedir(app, { pedido: PEDIDO_EXEMPLO });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toEqual({
      codigo: 'MCP_INDISPONIVEL',
      mensagem: 'O serviço de catálogo está fora do ar.',
    });
  });

  it('catálogo fora: o modelo para e o backend responde 503 CATALOGO_INDISPONIVEL', async () => {
    const app = await subir(
      llmRoteirizado([
        { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
        { texto: 'O catálogo não respondeu.' },
      ]).modelo,
    );
    dummy
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(500, 'fora')
      .times(2);

    const resposta = await pedir(app, { pedido: PEDIDO_EXEMPLO });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().codigo).toBe('CATALOGO_INDISPONIVEL');
  });

  it('devolve o x-request-id recebido, para seguir o pedido nos logs', async () => {
    const app = await subir(llmRoteirizado([{ texto: 'ok' }]).modelo);

    const resposta = await pedir(app, { pedido: 'um pedido' }, { 'x-request-id': 'rastreio-1' });

    expect(resposta.headers['x-request-id']).toBe('rastreio-1');
  });
});

describe('GET /requisicoes', () => {
  it('lista da mais recente para a mais antiga, com cursor, e dá 404 para id que não existe', async () => {
    const app = await subir(llmRoteirizado([...ROTEIRO_EXEMPLO, ...ROTEIRO_EXEMPLO]).modelo);
    catalogoDeLaptops();
    dummy
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'));
    await pedir(app, { pedido: PEDIDO_EXEMPLO });
    const ultima = (await pedir(app, { pedido: PEDIDO_EXEMPLO })).json().requisicao;

    const pagina1 = (await app.inject({ url: '/requisicoes?limite=1' })).json();
    const pagina2 = (
      await app.inject({ url: `/requisicoes?limite=1&cursor=${pagina1.proximo_cursor}` })
    ).json();
    const umaSo = await app.inject({ url: `/requisicoes/${ultima.id}` });
    const inexistente = await app.inject({ url: '/requisicoes/999999' });

    expect(pagina1.requisicoes).toEqual([ultima]);
    expect(pagina2.requisicoes[0].id).toBeLessThan(ultima.id);
    expect(umaSo.json()).toEqual(ultima);
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().codigo).toBe('NAO_ENCONTRADO');
  });
});

describe('política pela API', () => {
  it('PUT na regra da categoria vale no pedido seguinte, sem reiniciar nada', async () => {
    const app = await subir(
      llmRoteirizado([
        ROTEIRO_EXEMPLO[1] as Passo,
        { texto: 'Não criei a requisição: acima do teto da categoria.' },
      ]).modelo,
    );
    catalogoDeLaptops();

    const alterada = await app.inject({
      method: 'PUT',
      url: '/politica/categorias/Laptops',
      payload: { teto_unitario_usd: 1000 },
    });
    const pedido = await pedir(app, { pedido: PEDIDO_EXEMPLO });
    await app.inject({
      method: 'PUT',
      url: '/politica/categorias/laptops',
      payload: { teto_unitario_usd: 2500 },
    });

    expect(alterada.statusCode).toBe(200);
    expect(alterada.json().categorias).toContainEqual(
      expect.objectContaining({ categoria: 'laptops', teto_unitario_usd: 1000 }),
    );
    expect(pedido.json()).toMatchObject({
      resultado: 'nao_atendida',
      ferramentas: [{ nome: 'criar_requisicao', erro_codigo: 'REGRA_VIOLADA' }],
    });
  });

  it('PUT geral altera a alçada; categoria bloqueada sem motivo é recusada', async () => {
    const app = await subir(llmRoteirizado([]).modelo);

    const geral = await app.inject({
      method: 'PUT',
      url: '/politica',
      payload: { alcada_usd: 4000 },
    });
    const semMotivo = await app.inject({
      method: 'PUT',
      url: '/politica/categorias/tablets',
      payload: { permitida: false },
    });
    const vazio = await app.inject({ method: 'PUT', url: '/politica', payload: {} });
    await app.inject({ method: 'PUT', url: '/politica', payload: { alcada_usd: 5000 } });

    expect(geral.json().alcada_geral_usd).toBe(4000);
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().codigo).toBe('PEDIDO_INVALIDO');
    expect(vazio.statusCode).toBe(400);
  });
});

describe('métricas e health', () => {
  it('/metricas resume os atendimentos concluídos', async () => {
    const app = await subir(llmRoteirizado([]).modelo);

    const metricas = (await app.inject({ url: '/metricas' })).json();

    expect(metricas.atendimentos).toBe(metricas.criadas + metricas.nao_atendidas + metricas.erros);
    expect(metricas.criadas).toBeGreaterThan(0);
    expect(metricas.tempo_p50_ms).not.toBeNull();
  });

  it('/health mostra banco, MCP e chave do LLM', async () => {
    const app = await subir(llmRoteirizado([]).modelo);

    const health = await app.inject({ url: '/health' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok', banco: 'ok', mcp: 'ok', llm: 'configurado' });
  });
});
