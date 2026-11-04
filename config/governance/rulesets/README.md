# Rulesets do vintex-prod

Fluxo: `feature -> develop -> qa -> main -> deploy`.

| Ruleset | Branches | Aprovações (time AGES III) | Merge | Checks obrigatórios |
|---|---|---|---|---|
| `develop governance` | `develop` | 1 | merge, squash | GitOps Validation, PR Metadata, Front-end CI, Back-end CI |
| `qa/main governance` | `qa`, `main` | 1 | só merge commit | os mesmos |
| `deploy governance` | `deploy` | 2 | só merge commit | GitOps Validation, PR Metadata |

Todas: aprovação da última alteração, invalidação de aprovações antigas a cada push, conversas resolvidas, sem force-push e sem exclusão. AGES IV tem bypass somente via PR em `develop`, `qa` e `main`; `deploy` não tem bypass.

`Front-end CI` e `Back-end CI` não disparam em PRs para `deploy` (workflows só observam `develop`, `qa` e `main`), por isso não são exigidos lá.

Promoções (`qa -> main`, `main -> deploy`) usam merge commit para não reescrever o histórico entre as branches.

## Aplicar

Exige admin. Os rulesets são aplicados por quem tem permissão; este repositório só guarda o estado desejado.

```bash
bash config/governance/rulesets/apply.sh --dry-run
bash config/governance/rulesets/apply.sh
```

O script cria ou atualiza os três rulesets e remove o antigo `develop/main/deploy governance` (id 21583895), que exige 0 aprovações.
