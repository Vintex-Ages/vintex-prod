---
slug: /
sidebar_position: 1
---

# Vintex — Produção

O `vintex-prod` é o monorepo do Vintex. Ele guarda o código do `front-end/` e do
`back-end/` (importados em 29/10 e 04/11 de 2026, com PRs de promoção e de
importação) e as regras que organizam as releases: manifestos GitOps em
`components/`, validações de PR em `.github/` e a configuração de governança em
`config/`.

## Onde começar

- [Arquitetura GitOps](arquitetura/gitops.md): estrutura do monorepo e fluxo de branches.
- [Manifestos e promoções](operacao/promocoes.md): o que os manifestos de `components/` registram hoje.
- [Governança de PRs](governanca/pull-requests.md): branches, issues, validação, CI por tipo de PR e revisão.
- [Roadmap AWS](operacao/aws.md): decisões pendentes antes de habilitar CD.

## Documentação de cada componente

Este portal cobre o repositório como um todo. A documentação do código fica ao
lado dele:

- **Back-end:** portal próprio em
  [`back-end/documentation`](https://github.com/Vintex-Ages/vintex-prod/tree/develop/back-end/documentation),
  com o domínio, a arquitetura e a infraestrutura da API (inclusive staging e
  produção na AWS). Decisões de arquitetura em
  [`back-end/.ai/adr`](https://github.com/Vintex-Ages/vintex-prod/tree/develop/back-end/.ai/adr),
  listadas no portal em *Arquitetura › Decisões*.
- **Front-end:** decisões de arquitetura em
  [`front-end/docs/adr`](https://github.com/Vintex-Ages/vintex-prod/tree/develop/front-end/docs/adr).
  Ainda não há portal.

## Rascunho por PR

O [mapa de caminhos](https://github.com/Vintex-Ages/vintex-prod/blob/develop/documentation/path-map.json)
indica as páginas deste portal que precisam de revisão quando um PR altera
arquivos do repositório. O rascunho e o preview são informativos; o autor mantém
o conteúdo Markdown e as validações GitOps continuam independentes.

O portal foi adaptado do [PR #255 do front-end](https://github.com/Vintex-Ages/front-end/pull/255).
O deploy automático AWS ainda é uma etapa futura.

## Como ler os marcadores

<span className="verificar">*</span> em vermelho marca um ponto que o texto não
consegue afirmar sozinho: a fonte (issue, PR ou código) diverge ou não deixa
claro o estado real. A nota ao lado diz o que falta, e quem implementou ou
decidiu deve confirmar.
