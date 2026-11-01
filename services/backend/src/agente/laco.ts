import type { ChamadaFerramenta } from '@agente-compras/shared';
import { z } from 'zod';
import type {
  ChamadaFerramentaLlm,
  ExecutorFerramentas,
  MensagemLlm,
  ModeloLlm,
  RespostaLlm,
  ResultadoFerramenta,
} from './tipos.js';

export const MAXIMO_VOLTAS = 8;

const SEM_RESPOSTA = 'O modelo não escreveu uma resposta. Tente de novo.';
const LIMITE_ATINGIDO = `Não consegui concluir o pedido em ${MAXIMO_VOLTAS} passos. Escreva de novo com o produto, a quantidade e o preço máximo.`;

/** O que o atendimento acumula durante o laço. Fica com quem chamou mesmo se o laço falhar no meio. */
export interface Trilha {
  chamadas: ChamadaFerramenta[];
  modelo: string | null;
  tokens_entrada: number;
  tokens_saida: number;
  /** Custo em milionésimos de dólar, inteiro, para somar sem float. */
  custo_micro_usd: number | null;
}

export function novaTrilha(): Trilha {
  return { chamadas: [], modelo: null, tokens_entrada: 0, tokens_saida: 0, custo_micro_usd: null };
}

export interface EntradaLaco {
  pedido: string;
  prompt: string;
  modelo: ModeloLlm;
  executor: ExecutorFerramentas;
  sinal: AbortSignal;
  trilha: Trilha;
}

export interface ResultadoLaco {
  mensagem: string;
  /** false quando o laço parou no limite de voltas sem resposta final. */
  concluiu: boolean;
}

const argumentosSchema = z.record(z.string(), z.unknown());

/** O argumento vem do modelo como texto: só passa se for um objeto JSON. */
function lerArgumentos(texto: string): Record<string, unknown> | null {
  if (texto.trim() === '') return {};
  try {
    const lido = argumentosSchema.safeParse(JSON.parse(texto));
    return lido.success ? lido.data : null;
  } catch {
    return null;
  }
}

function erroParaModelo(codigo: string, mensagem: string): ResultadoFerramenta {
  const estruturado = { codigo, mensagem };
  return { ok: false, texto: JSON.stringify(estruturado), erro_codigo: codigo, estruturado };
}

async function executarChamada(
  executor: ExecutorFerramentas,
  chamada: ChamadaFerramentaLlm,
): Promise<{ registro: ChamadaFerramenta; texto: string }> {
  const inicio = performance.now();
  const nome = chamada.function.name;
  const argumentos = lerArgumentos(chamada.function.arguments);

  let resultado: ResultadoFerramenta;
  if (argumentos === null) {
    resultado = erroParaModelo(
      'PEDIDO_INVALIDO',
      'Os argumentos não são um objeto JSON válido. Chame a ferramenta de novo com JSON válido.',
    );
  } else if (!executor.ferramentas.some((f) => f.function.name === nome)) {
    resultado = erroParaModelo(
      'PEDIDO_INVALIDO',
      `A ferramenta ${nome} não existe. Use só as ferramentas da lista.`,
    );
  } else {
    resultado = await executor.chamar(nome, argumentos);
  }

  return {
    registro: {
      nome,
      argumentos: argumentos ?? { argumentos_invalidos: chamada.function.arguments },
      duracao_ms: Math.round(performance.now() - inicio),
      ok: resultado.ok,
      erro_codigo: resultado.erro_codigo,
      resultado: resultado.estruturado,
    },
    texto: resultado.texto,
  };
}

function registrarUso(trilha: Trilha, resposta: RespostaLlm): void {
  trilha.modelo = resposta.modelo;
  trilha.tokens_entrada += resposta.tokens_entrada;
  trilha.tokens_saida += resposta.tokens_saida;
  if (resposta.custo_usd !== null) {
    trilha.custo_micro_usd = (trilha.custo_micro_usd ?? 0) + Math.round(resposta.custo_usd * 1e6);
  }
}

/**
 * Laço de tool calling. Não há fluxo fixo: a cada volta o modelo vê o pedido, as ferramentas e os
 * resultados até ali, e decide se chama mais ferramentas ou responde.
 */
export async function rodarLaco(entrada: EntradaLaco): Promise<ResultadoLaco> {
  const { modelo, executor, sinal, trilha } = entrada;
  const mensagens: MensagemLlm[] = [
    { role: 'system', content: entrada.prompt },
    { role: 'user', content: entrada.pedido },
  ];

  for (let volta = 1; volta <= MAXIMO_VOLTAS; volta++) {
    const resposta = await modelo.completar(mensagens, executor.ferramentas, sinal);
    registrarUso(trilha, resposta);

    if (resposta.chamadas.length === 0) {
      return { mensagem: resposta.conteudo?.trim() || SEM_RESPOSTA, concluiu: true };
    }

    mensagens.push({
      role: 'assistant',
      content: resposta.conteudo,
      tool_calls: resposta.chamadas,
    });
    const resultados = await Promise.all(
      resposta.chamadas.map((chamada) => executarChamada(executor, chamada)),
    );
    resposta.chamadas.forEach((chamada, i) => {
      const resultado = resultados[i];
      if (!resultado) return;
      trilha.chamadas.push(resultado.registro);
      mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: resultado.texto });
    });
  }

  return { mensagem: LIMITE_ATINGIDO, concluiu: false };
}
