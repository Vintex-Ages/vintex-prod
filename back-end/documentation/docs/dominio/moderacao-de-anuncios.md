---
sidebar_position: 16
---

# Moderação de anúncios

Fonte de verdade: `app/views/admin_moderation_routes.py`, `app/controllers/admin_moderation_controller.py` e a issue [#327](https://github.com/Vintex-Ages/back-end/issues/327).

A administradora tira do ar o anúncio inadequado de qualquer vendedor e pode devolvê-lo depois (RN-80). A peça tirada do ar é chamada de **Suspensa**. No banco ela fica em `despublicado`, com `moderated_at` preenchido, e é isso que a diferencia da peça que o próprio vendedor pausou.

Todas as rotas exigem o papel de administradora (`require_admin` no router): sem token, `401 AUTH_REQUIRED`; com outro papel, inclusive o dono da peça, `403 ADMIN_REQUIRED`. O `tests/test_admin_guard.py` confere no OpenAPI que nenhuma rota de `/api/admin` escapa da guarda.

| Rota | O que faz | Erros |
| --- | --- | --- |
| `POST /api/admin/products/{id}/unpublish` | suspende, com motivo | `404 PRODUCT_NOT_FOUND` · `409 PRODUCT_SOLD` / `PRODUCT_NOT_EDITABLE` · `422` motivo vazio |
| `POST /api/admin/products/{id}/publish` | devolve ao estado anterior | `404 PRODUCT_NOT_FOUND` · `409 PRODUCT_NOT_SUSPENDED` · `422` peça sem foto |
| `GET /api/admin/products?moderated=true` | lista as Suspensas, mais recente primeiro, paginada | `422` sem `moderated=true` |

## Suspender

Corpo: `{ "reason": "..." }`, de 1 a 500 caracteres. A peça grava o motivo, a data, quem suspendeu e o estado de onde saiu:

| Campo | Valor |
| --- | --- |
| `status` | `despublicado` |
| `moderation_reason` | o motivo |
| `moderated_at` | agora (UTC) |
| `moderated_by_id` | a administradora |
| `moderation_previous_status` | `ativo` ou `despublicado`, o estado antes da suspensão |

- **Só peça `ativo` ou `despublicado` pode ser suspensa.** `vendido` responde `409 PRODUCT_SOLD` (dinheiro já contado, RN-53); `reservado` responde `409 PRODUCT_NOT_EDITABLE` (está num pedido aberto, RN-46); `rascunho` também responde `409 PRODUCT_NOT_EDITABLE`, porque nunca esteve no ar.
- **O anúncio inadequado que já está reservado continua no ar** até o pedido se resolver. A RN-80 não abre exceção para esse caso.
- **O vendedor recebe uma notificação com o motivo** (`type: "moderation"`; ver [Notificações](./notificacoes)).
- **Suspender de novo atualiza motivo e data sem um segundo aviso.** A notificação existente passa a mostrar o motivo novo. O estado anterior não é regravado, senão a peça perderia de onde veio.

## Devolver à vitrine

- **A peça volta ao estado de onde saiu** (`moderation_previous_status`). A que o vendedor tinha pausado volta pausada: a moderação não publica por conta própria (RN-50).
- **Exige ao menos uma foto**, como o `publish` do vendedor (RN-47).
- **Os quatro campos de moderação são limpos.**
- **A peça que volta para `ativo` ganha o vetor da busca**, se precisar, gerado depois da resposta (ver [Busca por semelhança](./busca-por-semelhanca)).
- Devolver peça que não está suspensa responde `409 PRODUCT_NOT_SUSPENDED`. Esta rota não é um "publicar" geral da administradora.

## O que o vendedor vê

- A peça Suspensa aparece na lista do vendedor com `moderation_reason` e `moderated_at` (`ProductManagementResponse`).
- **O vendedor não pode republicar a peça.** O `publish` dele responde `409 PRODUCT_SUSPENDED`. Só a administradora devolve.
- Para o público, a peça Suspensa se comporta como `despublicado`: fora do feed e da busca, e `404` no detalhe (ver [Situações da peça](./situacoes-da-peca)).

## A lista de Suspensas

`GET /api/admin/products?moderated=true` traz só as peças com `moderated_at`. As pausadas pelo vendedor ficam de fora. Cada item tem a peça (id, nome, preço, capa, `status`), a loja, o motivo, a data e o autor (`moderated_by`, com `id` e `name`). Sem `moderated=true` a rota responde `422`: ela não é uma listagem geral de peças.
