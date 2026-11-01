import { afterEach, describe, expect, it } from 'vitest';
import { executarBuscarProdutos } from '../src/ferramentas/buscar-produtos.js';
import {
  BASE_URL,
  clienteComMock,
  ehBusca,
  erroDaFerramenta,
  fixture,
  loggerSilencioso,
  novoMock,
} from './apoio.js';

let agente = novoMock();
afterEach(async () => {
  await agente.close();
  agente = novoMock();
});

describe('buscar_produtos', () => {
  it('devolve os laptops com preço, estoque e pedido mínimo', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'));

    const resultado = await executarBuscarProdutos(
      clienteComMock(agente),
      { termo: '  Laptop ', limite: 10 },
      loggerSilencioso,
    );

    expect(resultado.isError).toBeUndefined();
    expect(resultado.structuredContent).toMatchObject({ termo: 'laptop', total: 5 });
    expect(resultado.structuredContent?.produtos).toContainEqual({
      id: 81,
      titulo: 'Lenovo Yoga 920',
      preco_usd: 1099.99,
      estoque: 40,
      pedido_minimo: 1,
      disponibilidade: 'In Stock',
      categoria: 'laptops',
      marca: 'Lenovo',
      avaliacao: 2.86,
    });
  });

  it('busca vazia volta com uma dica de termo em inglês e no singular', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptops') })
      .reply(200, fixture('busca-vazia.json'));

    const resultado = await executarBuscarProdutos(
      clienteComMock(agente),
      { termo: 'laptops', limite: 10 },
      loggerSilencioso,
    );

    expect(resultado.structuredContent).toMatchObject({ total: 0, produtos: [] });
    expect(resultado.structuredContent?.dica).toContain('Tente "laptop"');
  });

  it('devolve o ruído da busca sem filtrar: quem decide se serve é o modelo', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('monitor') })
      .reply(200, fixture('busca-monitor.json'));

    const resultado = await executarBuscarProdutos(
      clienteComMock(agente),
      { termo: 'monitor', limite: 10 },
      loggerSilencioso,
    );

    const produtos = (resultado.structuredContent?.produtos ?? []) as { categoria: string }[];
    const categorias = produtos.map((p) => p.categoria);
    expect(categorias).toEqual(['kitchen-accessories', 'mobile-accessories']);
  });

  it('catálogo fora vira erro com código, não exceção', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(503, 'fora')
      .times(2);

    const resultado = await executarBuscarProdutos(
      clienteComMock(agente),
      { termo: 'laptop', limite: 10 },
      loggerSilencioso,
    );

    expect(erroDaFerramenta(resultado).codigo).toBe('CATALOGO_INDISPONIVEL');
  });
});
