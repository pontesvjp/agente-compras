import { setTimeout as esperar } from 'node:timers/promises';
import type {
  ChamadaFerramentaLlm,
  ExecutorFerramentas,
  MensagemLlm,
  ModeloLlm,
} from '../src/agente/tipos.js';

/** Uma volta do roteiro: ou o modelo pede ferramentas, ou responde com texto. */
export type Passo =
  | { chamadas: { nome: string; argumentos: Record<string, unknown> | string }[] }
  | { texto: string };

export interface LlmRoteirizado {
  modelo: ModeloLlm;
  /** As mensagens que o modelo recebeu em cada volta. */
  recebido: MensagemLlm[][];
}

/** LLM falso: devolve as voltas do roteiro em ordem. Nenhum teste chama um LLM de verdade. */
export function llmRoteirizado(passos: Passo[]): LlmRoteirizado {
  const recebido: MensagemLlm[][] = [];
  const modelo: ModeloLlm = {
    async completar(mensagens) {
      recebido.push([...mensagens]);
      const volta = recebido.length;
      const passo = passos[volta - 1];
      if (!passo) throw new Error(`o roteiro não tem a volta ${volta}`);
      const chamadas: ChamadaFerramentaLlm[] =
        'chamadas' in passo
          ? passo.chamadas.map((chamada, i) => ({
              id: `volta${volta}-chamada${i}`,
              type: 'function',
              function: {
                name: chamada.nome,
                arguments:
                  typeof chamada.argumentos === 'string'
                    ? chamada.argumentos
                    : JSON.stringify(chamada.argumentos),
              },
            }))
          : [];
      return {
        conteudo: 'texto' in passo ? passo.texto : null,
        chamadas,
        modelo: 'roteiro/falso',
        tokens_entrada: 100,
        tokens_saida: 20,
        custo_usd: 0.000125,
      };
    },
  };
  return { modelo, recebido };
}

export const NOMES_FERRAMENTAS = [
  'buscar_produtos',
  'detalhar_produto',
  'criar_requisicao',
  'consultar_politica',
];

/** Executor falso: registra a ordem das chamadas e devolve um texto por ferramenta. */
export function executorFalso(atrasoMs: Record<string, number> = {}): {
  executor: ExecutorFerramentas;
  ordem: string[];
} {
  const ordem: string[] = [];
  const executor: ExecutorFerramentas = {
    ferramentas: NOMES_FERRAMENTAS.map((name) => ({
      type: 'function',
      function: { name, description: '', parameters: { type: 'object' } },
    })),
    async chamar(nome) {
      ordem.push(nome);
      await esperar(atrasoMs[nome] ?? 0);
      const estruturado = { resultado_de: nome };
      return { ok: true, texto: JSON.stringify(estruturado), erro_codigo: null, estruturado };
    },
  };
  return { executor, ordem };
}
