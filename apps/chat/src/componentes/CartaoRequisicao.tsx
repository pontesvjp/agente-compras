import type { RequisicaoApi } from '@agente-compras/shared';
import { nomeCategoria, nomeDaAlcada, STATUS_REQUISICAO, usd } from '../formato';

interface Props {
  requisicao: RequisicaoApi;
  /** Com "Detalhes técnicos" ligado, mostra de onde vêm os valores. */
  detalhes: boolean;
}

/** Montado só com os dados que o backend leu do banco, nunca com o texto do modelo. */
export function CartaoRequisicao({ requisicao: r, detalhes }: Props) {
  return (
    <article className="cartao" aria-label={`Requisição ${r.numero}`}>
      <div className="cartao-topo">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="rotulo-maiusculo">Requisição</span>
          <strong className="mono" style={{ fontSize: 16 }}>
            {r.numero}
          </strong>
        </div>
        <span className={`selo selo-${r.status}`}>{STATUS_REQUISICAO[r.status] ?? r.status}</span>
      </div>

      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th className="direita">Qtd.</th>
              <th className="direita">Preço unitário</th>
              <th className="direita">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {r.itens.map((item) => (
              <tr key={item.produto_id}>
                <td>
                  {item.titulo}
                  <div className="secundario">
                    {nomeCategoria(item.categoria)} · produto {item.produto_id}
                  </div>
                </td>
                <td className="direita">{item.quantidade}</td>
                <td className="direita">{usd(item.preco_unitario)}</td>
                <td className="direita">{usd(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cartao-total">
        <span style={{ fontWeight: 500 }}>Total</span>
        <strong style={{ fontSize: 16 }}>{usd(r.valor_total)}</strong>
      </div>

      {r.status === 'em_aprovacao' && (
        <div className="cartao-aviso">
          Foi para aprovação porque o total passa a {nomeDaAlcada(r.alcada.origem)} de{' '}
          {usd(r.alcada.valor_usd)}.
        </div>
      )}

      <dl className="cartao-dados">
        {r.solicitante && (
          <>
            <dt>Solicitante</dt>
            <dd>{r.solicitante}</dd>
          </>
        )}
        <dt>Justificativa</dt>
        <dd>{r.justificativa}</dd>
        <dt>Alçada</dt>
        <dd>
          {usd(r.alcada.valor_usd)} ({nomeDaAlcada(r.alcada.origem)})
        </dd>
        {detalhes && (
          <>
            <dt>Origem dos valores</dt>
            <dd>Banco de dados, não o texto do modelo</dd>
          </>
        )}
      </dl>
    </article>
  );
}
