import type { RequisicaoApi } from '@agente-compras/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from '../api';
import { dataHora, descreverItens, nomeDaAlcada, STATUS_REQUISICAO, usd } from '../formato';
import { AlertaErro } from './AlertaErro';

type Filtro = 'todas' | 'aprovada' | 'em_aprovacao';

const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'aprovada', nome: 'Aprovadas' },
  { id: 'em_aprovacao', nome: 'Em aprovação' },
];

const TAMANHO_PAGINA = 20;

export function ListaRequisicoes({ irParaConversa }: { irParaConversa: () => void }) {
  const [requisicoes, setRequisicoes] = useState<RequisicaoApi[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const carregar = useCallback(async (depoisDe: number | null) => {
    setCarregando(true);
    setErro(null);
    try {
      const pagina = await api.listar(TAMANHO_PAGINA, depoisDe);
      setRequisicoes((atuais) =>
        depoisDe === null ? pagina.requisicoes : [...atuais, ...pagina.requisicoes],
      );
      setCursor(pagina.proximo_cursor);
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha
          : new ErroApi('ERRO_INTERNO', 'Erro inesperado na tela.', 0),
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(null);
  }, [carregar]);

  const contagem = (id: Filtro) =>
    id === 'todas' ? requisicoes.length : requisicoes.filter((r) => r.status === id).length;
  const visiveis =
    filtro === 'todas' ? requisicoes : requisicoes.filter((r) => r.status === filtro);

  return (
    <main className="lista">
      <div className="lista-topo">
        <div>
          <h1>Requisições</h1>
          <p>
            Tudo o que o agente gravou, lido de <span className="mono">GET /requisicoes</span>.
            Pedido não atendido não aparece aqui, porque não grava nada.
          </p>
        </div>
        <fieldset aria-label="Filtrar por status" className="chips grupo-filtros">
          {FILTROS.map(({ id, nome }) => (
            <button
              key={id}
              type="button"
              className="botao-secundario"
              aria-pressed={filtro === id}
              onClick={() => setFiltro(id)}
            >
              {nome} · {contagem(id)}
            </button>
          ))}
        </fieldset>
      </div>

      {erro && (
        <AlertaErro erro={erro} tentarDeNovo={() => void carregar(null)} ocupado={carregando} />
      )}

      {!erro && !carregando && requisicoes.length === 0 ? (
        <section className="painel vazio" aria-label="Lista vazia">
          <strong>Nenhuma requisição ainda</strong>
          <span className="secundario" style={{ fontSize: 14 }}>
            Escreva um pedido na Conversa. Exemplo: "3 laptops até US$ 2.000 cada".
          </span>
          <button type="button" className="chip" onClick={irParaConversa}>
            Ir para a conversa
          </button>
        </section>
      ) : (
        <div className="cartao">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Itens</th>
                  <th>Justificativa</th>
                  <th>Status</th>
                  <th className="direita">Total</th>
                  <th>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.numero}</td>
                    <td>
                      {descreverItens(r)}
                      {r.solicitante && <div className="secundario">{r.solicitante}</div>}
                    </td>
                    <td style={{ maxWidth: 320 }}>{r.justificativa}</td>
                    <td>
                      <span className={`selo selo-${r.status}`}>
                        {STATUS_REQUISICAO[r.status] ?? r.status}
                      </span>
                      {r.status === 'em_aprovacao' && (
                        <div className="secundario">
                          acima da {nomeDaAlcada(r.alcada.origem)} de {usd(r.alcada.valor_usd)}
                        </div>
                      )}
                    </td>
                    <td className="direita">{usd(r.valor_total)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dataHora(r.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lista-rodape">
            <span className="secundario">
              Valores e itens lidos do banco, com o preço copiado no momento da compra.
            </span>
            {carregando && <span className="secundario">Carregando…</span>}
            {!carregando && cursor !== null && (
              <button
                type="button"
                className="botao-secundario"
                onClick={() => void carregar(cursor)}
              >
                Carregar mais
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
