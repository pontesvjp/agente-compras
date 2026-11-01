import type { ProdutoDetalhado, ProdutoResumido } from '@agente-compras/shared';
import type { ProdutoDummy, ProdutoDummyDetalhado } from './esquemas.js';

export function paraProdutoResumido(produto: ProdutoDummy): ProdutoResumido {
  return {
    id: produto.id,
    titulo: produto.title,
    preco_usd: produto.price,
    estoque: produto.stock,
    pedido_minimo: produto.minimumOrderQuantity,
    disponibilidade: produto.availabilityStatus,
    categoria: produto.category,
    marca: produto.brand ?? null,
    avaliacao: produto.rating,
  };
}

export function paraProdutoDetalhado(produto: ProdutoDummyDetalhado): ProdutoDetalhado {
  return {
    ...paraProdutoResumido(produto),
    descricao: produto.description,
    garantia: produto.warrantyInformation ?? null,
    prazo_envio: produto.shippingInformation ?? null,
    politica_devolucao: produto.returnPolicy ?? null,
  };
}
