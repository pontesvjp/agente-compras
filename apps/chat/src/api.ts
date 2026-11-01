import {
  type AtendimentoApi,
  atendimentoApiSchema,
  type ListaRequisicoes,
  listaRequisicoesSchema,
  type Metricas,
  metricasSchema,
  type RespostaPedido,
  respostaErroSchema,
  respostaPedidoSchema,
} from '@agente-compras/shared';

/** O nginx (e o Vite, em desenvolvimento) repassa /api ao backend. */
const BASE = '/api';

export class ErroApi extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    /** 0 quando a resposta nem chegou. */
    readonly status: number,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

interface Esquema<T> {
  safeParse(dado: unknown): { success: true; data: T } | { success: false };
}

/** Toda resposta do backend passa pelo schema do contrato antes de chegar à tela. */
async function chamar<T>(
  caminho: string,
  esquema: Esquema<T>,
  opcoes: { metodo?: string; corpo?: unknown; cabecalhos?: Record<string, string> } = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(opcoes.corpo === undefined ? {} : { 'content-type': 'application/json' }),
        ...opcoes.cabecalhos,
      },
      ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
    });
  } catch {
    throw new ErroApi(
      'BACKEND_FORA',
      'O backend não respondeu. Confira se o ambiente está no ar (docker compose up).',
      0,
    );
  }

  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = respostaErroSchema.safeParse(corpo);
    if (erro.success) throw new ErroApi(erro.data.codigo, erro.data.mensagem, resposta.status);
    throw new ErroApi(
      'BACKEND_FORA',
      `O backend respondeu ${resposta.status} sem explicar o erro. Ele pode estar subindo ainda.`,
      resposta.status,
    );
  }
  const lido = esquema.safeParse(corpo);
  if (!lido.success) {
    throw new ErroApi(
      'RESPOSTA_INVALIDA',
      'A resposta do backend veio num formato inesperado.',
      resposta.status,
    );
  }
  return lido.data;
}

export const api = {
  pedir: (pedido: string, solicitante: string, idempotencyKey: string): Promise<RespostaPedido> =>
    chamar('/requisicoes', respostaPedidoSchema, {
      metodo: 'POST',
      corpo: { pedido, ...(solicitante.trim() === '' ? {} : { solicitante: solicitante.trim() }) },
      cabecalhos: { 'idempotency-key': idempotencyKey },
    }),
  listar: (limite: number, cursor: number | null): Promise<ListaRequisicoes> =>
    chamar(
      `/requisicoes?limite=${limite}${cursor === null ? '' : `&cursor=${cursor}`}`,
      listaRequisicoesSchema,
    ),
  atendimento: (id: string): Promise<AtendimentoApi> =>
    chamar(`/atendimentos/${encodeURIComponent(id)}`, atendimentoApiSchema),
  metricas: (): Promise<Metricas> => chamar('/metricas', metricasSchema),
};
