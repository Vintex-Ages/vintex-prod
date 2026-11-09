# Pipeline CI/CD

```text
feature/* -> develop -> qa -> main -> deploy
```

## O que cada etapa roda

| Evento | Workflow | O que roda |
|---|---|---|
| PR `feature/*` -> `develop` | `ci.yml` | só os componentes alterados |
| PR `develop` -> `qa` | `ci.yml` | todos os testes da aplicação |
| PR `qa` -> `main` | `ci.yml` + `infra-gate.yml` | tudo + testes de infra + validação do gateway de IA |
| push em `main` | `deploy-staging.yml` | deploy da staging |
| push em `deploy` | `deploy-prod.yml` | deploy da produção (Environment com aprovação) |

Governança em todos os PRs: `PR Governance` (cadeia de branches, issue, template), `PR Metadata`, `Project Sync`, `Close Guard`, `Link Backfill` e `PR Lifecycle` (herdados do `front-end`).

## Detecção de mudanças (`develop`)

`.github/scripts/detect-changes.mjs` compara `base...head` e consulta `.github/config/ci-paths.json`:

- Cada componente (`front-end`, `back-end`, `infra`, `automation`, `docs`) tem uma lista de caminhos.
- Componentes com `requires` ficam desligados enquanto o arquivo não existir (ex.: `back-end/requirements.txt` antes do import do back-end).
- Alterar `.github/workflows/**` ou `.github/config/**` força a validação completa.
- Se o `git diff` falhar, valida tudo (lado seguro).

O check obrigatório é o **`CI gate`** (e o **`Infra gate`** para `main`): jobs pulados por não terem mudanças contam como sucesso, mas qualquer job executado que falhe reprova o gate.

## Validação do gateway de IA (`LLM key check`)

Roda no PR para `main`. O gateway FreeLLMAPI escuta só em `127.0.0.1:3001` da EC2, então a sonda vai por SSM Run Command: lê o token no SSM Parameter Store **dentro da EC2** e chama `/api/ping` e `/v1/models`; só os códigos HTTP voltam ao runner. Resultados: `pass`, `inconclusive` (endpoint sem suporte: chave **não** validada, com aviso) ou `fail`. `LLM_PROBE_COMPLETION=true` valida com uma chamada mínima de chat (consome cota gratuita dos provedores).

Sem as variáveis abaixo o job **não valida nada** e avisa no resumo da execução. Defina `REQUIRE_LLM_CHECK=true` para que a ausência de configuração reprove o PR.

## Deploy

`_deploy-aws.yml` (reutilizável): build do front-end, pacote do back-end (`git archive`), imagem `linux/arm64` no ECR (`vintex-backend:<sha>`), artefatos no S3 e execução de `.github/scripts/deploy-host.sh` na EC2 via SSM. O script do host segue o procedimento de `back-end/documentation/docs/infraestrutura/aws-staging-runtime.md`: release em pasta nova (`/opt/vintex/releases/<sha>`, sem sobrescrever), reinstala o guard, atualiza `/etc/vintex/staging.json` com backup e roda `deploy_staging.py` (rollback embutido). Depois, smoke test em `<PUBLIC_BASE_URL>/health`.

O deploy só roda com **front-end/ e back-end/** presentes no repositório (o release exige imagem e `frontend/index.html`).

### Variáveis (nada disso vai para o código)

| Onde | Nome | Para quê |
|---|---|---|
| Repositório | `DEPLOY_STAGING_ENABLED`, `DEPLOY_PRODUCTION_ENABLED` | liga cada deploy (`true`) |
| Repositório | `AWS_ROLE_ARN_STAGING`, `STAGING_INSTANCE_ID` | `LLM key check` |
| Repositório | `REQUIRE_LLM_CHECK`, `LLM_PROBE_COMPLETION` | endurecem o `LLM key check` |
| Environment `staging` / `production` | `AWS_ROLE_ARN`, `DEPLOY_BUCKET`, `INSTANCE_ID` | deploy |
| Environment | `PUBLIC_BASE_URL`, `AWS_REGION` | smoke test; região (padrão `us-east-2`) |

O role AWS usa OIDC. Exemplo de condição na trust policy: `token.actions.githubusercontent.com:sub = repo:Vintex-Ages/vintex-prod:environment:staging` (e `:environment:production`).

## Passos manuais (exigem admin; o código não os faz)

1. Criar a branch `qa` a partir de `develop`.
2. Incluir `qa` no ruleset `develop/main/deploy governance` e exigir `CI gate` (todas as branches) e `Infra gate` (`main`). Só exigir depois de o check aparecer em uma execução.
3. Criar os Environments `staging` e `production` (revisores obrigatórios em `production`) e as variáveis acima.
4. Criar o role OIDC e o bucket de artefatos (`DEPLOY_BUCKET`).

## Antes de ligar o deploy da staging

- **Ajustes manuais da EC2.** `compose.yml`, `nginx.conf` e `deploy_staging.py` da staging foram alterados à mão no host. O deploy extrai o release do git e **não preserva** essas edições; reconcilie tudo no repositório antes de definir `DEPLOY_STAGING_ENABLED=true`.
- **Produção não existe.** Falta o ambiente no Terraform e o `scripts/infra/deploy_production.py`; `deploy-prod.yml` falha de propósito no build enquanto o script não estiver no release (o `deploy_staging.py` valida conta e fila da staging e não deve ser reaproveitado).
- **Artefato de produção.** O deploy de produção reconstrói a imagem a partir do commit de `deploy`; promover a mesma imagem testada na staging é uma melhoria futura.

## Limites conhecidos (não verificados)

OIDC, ECR, SSM, S3, o smoke test e a validação real da chave **nunca rodaram**: dependem de credenciais que não existem ainda. O `/v1/models` do gateway não foi confirmado como suportado. A semântica dos workflows não foi checada por `actionlint`; foram verificadas sintaxe YAML, testes unitários dos scripts (`node --test .github/scripts/lib/*.tests.mjs`) e a lógica de decisão do detector.
