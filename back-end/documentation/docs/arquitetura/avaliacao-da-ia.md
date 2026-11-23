---
sidebar_position: 5
---

# Avaliação da IA

Fonte de verdade: `scripts/avaliar_ia.py`, os conjuntos em `scripts/avaliacao/` e a issue [#326](https://github.com/Vintex-Ages/back-end/issues/326) (VE-10).

A suíte mede a qualidade da IA contra conjuntos de referência fixos. Ela chama o provedor real, então **não roda no CI**. Cada rodada fica gravada no repositório, para comparar uma mudança de prompt ou de modelo com a rodada anterior.

## O que é medido

| Conjunto | Arquivo | Como roda | O que conta |
| --- | --- | --- | --- |
| Conversa | `conversa.json` (`catalogo`, `nao_temos`, `instrucao`) | pela rota de verdade da [conversa com a Vintex](../dominio/conversa-com-a-vintex), com interpretação, filtro, relaxamento e aviso | se as peças devolvidas atendem ao pedido, se o "não temos" é dito quando não há peça e se a instrução embutida na pergunta é ignorada |
| Perfis de estilo | `perfis.json` | `RecommendationController.recommend_for` com as preferências de cada perfil, sem criar usuário | se a [recomendação](../dominio/busca-por-semelhanca) traz o estilo do perfil |
| Fotos | `fotos.json` | `analyze_image_bytes`, o mesmo prompt do cadastro e da [busca por foto](../dominio/busca-por-foto) | categoria e cor certas por foto; cada campo conferido como diagnóstico (acertou, nulo certo pela RN-58, deixou nulo, errou); e se a instrução escrita na foto foi obedecida |

O esperado de cada caso é escrito contra o tipo de peça do seed, não contra ids. A cada rodada, o script calcula no banco quais peças ativas atendem ao caso. Um caso que o catálogo atual não consegue avaliar sai da conta, com aviso.

## As regras da contagem

- **Toda peça devolvida é conferida contra o banco** (RN-65): id, nome, preço e loja. Uma peça que não bate reprova a rodada, e o script sai com código `1`.
- **Falha que não é resposta da IA não conta como erro da IA.** Rede, cota, erro do provedor ou do script tiram o caso da conta e deixam o conjunto incompleto. Conjunto incompleto não serve de base, e o script sai com código `2`.
- **Leitura que não chega é disponibilidade, não acerto.** Quando o provedor falha na leitura da pergunta, a busca segue sem filtro. O caso sai da taxa e entra no número de leituras que chegaram. Se menos de 80% (`LEITURAS_MINIMAS`) chegaram, os conjuntos da conversa não servem de base.
- **A comparação é sempre com a última rodada completa do mesmo conjunto**, com os mesmos casos (o hash do conjunto fica gravado).

## Como rodar

Pré-requisitos: banco com os seeds (`app.seeds.lojas`, `app.seeds.pecas`) e os vetores (`python -m scripts.backfill_embeddings`), provedor de IA real no `.env` e a API de pé, **rodando deste mesmo checkout**.

```bash
python -m scripts.avaliar_ia --contar                 # só conta as chamadas previstas
python -m scripts.avaliar_ia --nota "o que mudou"     # roda e grava a rodada
python -m scripts.avaliar_ia --so perfis --nota "..." # um conjunto só
python -m scripts.avaliar_ia --api http://127.0.0.1:8000 --nota "..."
```

`--so` aceita `catalogo`, `nao_temos`, `instrucao`, `perfis` ou `fotos` e pode ser repetido. `--api` tem `http://127.0.0.1:8000` como padrão.

**A cota da conversa não é contornada por dentro.** Ela trava na sexta pergunta de uma origem (ver [Conversa com a Vintex](../dominio/conversa-com-a-vintex)). Antes da rodada, suba `CHAT_QUOTA_PER_PERSON` e `CHAT_QUOTA_PER_DAY` no `.env` e reinicie a API. O script confere no banco quanto resta antes de começar. Com a API no Docker, a origem que ela vê não é `127.0.0.1`.

## As rodadas

Cada rodada é gravada em `scripts/avaliacao/rodadas/<data>.json` a cada conjunto concluído, para uma falha no meio não perder o que já rodou. O arquivo guarda a nota de quem rodou, o commit do script, se havia alterações locais, os modelos usados, as peças ativas, as respostas recebidas e o resultado de cada conjunto.

As rodadas ficam versionadas no repositório, e a saída de cada rodada nova se compara com elas.

## Testes

`tests/test_avaliar_ia.py` e `tests/test_avaliar_ia_rodada.py` testam, sem chamar o provedor, o que faria a rodada contar errado: o tipo de cada peça, o critério de cada caso, a conferência contra o banco e a conta da taxa. Os payloads de injeção de prompt do CI ficam em `CASOS_DE_INJECAO` (`tests/test_prompt_injection.py`), separados em dados para poderem ser reaproveitados pela suíte.
