import { afterEach, describe, expect, it } from 'vitest';
import { executarDetalharProduto } from '../src/ferramentas/detalhar-produto.js';
import {
  BASE_URL,
  clienteComMock,
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

describe('detalhar_produto', () => {
  it('devolve o produto com garantia e prazo de envio', async () => {
    agente.get(BASE_URL).intercept({ path: '/products/81' }).reply(200, fixture('produto-81.json'));

    const resultado = await executarDetalharProduto(
      clienteComMock(agente),
      { id: 81 },
      loggerSilencioso,
    );

    expect(resultado.isError).toBeUndefined();
    expect(resultado.structuredContent).toMatchObject({
      id: 81,
      titulo: 'Lenovo Yoga 920',
      preco_usd: 1099.99,
      pedido_minimo: 1,
    });
    expect(resultado.structuredContent?.garantia).toEqual(expect.any(String));
    expect(resultado.structuredContent?.prazo_envio).toEqual(expect.any(String));
  });

  it('id inexistente volta como PRODUTO_NAO_ENCONTRADO', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: '/products/99999' })
      .reply(404, { message: 'not found' });

    const resultado = await executarDetalharProduto(
      clienteComMock(agente),
      { id: 99999 },
      loggerSilencioso,
    );

    expect(erroDaFerramenta(resultado).codigo).toBe('PRODUTO_NAO_ENCONTRADO');
  });

  it('catálogo lento volta como CATALOGO_LENTO', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: '/products/81' })
      .reply(200, fixture('produto-81.json'))
      .delay(500)
      .times(2);

    const resultado = await executarDetalharProduto(
      clienteComMock(agente, 50),
      { id: 81 },
      loggerSilencioso,
    );

    expect(erroDaFerramenta(resultado).codigo).toBe('CATALOGO_LENTO');
  });
});
