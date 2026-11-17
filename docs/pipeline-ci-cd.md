# Pipeline CI/CD

```text
feature/* -> develop -> qa -> main -> deploy
```

## O que cada etapa roda

| Evento | Workflow | O que roda |
|---|---|---|
| PR `feature/*` -> `develop` | `ci.yml` | os componentes cuja pasta mudou (sem infra); documentação não roda testes; no front-end, só os testes afetados |
| PR `develop` -> `qa` | `ci.yml` | todos os testes da aplicação + **infra** (`ci-infra.yml`) + validação do gateway de IA |
| PR `qa` -> `main` | `ci.yml` | todos os testes da aplicação (sem infra) |
| PR `main` -> `deploy` | `ci.yml` | todos os testes da aplicação (sem infra) |
| push em `main` | `deploy-staging.yml` | deploy da staging |
| push em `deploy` | `deploy-prod.yml` | deploy da produção (Environment com aprovação) |

Governança em todos os PRs: `PR Governance` (cadeia de branches, issue, template), `PR Metadata`, `Project Sync`, `Close Guard`, `Link Backfill` e `PR Lifecycle` (herdados do `front-end`).

## Detecção de mudanças (`develop`)

`.github/scripts/detect-changes.mjs` compara `base...head` e consulta `.github/config/ci-paths.json`:

- Cada componente (`front-end`, `back-end`, `infra`, `automation`, `docs`) é uma pasta "pai". Qualquer arquivo alterado dentro dela liga o componente: mudou algo em `back-end/`, roda todo o CI do back-end, mesmo que o arquivo não tenha regra própria.
- **Documentação não roda testes.** Arquivos em `docsGlobs` (`**/*.md`, `**/*.mdx`, `documentation/**`, `back-end/documentation/**`, `front-end/docs/**`, `docs/**`) não ligam nenhum componente: um PR só de docs passa o `CI gate` sem rodar job de teste, e um PR de docs + código liga apenas o componente do código. Vale só em PR para `develop`; PRs para `qa`/`main`/`deploy`, push e agenda continuam completos.
- **Front-end: só os testes afetados.** A saída `front_end_scope` é `changed` quando todo arquivo alterado do front-end está em `frontEnd.scopedPaths` (`front-end/src/**`) e fora de `frontEnd.fullTestPaths` (`front-end/src/test/**`, o setup global). O job `test` pede ao vitest a lista de testes afetados (`vitest list --filesOnly --changed <base_sha>`, que usa o grafo de módulos, inclusive dependências transitivas) e roda só eles. **Se a lista vier vazia ou o vitest falhar, roda a suíte completa.** Qualquer outro arquivo (`package.json`, lockfile, `vite.config.ts`, `tsconfig*`, `tests/**`, `index.html`...) não tem teste identificável e também vale a suíte completa. Lint, formatação, tipos, build e audit rodam sempre por inteiro.

### Jobs do front-end (`ci-front-end.yml`)

```
static ──► ┬─ test      braces-security + vitest (scope=changed: só os afetados; lista vazia → suíte completa)
           ├─ coverage  vitest --coverage, suíte completa (só em scope=all)
           ├─ build     tsc -b + vite build
           └─ audit     pnpm audit --audit-level high
```

- `static` (lint, formatação e `tsc`) roda sempre e primeiro: um erro barato reprova em menos de um minuto, sem gastar runner com testes.
- Os outros quatro rodam em paralelo depois do `static`. Cada um faz o próprio checkout e instala as dependências pela composite action `.github/actions/setup-front-end`, que usa cache do pnpm.
- Em `scope=all`, `test` e `coverage` rodam a suíte ao mesmo tempo. Isso gasta mais minutos de runner, mas o tempo de relógio cai para cerca de `static` + o maior dos dois.
- Na agenda noturna só rodam `static` e `audit`.
- **Back-end: sem seleção de testes.** Os testes importam o `conftest.py`, que importa `app.main` (e portanto todo o app), então o grafo de imports não distingue testes; o CI do back-end roda completo sempre que algo fora de docs mudar na pasta.
- `infra` só liga em PR com destino `qa` (`onlyPullRequestBaseRefs`); em PRs para `develop`, `main` ou `deploy`, em push, agenda e execução manual ele fica desligado.
- Componentes com `requires` ficam desligados enquanto o arquivo não existir (ex.: `back-end/requirements.txt` antes do import do back-end).
- Alterar `.github/workflows/**` ou `.github/config/**` força a validação completa.
- Se o `git diff` falhar, valida tudo (lado seguro).

O único check obrigatório é o **`CI gate`**, em todas as branches: jobs pulados por não terem mudanças contam como sucesso, mas qualquer job executado que falhe reprova o gate.

## Validação do gateway de IA (`LLM key check`)

É um job de infra (`ci-infra.yml`) e roda no PR para `qa`. O gateway FreeLLMAPI escuta só em `127.0.0.1:3001` da EC2, então a sonda vai por SSM Run Command: lê o token no SSM Parameter Store **dentro da EC2** e chama `/api/ping` e `/v1/models`; só os códigos HTTP voltam ao runner. Resultados: `pass`, `inconclusive` (endpoint sem suporte: chave **não** validada, com aviso) ou `fail`. `LLM_PROBE_COMPLETION=true` valida com uma chamada mínima de chat (consome cota gratuita dos provedores).

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
2. Incluir `qa` no ruleset `develop/main/deploy governance` e exigir `CI gate` em todas as branches. Só exigir depois de o check aparecer em uma execução.
3. Criar os Environments `staging` e `production` (revisores obrigatórios em `production`) e as variáveis acima.
4. Criar o role OIDC e o bucket de artefatos (`DEPLOY_BUCKET`).

## Antes de ligar o deploy da staging

- **Ajustes manuais da EC2.** `compose.yml`, `nginx.conf` e `deploy_staging.py` da staging foram alterados à mão no host. O deploy extrai o release do git e **não preserva** essas edições; reconcilie tudo no repositório antes de definir `DEPLOY_STAGING_ENABLED=true`.
- **Produção não existe.** Falta o ambiente no Terraform e o `scripts/infra/deploy_production.py`; `deploy-prod.yml` falha de propósito no build enquanto o script não estiver no release (o `deploy_staging.py` valida conta e fila da staging e não deve ser reaproveitado).
- **Artefato de produção.** O deploy de produção reconstrói a imagem a partir do commit de `deploy`; promover a mesma imagem testada na staging é uma melhoria futura.

## Limites conhecidos (não verificados)

OIDC, ECR, SSM, S3, o smoke test e a validação real da chave **nunca rodaram**: dependem de credenciais que não existem ainda. O `/v1/models` do gateway não foi confirmado como suportado. A semântica dos workflows não foi checada por `actionlint`; foram verificadas sintaxe YAML, testes unitários dos scripts (`node --test .github/scripts/lib/*.test.mjs .github/scripts/lib/*.tests.mjs`) e a lógica de decisão do detector.
