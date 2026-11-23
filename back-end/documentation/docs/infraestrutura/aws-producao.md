---
sidebar_position: 8
---

# Ambiente AWS de produção (ECS/Fargate)

Fonte de verdade: `infra/terraform/aws-production/`, o workflow [`deploy-prod.yml`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/.github/workflows/deploy-prod.yml) e o [ADR 0003](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/.ai/adr/0003-ambientes-staging-e-producao.md) ([vintex-prod#109](https://github.com/Vintex-Ages/vintex-prod/issues/109)). Entrega a [#170 (VE-19)](https://github.com/Vintex-Ages/back-end/issues/170) e cobre a operação mínima da [#178 (VE-27)](https://github.com/Vintex-Ages/back-end/issues/178).

A staging roda numa EC2 com Docker Compose ([Ambiente AWS de staging](./aws-staging.md)). A produção segue a arquitetura original: contêineres em ECS/Fargate, banco gerenciado e front estático. **Os testes e o CI não provisionam recursos AWS**: o `terraform test` roda com provider mockado.

## Desenho

```text
Navegador ──► CloudFront ─┬─► S3 privado (front, OAC)           /*
                          └─► API Gateway HTTP API ─► VPC Link ─► Cloud Map ─► ECS: api   /api/*, /health
                                                                                 │
                         SQS vintex-ai-production ◄──── api ─────────────────────┤
                                  │                                              ▼
                                  └──► ECS: worker + FreeLLMAPI (sidecar, EFS)   RDS PostgreSQL 16
```

## Recursos

| Componente | Configuração |
| --- | --- |
| Região e conta | `us-east-2`, `allowed_account_ids` com a conta esperada; tags `Project=Vintex`, `Environment=production`, `ManagedBy=Terraform` |
| State | o mesmo bucket da staging, chave `vintex/production/terraform.tfstate` (separado do state da staging) |
| Rede | VPC `10.90.0.0/16` em duas zonas: subnets públicas para as tasks e o VPC Link (IP de saída, sem NAT e sem ingress público) e subnets de dados sem rota para a internet |
| Banco | RDS PostgreSQL 16 `db.t4g.micro`, 20 GB gp3 (até 50 GB), criptografado, privado, `rds.force_ssl=1`, backup de 7 dias (03h–04h em Brasília), proteção contra exclusão e snapshot final. Só a API e o worker alcançam a porta 5432 |
| API | ECS/Fargate ARM64, 0,25 vCPU e 1 GB, 1 task fixa, health check em `/health` |
| Worker | ECS/Fargate ARM64, 0,5 vCPU e 1 GB: `python -m app.workers.ai_analysis` com o FreeLLMAPI como sidecar; o SQLite do gateway fica num EFS com backup |
| Escala do worker | de 0 a 1 task, pela fila: sobe no primeiro minuto com mensagem visível e desce depois de 3 minutos sem mensagem visível nem em processamento |
| Mídia | `vintex-media-production-<CONTA>`, privado, acesso só por TLS, ACLs desativadas |
| Fila | `vintex-ai-production` e DLQ: redrive após 3 entregas, visibilidade de 180 s, polling de 20 s, DLQ por 14 dias (mesmo módulo `ai_messaging` da staging; ver [Mensageria](./mensageria.md)) |
| Front | bucket S3 privado atrás do CloudFront com OAC; uma CloudFront Function devolve `index.html` para rotas da SPA |
| Borda | CloudFront `PriceClass_100`, só HTTPS; `/api/*` e `/health` vão para o API Gateway (limite de 20 req/s, rajada de 50), sem cache |
| Segredos | Secrets Manager em `/vintex/production/*`: URL do banco, `JWT_SECRET` e as chaves do FreeLLMAPI. Cada task só lê os próprios segredos |
| Logs | `/vintex/production/*` no CloudWatch, 14 dias. O log de acesso do API Gateway não grava query string nem cabeçalhos |
| Imagens | os repositórios ECR da staging (`vintex-backend`, `freellmapi`): a produção não tem build próprio |

A URL pública é o domínio `*.cloudfront.net` da distribuição. A conta não permite recursos em `us-east-1` (SCP institucional), então não há certificado ACM nem domínio próprio (ADR 0003, decisão 4).

## IA na produção

| | Staging | Produção |
| --- | --- | --- |
| API | `AI_PROVIDER=freellmapi` | `AI_PROVIDER=unavailable` |
| Worker (análise de foto pela fila) | FreeLLMAPI | FreeLLMAPI como sidecar |

Na produção, a análise de foto do cadastro funciona pela fila. As chamadas síncronas da API respondem como [provedor indisponível](../arquitetura/provedor-ia): sugestão de preço, conversa com a Vintex, busca por foto e geração de vetor. A recomendação cai no feed genérico (`personalized: false`).

> <span className="verificar">*</span> **Decisão em aberto (ADR 0003, decisão 2).** Manter um gateway de IA sempre ligado para a API foi deixado para depois por custo. Se a busca por semelhança ou a conversa forem requisitos da produção, a decisão precisa ser revista.

## Deploy

Merge em `deploy` (PR `main -> deploy`, com duas aprovações) dispara o `deploy-prod.yml`. Ele fica inativo até a variável de repositório `DEPLOY_PRODUCTION_ENABLED` ser `true`.

1. **Portão de promoção.** Encontra o commit da `main` com a mesma árvore do `HEAD` da `deploy` e exige que esse SHA tenha deploy de staging com sucesso. Não há build novo: a produção recebe a imagem `vintex-backend:<sha>` já testada na staging (ADR 0003, decisão 3).
2. **Registra as task definitions** da API e do worker com a imagem promovida.
3. **Roda as migrations** numa task avulsa da API (`alembic upgrade head`). Se o código de saída não for 0, o deploy para antes de trocar os serviços.
4. **Atualiza os serviços** e espera a API estabilizar.
5. **Publica o front** que a staging testou (`releases/<sha>/front-end.tar.gz` no bucket de deploy da staging) e invalida o `index.html` no CloudFront.
6. **Smoke test:** `GET /health` e a página inicial pela URL pública.

O GitHub assume a role `VintexGithubDeployProduction` por OIDC, e só o Environment `production` pode assumi-la. O Environment precisa de três variáveis, nenhuma secreta:

| Variável | De onde vem |
| --- | --- |
| `AWS_ROLE_ARN` | output `deploy_role_arn` |
| `PUBLIC_BASE_URL` | output `public_url` |
| `PRODUCTION_CONFIG` | output `deploy_config`, o JSON com cluster, serviços, famílias, subnets, buckets e distribuição |

O Terraform cria a primeira task definition com `bootstrap_image_tag`. Depois disso, quem troca a imagem é só o deploy (`ignore_changes`), e um `apply` não volta a versão.

## Provisionar

O provisionamento é manual, feito por quem tem o perfil AWS autorizado, com os mesmos alvos da staging. A produção nunca é conduzida pelo `make infra-deploy`:

```bash
make terraform-init production
make terraform-validate production
make terraform-plan production    # salva o plano
make terraform-apply production   # aplica só o plano salvo, após confirmação
make terraform-output production
```

`scripts/infra/terraform_env.py` monta o backend S3 a partir de `infra/terraform/account.tfvars.json` (ver [Base AWS compartilhada](./aws-shared.md)) e confere que `config/production.tfvars` declara `deployment = "production"`. O provedor OIDC do GitHub e os repositórios ECR pertencem ao state da staging, e a produção só os lê. Por isso a staging precisa existir antes.

## Alarmes

Os alarmes avisam por e-mail (tópico SNS `vintex-production-alarmes`) os mesmos endereços de `budget_email_addresses` do `account.tfvars.json`. Cada destinatário precisa confirmar a inscrição no e-mail da AWS.

| Alarme | Dispara quando (janela de 5 min) |
| --- | --- |
| `api-5xx` | o API Gateway devolve 5 ou mais respostas 5xx |
| `dlq-com-mensagem` | uma análise de IA caiu na DLQ |
| `rds-pouco-espaco` | o RDS fica com menos de 2 GiB livres |

Não há alarme de custo: a conta nega o AWS Budgets (ADR 0003, decisão 4).

## Testes

`infra/terraform/aws-production/tests/production.tftest.hcl` roda com provider mockado e confere: banco privado, criptografado e com backup; API contínua com IA só assíncrona; worker de 0 a 1 task com o sidecar; cada execution role só com os próprios segredos; borda sem acesso direto à API; deploy restrito ao Environment `production`; e os alarmes.

```bash
make terraform-test production
```

## Operação

- **Rollback:** promover de novo um SHA anterior que tenha deploy de staging com sucesso. As migrations não são revertidas automaticamente; uma migration destrutiva precisa de `alembic downgrade` manual numa task avulsa.
- **Restaurar o banco:** pelos backups automáticos do RDS (7 dias) ou pelo snapshot final. A restauração cria uma instância nova, e a `DATABASE_URL` do Secrets Manager precisa apontar para ela.
- **Acesso aos contêineres:** os serviços têm `enable_execute_command`. Não há SSH.

> <span className="verificar">*</span> **Verificar com quem opera a produção.** Rollback e restauração acima foram descritos a partir do Terraform e do workflow; não há runbook testado registrado no repositório. A #178 (VE-27) pede esse checklist.
