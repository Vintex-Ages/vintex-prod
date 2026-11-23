---
sidebar_position: 13
---

# Autenticação e conta

Fonte de verdade: `app/controllers/auth_controller.py`, `app/core/security.py`, `app/controllers/user_controller.py` e o [ADR 0002](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/.ai/adr/0002-autenticacao-jwt.md). Cadastro e login vêm das issues [#77](https://github.com/Vintex-Ages/back-end/issues/77) e [#82](https://github.com/Vintex-Ages/back-end/issues/82); a sessão e o logout, da [#83](https://github.com/Vintex-Ages/back-end/issues/83); o `/me`, da [#84](https://github.com/Vintex-Ages/back-end/issues/84).

As ações de credencial ficam em `/api/auth/*`; o que é do próprio usuário logado fica em `/api/users/me/*` (ADR 0001 §4).

## Rotas

| Rota | Login | O que faz | Resposta |
| --- | --- | --- | --- |
| `POST /api/auth/register` | não | cria a conta e já abre a sessão | `201` com `AuthResponse` · `409 EMAIL_TAKEN` |
| `POST /api/auth/login` | não | abre a sessão | `200` com `AuthResponse` · `401 INVALID_CREDENTIALS` |
| `POST /api/auth/refresh` | não | troca o refresh token por um par novo | `200` com `AuthResponse` · `401 AUTH_REQUIRED` |
| `POST /api/auth/logout` | sim | revoga a sessão | `204` sem corpo |
| `GET /api/users/me` | sim | quem é a pessoa logada | `200` com `id`, `name`, `email`, `is_admin`, `is_seller` |

O `AuthResponse` é o mesmo no cadastro, no login e no refresh:

```json
{
  "user": { "id": 1, "name": "Ana", "email": "ana@exemplo.com", "is_admin": false, "created_at": "2026-11-20T13:00:00Z" },
  "access_token": "<JWT>",
  "refresh_token": "<texto opaco>",
  "token_type": "bearer"
}
```

## Cadastro

- **Senha:** no mínimo 8 caracteres, com ao menos uma letra e um número. Gravada só como hash bcrypt (`users.password_hash`), que nunca sai em resposta nenhuma.
- **Nome:** de 2 a 120 caracteres, contados depois de tirar os espaços das pontas. Um nome só de espaços não passa.
- **E-mail em minúsculas** no cadastro e no login: `Ana@Ex.com` e `ana@ex.com` são a mesma conta.
- **E-mail repetido responde `409 EMAIL_TAKEN`.** A consulta antes do `INSERT` é só a resposta rápida. Quem garante é a unicidade no banco, que também segura dois cadastros simultâneos.
- **`accepted_terms_version` é opcional** ([#259](https://github.com/Vintex-Ages/back-end/issues/259)). A data do aceite (`terms_accepted_at`) só é gravada quando a versão vem, para não registrar um aceite que ninguém deu. Ver [Documentos legais](./documentos-legais).

> <span className="verificar">*</span> **Verificar com quem implementou a #259.** O cadastro não confere `accepted_terms_version` contra `legal_documents`: aceita qualquer texto de até 20 caracteres. O cadastro da loja já confere (ver [Loja do vendedor](./loja-do-vendedor)).

## Login

- **A mensagem de erro é a mesma** para e-mail inexistente e senha errada (`E-mail ou senha inválidos.`), para não revelar quais e-mails têm conta.
- **O tempo de resposta também é o mesmo.** Sem usuário, `verify_password_or_dummy` roda o bcrypt contra um hash fictício, então a demora não denuncia se o e-mail existe.

## Sessão: access token e refresh token

| Token | Formato | Validade | Onde fica |
| --- | --- | --- | --- |
| access | JWT HS256 assinado com `JWT_SECRET`, `type=access` | `ACCESS_TOKEN_EXPIRE_MINUTES` (30 min) | só com o cliente |
| refresh | texto aleatório (`secrets.token_urlsafe(48)`) | `REFRESH_TOKEN_EXPIRE_DAYS` (30 dias) | o banco guarda só o SHA-256 em `refresh_tokens` |

- **O refresh gira a cada uso.** `POST /api/auth/refresh` revoga o token recebido e emite um par novo. Revogar e conferir a validade são um único `UPDATE ... WHERE` (`RefreshTokenRepository.revoke_if_valid`): duas chamadas simultâneas com o mesmo token nunca recebem as duas um par novo.
- **O refresh token é guardado com SHA-256, não com bcrypt.** Ele já tem entropia alta e precisa ser encontrado por igualdade.
- **Token revogado, expirado ou desconhecido responde `401`**, com a mensagem `Sessão inválida ou expirada. Faça login novamente.`
- **Em produção, `JWT_SECRET` não pode ser o valor de desenvolvimento.** A configuração recusa subir (ver [Configuração](../arquitetura/configuracao)).

## Logout

`POST /api/auth/logout` exige o access token e é idempotente: responde `204` em todos os casos.

- **Com `{ "refresh_token": "..." }`:** revoga só esse token. Um token que não existe, já revogado ou de outra pessoa não gera erro, para a rota não confirmar a existência de um token que quem chama não provou ter.
- **Sem corpo:** revoga todos os refresh tokens ativos da pessoa. Serve para quem perdeu o refresh token mas ainda tem o access token.
- O access token já emitido continua válido até expirar (30 min). Não há lista de bloqueio de JWT.

## Papéis e guardas

As guardas ficam em `app/core/security.py` e valem para qualquer rota:

| Guarda | Sem token | Sem o papel |
| --- | --- | --- |
| `require_auth` / `get_current_user` | `401 AUTH_REQUIRED` | — |
| `require_seller` | `401 AUTH_REQUIRED` | `403 FORBIDDEN` |
| `require_admin` | `401 AUTH_REQUIRED` | `403 ADMIN_REQUIRED` |
| `optional_user` | visitante (`None`) | — |

- **`is_seller` não é coluna:** é derivado da existência de um registro em `sellers`. A mesma pessoa pode comprar e vender. O `/me` e o `require_seller` usam a mesma consulta (`SellerRepository.exists_for_user`).
- **`require_admin` lê `users.is_admin` do banco**, nunca a claim do token. Um token emitido antes de o papel ser retirado não continua valendo como admin.
- **`optional_user` nunca falha.** Token expirado ou inválido numa rota pública vira visitante, para um `Authorization` velho não quebrar o catálogo (RN-26).
- `get_current_user_id` (`app/core/current_user.py`) é só um atalho que devolve o id do usuário autenticado. Até a [#151](https://github.com/Vintex-Ages/back-end/issues/151) ele lia o cabeçalho `X-User-Id`; hoje passa pela mesma sessão.

## Conta da administradora

A administradora entra pelo mesmo login. A conta é criada pelo seed `python -m app.seeds.admin` (ver o [README do back-end](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/README.md#conta-da-administradora)). Não há rota para promover alguém a administradora.
