---
sidebar_position: 6
---

# Decisões de arquitetura (ADRs)

As ADRs do back-end ficam em [`back-end/.ai/adr/`](https://github.com/Vintex-Ages/vintex-prod/tree/develop/back-end/.ai/adr), ao lado das regras que os agentes de IA leem (`.ai/`). As do front-end ficam em [`front-end/docs/adr/`](https://github.com/Vintex-Ages/vintex-prod/tree/develop/front-end/docs/adr). Este portal descreve o estado atual do código; a ADR registra por que ele é assim.

| ADR | Status | Data | O que decide | Páginas |
| --- | --- | --- | --- | --- |
| [0001 — Fundação HTTP (Kit de API)](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/.ai/adr/0001-fundacao-http-kit-api.md) | aceito | 2026-09-09 | prefixo `/api` sem versão, envelope de erro, paginação, `/api/users/me/*`, CORS por ambiente e fronteira de transação no controller | [Fundação HTTP](./fundacao-http) |
| [0002 — Autenticação JWT](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/.ai/adr/0002-autenticacao-jwt.md) | aceito | 2026-09-12 | PyJWT com HS256, access token de 30 min, refresh token com rotação e revogação, bcrypt, papel lido do banco | [Autenticação e conta](../dominio/autenticacao-e-conta) |
| [0003 — Ambientes staging e produção](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/.ai/adr/0003-ambientes-staging-e-producao.md) | aceito | 2026-11-17 | staging em EC2 com Compose, produção em ECS/Fargate, IA só assíncrona na produção, promoção do mesmo SHA e limites da conta | [Staging](../infraestrutura/aws-staging), [Produção](../infraestrutura/aws-producao) |

## Como registrar uma decisão nova

1. Crie `back-end/.ai/adr/NNNN-titulo-curto.md` com o próximo número, no formato das existentes: **Status**, **Data**, **Issue**, **Contexto**, as decisões numeradas e as **Consequências**.
2. Acrescente a linha na tabela acima.
3. Atualize a página do portal que descreve o comportamento e cite a ADR na linha "Fonte de verdade".

Uma ADR não é editada para mudar a decisão: a decisão nova vira outra ADR, e a antiga passa a dizer por qual foi substituída.
