---
sidebar_position: 13
---

# Moderação de anúncios

Fonte de verdade: `app/controllers/admin_moderation_controller.py`, `app/views/admin_moderation_routes.py`, `app/schemas/admin_moderation_schema.py`, a guarda do `publish` do vendedor em `app/controllers/product_controller.py` e a issue [#327](https://github.com/Vintex-Ages/back-end/issues/327) (BE-US034-1, RN-80). Entrou pelo PR vintex-prod#59.

A administradora tira do ar o anúncio inadequado, com o motivo gravado na peça, e devolve à vitrine. A moderação não cria um status novo: a peça **Suspensa** (tirada pela moderação) e a **Pausada** (tirada pelo próprio vendedor, [RN-52](./situacoes-da-peca)) são as duas `despublicado`. O que as separa são as colunas de moderação, que dizem quem tirou, quando, por quê e de onde a peça veio.

## As rotas

Router próprio, `app/views/admin_moderation_routes.py`, sob `/api/admin` e com a guarda de papel no próprio router (RN-32): sem sessão responde `401`, usuário comum, **inclusive o dono da peça**, responde `403 ADMIN_REQUIRED`. Ficam fora do `admin_routes.py` da fila de comprovantes: são dois domínios, dois arquivos.

| Rota | O que faz | Erros |
| --- | --- | --- |
| `POST /api/admin/products/{id}/unpublish` com `{ "reason": "..." }` | tira a peça do ar, grava motivo, data, autor e o estado de origem, e avisa o vendedor | `404 PRODUCT_NOT_FOUND` · `409 PRODUCT_SOLD` (vendida) · `409 PRODUCT_NOT_EDITABLE` (reservada ou rascunho) · `422` motivo vazio |
| `POST /api/admin/products/{id}/publish` | devolve a peça Suspensa ao estado de onde a suspensão a tirou | `404 PRODUCT_NOT_FOUND` · `409 PRODUCT_NOT_SUSPENDED` · `422` peça sem foto |
| `GET /api/admin/products?moderated=true` | lista as peças Suspensas, mais recente primeiro, paginada | `422` se `moderated` não for `true` |

O motivo (`reason`) tem de 1 a 500 caracteres, sem espaços nas pontas. Ele é o canal da administradora com o vendedor (RN-79): vazio não explica o que corrigir.

A resposta de suspender e de devolver é `{ product_id, status, moderation_reason, moderated_at }`. Depois de devolver, motivo e data voltam `null`: a moderação deixou de existir. A listagem devolve, por peça, `id`, `name`, `price` (número, como em todo o dinheiro da API), `cover_image_url`, `status`, a loja (`store: { id, name }`), o motivo, a data e `moderated_by: { id, name }` (ou `null`).

## As colunas

Migration `d4a7c1e9b2f6`, em `products`:

| Coluna | Para quê |
| --- | --- |
| `moderation_reason` | o motivo; é o que marca a peça como Suspensa |
| `moderated_at` | quando |
| `moderated_by_id` | a administradora que tirou do ar |
| `moderation_previous_status` | `ativo` ou `despublicado` (`CHECK`): de onde a peça veio, para a devolução <span className="verificar" title="A issue #327 descreve três colunas novas. O código grava quatro: moderation_previous_status não está na issue. Confirmar com quem implementou.">*</span> |

A lista de Suspensas filtra por `moderated_at IS NOT NULL`, e não por `status = 'despublicado'`: a peça que o vendedor pausou não entra, e é por isso que a distinção existe.

## As decisões

- **O caminho de volta não é uma rota `republish`.** Ela saiu na [#230](https://github.com/Vintex-Ages/back-end/issues/230) por usar o sentido `-> ativo` sem checar foto e pôr peça sem imagem no feed. A devolução exige ao menos uma foto (RN-47), a mesma regra do `publish` do vendedor.
- **A peça volta ao estado de onde saiu.** A que estava no feed volta `ativo`; a que o vendedor tinha pausado volta `despublicado`, e o caminho dela até o feed continua sendo o `publish` do vendedor (RN-50). Devolver sempre a `ativo` seria a moderação publicando por conta própria <span className="verificar" title="A issue #327 diz que o caminho de volta é o mesmo do vendedor (publish, de despublicado para ativo). O código devolve a peça pausada como pausada. Confirmar com quem implementou.">*</span>.
- **O vendedor não republica o que a moderação tirou.** O `publish` dele recusa peça com motivo de moderação: `409 PRODUCT_SUSPENDED`. Sem isso, ele clicava em publicar e a suspensão não valia nada (RN-80).
- **Vendida, reservada e rascunho não se suspendem** (`409`). Vendida é dinheiro contado (RN-53); reservada está num pedido aberto (RN-46), então o anúncio inadequado já reservado continua no ar até o pedido resolver, porque a RN-80 não abre exceção; rascunho nunca esteve na vitrine, e suspendê-lo só o tiraria da aba de rascunhos <span className="verificar" title="A issue #327 só manda recusar vendido e reservado. O código recusa também rascunho. Confirmar com quem implementou.">*</span>.
- **Suspender de novo não avisa de novo.** A segunda suspensão atualiza o motivo e a data, e o aviso que o vendedor já tem passa a dizer o motivo novo. A origem não é regravada, porque a peça já está `despublicado` e isso apagaria de onde ela veio. Depois de uma devolução, a suspensão seguinte é outra suspensão, com outro aviso.
- **Devolver ao feed pede o vetor da busca por semelhança** de novo, como a publicação do vendedor ([#245](https://github.com/Vintex-Ages/back-end/issues/245)). Devolvida a `despublicado`, a peça fica fora da busca, e o vetor sai no `publish` do vendedor.

## O que o vendedor vê

- **No painel:** `ProductManagementResponse` ganhou `moderation_reason` e `moderated_at`, nulos fora da suspensão. É por aí que o vendedor lê o motivo na peça dele.
- **No sino:** um aviso do tipo `moderation`, com o motivo, gravado no mesmo commit da suspensão. Ver [Notificações](./notificacoes).

> <span className="verificar">*</span> **Verificar com quem implementou a #327.** (1) A issue pede três colunas novas; o código grava quatro, com `moderation_previous_status`, e mexe também no `CHECK` de `notifications`. (2) A issue descreve a devolução como o mesmo caminho do `publish` do vendedor; o código devolve a peça pausada como pausada. (3) A issue manda recusar `vendido` e `reservado`; o código recusa também `rascunho`. As três decisões estão justificadas no PR vintex-prod#59 e parecem coerentes com a RN-50 e a RN-80, mas não estão na issue.

Os testes ficam em `tests/test_admin_moderation.py`.
