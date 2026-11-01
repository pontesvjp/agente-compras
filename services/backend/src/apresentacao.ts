import type { Atendimento, MetricasAtendimento, RequisicaoGravada } from '@agente-compras/db';
import {
  type AtendimentoApi,
  centavosParaUsd,
  formatarUsd,
  type Metricas,
  type RequisicaoApi,
} from '@agente-compras/shared';

/** Converte o que está no banco (centavos, Date) para o contrato da API (dólar, ISO 8601). */

export function requisicaoParaApi(r: RequisicaoGravada): RequisicaoApi {
  return {
    id: r.id,
    numero: r.numero,
    status: r.status,
    solicitante: r.solicitante,
    justificativa: r.justificativa,
    itens: r.itens.map((item) => ({
      produto_id: item.produto_id,
      titulo: item.titulo,
      categoria: item.categoria,
      quantidade: item.quantidade,
      preco_unitario: centavosParaUsd(item.preco_unitario_centavos),
      subtotal: centavosParaUsd(item.subtotal_centavos),
    })),
    valor_total: centavosParaUsd(r.valor_total_centavos),
    moeda: r.moeda,
    alcada: { valor_usd: centavosParaUsd(r.alcada_centavos), origem: r.origem_alcada },
    atendimento_id: r.atendimento_id,
    criado_em: r.criado_em.toISOString(),
  };
}

/** Mensagem montada só com dados do banco, para quando o modelo não chegou a escrever a dele. */
export function mensagemDaRequisicao(r: RequisicaoGravada): string {
  const status = r.status === 'em_aprovacao' ? 'em aprovação' : r.status;
  return `Criei a requisição ${r.numero}: total de ${formatarUsd(r.valor_total_centavos)}, status ${status}.`;
}

export function atendimentoParaApi(
  a: Atendimento,
  requisicaoNumero: string | null,
): AtendimentoApi {
  return {
    id: a.id,
    pedido: a.pedido,
    solicitante: a.solicitante,
    resultado: a.resultado,
    mensagem: a.mensagem,
    modelo: a.modelo,
    tokens_entrada: a.tokens_entrada,
    tokens_saida: a.tokens_saida,
    custo_usd: a.custo_usd === null ? null : Number(a.custo_usd),
    duracao_ms: a.duracao_ms,
    erro_codigo: a.erro_codigo,
    ferramentas: a.chamadas,
    requisicao_numero: requisicaoNumero,
    criado_em: a.criado_em.toISOString(),
  };
}

const inteiroOuNulo = (valor: number | null) => (valor === null ? null : Math.round(valor));

export function metricasParaApi(m: MetricasAtendimento): Metricas {
  return {
    atendimentos: m.atendimentos,
    criadas: m.criadas,
    nao_atendidas: m.nao_atendidas,
    erros: m.erros,
    taxa_atendidas:
      m.atendimentos === 0 ? null : Math.round((m.criadas / m.atendimentos) * 1000) / 10,
    tempo_p50_ms: inteiroOuNulo(m.tempo_p50_ms),
    tempo_p95_ms: inteiroOuNulo(m.tempo_p95_ms),
    custo_medio_usd: m.custo_medio_usd,
    tokens_entrada_medio: inteiroOuNulo(m.tokens_entrada_medio),
  };
}
