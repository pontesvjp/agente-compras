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
| Alçada e humano no loop | Post "Sistemas multiagentes em compras" do blog do ME (30/09/2026) | Requisição acima da alçada nasce `em_aprovacao` |
| "Alçada por valor e tipo de compra" e "política de categorias" | Mesmo post do blog do ME | Política de compras em tabela no Postgres (alçada, teto e quantidade por categoria, categoria bloqueada), lida a cada pedido e alterável sem deploy |
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
| **Postgres 17**, migrations SQL versionadas, rodadas pelo mcp-server no boot (tabela `schema_migrations`) | "Tabelas criadas automaticamente" mesmo com volume já existente. O `docker-entrypoint-initdb.d` só roda com volume vazio |
| **React + Vite**, servido por **nginx**, que também faz proxy de `/api` e `/mcp` | Uma porta só (`http://localhost:8080`), sem CORS e sem URL de backend embutida no build |
| **Vitest** nos testes, **Biome** de lint e formatação | Um binário só para lint e formatação, rápido no CI |
| `temperature: 0` e no máximo 8 voltas no laço | Resposta estável, e a rodada não fica presa em loop |
| **Regra de negócio em tabela; `.env` só com infraestrutura e segredo** | Alçada, teto, quantidade máxima e categoria bloqueada são decisão do cliente e mudam sem deploy. Modelo, chave, URL e timeout são do ambiente. Não entra um segundo banco: mais um container é mais uma chance de não subir na máquina de quem avalia |

**Idioma do código:** termos do domínio em português, como o case e o ME usam (`requisicao`,
`buscar_produtos`, `valor_total`, `alcada`). O técnico fica em inglês (`server`, `handler`, `retry`).
README e commits em português.

---

## 4. Arquitetura

```
apps/chat (React)  ──/api──►  services/backend (Fastify)  ──MCP/HTTP──►  services/mcp-server  ──►  DummyJSON
   nginx :8080                   │  laço do agente                           │  buscar_produtos
                                 │  OpenRouter (LLM)                         │  detalhar_produto
                                 │  GET /requisicoes, trilha                 │  criar_requisicao ──┐
                                 ▼                                           ▼                     │
                              Postgres ◄──────────────────────────────────────────────────────────┘
packages/shared: schemas zod, tipos e regras puras · packages/db: conexão, migrador e consultas
```

### Pastas e arquivos

```
agente-compras/
├── apps/chat/                            React + Vite; o nginx serve o build e repassa /api, /requisicoes e /mcp
│   ├── index.html · nginx.conf · vite.config.ts
│   └── src/
│       ├── main.tsx · App.tsx · tokens.css (Eletro DS) · estilos.css
│       ├── api.ts                        chamadas ao backend, validadas com os schemas do packages/shared
│       ├── passos.ts                     mapa ferramenta → frase de quem compra, com os números do resultado
│       ├── formato.ts · turnos.ts        dinheiro e hora em pt-BR; estado de cada pedido da sessão
│       └── componentes/
│           ├── Conversa.tsx · RespostaAgente.tsx
│           ├── CartaoRequisicao.tsx      montado com os dados do banco, nunca com o texto do modelo
│           ├── FerramentasChamadas.tsx   passos em português, ou o painel de "Detalhes técnicos"
│           ├── AlertaErro.tsx            título pelo código do erro, não pelo texto do modelo
│           └── ListaRequisicoes.tsx · Resumo.tsx · Cabecalho.tsx · Icone.tsx
│   └── test/passos.test.ts
├── services/
│   ├── mcp-server/
│   │   ├── src/
│   │   │   ├── index.ts                  sobe o HTTP e o /health
│   │   │   ├── servidor.ts               McpServer + Streamable HTTP em /mcp, stateless
│   │   │   ├── config.ts · erros.ts      variáveis validadas com zod; códigos de erro
│   │   │   ├── dummyjson/
│   │   │   │   ├── cliente.ts            fetch com timeout, retry e cache
│   │   │   │   └── esquemas.ts           zod da resposta da DummyJSON
│   │   │   └── ferramentas/
│   │   │       ├── buscar-produtos.ts
│   │   │       ├── detalhar-produto.ts
│   │   │       ├── criar-requisicao.ts
│   │   │       └── consultar-politica.ts
│   │   └── test/
│   │       ├── fixtures/                 respostas reais da DummyJSON gravadas em 30/10 (teste sem internet)
│   │       ├── dummyjson.test.ts         timeout, 5xx, 404 e retry
│   │       ├── <ferramenta>.test.ts      um por ferramenta, as quatro
│   │       └── contrato.test.ts          cliente MCP de verdade por InMemoryTransport
│   └── backend/
│       ├── src/
│       │   ├── index.ts · servidor.ts    Fastify, rate limit, request_id, erro → HTTP num lugar só
│       │   ├── config.ts · erros.ts      variáveis validadas; código de erro → HTTP num lugar só
│       │   ├── apresentacao.ts           banco (centavos) → API (dólar), num lugar só
│       │   ├── mcp/cliente.ts            uma sessão MCP por atendimento, com os headers de rastreio
│       │   ├── agente/
│       │   │   ├── atender.ts            atendimento de ponta a ponta: trilha, Idempotency-Key, laço, resposta
│       │   │   ├── laco.ts               laço de tool calling: quem decide é o modelo
│       │   │   ├── tipos.ts              contrato do LLM e do executor de ferramentas (o teste troca os dois)
│       │   │   ├── openrouter.ts         chamada, retry com Retry-After, modelo de reserva
│       │   │   └── prompt.md
│       │   └── rotas/                    requisicoes.ts · atendimentos.ts · metricas.ts · politica.ts · health.ts
│       └── test/                         laco.test.ts (LLM falso) · openrouter.test.ts · rotas.test.ts
├── packages/
│   ├── shared/src/                       esquemas.ts · dinheiro.ts (centavos) · politica.ts (regras puras) · api.ts (contrato HTTP)
│   └── db/
│       ├── migrations/                   001_requisicoes · 002_atendimentos · 003_politica_compra (carga + trigger)
│       └── src/                          pool.ts · migrar.ts · requisicoes.ts · politica.ts · atendimentos.ts
├── avaliacao/personas.json               personas e resultado esperado
├── scripts/avaliar.ts                    roda as personas e confere no banco
├── docs/                                 arquitetura · api · politica · falhas · avaliacao · configuracao · decisoes · seguranca · uso-de-ia (.md), imagens/ e mockup/
├── .github/workflows/ci.yml              Biome, typecheck, testes com Postgres e build das imagens
├── Dockerfile                            um só, multi-stage, com os targets mcp-server, backend, chat e testes
├── docker-compose.yml                    postgres, mcp-server, backend e chat; testes só com `run`
├── .dockerignore                         fora do build: .env, case/, node_modules, .git
├── package.json · package-lock.json      workspaces e scripts: lint, typecheck, test, avaliar
├── tsconfig.base.json · tsconfig.json    strict, com project references
├── biome.json · vitest.config.ts
├── .env.example · .gitignore · .gitattributes
├── README.md · CLAUDE.md · PLAN.md
├── INSTALAR.md                           prompt para o agente de IA de quem quiser instalar e rodar o projeto
├── AGENTS.md                             aponta o INSTALAR.md para Codex, Cursor e Copilot (o CLAUDE.md abre com o mesmo aviso)
└── case/                                 enunciado, fora do git
```

### Decisões de estrutura

| Decisão | Por quê |
|---|---|
| **Migrations e consultas em `packages/db`**, com o migrador chamado no boot do mcp-server e protegido por `pg_advisory_lock` | Os dois serviços usam o banco: o MCP grava a requisição, o backend grava o atendimento e lê as listas. O backend já depende do MCP no compose (`service_healthy`), e o MCP só fica saudável depois de migrar, então o backend sobe com as tabelas prontas. A trava do Postgres cobre mais de uma réplica do MCP subindo junto, sem um quinto container |
| **Um Dockerfile na raiz, com um target por serviço** | Num monorepo com workspaces, cada serviço precisa do `packages/` no build de qualquer jeito. Um arquivo só evita repetir a instalação e reaproveita a camada de dependências: o build fica mais rápido na máquina de quem avalia (meta de menos de 3 min) |
| **`.dockerignore` desde o primeiro Dockerfile** | Sem ele, o `.env` com a chave e o `case/` com o PDF entram no contexto do build e podem parar dentro de uma camada da imagem |
| **Regras de política como funções puras em `packages/shared/politica.ts`** | São testadas sem banco. O `criar_requisicao` só busca a política, aplica e grava |
| **Teste por pasta `test/` em cada serviço, com fixtures reais da DummyJSON** | Determinístico e sem internet. O nome do arquivo mostra que cada ferramenta tem o seu teste, como o case exige |
| **Compose com exatamente as quatro peças rodando** (`postgres`, `mcp-server`, `backend`, `chat`) | É o que o case pede. O serviço `testes` só sobe com `docker compose run` |

### Ferramentas do MCP

| Ferramenta | Entrada | Saída (estruturada) | Regras |
|---|---|---|---|
| `buscar_produtos` | `termo` (inglês, singular), `limite?` | lista enxuta: `id, titulo, preco, estoque, pedido_minimo, disponibilidade, categoria, marca` | Usa `select=` da DummyJSON e devolve só os campos úteis, o que corta tokens. Vazio volta com `dica`. Cache de 60 s |
| `detalhar_produto` | `id` | produto completo: garantia, prazo de envio, avaliação | 404 vira erro `PRODUTO_NAO_ENCONTRADO` |
| `criar_requisicao` (diferencial) | `itens: [{produto_id, quantidade, preco_maximo_unitario?}]`, `solicitante?`, `justificativa` | número da requisição, itens, total, status | **Não recebe preço.** Busca cada produto na DummyJSON, confere estoque, pedido mínimo e teto de preço, calcula o total em centavos, aplica a política de compras e grava numa transação. Se algo viola, recusa com o motivo, e o modelo tem de dizer o que falta |
| `consultar_politica` (diferencial) | `categoria?` | regras que valem: categoria permitida ou bloqueada, teto unitário, quantidade máxima, alçada, critério de escolha | Só leitura. Serve para o modelo escolher dentro da regra e explicar a recusa. Quem garante a regra continua sendo o `criar_requisicao` |

- Todas declaram `outputSchema` e devolvem `structuredContent`. As de leitura levam `readOnlyHint: true`.
- A descrição de cada ferramenta segue um padrão fixo: o que faz, **quando chamar**, **quando não chamar** (e qual usar no lugar) e **o que ela não devolve** (ex.: "não devolve preço"). É o que mais pesa em "ferramentas bem definidas".
- Busca vazia volta com uma `dica` ("tente no singular", "notebook -> laptop"), e a descrição da ferramenta já avisa que a busca só acha em inglês e no singular.
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
| `GET /politica` · `PUT /politica` · `PUT /politica/categorias/:categoria` | Lê e altera a política de compras. Vale no pedido seguinte, sem reiniciar nada |
| `GET /health` | Banco, MCP e LLM (`sem_chave` se faltar a chave) |

### Banco

```
requisicoes        (id, numero 'REQ-000123', solicitante, pedido_original, status, valor_total numeric(12,2),
                    moeda 'USD', atendimento_id, criado_em)
requisicao_itens   (id, requisicao_id fk, produto_id, titulo, preco_unitario, quantidade, subtotal)
atendimentos       (id, pedido, resultado, modelo, tokens_entrada, tokens_saida, custo_usd,
                    duracao_ms, chamadas jsonb, erro, idempotency_key unique, criado_em)
politica_compra    (id = 1, criterio_escolha 'menor_preco' | 'melhor_avaliacao', alcada_usd,
                    valor_maximo_requisicao_usd, atualizado_em)
regras_categoria   (categoria pk, permitida, teto_unitario_usd, quantidade_maxima, alcada_usd, motivo)
politica_historico (id, tabela, chave, antes jsonb, depois jsonb, alterado_em)   -- preenchida por trigger
```

`status` usa os nomes da requisição no ME: nasce `aprovada` até a alçada e `em_aprovacao` acima da
alçada da categoria, se houver, senão da geral (padrão 5.000). A decisão humana (`reprovada`) fica para
produção: aqui o selo mostra a regra que mandou para aprovação. Preço e título são copiados para o item no momento da compra, porque o catálogo
pode mudar depois. A requisição guarda em `regras_aplicadas jsonb` as regras que valiam na hora: a
auditoria responde "por que esta foi para aprovação" mesmo depois de a política mudar.

**Carga inicial da política** (migration, para funcionar na máquina de quem avalia sem passo manual):

| Regra | Valor | Por quê |
|---|---|---|
| Alçada geral | US$ 5.000 | Acima disso, aprovação humana |
| Valor máximo por requisição | US$ 20.000 | Acima disso, recusa |
| `laptops` | teto US$ 2.500, até 20 un. | Mostra o teto da categoria sobrepondo o do pedido |
| `furniture` | alçada US$ 2.000 | Mostra a alçada da categoria sobrepondo a geral |
| `vehicle`, `motorcycle` | bloqueadas: "veículo segue o processo de frota" | Mostra a categoria bloqueada com motivo |
| `fragrances`, `beauty`, `skin-care` | bloqueadas: "fora da política de compras corporativas" | Idem |

---

## 5. Etapas (cada etapa = um ou mais commits)

Os commits seguem o padrão `tipo: o que mudou`, em português (`feat:`, `test:`, `fix:`, `docs:`, `ci:`).
O histórico vai junto na entrega, então os commits são pequenos e na ordem em que o projeto nasce.

### Etapa 0 · Ambiente (sex 30/10)
1. Instalar o **Docker Desktop** (a máquina de desenvolvimento ainda não tem) e conferir `docker compose version`.
2. Conferir o Node 22 (local está 20.20.2; nos containers vai `node:22-alpine`).
3. `git init`, `.gitattributes` com `* text=auto eol=lf` (**crítico no Windows**: script com CRLF quebra dentro do container Linux), `.gitignore`, `.env.example`.
- Feito em 30/10/2026: repo no GitHub, com `README.md` (desenho do projeto e checklist "Estado"), `CLAUDE.md`, este plano, `.gitignore`, `.gitattributes` e `.env.example`. O enunciado (`case/`) fica fora do git porque traz a chave da OpenRouter.
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
1. Migrations SQL em `packages/db/migrations` (`001_requisicoes.sql`, `002_atendimentos.sql`, `003_politica_compra.sql` com a carga inicial e o trigger de histórico) e o migrador com `pg_advisory_lock`, chamado no boot do mcp-server.
2. `criar_requisicao` com as travas (preço da fonte, estoque, mínimo, teto) e a política lida da tabela a cada chamada (categoria bloqueada, teto e quantidade da categoria, valor máximo, alçada), numa transação. Grava `regras_aplicadas`.
3. `consultar_politica` (só leitura).
4. Testes com Postgres de verdade (container no CI e o do compose local), incluindo a recusa de cada regra e a mudança de regra valendo no pedido seguinte. **Um teste por ferramenta do MCP, sem chave de LLM, vale para todas**, não só as duas do enunciado: `criar_requisicao` e `consultar_politica` entram aqui.
- Commits: `feat: migrations do Postgres` → `feat: criar_requisicao com validação de preço, estoque e pedido mínimo` → `feat: política de compras em tabela, com histórico por trigger`

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
4. Rotas (incluindo `GET/PUT /politica`, com zod no corpo), trilha de auditoria por atendimento, `Idempotency-Key`, rate limit (`@fastify/rate-limit`, folgado, na casa de 60 pedidos por minuto por IP, para não barrar quem avalia rodando a avaliação), erro da OpenRouter tratado: 401 = "chave inválida ou expirada, troque no `.env`", 429 = retry com `Retry-After`, timeout total de 60 s.
5. Teste do laço com um **LLM falso roteirizado**: prova que o código não tem fluxo fixo, porque a ordem das ferramentas muda conforme o roteiro.
- Commits: `feat: laço do agente com OpenRouter e ferramentas do MCP` → `feat: rotas de requisições e trilha de atendimentos` → `test: laço do agente com LLM falso`

### Etapa 4 · Chat (dom)
1. Uma tela só: caixa de pedido, histórico da sessão e um cartão da requisição com número, itens, quantidade, preço unitário, subtotal e total.
   - **Visual no padrão de produto do ME**, pelos tokens públicos do Eletro Design System (eletrods.me.com.br, conferidos em 30/10/2026). As variáveis `--me-*` ficam num `tokens.css` do chat:
     - fonte Roboto;
     - `--me-primary-1` #0A0A93 e `--me-primary-2` #1052E0 (botão principal);
     - cinzas `--me-gray--1` #262F35 a `--me-gray-6` #F1F3F5, com fundo `--me-bg-gray` #F7F8FA;
     - status com `--me-success-*`, `--me-warning-*` e `--me-danger-*`;
     - `--me-shadow-level-1` nos cartões;
     - botão com raio de 8 px.
   - Sem logo, sem nome e sem os componentes Vue do Eletro: só os tokens. O produto continua sendo "Agente de compras".
2. O cartão é montado com os **dados do banco** que o backend devolveu, não com o texto do modelo.
3. Mostra as ferramentas chamadas (diferencial opcional do case) **em linguagem de quem compra**, sempre visível: "Consultei o catálogo: 5 laptops encontrados", "Conferi a política de compras: teto de US$ 2.500 por laptop", "Gravei a requisição". O texto de cada passo sai de um mapa ferramenta → frase no front, com os números do resultado da ferramenta. O detalhe de dev (`buscar_produtos("laptop") · 5 resultados · 380 ms`) fica atrás do botão "Detalhes técnicos", **desligado por padrão**; o README diz ao avaliador onde ligar. A trilha completa continua em `GET /atendimentos/:id`.
4. Estados claros: carregando ("consultando o catálogo…"), não atendida (o que falta), catálogo fora, chave expirada.
5. Lista das requisições salvas (`GET /requisicoes`) numa aba.
- Commits: `feat: resultado de cada ferramenta na trilha` → `feat: chat em React com cartão da requisição e ferramentas chamadas`

### Etapa 5 · Docker (dom)
1. Um `Dockerfile` na raiz, multi-stage, com os targets `mcp-server`, `backend`, `chat` (build com Node, servido por nginx) e `testes`. Usuário não-root, `npm ci` numa camada compartilhada, imagem final só com o build. `.dockerignore` com `.env`, `case/`, `node_modules` e `.git`.
2. `docker-compose.yml`:
   - `healthcheck` em todos;
   - `depends_on: condition: service_healthy`;
   - volume do Postgres;
   - só a porta do chat exposta (`${PORTA:-8080}`), com o nginx repassando `/api` e `/mcp`, e também `/requisicoes` direto, para quem testar a rota exatamente como está no enunciado (`POST /requisicoes`, `GET /requisicoes`);
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
   | 6 | "Preciso de uma moto para as entregas" | Não atendida pela política: `motorcycle` bloqueada, com o motivo |
   | extra | Qualquer pedido com `DUMMYJSON_BASE_URL` apontando para um endereço morto | `503` e mensagem clara no chat |

   Antes de fechar, reconferir os dados na DummyJSON, porque ela pode mudar.
2. GitHub Actions: Biome, typecheck, testes (com serviço Postgres) e `docker compose build`. O workflow roda a cada push e vai junto no zip.
3. Selo "Em aprovação" no chat, com a regra que levou a requisição para a alçada.
- Commits: `feat: script de avaliação com 6 pedidos` → `ci: lint, typecheck, testes e build` → `feat: selo de alçada no chat`

### Etapa 7 · README, decisões e ensaio (seg 02/11)
1. **README enxuto:** o case pede que ele explique "em poucas linhas" como rodar e as principais decisões. A primeira tela fica com rodar, o exemplo e as decisões, em até umas 100 linhas. Arquitetura, rotas, política, falhas e avaliação vão para `docs/`, com link. Comandos conferidos, exemplos trocados por saída real e a seção "Estado" retirada.
2. `docs/decisoes.md`: uma linha de contexto, decisão e alternativa descartada para cada escolha da seção 3.
3. GIF curto do pedido de exemplo no README, gravado do app real.
   - O mockup feito antes do código (canvas privado) **não vai como link**. Vai exportado em PNG para `docs/desenho-antes-do-codigo.png`, só com as telas que foram construídas, ao lado do print real, e citado em `docs/uso-de-ia.md`.
   - Tela do mockup que não foi construída (modo consultivo e aba Regras, cortados em 01/11) fica fora da imagem e sai de `docs/mockup` antes da entrega. Não mostrar promessa que o app não cumpre.
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
| 2 | Política de compras em tabela (alçada, teto e quantidade por categoria, categoria bloqueada), com histórico por trigger e `consultar_politica` no MCP | "Alçada por valor e tipo de compra" e "política de categorias" do blog do ME. Cada cliente tem a sua política, e o FDE configura sem deploy | médio |
| 3 | Descrição das ferramentas no padrão quando chamar / quando não chamar / o que não devolve, e `dica` na busca vazia | "Ferramentas bem definidas" é critério de 25% | baixo |
| 5 | Trilha de auditoria + `/metricas` | É o "instrumentará… volume, taxa de acerto, tempo, falhas" do anúncio, e a "trilha de auditoria" do blog do ME | médio |
| 6 | Script de avaliação com conferência no banco, comparando 2 modelos | Prova de valor com número, e decisão de modelo baseada em dado | baixo |
| 7 | Ferramentas chamadas no chat | Diferencial do case, e prova visual de que o modelo decide | baixo |
| 9 | Idempotency-Key + rate limit + retry com `Retry-After` | Os três itens de "integração B2B" do requisito da vaga | baixo |
| 10 | CI | Diferencial do case | baixo |
| 11 | MCP plugável no Claude Code | Liga com o "MCP OData Connect" do ME e com o diferencial "MCP, Claude Code" da vaga | quase zero (só README) |

**Cortados em 01/11** (viram uma linha cada em "Para produção, eu faria"): aprovar e reprovar com motivo,
alçada por solicitante, sinônimos em tabela, trava do texto, aba "Regras", modo consultivo, data de
necessidade e webhook de saída. A política continua editável pela API (`PUT /politica`).

**Fora de propósito:** autenticação de usuário, multi-tenant e fila de mensagens. Ficam no README,
na seção "Para produção, eu faria", com uma linha cada, sem gastar o prazo.

---

## 9. Cuidados

- **A chave da OpenRouter expira por volta de 06/11.** O README explica como trocar por outra em `OPENROUTER_API_KEY`.
- `case/` e `.env` ficam fora do git (já no `.gitignore`).
- Se o tempo apertar, a ordem de corte é a do fim para o começo da seção 8. O núcleo (etapas 1 a 5 e o README) não se corta.
- **Linha de corte:** aplicada em 01/11 à tarde, antes do prazo de 18h: o código só começou no domingo e o Docker ainda precisou ser instalado. A segunda-feira fica para o chat, o compose, a avaliação, o README e o ensaio em clone limpo.
- **Extra não pode mudar o pedido de exemplo.** Quem avalia vai repetir "3 laptops até US$ 2.000" várias vezes. Nenhuma regra nova (política, alçada, trava) pode fazer a segunda rodada se comportar diferente da primeira sem um motivo claro na resposta.

---

## 10. Registro de mudanças

| Data | Mudança | Motivo |
|---|---|---|
| 30/10/2026 | Plano criado, antes de qualquer código | Fechar o desenho antes de gastar o prazo em código |
| 30/10/2026 | README e `CLAUDE.md` escritos antes do código | O README vira a especificação, com o checklist "Estado" atualizado a cada etapa; o `CLAUDE.md` fixa as regras para toda sessão com a IA |
| 30/10/2026 | O plano passou a ser versionado (antes ficava só na máquina) | Mostrar na entrega como o trabalho com IA foi conduzido |
| 30/10/2026 | Política de compras em tabela no mesmo Postgres; `ALCADA_USD` saiu do `.env`; entrou `consultar_politica` no MCP e o pedido 6 na avaliação | Regra de negócio é do cliente e muda sem deploy; o blog do ME fala em alçada por valor e tipo de compra. Descartado um segundo banco: mais um container é mais risco de não subir |
| 30/10/2026 | Entraram sinônimos em tabela, padrão de descrição das ferramentas, trava do texto e o modo consultivo (`sugerir_para_necessidade` + confirmação), que substitui o item "pergunta de esclarecimento" | Ideias trazidas de um agente de vendas que já pus em produção: busca tolerante a como o cliente escreve, valor só de ferramenta conferido em código, e o cliente que descreve o sintoma sem saber o produto. O modo consultivo fica depois do núcleo para não arriscar o prazo |
| 30/10/2026 | Visual do chat no padrão de produto do ME: tokens públicos do Eletro Design System (Roboto, `--me-primary-*`, `--me-gray-*`, status e sombras), sem logo nem nome | O FDE entrega dentro do ambiente do cliente; a tela já nasce no padrão visual da plataforma onde rodaria. Usei os tokens do produto (Eletro DS), não as cores do site de marketing |
| 30/10/2026 | Ferramentas chamadas aparecem no chat como passos em português; nome de função e tempo só com "Detalhes técnicos" ligado | O chat é do solicitante, e `buscar_produtos(...) · 380 ms` não faz sentido para quem compra. O diferencial do case continua cumprido, e o detalhe técnico segue disponível para quem avalia |
| 30/10/2026 | Estrutura de pastas fechada: migrations em `packages/db` com `pg_advisory_lock` no boot dos dois serviços, um Dockerfile com targets, `.dockerignore`, regras de política como funções puras | Os dois serviços usam o banco e o backend depende do MCP: dono único das migrations criaria ciclo no compose. Sem `.dockerignore` a chave poderia entrar na imagem |
| 30/10/2026 | Conferência do plano contra o enunciado: teste para toda ferramenta do MCP (inclusive as extras), README enxuto com detalhes em `docs/`, `/requisicoes` também direto no nginx, trava do texto aceitando o valor do próprio pedido, rate limit folgado, linha de corte no domingo 18h e regra de que extra não muda o pedido de exemplo | O case exige "um teste para cada ferramenta" e "README em poucas linhas"; o escopo cresceu e o prazo não |
| 30/10/2026 | Entraram aprovar/reprovar com motivo, alçada por solicitante com validade e, se sobrar tempo, a data de necessidade comparada ao prazo de envio | Vindo do processo de compras do ERP onde trabalho: pedido reprovado fica com motivo e usuário, e o limite de alçada é por pessoa, com data de fim e motivo |
| 01/11/2026 | Corte de escopo: saíram aprovar/reprovar, alçada por solicitante, sinônimos, trava do texto, aba "Regras", modo consultivo (`sugerir_para_necessidade`), data de necessidade e webhook. O migrador roda só no boot do mcp-server | No domingo à tarde ainda não havia código, e o Docker precisou ser instalado (com WSL2). O case avalia mais integração e "funciona" do que sofisticação. O visual com os tokens do Eletro ficou, porque é só CSS e o mockup já está nele |
| 01/11/2026 | Status da requisição renomeados: `aberta` virou `aprovada` e `aguardando_aprovacao` virou `em_aprovacao`, com `reprovada` para a decisão negativa | São os nomes que o padrão de Requisição do guia de design do ME usa (Rascunho, Em aprovação, Aprovado, Reprovado). O mockup foi ajustado no mesmo dia ao Eletro DS e ao padrão do chat de IA deles |
| 01/11/2026 | Backend: uma sessão MCP por atendimento em vez de conexão longa com reconexão; códigos de erro `NAO_ENCONTRADO`, `MUITOS_PEDIDOS` e `ERRO_INTERNO`; requisição já gravada vale mesmo se o modelo falhar depois; Idempotency-Key espera o pedido em andamento | O MCP é stateless: abrir por atendimento leva os headers `x-atendimento-id` e `x-request-id` e elimina o caso de conexão caída. Os códigos novos cobrem 404, 429 e 500 com o mesmo formato `{codigo, mensagem}`. Responder erro depois de gravar faria a pessoa pedir de novo e duplicar a compra; o duplo clique chega enquanto o primeiro pedido ainda roda |
| 01/11/2026 | A trilha do atendimento passa a guardar o resultado estruturado de cada ferramenta | O chat descreve cada passo com os números que a ferramenta devolveu ("5 resultados, de US$ 1.099,99 a US$ 1.999,99"), sem depender do texto do modelo, e a auditoria em `GET /atendimentos/:id` mostra o que o modelo viu em cada chamada |
| 01/11/2026 | Entrou o `INSTALAR.md`: um prompt para o agente de IA de quem recebe o case instalar, subir e testar o projeto | Pedido do autor para o e-mail de entrega ("abra no seu agente e peça: siga o INSTALAR.md"). Só instalação e teste, sem alterar código, com a chave pedida à pessoa e nunca mostrada. O `CLAUDE.md` e um `AGENTS.md` abrem com o aviso, para o agente achar o arquivo sozinho |
| 01/11/2026 | Imagens do backend e do MCP ficaram com cerca de 205 MB de conteúdo, um pouco acima da meta de 200 MB | O binário do Node na `node:22-alpine` sozinho tem 124 MB; as dependências do projeto somam 53 MB. Trocar a imagem base não compensa o risco perto da entrega |
| 01/11/2026 | Avaliação real: 6 de 6 com o Haiku 5.5, p50 7,7 s, p95 12,9 s e US$ 0,0015 por pedido, mas 12 mil tokens de entrada (meta de 6 mil). O modelo de reserva não foi avaliado | Os tokens vêm de 3 a 4 voltas por pedido, cada uma reenviando o prompt e o schema das 4 ferramentas. Cortar isso (descrições menores, `limite` menor na busca) mexe no prompt e pede nova avaliação; fica para depois da entrega |
| 01/11/2026 | Ensaio em clone limpo do GitHub, seguindo o `INSTALAR.md`: do zero aos quatro serviços saudáveis em 56 s, chat e rotas funcionando, testes passando, nenhuma chave no histórico. Os comandos de teste passam a usar `--build` | O serviço `testes` está num perfil e o `docker compose run` reaproveitava uma imagem antiga: o ensaio rodou 91 testes em vez de 92 até a correção |
| 01/11/2026 | Revisão de segurança antes da entrega: chat só em `127.0.0.1`, `PUT /politica` com `POLITICA_TOKEN`, `X-Forwarded-For` e `x-atendimento-id` vindos de fora descartados no nginx, `Origin` checado no `/mcp`, cabeçalhos de segurança (CSP) no nginx e CI só com leitura | O ambiente de quem avalia roda com a chave da OpenRouter no `.env`. Nada disso muda o `docker compose up` nem o pedido de exemplo; o que ficou de fora está em `docs/seguranca.md` |
