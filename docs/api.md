[← README](../README.md)

# API

Pelo nginx, todas as rotas ficam sob `/api` (http://localhost:8080/api). `POST /requisicoes` e
`GET /requisicoes` também respondem direto em `/requisicoes`, como no enunciado.

| Rota | Faz |
|---|---|
| `POST /api/requisicoes` | Roda o agente: `201` criada, `200` não atendida, `503` serviço fora. Aceita `Idempotency-Key` |
| `GET /api/requisicoes` | Lista as requisições com os itens, da mais nova para a mais antiga. Paginada: `limite` (padrão 20, máximo 100) e `cursor`; responde `{ requisicoes, proximo_cursor }` |
| `GET /api/requisicoes/{id}` | Uma requisição |
| `GET /api/atendimentos/{id}` | Trilha do atendimento: ferramentas, argumentos, tempos, tokens e custo |
| `GET /api/metricas` | Volume, taxa de atendidas, falhas, tempo p50/p95 e custo médio |
| `GET /api/politica` · `PUT /api/politica` · `PUT /api/politica/categorias/{categoria}` | Lê e altera a política de compras. Vale no pedido seguinte, sem reiniciar. O `PUT` exige `Authorization: Bearer` com o `POLITICA_TOKEN` |
| `GET /api/health` | Estado do banco, do MCP e da chave do LLM |

## Pedido de exemplo

```bash
curl -s http://localhost:8080/api/requisicoes \
  -H "content-type: application/json" \
  -d '{"pedido": "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.", "solicitante": "Time de vendas"}'
```

Resposta real da avaliação de 01/11/2026, com `anthropic/claude-haiku-5.5` (7,6 s, 12.357 tokens
de entrada e US$ 0,0015). Para caber aqui, o `resultado` da busca e da política mostra só o primeiro
item da lista.

```json
{
  "resultado": "criada",
  "atendimento_id": "cce2122d-ad59-4092-82a8-9ff570d56420",
  "requisicao": {
    "id": 3,
    "numero": "REQ-000003",
    "status": "aprovada",
    "solicitante": "Time de vendas",
    "justificativa": "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.",
    "itens": [
      {
        "produto_id": 81,
        "titulo": "Lenovo Yoga 920",
        "categoria": "laptops",
        "quantidade": 3,
        "preco_unitario": 1099.99,
        "subtotal": 3299.97
      }
    ],
    "valor_total": 3299.97,
    "moeda": "USD",
    "alcada": {
      "valor_usd": 5000,
      "origem": "geral"
    },
    "atendimento_id": "cce2122d-ad59-4092-82a8-9ff570d56420",
    "criado_em": "2026-11-01T19:45:16.113Z"
  },
  "mensagem": "Criei a requisição REQ-000003 para o time de vendas: 3 unidades do Lenovo Yoga 920 a US$ 1.099,99 cada, com total de US$ 3.299,97. O status é aprovada, pois o total está dentro da alçada de US$ 5.000,00. Escolhi esse modelo por ser o de menor preço entre os laptops disponíveis, dentro do limite de US$ 2.000 por unidade.",
  "ferramentas": [
    {
      "nome": "buscar_produtos",
      "argumentos": {
        "termo": "laptop",
        "limite": 20
      },
      "duracao_ms": 333,
      "ok": true,
      "erro_codigo": null,
      "resultado": {
        "termo": "laptop",
        "total": 5,
        "produtos": [
          {
            "id": 78,
            "marca": "Apple",
            "titulo": "Apple MacBook Pro 14 Inch Space Grey",
            "estoque": 24,
            "avaliacao": 3.65,
            "categoria": "laptops",
            "preco_usd": 1999.99,
            "pedido_minimo": 1,
            "disponibilidade": "In Stock"
          }
        ]
      }
    },
    {
      "nome": "consultar_politica",
      "argumentos": {
        "categoria": "laptops"
      },
      "duracao_ms": 83,
      "ok": true,
      "erro_codigo": null,
      "resultado": {
        "alcada_geral_usd": 5000,
        "criterio_escolha": "menor_preco",
        "valor_maximo_requisicao_usd": 20000,
        "categorias": [
          {
            "motivo": null,
            "categoria": "laptops",
            "permitida": true,
            "alcada_usd": null,
            "quantidade_maxima": 20,
            "teto_unitario_usd": 2500
          }
        ]
      }
    },
    {
      "nome": "criar_requisicao",
      "argumentos": {
        "itens": [
          {
            "produto_id": 81,
            "quantidade": 3,
            "preco_maximo_unitario_usd": 2000
          }
        ],
        "solicitante": "Time de vendas",
        "justificativa": "Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada."
      },
      "duracao_ms": 257,
      "ok": true,
      "erro_codigo": null,
      "resultado": {
        "itens": [
          {
            "titulo": "Lenovo Yoga 920",
            "categoria": "laptops",
            "produto_id": 81,
            "quantidade": 3,
            "subtotal_usd": 3299.97,
            "preco_unitario_usd": 1099.99
          }
        ],
        "moeda": "USD",
        "numero": "REQ-000003",
        "status": "aprovada",
        "solicitante": "Time de vendas",
        "motivo_status": "O total está dentro da alçada de US$ 5.000,00 (geral).",
        "valor_total_usd": 3299.97,
        "valor_total_texto": "US$ 3.299,97"
      }
    }
  ]
}
```

Quem garante os números é o código: o preço, o total e o status vêm do banco, gravados pelo
`criar_requisicao`, que lê o preço na DummyJSON. O texto do modelo fica só em `mensagem`.

## Quando nada atende

Nada é gravado, a resposta vem com `200` e `"resultado": "nao_atendida"`, e a mensagem diz o que faltou.
Exemplo real para "5 laptops até US$ 1.000 cada":

> Não criei a requisição: nenhum laptop do catálogo fica até US$ 1.000 por unidade. O mais barato é o Lenovo Yoga 920, a US$ 1.099,99, com 40 em estoque. Se a faixa de preço puder subir, escreva um novo pedido com o novo limite por unidade.

## Idempotency-Key

Reenviar o mesmo pedido com o mesmo header `Idempotency-Key` (duplo clique, retry de integração)
devolve a mesma resposta, com `200` e `idempotent-replayed: true`, sem rodar o agente de novo nem
duplicar a requisição. Se o primeiro envio ainda estiver rodando, o segundo espera por ele.
