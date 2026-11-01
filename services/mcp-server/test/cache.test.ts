import { describe, expect, it } from 'vitest';
import { criarCache } from '../src/dummyjson/cache.js';

describe('cache das buscas', () => {
  it('devolve dentro da validade e esquece depois', () => {
    let agora = 0;
    const cache = criarCache<string>(60_000, () => agora);

    cache.gravar('laptop', 'resultado');
    agora = 59_999;
    const dentro = cache.ler('laptop');
    agora = 60_000;

    expect(dentro).toBe('resultado');
    expect(cache.ler('laptop')).toBeUndefined();
  });

  it('cada gravação descarta as entradas vencidas, e o cache não cresce sem fim', () => {
    let agora = 0;
    const cache = criarCache<string>(60_000, () => agora);

    cache.gravar('laptop', 'a');
    cache.gravar('monitor', 'b');
    agora = 61_000;
    cache.gravar('cadeira', 'c');

    expect(cache.tamanho).toBe(1);
    expect(cache.ler('cadeira')).toBe('c');
  });
});
