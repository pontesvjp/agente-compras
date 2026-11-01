import { ErroAgente } from '@agente-compras/shared';
import { MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { criarModeloOpenRouter } from '../src/agente/openrouter.js';
import type { MensagemLlm } from '../src/agente/tipos.js';

const BASE = 'https://openrouter.ai';
const CAMINHO = '/api/v1/chat/completions';
const MENSAGENS: MensagemLlm[] = [{ role: 'user', content: 'oi' }];

let agente = novoAgente();
afterEach(async () => {
  await agente.close();
  agente = novoAgente();
});

function novoAgente(): MockAgent {
  const mock = new MockAgent();
  mock.disableNetConnect();
  return mock;
}

function modelo(chave = 'sk-or-v1-teste') {
  return criarModeloOpenRouter({
    baseUrl: `${BASE}/api/v1`,
    chave,
    modelo: 'anthropic/claude-haiku-5.5',
    modeloReserva: 'deepseek/deepseek-v4.1-flash',
    esperaMaximaMs: 50,
    dispatcher: agente,
  });
}

const completar = (chave?: string) =>
  modelo(chave).completar(MENSAGENS, [], new AbortController().signal);

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(erro instanceof ErroAgente)) throw new Error('esperava um ErroAgente');
  return erro.codigo;
}

const RESPOSTA_OK = {
  model: 'anthropic/claude-haiku-5.5',
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'buscar_produtos', arguments: '{"termo":"laptop"}' },
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 812, completion_tokens: 40, cost: 0.0001012 },
};

describe('OpenRouter', () => {
  it('sem chave, avisa que falta a chave sem chamar a rede', async () => {
    expect(await codigoDoErro(completar(''))).toBe('LLM_CHAVE_INVALIDA');
  });

  it('401 vira LLM_CHAVE_INVALIDA, com a instrução de trocar a chave no .env', async () => {
    agente.get(BASE).intercept({ path: CAMINHO, method: 'POST' }).reply(401, { error: {} });

    const erro = await completar().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroAgente);
    expect(erro).toMatchObject({ codigo: 'LLM_CHAVE_INVALIDA' });
    expect(String(erro)).toContain('OPENROUTER_API_KEY');
  });

  it('429 com Retry-After: espera e tenta de novo', async () => {
    const pool = agente.get(BASE);
    pool
      .intercept({ path: CAMINHO, method: 'POST' })
      .reply(429, { error: { message: 'limite' } }, { headers: { 'retry-after': '0' } });
    pool.intercept({ path: CAMINHO, method: 'POST' }).reply(200, RESPOSTA_OK);

    const resposta = await completar();

    expect(resposta.chamadas[0]?.function.name).toBe('buscar_produtos');
  });

  it('402 (chave sem crédito) vira LLM_CHAVE_INVALIDA, sem nova tentativa', async () => {
    agente
      .get(BASE)
      .intercept({ path: CAMINHO, method: 'POST' })
      .reply(402, { error: { message: 'requires more credits' } });

    const erro = await completar().catch((e: unknown) => e);

    expect(erro).toMatchObject({ codigo: 'LLM_CHAVE_INVALIDA' });
    expect(String(erro)).toContain('sem crédito');
  });

  it('5xx duas vezes vira LLM_INDISPONIVEL', async () => {
    agente.get(BASE).intercept({ path: CAMINHO, method: 'POST' }).reply(503, 'fora').times(2);

    expect(await codigoDoErro(completar())).toBe('LLM_INDISPONIVEL');
  });

  it('manda o modelo de reserva, temperatura 0 e as ferramentas; lê chamadas, tokens e custo', async () => {
    let corpoEnviado: unknown;
    agente
      .get(BASE)
      .intercept({
        path: CAMINHO,
        method: 'POST',
        body: (corpo) => {
          corpoEnviado = JSON.parse(corpo);
          return true;
        },
      })
      .reply(200, RESPOSTA_OK);

    const resposta = await modelo().completar(
      MENSAGENS,
      [
        {
          type: 'function',
          function: { name: 'buscar_produtos', description: '', parameters: {} },
        },
      ],
      new AbortController().signal,
    );

    expect(corpoEnviado).toMatchObject({
      model: 'anthropic/claude-haiku-5.5',
      models: ['anthropic/claude-haiku-5.5', 'deepseek/deepseek-v4.1-flash'],
      temperature: 0,
      max_tokens: 1024,
      tools: [{ function: { name: 'buscar_produtos' } }],
    });
    expect(resposta).toEqual({
      conteudo: null,
      chamadas: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'buscar_produtos', arguments: '{"termo":"laptop"}' },
        },
      ],
      modelo: 'anthropic/claude-haiku-5.5',
      tokens_entrada: 812,
      tokens_saida: 40,
      custo_usd: 0.0001012,
    });
  });

  it('resposta fora do formato esperado vira LLM_INDISPONIVEL', async () => {
    agente.get(BASE).intercept({ path: CAMINHO, method: 'POST' }).reply(200, { choices: [] });

    expect(await codigoDoErro(completar())).toBe('LLM_INDISPONIVEL');
  });
});
