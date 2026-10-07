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
- Como `develop` é a branch padrão, `Closes #<issue>` vincula a issue ao PR de trabalho na sidebar Development.
- Selecione exatamente um tipo de mudança.
- Declare como IA foi utilizada ou informe explicitamente que não houve uso.
- Assignees e labels são unidos a partir das issues; a milestone e os campos dos Projects vêm da issue primária.
- O PR entra no Project do frontend e no Project geral. Draft fica em `In progress`, PR pronto em `In review` e merge em `Done`.
- O merge exige a aprovação vigente da equipe designada na ruleset e os checks de CI e governança. Durante a troca das proteções, `Lint, type-check, test & build` depende de `CI audit` e `CI quality`; depois, os três checks exigidos serão `CI audit`, `CI quality` e `PR Governance trusted`.
- Não há bypass para equipes ou administradores. Aguarde os checks terminarem; uma falha em `PR Metadata` ou `Project Sync` deve ser investigada, mas essas sincronizações não são portões de merge.
- Faça commits pequenos; novo commit invalida aprovações anteriores.

## Frontend

O frontend usa React, Vite, TypeScript, Tailwind CSS e Vitest. Preserve a organização por responsabilidade em `src/components`, `src/context`, `src/hooks`, `src/pages`, `src/routes`, `src/services`, `src/styles` e `src/types`.

Use o alias `@/` para imports a partir de `src` e evite imports relativos profundos.

Antes do push, execute:

```bash
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm audit --audit-level high
```

Nunca versionar credenciais, `.env` ou material interno de auditoria.
