# Contribuindo com o back-end

O back-end vive em `back-end/` no monorepo `vintex-prod`. Fluxo de branches,
issues, template de PR, revisão e CI são os do repositório inteiro: siga o
[`CONTRIBUTING.md` da raiz](../CONTRIBUTING.md). Este arquivo só acrescenta o
que é específico do back-end.

## Resumo do fluxo (detalhes na raiz)

```text
feature/* -> develop -> qa -> main -> deploy
```

- Branch a partir de `develop`: `feature|bugfix|hotfix|refactor|docs|chore/<issue>-<descricao>`.
- A issue pode ser deste repositório (`Closes #12`) ou do antigo
  `Vintex-Ages/back-end` (`Closes Vintex-Ages/back-end#269`).
- Em **Componentes afetados** do template, marque `back-end`.
- Merge em `main` faz o deploy da staging; merge em `deploy`, o da produção.

## Back-end

O back-end usa Python 3.12, FastAPI, SQLAlchemy e arquitetura MVC:

```text
View -> Controller -> Repository
```

Schemas Pydantic validam entrada e saída; Models SQLAlchemy representam
persistência. O commit fica no controller (ADR 0001 §6). As regras completas
estão em `.ai/architecture.md` e `.ai/coding-rules.md`.

Antes do push, execute dentro de `back-end/`:

```bash
ruff check .
black --check .
pytest tests/ -v
mypy app/ --ignore-missing-imports
```

`make lint` e `make format-check` rodam Ruff e Black na imagem da API, com as
versões fixadas em `requirements.txt`.

## Documentação

- Mudou comportamento de rota, regra de negócio ou infraestrutura? Atualize a
  página correspondente em `documentation/docs/`. O PR recebe o comentário
  **Back-end Documentation Draft** apontando as páginas, pelo
  `documentation/path-map.json`.
- Criou um arquivo que não tem página? Acrescente o caminho ao `path-map.json`.
  `tests/test_generate_draft.py` falha se o mapa apontar para uma página que não
  existe, se uma página ficar sem nenhum caminho ou se um padrão se repetir.
- Tomou uma decisão de arquitetura? Registre uma ADR em `.ai/adr/` e liste-a em
  `documentation/docs/arquitetura/decisoes.md`.
- Termo novo do domínio? Acrescente em `CONTEXT.md`.

## Regras gerais

O repositório é público. Nunca versione credenciais, `.env` ou material interno
de auditoria.
