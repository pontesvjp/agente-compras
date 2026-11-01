import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from './api';
import { type Aba, Cabecalho } from './componentes/Cabecalho';
import { Conversa } from './componentes/Conversa';
import { ListaRequisicoes } from './componentes/ListaRequisicoes';
import { Resumo } from './componentes/Resumo';
import { gravarPreferencia, lerPreferencia } from './formato';
import { novoId, type Turno } from './turnos';

/** Aba no hash (#requisicoes): o caminho /requisicoes é do backend, repassado pelo nginx. */
const abaDoEndereco = (): Aba =>
  window.location.hash === '#requisicoes' ? 'requisicoes' : 'conversa';

export function App() {
  const [aba, setAba] = useState<Aba>(abaDoEndereco);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [detalhes, setDetalhes] = useState(() => lerPreferencia('detalhes-tecnicos') === 'ligado');
  const [solicitante, setSolicitante] = useState(() => lerPreferencia('solicitante') ?? '');
  const [atualizacoes, setAtualizacoes] = useState(0);

  useEffect(() => {
    const aoMudar = () => setAba(abaDoEndereco());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const irPara = useCallback((destino: Aba) => {
    window.location.hash = destino === 'requisicoes' ? 'requisicoes' : '';
    setAba(destino);
  }, []);

  const executar = useCallback(
    async (turno: Turno) => {
      const atualizar = (novo: Turno) =>
        setTurnos((atuais) => atuais.map((t) => (t.id === turno.id ? novo : t)));
      const base = {
        id: turno.id,
        pedido: turno.pedido,
        idempotencyKey: turno.idempotencyKey,
        enviadoEm: turno.enviadoEm,
      };
      try {
        const resposta = await api.pedir(turno.pedido, solicitante, turno.idempotencyKey);
        atualizar({ ...base, estado: 'pronto', resposta, respondidoEm: new Date() });
      } catch (falha) {
        const erro =
          falha instanceof ErroApi
            ? falha
            : new ErroApi('ERRO_INTERNO', 'Erro inesperado na tela.', 0);
        atualizar({ ...base, estado: 'erro', erro, respondidoEm: new Date() });
      } finally {
        setAtualizacoes((n) => n + 1);
      }
    },
    [solicitante],
  );

  const enviar = (pedido: string) => {
    const turno: Turno = {
      id: novoId(),
      pedido,
      idempotencyKey: novoId(),
      enviadoEm: new Date(),
      estado: 'carregando',
    };
    setTurnos((atuais) => [...atuais, turno]);
    void executar(turno);
  };

  /** Mesma chave de idempotência: se o primeiro envio chegou a gravar, não duplica. */
  const tentarDeNovo = (turno: Turno) => {
    const denovo: Turno = { ...turno, estado: 'carregando' };
    setTurnos((atuais) => atuais.map((t) => (t.id === turno.id ? denovo : t)));
    void executar(denovo);
  };

  const alternarDetalhes = () =>
    setDetalhes((atual) => {
      gravarPreferencia('detalhes-tecnicos', atual ? 'desligado' : 'ligado');
      return !atual;
    });

  const mudarSolicitante = (valor: string) => {
    setSolicitante(valor);
    gravarPreferencia('solicitante', valor);
  };

  return (
    <>
      <Cabecalho aba={aba} irPara={irPara} />
      {aba === 'conversa' ? (
        <main className="pagina">
          <Conversa
            turnos={turnos}
            detalhes={detalhes}
            alternarDetalhes={alternarDetalhes}
            solicitante={solicitante}
            mudarSolicitante={mudarSolicitante}
            enviar={enviar}
            tentarDeNovo={tentarDeNovo}
            verRequisicoes={() => irPara('requisicoes')}
          />
          <aside className="lateral" aria-label="Resumo">
            <Resumo key={atualizacoes} verTodas={() => irPara('requisicoes')} detalhes={detalhes} />
          </aside>
        </main>
      ) : (
        <ListaRequisicoes irParaConversa={() => irPara('conversa')} />
      )}
    </>
  );
}
