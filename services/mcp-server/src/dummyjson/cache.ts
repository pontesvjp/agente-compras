export interface CacheComValidade<T> {
  ler(chave: string): T | undefined;
  gravar(chave: string, valor: T): void;
  readonly tamanho: number;
}

/** Cache em memória com validade. Cada gravação descarta o que venceu, então ele não cresce sem fim. */
export function criarCache<T>(validadeMs: number, agora: () => number): CacheComValidade<T> {
  const entradas = new Map<string, { expiraEm: number; valor: T }>();
  return {
    ler(chave) {
      const entrada = entradas.get(chave);
      return entrada && entrada.expiraEm > agora() ? entrada.valor : undefined;
    },
    gravar(chave, valor) {
      const instante = agora();
      for (const [outra, entrada] of entradas) {
        if (entrada.expiraEm <= instante) entradas.delete(outra);
      }
      entradas.set(chave, { expiraEm: instante + validadeMs, valor });
    },
    get tamanho() {
      return entradas.size;
    },
  };
}
