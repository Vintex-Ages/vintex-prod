---
sidebar_position: 3
---

# Situações da peça

Fonte de verdade: `app/models/product.py` (o `CheckConstraint` de `status`), `app/controllers/product_controller.py` e `app/repositories/product_repository.py`.

Uma peça é única (RN-46): `quantity` é sempre 1, e a situação diz se ela está à venda.

## As cinco situações

| Situação | O que é | Quem vê |
| --- | --- | --- |
| `rascunho` | criada pelo vendedor, ainda não confirmada (RN-50) | só o vendedor, e só na aba de rascunhos: `GET /users/me/products?status=rascunho`; sem filtro, fica de fora da listagem |
| `ativo` | publicada e à venda | todo mundo: feed, busca, detalhe, carrinho |
| `reservado` | num pedido aberto, esperando o comprovante ([#243](https://github.com/Vintex-Ages/back-end/issues/243)) | detalhe público, sinalizada (RN-44); fora do feed e da busca |
| `vendido` | pedido confirmado pela administradora | detalhe público, com selo de vendida; fora do feed e da busca |
| `despublicado` | tirada da vitrine pelo vendedor (RN-52) | só o vendedor; o detalhe público responde 404 |

A busca do catálogo e a [busca por semelhança](./busca-por-semelhanca) (chat, recomendação, foto) mostram só peça `ativo`, montadas pelas mesmas condições (`_condicoes_do_catalogo`).

O detalhe público (`GET /api/products/{id}`) declara o que é público, e não o que é proibido: `PUBLICOS = {"ativo", "reservado", "vendido"}`. Uma situação nova nasce fora do público por padrão ([#238](https://github.com/Vintex-Ages/back-end/issues/238)).

## Transições

| De → para | Gatilho |
| --- | --- |
| `rascunho → ativo` | vendedor publica: `POST /users/me/products/{id}/publish`, exige ao menos uma foto (RN-47), que não pode ser a da [etiqueta](./etiqueta-e-composicao), e grava o vetor da [busca por semelhança](./busca-por-semelhanca#quando-a-peça-ganha-vetor) |
| `rascunho → apagado` | vendedor descarta: `DELETE /users/me/products/{id}`, que apaga a peça e as fotos dela ([#271](https://github.com/Vintex-Ages/back-end/issues/271)) |
| `despublicado → ativo` | vendedor republica, pela mesma rota |
| `ativo → despublicado` | vendedor despublica: `POST /users/me/products/{id}/unpublish` |
| `ativo → reservado` | comprador cria o pedido ([#247](https://github.com/Vintex-Ages/back-end/issues/247)) |
| `reservado → ativo` | o pedido expira sem comprovante **enviado** ([#280](https://github.com/Vintex-Ages/back-end/issues/280)) |
| `reservado → vendido` | a administradora aprova o comprovante, e grava `sold_at` ([#251](https://github.com/Vintex-Ages/back-end/issues/251)); ver [Validação do comprovante](./validacao-de-comprovante) |

- **Vendida é imutável** (RN-53): editar ou mudar de situação responde `409 PRODUCT_SOLD`.
- **Reservada também não muda** enquanto o pedido corre: editar ou publicar/despublicar responde `409 PRODUCT_NOT_EDITABLE`. Editar faria a peça diferente do que o comprador comprou; voltar a `ativo` a poria no carrinho de outra pessoa.
- **Descartar rascunho é apagar** ([#271](https://github.com/Vintex-Ages/back-end/issues/271)): a peça e as fotos saem do banco. A RN-52, que manda despublicar sem apagar o histórico, vale para o anúncio que já esteve no ar — rascunho nunca foi público e não tem histórico a preservar. Peça em outra situação responde `409 PRODUCT_NOT_EDITABLE` (`PRODUCT_SOLD`, se vendida).
- As três transições do pedido (`reserve`, `release_for_orders`, `sell_for_order` no repository) são `UPDATE` condicionais: conferem a situação de origem no próprio `WHERE`. Duas compras da mesma peça ao mesmo tempo, só a primeira encontra `ativo`.
- O resumo financeiro do vendedor conta as peças `vendido` pelo `sold_at` (RN-95). É a aprovação do comprovante, e não o checkout, que faz a peça entrar nele.

## A capa na lista do vendedor

`GET /api/users/me/products` devolve `cover_image_url` em cada peça ([#265](https://github.com/Vintex-Ages/back-end/issues/265)). Sem o campo, o painel mostrava um quadrado cinza no lugar da foto.

- **A capa é a foto de menor posição**, a mesma regra do feed. Peça sem foto devolve `null`; como o anúncio não publica sem foto (RN-47), isso só acontece em rascunho.
- **Uma consulta de dados e uma de contagem por página**, qualquer que seja o tamanho dela. A subconsulta da capa (`_cover_image_url()` em `product_repository.py`) é a mesma do feed e entra na consulta da página por `with_expression`, sem N+1. Um teste confere que 1 peça e 4 peças fazem o mesmo número de consultas.
- `Product.cover_image_url` é um `query_expression()`: não é coluna, não tem migração e fica `None` em qualquer consulta que não peça a expressão. O `populate_existing` garante o preenchimento mesmo se a sessão já tiver carregado a peça antes.
- É um campo a mais, opcional, em `ProductManagementResponse`: quem já consome a rota não quebra. O painel do front já lê o campo (`sellerProductService.ts`).

## Filtros do catálogo por loja e localização

O feed público (`GET /api/products`) filtra por `store_id`, `city` e `state`, além de categoria, preço, tamanho, marca, conservação e cor ([#108](https://github.com/Vintex-Ages/back-end/issues/108)). Funcionam deslogado, como toda a leitura (RN-26), e somam-se aos filtros que já existiam: cidade mais categoria devolve a interseção.

- **A localização é dado da loja, não da peça.** O filtro de `city` e `state` olha o endereço da loja, por uma junção externa: loja sem endereço continua no catálogo quando nenhum dos dois é pedido. `city` e `state` comparam sem diferenciar maiúscula e, no Postgres, sem acento.
- **Filtro sem resultado cai nas alternativas** (RN-61), como os outros: a resposta traz `match_type: "fallback"` e as sugestões do catálogo, em vez de lista vazia.
- **Loja inexistente responde `404 STORE_NOT_FOUND`**, e não cai nas alternativas: é referência errada, não busca sem resultado. `store_id` precisa ser maior que zero.
- Antes, o front já mandava cidade e estado e a API descartava os dois sem reclamar, então filtrar por Porto Alegre devolvia o catálogo inteiro.
- A busca por foto aceita `city` e `state`, mas não `store_id` ([Busca por foto](./busca-por-foto)).
