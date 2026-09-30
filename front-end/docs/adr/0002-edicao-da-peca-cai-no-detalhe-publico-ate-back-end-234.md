---
status: accepted · provisória até back-end#234 e back-end#146
date: 2026-09-30
---

# Edição da peça cai no detalhe público enquanto a rota do vendedor não existe

O formulário de edição (`/seller/products/:id`) e a revisão (`/seller/products/:id/review`) carregam a peça por `sellerProductService.getById`, que chama `GET /api/users/me/products/{id}` (back-end#234) — rota que ainda não existe na `develop` do back. Com a API real, editar qualquer peça ou dar F5 na revisão mostra erro de carregamento com um "Tentar de novo" que nunca funciona. O mesmo vale para a visão financeira do painel, que chama `GET /api/users/me/sales/summary` (back-end#146), também inexistente.

**Decidimos que `getById` usa o detalhe público `GET /api/products/{id}` como fallback** quando a rota do vendedor não existe — o envelope de erro do back responde 405 `METHOD_NOT_ALLOWED` (o caminho existe só com `PATCH`) ou 404 `NOT_FOUND` genérico, nunca o `PRODUCT_NOT_FOUND` de peça inexistente. O detalhe público traz todos os campos do formulário — `""` vira ausente, `media[]` vira `images` ordenado por `position`, `ai_corrections` não faz falta porque o back acumula as correções no `PATCH`. Isso faz a edição de peça **Anunciada** funcionar hoje. Onde nenhum dos dois caminhos resolve — peça **Pausada** (o detalhe público responde 404 para `despublicado`) e o resumo financeiro — a tela mostra um estado próprio de "ainda não disponível", sem botão de tentar de novo, em vez do erro genérico. A adaptação fica no service; as telas só distinguem "indisponível por enquanto" de "falhou".

## Considered Options

- **Só o estado honesto, sem fallback:** mais simples, mas deixa a edição de peça Anunciada — o caso principal — quebrada até a #234.
- **Manter o erro genérico:** tratava como falha de rede um bloqueio conhecido do back, e o "Tentar de novo" prometia algo impossível.

## Consequences

- O fallback é **provisório**: sai quando a back-end#234 entrar na `develop`. O código aponta para esta ADR e para a issue.
- Hoje o detalhe público também devolve `rascunho` (só bloqueia `despublicado`), e por isso o fallback cobre o F5 na revisão. Isso é um defeito do back — rascunho não deveria ser público — e, quando for corrigido, a revisão volta a depender da #234. O caso principal (Anunciada) não depende desse defeito.
- O que o fallback lê é o retrato público da peça: se um dia o detalhe público omitir campo que o vendedor edita, salvar a partir dele apagaria o campo. Qualquer mudança no `ProductDetailResponse` do back precisa ser conferida contra o formulário enquanto o fallback existir.
