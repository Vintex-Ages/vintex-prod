---
sidebar_position: 1
---

# Manifestos e promoções

Cada componente possui um manifesto: `components/front-end/release.yml` ou
`components/back-end/release.yml`. Ele referencia um commit imutável da branch
`deploy` do repositório de origem, no momento em que o componente foi promovido.

## O que os manifestos registram hoje

Os dois repositórios de origem foram importados para este monorepo, então os
manifestos viraram o registro do **último snapshot promovido**, e não mais a
referência de código a implantar:

| Componente | Último snapshot | Promovido em |
| --- | --- | --- |
| front-end | `5adf7a0` | 28/10/2026 |
| back-end | `86ea0a4` | 04/11/2026 (PR de promoção #47, depois a importação do código no #49) |

O código seguinte entra por PR de trabalho em `front-end/` e `back-end/`, sem novo
`promote/*`. <span className="verificar" title="Os manifestos continuam sendo validados, mas nenhuma regra diz se haverá novas promoções depois da importação.">*</span>

> <span className="verificar">*</span> **Confirmar com quem mantém a governança.**
> Os manifestos continuam existindo e o `GitOps Validation` continua aceitando
> `promote/*`. Falta decidir se eles seguem como fonte para a futura implantação
> ou se serão substituídos pelo próprio commit de `main`. Até lá, esta página só
> descreve o que existe.

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

O PR de `develop` para `qa` e depois de `qa` para `main` aprova a composição
operacional (enquanto `qa` não existir, `main` recebe de `develop`). O merge
exige CI e revisão conforme a [governança](../governanca/pull-requests.md); não
há merge automático. A implantação AWS continua descrita no [roadmap](aws.md).
