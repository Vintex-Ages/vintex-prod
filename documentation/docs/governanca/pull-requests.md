---
sidebar_position: 1
---

# Governança de Pull Requests

O [CONTRIBUTING.md](https://github.com/Vintex-Ages/vintex-prod/blob/develop/CONTRIBUTING.md)
é a referência do fluxo de contribuição. Branches de trabalho usam `feature`,
`bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, com número de issue: por
exemplo, `docs/27-docusaurus-por-componente`. Valem para código de `front-end/`,
de `back-end/` e para mudanças de governança.

## Issue e descrição

O PR para `develop` inclui `Closes` com a issue, e a primeira issue citada deve
coincidir com o número da branch. A issue pode ser deste repositório
(`Closes #27`) ou de um repositório de origem listado em `issueRepositories`, em
`config/governance/pr-automation.json`
(`Closes Vintex-Ages/front-end#426` ou `Closes Vintex-Ages/back-end#269`).
Issues adicionais não podem ter milestones conflitantes. As
[promoções automáticas](../operacao/promocoes.md) dispensam issue.

O template de PR tem sete seções que o `CONTRIBUTING.md` manda preencher:
Descrição, O que foi feito, Tipo de mudança, Componentes afetados, Uso de IA,
Evidências e Checklist. Em **Tipo de mudança**, marque exatamente uma opção, com
a palavra em inglês: `Feature`, `Bugfix`, `Hotfix`, `Refactor`, `Docs` e `Chore`
viram o label `change:<tipo>`; `Promotion` e `Infra` não geram label.

Como `main` é a branch padrão e os PRs de trabalho apontam para `develop`, a
keyword de fechamento não cria por si só o vínculo nativo em Development.
Vincule o PR manualmente na sidebar Development ou crie a branch pela issue.

## Validação e CI

- `GitOps Validation` valida branches de origem e destino, issues e promoções.
- `qa` aceita somente PRs de `develop`, `main` somente de `qa` e `deploy`
  somente de `main`. Enquanto `qa` não existir (#32), `main` aceita `develop`.
- O CI depende do tipo de PR. `feature -> develop` roda só o que mudou
  (`front-end/**`, `back-end/**` e, no back-end, infra separada de aplicação);
  `develop -> qa` roda todos os testes de aplicação; `qa -> main` roda os testes
  de infra. Sem mudança relevante, o check agregador passa sem rodar os jobs.

## Revisão

- O GitHub solicita review aos quatro integrantes de AGES III. O merge exige
  duas aprovações vigentes, que podem vir de AGES III ou AGES IV.
- Novos commits invalidam aprovações anteriores; não há merge automático.

## Metadados e Project

O workflow `PR Metadata` só executa a sincronização se `GPA_APP_CLIENT_ID`
estiver configurada. Ele usa uma GitHub App e o script `sync-pr-metadata.mjs`
para sincronizar labels, responsáveis, milestone e campos do Project geral
configurado em `config/governance/pr-automation.json`. O PR entra no Project:
draft em `In progress`, pronto em `In review` e merge em `Done`.

O workflow carrega o código da branch padrão e responde a eventos de PRs e
issues, execução manual e agendamento. As configurações da App e sua chave são
administradas no GitHub; seus valores nunca entram no conteúdo deste portal.

## Documentação por PR

Há dois mecanismos, um por portal:

- **Este portal** (`documentation/`): `Documentation CI` testa o gerador e a
  existência das páginas mapeadas. `Documentation Draft` agrupa os caminhos
  alterados por página, atualiza um único comentário e fornece o preview estático
  como artifact por 14 dias.
- **Portal do back-end** (`back-end/documentation/`): `Back-end Documentation
  Draft` roda quando o PR altera `back-end/**`, com o próprio `path-map.json` e o
  gerador `back-end/scripts/docs/generate_draft.py`.

Caminhos sem mapa e falhas do preview são informativos. PRs de forks pulam o
comentário por restrições de permissão, mas podem produzir o artifact. Código do
`front-end/` e do `back-end/` não tem página neste portal: ele é documentado ao
lado do código, como descrito na [introdução](../intro.md).
