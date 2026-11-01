# Instalar e rodar com um agente de IA

Este arquivo é um prompt. Abra o repositório no seu agente de IA (Claude Code, Codex, Cursor) e peça:
**"siga o INSTALAR.md"**. O que vem abaixo é para o agente.

---

Você vai instalar e rodar o projeto na máquina desta pessoa e mostrar o chat funcionando. Fale em
português, de forma curta, e avise antes de cada passo que demora.

## Regras

- Não altere código, não faça commit e não instale nada sem a pessoa concordar.
- A chave da OpenRouter: peça à pessoa, grave só no `.env` editando o arquivo e nunca mostre o valor
  em comando, saída ou resposta.
- Se um comando falhar, mostre a saída e siga a seção "Quando algo falha". Não tente consertar código.
- Os comandos daqui foram conferidos. Na dúvida, o `README.md` é a fonte.

## 1. Pré-requisitos

- `docker compose version` precisa responder com Compose v2. Sem Docker, pare e peça à pessoa para
  instalar o Docker Desktop.
- O chat usa a porta 8080. Se ela estiver ocupada, use outra (passo 2).

## 2. Configuração

1. Copie o modelo: `cp .env.example .env` (no PowerShell: `Copy-Item .env.example .env`).
2. Peça a chave da OpenRouter e grave em `OPENROUTER_API_KEY=` no `.env`. Sem chave tudo sobe, mas
   cada pedido no chat avisa que ela falta.
3. Se a porta 8080 estiver ocupada, troque `PORTA=8080` por outra no `.env`, como `PORTA=8081`.

## 3. Subir

```bash
docker compose up --build -d
```

Use `-d`: em primeiro plano o terminal fica preso. A primeira vez leva alguns minutos, porque baixa
as imagens e instala as dependências.

## 4. Esperar ficar pronto

```bash
docker compose ps
```

Repita até os quatro serviços (`postgres`, `mcp-server`, `backend`, `chat`) aparecerem como
`healthy`. Depois confira:

```bash
curl -s http://localhost:8080/api/health
```

No PowerShell do Windows, use `curl.exe` no lugar de `curl`. Se trocou a `PORTA`, use a porta que
escolheu. Esperado: `"status":"ok"`. Se vier `"llm":"sem_chave"`, a chave não foi lida: confira o passo 2 e
rode `docker compose up -d` de novo.

## 5. Pedido de exemplo

Abra **http://localhost:8080** (ou a porta que escolheu) no navegador da pessoa e peça para ela
escrever:

> Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.

O esperado é a requisição `REQ-…` com 3 × Lenovo Yoga 920 a US$ 1.099,99, total de US$ 3.299,97,
com o status "Aprovado". O botão **Detalhes técnicos**, no alto da conversa, mostra as ferramentas
que o agente chamou, com tempo, tokens e custo.

Outros pedidos para mostrar:
- "5 laptops até US$ 1.000 cada": não atendido, e nada é gravado.
- "Preciso de uma moto para as entregas": fora da política de compras, com o motivo.
- "3 MacBook Pro para o time de design": gravado, mas "Em aprovação", porque passa a alçada.

A aba **Requisições** lista o que foi gravado.

## 6. Testes, se a pessoa quiser

```bash
docker compose run --rm --build testes
```

Roda lint, checagem de tipos e os testes, sem chave de LLM e sem internet.

## Quando algo falha

| Sintoma | O que fazer |
|---|---|
| `port is already allocated` ao subir | Troque `PORTA` no `.env` (passo 2) e rode `docker compose up -d` |
| O chat diz que a chave é inválida, venceu ou está sem crédito | Peça outra chave, troque no `.env` e rode `docker compose up -d` |
| O chat diz que o catálogo não respondeu | A DummyJSON (internet) está fora ou lenta: espere um pouco e tente de novo |
| Um serviço não fica `healthy` | `docker compose logs <serviço> --tail 50` e mostre a saída à pessoa |
| Quer começar do zero | `docker compose down -v` e depois `docker compose up --build -d` (apaga as requisições) |

Para desligar: `docker compose down`, que mantém as requisições gravadas.
