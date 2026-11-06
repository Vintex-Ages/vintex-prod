# Rulesets do vintex-prod

Fluxo: `feature -> develop -> qa -> main -> deploy`.

| Ruleset | Branches | Aprovações | Merge | Checks obrigatórios |
|---|---|---|---|---|
| `develop governance` | `develop` | 1 | merge, squash | GitOps Validation, PR Metadata, Front-end CI, Back-end CI |
| `qa/main governance` | `qa`, `main` | 1 | só merge commit | os mesmos |
| `deploy governance` | `deploy` | 2 | só merge commit | GitOps Validation, PR Metadata |

Todas: aprovação da última alteração, invalidação de aprovações antigas a cada push, conversas resolvidas, sem force-push e sem exclusão. AGES IV tem bypass somente via PR em `develop`, `qa` e `main`; `deploy` não tem bypass.

`Front-end CI` e `Back-end CI` não disparam em PRs para `deploy` (workflows só observam `develop`, `qa` e `main`), por isso não são exigidos lá.

## Quem aprova

A aprovação exige **dono do código** (`require_code_owner_review`), e os donos são as pessoas listadas em `.github/CODEOWNERS`: AGES III (LucasVinhatti1, Matheus-Zanchetta, NicholasAstor, v-Kaefer) e AGES IV (AdrielleDewes, Jpbeltrand, LeoSimonn, MauroSachs, dudu-wolf). AGES I e II não são donos, não têm bypass e não conseguem mergear sem aprovação de AGES III ou IV. Não há times nos rulesets; a lista de pessoas é o `CODEOWNERS`.

Limites do GitHub: rulesets só aceitam time como revisor obrigatório, então a contagem (1, ou 2 em `deploy`) pode ser completada por qualquer aprovação, mas ao menos uma precisa ser de um dono. O `CODEOWNERS` é lido da branch de destino; enquanto `qa`, `main` e `deploy` não recebem o arquivo por promoção, vale só a contagem de aprovações nelas.

Promoções (`qa -> main`, `main -> deploy`) usam merge commit para não reescrever o histórico entre as branches.

## Aplicar

Exige admin. Os rulesets são aplicados por quem tem permissão; este repositório só guarda o estado desejado.

```bash
bash config/governance/rulesets/apply.sh --dry-run
bash config/governance/rulesets/apply.sh
```

O script cria ou atualiza os três rulesets e remove o antigo `develop/main/deploy governance` (id 21583895), que exige 0 aprovações.
