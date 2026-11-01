[← README](../README.md)

# Política de compras

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
