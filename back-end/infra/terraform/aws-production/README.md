# Produção (ECS/Fargate)

Root Terraform da produção, descrito no
[ADR 0003](../../../.ai/adr/0003-ambientes-staging-e-producao.md): ECS/Fargate
atrás de CloudFront e API Gateway, RDS PostgreSQL privado, mídia em S3 e IA só
assíncrona (worker com FreeLLMAPI como sidecar). O state é próprio
(`vintex/production/terraform.tfstate`), separado do da staging.

Use os alvos do `Makefile`, na raiz do back-end, com o perfil AWS autorizado:

```bash
make terraform-validate production
make terraform-plan production
make terraform-apply production
make terraform-output production
make terraform-test production   # provider mockado, sem AWS real
```

A staging precisa existir antes: o provedor OIDC do GitHub e os repositórios ECR
pertencem ao state dela e aqui só são lidos. `make infra-deploy` nunca conduz a
produção.

| Arquivo | Conteúdo |
| --- | --- |
| `main.tf` | provider, rede, RDS, mídia, fila e imagens ECR |
| `app.tf` | segredos, cluster, task definitions, serviços, EFS e escala do worker |
| `edge.tf` | API Gateway, VPC Link, bucket do front e CloudFront |
| `deploy.tf` | role do GitHub Actions, só para o Environment `production` |
| `alarms.tf` | SNS e alarmes de 5xx, DLQ e espaço no RDS |
| `outputs.tf` | `public_url`, `deploy_role_arn` e `deploy_config` para o `deploy-prod.yml` |

Recursos, deploy, alarmes e operação:
[`documentation/docs/infraestrutura/aws-producao.md`](../../../documentation/docs/infraestrutura/aws-producao.md).
