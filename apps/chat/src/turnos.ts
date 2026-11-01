import type { RespostaPedido } from '@agente-compras/shared';
import type { ErroApi } from './api';

/** Um pedido da sessão e o que o agente respondeu. A chave de idempotência acompanha o retry. */
interface BaseTurno {
  id: string;
  pedido: string;
  idempotencyKey: string;
  enviadoEm: Date;
}

export type Turno =
  | (BaseTurno & { estado: 'carregando' })
  | (BaseTurno & { estado: 'pronto'; resposta: RespostaPedido; respondidoEm: Date })
  | (BaseTurno & { estado: 'erro'; erro: ErroApi; respondidoEm: Date });

/** `crypto.randomUUID` só existe em contexto seguro; aberto por IP da rede, cai no getRandomValues. */
export function novoId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
