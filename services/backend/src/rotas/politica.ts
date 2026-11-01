import { alterarPolitica, lerPolitica, type Pool, salvarRegraCategoria } from '@agente-compras/db';
import {
  alteracaoPoliticaSchema,
  alteracaoRegraCategoriaSchema,
  type PoliticaApi,
  paraCentavos,
  politicaEmUsd,
} from '@agente-compras/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exigirTokenPolitica } from '../autorizacao.js';

const categoriaSchema = z.object({
  categoria: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/, 'use o nome da categoria como a DummyJSON escreve (ex.: laptops)'),
});

const centavos = (usd: number | undefined) => (usd === undefined ? undefined : paraCentavos(usd));
const centavosOuNulo = (usd: number | null | undefined) =>
  usd === null || usd === undefined ? usd : paraCentavos(usd);

/**
 * A política é regra de negócio do cliente: muda aqui, vale no pedido seguinte, sem deploy.
 * Ler é aberto (o agente e o chat leem); mudar exige o token de quem administra a política.
 */
export function rotasPolitica(deps: { pool: Pool; tokenPolitica: string }): FastifyPluginAsync {
  const politicaAtual = async (): Promise<PoliticaApi> =>
    politicaEmUsd(await lerPolitica(deps.pool));
  const protegida = { onRequest: exigirTokenPolitica(deps.tokenPolitica) };

  return async (app) => {
    app.get('/', politicaAtual);

    app.put('/', protegida, async (request) => {
      const alteracao = alteracaoPoliticaSchema.parse(request.body);
      await alterarPolitica(deps.pool, {
        criterio_escolha: alteracao.criterio_escolha,
        alcada_centavos: centavos(alteracao.alcada_usd),
        valor_maximo_requisicao_centavos: centavos(alteracao.valor_maximo_requisicao_usd),
      });
      request.log.info({ alteracao }, 'política alterada');
      return politicaAtual();
    });

    app.put('/categorias/:categoria', protegida, async (request) => {
      const { categoria } = categoriaSchema.parse(request.params);
      const alteracao = alteracaoRegraCategoriaSchema.parse(request.body);
      await salvarRegraCategoria(deps.pool, categoria, {
        permitida: alteracao.permitida,
        teto_unitario_centavos: centavosOuNulo(alteracao.teto_unitario_usd),
        quantidade_maxima: alteracao.quantidade_maxima,
        alcada_centavos: centavosOuNulo(alteracao.alcada_usd),
        motivo: alteracao.motivo,
      });
      request.log.info({ categoria, alteracao }, 'regra de categoria alterada');
      return politicaAtual();
    });
  };
}
