# vintex-prod

Monorepo do Vintex: código do `front-end/` e do `back-end/`, pipeline de CI/CD e governança.

## Fluxo

```text
feature/* -> develop -> qa -> main -> deploy
                         |      |        |
                         |      |        +-- merge: deploy em PRODUÇÃO (AWS)
                         |      +----------- merge: deploy em STAGING (AWS)
                         +------------------ PR para main: testes de infra + validação do gateway de IA
```

| Etapa | O que roda |
|---|---|
| PR `feature/*` -> `develop` | só os jobs dos componentes que mudaram |
| PR `develop` -> `qa` | todos os testes da aplicação |
| PR `qa` -> `main` | todos os testes de infra + validação da API/chave do gateway de IA |
| merge em `main` | deploy da staging |
| merge em `deploy` (PR `main` -> `deploy`) | deploy da produção |

Detalhes, variáveis e passos manuais: [`docs/pipeline-ci-cd.md`](docs/pipeline-ci-cd.md).

## Estrutura

- [`front-end/`](front-end/) — aplicação web (importada de `Vintex-Ages/front-end`, com histórico).
- [`back-end/`](back-end/) — API (importada de `Vintex-Ages/back-end` em 04/11/2026), com portal de documentação próprio em [`back-end/documentation/`](back-end/documentation/README.md).
- [`components/back-end/release.yml`](components/back-end/release.yml) — ponteiro para o `deploy` do repositório `back-end`, até ele ser importado também. Este repositório é público: nunca adicione segredos, chaves, tokens ou valores sensíveis de ambiente.
- `.github/` — workflows, scripts de governança e automação.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um Pull Request.

A documentação viva de GitOps, promoções e governança está em
[`documentation/`](documentation/README.md), com portal Docusaurus e rascunho
informativo por PR.
