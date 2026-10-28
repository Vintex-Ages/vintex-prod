---
status: accepted
date: 2026-10-26
supersedes: 0001 (em parte)
---

# Rascunhos ganham aba própria no painel, fora das contagens

A ADR 0001 tirou o **Rascunho** do painel do vendedor e pediu ao back uma rotina que apagasse os abandonados. Em vez da rotina, o back abriu a listagem e o descarte para o próprio vendedor (back-end#271): `GET /api/users/me/products?status=rascunho` lista, e `DELETE /api/users/me/products/{id}` apaga a peça e as fotos. Sem filtro, a listagem continua sem rascunho.

O custo da 0001 apareceu na prática: quem sobe a foto, espera a IA preencher, ajusta os campos e fecha a tela na revisão perde o acesso ao trabalho, que continua gravado no banco (#345).

**Decidimos que o painel tem uma aba "Rascunhos" ao lado dos chips de status**, com **Continuar** (volta para `/seller/products/:id/review`, onde o rascunho nasceu) e **Descartar** (pede confirmação e apaga). O que a 0001 decidiu sobre o saldo continua valendo: o rascunho **não entra** na lista "Todas", nos três cards nem no "N peças no total". A aba busca os dados por conta própria e não toca nessas contagens (RN-51).

## Considered Options

- **Manter a 0001** (sem tela de rascunho): o vendedor segue sem caminho de volta para um cadastro que fechou no meio, e o descarte fica a cargo de uma rotina do back que não existe.
- **Rascunho em "Todas" com ação "Continuar"**: já descartada na 0001, porque mistura cadastro pela metade com o saldo de peças.

## Consequences

- O `useSellerProducts` continua filtrando `rascunho` em memória. A aba usa um hook próprio (`useSellerDrafts`), que só consulta quando a aba é aberta.
- **A data do rascunho não aparece.** A #345 pede "nome, foto quando houver, e a data", mas o `ProductManagementResponse` do back não tem data de criação nem de atualização. É uma pendência de contrato com o par do back. O front não inventa a data.
- O descarte é definitivo, por isso pede confirmação e não oferece "Desfazer".
