[← README](../README.md)

# Arquitetura

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
4. Se achou o que atende, o modelo chama `criar_requisicao`. O servidor MCP confere preço, estoque e pedido mínimo na fonte, aplica a política de compras da tabela e grava numa transação. Também confere o teto em dólar que a pessoa escreveu no pedido, lido do banco e não do argumento do modelo, e grava no máximo uma requisição por atendimento.
5. O backend devolve a requisição lida do banco, a mensagem do modelo e as ferramentas chamadas.

Não existe fluxo fixo no código: quem decide a próxima ferramenta é o modelo. É isso que separa um
agente de um bot de roteiro.

## Ferramentas do servidor MCP

| Ferramenta do MCP | Recebe | Devolve |
|---|---|---|
| `buscar_produtos` | `termo`, em inglês e no singular | id, título, preço, estoque, pedido mínimo, categoria e marca de cada produto |
| `detalhar_produto` | `id` | o produto completo, com garantia e prazo de envio |
| `criar_requisicao` | itens (`produto_id`, `quantidade`, teto opcional) e justificativa | número, itens, total e status. **Não recebe preço** |
| `consultar_politica` | `categoria`, opcional | as regras que valem: categoria permitida, teto, quantidade máxima e alçada |

Cada descrição de ferramenta segue o mesmo padrão: o que faz, quando chamar e quando não chamar.
Os códigos ficam em `services/mcp-server/src/ferramentas/`.

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

## Usar o servidor MCP no Claude Code

```bash
claude mcp add --transport http compras http://localhost:8080/mcp
```

O mesmo servidor que o backend usa atende qualquer cliente MCP.
