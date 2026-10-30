# Plano · agente de compras

> Plano por etapas que montei com o Claude Code em 30/10/2026, antes da primeira linha de código.
> Fica no repositório para mostrar como trabalho com IA: contexto primeiro, dado real antes do prompt,
> decisões explícitas com o motivo e etapas pequenas, cada uma virando commit.
> Entrega: `.zip` com `.git` até **terça 03/11/2026, de manhã**. Meta: enviar na **segunda 02/11 à noite**.

## Como este plano foi feito

1. Passei à IA o enunciado do case, o anúncio da vaga e uma pesquisa pública sobre o Mercado Eletrônico (site, blog e portal do desenvolvedor).
2. Pedi um plano por etapas que validasse desempenho, qualidade de código e escolha de linguagem, com extras além do pedido.
3. Antes de decidir, a IA consultou as APIs de verdade: a DummyJSON (busca, categorias, estoque, pedido mínimo, 404 e `?delay=`) e a lista de modelos da OpenRouter (suporte a ferramentas e preço). As armadilhas da seção 2 saíram dessas consultas, não de suposição.
4. Eu reviso e decido. Toda mudança de rumo entra na seção 10, com data e motivo.

---

## 1. Leitura do contexto (vaga, empresa e case)

O case diz: *"olhamos menos para a sofisticação do agente e mais para como você integra, organiza,
documenta e explica suas decisões"*. A vaga e o blog do ME dizem o que "bem integrado" significa:

| Sinal | De onde vem | Como o projeto responde |
|---|---|---|
| Sobe de primeira na máquina de quem avalia (35%) | Critério "Funciona" | Um comando, sem passo manual além da chave; testado num clone limpo |
| "Respostas sem invenção" | Critério "Agente e MCP" | A trava fica no **código**: a ferramenta que grava recalcula o preço na fonte e recusa o que viola orçamento, estoque ou pedido mínimo |
| Tratamento de erro, log, sustentação | Anúncio: "o tratamento de erro, logs e plano de sustentação são parte da entrega" | Timeout, retry, erros com código, log JSON com `request_id` de ponta a ponta |
| Medir volume, acerto, tempo e falha | Anúncio: "instrumentará a solução… prova de valor" | Tabela de atendimentos (trilha de auditoria) + `GET /metricas` + script de avaliação com taxa de acerto |
| Alçada e humano no loop | Post "Sistemas multiagentes em compras" do blog do ME (30/09/2026) | Requisição acima da alçada nasce `aguardando_aprovacao` |
| Integração B2B: auth, webhooks, rate limit, filas | Requisitos da vaga | Idempotency-Key no POST, rate limit, retry com `Retry-After` na OpenRouter |
| Decidir entre automação tradicional e IA | Anúncio | Conta e validação ficam em código; o LLM só interpreta o pedido e escolhe o produto |
| MCP e Claude Code | Diferenciais da vaga; o ME tem servidor MCP próprio ("MCP OData Connect") | Servidor MCP de verdade (Streamable HTTP), que também funciona plugado no Claude Code |

**Tese do projeto:** *o LLM decide, o código garante.* O modelo escolhe quais ferramentas chamar e
quais produtos servem. Preço, total, estoque, pedido mínimo e alçada são verificados por código, que o
modelo não consegue contornar.

---

## 2. O que a pesquisa nos dados reais mostrou (armadilhas da DummyJSON)

Consultado em 30/10/2026:

| Fato | Consequência |
|---|---|
| `search?q=laptop` traz 5 laptops (US$ 1.099,99 a 1.999,99); `q=laptops` e `q=notebook` trazem **0** | A descrição da ferramenta manda buscar em **inglês e no singular**. Resultado vazio volta com uma dica para o modelo tentar outro termo |
| A busca é textual e traz ruído: `q=monitor` devolve "Silver Pot With Glass Cap" e "Apple Watch" | O prompt proíbe escolher item que não é o pedido. É o caso clássico de "não inventa" |
| **156 de 194 produtos têm `minimumOrderQuantity` > 1** (ex.: a única cadeira tem mínimo 5; o iPad Mini tem mínimo 3) | Quantidade abaixo do mínimo é motivo de não atender, e isso é validado no código |
| 13 produtos com estoque < 5 (4 zerados) | O estoque é validado no código antes de gravar |
| Preço em **USD**, com centavos | Dinheiro em `numeric(12,2)` no Postgres e cálculo em centavos (inteiro) no código, nunca float |
| `?delay=3000` atrasa a resposta; id inexistente dá 404 | Permite testar timeout e "produto não encontrado" de verdade |

---

## 3. Decisões de stack

| Decisão | Por quê |
|---|---|
| **TypeScript nos três serviços** (MCP, backend, chat) | O SDK oficial do MCP mais maduro é o de TypeScript. O chat já é React/TS. Uma linguagem só permite um pacote `shared` com os mesmos tipos e schemas nas três pontas. E é a linguagem que eu domino (JavaScript), enquanto Python é básico para mim |
| **Node 22 LTS**, monorepo com **npm workspaces** | Sem ferramenta extra (nada de turbo/nx) para quem for rodar |
| **Zod** em toda fronteira | Valida corpo HTTP, argumento de ferramenta, argumento que o LLM manda e resposta da DummyJSON. Os schemas das ferramentas MCP saem dele |
| **Fastify** no backend | Rápido, com validação e log JSON (pino) nativos |
| **SDK `@modelcontextprotocol/sdk`**, transporte **Streamable HTTP** | O MCP roda em container separado, e stdio não atravessa container. O servidor fica stateless |
| **OpenRouter pela API compatível com OpenAI**, com `fetch` e sem framework de agente | O laço de tool calling tem ~80 linhas e fica explicável linha a linha. Um framework esconderia justamente o que o case quer avaliar |
| **Modelo padrão `anthropic/claude-haiku-5.5`** (US$ 0,10/M de entrada, 0,50/M de saída, com tool calling); fallback `deepseek/deepseek-v4.1-flash` pelo parâmetro `models` da OpenRouter | Barato, rápido e bom em ferramenta. O fallback cobre a queda de um provedor. Os dois ficam em variável de ambiente e o script de avaliação compara os dois, como já faço no trabalho atual com Claude e DeepSeek |
| **Postgres 17**, migrations SQL versionadas, rodadas pelo backend no boot (tabela `schema_migrations`) | "Tabelas criadas automaticamente" mesmo com volume já existente. O `docker-entrypoint-initdb.d` só roda com volume vazio |
| **React + Vite**, servido por **nginx**, que também faz proxy de `/api` e `/mcp` | Uma porta só (`http://localhost:8080`), sem CORS e sem URL de backend embutida no build |
| **Vitest** nos testes, **Biome** de lint e formatação | Um binário só para lint e formatação, rápido no CI |
| `temperature: 0` e no máximo 8 voltas no laço | Resposta estável, e a rodada não fica presa em loop |

**Idioma do código:** termos do domínio em português, como o case e o ME usam (`requisicao`,
`buscar_produtos`, `valor_total`, `alcada`). O técnico fica em inglês (`server`, `handler`, `retry`).
README e commits em português.

---

## 4. Arquitetura

```
apps/chat (React)  ──/api──►  services/backend (Fastify)  ──MCP/HTTP──►  services/mcp-server  ──►  DummyJSON
   nginx :8080                   │  laço do agente                           │  buscar_produtos
                                 │  OpenRouter (LLM)                         │  detalhar_produto
                                 │  migrations, GET /requisicoes             │  criar_requisicao ──┐
                                 ▼                                           ▼                     │
                              Postgres ◄──────────────────────────────────────────────────────────┘
packages/shared: schemas zod e tipos usados pelos três
```

### Ferramentas do MCP

| Ferramenta | Entrada | Saída (estruturada) | Regras |
|---|---|---|---|
| `buscar_produtos` | `termo` (inglês, singular), `limite?` | lista enxuta: `id, titulo, preco, estoque, pedido_minimo, disponibilidade, categoria, marca` | Usa `select=` da DummyJSON e devolve só os campos úteis, o que corta tokens. Vazio volta com `dica`. Cache de 60 s |
| `detalhar_produto` | `id` | produto completo: garantia, prazo de envio, avaliação | 404 vira erro `PRODUTO_NAO_ENCONTRADO` |
| `criar_requisicao` (diferencial) | `itens: [{produto_id, quantidade, preco_maximo_unitario?}]`, `solicitante?`, `justificativa` | número da requisição, itens, total, status | **Não recebe preço.** Busca cada produto na DummyJSON, confere estoque, pedido mínimo e teto de preço, calcula o total em centavos e grava numa transação. Se algo viola, recusa com o motivo, e o modelo tem de dizer o que falta |

- Todas declaram `outputSchema` e devolvem `structuredContent`. As de leitura levam `readOnlyHint: true`.
- Erro de ferramenta volta como `isError: true` com `codigo`: `CATALOGO_INDISPONIVEL`, `CATALOGO_LENTO`,
  `PRODUTO_NAO_ENCONTRADO`, `REGRA_VIOLADA`. O backend usa o código para a mensagem do chat; não depende do texto do modelo.
- Chamada à DummyJSON com `AbortSignal.timeout(5000)` e um retry com espera em 5xx ou timeout (só GET, que é idempotente).

### Backend (pelo nginx, as rotas ficam sob `/api`)

| Rota | Faz |
|---|---|
| `POST /requisicoes` | `{ pedido, solicitante? }` → roda o agente → `201` com requisição, `200` com `nao_atendida` e o que falta, `503` com catálogo fora. Aceita `Idempotency-Key` |
| `GET /requisicoes` | Lista paginada (`?limite&cursor`) com itens |
| `GET /requisicoes/:id` | Uma requisição |
| `GET /atendimentos/:id` | Trilha de auditoria: ferramentas chamadas, argumentos, tempo de cada uma, tokens, custo, modelo |
| `GET /metricas` | Volume, % atendidas, % não atendidas, % erro, tempo p50/p95, custo médio |
| `GET /health` | Banco, MCP e LLM (`sem_chave` se faltar a chave) |

### Banco

```
requisicoes        (id, numero 'REQ-000123', solicitante, pedido_original, status, valor_total numeric(12,2),
                    moeda 'USD', atendimento_id, criado_em)
requisicao_itens   (id, requisicao_id fk, produto_id, titulo, preco_unitario, quantidade, subtotal)
atendimentos       (id, pedido, resultado, modelo, tokens_entrada, tokens_saida, custo_usd,
                    duracao_ms, chamadas jsonb, erro, idempotency_key unique, criado_em)
```

`status` aceita `aberta` ou `aguardando_aprovacao` (acima de `ALCADA_USD`, padrão 5.000). Preço e
título são copiados para o item no momento da compra, porque o catálogo pode mudar depois.

---

## 5. Etapas (cada etapa = um ou mais commits)

Os commits seguem o padrão `tipo: o que mudou`, em português (`feat:`, `test:`, `fix:`, `docs:`, `ci:`).
O histórico vai junto na entrega, então os commits são pequenos e na ordem em que o projeto nasce.

### Etapa 0 · Ambiente (sex 30/10)
1. Instalar o **Docker Desktop** (a máquina de desenvolvimento ainda não tem) e conferir `docker compose version`.
2. Conferir o Node 22 (local está 20.20.2; nos containers vai `node:22-alpine`).
3. `git init`, `.gitattributes` com `* text=auto eol=lf` (**crítico no Windows**: script com CRLF quebra dentro do container Linux), `.gitignore`, `.env.example`.
- Feito em 30/10/2026: repo privado no GitHub, com `README.md` (desenho do projeto e checklist "Estado"), `CLAUDE.md`, este plano, `.gitignore`, `.gitattributes` e `.env.example`. O enunciado (`case/`) fica fora do git porque traz a chave da OpenRouter.
- Falta: Docker Desktop e o esqueleto do monorepo (`package.json` com workspaces, `tsconfig`, Biome), que entra no commit `chore: esqueleto do monorepo`.

### Etapa 1 · Servidor MCP e testes (sex à noite / sáb de manhã)
1. `packages/shared`: schemas zod de produto, item e requisição.
2. Cliente da DummyJSON com timeout, retry, cache e mapeamento de erro.
3. `buscar_produtos` e `detalhar_produto` no SDK, por Streamable HTTP em `/mcp`.
4. Testes, **sem chave de LLM**:
   - unidade de cada ferramenta com a DummyJSON simulada (`undici` MockAgent): sucesso, vazio, 404, 5xx, timeout;
   - contrato: um cliente MCP real conectado ao servidor em memória (`InMemoryTransport`) lista as ferramentas e chama cada uma.
- Commits: `feat: cliente da DummyJSON com timeout e retry` → `feat: servidor MCP com buscar_produtos e detalhar_produto` → `test: testes das ferramentas do MCP sem LLM`

### Etapa 2 · Banco e `criar_requisicao` (sáb)
1. Migrations SQL (`001_requisicoes.sql`, `002_atendimentos.sql`) e o migrador do boot.
2. `criar_requisicao` com as travas (preço da fonte, estoque, mínimo, teto, alçada) numa transação.
3. Testes da ferramenta com Postgres de verdade (container no CI e o do compose local), incluindo a recusa de cada regra.
- Commits: `feat: migrations do Postgres` → `feat: criar_requisicao com validação de preço, estoque e pedido mínimo`

### Etapa 3 · Backend e agente (sáb à tarde / dom)
1. Cliente MCP no backend (lista as ferramentas no boot e reconecta se o MCP cair).
2. Laço do agente: manda o pedido e as ferramentas → executa o que o modelo pedir (em paralelo, se ele pedir várias) → devolve o resultado → repete até a resposta final ou o limite de voltas.
3. Prompt de sistema em `services/backend/src/agente/prompt.md` (versionado e legível):
   - busque em inglês e no singular;
   - só escolha produto que é o que foi pedido;
   - nunca informe preço que não veio de ferramenta;
   - respeite quantidade, teto e pedido mínimo;
   - entre os que atendem, escolha o de menor preço, com desempate pela avaliação, salvo se o pedido pedir outro critério;
   - se nada atender, não chame `criar_requisicao`; diga o que falta (mais barato encontrado, mínimo exigido, estoque);
   - responda em português.
4. Rotas, trilha de auditoria por atendimento, `Idempotency-Key`, rate limit (`@fastify/rate-limit`), erro da OpenRouter tratado: 401 = "chave inválida ou expirada, troque no `.env`", 429 = retry com `Retry-After`, timeout total de 60 s.
5. Teste do laço com um **LLM falso roteirizado**: prova que o código não tem fluxo fixo, porque a ordem das ferramentas muda conforme o roteiro.
- Commits: `feat: laço do agente com OpenRouter e ferramentas do MCP` → `feat: rotas de requisições e trilha de atendimentos` → `test: laço do agente com LLM falso`

### Etapa 4 · Chat (dom)
1. Uma tela só: caixa de pedido, histórico da sessão e um cartão da requisição com número, itens, quantidade, preço unitário, subtotal e total.
2. O cartão é montado com os **dados do banco** que o backend devolveu, não com o texto do modelo.
3. Mostra as ferramentas chamadas (diferencial): chips "buscar_produtos('laptop') · 412 ms".
4. Estados claros: carregando ("consultando o catálogo…"), não atendida (o que falta), catálogo fora, chave expirada.
5. Lista das requisições salvas (`GET /requisicoes`) numa aba.
- Commit: `feat: chat em React com cartão da requisição e ferramentas chamadas`

### Etapa 5 · Docker (dom)
1. Dockerfile multi-stage por serviço, usuário não-root, `npm ci`, imagem final só com o build.
2. `docker-compose.yml`:
   - `healthcheck` em todos;
   - `depends_on: condition: service_healthy`;
   - volume do Postgres;
   - só a porta do chat exposta (`${PORTA:-8080}`), com o nginx repassando `/api` e `/mcp`;
   - serviço `testes` (target de teste do Dockerfile, com as dependências de desenvolvimento) para `docker compose run --rm testes` e `npm run avaliar`;
   - chave lida do `.env`. O backend sobe mesmo sem chave e responde de forma clara, porque os testes rodam sem chave.
3. Imagens públicas multi-arquitetura (funciona também em Mac com Apple Silicon).
- Commit: `feat: docker compose com as quatro peças e healthchecks`

### Etapa 6 · Avaliação, CI e extras (dom à noite / seg)
1. `scripts/avaliar.ts`: os pedidos abaixo, contra o ambiente no ar, com conferência **automática no banco** (não no texto). Imprime acerto, tempo e custo por modelo.

   | # | Pedido | Esperado (dados de 30/10) |
   |---|---|---|
   | 1 | "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada." | Requisição com 3 un., categoria laptops, todos ≤ 2.000 |
   | 2 | "4 tablets até US$ 700 para os vendedores externos" | Requisição com 4 un. (Galaxy Tab S8 Plus US$ 599,99 ou iPad Mini, mínimo 3) |
   | 3 | "5 laptops até US$ 1.000 cada" | Não atendida, e cita o mais barato (US$ 1.099,99) |
   | 4 | "2 cadeiras para a sala de reunião, até US$ 600" | Não atendida por pedido mínimo (a única cadeira exige 5) |
   | 5 | "10 monitores para o time de desenvolvimento" | Não atendida. A busca traz panela e relógio, e o agente não pode escolher |
   | extra | Qualquer pedido com `DUMMYJSON_BASE_URL` apontando para um endereço morto | `503` e mensagem clara no chat |

   Antes de fechar, reconferir os dados na DummyJSON, porque ela pode mudar.
2. GitHub Actions: Biome, typecheck, testes (com serviço Postgres) e `docker compose build`. O workflow roda a cada push e vai junto no zip.
3. Alçada (`ALCADA_USD`) com o selo "aguardando aprovação" no chat.
- Commits: `feat: script de avaliação com 5 pedidos` → `ci: lint, typecheck, testes e build` → `feat: alçada de aprovação por valor`

### Etapa 7 · README, decisões e ensaio (seg 02/11)
1. README revisado: comandos conferidos, exemplos trocados por saída real e a seção "Estado" retirada.
2. `docs/decisoes.md`: uma linha de contexto, decisão e alternativa descartada para cada escolha da seção 3.
3. GIF curto do pedido de exemplo no README.
4. Seção **"Como usei IA"** honesta (exigência do case), com os casos reais de correção registrados em `docs/uso-de-ia.md`.
5. "Plugar no Claude Code": o nginx também repassa `/mcp` ao servidor MCP, e `claude mcp add --transport http compras http://localhost:8080/mcp` funciona. Mostra que o servidor MCP é reutilizável fora deste backend.
6. **Ensaio de máquina limpa:** `git clone` para uma pasta temporária, `docker compose down -v`, `docker compose up --build`, pedido de exemplo e `docker compose run --rm testes`. Se falhar aqui, falharia na máquina de quem avalia (35%).
7. Zipar o clone limpo do passo 6, que já vem com `.git` e sem `.env`, `node_modules` e `case/`. Conferir que a chave não aparece no histórico (`git log -p --all | grep -E "sk-or-v1-[0-9a-f]{20}"`).

---

## 6. Metas de desempenho e como validar

| O quê | Meta | Como medir |
|---|---|---|
| `POST /requisicoes` (pedido de exemplo) | p50 < 8 s, p95 < 15 s | `scripts/avaliar.ts` (5 rodadas por pedido) |
| Ferramenta MCP com cache quente | < 10 ms | log `duracao_ms` por chamada |
| Ferramenta MCP com a DummyJSON | p95 < 1,5 s; corta em 5 s | log e teste com `?delay=` |
| Tokens por atendimento | < 6 mil de entrada | `atendimentos.tokens_entrada` (a busca enxuta é o que segura isso) |
| Custo por pedido | < US$ 0,002 com Haiku 5.5 | `atendimentos.custo_usd` (`usage` da OpenRouter) |
| `docker compose up --build` do zero | < 3 min | ensaio da etapa 7 |
| Bundle do chat | < 200 KB gzip | saída do `vite build` |
| Imagens | backend e MCP < 200 MB; chat < 50 MB | `docker images` |

---

## 7. Qualidade de código

- TypeScript `strict`, sem `any`, sem `// @ts-ignore`.
- Toda entrada externa passa por zod: HTTP, argumento do LLM, resposta da DummyJSON e linha do banco.
- Erros tipados com `codigo`, convertidos em HTTP num lugar só.
- Configuração só por variável de ambiente, validada no boot com zod. Falta de variável obrigatória derruba com mensagem clara.
- Log JSON com `request_id` gerado no backend e repassado ao MCP no header. Um pedido é seguido de ponta a ponta com um `grep`.
- Nada de segredo em código ou no git. `.env.example` documenta cada variável.
- Funções pequenas, um arquivo por responsabilidade, sem comentário óbvio.

---

## 8. Além do pedido, em ordem de prioridade

| # | Extra | Ligação com a vaga e a empresa | Custo |
|---|---|---|---|
| 1 | `criar_requisicao` com as travas no código | É o diferencial do case, feito do jeito certo: o agente decide quando gravar, mas não consegue gravar preço inventado | médio |
| 2 | Trilha de auditoria + `/metricas` | É o "instrumentará… volume, taxa de acerto, tempo, falhas" do anúncio, e a "trilha de auditoria" do blog do ME | médio |
| 3 | Script de avaliação com conferência no banco, comparando 2 modelos | Prova de valor com número, e decisão de modelo baseada em dado | baixo |
| 4 | Ferramentas chamadas no chat | Diferencial do case, e prova visual de que o modelo decide | baixo |
| 5 | Alçada por valor (`aguardando_aprovacao`) | Segue o post do ME sobre multiagentes (alçada e humano no loop) | baixo |
| 6 | Idempotency-Key + rate limit + retry com `Retry-After` | Os três itens de "integração B2B" do requisito da vaga | baixo |
| 7 | CI | Diferencial do case | baixo |
| 8 | MCP plugável no Claude Code | Liga com o "MCP OData Connect" do ME e com o diferencial "MCP, Claude Code" da vaga | quase zero (só README) |
| 9 | Pergunta de esclarecimento: pedido sem quantidade ou sem teto faz o agente perguntar em vez de supor (com `conversa_id`) | "Não inventa" levado ao pé da letra | médio, só se sobrar tempo |
| 10 | Webhook de saída `requisicao.criada` com assinatura HMAC e retry | O ME tem 30+ eventos de webhook, e o FDE integra com o ERP do cliente | médio, só se sobrar tempo |

**Fora de propósito:** autenticação de usuário, multi-tenant e fila de mensagens. Ficam no README,
na seção "Para produção, eu faria", com uma linha cada, sem gastar o prazo.

---

## 9. Cuidados

- **A chave da OpenRouter expira por volta de 06/11.** O README explica como trocar por outra em `OPENROUTER_API_KEY`.
- `case/` e `.env` ficam fora do git (já no `.gitignore`).
- Se o tempo apertar, a ordem de corte é a do fim para o começo da seção 8. O núcleo (etapas 1 a 5 e o README) não se corta.

---

## 10. Registro de mudanças

| Data | Mudança | Motivo |
|---|---|---|
| 30/10/2026 | Plano criado, antes de qualquer código | Fechar o desenho antes de gastar o prazo em código |
| 30/10/2026 | README e `CLAUDE.md` escritos antes do código | O README vira a especificação, com o checklist "Estado" atualizado a cada etapa; o `CLAUDE.md` fixa as regras para toda sessão com a IA |
| 30/10/2026 | O plano passou a ser versionado (antes ficava só na máquina) | Mostrar na entrega como o trabalho com IA foi conduzido |
