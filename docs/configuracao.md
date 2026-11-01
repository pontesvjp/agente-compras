[← README](../README.md)

# Configuração

Infraestrutura e segredo ficam no `.env` (modelo em `.env.example`):

| Variável | Padrão | Para quê |
|---|---|---|
| `OPENROUTER_API_KEY` | (vazia) | Chave da OpenRouter. Sem ela tudo sobe, e o chat avisa que falta a chave |
| `LLM_MODELO` | `anthropic/claude-haiku-5.5` | Modelo principal |
| `LLM_MODELO_RESERVA` | `deepseek/deepseek-v4.1-flash` | Usado se o principal falhar |
| `DUMMYJSON_BASE_URL` | `https://dummyjson.com` | Aponte para um endereço morto para ver o tratamento de falha |
| `DUMMYJSON_TIMEOUT_MS` | `5000` | Tempo máximo de cada chamada ao catálogo |
| `PORTA` | `8080` | Porta do chat, publicada só em 127.0.0.1 (outras máquinas da rede não alcançam) |
| `LLM_TIMEOUT_MS` | `60000` | Tempo máximo de um atendimento, somando todas as voltas do laço |
| `POLITICA_TOKEN` | vazio | Token para alterar a política pela API (16+ caracteres). Vazio: a política só muda pelo banco |
| `LOG_LEVEL` | `info` | Nível do log JSON do backend e do servidor MCP (`debug` mostra mais) |
| `AVALIAR_RODADAS` | `1` | Quantas vezes a avaliação repete cada pedido |

`DATABASE_URL`, `TEST_DATABASE_URL` e `MCP_URL` o compose preenche. `BACKEND_PORTA` (3000) e `MCP_PORTA` (3001)
ficam no padrão do código, dentro da rede do Docker. Fora do Docker, os testes usam o Postgres
que `npm run db:teste` sobe na porta 5433.
