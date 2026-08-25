# Contribuindo com o vintex-prod

## Fluxo

```text
front-end/deploy -> promote/front-end-<sha> -> develop
back-end/deploy  -> promote/back-end-<sha>  -> develop
develop -> main -> futura AWS
```

- Promoções de componentes alteram somente o manifesto correspondente.
- Alterações de governança usam os prefixos `feature`, `bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, com número de issue.
- `main` aceita somente Pull Requests de `develop`.
- Todo PR exige CI e review; não há merge automático.
- O repositório é público e não pode armazenar segredos.
