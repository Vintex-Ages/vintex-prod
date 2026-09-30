---
status: accepted (front) · proposta (back)
date: 2026-09-30
---

# Rascunho fica fora do painel do vendedor e é descartado pelo back

O **Rascunho** nasce quando o vendedor clica em "Continuar para revisão" no cadastro da peça (`createDraft`) e vira **Anunciada** ao "Publicar" na revisão. Quem desiste no meio deixa um rascunho gravado. O `GET /api/users/me/products` sem `?status=` devolve esses rascunhos junto com as peças Anunciadas, Vendidas e Pausadas, e o painel (`/seller`, #220) os mostrava em "Todas" sem ação nenhuma, contados em "N peças no total" mas em nenhum dos três cards.

**Decidimos que o painel do vendedor não apresenta rascunhos**, nem na lista, nem nos cards, nem no total. O rascunho é um estado intermediário do fluxo de cadastro, não uma peça do vendedor: o painel é visão de saldo das peças que já foram para a vitrine (RN-51), e é o que o back já entende por "Anunciada" (`store_repository.py` exclui `rascunho` da contagem pública).

**Em troca, pedimos ao back uma rotina que apague rascunhos abandonados** — sem ela, cada desistência vira uma linha órfã que ninguém consegue ver nem apagar. O prazo de retenção e o mecanismo (job agendado, limpeza na criação do próximo rascunho etc.) são decisão do back.

## Considered Options

- **Rascunho com espaço completo no painel** (chip, card próprio e ação "Continuar"): muda o layout de três cards aprovado na #220 e transforma um estado transitório em categoria permanente.
- **Rascunho só em "Todas", com "Continuar" e o total explicando** ("4 peças no total, 1 em rascunho"): preserva o trabalho do vendedor, mas mantém no painel algo que não é peça anunciável e empurra a gestão de lixo para a tela.

## Consequences

- O front filtra `rascunho` em memória no `useSellerProducts`: o filtro `?status=` do back não aceita "tudo menos rascunho", e o painel já busca todas as páginas para calcular as contagens.
- Não existe tela que liste rascunhos. Um rascunho abandonado só é alcançável por link direto (`/seller/products/:id`) até o back descartá-lo — aceitável por ser dado que o próprio vendedor abandonou.
- Se um dia existir "retomar cadastro", ele entra como fluxo próprio, e esta ADR é revista.
