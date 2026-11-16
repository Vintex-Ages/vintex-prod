---
sidebar_position: 12
---

# Painel da administradora

Fonte de verdade: `app/controllers/admin_dashboard_controller.py`, `app/repositories/dashboard_repository.py`, `app/schemas/admin_dashboard_schema.py` e a rota em `app/views/admin_routes.py`. Veio da BE-US033-1 ([#269](https://github.com/Vintex-Ages/back-end/issues/269)).

Uma rota só, sob a guarda de papel que o router de `/api/admin` aplica a todas as rotas (RN-32): sem sessão responde `401`, usuário comum responde `403 ADMIN_REQUIRED`. A tela não calcula nada; os números chegam prontos.

| Rota | O que faz |
| --- | --- |
| `GET /api/admin/dashboard` | os números gerais da plataforma e as vendas por loja |

## A resposta

```json
{
  "stores_count": 2,
  "users_count": 4,
  "active_products_count": 3,
  "sales_volume": 230.0,
  "commission_total": 20.7,
  "sales_by_store": [
    { "store_id": 1, "store_name": "Brechó Aurora", "amount": 180.0 },
    { "store_id": 2, "store_name": "Garimpo do Sul", "amount": 50.0 }
  ]
}
```

| Campo | De onde sai |
| --- | --- |
| `stores_count` | contagem de `stores` |
| `users_count` | contagem de `users`, todos os papéis |
| `active_products_count` | peças com situação `ativo`; rascunho, reservada, vendida e despublicada ficam de fora (ver [Situações da peça](./situacoes-da-peca)) |
| `sales_volume` | soma do `total_amount` dos pedidos `confirmado` |
| `commission_total` | soma do `platform_fee` gravado nesses mesmos pedidos <span className="verificar" title="A issue #269 diz 9% sobre o volume (RN-11); o código soma a comissão gravada em cada pedido. Confirmar com quem implementou.">*</span> |
| `sales_by_store` | os mesmos pedidos agrupados por loja, do maior valor para o menor, com o nome desempatando |

> <span className="verificar">*</span> **Verificar com quem implementou a #269.** A issue descreve a comissão como "9% sobre o volume, pela RN-11". O código não calcula o percentual: soma o `platform_fee` que cada pedido gravou ao ser criado. A comissão é arredondada para o centavo em cada pedido (`app/core/comissao.py`), então a soma pode diferir em centavos de 9% do volume total. E, se o percentual mudar, o histórico fica com a comissão da época, enquanto a conta de 9% reescreveria o passado. O comentário do schema afirma que é a intenção; falta confirmar que é a decisão.

## Decisões

- **A base é o pedido, não a peça.** O histórico de pagamento é o que manda (RN-22), e é o pedido que guarda valor e comissão. A tela do vendedor lê `Product.status == "vendido"`; esta lê `Order.status == "confirmado"`.
- **`confirmado` já inclui todo pedido pago.** É o estado gravado na aprovação do comprovante (RN-21). `preparando`, `enviado` e `concluido` são derivados na leitura a partir da data de aprovação (ver [Pedidos do comprador](./pedidos-do-comprador#linha-do-tempo)) e não existem como linha, então filtrar por `confirmado` não perde ninguém. Pedido em análise, rejeitado ou expirado não entra na conta.
- **Duas consultas, qualquer que seja o tamanho da plataforma.** Uma traz as três contagens em subconsultas escalares; a outra agrupa os pedidos confirmados por loja. Volume e comissão saem da soma da lista já agrupada, então os totais nunca discordam das linhas do ranking. Um teste confere o número de consultas.
- **Loja sem venda confirmada não aparece em `sales_by_store`.** A lista é de quem vendeu, mas `stores_count` conta todas.
- **Plataforma sem venda não é erro.** Os valores saem `0` e a lista sai vazia.
- **Dinheiro sai como número no JSON**, nunca string ([#212](https://github.com/Vintex-Ages/back-end/issues/212)).
- **Nenhuma tabela nova.** Os números saem do que já existe.

## O contrato com o front

O caminho e os nomes dos campos são os que o front propôs ([`front-end#431`](https://github.com/Vintex-Ages/front-end/issues/431)). A #269 fixou a origem de cada número, não o formato da resposta; o service do front foi escrito contra este formato (`front-end/src/services/dashboardService.ts`) e é este schema que o fixa.

Ver também [Validação do comprovante](./validacao-de-comprovante), que grava o `confirmado` de onde os números saem.
