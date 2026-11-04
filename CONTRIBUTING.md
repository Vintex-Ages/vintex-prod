# Contribuindo com o vintex-prod

## Fluxo

```text
front-end/deploy -> promote/front-end-<sha> -> develop
back-end/deploy  -> promote/back-end-<sha>  -> develop
develop -> qa -> main -> futura AWS
```

## Branches de trabalho

Crie branches a partir de `develop`, com palavras minúsculas separadas por hífen. Todo trabalho deve possuir uma issue:

```text
feature/<issue>-<descricao>
bugfix/<issue>-<descricao>
hotfix/<issue>-<descricao>
refactor/<issue>-<descricao>
docs/<issue>-<descricao>
chore/<issue>-<descricao>
```

## Pull Requests

- Preencha o template inteiro (Descrição, O que foi feito, Tipo de mudança, Componentes afetados, Uso de IA, Evidências e Checklist).
- Selecione exatamente um tipo de mudança, na palavra em inglês exigida pela validação.
- Declare como IA foi utilizada ou informe explicitamente que não houve uso.
- Assignees e labels são unidos a partir das issues; a milestone e os campos dos Projects vêm da issue primária.
- O PR entra no Project geral. Draft fica em `In progress`, PR pronto em `In review` e merge em `Done`.
- Faça commits pequenos; um novo commit invalida aprovações anteriores.

## Regras do fluxo GitOps

- Promoções de componentes alteram somente o manifesto correspondente.
- Alterações de governança usam os prefixos `feature`, `bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, com número de issue.
- PRs de governança usam `Closes #<issue>`; a primeira issue deve coincidir com a branch e issues adicionais não podem ter milestones conflitantes.
- O trabalho de front-end e back-end pode fechar issues dos repositórios de origem: use `Closes Vintex-Ages/front-end#<issue>` ou `Closes Vintex-Ages/back-end#<issue>`. A primeira issue citada ainda dá o número da branch (`feature/426-...` para `Closes Vintex-Ages/front-end#426`). Os repositórios aceitos estão em `issueRepositories`, em `config/governance/pr-automation.json`. Milestones são comparadas pelo título, e o PR recebe a milestone de mesmo título deste repositório.
- Marque em **Tipo de mudança** a opção que corresponde ao prefixo da branch (`Feature` para `feature/...`). `Promotion` e `Infra` não geram label `change:*`.
- Como esses PRs apontam para `develop` e `main` é a branch padrão, o GitHub não cria o vínculo nativo em Development a partir da keyword. Para exibi-lo, vincule o PR manualmente na sidebar Development ou crie a branch pela própria issue antes de começar o trabalho.
- `qa` aceita somente Pull Requests de `develop`, e `main` somente de `qa`. Enquanto a branch `qa` não existir, `main` continua aceitando `develop`.
- Promoções automáticas dispensam issue, mas entram no Project geral.
- O GitHub solicita review aos quatro integrantes de AGES III. O merge exige duas aprovações vigentes, que podem vir de AGES III ou AGES IV.
- O CI depende do tipo de PR (`Front-end CI` e `Back-end CI`): `feature -> develop` roda só o que mudou (`front-end/**`, `back-end/**` e, no back-end, infra separada de aplicação); `develop -> qa` roda todos os testes de front-end e back-end; `qa -> main` roda os testes de infra. Sem mudança relevante, o check agregador passa sem rodar os jobs. A branch `qa` ainda precisa ser criada (#32); enquanto não existir, um PR `develop -> main` roda só a infra.
- Todo PR exige CI e review; novo commit invalida aprovações anteriores e não há merge automático.
- O repositório é público e não pode armazenar segredos.
