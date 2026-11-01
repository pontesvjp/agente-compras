import {
  type CriterioEscolha,
  centavosParaDecimal,
  decimalParaCentavos,
  ErroAgente,
  type PoliticaCompra,
  type RegraCategoria,
} from '@agente-compras/shared';
import { z } from 'zod';
import type { Executor } from './pool.js';

const linhaPolitica = z.object({
  criterio_escolha: z.enum(['menor_preco', 'melhor_avaliacao']),
  alcada_usd: z.string(),
  valor_maximo_requisicao_usd: z.string(),
});

const linhaRegra = z.object({
  categoria: z.string(),
  permitida: z.boolean(),
  teto_unitario_usd: z.string().nullable(),
  quantidade_maxima: z.number().int().nullable(),
  alcada_usd: z.string().nullable(),
  motivo: z.string().nullable(),
});

const centavosOuNulo = (valor: string | null) =>
  valor === null ? null : decimalParaCentavos(valor);

/** Lê a política que vale agora. Chamada a cada pedido: mudou na tabela, vale no pedido seguinte. */
export async function lerPolitica(db: Executor): Promise<PoliticaCompra> {
  const geral = await db.query(
    'select criterio_escolha, alcada_usd, valor_maximo_requisicao_usd from politica_compra where id = 1',
  );
  if (geral.rows.length === 0) {
    throw new Error('A política de compras não está cadastrada (tabela politica_compra vazia).');
  }
  const politica = linhaPolitica.parse(geral.rows[0]);

  const { rows } = await db.query(
    `select categoria, permitida, teto_unitario_usd, quantidade_maxima, alcada_usd, motivo
       from regras_categoria order by categoria`,
  );
  const regras = new Map<string, RegraCategoria>();
  for (const linha of rows) {
    const regra = linhaRegra.parse(linha);
    regras.set(regra.categoria, {
      categoria: regra.categoria,
      permitida: regra.permitida,
      teto_unitario_centavos: centavosOuNulo(regra.teto_unitario_usd),
      quantidade_maxima: regra.quantidade_maxima,
      alcada_centavos: centavosOuNulo(regra.alcada_usd),
      motivo: regra.motivo,
    });
  }

  return {
    criterio_escolha: politica.criterio_escolha,
    alcada_centavos: decimalParaCentavos(politica.alcada_usd),
    valor_maximo_requisicao_centavos: decimalParaCentavos(politica.valor_maximo_requisicao_usd),
    regras,
  };
}

export interface AlteracaoPolitica {
  criterio_escolha?: CriterioEscolha | undefined;
  alcada_centavos?: number | undefined;
  valor_maximo_requisicao_centavos?: number | undefined;
}

export interface AlteracaoRegraCategoria {
  permitida?: boolean | undefined;
  teto_unitario_centavos?: number | null | undefined;
  quantidade_maxima?: number | null | undefined;
  alcada_centavos?: number | null | undefined;
  motivo?: string | null | undefined;
}

type Valor = string | number | boolean | null;
const decimalOuNulo = (centavos: number | null) =>
  centavos === null ? null : centavosParaDecimal(centavos);

/** Só entram colunas desta lista fechada: nada que venha de fora vira nome de coluna. */
function colunasDaPolitica(alteracao: AlteracaoPolitica): [string, Valor][] {
  const colunas: [string, Valor | undefined][] = [
    ['criterio_escolha', alteracao.criterio_escolha],
    [
      'alcada_usd',
      alteracao.alcada_centavos === undefined
        ? undefined
        : centavosParaDecimal(alteracao.alcada_centavos),
    ],
    [
      'valor_maximo_requisicao_usd',
      alteracao.valor_maximo_requisicao_centavos === undefined
        ? undefined
        : centavosParaDecimal(alteracao.valor_maximo_requisicao_centavos),
    ],
  ];
  return colunas.filter((par): par is [string, Valor] => par[1] !== undefined);
}

function colunasDaRegra(alteracao: AlteracaoRegraCategoria): [string, Valor][] {
  const colunas: [string, Valor | undefined][] = [
    ['permitida', alteracao.permitida],
    [
      'teto_unitario_usd',
      alteracao.teto_unitario_centavos === undefined
        ? undefined
        : decimalOuNulo(alteracao.teto_unitario_centavos),
    ],
    ['quantidade_maxima', alteracao.quantidade_maxima],
    [
      'alcada_usd',
      alteracao.alcada_centavos === undefined
        ? undefined
        : decimalOuNulo(alteracao.alcada_centavos),
    ],
    ['motivo', alteracao.motivo],
  ];
  return colunas.filter((par): par is [string, Valor] => par[1] !== undefined);
}

const erroPostgres = z.object({ code: z.string(), message: z.string() });

/** Restrição da tabela violada (ex.: categoria bloqueada sem motivo) é erro de quem pediu. */
async function comRestricoesTraduzidas<T>(trabalho: () => Promise<T>): Promise<T> {
  try {
    return await trabalho();
  } catch (erro) {
    const pg = erroPostgres.safeParse(erro);
    if (pg.success && pg.data.code === '23514') {
      throw new ErroAgente(
        'PEDIDO_INVALIDO',
        'A alteração deixa a política inválida (ex.: categoria bloqueada precisa de motivo, e valores não podem ser negativos).',
        { cause: erro },
      );
    }
    throw erro;
  }
}

export async function alterarPolitica(db: Executor, alteracao: AlteracaoPolitica): Promise<void> {
  const colunas = colunasDaPolitica(alteracao);
  if (colunas.length === 0) return;
  const atribuicoes = colunas.map(([coluna], i) => `${coluna} = $${i + 1}`).join(', ');
  await comRestricoesTraduzidas(() =>
    db.query(
      `update politica_compra set ${atribuicoes} where id = 1`,
      colunas.map(([, valor]) => valor),
    ),
  );
}

/** Cria a regra da categoria ou altera só os campos informados. */
export async function salvarRegraCategoria(
  db: Executor,
  categoria: string,
  alteracao: AlteracaoRegraCategoria,
): Promise<void> {
  const colunas = colunasDaRegra(alteracao);
  const nomes = ['categoria', ...colunas.map(([coluna]) => coluna)];
  const valores = [categoria, ...colunas.map(([, valor]) => valor)];
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(', ');
  const aoConflito =
    colunas.length === 0
      ? 'do nothing'
      : `do update set ${colunas.map(([coluna]) => `${coluna} = excluded.${coluna}`).join(', ')}`;
  await comRestricoesTraduzidas(() =>
    db.query(
      `insert into regras_categoria (${nomes.join(', ')}) values (${marcadores})
       on conflict (categoria) ${aoConflito}`,
      valores,
    ),
  );
}
