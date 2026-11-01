import { describe, expect, it } from 'vitest';
import { centavosParaDecimal, formatarUsd, paraCentavos } from '../src/dinheiro.js';

describe('dinheiro', () => {
  it('converte o preço da DummyJSON para centavos sem erro de float', () => {
    expect(paraCentavos(1099.99)).toBe(109999);
    expect(paraCentavos(0.1) + paraCentavos(0.2)).toBe(30);
  });

  it('soma 3 laptops a US$ 1.099,99 em centavos', () => {
    expect(formatarUsd(paraCentavos(1099.99) * 3)).toBe('US$ 3.299,97');
  });

  it('gera o texto decimal para numeric(12,2)', () => {
    expect(centavosParaDecimal(109999)).toBe('1099.99');
    expect(centavosParaDecimal(5)).toBe('0.05');
  });

  it('recusa valor negativo ou não finito', () => {
    expect(() => paraCentavos(-1)).toThrow(RangeError);
    expect(() => paraCentavos(Number.NaN)).toThrow(RangeError);
  });
});
