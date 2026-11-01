import { Icone } from './Icone';

export type Aba = 'conversa' | 'requisicoes';

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'conversa', nome: 'Conversa' },
  { id: 'requisicoes', nome: 'Requisições' },
];

export function Cabecalho({ aba, irPara }: { aba: Aba; irPara: (aba: Aba) => void }) {
  return (
    <header className="cabecalho">
      <div className="cabecalho-conteudo">
        <div className="marca">
          <span className="marca-icone" style={{ color: 'var(--me-white)' }}>
            <Icone nome="carrinho" tamanho={16} />
          </span>
          <span>Agente de compras</span>
        </div>
        <nav aria-label="Seções" className="abas">
          {ABAS.map(({ id, nome }) => (
            <button
              key={id}
              type="button"
              className="aba"
              aria-current={aba === id ? 'page' : undefined}
              onClick={() => irPara(id)}
            >
              {nome}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
