# Vintex

Marketplace de moda circular: brechós anunciam peças únicas, compradores as encontram pelo catálogo ou pela assistente Vintex. Complementa `.ai/glossary.md`, que continua sendo lido junto.

## Language

### Status da peça

**Rascunho**:
Estado intermediário do cadastro: peça gravada e ainda não publicada. Não é peça do vendedor para fins de painel nem de vitrine (ver `docs/adr/0001`).
_Avoid_: Draft

**Anunciada**:
Peça publicada e à venda na vitrine (valor `ativo` no back).
_Avoid_: Ativa, publicada

**Pausada**:
Peça que o vendedor tirou da vitrine temporariamente e pode republicar (valor `despublicado` no back).
_Avoid_: Despublicada, inativa

**Vendida**:
Peça que já foi comprada; estado final, não volta à venda nem pode ser editada.
_Avoid_: Esgotada

### Carrinho

**Indisponível**:
Peça no carrinho que não pode ser comprada agora — está Vendida ou Pausada. Não conta no subtotal.
_Avoid_: Unavailable, vendida (quando o motivo é outro)

Uma peça Indisponível por estar **Vendida** sai do carrinho com aviso; uma Indisponível por estar **Pausada** permanece nele e volta a contar se for republicada.
