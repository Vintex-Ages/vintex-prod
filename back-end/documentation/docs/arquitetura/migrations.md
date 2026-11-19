---
sidebar_position: 4
---

# Migrations

Fonte de verdade: `alembic/` e a seção *Migrations* do README. O schema do banco é versionado com Alembic; nada é criado implicitamente em produção.

`alembic/env.py` lê `DATABASE_URL` de `app/config.py`: nunca configure a URL no `alembic.ini` (ver [Configuração por ambiente](./configuracao)).

## O que o CI confere

O job **Migrations** roda num Postgres vazio, a cada PR:

1. **uma head só** (`alembic heads`): dois PRs que criam revisão a partir da mesma base precisam de uma ordenada depois da outra;
2. **`alembic upgrade head`** do banco vazio até o estado atual;
3. **`alembic downgrade base`**: toda migration precisa ter `downgrade` que funciona.

O job **Tests (Postgres)** sobe as migrations de novo no banco de teste (`TEST_POSTGRES_URL`, nome terminado em `_test`) e roda os testes marcados com `postgres`.

## Regras

- **Revise o arquivo gerado** pelo `--autogenerate` antes de aplicar: ele não detecta tudo (renomear coluna, alguns constraints).
- **Coluna nova em tabela com dado aceita nulo**, ou tem default. Linha gravada antes dela não tem o valor, e a leitura não pode quebrar. Ex.: `payments.receipt_name` e `payments.receipt_content_type` ([#244](https://github.com/Vintex-Ages/back-end/issues/244)) e `users.terms_version` e `users.terms_accepted_at` (revisão `e4a2c7b9d1f3`, [#259](https://github.com/Vintex-Ages/back-end/issues/259)): usuário criado antes não tem versão de termos, e a leitura segue funcionando.
- **Migration nova encadeia na head atual.** A `e4a2c7b9d1f3` avisou no PR que quem mergeasse uma revisão depois dela precisava ajustar o `down_revision`. O job **Migrations** reprova duas heads, então o ajuste aparece no CI antes do merge.
- **O docstring da revisão diz por que ela existe**, com a issue. É o que sobra quando alguém lê o histórico.
- **Teste de schema usa o Postgres**: `CheckConstraint`, `RETURNING` e extensões (`vector`, `unaccent`) se comportam diferente no SQLite.
- Para conferir localmente, contra um banco descartável: `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head`.
