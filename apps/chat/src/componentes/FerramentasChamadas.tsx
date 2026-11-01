import type { AtendimentoApi, ChamadaFerramenta } from '@agente-compras/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { decimal } from '../formato';
import { descreverPasso, resumoTecnico } from '../passos';
import { Icone } from './Icone';

interface Props {
  ferramentas: ChamadaFerramenta[];
  atendimentoId: string;
  detalhes: boolean;
}

/** O que o agente fez: em frases para quem compra, ou o detalhe de dev com "Detalhes técnicos". */
export function FerramentasChamadas({ ferramentas, atendimentoId, detalhes }: Props) {
  if (detalhes) return <PainelTecnico ferramentas={ferramentas} atendimentoId={atendimentoId} />;
  if (ferramentas.length === 0) return null;

  const passos = ferramentas.map((chamada, posicao) => ({
    chave: `${posicao}-${chamada.nome}`,
    ...descreverPasso(chamada),
  }));
  return (
    <ul
      className="chips"
      aria-label="O que o agente fez"
      style={{ margin: 0, padding: 0, listStyle: 'none' }}
    >
      {passos.map((passo) => (
        <li key={passo.chave} className={passo.falhou ? 'passo passo-falha' : 'passo'}>
          <Icone nome={passo.icone} />
          {passo.texto}
        </li>
      ))}
    </ul>
  );
}

function PainelTecnico({ ferramentas, atendimentoId }: Omit<Props, 'detalhes'>) {
  const [trilha, setTrilha] = useState<AtendimentoApi | null>(null);

  useEffect(() => {
    let ativo = true;
    api.atendimento(atendimentoId).then(
      (lida) => {
        if (ativo) setTrilha(lida);
      },
      () => undefined,
    );
    return () => {
      ativo = false;
    };
  }, [atendimentoId]);

  const linhas = ferramentas.map((chamada, posicao) => ({
    chave: `${posicao}-${chamada.nome}`,
    numero: posicao + 1,
    chamada,
  }));
  return (
    <section aria-label="Ferramentas chamadas" className="painel-tecnico">
      <div className="painel-tecnico-linha apagado" style={{ flexWrap: 'wrap', fontSize: 12 }}>
        <span>atendimento {atendimentoId}</span>
        <span>modelo {trilha?.modelo ?? '…'}</span>
      </div>
      {linhas.map(({ chave, numero, chamada }) => (
        <div key={chave} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="painel-tecnico-linha">
            <span>
              <span className="indice">{numero}</span> {chamada.nome}(
              {JSON.stringify(chamada.argumentos)})
            </span>
            <span className="apagado" style={{ whiteSpace: 'nowrap' }}>
              {chamada.duracao_ms} ms
            </span>
          </div>
          <span className="apagado" style={{ paddingLeft: 24 }}>
            → {resumoTecnico(chamada)}
          </span>
        </div>
      ))}
      {linhas.length === 0 && <span className="apagado">nenhuma ferramenta chamada</span>}
      <div className="painel-tecnico-rodape">
        {trilha ? (
          <>
            <span>
              tokens: {trilha.tokens_entrada ?? 0} entrada / {trilha.tokens_saida ?? 0} saída
            </span>
            <span>
              custo: {trilha.custo_usd === null ? '—' : `US$ ${decimal(trilha.custo_usd, 6)}`}
            </span>
            <span>
              tempo total:{' '}
              {trilha.duracao_ms === null ? '—' : `${decimal(trilha.duracao_ms / 1000, 1)} s`}
            </span>
          </>
        ) : (
          <span>carregando a trilha…</span>
        )}
        <a
          href={`/api/atendimentos/${atendimentoId}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--ac-primary-no-escuro)' }}
        >
          GET /api/atendimentos/{atendimentoId.slice(0, 8)}…
        </a>
      </div>
    </section>
  );
}
