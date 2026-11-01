import type { ChamadaFerramenta } from '@agente-compras/shared';
import { z } from 'zod';
import { nomeCategoria, usd } from './formato';

/**
 * Mapa ferramenta → frase de quem compra. Os números saem do resultado que a ferramenta devolveu
 * (gravado na trilha), nunca do texto do modelo.
 */

export type IconePasso = 'busca' | 'detalhe' | 'politica' | 'gravado' | 'barrado' | 'falha';

export interface Passo {
  icone: IconePasso;
  texto: string;
  falhou: boolean;
  /** A política de compras impediu a compra (categoria bloqueada ou REGRA_VIOLADA). */
  barrou: boolean;
}

const buscaSchema = z.object({
  termo: z.string(),
  total: z.number(),
  produtos: z.array(z.object({ id: z.number(), preco_usd: z.number() })),
});
const detalheSchema = z.object({ titulo: z.string() });
const politicaSchema = z.object({
  categorias: z.array(
    z.object({
      categoria: z.string(),
      permitida: z.boolean(),
      teto_unitario_usd: z.number().nullable(),
      alcada_usd: z.number().nullable(),
    }),
  ),
});
const criadaSchema = z.object({
  numero: z.string(),
  status: z.string(),
  valor_total_texto: z.string(),
});
const erroSchema = z.object({ codigo: z.string(), mensagem: z.string() });
const argumentoCategoria = z.object({ categoria: z.string() });

function passoDeErro(chamada: ChamadaFerramenta): Passo {
  const codigo = chamada.erro_codigo ?? '';
  if (codigo === 'REGRA_VIOLADA') {
    return {
      icone: 'barrado',
      texto: 'A política de compras barrou a requisição',
      falhou: true,
      barrou: true,
    };
  }
  if (codigo === 'CATALOGO_INDISPONIVEL' || codigo === 'CATALOGO_LENTO') {
    return { icone: 'falha', texto: 'O catálogo não respondeu', falhou: true, barrou: false };
  }
  if (codigo === 'PRODUTO_NAO_ENCONTRADO') {
    return {
      icone: 'falha',
      texto: 'Produto não encontrado no catálogo',
      falhou: true,
      barrou: false,
    };
  }
  return {
    icone: 'falha',
    texto: `Uma consulta falhou (${chamada.nome})`,
    falhou: true,
    barrou: false,
  };
}

function faixaDePreco(precos: number[]): string {
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  return menor === maior ? usd(menor) : `de ${usd(menor)} a ${usd(maior)}`;
}

function passoDaBusca(resultado: unknown): Passo {
  const busca = buscaSchema.safeParse(resultado);
  if (!busca.success)
    return { icone: 'busca', texto: 'Consultei o catálogo', falhou: false, barrou: false };
  const { termo, total, produtos } = busca.data;
  if (total === 0) {
    return {
      icone: 'busca',
      texto: `Consultei o catálogo: nada para "${termo}"`,
      falhou: false,
      barrou: false,
    };
  }
  const quantos = total === 1 ? '1 resultado' : `${total} resultados`;
  return {
    icone: 'busca',
    texto: `Consultei o catálogo: ${quantos} para "${termo}", ${faixaDePreco(produtos.map((p) => p.preco_usd))}`,
    falhou: false,
    barrou: false,
  };
}

function passoDaPolitica(argumentos: unknown, resultado: unknown): Passo {
  const base = 'Conferi a política de compras';
  const pedida = argumentoCategoria.safeParse(argumentos);
  const politica = politicaSchema.safeParse(resultado);
  if (!pedida.success || !politica.success)
    return { icone: 'politica', texto: base, falhou: false, barrou: false };

  const chave = pedida.data.categoria.trim().toLowerCase();
  const { categorias } = politica.data;
  // A ferramenta já filtra pela categoria pedida (aceitando plural): a regra que voltou é a que vale.
  const regra =
    categorias.find((r) => r.categoria === chave) ??
    (categorias.length === 1 ? categorias[0] : undefined);
  const nome = nomeCategoria(regra?.categoria ?? chave);
  let detalhe = `${nome} sem regra própria`;
  if (regra && !regra.permitida) detalhe = `a categoria ${nome} está bloqueada`;
  else if (regra?.teto_unitario_usd != null)
    detalhe = `teto de ${usd(regra.teto_unitario_usd)} por unidade em ${nome}`;
  else if (regra?.alcada_usd != null) detalhe = `alçada de ${usd(regra.alcada_usd)} em ${nome}`;
  const bloqueada = regra !== undefined && !regra.permitida;
  return { icone: 'politica', texto: `${base}: ${detalhe}`, falhou: false, barrou: bloqueada };
}

export function descreverPasso(chamada: ChamadaFerramenta): Passo {
  if (!chamada.ok) return passoDeErro(chamada);
  switch (chamada.nome) {
    case 'buscar_produtos':
      return passoDaBusca(chamada.resultado);
    case 'detalhar_produto': {
      const produto = detalheSchema.safeParse(chamada.resultado);
      return {
        icone: 'detalhe',
        texto: produto.success
          ? `Conferi os detalhes de ${produto.data.titulo}`
          : 'Conferi os detalhes de um produto',
        falhou: false,
        barrou: false,
      };
    }
    case 'consultar_politica':
      return passoDaPolitica(chamada.argumentos, chamada.resultado);
    case 'criar_requisicao': {
      const criada = criadaSchema.safeParse(chamada.resultado);
      return {
        icone: 'gravado',
        texto: criada.success ? `Gravei a requisição ${criada.data.numero}` : 'Gravei a requisição',
        falhou: false,
        barrou: false,
      };
    }
    default:
      return {
        icone: 'detalhe',
        texto: `Usei a ferramenta ${chamada.nome}`,
        falhou: false,
        barrou: false,
      };
  }
}

/** Uma linha para o painel técnico: o essencial do que a ferramenta devolveu. */
export function resumoTecnico(chamada: ChamadaFerramenta): string {
  const erro = erroSchema.safeParse(chamada.resultado);
  if (!chamada.ok)
    return erro.success
      ? `${erro.data.codigo}: ${erro.data.mensagem}`
      : (chamada.erro_codigo ?? 'erro');

  const busca = buscaSchema.safeParse(chamada.resultado);
  if (chamada.nome === 'buscar_produtos' && busca.success) {
    const { total, produtos } = busca.data;
    if (total === 0) return '0 produtos';
    return `${total} produtos: ids ${produtos.map((p) => p.id).join(', ')} · ${faixaDePreco(produtos.map((p) => p.preco_usd))}`;
  }
  const criada = criadaSchema.safeParse(chamada.resultado);
  if (chamada.nome === 'criar_requisicao' && criada.success) {
    return `${criada.data.numero} · ${criada.data.status} · total ${criada.data.valor_total_texto}`;
  }
  return descreverPasso(chamada).texto;
}
