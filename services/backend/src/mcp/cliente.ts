import { ErroAgente } from '@agente-compras/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ExecutorFerramentas, FerramentaLlm, ResultadoFerramenta } from '../agente/tipos.js';

export interface SessaoMcp extends ExecutorFerramentas {
  fechar(): Promise<void>;
}

export interface ContextoSessao {
  requestId: string;
  atendimentoId: string;
  sinal: AbortSignal;
}

const MCP_FORA = 'O serviço de catálogo está fora do ar.';

const conteudoSchema = z.array(
  z.union([
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.string() }),
  ]),
);
const erroFerramentaSchema = z.object({ codigo: z.string() });

function textoDoResultado(conteudo: unknown): string {
  const lido = conteudoSchema.safeParse(conteudo);
  if (!lido.success) return '';
  return lido.data.map((parte) => ('text' in parte ? parte.text : '')).join('\n');
}

function jsonOuNulo(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function codigoDoErro(estruturado: unknown): string {
  const lido = erroFerramentaSchema.safeParse(estruturado);
  return lido.success ? lido.data.codigo : 'ERRO_INTERNO';
}

/** O `$schema` do JSON Schema não interessa ao modelo e alguns provedores recusam. */
function paraFerramentaLlm(ferramenta: {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
}): FerramentaLlm {
  const { $schema: _, ...parametros } = ferramenta.inputSchema;
  return {
    type: 'function',
    function: {
      name: ferramenta.name,
      description: ferramenta.description ?? '',
      parameters: parametros,
    },
  };
}

/** Consulta o /health do servidor MCP, ao lado do /mcp. */
export async function mcpNoAr(url: string): Promise<boolean> {
  try {
    const resposta = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2000) });
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Abre uma sessão com o servidor MCP para um atendimento. O servidor é stateless, então cada
 * atendimento conecta, lista as ferramentas e fecha: não há conexão longa para cair e reconectar.
 * Os headers ligam a requisição gravada ao atendimento e o log do MCP ao do backend.
 */
export async function abrirSessaoMcp(url: string, contexto: ContextoSessao): Promise<SessaoMcp> {
  const cliente = new Client({ name: 'agente-compras-backend', version: '0.1.0' });
  const transporte = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { 'x-request-id': contexto.requestId, 'x-atendimento-id': contexto.atendimentoId },
    },
  });
  const opcoes = { signal: contexto.sinal };

  let ferramentas: FerramentaLlm[];
  try {
    await cliente.connect(transporte, opcoes);
    const { tools } = await cliente.listTools(undefined, opcoes);
    ferramentas = tools.map(paraFerramentaLlm);
  } catch (erro) {
    await cliente.close().catch(() => undefined);
    throw new ErroAgente('MCP_INDISPONIVEL', MCP_FORA, { cause: erro });
  }

  return {
    ferramentas,
    async chamar(nome, argumentos): Promise<ResultadoFerramenta> {
      try {
        const resultado = await cliente.callTool(
          { name: nome, arguments: argumentos },
          undefined,
          opcoes,
        );
        const texto = textoDoResultado(resultado.content);
        if (resultado.isError === true) {
          const estruturado = jsonOuNulo(texto);
          return { ok: false, texto, erro_codigo: codigoDoErro(estruturado), estruturado };
        }
        return {
          ok: true,
          texto,
          erro_codigo: null,
          estruturado: resultado.structuredContent ?? null,
        };
      } catch (erro) {
        if (erro instanceof McpError && erro.code === ErrorCode.InvalidParams) {
          const estruturado = { codigo: 'PEDIDO_INVALIDO', mensagem: erro.message };
          return {
            ok: false,
            texto: JSON.stringify(estruturado),
            erro_codigo: 'PEDIDO_INVALIDO',
            estruturado,
          };
        }
        throw new ErroAgente('MCP_INDISPONIVEL', MCP_FORA, { cause: erro });
      }
    },
    async fechar() {
      await cliente.close().catch(() => undefined);
    },
  };
}
