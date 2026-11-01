# Agente de compras

A pessoa escreve no chat o que precisa comprar. Um agente de IA consulta o catálogo por um servidor
MCP, escolhe os itens e grava uma requisição de compra no Postgres, sem inventar produto nem preço.

Case técnico do processo seletivo de **AI Forward Deployed Engineer** do Mercado Eletrônico.

```text
você    Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.

agente  buscar_produtos("laptop")                              5 resultados · 380 ms
        criar_requisicao([{ produto_id: 81, quantidade: 3 }])               210 ms

        Requisição REQ-000001 · aprovada
        3 × Lenovo Yoga 920          US$ 1.099,99          US$ 3.299,97
                                     Total                 US$ 3.299,97
```

> **Em construção.** O que já está pronto fica no checklist [Estado](#estado), no fim.

## Rodar

Pré-requisito: Docker com Compose v2. Nada mais na máquina.

1. Copie a configuração:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e preencha `OPENROUTER_API_KEY`.
3. Suba as quatro peças:
   ```bash
   docker compose up --build
   ```
4. Abra **http://localhost:8080** e escreva o pedido.

Pela API:

```bash
curl -s http://localhost:8080/api/requisicoes \
  -H "content-type: application/json" \
  -d '{"pedido": "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada."}'
```

```json
{
  "resultado": "criada",
  "requisicao": {
    "numero": "REQ-000001",
    "status": "aprovada",
    "itens": [
      { "produto_id": 81, "titulo": "Lenovo Yoga 920", "quantidade": 3, "preco_unitario": 1099.99, "subtotal": 3299.97 }
    ],
    "valor_total": 3299.97,
    "moeda": "USD"
  },
  "mensagem": "Criei a requisição REQ-000001 com 3 Lenovo Yoga 920 a US$ 1.099,99, o laptop mais barato dentro do limite.",
  "ferramentas": [
    { "nome": "buscar_produtos", "argumentos": { "termo": "laptop" }, "duracao_ms": 380 },
    { "nome": "criar_requisicao", "argumentos": { "itens": [{ "produto_id": 81, "quantidade": 3 }] }, "duracao_ms": 210 }
  ]
}
```

Se nada atende, nada é gravado e a resposta diz o que faltou. Exemplo para "5 laptops até US$ 1.000 cada":
*"Não criei a requisição: nenhum laptop do catálogo sai por até US$ 1.000. O mais barato é o Lenovo Yoga 920, a US$ 1.099,99."*

## Como funciona

```text
navegador ──:8080──► chat (React, servido por nginx)
                        │ /api
                        ▼
                     backend (Fastify) ──────────────► OpenRouter (LLM)
                        │ MCP por HTTP
                        ▼
                     mcp-server ─────────────────────► DummyJSON
                        │ criar_requisicao
                        ▼
                     Postgres ◄── o mcp-server cria as tabelas no boot; o backend lista as requisições
```

1. O chat manda o pedido para `POST /api/requisicoes`.
2. O backend entrega ao modelo o pedido, o prompt e as ferramentas que leu do servidor MCP.
3. O modelo pede uma ferramenta, o backend executa no MCP e devolve o resultado. Isso se repete até o modelo responder, com no máximo 8 voltas.
4. Se achou o que atende, o modelo chama `criar_requisicao`. O servidor MCP confere preço, estoque e pedido mínimo na fonte, aplica a política de compras da tabela e grava numa transação.
5. O backend devolve a requisição lida do banco, a mensagem do modelo e as ferramentas chamadas.

Não existe fluxo fixo no código: quem decide a próxima ferramenta é o modelo. É isso que separa um
agente de um bot de roteiro.

| Ferramenta do MCP | Recebe | Devolve |
|---|---|---|
| `buscar_produtos` | `termo`, em inglês e no singular | id, título, preço, estoque, pedido mínimo, categoria e marca de cada produto |
| `detalhar_produto` | `id` | o produto completo, com garantia e prazo de envio |
| `criar_requisicao` | itens (`produto_id`, `quantidade`, teto opcional) e justificativa | número, itens, total e status. **Não recebe preço** |
| `consultar_politica` | `categoria`, opcional | as regras que valem: categoria permitida, teto, quantidade máxima e alçada |

| Rota | Faz |
|---|---|
| `POST /api/requisicoes` | Roda o agente: `201` criada, `200` não atendida, `503` serviço fora. Aceita `Idempotency-Key` |
| `GET /api/requisicoes` | Lista as requisições com os itens |
| `GET /api/requisicoes/{id}` | Uma requisição |
| `GET /api/atendimentos/{id}` | Trilha do atendimento: ferramentas, argumentos, tempos, tokens e custo |
| `GET /api/metricas` | Volume, taxa de atendidas, falhas, tempo p50/p95 e custo médio |
| `GET /api/politica` · `PUT /api/politica` · `PUT /api/politica/categorias/{categoria}` | Lê e altera a política de compras. Vale no pedido seguinte, sem reiniciar |
| `GET /api/health` | Estado do banco, do MCP e da chave do LLM |

## Decisões principais

1. **O LLM decide, o código garante.** O modelo escolhe as ferramentas e os produtos. Preço, total, estoque, pedido mínimo e alçada são conferidos em código.
2. **`criar_requisicao` não recebe preço.** Recebe só `produto_id` e quantidade. O servidor MCP busca o preço na DummyJSON, valida e grava, então preço inventado não tem por onde entrar.
3. **Olhar o dado antes de escrever o prompt.** A busca da DummyJSON só acha em inglês e no singular (`laptops` volta vazio) e traz ruído (`monitor` devolve uma panela). Além disso, 156 de 194 produtos têm pedido mínimo. O prompt e as validações nasceram disso.
4. **Menor preço que atende**, com desempate pela avaliação. É o critério padrão de compras, e o pedido pode pedir outro ("o melhor", "da Dell").
5. **TypeScript nos três serviços e sem framework de agente.** Usa o SDK oficial do MCP, tem os mesmos schemas nas três pontas e um laço de tool calling curto o bastante para ler inteiro.
6. **MCP por Streamable HTTP**, porque o servidor roda em outro container e stdio não atravessa container. O servidor é stateless.
7. **Erro tem código, não só texto.** O chat mostra a mensagem certa para cada falha sem depender do que o modelo escreveu.
8. **Instrumentado desde o começo.** Cada atendimento grava as ferramentas chamadas, os tempos, os tokens e o custo, e `/api/metricas` resume.
9. **Uma porta só.** O nginx serve o chat e repassa `/api` e `/mcp`. Backend e Postgres não ficam expostos, então não brigam com o que já roda na máquina.
10. **Modelo:** `anthropic/claude-haiku-5.5` (barato, rápido e bom em ferramentas), com `deepseek/deepseek-v4.1-flash` de reserva, os dois pela OpenRouter e por variável de ambiente. A avaliação compara os dois.
11. **Regra de negócio em tabela, infraestrutura no `.env`.** Alçada, teto, quantidade máxima e categoria bloqueada são decisão de quem compra e mudam sem deploy, numa tabela do mesmo Postgres, com histórico gravado por trigger. Chave, modelo e URLs ficam no `.env`.

## Quando algo falha

| Situação | O que o chat mostra | HTTP |
|---|---|---|
| Nada do catálogo atende | O que faltou: preço mais baixo encontrado, pedido mínimo, estoque | `200`, `nao_atendida` |
| Pedido fora da política (categoria bloqueada, acima do teto ou da quantidade máxima) | A regra que barrou e o motivo cadastrado | `200`, `nao_atendida` |
| Total acima da alçada | A requisição é criada com o selo "Em aprovação" e a regra que a levou para lá | `201`, `em_aprovacao` |
| DummyJSON fora ou lenta (5 s, com uma nova tentativa) | "O catálogo de produtos não respondeu. Tente de novo em instantes." | `503`, `CATALOGO_INDISPONIVEL` |
| Chave da OpenRouter inválida ou vencida | "A chave do modelo de IA é inválida ou venceu. Troque `OPENROUTER_API_KEY` no `.env`." | `503`, `LLM_CHAVE_INVALIDA` |
| OpenRouter com limite de taxa ou fora | Nova tentativa respeitando `Retry-After`, depois o modelo de reserva; se nada responder, mensagem clara | `503`, `LLM_INDISPONIVEL` |
| Servidor MCP fora | "O serviço de catálogo está fora do ar." | `503`, `MCP_INDISPONIVEL` |
| Pedido vazio ou longo demais | Aviso na própria tela | `400`, `PEDIDO_INVALIDO` |
| Mesmo pedido reenviado (duplo clique, retry) | A mesma requisição, sem duplicar | `200`, via `Idempotency-Key` |

## Testes

```bash
docker compose run --rm testes
```

Roda lint, checagem de tipos e testes sem chave de LLM e sem internet. A DummyJSON é simulada e o LLM
é um roteiro falso.

- **Cada ferramenta do MCP:** sucesso, busca vazia, produto inexistente (404), erro 5xx e timeout.
- **Contrato MCP:** um cliente MCP de verdade lista e chama as ferramentas.
- **`criar_requisicao`:** recusa preço acima do teto, falta de estoque e quantidade abaixo do mínimo, soma em centavos e aplica a alçada.
- **Laço do agente:** a ordem das ferramentas segue o que o modelo pede.

## Avaliação do agente

```bash
docker compose run --rm testes npm run avaliar
```

Com o ambiente no ar e a chave no `.env`, manda 6 pedidos ao backend e confere o resultado **no banco**,
não no texto do modelo. Mostra acertos, tempo e custo de cada modelo.

| # | Pedido | Esperado |
|---|---|---|
| 1 | Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada. | Requisição com 3 laptops de até US$ 2.000 |
| 2 | 4 tablets até US$ 700 para os vendedores externos | Requisição com 4 tablets de até US$ 700 |
| 3 | 5 laptops até US$ 1.000 cada | Não atendida: o mais barato custa US$ 1.099,99 |
| 4 | 2 cadeiras para a sala de reunião, até US$ 600 | Não atendida: a única cadeira tem pedido mínimo de 5 |
| 5 | 10 monitores para o time de desenvolvimento | Não atendida: a busca só traz uma panela e um relógio |
| 6 | Preciso de uma moto para as entregas | Não atendida pela política: `motorcycle` está bloqueada, com o motivo |

## Política de compras

As regras de compra ficam em tabelas do Postgres, não no código. Elas são carregadas por migration
quando o ambiente sobe e podem ser alteradas pela API.

| Regra (carga inicial) | Valor |
|---|---|
| Alçada geral | US$ 5.000: acima disso, a requisição espera aprovação |
| Valor máximo por requisição | US$ 20.000 |
| `laptops` | Teto de US$ 2.500 por unidade, até 20 unidades |
| `furniture` | Alçada própria de US$ 2.000 |
| `vehicle`, `motorcycle` | Bloqueadas: "veículo segue o processo de frota" |
| `fragrances`, `beauty`, `skin-care` | Bloqueadas: "fora da política de compras corporativas" |

```bash
curl -s -X PUT http://localhost:8080/api/politica/categorias/laptops \
  -H "content-type: application/json" \
  -d '{"teto_unitario_usd": 1000}'
```

Depois disso, o pedido de exemplo vira "não atendida", sem reiniciar nada. Cada requisição guarda as
regras que valiam na hora, e toda alteração da política fica no histórico (`politica_historico`).

## Configuração

Infraestrutura e segredo ficam no `.env` (modelo em `.env.example`):

| Variável | Padrão | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | (vazia) | Chave da OpenRouter. Sem ela tudo sobe, e o chat avisa que falta a chave |
| `LLM_MODELO` | `anthropic/claude-haiku-5.5` | Modelo principal |
| `LLM_MODELO_RESERVA` | `deepseek/deepseek-v4.1-flash` | Usado se o principal falhar |
| `DUMMYJSON_BASE_URL` | `https://dummyjson.com` | Aponte para um endereço morto para ver o tratamento de falha |
| `DUMMYJSON_TIMEOUT_MS` | `5000` | Tempo máximo de cada chamada ao catálogo |
| `PORTA` | `8080` | Porta do chat na sua máquina |

## Usar o servidor MCP no Claude Code

```bash
claude mcp add --transport http compras http://localhost:8080/mcp
```

O mesmo servidor que o backend usa atende qualquer cliente MCP.

## Estrutura

```text
apps/chat/                chat em React + Vite, servido por nginx
services/mcp-server/      servidor MCP, cliente da DummyJSON e um teste por ferramenta
services/backend/         Fastify: laço do agente, rotas e cliente MCP
packages/shared/          schemas zod, tipos e regras puras (centavos, política)
packages/db/              conexão, migrations e consultas
avaliacao/personas.json   pedidos de teste por persona
scripts/avaliar.ts        roda a avaliação e confere no banco
Dockerfile                um só, com um target por serviço
docker-compose.yml        postgres, mcp-server, backend e chat
```

## Como usei IA

O case libera IA desde que o README diga como. Usei o **Claude Code** (Anthropic), no terminal, como
par de programação:

- **Antes do código:** li com ele o enunciado e os dados reais da DummyJSON. Foi consultando a API que apareceram a busca só no singular, o ruído da busca e o pedido mínimo em 156 de 194 produtos.
- **Plano e desenho:** a IA propôs etapas e alternativas, e eu revisei e decidi o desenho final e as regras de negócio (as travas do `criar_requisicao`, o critério de menor preço e a alçada).
- **Código e testes:** gerados pela IA seguindo as regras do [`CLAUDE.md`](CLAUDE.md) e revisados por mim antes de cada commit.

Os dois arquivos que mostram esse processo ficam no repositório:

- [`PLAN.md`](PLAN.md): o plano que montei com a IA antes do código, com a leitura do contexto, os dados que a IA conferiu nas APIs, as decisões e o registro de cada mudança de rumo.
- [`CLAUDE.md`](CLAUDE.md): o arquivo que o Claude Code lê em toda sessão. Ele mostra o que eu exigi da ferramenta.

## Para produção, eu faria

- Login do cliente (SSO ou OAuth) e isolamento por empresa.
- O catálogo real do cliente no lugar da DummyJSON, por API ou pelo OData do ERP.
- Fila para pedidos em lote, com reprocessamento e fila de erro.
- Alçada vinda da política de compras do cliente, com aprovação avisada por webhook.
- Métricas exportadas (OpenTelemetry), com alerta de taxa de erro e de custo.
- Avaliação contínua com pedidos reais anonimizados, rodando no CI a cada mudança de prompt ou de modelo.

## Se algo der errado

- **Porta 8080 ocupada:** ponha `PORTA=8081` no `.env`.
- **Chave vencida** (a do enunciado vale 7 dias): ponha a sua em `OPENROUTER_API_KEY` e rode `docker compose up -d`.
- **Banco do zero:** `docker compose down -v`.

## Estado

- [x] Desenho do projeto (este README), plano por etapas (`PLAN.md`), regras do repositório (`CLAUDE.md`) e configuração base
- [x] Esqueleto do monorepo (workspaces, TypeScript, Biome, Vitest)
- [x] Servidor MCP com `buscar_produtos` e `detalhar_produto`, com testes
- [ ] Postgres com migrations e `criar_requisicao` com as travas
- [ ] Política de compras em tabela, com histórico e `consultar_politica`
- [ ] Backend com o laço do agente, a trilha de atendimentos e as métricas
- [ ] Chat em React
- [ ] Docker Compose com as quatro peças
- [ ] Avaliação com 6 pedidos, CI e selo de alçada
- [ ] Ensaio em clone limpo e entrega
