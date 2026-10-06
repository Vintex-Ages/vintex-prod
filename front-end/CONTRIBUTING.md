# Contribuindo com o Vintex

## Fluxo de branches

`develop` é a branch padrão e base do desenvolvimento diário. `main` representa a versão principal.

```text
branch de trabalho -> develop -> main -> deploy
```

Crie branches a partir de `develop` usando:

```text
feature/<issue>-<descricao>
bugfix/<issue>-<descricao>
hotfix/<issue>-<descricao>
refactor/<issue>-<descricao>
docs/<issue>-<descricao>
chore/<issue>-<descricao>
```

Use palavras minúsculas separadas por hífen. Todo trabalho deve possuir uma issue.

## Pull Requests

- PRs de trabalho apontam para `develop`.
- Somente `develop` promove para `main`.
- Somente `main` promove para `deploy`.
- Preencha o template inteiro e use `Closes #<issue>` como referência primária lida pela automação.
- A primeira issue vinculada deve ser a issue indicada na branch. Outras issues podem ser incluídas, desde que não tenham milestones conflitantes.
- Como os PRs de trabalho apontam para `develop` e `main` é a branch padrão, o GitHub não cria o vínculo nativo em Development a partir da keyword. Para exibi-lo, vincule o PR manualmente na sidebar Development ou crie a branch pela própria issue antes de começar o trabalho.
- Selecione exatamente um tipo de mudança.
- Declare como IA foi utilizada ou informe explicitamente que não houve uso.
- Assignees e labels são unidos a partir das issues; a milestone e os campos dos Projects vêm da issue primária.
- O PR entra no Project do frontend e no Project geral. Draft fica em `In progress`, PR pronto em `In review` e merge em `Done`.
- O merge exige a aprovação vigente da equipe designada na ruleset, além dos checks `CI audit`, `CI quality` e `PR Governance`.
- Não há bypass para equipes ou administradores. Aguarde os checks terminarem; uma falha em `PR Metadata` ou `Project Sync` deve ser investigada, mas essas sincronizações não são portões de merge.
- Faça commits pequenos; novo commit invalida aprovações anteriores.

## Frontend

O frontend usa React, Vite, TypeScript, Tailwind CSS e Vitest. Preserve a organização por responsabilidade em `src/components`, `src/context`, `src/hooks`, `src/pages`, `src/routes`, `src/services`, `src/styles` e `src/types`.

Use o alias `@/` para imports a partir de `src` e evite imports relativos profundos.

Antes do push, execute:

```bash
npm run lint
npm run test
npm run build
npm run format:check
npm audit --audit-level=high
```

Nunca versionar credenciais, `.env` ou material interno de auditoria.
