# Agente de compras

A pessoa escreve no chat o que precisa comprar. Um agente de IA consulta o catálogo por um servidor
MCP, escolhe os itens e grava uma requisição de compra no Postgres, sem inventar produto nem preço.

Case técnico do processo seletivo de **AI Forward Deployed Engineer** do Mercado Eletrônico.

```text
você    Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.

agente  buscar_produtos("laptop")                               5 resultados · 848 ms
        consultar_politica("laptops")                                       53 ms
        criar_requisicao([{ produto_id: 81, quantidade: 3 }])               286 ms

        Requisição REQ-000001 · aprovada
        3 × Lenovo Yoga 920          US$ 1.099,99          US$ 3.299,97
                                     Total                 US$ 3.299,97
```

![Chat com o pedido de exemplo: os passos do agente, a resposta e o cartão da requisição lido do banco](docs/imagens/chat-pedido-exemplo.png)

## Rodar

Pré-requisito: Docker com Compose v2. Nada mais na máquina.

1. Copie a configuração: `cp .env.example .env`
2. Abra o `.env` e preencha `OPENROUTER_API_KEY`.
3. Suba as quatro peças (postgres, mcp-server, backend e chat): `docker compose up --build`
4. Abra **http://localhost:8080** e escreva o pedido. O botão **Detalhes técnicos**, no alto da conversa,
   mostra cada ferramenta chamada com argumentos, tempo, tokens e custo.

Com um agente de IA (Claude Code, Codex, Cursor): abra o repositório e peça **"siga o INSTALAR.md"**.
O [`INSTALAR.md`](INSTALAR.md) é um prompt que instala, sobe e testa o projeto passo a passo.

Pela API, a rota do enunciado responde direto:

```bash
curl -s http://localhost:8080/requisicoes -H "content-type: application/json" \
  -d '{"pedido": "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada."}'
```

A resposta traz a requisição lida do banco, a mensagem do modelo e as ferramentas que ele chamou
([exemplo real e as outras rotas](docs/api.md)). Se nada atende, nada é gravado e a resposta diz o que
faltou: *"Não criei a requisição: nenhum laptop do catálogo fica até US$ 1.000 por unidade. O mais barato
é o Lenovo Yoga 920, a US$ 1.099,99, com 40 em estoque."*

## Como funciona

O chat manda o pedido ao backend. O backend entrega ao modelo o pedido, o prompt e as ferramentas que
leu do servidor MCP, executa no MCP cada ferramenta que o modelo pede e devolve o resultado, até o
modelo responder (no máximo 8 voltas). Não existe fluxo fixo no código: quem decide a próxima ferramenta
é o modelo. Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

| Ferramenta do MCP | O que faz |
|---|---|
| `buscar_produtos` | Busca no catálogo e devolve preço, estoque, pedido mínimo e categoria |
| `detalhar_produto` | Devolve o produto completo, com garantia e prazo de envio |
| `consultar_politica` | Devolve as regras de compra que valem: categoria bloqueada, teto, quantidade máxima e alçada |
| `criar_requisicao` | Grava a requisição. **Não recebe preço:** lê na fonte, aplica a política e grava numa transação |

## Decisões principais

1. **O LLM decide, o código garante.** O modelo escolhe ferramentas e produtos. Preço, total, estoque, pedido mínimo e alçada são conferidos em código, e o número que a pessoa vê sai do banco.
2. **Olhei o dado antes de escrever o prompt.** A busca da DummyJSON só acha em inglês e no singular e traz ruído (`monitor` devolve uma panela), e 156 de 194 produtos têm pedido mínimo. O prompt e as travas nasceram disso.
3. **Política de compras em tabela, não no código.** Alçada, teto por unidade, quantidade máxima e categoria bloqueada mudam pela API, valem no pedido seguinte e têm histórico por trigger ([docs/politica.md](docs/politica.md)).
4. **Sem framework de agente.** O laço de tool calling é curto o bastante para ler inteiro (`services/backend/src/agente/laco.ts`), com o SDK oficial do MCP por Streamable HTTP.
5. **Erro tem código, não só texto.** O chat explica cada falha (catálogo fora, chave inválida, MCP fora) sem depender do modelo ([docs/falhas.md](docs/falhas.md)).
6. **Instrumentado.** Cada atendimento grava ferramentas, argumentos, tempos, tokens e custo (`GET /api/atendimentos/{id}`), e `/api/metricas` resume.
7. **Modelo `anthropic/claude-haiku-5.5`**, com `deepseek/deepseek-v4.1-flash` de reserva, os dois pela OpenRouter e por variável de ambiente.

Todas as escolhas, com o que ficou de fora: [docs/decisoes.md](docs/decisoes.md).

## Testes e avaliação

```bash
docker compose run --rm --build testes                    # lint, tipos e 92 testes, sem chave de LLM e sem internet
docker compose run --rm --build testes npm run avaliar    # 6 pedidos de personas, conferidos no banco
```

Na avaliação real de 01/11/2026 com o Haiku 5.5: **6 de 6 acertos**, tempo p50 de 7,7 s e p95 de
12,9 s, US$ 0,0015 por pedido ([docs/avaliacao.md](docs/avaliacao.md)). O CI roda lint, tipos, testes
com Postgres e o build das imagens a cada push.

## Como usei IA

O case libera IA desde que o README diga como. Usei o **Claude Code** (Anthropic), no terminal, como
par de programação:

- **Antes do código:** li com ele o enunciado e os dados reais da DummyJSON, e montamos o [`PLAN.md`](PLAN.md): etapas, decisões e um registro datado de cada mudança de rumo.
- **Desenho:** as telas foram desenhadas antes do código, no padrão visual do ME ([o desenho](docs/imagens/desenho-antes-do-codigo.png) e o [print real](docs/imagens/chat-pedido-exemplo.png)).
- **Código e testes:** gerados pela IA seguindo as regras do [`CLAUDE.md`](CLAUDE.md), o arquivo que ela lê em toda sessão, e revisados por mim antes de cada commit.
- **Teste como gente:** além dos testes automáticos, testei à mão e pus um subagente no papel de uma compradora inventada. Eles acharam erros que nenhum teste cobria.

Os erros que a IA cometeu e como foram pegos estão em [docs/uso-de-ia.md](docs/uso-de-ia.md).

## Para produção, eu faria

- Login do cliente (SSO ou OAuth) e isolamento por empresa.
- O catálogo real do cliente no lugar da DummyJSON, por API ou pelo OData do ERP.
- Aprovar e reprovar com motivo, alçada por solicitante e aviso por webhook.
- Fila para pedidos em lote, com reprocessamento e fila de erro.
- Métricas exportadas (OpenTelemetry), com alerta de taxa de erro e de custo.
- Avaliação contínua no CI a cada mudança de prompt ou de modelo.

## Se algo der errado

- **Porta 8080 ocupada:** ponha `PORTA=8081` no `.env`.
- **O chat diz que a chave é inválida, venceu ou está sem crédito:** ponha outra em `OPENROUTER_API_KEY` e rode `docker compose up -d`.
- **Banco do zero:** `docker compose down -v`.

Variáveis e padrões: [docs/configuracao.md](docs/configuracao.md).

## Estado

- [x] Desenho do projeto (este README), plano por etapas (`PLAN.md`), regras do repositório (`CLAUDE.md`) e configuração base
- [x] Esqueleto do monorepo (workspaces, TypeScript, Biome, Vitest)
- [x] Servidor MCP com `buscar_produtos` e `detalhar_produto`, com testes
- [x] Postgres com migrations e `criar_requisicao` com as travas
- [x] Política de compras em tabela, com histórico e `consultar_politica`
- [x] Backend com o laço do agente, a trilha de atendimentos e as métricas
- [x] Chat em React
- [x] Docker Compose com as quatro peças
- [x] Avaliação com 6 pedidos, CI e selo de alçada
- [ ] Ensaio em clone limpo e entrega
