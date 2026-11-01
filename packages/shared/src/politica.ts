import { formatarUsd } from './dinheiro.js';

export type CriterioEscolha = 'menor_preco' | 'melhor_avaliacao';
export type StatusRequisicao = 'aprovada' | 'em_aprovacao' | 'reprovada';

export interface RegraCategoria {
  categoria: string;
  permitida: boolean;
  teto_unitario_centavos: number | null;
  quantidade_maxima: number | null;
  alcada_centavos: number | null;
  motivo: string | null;
}

export interface PoliticaCompra {
  criterio_escolha: CriterioEscolha;
  alcada_centavos: number;
  valor_maximo_requisicao_centavos: number;
  regras: ReadonlyMap<string, RegraCategoria>;
}

/** Item como chega para avaliação: preço, estoque e mínimo já lidos da fonte, nunca do modelo. */
export interface ItemParaAvaliar {
  produto_id: number;
  titulo: string;
  categoria: string;
  preco_centavos: number;
  estoque: number;
  pedido_minimo: number;
  quantidade: number;
  /** Teto que a pessoa pediu ("até US$ 2.000 cada"), se houver. */
  teto_pedido_centavos: number | null;
}

export type RegraViolada =
  | 'categoria_bloqueada'
  | 'acima_do_teto_do_pedido'
  | 'acima_do_teto_da_categoria'
  | 'acima_da_quantidade_maxima'
  | 'abaixo_do_pedido_minimo'
  | 'estoque_insuficiente'
  | 'acima_do_valor_maximo';

export interface Violacao {
  regra: RegraViolada;
  produto_id: number | null;
  mensagem: string;
}

export interface ItemAvaliado extends ItemParaAvaliar {
  subtotal_centavos: number;
}

export interface RegrasAplicadas {
  criterio_escolha: CriterioEscolha;
  alcada_centavos: number;
  origem_alcada: string;
  valor_maximo_requisicao_centavos: number;
  regras_categoria: RegraCategoria[];
}

export type Avaliacao =
  | {
      aprovavel: true;
      status: Exclude<StatusRequisicao, 'reprovada'>;
      itens: ItemAvaliado[];
      valor_total_centavos: number;
      regras_aplicadas: RegrasAplicadas;
    }
  | { aprovavel: false; violacoes: Violacao[] };

function violacoesDoItem(item: ItemParaAvaliar, regra: RegraCategoria | undefined): Violacao[] {
  const v: Violacao[] = [];
  const nome = `${item.titulo} (id ${item.produto_id})`;
  if (regra && !regra.permitida) {
    v.push({
      regra: 'categoria_bloqueada',
      produto_id: item.produto_id,
      mensagem: `A categoria ${item.categoria} está bloqueada na política de compras: ${regra.motivo ?? 'sem motivo cadastrado'}.`,
    });
    return v;
  }
  if (item.teto_pedido_centavos !== null && item.preco_centavos > item.teto_pedido_centavos) {
    v.push({
      regra: 'acima_do_teto_do_pedido',
      produto_id: item.produto_id,
      mensagem: `${nome} custa ${formatarUsd(item.preco_centavos)}, acima do limite pedido de ${formatarUsd(item.teto_pedido_centavos)}.`,
    });
  }
  if (regra?.teto_unitario_centavos != null && item.preco_centavos > regra.teto_unitario_centavos) {
    v.push({
      regra: 'acima_do_teto_da_categoria',
      produto_id: item.produto_id,
      mensagem: `${nome} custa ${formatarUsd(item.preco_centavos)}, acima do teto de ${formatarUsd(regra.teto_unitario_centavos)} por unidade da categoria ${item.categoria}.`,
    });
  }
  if (regra?.quantidade_maxima != null && item.quantidade > regra.quantidade_maxima) {
    v.push({
      regra: 'acima_da_quantidade_maxima',
      produto_id: item.produto_id,
      mensagem: `A política permite até ${regra.quantidade_maxima} unidades de ${item.categoria} por requisição; foram pedidas ${item.quantidade}.`,
    });
  }
  if (item.quantidade < item.pedido_minimo) {
    v.push({
      regra: 'abaixo_do_pedido_minimo',
      produto_id: item.produto_id,
      mensagem: `${nome} exige pedido mínimo de ${item.pedido_minimo} unidades; foram pedidas ${item.quantidade}.`,
    });
  }
  if (item.quantidade > item.estoque) {
    v.push({
      regra: 'estoque_insuficiente',
      produto_id: item.produto_id,
      mensagem: `${nome} tem ${item.estoque} unidades em estoque; foram pedidas ${item.quantidade}.`,
    });
  }
  return v;
}

/** Alçada que vale para a requisição: a da categoria quando existe, senão a geral; com várias, a menor. */
function alcadaEfetiva(
  itens: ItemParaAvaliar[],
  politica: PoliticaCompra,
): { alcada_centavos: number; origem_alcada: string } {
  let melhor = { alcada_centavos: Number.POSITIVE_INFINITY, origem_alcada: 'geral' };
  for (const item of itens) {
    const daCategoria = politica.regras.get(item.categoria)?.alcada_centavos ?? null;
    const candidata =
      daCategoria === null
        ? { alcada_centavos: politica.alcada_centavos, origem_alcada: 'geral' }
        : { alcada_centavos: daCategoria, origem_alcada: `categoria ${item.categoria}` };
    if (candidata.alcada_centavos < melhor.alcada_centavos) melhor = candidata;
  }
  return melhor;
}

export function avaliarRequisicao(itens: ItemParaAvaliar[], politica: PoliticaCompra): Avaliacao {
  const violacoes = itens.flatMap((item) =>
    violacoesDoItem(item, politica.regras.get(item.categoria)),
  );
  const avaliados = itens.map((item) => ({
    ...item,
    subtotal_centavos: item.preco_centavos * item.quantidade,
  }));
  const valorTotal = avaliados.reduce((soma, item) => soma + item.subtotal_centavos, 0);
  if (valorTotal > politica.valor_maximo_requisicao_centavos) {
    violacoes.push({
      regra: 'acima_do_valor_maximo',
      produto_id: null,
      mensagem: `O total de ${formatarUsd(valorTotal)} passa o valor máximo de ${formatarUsd(politica.valor_maximo_requisicao_centavos)} por requisição.`,
    });
  }
  if (violacoes.length > 0) return { aprovavel: false, violacoes };

  const { alcada_centavos, origem_alcada } = alcadaEfetiva(itens, politica);
  const categorias = new Set(itens.map((item) => item.categoria));
  return {
    aprovavel: true,
    status: valorTotal > alcada_centavos ? 'em_aprovacao' : 'aprovada',
    itens: avaliados,
    valor_total_centavos: valorTotal,
    regras_aplicadas: {
      criterio_escolha: politica.criterio_escolha,
      alcada_centavos,
      origem_alcada,
      valor_maximo_requisicao_centavos: politica.valor_maximo_requisicao_centavos,
      regras_categoria: [...politica.regras.values()].filter((r) => categorias.has(r.categoria)),
    },
  };
}
