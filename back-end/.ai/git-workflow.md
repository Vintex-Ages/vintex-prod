# Fluxo de Git/PR

- O back-end vive em `back-end/` no monorepo `vintex-prod`. O fluxo é o do `CONTRIBUTING.md` da raiz: `feature/* -> develop -> qa -> main -> deploy`.
- `develop`, `qa`, `main` e `deploy` são branches protegidas: nenhuma mudança é commitada diretamente nelas.
- Toda mudança exige uma issue, uma branch `<prefixo>/<issue>-<descricao>` criada a partir de `develop` e um Pull Request para `develop`.
- Todo PR segue `.github/pull_request_template.md` da raiz, incluindo a seção **Uso de IA**, que é obrigatória: descreva quais ferramentas de IA foram usadas e em quais partes (geração de código, revisão, documentação, testes etc.), ou escreva "Nenhuma" se não houve uso.
- Um agente de IA autorizado a commitar/dar push sozinho deve criar uma branch, abrir o PR usando o template e preencher a seção de Uso de IA de forma honesta — nunca commitar direto em `develop`, `qa`, `main` ou `deploy`.
- `back-end/.github/` é resto do repositório antigo: o GitHub só lê o `.github/` da raiz. Workflows, template e `CODEOWNERS` válidos estão lá.
