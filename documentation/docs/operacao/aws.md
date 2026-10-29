---
sidebar_position: 2
---

# Roadmap AWS

Esta página reflete o [roadmap versionado](https://github.com/Vintex-Ages/vintex-prod/blob/develop/docs/aws-roadmap.md).
O estado aprovado de `main` será a entrada de uma futura implantação AWS.
O fluxo atual prepara releases; não cria infraestrutura, credenciais ou deploy
automático.

## Decisões antes do CD

Antes de habilitar entrega contínua, definir:

- Contas e ambientes.
- Registry, storage e banco de dados.
- Domínio e observabilidade.
- Estratégia de rollback e política de aprovação.

Os [manifestos de componentes](promocoes.md) mantêm a rastreabilidade dos commits
selecionados. Serviços AWS, topologia, custos e procedimentos de implantação
dependem das decisões futuras; não constituem capacidades já implementadas.
