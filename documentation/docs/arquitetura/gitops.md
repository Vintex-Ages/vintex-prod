---
sidebar_position: 1
---

# Arquitetura GitOps

O código das aplicações vive em `Vintex-Ages/front-end` e `Vintex-Ages/back-end`.
O `vintex-prod` guarda a composição dos componentes em manifestos versionados.
Promover um componente não copia seu código para este repositório.

## Fluxo de branches

```text
front-end/deploy -> promote/front-end-<sha> -> develop
back-end/deploy  -> promote/back-end-<sha>  -> develop
develop -> main -> deploy
```

`develop` recebe promoções independentes. `main` representa a composição
operacional aprovada e é a fonte prevista para uma futura implantação AWS.
O validador também reconhece `deploy`, que aceita PRs somente de `main`;
a presença dessa branch não significa que já exista CD para AWS.

## Responsabilidades

- `components/`: manifestos com o commit de origem de cada componente.
- `.github/scripts/validate-gitops.mjs`: valida o fluxo dos PRs e os manifestos de promoções.
- `.github/scripts/sync-pr-metadata.mjs`: sincroniza metadados e Project quando a GitHub App está configurada.
- `config/governance/pr-automation.json`: configura rastreamento e padrões de isenção de issue.

As [promoções](../operacao/promocoes.md) precisam de evidências rastreáveis.
As mudanças de governança seguem o fluxo de [PRs com issue](../governanca/pull-requests.md).
Credenciais e configurações sensíveis não pertencem a este repositório público.
