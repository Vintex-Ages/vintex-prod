# Contribuindo com o vintex-prod

## Fluxo

```text
feature/* -> develop -> qa -> main -> deploy
```

- Código novo entra por Pull Request a partir de uma branch de trabalho para `develop`.
- Cada etapa só aceita PR da anterior: `qa` recebe de `develop`, `main` recebe de `qa` e `deploy` recebe de `main`. As validações `PR Governance` e `GitOps Validation` recusam qualquer outro caminho. Se a branch `qa` não existir, `main` aceita `develop`.
- Promoções automáticas do `back-end` (`promote/back-end-<sha>`) dispensam issue, entram no Project geral e alteram somente o manifesto `components/back-end/release.yml`. Elas deixam de existir quando o `back-end` for importado.
- O `front-end` é editado diretamente neste repositório, em `front-end/`.

## Branches de trabalho

Crie branches a partir de `develop`, com palavras minúsculas separadas por hífen. Todo trabalho deve possuir uma issue, inclusive alterações de governança e de pipeline:

```text
feature/<issue>-<descricao>
bugfix/<issue>-<descricao>
hotfix/<issue>-<descricao>
refactor/<issue>-<descricao>
docs/<issue>-<descricao>
chore/<issue>-<descricao>
```

## Pull Requests

Preencha o template inteiro (Descrição, O que foi feito, Tipo de mudança, Componentes afetados, Uso de IA, Evidências, Prints, Checklist e Observações).

### Campos obrigatórios

| Campo | Regra | Validação |
|---|---|---|
| Nome da branch | `<prefixo>/<issue>-<descricao>` com um dos prefixos acima | `GitOps Validation` |
| `Closes #<issue>` | Issue deste repositório (`Closes #12`) ou de `Vintex-Ages/front-end` / `Vintex-Ages/back-end` (`Closes Vintex-Ages/front-end#426`). A primeira issue citada tem o número da branch e as issues citadas não podem ter milestones diferentes. Promoções automáticas dispensam | `GitOps Validation` |
| Descrição | Seção preenchida | `PR Governance` |
| O que foi feito | Seção preenchida | `PR Governance` |
| Uso de IA | Informe as ferramentas e onde foram usadas, ou escreva "Nenhuma" | `PR Governance` |
| Tipo de mudança | Exatamente uma opção, em inglês, que corresponda ao prefixo da branch (`Feature` para `feature/...`): `Feature`, `Bugfix`, `Hotfix`, `Refactor`, `Docs` ou `Chore`. `Promotion` e `Infra` valem só para promoções entre branches do fluxo e não geram label `change:*` | `PR Governance` |

Em PRs de promoção (`qa`, `main`, `deploy`) o tipo e a issue não são exigidos. Componentes afetados, Evidências, Prints, Checklist e Observações não têm validação automática, mas devem ser preenchidos.

### Metadados e Project

- Assignees e labels são unidos a partir das issues; a milestone (comparada pelo título) e os campos dos Projects vêm da issue primária. Os repositórios aceitos para `Closes` estão em `issueRepositories`, em `config/governance/pr-automation.json`.
- O PR entra no Project geral. Draft fica em `In progress`, PR pronto em `In review` e merge em `Done`.
- Como esses PRs apontam para `develop` e `main` é a branch padrão, o GitHub não cria o vínculo nativo em Development a partir da keyword. Para exibi-lo, vincule o PR manualmente na sidebar Development ou crie a branch pela própria issue antes de começar o trabalho.
- Faça commits pequenos; um novo commit invalida aprovações anteriores.

## Revisão

O GitHub solicita review aos donos do código (`.github/CODEOWNERS`: integrantes de AGES III e AGES IV). Todo PR exige CI verde e review, e não há merge automático.

- `feature` -> `develop`, `develop` -> `qa` e `qa` -> `main`: **pelo menos uma aprovação** de AGES III ou AGES IV.
- `main` -> `deploy`: **duas aprovações**.

## CI

O check a exigir é o **`CI gate`**: ele agrega os jobs que rodaram e reprova se algum job executado falhar. O que roda depende do destino do PR:

| Destino | O que roda |
|---|---|
| `develop` | Só os componentes cuja pasta mudou (`front-end/`, `back-end/`...; mapa em `.github/config/ci-paths.json`). Documentação não roda testes. No front-end só rodam os testes afetados pela mudança; se nenhum teste for identificado, ou se o arquivo alterado não for do código-fonte (`package.json`, configs...), roda a suíte completa. No back-end roda o CI completo do componente |
| `qa` | Tudo (front-end, back-end e automação) mais os jobs de **infra**: Terraform, runtime da staging, infra local completa e validação da chave do gateway de IA |
| `main` e `deploy` | Tudo, sem os jobs de infra |

No front-end, lint, formatação e tipos (`Static checks`) rodam primeiro. Se passarem, testes, cobertura, build e audit rodam em paralelo. Alterar workflows (`.github/workflows/**`) ou o mapa de caminhos força a validação completa. Detalhes em [`docs/pipeline-ci-cd.md`](docs/pipeline-ci-cd.md).

## Deploy

Merge em `main` faz o deploy da staging; merge em `deploy` faz o da produção. Ambos exigem variáveis e Environments configurados no GitHub e ficam inativos, com aviso, até lá. Ver [`docs/pipeline-ci-cd.md`](docs/pipeline-ci-cd.md).

## Regras gerais

- O repositório é público e não pode armazenar segredos: credenciais AWS usam OIDC (sem chave de longa duração) e valores sensíveis ficam no SSM Parameter Store.
