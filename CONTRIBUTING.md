# Contribuindo com o vintex-prod

## Fluxo

```text
feature/* -> develop -> qa -> main -> deploy
```

- Código novo entra por Pull Request a partir de uma branch de trabalho para `develop`. Prefixos aceitos: `feature`, `bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, seguidos do número da issue (`feature/123-descricao`).
- Cada etapa só aceita PR da anterior: `qa` recebe de `develop`, `main` recebe de `qa` e `deploy` recebe de `main`. A validação `PR Governance` recusa qualquer outro caminho.
- PRs para `develop` usam `Closes #<issue>`; a primeira issue deve coincidir com o número da branch e issues adicionais não podem ter milestones conflitantes. O corpo segue o template do PR (um único *Tipo de mudança*, seções *Descrição*, *O que foi feito* e *Uso de IA* preenchidas).
- Como esses PRs apontam para `develop` e `main` é a branch padrão, o GitHub não cria o vínculo nativo em Development a partir da keyword. Para exibi-lo, vincule o PR manualmente na sidebar Development ou crie a branch pela própria issue antes de começar o trabalho.
- Promoções automáticas do `back-end` (`promote/back-end-<sha>`) dispensam issue e alteram somente `components/back-end/release.yml`. Elas deixam de existir quando o `back-end` for importado.
- O `front-end` é editado diretamente neste repositório, em `front-end/`.

## CI

O check a exigir é o **`CI gate`**: ele agrega os jobs que rodaram. Em PRs para `develop` só rodam os componentes alterados (mapa em `.github/config/ci-paths.json`); alterar workflows ou esse mapa força a validação completa. PRs para `qa`, `main` e `deploy` rodam tudo; PRs para `main` rodam ainda o **`Infra gate`**.

## Deploy

Merge em `main` faz o deploy da staging; merge em `deploy` faz o da produção. Ambos exigem variáveis e Environments configurados no GitHub e ficam inativos, com aviso, até lá. Ver [`docs/pipeline-ci-cd.md`](docs/pipeline-ci-cd.md).

## Regras gerais

- Alterações de governança e pipeline também seguem o fluxo acima, com issue.
- O GitHub solicita review aos integrantes configurados. Novo commit invalida aprovações anteriores e não há merge automático.
- O repositório é público e não pode armazenar segredos: credenciais AWS usam OIDC (sem chave de longa duração) e valores sensíveis ficam no SSM Parameter Store.
