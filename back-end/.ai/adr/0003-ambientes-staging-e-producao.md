# ADR 0003 — Ambientes AWS: staging em EC2 e produção em ECS/Fargate

- **Status:** aceito
- **Data:** 2026-11-17
- **Issues:** Vintex-Ages/vintex-prod#109; épico Vintex-Ages/back-end#180 (#170, #174, #175, #178)
- **Contexto:** a arquitetura de setembro (imagem "Infraestrutura AWS — Vintex (MVP)" e
  `Documentacao_Infraestrutura_Vintex.md`) previa um só ambiente em ECS/Fargate. A
  trilha de staging (#272, #273, #274, #301) foi entregue numa EC2 com Docker Compose,
  sem registro da troca. Este ADR registra os dois ambientes e o que a conta impede.

## Decisões

### 1. Dois ambientes, dois desenhos

| | Staging | Produção |
|---|---|---|
| Branch | `main` | `deploy` |
| Computação | 1 EC2 `t4g.small` com Docker Compose | ECS/Fargate ARM64: API (1 task) e worker (0–1 pela fila) |
| Horário | seg–sex 10h–22h (Scheduler); deploy fora do horário liga e desliga a EC2 | 24×7 |
| Banco | Postgres + pgvector em contêiner, no EBS, sem backup | RDS PostgreSQL 16 + pgvector, privado, backup automático de 7 dias |
| Front | Nginx dentro da EC2 | S3 privado (OAC) atrás do CloudFront |
| Entrada | CloudFront → EC2 (porta 80 só para a lista do CloudFront) | CloudFront → API Gateway HTTP API → VPC Link → Cloud Map → ECS |
| Segredos | SSM Parameter Store (SecureString) | Secrets Manager |
| Cadastro público | fechado (contas de demo) | aberto |

A staging é deliberadamente mais barata e descartável: dados sintéticos, desligada à
noite. A produção segue a imagem de arquitetura e os requisitos da AGES
(conteinerização, serviços gerenciados para dado persistente).

### 2. IA

- **Staging:** API com `AI_PROVIDER=freellmapi` (sugestão de cadastro e embedding
  síncronos pelo gateway na rede `llm`); worker analisa fotos pela fila.
- **Produção:** como na imagem, o FreeLLMAPI é sidecar do worker, com o SQLite num
  EFS, e o worker escala a zero. A API fica com `AI_PROVIDER=unavailable`: a análise
  de fotos funciona pela fila, mas sugestão síncrona e busca por similaridade ficam
  indisponíveis até haver decisão de manter um gateway sempre ligado.

### 3. Artefato promovido

O merge em `main` constrói a imagem `vintex-backend:<sha>` e o front uma vez. A
produção promove o mesmo SHA, já saudável na staging; não há segundo build.

### 4. Limites impostos pela conta (SCP institucional)

- Serviços regionais só em `us-east-2`: sem WAF para CloudFront nem certificado ACM em
  `us-east-1`, portanto sem domínio próprio. Os dois ambientes usam `*.cloudfront.net`.
- Budgets negado: não há alerta de custo gerenciado pelo projeto.

## Consequências

- #170 (VE-19) passa a ser entregue no root Terraform `aws-production` do `vintex-prod`;
  os módulos de ECS do ambiente local continuam valendo para os testes com MiniStack.
- #174 (VE-23) é coberta pelo `ci-infra.yml` (PR para `qa` roda `make infra-complete`).
- #175 (VE-24) vira o gate do `deploy-prod.yml`: o SHA de `deploy` precisa estar verde na
  `main` e ser o release saudável da staging.
- #178 (VE-27) vira o checklist de operação da produção (rollback, restauração do RDS,
  alarmes).
- Diferença de comportamento de IA entre staging e produção (decisão 2) é conhecida e
  deve ser revista se a busca por similaridade for requisito da produção.
