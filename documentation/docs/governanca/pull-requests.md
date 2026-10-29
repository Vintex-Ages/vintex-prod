---
sidebar_position: 1
---

# Governança de Pull Requests

O [CONTRIBUTING.md](https://github.com/Vintex-Ages/vintex-prod/blob/develop/CONTRIBUTING.md)
é a referência do fluxo de contribuição. Mudanças operacionais ou de governança
usam `feature`, `bugfix`, `hotfix`, `refactor`, `docs` ou `chore`, com número de
issue: por exemplo, `docs/27-docusaurus-por-componente`.

## Issue e descrição

O PR para `develop` inclui `Closes #<issue>`; a primeira issue deve coincidir com
o número da branch. Issues adicionais não podem ter milestones conflitantes.
Use o template de PR, indique os componentes afetados, as evidências e o uso de
IA. As [promoções automáticas](../operacao/promocoes.md) dispensam issue.

Como `main` é a branch padrão e os PRs de trabalho apontam para `develop`, a
keyword de fechamento não cria por si só o vínculo nativo em Development.
Vincule o PR manualmente na sidebar Development ou crie a branch pela issue.

## Validação e revisão

- `GitOps Validation` valida branches de origem e destino, issues e promoções.
- `main` aceita somente PRs de `develop`; `deploy` aceita somente PRs de `main`.
- O GitHub solicita review aos quatro integrantes de AGES III. O merge exige
  duas aprovações vigentes, que podem vir de AGES III ou AGES IV.
- Novos commits invalidam aprovações anteriores; não há merge automático.

## Metadados e Project

O workflow `PR Metadata` só executa a sincronização se `GPA_APP_CLIENT_ID`
estiver configurada. Ele usa uma GitHub App e o script `sync-pr-metadata.mjs`
para sincronizar labels, responsáveis, milestone e campos do Project geral
configurado em `config/governance/pr-automation.json`.

O workflow carrega o código da branch padrão e responde a eventos de PRs e
issues, execução manual e agendamento. As configurações da App e sua chave são
administradas no GitHub; seus valores nunca entram no conteúdo deste portal.

## Documentação por PR

`Documentation CI` testa o gerador e a existência das páginas mapeadas.
`Documentation Draft` agrupa os caminhos alterados por página, atualiza um único
comentário e fornece o preview estático como artifact por 14 dias. Caminhos sem
mapa e falhas do preview são informativos. PRs de forks pulam o comentário por
restrições de permissão, mas podem produzir o artifact.
