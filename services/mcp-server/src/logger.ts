import { pino } from 'pino';

export type Logger = pino.Logger;

export function criarLogger(level: string): Logger {
  return pino({ name: 'mcp-server', level });
}
