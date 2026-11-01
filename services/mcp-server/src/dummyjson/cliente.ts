import { setTimeout as esperar } from 'node:timers/promises';
import { ErroAgente } from '@agente-compras/shared';
import { type Dispatcher, fetch } from 'undici';
import { criarCache } from './cache.js';
import {
  buscaDummySchema,
  CAMPOS_BUSCA,
  type ProdutoDummy,
  type ProdutoDummyDetalhado,
  produtoDummyDetalhadoSchema,
} from './esquemas.js';

export interface OpcoesClienteDummyJson {
  baseUrl: string;
  timeoutMs: number;
  /** Validade do cache das buscas. Padrão: 60 s. */
  cacheMs?: number;
  /** Espera antes da única nova tentativa. Padrão: 300 ms. */
  esperaRetryMs?: number;
  /** Usado nos testes para trocar a rede pelo MockAgent do undici. */
  dispatcher?: Dispatcher;
  agora?: () => number;
}

export interface ClienteDummyJson {
  buscar(termo: string, limite: number): Promise<ProdutoDummy[]>;
  detalhar(id: number): Promise<ProdutoDummyDetalhado>;
}

class FalhaChamada {
  constructor(
    readonly erro: ErroAgente,
    readonly retentavel: boolean,
  ) {}
}

export function criarClienteDummyJson(opcoes: OpcoesClienteDummyJson): ClienteDummyJson {
  const cacheMs = opcoes.cacheMs ?? 60_000;
  const esperaRetryMs = opcoes.esperaRetryMs ?? 300;
  const cacheBuscas = criarCache<ProdutoDummy[]>(cacheMs, opcoes.agora ?? Date.now);

  async function tentar(caminho: string): Promise<unknown> {
    const url = new URL(caminho, opcoes.baseUrl);
    try {
      const resposta = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(opcoes.timeoutMs),
        ...(opcoes.dispatcher ? { dispatcher: opcoes.dispatcher } : {}),
      });
      if (resposta.status === 404) {
        await resposta.arrayBuffer().catch(() => undefined);
        throw new FalhaChamada(
          new ErroAgente('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado no catálogo.'),
          false,
        );
      }
      if (!resposta.ok) {
        await resposta.arrayBuffer().catch(() => undefined);
        throw new FalhaChamada(
          new ErroAgente(
            'CATALOGO_INDISPONIVEL',
            `O catálogo respondeu com erro HTTP ${resposta.status}.`,
          ),
          resposta.status >= 500,
        );
      }
      return await resposta.json();
    } catch (erro) {
      if (erro instanceof FalhaChamada) throw erro;
      if (erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
        throw new FalhaChamada(
          new ErroAgente('CATALOGO_LENTO', `O catálogo não respondeu em ${opcoes.timeoutMs} ms.`, {
            cause: erro,
          }),
          true,
        );
      }
      throw new FalhaChamada(
        new ErroAgente('CATALOGO_INDISPONIVEL', 'Não foi possível falar com o catálogo.', {
          cause: erro,
        }),
        true,
      );
    }
  }

  /** GET com uma nova tentativa só em 5xx, timeout ou falha de rede (GET é idempotente). */
  async function obterJson(caminho: string): Promise<unknown> {
    try {
      return await tentar(caminho);
    } catch (primeira) {
      if (!(primeira instanceof FalhaChamada)) throw primeira;
      if (!primeira.retentavel) throw primeira.erro;
      await esperar(esperaRetryMs);
      try {
        return await tentar(caminho);
      } catch (segunda) {
        if (segunda instanceof FalhaChamada) throw segunda.erro;
        throw segunda;
      }
    }
  }

  function respostaInesperada(): ErroAgente {
    return new ErroAgente('CATALOGO_INDISPONIVEL', 'O catálogo devolveu uma resposta inesperada.');
  }

  return {
    async buscar(termo, limite) {
      const caminho = `/products/search?q=${encodeURIComponent(termo)}&limit=${limite}&select=${CAMPOS_BUSCA.join(',')}`;
      const emCache = cacheBuscas.ler(caminho);
      if (emCache) return emCache;

      const lido = buscaDummySchema.safeParse(await obterJson(caminho));
      if (!lido.success) throw respostaInesperada();
      cacheBuscas.gravar(caminho, lido.data.products);
      return lido.data.products;
    },

    async detalhar(id) {
      const lido = produtoDummyDetalhadoSchema.safeParse(await obterJson(`/products/${id}`));
      if (!lido.success) throw respostaInesperada();
      return lido.data;
    },
  };
}
