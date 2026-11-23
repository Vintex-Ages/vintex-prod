---
sidebar_position: 17
---

# Reclamação do pedido

Fonte de verdade: `app/controllers/order_complaint_controller.py`, `app/models/order_complaint.py` e a issue [#268](https://github.com/Vintex-Ages/back-end/issues/268).

O comprador relata que um pedido não chegou ou chegou danificado (RN-77). Não há chat entre comprador e loja: a reclamação vai para a administradora, que intermedeia (RN-79).

| Rota | Quem | O que faz | Erros |
| --- | --- | --- | --- |
| `POST /api/users/me/orders/{order_id}/complaints` | comprador | registra a reclamação | `404 ORDER_NOT_FOUND` · `409 COMPLAINT_NOT_ALLOWED` / `ALREADY_REPORTED` · `422` |
| `GET /api/admin/complaints` | administradora | lista as reclamações, mais recente primeiro, paginada | `403 ADMIN_REQUIRED` |

## O envio

```json
POST /api/users/me/orders/42/complaints
{ "reason": "danificado", "description": "O zíper veio quebrado." }
```

- **`reason`** aceita só `nao_recebido` ou `danificado`, os dois motivos da RN-77. O schema confere e o banco confere de novo (CHECK).
- **`description`** é obrigatória, de 1 a 1000 caracteres, sem espaços nas pontas. É o conteúdo da reclamação. A [avaliação da loja](./avaliacao-da-loja), ao contrário, não tem texto (RN-75).
- **Uma reclamação por pedido.** Quem garante é o índice único em `order_id`, e não uma consulta antes. Com dois cliques simultâneos, só o primeiro grava; o segundo recebe `409 ALREADY_REPORTED`.
- **Só depois da confirmação.** O pedido precisa estar em `confirmado`, `preparando`, `enviado` ou `concluido`; antes disso, `409 COMPLAINT_NOT_ALLOWED`. "Não recebido" faz sentido antes da entrega, por isso a reclamação abre já na aprovação do comprovante. As etapas depois de `confirmado` são derivadas da data (ver [Pedidos do comprador](./pedidos-do-comprador#linha-do-tempo)).
- **Pedido de outra pessoa responde `404`**, igual a inexistente. Um `403` confirmaria que o id existe.

## A lista da administradora

Cada item traz a reclamação (`id`, `reason`, `description`, `created_at`), o comprador (nome, e-mail e telefone, para contato) e o pedido: `status` atual, loja (com nome do vendedor e chave Pix), itens e total. Os schemas de comprador, loja e item são os mesmos da [fila de comprovantes](./validacao-de-comprovante).

## Quem vê

A reclamação não é pública: nenhuma rota de loja, peça ou feed a devolve, e a loja não mostra sinal dela.

> <span className="verificar">*</span> **Verificar com quem implementou a #268.** O model e o controller citam a RN-78 como "só a administradora e o avaliado" veem a reclamação, mas não existe rota para a loja (o avaliado) ler a reclamação do próprio pedido. Hoje só a administradora a lê. Falta confirmar se o acesso da loja ficou para outra issue ou se a leitura da RN-78 é "só a administradora".
