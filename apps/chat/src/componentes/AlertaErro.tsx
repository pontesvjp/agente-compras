import type { ErroApi } from '../api';
import { Icone } from './Icone';

/** O título sai do código do erro, nunca do texto do modelo. */
const TITULOS: Record<string, string> = {
  CATALOGO_INDISPONIVEL: 'O catálogo de produtos não respondeu.',
  CATALOGO_LENTO: 'O catálogo de produtos não respondeu.',
  MCP_INDISPONIVEL: 'O serviço de catálogo está fora do ar.',
  LLM_CHAVE_INVALIDA: 'A chave do modelo de IA não está funcionando.',
  LLM_INDISPONIVEL: 'O modelo de IA não respondeu.',
  MUITOS_PEDIDOS: 'Muitos pedidos em sequência.',
  PEDIDO_INVALIDO: 'O pedido não pôde ser enviado.',
  BACKEND_FORA: 'O backend não respondeu.',
};

const RETENTAVEIS = new Set([
  'CATALOGO_INDISPONIVEL',
  'CATALOGO_LENTO',
  'MCP_INDISPONIVEL',
  'LLM_INDISPONIVEL',
  'MUITOS_PEDIDOS',
  'BACKEND_FORA',
  'ERRO_INTERNO',
]);

interface Props {
  erro: ErroApi;
  tentarDeNovo?: () => void;
  ocupado?: boolean;
}

export function AlertaErro({ erro, tentarDeNovo, ocupado = false }: Props) {
  return (
    <div role="alert" className="alerta">
      <span style={{ color: 'var(--ac-danger-icone)', marginTop: 2 }}>
        <Icone nome={erro.codigo === 'LLM_CHAVE_INVALIDA' ? 'cadeado' : 'alerta'} tamanho={20} />
      </span>
      <div className="alerta-texto">
        <strong>{TITULOS[erro.codigo] ?? 'Algo deu errado.'}</strong>
        <span>{erro.message}</span>
        <span className="secundario mono">
          {erro.codigo}
          {erro.status > 0 ? ` · HTTP ${erro.status}` : ''}
        </span>
      </div>
      {tentarDeNovo && RETENTAVEIS.has(erro.codigo) && (
        <button
          type="button"
          className="botao-secundario"
          onClick={tentarDeNovo}
          disabled={ocupado}
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}
