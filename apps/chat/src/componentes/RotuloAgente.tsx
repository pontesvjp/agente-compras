import { hora } from '../formato';
import { Icone } from './Icone';

/** Avatar e nome do agente, como no chat de IA do ME. Pulsa enquanto o agente trabalha. */
export function RotuloAgente({ quando, pensando = false }: { quando?: Date; pensando?: boolean }) {
  return (
    <span className="rotulo-agente secundario">
      <span className={pensando ? 'avatar-agente pensando' : 'avatar-agente'}>
        <Icone nome="brilho" tamanho={14} />
      </span>
      Agente de compras{quando ? ` · ${hora(quando)}` : ''}
    </span>
  );
}
