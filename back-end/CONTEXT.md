# Vintex

Marketplace de moda circular: brechós anunciam peças únicas, compradores as encontram pelo catálogo ou pela assistente Vintex. Este arquivo fixa a linguagem do domínio e o valor que cada termo tem na API. Complementa `.ai/glossary.md` (termos de arquitetura) e espelha o `front-end/CONTEXT.md`: quando um termo mudar, mude nos dois.

## Language

### Situação da peça (`products.status`)

**Rascunho** (`rascunho`):
Peça gravada pelo vendedor e ainda não publicada. Só aparece na aba de rascunhos do próprio vendedor.
_Avoid_: Draft

**Anunciada** (`ativo`):
Peça publicada e à venda. Aparece no feed, na busca e no detalhe público.
_Avoid_: Ativa, publicada

**Reservada** (`reservado`):
Peça num pedido aberto, esperando o comprovante. Sai do feed e da busca, mas o detalhe continua público.

**Vendida** (`vendido`):
Peça de um pedido confirmado pela administradora. Estado final: não volta à venda nem pode ser editada.
_Avoid_: Esgotada

**Pausada** (`despublicado`, sem `moderated_at`):
Peça que o vendedor tirou da vitrine e pode republicar.
_Avoid_: Despublicada, inativa

**Suspensa** (`despublicado`, com `moderated_at`):
Peça que a administradora tirou do ar, com motivo. Só a administradora a devolve à vitrine, e ela volta ao estado de antes da suspensão.
_Avoid_: Banida, removida, pausada (quando foi a moderação)

### Pedido (`orders.status`)

**Pedido**:
Compra das peças de uma loja só. Um carrinho com N lojas gera N pedidos.

**Aguardando comprovante** (`aguardando_comprovante`) → **Em análise** (`em_analise`) → **Confirmado** (`confirmado`):
Estados gravados. Depois de Confirmado, **Preparando**, **Enviado** e **Concluído** (`preparando`, `enviado`, `concluido`) são derivados da data da aprovação, sem transportadora. **Expirado** (`expirado`) é o pedido que venceu sem comprovante.

**Comprovante**:
Arquivo do Pix que o comprador anexa ao pedido (`payments`, `pendente` / `aprovado` / `rejeitado`). A plataforma não processa o Pix; a administradora confere à mão.
_Avoid_: Recibo, pagamento (quando se fala do arquivo)

**Reclamação**:
Relato que o comprador envia sobre um pedido já confirmado, com um dos dois motivos (`nao_recebido` ou `danificado`) e um texto livre. Não é pública: só a administradora a lê.
_Avoid_: Denúncia, report, disputa

### Loja e pessoas

**Vendedor**:
Usuário com registro em `sellers`. Não é um papel gravado: a mesma pessoa pode comprar e vender.

**Administradora**:
Usuário com `users.is_admin`. Confere comprovantes, lê reclamações e modera anúncios.
_Avoid_: Admin (em texto para o usuário), dono da plataforma

**Selo Confiável** (`verified`):
Indicador de verificação **simulada**: confere só o dígito verificador do CPF ou CNPJ, sem consulta externa.
_Avoid_: Verificado (como se houvesse checagem real)

**Favoritar**:
O comprador salva uma peça para si. Avisa o vendedor (`favorite`), uma vez por pessoa e por peça.
