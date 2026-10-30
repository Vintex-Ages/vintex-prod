---
sidebar_position: 1
---

# Manifestos e promoções

Cada componente possui um manifesto: `components/front-end/release.yml` ou
`components/back-end/release.yml`. Ele referencia um commit imutável da branch
`deploy` do repositório de origem.

## Campos do manifesto

| Campo | Significado |
| --- | --- |
| `schema_version` | Versão do formato, atualmente `1`. |
| `component` | `front-end` ou `back-end`. |
| `source_repository` | Repositório `Vintex-Ages/<componente>`. |
| `source_branch` | Branch de origem, `deploy`. |
| `source_sha` | SHA completo de 40 caracteres do commit de origem. |
| `promoted_at` | Data registrada pela promoção. |
| `source_run_url` | Link da execução de origem para consulta das evidências. |

## Entrada em develop

A branch `promote/<componente>-<sha>` usa os sete primeiros caracteres do SHA no
nome. O PR altera exclusivamente o manifesto correspondente e tem `develop`
como destino. Essas promoções dispensam issue e entram no Project geral.

O workflow `GitOps Validation` verifica o arquivo alterado, o componente, o
repositório, a branch de origem e o formato do SHA completo, além de consultar se
o commit existe no repositório de origem. Atualmente ele não comprova que o
commit pertence à branch `deploy`, nem valida a data ou a execução de origem;
essas evidências também devem ser conferidas na revisão.

## Composição aprovada

As promoções de front-end e back-end são independentes em `develop`. O PR de
`develop` para `main` aprova a composição operacional. O merge exige CI e revisão
conforme a [governança](../governanca/pull-requests.md); não há merge automático.
A implantação AWS continua descrita no [roadmap](aws.md).
