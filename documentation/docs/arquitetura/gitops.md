---
sidebar_position: 1
---

# Arquitetura GitOps

O `vintex-prod` é um monorepo. O código das aplicações vive aqui, em `front-end/` e
`back-end/`, e o repositório também guarda a composição das releases e as regras
de governança. Os repositórios `Vintex-Ages/front-end` e `Vintex-Ages/back-end`
foram declarados encerrados, com PR de encerramento, depois da importação: o
trabalho novo entra neste.

## Estrutura

| Caminho | O que contém |
| --- | --- |
| `front-end/` | aplicação web (React) e suas decisões em `front-end/docs/adr` |
| `back-end/` | API (FastAPI), infraestrutura do back-end e o [portal do back-end](https://github.com/Vintex-Ages/vintex-prod/tree/develop/back-end/documentation) |
| `components/` | manifestos `release.yml` com o commit de origem de cada componente |
| `.github/` | workflows de CI, validação de PR e sincronização de metadados |
| `config/governance/` | configuração de rastreamento de PRs e isenções de issue |
| `documentation/` | este portal |

## Fluxo de branches

```text
feature|bugfix|hotfix|refactor|docs|chore/<issue>-<descricao> -> develop
develop -> qa -> main -> deploy
promote/<componente>-<sha> -> develop
```

- Branches de trabalho nascem de `develop` e voltam para `develop`, com issue.
- `qa` aceita PRs somente de `develop`. `main` aceita somente de `qa`.
- `deploy` aceita PRs somente de `main`.
- A branch `qa` ainda precisa ser criada (#32). Enquanto não existir, o validador
  deixa `main` aceitar PRs de `develop`.
- A presença de `deploy` na regra do validador não significa que exista CD para
  AWS: o [roadmap](../operacao/aws.md) segue como proposta.

As [promoções](../operacao/promocoes.md) com `promote/*` alteram só o manifesto do
componente e dispensam issue.

## O que cada etapa valida

O CI depende do tipo de PR (`Front-end CI` e `Back-end CI`):

| PR | O que roda |
| --- | --- |
| `feature -> develop` | só o que mudou: `front-end/**`, `back-end/**` e, no back-end, infra separada de aplicação |
| `develop -> qa` | todos os testes de aplicação do front-end e do back-end |
| `qa -> main` | os testes de infra |

Sem mudança relevante, o check agregador passa sem rodar os jobs. A regra completa
e o que o `GitOps Validation` confere estão em [Governança de PRs](../governanca/pull-requests.md).

## Responsabilidades

- `.github/scripts/validate-gitops.mjs` e `lib/branch-flow.mjs`: validam o fluxo dos PRs, as issues e os manifestos.
- `.github/scripts/sync-pr-metadata.mjs`: sincroniza labels, responsáveis, milestone e Project quando a GitHub App está configurada.
- `config/governance/pr-automation.json`: repositórios de issue aceitos (`front-end` e `back-end`) e padrões de isenção.

Credenciais e configurações sensíveis não pertencem a este repositório público.
