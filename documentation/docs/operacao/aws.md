---
sidebar_position: 2
---

# Roadmap AWS

Esta página reflete o [roadmap versionado](https://github.com/Vintex-Ages/vintex-prod/blob/develop/docs/aws-roadmap.md).
O estado aprovado de `main` será a entrada de uma futura implantação AWS. O
fluxo que existe hoje em `develop` valida PRs e roda o CI; ele não cria
infraestrutura, credenciais nem deploy automático.

## O que já existe e o que falta

- **Existe:** o CI por tipo de PR (`Front-end CI` e `Back-end CI`) e a validação
  do fluxo `develop -> qa -> main -> deploy`, descritos em
  [Governança de PRs](../governanca/pull-requests.md).
- **Em andamento:** a pipeline de CI/CD e a criação da branch `qa`, acompanhadas
  na issue #32.
- **Documentado à parte:** o back-end descreve o ambiente de staging que já roda
  no [portal do back-end](https://github.com/Vintex-Ages/vintex-prod/tree/develop/back-end/documentation/docs/infraestrutura).
  Essa infraestrutura é do back-end e não depende desta decisão.

## Decisões antes do CD

Antes de habilitar entrega contínua, definir:

- Contas e ambientes.
- Registry, storage e banco de dados.
- Domínio e observabilidade.
- Estratégia de rollback e política de aprovação.

Os [manifestos de componentes](promocoes.md) mantêm a rastreabilidade dos commits
selecionados. Serviços AWS, topologia, custos e procedimentos de implantação
dependem das decisões futuras; não constituem capacidades já implementadas neste
repositório.
