export const CODIGOS_ERRO = [
  'CATALOGO_INDISPONIVEL',
  'CATALOGO_LENTO',
  'PRODUTO_NAO_ENCONTRADO',
  'REGRA_VIOLADA',
  'LLM_CHAVE_INVALIDA',
  'LLM_INDISPONIVEL',
  'MCP_INDISPONIVEL',
  'PEDIDO_INVALIDO',
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

export class ErroAgente extends Error {
  readonly codigo: CodigoErro;

  constructor(codigo: CodigoErro, mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = 'ErroAgente';
    this.codigo = codigo;
  }
}

export function ehCodigoErro(valor: unknown): valor is CodigoErro {
  return typeof valor === 'string' && (CODIGOS_ERRO as readonly string[]).includes(valor);
}
