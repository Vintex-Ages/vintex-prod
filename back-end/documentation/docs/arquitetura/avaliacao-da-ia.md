---
sidebar_position: 5
---

# Avaliação da IA

Fonte de verdade: `scripts/avaliar_ia.py`, os conjuntos em `scripts/avaliacao/` (`conversa.json`, `perfis.json`, `fotos.json`), as rodadas gravadas em `scripts/avaliacao/rodadas/` e as issues [#326](https://github.com/Vintex-Ages/back-end/issues/326) e [#64](https://github.com/Vintex-Ages/back-end/issues/64) (VE-10). Entrou pelo PR vintex-prod#79; o #87 acrescentou a rodada de 15/11.

É a medição repetível da IA contra o modelo real: a conversa, a recomendação por estilo e a análise de foto. Cada rodada fica gravada no repositório, com o que o modelo respondeu, e a saída mostra o que mudou desde a última rodada comparável. Não é teste automático: gasta chamadas ao provedor e roda à mão.

## Como rodar

```bash
python -m scripts.avaliar_ia --contar                  # só conta as chamadas
python -m scripts.avaliar_ia --nota "o que mudou"      # roda tudo e grava a rodada
python -m scripts.avaliar_ia --so perfis --nota "..."  # um conjunto só (catalogo, nao_temos, instrucao, perfis, fotos)
```

Pré-condições: o banco com o seed (`app.seeds.lojas` e `app.seeds.pecas`) e os vetores (`scripts.backfill_embeddings`); a API de pé em `--api` (padrão `http://127.0.0.1:8000`), **rodando deste mesmo checkout**; o provedor de IA real no `.env`. `--nota` diz o que a rodada mede e é o que fica gravado para quem comparar depois.

A cota do chat ([Conversa com a Vintex](../dominio/conversa-com-a-vintex#cota-do-dia)) trava na sexta pergunta de uma mesma origem, e o script não a contorna por dentro: quem roda sobe `CHAT_QUOTA_PER_PERSON` e `CHAT_QUOTA_PER_DAY` no `.env` da rodada e reinicia a API. O script confere no banco o que ainda resta antes de começar, e se a cota acabar no meio, o caso sai da conta e a conversa para.

## O que cada conjunto mede

| Conjunto | Casos | Como o acerto é definido | Meta |
| --- | --- | --- | --- |
| `catalogo` (conversa) | 25 perguntas | a pergunta foi lida e pelo menos uma peça esperada está entre as 5 devolvidas, com `match_type: "exact"`; no caso com corte de preço, o teto lido é o pedido | 0,8 (VS-027) |
| `nao_temos` (conversa) | 9 perguntas | `match_type: "fallback"`, ao menos uma peça e um aviso (RN-61: nunca lista vazia) | 1,0 |
| `instrucao` (conversa) | 3 perguntas | texto que tenta mandar na IA: o resultado esperado, sem erro e sem filtro fora do vocabulário | 1,0 |
| `perfis` | 8 perfis de estilo | 80% ou mais das primeiras peças da recomendação são dos estilos declarados | 0,8 (VS-029) |
| `fotos` | 8 fotos e 2 cópias com instrução escrita | categoria e cor certas, por foto (a história fala em 20 fotos; o conjunto tem 8) | 0,8 (VS-014) |

- **A conversa passa pela rota de verdade** (`POST /api/ai/chat`), com leitura, filtro, relaxamento e aviso, porque é isso que se mede.
- **Os perfis não passam pela rota**, que exige login: o script monta o `RecommendationController.recommend_for` com as preferências do perfil, o mesmo código da home. O vetor do perfil sai antes, pela mesma função e com o mesmo cache, então uma falha do provedor aparece como falha, e não como a recomendação genérica que a home mostra nesse caso.
- **As fotos chamam `analyze_image_bytes` direto**, o mesmo prompt do cadastro e da busca por foto. Cada campo também é conferido contra o que se vê na foto (acertou, nulo certo pela RN-58, deixou nulo ou preencheu errado), como diagnóstico, sem meta. "Preencheu errado" é contado à parte, porque é o que o vendedor não percebe. A instrução escrita na foto conta fora da taxa: resistiu ou obedeceu.
- A busca por imagem ficou de fora (decisão de 11/11): não há conjunto de imagens com resposta esperada, e ela usa a mesma análise da foto e o mesmo vetor da conversa, que as medições cobrem.

O esperado de cada caso é escrito pelo **tipo** do modelo do seed (`app/seeds/pecas.py`), e não pelo id: a cada rodada o script calcula no banco quais peças ativas atendem ao caso. Caso de catálogo sem nenhuma peça esperada, ou caso de "não temos" que passou a ter peça, é inválido para aquele catálogo e sai da conta, com aviso.

## O que reprova ou invalida a rodada

| Situação | Efeito |
| --- | --- |
| uma peça devolvida não bate com o banco (id, nome, preço ou loja, RN-65) | reprova a rodada inteira; o script sai com código `1` |
| falha que não é resposta da IA (rede, cota, erro do provedor, erro do próprio script) | o caso sai da conta e o conjunto fica incompleto; o script sai com código `2` |
| conjunto incompleto | não serve de base para a comparação seguinte |
| menos de 80% das leituras da pergunta chegaram (`LEITURAS_MINIMAS`) | a conversa daquela rodada não serve de base |

**Leitura que cai não é erro da busca.** O chat só deixa de emitir a leitura quando o provedor falha, e aí a busca segue sem filtro: é disponibilidade do Gemini. Por isso a leitura que não chegou sai da taxa da busca e vira outro número, o das leituras que chegaram. O corte de 80% vale para a conversa inteira, e não para cada conjunto: a queda é da janela de tempo, e num conjunto de 3 casos uma queda só daria 67%.

**A meta não baixa para o que a IA consegue hoje.** O que está abaixo dela ganha uma tarefa. Cada conjunto guarda a rodada que o calibrou (`calibrada_em`) e uma `nota` com o resultado: na rodada de 12/11 os perfis acertaram 1 de 8, com 54% em média, o que gerou a [#346](https://github.com/Vintex-Ages/back-end/issues/346); depois dela, a rodada de 14/11 chegou a 8 de 8.

## A rodada gravada

Cada arquivo em `scripts/avaliacao/rodadas/` traz a data, o commit do script, se havia alteração local, os modelos usados, as chamadas previstas, o hash dos casos de cada conjunto, as respostas recebidas e a nota de quem rodou. É gravado a cada conjunto, por troca de arquivo, para uma falha no meio não perder nem cortar nada. A saída compara cada conjunto com a última rodada em que **o mesmo conjunto, com os mesmos casos,** rodou completo, e mostra o caso que virou inválido e a taxa que mudou.

A rodada de 15/11 (`2026-11-15T001235Z`, PR #87) foi feita com os PRs #77, #78, #79, #80, #85 e #86 na `develop`: os cinco conjuntos completos, 34 de 37 leituras chegaram (92%) e 48 peças ativas no seed. Por ter passado do corte de 80%, é a primeira que serve de base para todos os conjuntos, inclusive a conversa.

Custo: a pergunta gasta 2 chamadas (a leitura e o vetor), o perfil 1 e a foto 1. `--contar` mostra o total antes de gastar.

Os testes do próprio script ficam em `tests/test_avaliar_ia.py` e `tests/test_avaliar_ia_rodada.py`. A suíte é a VE-10 do [provedor de IA](./provedor-ia).
