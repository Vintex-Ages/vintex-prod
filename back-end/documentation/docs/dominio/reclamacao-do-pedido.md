---
sidebar_position: 14
---

# Reclamação do pedido

Fonte de verdade: `app/controllers/order_complaint_controller.py`, `app/repositories/order_complaint_repository.py`, `app/schemas/order_complaint_schema.py`, as rotas em `app/views/order_routes.py` e `app/views/admin_routes.py`, e as issues [#268](https://github.com/Vintex-Ages/back-end/issues/268) (BE-US025-1) e [#353](https://github.com/Vintex-Ages/back-end/issues/353) (a ordem da lista). Entrou pelos PRs vintex-prod#82 e #95; o #82 traz o `back-end#344`, que estava aberto no repositório antigo.

O comprador reporta que o pedido não chegou ou chegou danificado, com um texto livre (RN-77), e a administradora lista as reclamações com os dados do pedido (RN-78, RN-79). Não há chat direto entre comprador e vendedor: a administradora intermedia (RN-79).

| Rota | Quem | O que faz |
| --- | --- | --- |
| `POST /api/users/me/orders/{id}/complaints` | o comprador logado (RN-27) | registra a reclamação do pedido dele |
| `GET /api/admin/complaints` | só a administradora | lista as reclamações, paginada, mais recente primeiro |

## Reportar

```json
{ "reason": "danificado", "description": "A manga chegou rasgada." }
```

- **`reason` é `nao_recebido` ou `danificado`**, os dois da RN-77, e só eles: o banco recusa outro valor (`CHECK`).
- **`description` é obrigatória**, de 1 a 1000 caracteres, sem espaços nas pontas. É o conteúdo da reclamação, e não um comentário de avaliação: a [avaliação da loja](./avaliacao-da-loja) proíbe texto (RN-75), e aqui o texto é o que a administradora lê.
- A resposta é `201` com `{ id, order_id, reason, description, created_at }`.

| Situação | Resposta |
| --- | --- |
| pedido inexistente **ou de outra pessoa** | `404 ORDER_NOT_FOUND`: a mesma resposta, porque um `403` confirmaria que o id existe |
| pedido ainda não confirmado | `409 COMPLAINT_NOT_ALLOWED` |
| o pedido já tem uma reclamação | `409 ALREADY_REPORTED` |
| motivo fora dos dois valores, ou texto vazio | `422` |

### Quando dá para reportar

A partir da confirmação do pedido: `confirmado`, `preparando`, `enviado` e `concluido` (`STATUS_QUE_PERMITEM_RECLAMAR`), pelo status que o comprador vê, com as etapas simuladas. "Não recebido" só faz sentido enquanto a entrega não aconteceu, então a reclamação abre já na aprovação do comprovante, e não só em `concluido`. Pedido que aguarda comprovante (inclusive o que teve o comprovante recusado, que volta a esse status), em análise ou expirado ainda não tem o que reportar.

### Uma por pedido

O `UNIQUE` em `order_id` é quem garante: dois cliques ao mesmo tempo, só o primeiro grava, e o segundo cai no `IntegrityError` que o controller traduz em `409 ALREADY_REPORTED`. Não há consulta antes de gravar, que deixaria uma janela. É a mesma regra da avaliação da loja ([#267](https://github.com/Vintex-Ages/back-end/issues/267)).

## A lista da administradora

`GET /api/admin/complaints` devolve, por reclamação: `id`, `reason`, `description`, `created_at`, o comprador (`buyer`: nome, e-mail e telefone) e o pedido (`order`: `id`, `status` como o comprador vê, a loja com o nome do vendedor e a chave Pix, os itens e o `total_amount`, como número). É o que a administradora precisa para intermediar.

- **Só ela lê** (`403 ADMIN_REQUIRED` para os outros, sem sessão `401`). A loja e a peça não mostram sinal da reclamação, e nenhuma rota pública a devolve (RN-78).
- **Mais recente primeiro**, com `id` no desempate (`created_at.desc(), id.desc()`), para a paginação não repetir nem pular ninguém entre páginas ([#353](https://github.com/Vintex-Ages/back-end/issues/353)). A [fila de comprovantes](./validacao-de-comprovante) ordena ao contrário, da mais antiga para a mais recente, e **não mudou**: lá a administradora age e o item sai da fila; aqui a lista é só de leitura, e abre pelo que chegou agora. A `front-end#427` fixou "da mais recente para a mais antiga" como critério de aceite, e com paginação reordenar uma página no front não produz ordem global, então quem decide é o back.
- **Número fixo de consultas por página**, qualquer que seja o tamanho dela: comprador, pedido, loja e vendedor vêm por junção, e itens e histórico (de onde sai o status derivado) em uma consulta por coleção.

## Os dados

Model `OrderComplaint` e migration `d9a4c6e2b8f1`, encadeada na `d4a7c1e9b2f6` (a da [moderação](./moderacao-de-anuncios)). Colunas: o pedido (`UNIQUE`), o autor, o motivo (`CHECK`), o texto e a data. Os testes ficam em `tests/test_order_complaints.py`.
