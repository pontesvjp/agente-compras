import { setTimeout as esperar } from 'node:timers/promises';
import { ErroAgente } from '@agente-compras/shared';
import { type Dispatcher, fetch } from 'undici';
import { z } from 'zod';
import type { ModeloLlm, RespostaLlm } from './tipos.js';

export interface OpcoesOpenRouter {
  baseUrl: string;
  chave: string;
  modelo: string;
  /** Tentado pela própria OpenRouter (parâmetro `models`) se o principal falhar. Vazio desliga. */
  modeloReserva: string;
  /** Teto da espera pedida no Retry-After. Padrão: 5 s. */
  esperaMaximaMs?: number;
  /** Usado nos testes para trocar a rede pelo MockAgent do undici. */
  dispatcher?: Dispatcher;
}

const respostaSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string().nullish() }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost: z.number().nullish(),
    })
    .nullish(),
});

const erroNoCorpoSchema = z.object({ error: z.object({ message: z.string() }) });

const SEM_CHAVE =
  'Falta a chave do modelo de IA. Preencha OPENROUTER_API_KEY no .env e suba o ambiente de novo.';
const CHAVE_INVALIDA =
  'A chave do modelo de IA é inválida ou venceu. Troque OPENROUTER_API_KEY no .env.';
const SEM_TEMPO = 'O modelo de IA não respondeu a tempo. Tente de novo em instantes.';

/** Falha que vale uma nova tentativa (429, 5xx, rede), com a espera já calculada. */
class Retentavel {
  constructor(
    readonly erro: ErroAgente,
    readonly esperaMs: number,
  ) {}
}

function esperaDoRetryAfter(valor: string | null, maximaMs: number): number {
  if (valor === null) return Math.min(1000, maximaMs);
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1000, maximaMs);
  const data = Date.parse(valor);
  return Number.isFinite(data)
    ? Math.min(Math.max(data - Date.now(), 0), maximaMs)
    : Math.min(1000, maximaMs);
}

export function criarModeloOpenRouter(opcoes: OpcoesOpenRouter): ModeloLlm {
  const esperaMaximaMs = opcoes.esperaMaximaMs ?? 5000;
  const modelos = [...new Set([opcoes.modelo, opcoes.modeloReserva].filter((m) => m !== ''))];
  const url = new URL(
    'chat/completions',
    opcoes.baseUrl.endsWith('/') ? opcoes.baseUrl : `${opcoes.baseUrl}/`,
  );

  async function tentar(corpo: string, sinal: AbortSignal): Promise<RespostaLlm> {
    let resposta: Awaited<ReturnType<typeof fetch>>;
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opcoes.chave}`,
          'content-type': 'application/json',
          'x-title': 'agente-compras',
        },
        body: corpo,
        signal: sinal,
        ...(opcoes.dispatcher ? { dispatcher: opcoes.dispatcher } : {}),
      });
    } catch (erro) {
      if (sinal.aborted) throw new ErroAgente('LLM_INDISPONIVEL', SEM_TEMPO, { cause: erro });
      throw new Retentavel(
        new ErroAgente('LLM_INDISPONIVEL', 'Não consegui falar com a OpenRouter.', { cause: erro }),
        Math.min(1000, esperaMaximaMs),
      );
    }

    const texto = await resposta.text();
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroAgente('LLM_CHAVE_INVALIDA', CHAVE_INVALIDA);
    }
    if (resposta.status === 402) {
      throw new ErroAgente('LLM_INDISPONIVEL', 'A conta da OpenRouter está sem crédito.');
    }
    if (resposta.status === 429 || resposta.status >= 500) {
      throw new Retentavel(
        new ErroAgente('LLM_INDISPONIVEL', `A OpenRouter respondeu ${resposta.status}.`),
        esperaDoRetryAfter(resposta.headers.get('retry-after'), esperaMaximaMs),
      );
    }
    if (!resposta.ok) {
      throw new ErroAgente(
        'LLM_INDISPONIVEL',
        `A OpenRouter recusou a chamada (${resposta.status}): ${texto.slice(0, 300)}`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch (erro) {
      throw new ErroAgente('LLM_INDISPONIVEL', 'A OpenRouter devolveu algo que não é JSON.', {
        cause: erro,
      });
    }
    const erroNoCorpo = erroNoCorpoSchema.safeParse(json);
    if (erroNoCorpo.success) {
      throw new Retentavel(
        new ErroAgente(
          'LLM_INDISPONIVEL',
          `O provedor do modelo falhou: ${erroNoCorpo.data.error.message}`,
        ),
        Math.min(1000, esperaMaximaMs),
      );
    }
    const lida = respostaSchema.safeParse(json);
    if (!lida.success) {
      throw new ErroAgente(
        'LLM_INDISPONIVEL',
        'A resposta da OpenRouter veio num formato inesperado.',
        {
          cause: lida.error,
        },
      );
    }

    const { model, choices, usage } = lida.data;
    const mensagem = choices[0]?.message;
    return {
      conteudo: mensagem?.content ?? null,
      chamadas: (mensagem?.tool_calls ?? []).map((chamada) => ({
        id: chamada.id,
        type: 'function' as const,
        function: { name: chamada.function.name, arguments: chamada.function.arguments ?? '' },
      })),
      modelo: model,
      tokens_entrada: usage?.prompt_tokens ?? 0,
      tokens_saida: usage?.completion_tokens ?? 0,
      custo_usd: usage?.cost ?? null,
    };
  }

  return {
    async completar(mensagens, ferramentas, sinal) {
      if (opcoes.chave === '') throw new ErroAgente('LLM_CHAVE_INVALIDA', SEM_CHAVE);
      const corpo = JSON.stringify({
        model: opcoes.modelo,
        ...(modelos.length > 1 ? { models: modelos } : {}),
        messages: mensagens,
        ...(ferramentas.length > 0 ? { tools: ferramentas } : {}),
        temperature: 0,
        usage: { include: true },
      });

      try {
        return await tentar(corpo, sinal);
      } catch (primeiro) {
        if (!(primeiro instanceof Retentavel)) throw primeiro;
        try {
          await esperar(primeiro.esperaMs, undefined, { signal: sinal });
        } catch (erro) {
          throw new ErroAgente('LLM_INDISPONIVEL', SEM_TEMPO, { cause: erro });
        }
        try {
          return await tentar(corpo, sinal);
        } catch (segundo) {
          throw segundo instanceof Retentavel ? segundo.erro : segundo;
        }
      }
    },
  };
}
