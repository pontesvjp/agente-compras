[← README](../README.md)

# Segurança

O alvo é o ambiente de quem avalia: um `docker compose up` numa máquina pessoal, com a chave da
OpenRouter no `.env`. A revisão de 01/11/2026 usou a skill `sharp-edges`, da Trail of Bits, que
procura onde o caminho mais fácil acaba inseguro. Cada correção virou um commit próprio.

## O que está protegido

| Risco | Proteção |
|---|---|
| Outra máquina da rede usar o chat e gastar a chave | O chat é publicado só em `127.0.0.1`. Postgres, backend e servidor MCP não têm porta publicada |
| Burlar o limite de 60 pedidos por minuto trocando o `X-Forwarded-For` | O nginx sobrescreve o cabeçalho, e o backend só confia no salto do nginx |
| Mudar alçada, teto ou categoria bloqueada | `PUT /politica` exige `POLITICA_TOKEN` (16 caracteres ou mais, comparado em tempo constante). Sem ele, ninguém altera pela API ([política](politica.md)) |
| Ligar uma requisição ao atendimento de outra pessoa pelo `/mcp` | O nginx apaga o `x-atendimento-id` que vem de fora; só o backend o envia |
| Um site aberto no navegador chamar o `/mcp` do localhost (DNS rebinding) | O servidor MCP recusa `Origin` que não seja do localhost, como a especificação do MCP exige |
| O modelo inventar preço ou passar por cima da regra | `criar_requisicao` não recebe preço: lê na DummyJSON e aplica a política no código, numa transação |
| SQL injection | Toda consulta usa parâmetro (`$1`); nome de coluna vem de lista fixa |
| XSS no chat | O React escapa o texto do modelo e não há `innerHTML`. O nginx manda CSP, `nosniff` e `frame-ancestors 'none'` |
| Chave da OpenRouter no git ou na imagem | `.env` no `.gitignore` e no `.dockerignore`; `git log -p --all` sem nenhuma chave |
| CI com permissão de escrita no repositório | O token do GitHub Actions só lê (`permissions: contents: read`) |
| Dependência com falha conhecida | `npm audit` sem nenhuma em 01/11/2026 |

## O que ficou de fora, e por quê

- **Login no chat e em `POST /requisicoes`.** O case pede as duas rotas abertas, e quem avalia sobe e
  testa sem configurar nada. Com a porta só em `127.0.0.1`, quem usa é quem está na máquina.
- **Senha fixa do Postgres no compose.** O banco não tem porta publicada: só os containers da rede do
  compose falam com ele.
- **`GET /requisicoes` e `GET /atendimentos/{id}` abertos.** O case pede a listagem sem autenticação.
- **DNS rebinding contra `POST /requisicoes`.** Barrar exigiria aceitar só `localhost` no `Host`, o que
  quebra quem abre o chat por outro endereço (Codespaces, VM). O pior caso são pedidos que gastam a
  chave, dentro do limite de 60 por minuto.
