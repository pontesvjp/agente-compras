/**
 * Avaliação do agente com pedidos de personas, conferida no banco e não no texto do modelo.
 * Precisa do ambiente no ar e de uma chave com crédito: `docker compose run --rm testes npm run avaliar`.
 * Para comparar modelos, troque LLM_MODELO no .env, rode `docker compose up -d` e avalie de novo.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  buscarAtendimento,
  criarPool,
  type RequisicaoGravada,
  requisicaoDoAtendimento,
} from '@agente-compras/db';
import { paraCentavos, type RespostaPedido, respostaPedidoSchema } from '@agente-compras/shared';
import { z } from 'zod';

const personaSchema = z.object({
  id: z.number().int(),
  persona: z.string(),
  solicitante: z.string().optional(),
  pedido: z.string(),
  esperado: z.object({
    resultado: z.enum(['criada', 'nao_atendida']),
    quantidade: z.number().int().optional(),
    categoria: z.string().optional(),
    preco_maximo_usd: z.number().optional(),
    mensagem_cita: z.array(z.string()).optional(),
  }),
});
export type Persona = z.infer<typeof personaSchema>;

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Confere a resposta e o que foi gravado contra o esperado. Devolve a lista de falhas. */
export function conferir(
  persona: Persona,
  resposta: RespostaPedido,
  gravada: RequisicaoGravada | null,
): string[] {
  const { esperado } = persona;
  const falhas: string[] = [];
  if (resposta.resultado !== esperado.resultado) {
    falhas.push(`resultado ${resposta.resultado}, esperado ${esperado.resultado}`);
  }

  if (esperado.resultado === 'criada') {
    if (!gravada) {
      falhas.push('nenhuma requisição gravada para o atendimento');
    } else {
      const quantidade = gravada.itens.reduce((soma, item) => soma + item.quantidade, 0);
      if (esperado.quantidade !== undefined && quantidade !== esperado.quantidade) {
        falhas.push(`quantidade ${quantidade}, esperada ${esperado.quantidade}`);
      }
      for (const item of gravada.itens) {
        if (esperado.categoria !== undefined && item.categoria !== esperado.categoria) {
          falhas.push(
            `item ${item.produto_id} é de ${item.categoria}, esperado ${esperado.categoria}`,
          );
        }
        if (
          esperado.preco_maximo_usd !== undefined &&
          item.preco_unitario_centavos > paraCentavos(esperado.preco_maximo_usd)
        ) {
          falhas.push(`item ${item.produto_id} passa de US$ ${esperado.preco_maximo_usd}`);
        }
      }
      if (resposta.requisicao?.numero !== gravada.numero) {
        falhas.push('o número na resposta não é o do banco');
      }
    }
  } else if (gravada) {
    falhas.push(`gravou ${gravada.numero}, mas o pedido não devia ser atendido`);
  }

  for (const trecho of esperado.mensagem_cita ?? []) {
    if (!normalizar(resposta.mensagem).includes(normalizar(trecho))) {
      falhas.push(`a mensagem não cita "${trecho}"`);
    }
  }
  return falhas;
}

interface Medida {
  persona: Persona;
  falhas: string[];
  modelo: string;
  duracao_ms: number;
  custo_usd: number | null;
  tokens_entrada: number | null;
}

const configSchema = z.object({
  AVALIAR_BACKEND_URL: z.url().default('http://backend:3000'),
  AVALIAR_DATABASE_URL: z.string().default('postgres://compras:compras@postgres:5432/compras'),
  AVALIAR_RODADAS: z.coerce.number().int().min(1).max(10).default(1),
});

const percentil = (valores: number[], p: number) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))] ?? 0;
};

async function pedir(baseUrl: string, persona: Persona): Promise<RespostaPedido | string> {
  const resposta = await fetch(`${baseUrl}/requisicoes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pedido: persona.pedido,
      ...(persona.solicitante ? { solicitante: persona.solicitante } : {}),
    }),
  });
  const corpo: unknown = await resposta.json();
  const lida = respostaPedidoSchema.safeParse(corpo);
  return lida.success ? lida.data : `HTTP ${resposta.status}: ${JSON.stringify(corpo)}`;
}

async function principal(): Promise<void> {
  const config = configSchema.parse(process.env);
  const personas = z
    .array(personaSchema)
    .parse(
      JSON.parse(await readFile(new URL('../avaliacao/personas.json', import.meta.url), 'utf8')),
    );
  const pool = criarPool(config.AVALIAR_DATABASE_URL);
  const medidas: Medida[] = [];

  try {
    for (let rodada = 1; rodada <= config.AVALIAR_RODADAS; rodada++) {
      for (const persona of personas) {
        const inicio = performance.now();
        const resposta = await pedir(config.AVALIAR_BACKEND_URL, persona);
        const duracao_ms = Math.round(performance.now() - inicio);
        if (typeof resposta === 'string') {
          medidas.push({
            persona,
            falhas: [resposta],
            modelo: '?',
            duracao_ms,
            custo_usd: null,
            tokens_entrada: null,
          });
        } else {
          const gravada = await requisicaoDoAtendimento(pool, resposta.atendimento_id);
          const trilha = await buscarAtendimento(pool, resposta.atendimento_id);
          medidas.push({
            persona,
            falhas: conferir(persona, resposta, gravada),
            modelo: trilha?.modelo ?? '?',
            duracao_ms,
            custo_usd: trilha?.custo_usd ? Number(trilha.custo_usd) : null,
            tokens_entrada: trilha?.tokens_entrada ?? null,
          });
        }
        const ultima = medidas.at(-1);
        if (ultima) {
          const marca = ultima.falhas.length === 0 ? 'ok   ' : 'FALHA';
          console.log(
            `${marca} #${persona.id} ${(ultima.duracao_ms / 1000).toFixed(1)} s  ${persona.pedido}` +
              (ultima.falhas.length > 0 ? `\n        ${ultima.falhas.join('\n        ')}` : ''),
          );
        }
      }
    }
  } finally {
    await pool.end();
  }

  console.log('\nPor modelo:');
  const modelos = [...new Set(medidas.map((m) => m.modelo))];
  for (const modelo of modelos) {
    const doModelo = medidas.filter((m) => m.modelo === modelo);
    const acertos = doModelo.filter((m) => m.falhas.length === 0).length;
    const tempos = doModelo.map((m) => m.duracao_ms);
    const custos = doModelo.flatMap((m) => (m.custo_usd === null ? [] : [m.custo_usd]));
    const tokens = doModelo.flatMap((m) => (m.tokens_entrada === null ? [] : [m.tokens_entrada]));
    const media = (v: number[]) => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length);
    console.log(
      `  ${modelo}: ${acertos}/${doModelo.length} acertos · tempo p50 ${(percentil(tempos, 50) / 1000).toFixed(1)} s, ` +
        `p95 ${(percentil(tempos, 95) / 1000).toFixed(1)} s · custo médio US$ ${media(custos).toFixed(5)} · ` +
        `${Math.round(media(tokens))} tokens de entrada`,
    );
  }
  if (medidas.some((m) => m.falhas.length > 0)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await principal();
}
