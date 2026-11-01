import { createHash, timingSafeEqual } from 'node:crypto';
import { ErroAgente } from '@agente-compras/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

/** Token mais curto que isso se adivinha: tem de ser gerado, não inventado. */
export const TAMANHO_MINIMO_TOKEN = 16;

const bearerSchema = z
  .string()
  .regex(/^Bearer\s+\S+$/i)
  .transform((valor) => valor.replace(/^Bearer\s+/i, ''));

const resumo = (texto: string) => createHash('sha256').update(texto).digest();

/**
 * Guarda das rotas que mudam a política. Sem POLITICA_TOKEN no ambiente, ninguém altera pela API:
 * o padrão é fechado. Compara os hashes em tempo constante, para o tempo de resposta não vazar o
 * token, e roda antes de ler o corpo.
 */
export function exigirTokenPolitica(tokenEsperado: string) {
  return async (request: FastifyRequest): Promise<void> => {
    if (tokenEsperado.length < TAMANHO_MINIMO_TOKEN) {
      throw new ErroAgente(
        'SEM_PERMISSAO',
        tokenEsperado === ''
          ? 'A política só muda pela API com POLITICA_TOKEN definido no .env (veja docs/politica.md).'
          : `POLITICA_TOKEN tem menos de ${TAMANHO_MINIMO_TOKEN} caracteres: gere um maior (veja docs/politica.md).`,
      );
    }
    const lido = bearerSchema.safeParse(request.headers.authorization);
    if (!lido.success || !timingSafeEqual(resumo(lido.data), resumo(tokenEsperado))) {
      throw new ErroAgente(
        'SEM_PERMISSAO',
        'Alterar a política exige o cabeçalho Authorization: Bearer <POLITICA_TOKEN>.',
      );
    }
  };
}
