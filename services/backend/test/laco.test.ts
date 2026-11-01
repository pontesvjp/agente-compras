import { describe, expect, it } from 'vitest';
import { MAXIMO_VOLTAS, novaTrilha, rodarLaco } from '../src/agente/laco.js';
import type { MensagemLlm } from '../src/agente/tipos.js';
import { executorFalso, llmRoteirizado, type Passo } from './apoio.js';

async function rodar(passos: Passo[], atrasoMs: Record<string, number> = {}) {
  const llm = llmRoteirizado(passos);
  const { executor, ordem } = executorFalso(atrasoMs);
  const trilha = novaTrilha();
  const resultado = await rodarLaco({
    pedido: 'Preciso de 3 laptops até US$ 2.000 cada.',
    prompt: 'prompt de teste',
    modelo: llm.modelo,
    executor,
    sinal: new AbortController().signal,
    trilha,
  });
  return { resultado, ordem, trilha, recebido: llm.recebido };
}

const mensagensDeFerramenta = (mensagens: MensagemLlm[] | undefined) =>
  (mensagens ?? []).filter((m) => m.role === 'tool');

describe('laço do agente', () => {
  it('executa as ferramentas na ordem que o modelo pede e termina com a resposta dele', async () => {
    const { resultado, ordem } = await rodar([
      { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
      { chamadas: [{ nome: 'criar_requisicao', argumentos: { itens: [] } }] },
      { texto: 'Criei a requisição.' },
    ]);

    expect(ordem).toEqual(['buscar_produtos', 'criar_requisicao']);
    expect(resultado).toEqual({ mensagem: 'Criei a requisição.', concluiu: true });
  });

  it('com outro roteiro, outra ordem: o código não tem fluxo fixo', async () => {
    const { ordem } = await rodar([
      { chamadas: [{ nome: 'consultar_politica', argumentos: { categoria: 'laptops' } }] },
      { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
      { chamadas: [{ nome: 'detalhar_produto', argumentos: { id: 81 } }] },
      { texto: 'Não criei a requisição: nada atende.' },
    ]);

    expect(ordem).toEqual(['consultar_politica', 'buscar_produtos', 'detalhar_produto']);
  });

  it('responde sem chamar ferramenta quando o modelo decide assim', async () => {
    const { ordem, resultado } = await rodar([{ texto: 'Não entendi o que comprar.' }]);

    expect(ordem).toEqual([]);
    expect(resultado.mensagem).toBe('Não entendi o que comprar.');
  });

  it('roda em paralelo as ferramentas pedidas na mesma volta e devolve cada resultado com o seu id', async () => {
    const { recebido, trilha } = await rodar(
      [
        {
          chamadas: [
            { nome: 'buscar_produtos', argumentos: { termo: 'laptop' } },
            { nome: 'consultar_politica', argumentos: {} },
          ],
        },
        { texto: 'pronto' },
      ],
      { buscar_produtos: 30 },
    );

    expect(mensagensDeFerramenta(recebido[1])).toEqual([
      {
        role: 'tool',
        tool_call_id: 'volta1-chamada0',
        content: JSON.stringify({ resultado_de: 'buscar_produtos' }),
      },
      {
        role: 'tool',
        tool_call_id: 'volta1-chamada1',
        content: JSON.stringify({ resultado_de: 'consultar_politica' }),
      },
    ]);
    expect(trilha.chamadas.map((c) => c.nome)).toEqual(['buscar_produtos', 'consultar_politica']);
  });

  it('argumento que não é JSON volta como erro para o modelo, sem chegar ao MCP', async () => {
    const { ordem, recebido, trilha } = await rodar([
      { chamadas: [{ nome: 'buscar_produtos', argumentos: '{termo: laptop' }] },
      { texto: 'desisti' },
    ]);

    expect(ordem).toEqual([]);
    expect(mensagensDeFerramenta(recebido[1])[0]?.content).toContain('PEDIDO_INVALIDO');
    expect(trilha.chamadas[0]).toMatchObject({ ok: false, erro_codigo: 'PEDIDO_INVALIDO' });
  });

  it('ferramenta que não existe volta como erro para o modelo', async () => {
    const { ordem, recebido } = await rodar([
      { chamadas: [{ nome: 'apagar_tudo', argumentos: {} }] },
      { texto: 'ok' },
    ]);

    expect(ordem).toEqual([]);
    expect(mensagensDeFerramenta(recebido[1])[0]?.content).toContain('não existe');
  });

  it(`para em ${MAXIMO_VOLTAS} voltas se o modelo não parar de chamar ferramentas`, async () => {
    const semFim: Passo[] = Array.from({ length: MAXIMO_VOLTAS + 2 }, () => ({
      chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }],
    }));

    const { resultado, ordem } = await rodar(semFim);

    expect(ordem).toHaveLength(MAXIMO_VOLTAS);
    expect(resultado.concluiu).toBe(false);
  });

  it('soma tokens e custo de todas as voltas, sem erro de float', async () => {
    const { trilha } = await rodar([
      { chamadas: [{ nome: 'buscar_produtos', argumentos: { termo: 'laptop' } }] },
      { chamadas: [{ nome: 'criar_requisicao', argumentos: {} }] },
      { texto: 'fim' },
    ]);

    expect(trilha).toMatchObject({
      modelo: 'roteiro/falso',
      tokens_entrada: 300,
      tokens_saida: 60,
      custo_micro_usd: 375,
    });
  });
});
