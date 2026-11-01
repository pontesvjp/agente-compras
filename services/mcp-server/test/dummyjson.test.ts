import { ErroAgente } from '@agente-compras/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { BASE_URL, clienteComMock, ehBusca, fixture, novoMock } from './apoio.js';

let agente = novoMock();
afterEach(async () => {
  agente.assertNoPendingInterceptors();
  await agente.close();
  agente = novoMock();
});

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  const erro = await promessa.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ErroAgente);
  return (erro as ErroAgente).codigo;
}

describe('cliente da DummyJSON', () => {
  it('busca com select= para trazer só os campos usados', async () => {
    let caminhoPedido = '';
    agente
      .get(BASE_URL)
      .intercept({
        path: (caminho) => {
          caminhoPedido = caminho;
          return ehBusca('laptop')(caminho);
        },
      })
      .reply(200, fixture('busca-laptop.json'));

    const produtos = await clienteComMock(agente).buscar('laptop', 10);

    expect(produtos).toHaveLength(5);
    expect(caminhoPedido).toContain('select=id,title,price,stock,minimumOrderQuantity');
  });

  it('guarda a busca em cache: a segunda chamada não vai à rede', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'));
    const cliente = clienteComMock(agente);

    await cliente.buscar('laptop', 10);
    const segunda = await cliente.buscar('laptop', 10);

    expect(segunda).toHaveLength(5);
  });

  it('tenta de novo uma vez quando a DummyJSON devolve 5xx', async () => {
    const pool = agente.get(BASE_URL);
    pool.intercept({ path: ehBusca('laptop') }).reply(503, 'fora');
    pool.intercept({ path: ehBusca('laptop') }).reply(200, fixture('busca-laptop.json'));

    expect(await clienteComMock(agente).buscar('laptop', 10)).toHaveLength(5);
  });

  it('desiste depois da segunda falha com CATALOGO_INDISPONIVEL', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(500, 'erro')
      .times(2);

    expect(await codigoDoErro(clienteComMock(agente).buscar('laptop', 10))).toBe(
      'CATALOGO_INDISPONIVEL',
    );
  });

  it('corta a chamada lenta no timeout com CATALOGO_LENTO', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, fixture('busca-laptop.json'))
      .delay(500)
      .times(2);

    expect(await codigoDoErro(clienteComMock(agente, 50).buscar('laptop', 10))).toBe(
      'CATALOGO_LENTO',
    );
  });

  it('id inexistente vira PRODUTO_NAO_ENCONTRADO, sem nova tentativa', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: '/products/99999' })
      .reply(404, { message: 'not found' });

    expect(await codigoDoErro(clienteComMock(agente).detalhar(99999))).toBe(
      'PRODUTO_NAO_ENCONTRADO',
    );
  });

  it('resposta fora do formato esperado vira CATALOGO_INDISPONIVEL', async () => {
    agente
      .get(BASE_URL)
      .intercept({ path: ehBusca('laptop') })
      .reply(200, { inesperado: true });

    expect(await codigoDoErro(clienteComMock(agente).buscar('laptop', 10))).toBe(
      'CATALOGO_INDISPONIVEL',
    );
  });
});
