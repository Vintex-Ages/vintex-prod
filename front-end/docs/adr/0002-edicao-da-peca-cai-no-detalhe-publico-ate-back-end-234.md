---
status: superseded · fallback de edição removido pela front-end#339; resumo financeiro pendente de back-end#146
date: 2026-09-30
updated: 2026-10-21
---

# Edição da peça do vendedor: remoção do fallback para o detalhe público

## Contexto

O formulário de edição (`/seller/products/:id`) e a revisão
(`/seller/products/:id/review`) carregam a peça por
`sellerProductService.getById`.

Na decisão original, registrada em 30/09/2026, a rota
`GET /api/users/me/products/{id}` ainda não estava disponível na
`develop` do back-end.

Por isso, o frontend utilizava provisoriamente
`GET /api/products/{id}` como fallback quando a rota do vendedor
respondia 405 `METHOD_NOT_ALLOWED` ou 404 `NOT_FOUND` genérico.

O detalhe público permitia carregar algumas peças, mas não atendia
corretamente todos os estados. Em particular, uma peça
`despublicado` retornava 404, impedindo o vendedor de editá-la.

Esse comportamento também fazia a tela exibir a mensagem de que
editar uma peça pausada ainda não estava disponível, orientando
o vendedor a republicá-la antes da edição.

## Decisão original

Enquanto a rota autenticada não estivesse disponível, o serviço
tentaria carregar a peça pelo detalhe público.

Essa solução era temporária e tinha limitações conhecidas:

- O detalhe público não garantia acesso a todos os estados da peça.
- O formato da resposta pública era diferente do formato usado
  pelo formulário de edição.
- O fallback dependia de comportamentos da API pública que não
  deveriam ser utilizados para gerenciar anúncios do vendedor.
- Peças despublicadas não podiam ser editadas diretamente.

## Atualização — front-end#339

A rota `GET /api/users/me/products/{product_id}` foi disponibilizada
na `develop` do back-end em 30/09/2026.

Com essa dependência atendida, o frontend passou a utilizar
exclusivamente a rota autenticada para carregar o detalhe da peça
do vendedor.

O método `sellerProductService.getById` não utiliza mais
`GET /api/products/{id}` como fallback.

A rota autenticada permite ao proprietário consultar sua peça
nos quatro estados:

- `rascunho`
- `ativo`
- `vendido`
- `despublicado`

Para peças pertencentes a outro vendedor, a API continua
respondendo 404 `PRODUCT_NOT_FOUND`.

A edição de peças despublicadas não depende mais de republicação
prévia.

Essa mudança também permite editar rascunhos quando a rota
pública retorna 404 para esse estado, conforme o comportamento
previsto na back-end#240.

## Consequências

- O fallback para o detalhe público foi removido do serviço.
- O formulário de edição utiliza o contrato `ProductDraftResponse`
  retornado pela rota autenticada.
- Não é mais necessário converter o formato `ProductDetailResponse`
  da rota pública para os campos do formulário.
- Erros da rota autenticada são tratados diretamente, sem uma
  segunda requisição ao detalhe público.
- O proprietário pode carregar peças despublicadas para edição
  sem republicá-las.
- O acesso a peças de outros vendedores permanece restrito,
  com resposta 404.

## Pendência independente: resumo financeiro

A rota `GET /api/users/me/sales/summary`, relacionada à
back-end#146, permanece uma dependência independente desta decisão.

Enquanto essa rota não estiver disponível, o serviço mantém
o tratamento `NOT_AVAILABLE_YET` para o resumo financeiro.

A front-end#339 não altera esse comportamento.