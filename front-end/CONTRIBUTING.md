# Contribuindo com o Vintex

## Fluxo de branches

`main` é a branch padrão e representa a versão principal. O desenvolvimento diário parte de `develop`.

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
- Preencha o template inteiro e use `Closes #<issue>`.
- Selecione exatamente um tipo de mudança.
- Declare como IA foi utilizada ou informe explicitamente que não houve uso.
- Faça commits pequenos e solicite review.

## Frontend

O frontend usa React, Vite, TypeScript, Tailwind CSS e Vitest. Preserve a organização por responsabilidade em `src/components`, `src/context`, `src/hooks`, `src/pages`, `src/routes`, `src/services`, `src/styles` e `src/types`.

Use o alias `@/` para imports a partir de `src` e evite imports relativos profundos.

Antes do push, execute:

```bash
npm run lint
npm run test
npm run build
npm run format
```

Nunca versionar credenciais, `.env` ou material interno de auditoria.
