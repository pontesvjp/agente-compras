import { type FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { hora } from '../formato';
import type { Turno } from '../turnos';
import { AlertaErro } from './AlertaErro';
import { Icone } from './Icone';
import { RespostaAgente } from './RespostaAgente';
import { RotuloAgente } from './RotuloAgente';

const SUGESTOES = [
  {
    rotulo: '3 laptops até US$ 2.000 cada',
    pedido: 'Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.',
  },
  { rotulo: '4 tablets até US$ 700', pedido: '4 tablets até US$ 700 para os vendedores externos' },
];

interface Props {
  turnos: Turno[];
  detalhes: boolean;
  alternarDetalhes: () => void;
  solicitante: string;
  mudarSolicitante: (valor: string) => void;
  enviar: (pedido: string) => void;
  tentarDeNovo: (turno: Turno) => void;
  verRequisicoes: () => void;
}

export function Conversa(props: Props) {
  const { turnos, detalhes, enviar } = props;
  const [texto, setTexto] = useState('');
  const campoPedido = useRef<HTMLInputElement>(null);
  const ocupado = turnos.some((t) => t.estado === 'carregando');
  const andamento = turnos.map((t) => `${t.id}:${t.estado}`).join();

  useEffect(() => {
    // O formulário fica fixo no rodapé: rolar até o fim da página deixa a última resposta inteira à vista.
    if (andamento !== '') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, [andamento]);

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    const pedido = texto.trim();
    if (pedido.length < 3 || ocupado) return;
    enviar(pedido);
    setTexto('');
  }

  const focarPedido = () => campoPedido.current?.focus();

  return (
    <section aria-label="Conversa" className="conversa">
      <div className="barra-acoes">
        <button
          type="button"
          className="botao-secundario"
          aria-pressed={detalhes}
          onClick={props.alternarDetalhes}
        >
          Detalhes técnicos: {detalhes ? 'ligado' : 'desligado'}
        </button>
      </div>

      <div className="turno-agente">
        <RotuloAgente />
        <div className="balao-agente" style={{ gap: 12 }}>
          <span>
            Olá. Diga o que precisa comprar, com a quantidade e o limite de preço. Eu procuro no
            catálogo, confiro a política de compras e gravo a requisição.
          </span>
          <div className="chips">
            {SUGESTOES.map((sugestao) => (
              <button
                key={sugestao.rotulo}
                type="button"
                className="chip"
                disabled={ocupado}
                onClick={() => enviar(sugestao.pedido)}
              >
                {sugestao.rotulo}
              </button>
            ))}
            <button type="button" className="chip" onClick={props.verRequisicoes}>
              Ver requisições
            </button>
          </div>
        </div>
      </div>

      {turnos.map((turno) => (
        <Fragment key={turno.id}>
          <div className="balao-usuario">
            <span className="secundario">Você · {hora(turno.enviadoEm)}</span>
            <span>{turno.pedido}</span>
          </div>
          {turno.estado === 'carregando' && (
            <div role="status" className="carregando">
              <RotuloAgente quando={turno.enviadoEm} pensando />
              <span style={{ fontSize: 13, color: 'var(--me-gray-0)' }}>
                Processando resposta: consultando o catálogo e a política de compras…
              </span>
              <div className="barra-progresso">
                <div />
              </div>
            </div>
          )}
          {turno.estado === 'erro' && (
            <div className="turno-agente">
              <RotuloAgente quando={turno.respondidoEm} />
              <AlertaErro
                erro={turno.erro}
                ocupado={ocupado}
                tentarDeNovo={() => props.tentarDeNovo(turno)}
              />
            </div>
          )}
          {turno.estado === 'pronto' && (
            <RespostaAgente
              resposta={turno.resposta}
              respondidoEm={turno.respondidoEm}
              detalhes={detalhes}
              verRequisicoes={props.verRequisicoes}
              fazerOutroPedido={focarPedido}
            />
          )}
        </Fragment>
      ))}

      <form className="formulario" onSubmit={aoEnviar}>
        <div className="campo campo-pedido">
          <label htmlFor="pedido" className="secundario">
            Pedido de compra
          </label>
          <input
            id="pedido"
            ref={campoPedido}
            type="text"
            value={texto}
            maxLength={1000}
            autoComplete="off"
            placeholder="Descreva o que precisa comprar, com quantidade e limite de preço"
            onChange={(evento) => setTexto(evento.target.value)}
          />
        </div>
        <div className="campo campo-solicitante">
          <label htmlFor="solicitante" className="secundario">
            Solicitante (opcional)
          </label>
          <input
            id="solicitante"
            type="text"
            value={props.solicitante}
            maxLength={120}
            placeholder="Ex.: Time de vendas"
            onChange={(evento) => props.mudarSolicitante(evento.target.value)}
          />
        </div>
        <button
          type="submit"
          className="botao-principal"
          disabled={ocupado || texto.trim().length < 3}
        >
          <Icone nome="enviar" tamanho={16} />
          {ocupado ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </section>
  );
}
