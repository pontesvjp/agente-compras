import {
  emTransacao,
  inserirRequisicao,
  lerPolitica,
  type Pool,
  solicitanteDoAtendimento,
} from '@agente-compras/db';
import {
  avaliarRequisicao,
  centavosParaUsd,
  ErroAgente,
  formatarUsd,
  type ItemParaAvaliar,
  paraCentavos,
} from '@agente-compras/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ClienteDummyJson } from '../dummyjson/cliente.js';
import type { Logger } from '../logger.js';
import { resultadoErro, resultadoOk } from './resultado.js';

export const entradaCriarRequisicao = {
  itens: z
    .array(
      z.object({
        produto_id: z.number().int().positive().describe('Id vindo de buscar_produtos.'),
        quantidade: z.number().int().min(1).max(10_000),
        preco_maximo_unitario_usd: z
          .number()
          .positive()
          .optional()
          .describe(
            'O limite por unidade que a pessoa pediu, se pediu ("até US$ 2.000 cada" -> 2000).',
          ),
      }),
    )
    .min(1)
    .max(10),
  justificativa: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .describe('Para que é a compra, com as palavras da pessoa.'),
  solicitante: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Quem pediu (pessoa ou time), se a pessoa disse. Se o chat informou o solicitante, vale o do chat.',
    ),
};

export const saidaCriarRequisicao = {
  numero: z.string(),
  solicitante: z.string().nullable(),
  status: z.enum(['aprovada', 'em_aprovacao']),
  motivo_status: z.string(),
  itens: z.array(
    z.object({
      produto_id: z.number().int(),
      titulo: z.string(),
      categoria: z.string(),
      quantidade: z.number().int(),
      preco_unitario_usd: z.number(),
      subtotal_usd: z.number(),
    }),
  ),
  valor_total_usd: z.number(),
  valor_total_texto: z.string(),
  moeda: z.literal('USD'),
};

const DESCRICAO = [
  'Grava a requisição de compra no banco e devolve o número, o status, os itens e o total.',
  'Não recebe preço: lê preço, estoque e pedido mínimo na fonte e aplica a política de compras (categoria bloqueada, teto por unidade, quantidade máxima, valor máximo e alçada).',
  'Quando chamar: depois de buscar_produtos, com os ids que atendem ao pedido.',
  'Quando não chamar: se nenhum produto atende; nesse caso não grave e diga o que faltou.',
  'Se a política barrar, volta o erro REGRA_VIOLADA com as regras violadas: não tente contornar, explique à pessoa.',
  'Total acima da alçada é gravado com status em_aprovacao.',
].join(' ');

type Entrada = {
  itens: {
    produto_id: number;
    quantidade: number;
    preco_maximo_unitario_usd?: number | undefined;
  }[];
  justificativa: string;
  solicitante?: string | undefined;
};

export interface DependenciasCriarRequisicao {
  cliente: ClienteDummyJson;
  pool: Pool;
  logger: Logger;
  atendimentoId: string | null;
}

async function lerItensNaFonte(
  cliente: ClienteDummyJson,
  itens: Entrada['itens'],
): Promise<ItemParaAvaliar[]> {
  const ids = itens.map((item) => item.produto_id);
  if (new Set(ids).size !== ids.length) {
    throw new ErroAgente(
      'PEDIDO_INVALIDO',
      'O mesmo produto apareceu mais de uma vez: some as quantidades num item só.',
    );
  }
  return Promise.all(
    itens.map(async (pedido) => {
      const produto = await cliente.detalhar(pedido.produto_id).catch((erro: unknown) => {
        if (erro instanceof ErroAgente && erro.codigo === 'PRODUTO_NAO_ENCONTRADO') {
          throw new ErroAgente(
            'PRODUTO_NAO_ENCONTRADO',
            `O produto ${pedido.produto_id} não existe no catálogo. Use um id vindo de buscar_produtos.`,
          );
        }
        throw erro;
      });
      return {
        produto_id: produto.id,
        titulo: produto.title,
        categoria: produto.category,
        preco_centavos: paraCentavos(produto.price),
        estoque: produto.stock,
        pedido_minimo: produto.minimumOrderQuantity,
        quantidade: pedido.quantidade,
        teto_pedido_centavos:
          pedido.preco_maximo_unitario_usd === undefined
            ? null
            : paraCentavos(pedido.preco_maximo_unitario_usd),
      };
    }),
  );
}

export async function executarCriarRequisicao(
  deps: DependenciasCriarRequisicao,
  args: Entrada,
): Promise<CallToolResult> {
  const inicio = performance.now();
  try {
    const itens = await lerItensNaFonte(deps.cliente, args.itens);

    const { avaliacao, criada } = await emTransacao(deps.pool, async (tx) => {
      const avaliacao = avaliarRequisicao(itens, await lerPolitica(tx));
      if (!avaliacao.aprovavel) {
        throw new ErroAgente(
          'REGRA_VIOLADA',
          `A requisição não foi gravada. ${avaliacao.violacoes.map((v) => v.mensagem).join(' ')}`,
          { detalhes: { violacoes: avaliacao.violacoes } },
        );
      }
      // O solicitante do formulário vence o que o modelo mandar: quem pediu não é decisão do modelo.
      const doChat = deps.atendimentoId
        ? await solicitanteDoAtendimento(tx, deps.atendimentoId)
        : null;
      const solicitante = doChat ?? args.solicitante ?? null;
      const criada = await inserirRequisicao(tx, {
        solicitante,
        justificativa: args.justificativa,
        status: avaliacao.status,
        valor_total_centavos: avaliacao.valor_total_centavos,
        regras_aplicadas: avaliacao.regras_aplicadas,
        atendimento_id: deps.atendimentoId,
        itens: avaliacao.itens,
      });
      return { avaliacao, criada: { ...criada, solicitante } };
    });

    const alcada = `${formatarUsd(avaliacao.regras_aplicadas.alcada_centavos)} (${avaliacao.regras_aplicadas.origem_alcada})`;
    deps.logger.info(
      {
        ferramenta: 'criar_requisicao',
        numero: criada.numero,
        status: avaliacao.status,
        duracao_ms: Math.round(performance.now() - inicio),
      },
      'ferramenta executada',
    );
    return resultadoOk({
      numero: criada.numero,
      solicitante: criada.solicitante,
      status: avaliacao.status,
      motivo_status:
        avaliacao.status === 'em_aprovacao'
          ? `O total passa a alçada de ${alcada}: a requisição precisa de aprovação.`
          : `O total está dentro da alçada de ${alcada}.`,
      itens: avaliacao.itens.map((item) => ({
        produto_id: item.produto_id,
        titulo: item.titulo,
        categoria: item.categoria,
        quantidade: item.quantidade,
        preco_unitario_usd: centavosParaUsd(item.preco_centavos),
        subtotal_usd: centavosParaUsd(item.subtotal_centavos),
      })),
      valor_total_usd: centavosParaUsd(avaliacao.valor_total_centavos),
      valor_total_texto: formatarUsd(avaliacao.valor_total_centavos),
      moeda: 'USD' as const,
    });
  } catch (erro) {
    deps.logger.warn({ ferramenta: 'criar_requisicao', err: erro }, 'ferramenta não gravou');
    return resultadoErro(erro, deps.logger);
  }
}

export function registrarCriarRequisicao(
  servidor: McpServer,
  deps: DependenciasCriarRequisicao,
): void {
  servidor.registerTool(
    'criar_requisicao',
    {
      title: 'Criar requisição de compra',
      description: DESCRICAO,
      inputSchema: entradaCriarRequisicao,
      outputSchema: saidaCriarRequisicao,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) => executarCriarRequisicao(deps, args),
  );
}
