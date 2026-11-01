import { formatarUsd, paraCentavos, type RequisicaoApi } from '@agente-compras/shared';

/** Valor em dólar que veio da API (número) no formato da tela: 1099.99 -> "US$ 1.099,99". */
export const usd = (valor: number): string => formatarUsd(paraCentavos(valor));

export const decimal = (valor: number, casas: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const hora = (data: Date): string =>
  data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const dataHora = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const STATUS_REQUISICAO: Record<string, string> = {
  aprovada: 'Aprovado',
  em_aprovacao: 'Em aprovação',
  reprovada: 'Reprovado',
};

export function descreverItens(r: RequisicaoApi): string {
  const [primeiro, ...outros] = r.itens;
  if (!primeiro) return 'sem itens';
  const texto = `${primeiro.quantidade} × ${primeiro.titulo}`;
  return outros.length === 0 ? texto : `${texto} + ${outros.length} item(ns)`;
}

/** As 24 categorias da DummyJSON, como a compradora lê. Categoria nova aparece com o nome original. */
const CATEGORIAS: Record<string, string> = {
  beauty: 'Beleza',
  fragrances: 'Perfumes',
  furniture: 'Móveis',
  groceries: 'Mercearia',
  'home-decoration': 'Decoração',
  'kitchen-accessories': 'Utensílios de cozinha',
  laptops: 'Notebooks',
  'mens-shirts': 'Camisas masculinas',
  'mens-shoes': 'Calçados masculinos',
  'mens-watches': 'Relógios masculinos',
  'mobile-accessories': 'Acessórios de celular',
  motorcycle: 'Motos',
  'skin-care': 'Cuidados com a pele',
  smartphones: 'Celulares',
  'sports-accessories': 'Artigos esportivos',
  sunglasses: 'Óculos de sol',
  tablets: 'Tablets',
  tops: 'Blusas',
  vehicle: 'Veículos',
  'womens-bags': 'Bolsas femininas',
  'womens-dresses': 'Vestidos',
  'womens-jewellery': 'Joias femininas',
  'womens-shoes': 'Calçados femininos',
  'womens-watches': 'Relógios femininos',
};

export const nomeCategoria = (categoria: string): string => CATEGORIAS[categoria] ?? categoria;

/** "geral" ou "categoria furniture", como o servidor MCP grava em regras_aplicadas. */
export const nomeDaAlcada = (origem: string): string =>
  origem.startsWith('categoria ')
    ? `alçada da categoria ${nomeCategoria(origem.slice('categoria '.length))}`
    : 'alçada geral';

/** Leitura e escrita no navegador que nunca derrubam a tela (aba anônima, armazenamento bloqueado). */
export function lerPreferencia(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarPreferencia(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento, a preferência vale só nesta visita
  }
}
