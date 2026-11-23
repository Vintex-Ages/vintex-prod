---
sidebar_position: 14
---

# Preferências de estilo

Fonte de verdade: `app/constants/styles.py`, `app/controllers/user_controller.py`, `app/repositories/user_preference_repository.py` e a issue [#80](https://github.com/Vintex-Ages/back-end/issues/80).

No onboarding, a pessoa escolhe os estilos de que gosta. As escolhas ficam em `user_preferences` e alimentam o "Garimpados para Você" (ver [Busca por semelhança](./busca-por-semelhanca)).

## Rotas

| Rota | Login | O que faz |
| --- | --- | --- |
| `GET /api/styles` | não | o catálogo de estilos que a tela oferece |
| `GET /api/users/me/preferences` | sim | as preferências gravadas, na ordem em que foram enviadas |
| `PUT /api/users/me/preferences` | sim | substitui o conjunto inteiro |

## O catálogo de estilos

Os estilos são uma constante versionada com o código (`STYLES`), não uma tabela. Mudar o catálogo é um PR.

| `value` | `label` |
| --- | --- |
| `vintage-80-90` | Vintage 80s / 90s |
| `streetwear` | Streetwear Urbano |
| `alfaiataria` | Alfaiataria & Elegância |
| `gotico-dark` | Gótico & Dark Aesthetic |
| `boho-romantico` | Boho Chic & Romântico |
| `y2k` | Y2K Anos 2000 |

Todos têm `type: "estilo"` e uma `description`. As peças guardam o estilo pelo mesmo `value` (`products.style`), e o seed de peças (`app/seeds/pecas.py`) usa a mesma lista.

## Gravar as preferências

```json
PUT /api/users/me/preferences
{ "preferences": [ { "type": "estilo", "value": "y2k" }, { "type": "estilo", "value": "streetwear" } ] }
```

- **O `PUT` substitui tudo.** Apaga as preferências da pessoa e grava as novas na mesma transação. É idempotente, e uma lista vazia limpa o perfil.
- **Item repetido é gravado uma vez só**, sem erro. A unique `(user_id, type, value)` não aceitaria o segundo.
- **Limites:** até 50 itens por `PUT`; `type` com até 50 caracteres e `value` com até 100, os dois sem espaços nas pontas e não vazios.
- **A ordem de envio é preservada** no `GET`.

> <span className="verificar">*</span> **Verificar com quem implementou a #80.** O `PUT` aceita qualquer `type` e `value`: não confere contra o catálogo de `/api/styles`. Um `value` fora do catálogo é gravado, e a recomendação simplesmente o ignora (`texto_do_perfil` só usa estilos que conhece). Falta confirmar se a validação é desejada.

## Como a recomendação usa

- Só as preferências com `type = "estilo"` entram no perfil (`app/services/style_profile.py`).
- Para cada estilo, o texto do perfil junta o `value`, o `label` e a `description` do catálogo. Esse texto vira o vetor comparado com o das peças.
- As peças do estilo escolhido vêm antes das outras ([#346](https://github.com/Vintex-Ages/back-end/issues/346)).
- **Sem preferências, a home não fica vazia:** a recomendação volta o feed genérico com `personalized: false` (RN-38, RN-61).
