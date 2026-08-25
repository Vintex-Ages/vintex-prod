# Contribuindo com o vintex-prod

## Fluxo

```text
front-end/deploy -> promote/front-end-<sha> -> develop
back-end/deploy  -> promote/back-end-<sha>  -> develop
develop -> main -> futura AWS
```

- Promoções de componentes alteram somente o manifesto correspondente.
- Alterações de governança usam os prefixos `feature`, `bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, com número de issue.
- PRs de governança usam `Closes #<issue>`; a primeira issue deve coincidir com a branch e issues adicionais não podem ter milestones conflitantes.
- Como esses PRs apontam para `develop` e `main` é a branch padrão, o GitHub não cria o vínculo nativo em Development a partir da keyword. Para exibi-lo, vincule o PR manualmente na sidebar Development ou crie a branch pela própria issue antes de começar o trabalho.
- `main` aceita somente Pull Requests de `develop`.
- Promoções automáticas dispensam issue, mas entram no Project geral.
- O GitHub solicita review aos quatro integrantes de AGES III. O merge exige duas aprovações vigentes, que podem vir de AGES III ou AGES IV.
- Todo PR exige CI e review; novo commit invalida aprovações anteriores e não há merge automático.
- O repositório é público e não pode armazenar segredos.
