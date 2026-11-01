/** Formato de mensagens e ferramentas da API de chat da OpenRouter (compatível com a da OpenAI). */

export interface ChamadaFerramentaLlm {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type MensagemLlm =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaFerramentaLlm[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface FerramentaLlm {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface RespostaLlm {
  conteudo: string | null;
  chamadas: ChamadaFerramentaLlm[];
  /** Modelo que respondeu de fato: o principal ou o de reserva. */
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number | null;
}

/** O que o laço precisa de um LLM. A OpenRouter implementa; os testes usam um roteiro falso. */
export interface ModeloLlm {
  completar(
    mensagens: readonly MensagemLlm[],
    ferramentas: readonly FerramentaLlm[],
    sinal: AbortSignal,
  ): Promise<RespostaLlm>;
}

export interface ResultadoFerramenta {
  ok: boolean;
  /** Texto devolvido ao modelo como resultado da ferramenta. */
  texto: string;
  erro_codigo: string | null;
  /** Resultado estruturado, guardado na trilha e usado pelo chat para descrever cada passo. */
  estruturado: unknown;
}

/** O que o laço precisa do MCP. A sessão MCP implementa; os testes usam um executor falso. */
export interface ExecutorFerramentas {
  readonly ferramentas: readonly FerramentaLlm[];
  chamar(nome: string, argumentos: Record<string, unknown>): Promise<ResultadoFerramenta>;
}
