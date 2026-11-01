import type { Metricas, RequisicaoApi } from '@agente-compras/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { decimal, descreverItens, STATUS_REQUISICAO, usd } from '../formato';

/** Lateral da conversa: últimas requisições e métricas. Recarrega quando a App troca a `key`. */
export function Resumo({ verTodas, detalhes }: { verTodas: () => void; detalhes: boolean }) {
  const [requisicoes, setRequisicoes] = useState<RequisicaoApi[] | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    Promise.all([api.listar(3, null), api.metricas()]).then(
      ([lista, lidas]) => {
        if (!ativo) return;
        setRequisicoes(lista.requisicoes);
        setMetricas(lidas);
      },
      () => {
        if (ativo) setFalhou(true);
      },
    );
    return () => {
      ativo = false;
    };
  }, []);

  if (falhou) {
    return (
      <section className="painel">
        <h2>Últimas requisições</h2>
        <span className="secundario">Não consegui falar com o backend agora.</span>
      </section>
    );
  }

  return (
    <>
      <section className="painel" aria-label="Últimas requisições">
        <h2>Últimas requisições</h2>
        {requisicoes === null && <span className="secundario">Carregando…</span>}
        {requisicoes?.length === 0 && <span className="secundario">Nenhuma requisição ainda.</span>}
        {requisicoes?.map((r) => (
          <div key={r.id} className="item-resumo">
            <div className="linha-entre">
              <strong className="mono" style={{ fontSize: 13 }}>
                {r.numero}
              </strong>
              <span className="numeros" style={{ fontSize: 13 }}>
                {usd(r.valor_total)}
              </span>
            </div>
            <span className="secundario" style={{ fontSize: 13 }}>
              {descreverItens(r)}
              {r.solicitante ? ` · ${r.solicitante}` : ''}
            </span>
            <span className={`selo selo-${r.status}`}>
              {STATUS_REQUISICAO[r.status] ?? r.status}
            </span>
          </div>
        ))}
        <button
          type="button"
          className="link"
          onClick={verTodas}
          style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', fontSize: 13 }}
        >
          Ver todas as requisições
        </button>
      </section>

      {metricas && (
        <section className="painel" aria-label="Métricas">
          <h2>Atendimentos</h2>
          <div className="metricas">
            <Metrica valor={metricas.atendimentos} rotulo="pedidos" />
            <Metrica valor={metricas.criadas} rotulo="requisições criadas" />
            <Metrica valor={metricas.nao_atendidas} rotulo="não atendidos" />
            <Metrica valor={metricas.erros} rotulo="com erro" />
          </div>
          {detalhes && metricas.tempo_p50_ms !== null && (
            <span className="secundario">
              Tempo mediano {decimal(metricas.tempo_p50_ms / 1000, 1)} s
              {metricas.custo_medio_usd === null
                ? ''
                : ` · custo médio US$ ${decimal(metricas.custo_medio_usd, 4)}`}
            </span>
          )}
        </section>
      )}
    </>
  );
}

function Metrica({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div>
      <div className="metrica-valor">{valor}</div>
      <div className="secundario">{rotulo}</div>
    </div>
  );
}
