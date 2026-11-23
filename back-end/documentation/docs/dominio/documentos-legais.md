---
sidebar_position: 15
---

# Documentos legais

Fonte de verdade: `app/models/legal_document.py`, `app/controllers/legal_document_controller.py` e `app/seeds/legal.py`.

Os termos de uso e o contrato de venda são textos versionados. As duas rotas são **públicas**: o texto precisa ser lido antes do cadastro e do login.

| Rota | Documento | Resposta |
| --- | --- | --- |
| `GET /api/legal/terms` | termos de uso (`termos_uso`) | `200` · `404 LEGAL_DOCUMENT_NOT_FOUND` |
| `GET /api/legal/seller-contract` | contrato de venda (`contrato_venda`) | `200` · `404 LEGAL_DOCUMENT_NOT_FOUND` |

```json
{
  "document_type": "termos_uso",
  "version": "v0",
  "content": "TERMOS DE USO — VERSÃO PROVISÓRIA (v0) ...",
  "published_at": "2026-10-01T12:00:00Z"
}
```

## As decisões

- **A tabela só recebe `INSERT`.** Trocar o texto é publicar uma versão nova, nunca editar a antiga. Quem aceitou uma versão continua apontando para o texto exato que leu.
- **A rota devolve a versão mais recente**, pela `published_at` (empate decidido pelo `id`).
- **`(document_type, version)` é único**, e `document_type` só aceita os dois valores (CHECK no banco).
- **`version` tem até 20 caracteres**, o mesmo tamanho de `sellers.terms_version` e `users.terms_version`, que guardam esse valor no aceite.

## Onde o aceite é gravado

| Quem aceita | Campo | Conferido contra `legal_documents`? |
| --- | --- | --- |
| Pessoa, no cadastro (`POST /api/auth/register`) | `users.terms_version`, `users.terms_accepted_at` | não (ver [Autenticação e conta](./autenticacao-e-conta#cadastro)) |
| Vendedor, ao criar a loja (`POST /api/users/me/store`) | `sellers.terms_version`, `sellers.terms_accepted_at` | sim, contra o contrato de venda (ver [Loja do vendedor](./loja-do-vendedor)) |

## Seed

```bash
python -m app.seeds.legal
```

Cria a `v0` dos dois documentos se ainda não existirem. O texto é provisório. O texto oficial, quando a stakeholder enviar, entra como uma versão nova (`v1`), nunca editando a `v0`. Sem o seed, as duas rotas respondem `404`.
