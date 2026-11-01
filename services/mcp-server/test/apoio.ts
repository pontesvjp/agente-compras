import { readFileSync } from 'node:fs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { pino } from 'pino';
import { MockAgent } from 'undici';
import { type ClienteDummyJson, criarClienteDummyJson } from '../src/dummyjson/cliente.js';

export const BASE_URL = 'https://dummyjson.com';
export const loggerSilencioso = pino({ level: 'silent' });

export function fixture(nome: string): object {
  return JSON.parse(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), 'utf8')) as object;
}

export function novoMock(): MockAgent {
  const agente = new MockAgent();
  agente.disableNetConnect();
  return agente;
}

export function clienteComMock(agente: MockAgent, timeoutMs = 1000): ClienteDummyJson {
  return criarClienteDummyJson({
    baseUrl: BASE_URL,
    timeoutMs,
    esperaRetryMs: 0,
    dispatcher: agente,
  });
}

export const ehBusca = (termo: string) => (caminho: string) =>
  caminho.startsWith('/products/search?') &&
  new URLSearchParams(caminho.split('?')[1]).get('q') === termo;

/** Lê o `{ codigo, mensagem }` que a ferramenta devolve quando dá erro. */
export function erroDaFerramenta(resultado: CallToolResult): { codigo: string; mensagem: string } {
  const primeiro = resultado.content[0];
  if (!resultado.isError || primeiro?.type !== 'text')
    throw new Error('a ferramenta não devolveu erro');
  return JSON.parse(primeiro.text) as { codigo: string; mensagem: string };
}
