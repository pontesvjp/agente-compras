import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import {
  type Atendimento,
  buscarAtendimento,
  concluirAtendimento,
  iniciarAtendimento,
  liberarChaveIdempotencia,
  type Pool,
  type RequisicaoGravada,
  type ResultadoAtendimento,
  requisicaoDoAtendimento,
} from '@agente-compras/db';
import { ErroAgente, ehCodigoErro, type RespostaPedido } from '@agente-compras/shared';
import type { FastifyBaseLogger } from 'fastify';
import { mensagemDaRequisicao, requisicaoParaApi } from '../apresentacao.js';
import type { ContextoSessao, SessaoMcp } from '../mcp/cliente.js';
import { novaTrilha, rodarLaco, type Trilha } from './laco.js';
import type { ModeloLlm } from './tipos.js';

export interface DependenciasAtendimento {
  pool: Pool;
  modelo: ModeloLlm;
  prompt: string;
  abrirMcp: (contexto: ContextoSessao) => Promise<SessaoMcp>;
  /** Tempo total do atendimento, somando todas as voltas do laço. */
  timeoutMs: number;
  /** Intervalo de consulta enquanto espera um atendimento com a mesma Idempotency-Key. */
  intervaloEsperaMs?: number;
}

export interface EntradaAtendimento {
  pedido: string;
  solicitante: string | null;
  idempotencyKey: string | null;
  requestId: string;
  logger: FastifyBaseLogger;
}

export interface Atendido {
  resposta: RespostaPedido;
  /** true quando a resposta veio de um atendimento anterior com a mesma Idempotency-Key. */
  repetido: boolean;
}

const CODIGOS_CATALOGO = new Set(['CATALOGO_INDISPONIVEL', 'CATALOGO_LENTO']);

function resposta(
  atendimentoId: string,
  requisicao: RequisicaoGravada | null,
  mensagem: string,
  trilha: Pick<Trilha, 'chamadas'>,
): RespostaPedido {
  return {
    resultado: requisicao ? 'criada' : 'nao_atendida',
    atendimento_id: atendimentoId,
    requisicao: requisicao ? requisicaoParaApi(requisicao) : null,
    mensagem,
    ferramentas: trilha.chamadas,
  };
}

/** O solicitante do formulário vai junto, para o modelo não dizer que ele não foi informado. */
function textoParaModelo(entrada: EntradaAtendimento): string {
  return entrada.solicitante === null
    ? entrada.pedido
    : `${entrada.pedido}\n\n(Solicitante informado no formulário: ${entrada.solicitante})`;
}

/** Espera o atendimento com a mesma chave terminar (duplo clique chega enquanto o primeiro roda). */
async function aguardarConclusao(
  deps: DependenciasAtendimento,
  atendimento: Atendimento,
): Promise<Atendimento> {
  const limite = atendimento.criado_em.getTime() + deps.timeoutMs + 5000;
  let atual = atendimento;
  while (atual.resultado === null && Date.now() < limite) {
    await esperar(deps.intervaloEsperaMs ?? 500);
    atual = (await buscarAtendimento(deps.pool, atual.id)) ?? atual;
  }
  return atual;
}

/**
 * Com Idempotency-Key já usada, devolve o mesmo resultado sem rodar o agente de novo.
 * Se o anterior terminou em erro (ou foi abandonado), solta a chave e o pedido roda outra vez.
 */
async function abrirOuReaproveitar(
  deps: DependenciasAtendimento,
  entrada: EntradaAtendimento,
  id: string,
): Promise<RespostaPedido | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const inicio = await iniciarAtendimento(deps.pool, {
      id,
      pedido: entrada.pedido,
      solicitante: entrada.solicitante,
      idempotency_key: entrada.idempotencyKey,
    });
    if (inicio.criado) return null;
    if (inicio.existente.pedido !== entrada.pedido) {
      throw new ErroAgente(
        'PEDIDO_INVALIDO',
        'Esta Idempotency-Key já foi usada com outro pedido. Gere uma chave nova para cada pedido.',
      );
    }
    const anterior = await aguardarConclusao(deps, inicio.existente);
    // A requisição gravada vale mesmo se o atendimento anterior caiu antes de concluir.
    const requisicao = await requisicaoDoAtendimento(deps.pool, anterior.id);
    if (requisicao) {
      const mensagem = anterior.mensagem ?? mensagemDaRequisicao(requisicao);
      return resposta(anterior.id, requisicao, mensagem, anterior);
    }
    if (anterior.resultado === 'nao_atendida') {
      return resposta(anterior.id, null, anterior.mensagem ?? '', anterior);
    }
    await liberarChaveIdempotencia(deps.pool, anterior.id);
  }
  throw new ErroAgente('PEDIDO_INVALIDO', 'Esta Idempotency-Key está presa em outro pedido.');
}

async function executar(
  deps: DependenciasAtendimento,
  entrada: EntradaAtendimento,
  id: string,
): Promise<RespostaPedido> {
  const inicio = performance.now();
  const trilha = novaTrilha();
  const sinal = AbortSignal.timeout(deps.timeoutMs);

  const concluir = (resultado: ResultadoAtendimento, mensagem: string, erroCodigo: string | null) =>
    concluirAtendimento(deps.pool, id, {
      resultado,
      mensagem,
      modelo: trilha.modelo,
      tokens_entrada: trilha.tokens_entrada,
      tokens_saida: trilha.tokens_saida,
      custo_usd: trilha.custo_micro_usd === null ? null : trilha.custo_micro_usd / 1e6,
      duracao_ms: Math.round(performance.now() - inicio),
      chamadas: trilha.chamadas,
      erro_codigo: erroCodigo,
    });
  const registrar = (resultado: ResultadoAtendimento, erroCodigo: string | null) =>
    entrada.logger.info(
      {
        atendimento_id: id,
        resultado,
        erro_codigo: erroCodigo,
        ferramentas: trilha.chamadas.map((c) => c.nome),
        modelo: trilha.modelo,
        tokens_entrada: trilha.tokens_entrada,
        duracao_ms: Math.round(performance.now() - inicio),
      },
      'atendimento concluído',
    );

  try {
    const sessao = await deps.abrirMcp({ requestId: entrada.requestId, atendimentoId: id, sinal });
    let mensagem: string;
    try {
      ({ mensagem } = await rodarLaco({
        pedido: textoParaModelo(entrada),
        prompt: deps.prompt,
        modelo: deps.modelo,
        executor: sessao,
        sinal,
        trilha,
      }));
    } finally {
      await sessao.fechar();
    }

    const requisicao = await requisicaoDoAtendimento(deps.pool, id);
    const ultimoErro = trilha.chamadas.at(-1)?.erro_codigo ?? null;
    if (!requisicao && ehCodigoErro(ultimoErro) && CODIGOS_CATALOGO.has(ultimoErro)) {
      throw new ErroAgente(
        ultimoErro,
        'O catálogo de produtos não respondeu. Tente de novo em instantes.',
      );
    }
    const final = resposta(id, requisicao, mensagem, trilha);
    await concluir(final.resultado, mensagem, null);
    registrar(final.resultado, null);
    return final;
  } catch (erro) {
    // Se a requisição já foi gravada, ela vale: responder erro levaria a pessoa a pedir de novo.
    const gravada = await requisicaoDoAtendimento(deps.pool, id).catch(() => null);
    if (gravada) {
      entrada.logger.warn({ atendimento_id: id, err: erro }, 'falha depois de gravar a requisição');
      const mensagem = mensagemDaRequisicao(gravada);
      await concluir('criada', mensagem, null);
      registrar('criada', null);
      return resposta(id, gravada, mensagem, trilha);
    }

    const final =
      sinal.aborted && !(erro instanceof ErroAgente && erro.codigo === 'LLM_CHAVE_INVALIDA')
        ? new ErroAgente(
            'LLM_INDISPONIVEL',
            `O atendimento passou de ${Math.round(deps.timeoutMs / 1000)} s. Tente de novo.`,
            { cause: erro },
          )
        : erro;
    const codigo = final instanceof ErroAgente ? final.codigo : 'ERRO_INTERNO';
    await concluir('erro', final instanceof Error ? final.message : String(final), codigo).catch(
      (falha: unknown) =>
        entrada.logger.error({ err: falha }, 'não consegui gravar o fim do atendimento'),
    );
    registrar('erro', codigo);
    throw final;
  }
}

/** Atendimento de ponta a ponta: trilha no banco, sessão MCP, laço do agente e resposta. */
export async function atenderPedido(
  deps: DependenciasAtendimento,
  entrada: EntradaAtendimento,
): Promise<Atendido> {
  const id = randomUUID();
  const anterior = await abrirOuReaproveitar(deps, entrada, id);
  if (anterior) return { resposta: anterior, repetido: true };
  return { resposta: await executar(deps, entrada, id), repetido: false };
}
