import type { RespostaPedido } from '@agente-compras/shared';
import { descreverPasso } from '../passos';
import { CartaoRequisicao } from './CartaoRequisicao';
import { FerramentasChamadas } from './FerramentasChamadas';
import { RotuloAgente } from './RotuloAgente';

interface Props {
  resposta: RespostaPedido;
  respondidoEm: Date;
  detalhes: boolean;
  verRequisicoes: () => void;
  fazerOutroPedido: () => void;
}

export function RespostaAgente({
  resposta,
  respondidoEm,
  detalhes,
  verRequisicoes,
  fazerOutroPedido,
}: Props) {
  // Barrou se o criar_requisicao recusou ou se a política consultada mostrou a categoria bloqueada.
  const foraDaPolitica = resposta.ferramentas.some((f) => descreverPasso(f).barrou);
  // Sem ferramenta chamada, foi conversa ("o que você faz?"), não um pedido que deixou de ser atendido.
  const tentouComprar = resposta.ferramentas.length > 0;
  return (
    <div className="turno-agente">
      <RotuloAgente quando={respondidoEm} />
      <FerramentasChamadas
        ferramentas={resposta.ferramentas}
        atendimentoId={resposta.atendimento_id}
        detalhes={detalhes}
      />
      <div className="balao-agente">
        {resposta.resultado === 'nao_atendida' && tentouComprar && (
          <span className="selo selo-negado">
            {foraDaPolitica ? 'Fora da política' : 'Não atendida'} · nada foi gravado
          </span>
        )}
        <span>{resposta.mensagem}</span>
      </div>
      {resposta.requisicao && (
        <CartaoRequisicao requisicao={resposta.requisicao} detalhes={detalhes} />
      )}
      <div className="chips chips-acoes">
        <button type="button" className="chip" onClick={verRequisicoes}>
          Ver requisições
        </button>
        <button type="button" className="chip" onClick={fazerOutroPedido}>
          Fazer outro pedido
        </button>
      </div>
    </div>
  );
}
