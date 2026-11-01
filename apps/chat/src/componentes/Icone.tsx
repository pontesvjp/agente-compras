import type { ReactNode } from 'react';
import type { IconePasso } from '../passos';

export type NomeIcone = IconePasso | 'carrinho' | 'alerta' | 'cadeado' | 'brilho' | 'enviar';

const DESENHOS: Record<NomeIcone, ReactNode> = {
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  detalhe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5v.5" />
    </>
  ),
  politica: <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z" />,
  gravado: <path d="M5 12l5 5 9-10" />,
  barrado: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
  falha: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16.5v.5" />
    </>
  ),
  alerta: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16.5v.5" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  brilho: (
    <>
      <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
      <path d="M19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  enviar: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </>
  ),
  carrinho: (
    <>
      <path d="M6 6h15l-1.5 9h-12z" />
      <path d="M6 6 5 3H2" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
    </>
  ),
};

export function Icone({ nome, tamanho = 12 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none' }}
    >
      {DESENHOS[nome]}
    </svg>
  );
}
