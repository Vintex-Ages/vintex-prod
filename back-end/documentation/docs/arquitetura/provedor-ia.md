---
sidebar_position: 2
---

# Provedor de IA

Fonte de verdade: [`app/services/ai/`](https://github.com/Vintex-Ages/back-end/tree/develop/app/services/ai) e `.ai/architecture.md` (VE-06, [#63](https://github.com/Vintex-Ages/back-end/issues/63)).

Toda feature de IA consome `AIProvider` / `get_ai_provider()` — nunca um SDK de IA diretamente. Isso existe para que trocar de provedor seja só registrar e apontar a config, sem tocar quem chama.

## Sem provedor configurado

Enquanto nenhum provedor real for escolhido, o provider ativo é `UnavailableAIProvider`. Ele levanta `AIProviderUnavailableError` — quem chama **degrada a funcionalidade**, nunca deixa isso virar um `500` sem tratamento. Ex.: cadastro manual de peça continua funcionando mesmo com a IA fora do ar; só o preenchimento automático fica indisponível.

## Modelo de embedding: um nome só

`GOOGLE_EMBEDDING_MODEL` aceita **um** nome de modelo, e `modelo_de_embedding()` (`app/services/ai/google.py`) é quem o lê para todo o sistema. É ele que o backfill grava em `products.embedding_model` e é por ele que a [busca por semelhança](../dominio/busca-por-semelhanca) filtra: vetores de modelos diferentes não são comparáveis. Lista separada por vírgula é recusada com `AIProviderError` ([#246](https://github.com/Vintex-Ages/back-end/issues/246)).

Por isso o embedding **não tem fallback de modelo**, diferente da visão (`GOOGLE_VISION_MODEL`, que aceita lista): um 503 no embedding falha alto, e o chat mostra "indisponível". Cair para outro modelo não devolveria ruído, por causa do filtro, mas esvaziaria a busca, porque nenhuma peça do catálogo teria o outro modelo.

## Indisponibilidade: 503, 500 e 429

`_e_indisponibilidade` (`app/services/ai/google.py`) decide se uma falha do provedor faz tentar o próximo modelo de `GOOGLE_VISION_MODEL`. Contam o **503** (`UNAVAILABLE`, falta de capacidade), o **500** (`INTERNAL`, erro do lado do Google, que a documentação dele manda repetir; foi 1 das 6 leituras que caíram na rodada de 12/11) e o **429** (`RESOURCE_EXHAUSTED`, cota do provedor esgotada, [#258](https://github.com/Vintex-Ages/back-end/issues/258)): nos três, aquele modelo não responde agora e outro pode responder. Se todos falharem, o erro é o mesmo `AIProviderError`, e a sugestão de anúncio responde `503 AI_UNAVAILABLE` nos dois casos.

A mesma cadeia serve à interpretação da pergunta do chat (`stream_interpret_search`, [#260](https://github.com/Vintex-Ages/back-end/issues/260)): uma chamada com saída estruturada (`InterpretacaoDaPergunta`), que o controller transforma em filtro do catálogo. Lá, a falha não vira erro: a busca segue só por similaridade ([Conversa com a Vintex](../dominio/conversa-com-a-vintex#filtro-e-similaridade)).

**Quando a cadeia inteira dá 503, ela é repetida** ([#264](https://github.com/Vintex-Ages/back-end/issues/264)). `_gerar_com_fallback` faz até três rodadas (`_RODADAS`), com espera de 2 s antes da segunda e de 4 s antes da terceira (`_ESPERA_ENTRE_RODADAS_S`). O caso que motivou: na preparação da apresentação de 05/10, os três modelos de `GOOGLE_VISION_MODEL` responderam `503` ao mesmo tempo, a cadeia inteira falhou em menos de um segundo, e as três tentativas seguintes, feitas à mão, deram `200` em 9,5 s, 5,2 s e 3,9 s. O congestionamento durou menos de dois minutos. A #209 cobria um modelo fora; esta cobre todos fora por um instante, e só esperar resolve.

- **A repetição vale para o que `_e_indisponibilidade` reconhece**: o 503, o 500 e, desde a [#258](https://github.com/Vintex-Ages/back-end/issues/258), o 429 <span className="verificar" title="A issue #264 e o PR #266 dizem 'só para 503'; o código também repete no 429. Confirmar com quem implementou.">*</span>. Erro nosso (404, 400) levanta na primeira ocorrência, sem espera.
- O log diz quando entra numa rodada nova, para a falha não ficar invisível. Quando todas as rodadas falham, a mensagem é a mesma de antes.
- A espera entra no tempo de resposta. Os testes ficam em `tests/test_ai_retry_503.py`.

> <span className="verificar">*</span> **Verificar com quem implementou a #264 e a #343.** (1) A #264 pede a repetição "só para 503", e o PR repete o mesmo. Hoje `_gerar_com_fallback` decide pela mesma `_e_indisponibilidade`, que desde a #258 inclui o 429 (`RESOURCE_EXHAUSTED`, cota esgotada) e, desde a #343, o 500. Cota esgotada dificilmente volta em 2 s ou 4 s, então a repetição no 429 só soma 6 s de espera antes do mesmo erro; falta confirmar se é intencional. (2) O critério da #264, "o total cabe folgado em 30 segundos", ficou resolvido para a leitura da pergunta e para a fala, que têm prazo total (ver abaixo). A **análise de foto continua sem prazo total**: cada tentativa tem o teto de 30 s do SDK (`_GOOGLE_TIMEOUT_MS`), e com as trocas de modelo e as repetições do 503, do 500 e do 429 a chamada pode passar do limite do API Gateway. O PR da #343 descreve a foto como "igual à `develop`" e, mais adiante, diz que o 500 passa a trocar de modelo também nela, sem ter medido quanto um 500 leva.

Os demais (404 de nome que não existe, 400 de entrada recusada) são erro nosso e falham no primeiro modelo: tentar outro esconderia a causa. A cota do chat, que evita chegar no 429, está em [Conversa com a Vintex](../dominio/conversa-com-a-vintex#cota-do-dia).

## Tempo esgotado e prazo total

Quando um modelo demora demais, o Google responde `504 DEADLINE_EXCEEDED`, ou o cliente estoura o teto (`httpx.ReadTimeout`, reconhecido pelo nome da classe, porque ele não herda de `TimeoutError`): é o que `_e_tempo_esgotado` reconhece ([#343](https://github.com/Vintex-Ages/back-end/issues/343)). Antes, a chamada desistia ali, sem tentar o próximo modelo, e na conversa a falha era silenciosa: a leitura da pergunta caía, a busca seguia sem filtro e a pessoa esperava meio minuto. O que acontece agora depende do `prazo_ms` de `_gerar_com_fallback`:

| Chamada | Prazo da cadeia inteira | Tempo esgotado |
| --- | --- | --- |
| leitura da pergunta do chat | 25 s (`_LEITURA_PRAZO_MS`) | passa para o próximo modelo, como o 503 |
| fala da assistente ([#329](https://github.com/Vintex-Ages/back-end/issues/329)) | 15 s (`_FALA_PRAZO_MS`) | idem |
| análise de foto | nenhum | levanta na hora, como sempre <span className="verificar" title="Ver a nota acima: o 500 troca de modelo também na foto, e o tempo que ele leva não foi medido.">*</span> |

- **Cada tentativa, quando há prazo, tem teto de 10 s** (`_LEITURA_TETO_POR_TENTATIVA_MS`). Esse é o **mínimo que a API aceita**: com 8 s ela respondeu `400 INVALID_ARGUMENT` ("Minimum allowed deadline is 10s") nas 37 leituras de uma rodada contra o modelo real, e os testes passavam porque o SDK é simulado. Um teste trava o mínimo.
- **O prazo é da cadeia inteira**, contando trocas de modelo, repetições do 503 e esperas: uma tentativa que não cabe no que resta não começa, nem antes de esperar para repetir (a folga de 500 ms cobre o atraso do próprio `sleep`).
- **O modelo que esgotou o tempo não volta nas repetições do 503**: elas são para o que passa em segundos, e repetir o lento gastaria o teto de novo.
- **Por que 25 s e não 30 s.** Na staging, o nginx (`proxy_read_timeout 30s`) e o CloudFront (`origin_read_timeout = 30`) cortam a resposta que passa 30 s sem mandar nada. A leitura que cai não manda evento, e depois dela ainda vêm o vetor e a busca. Com 25 s cabem duas tentativas que esgotam o tempo, não três; o 503 responde na hora, então um 503 seguido de tempo esgotado ainda chega ao terceiro modelo.
- **A fala tem 15 s** porque acontece depois de as peças já estarem na tela: o que ela atrasa é só o comentário. Cabe uma tentativa que esgota o teto de 10 s, e ainda cabe trocar de modelo quando o 503 responde na hora.
- **A foto não tem prazo**: sem ele, trocar de modelo podia levar uma chamada de foto a 90 s (3 modelos com o teto geral de 30 s). O 500, que não depende de prazo, troca de modelo também na foto.
- O log registra a duração de cada tentativa (`Modelo X indisponível em N s`), para dizer se o 503 respondeu na hora ou gastou o prazo.

## Onde isso importa

- [VE-05 (#62)](https://github.com/Vintex-Ages/back-end/issues/62) — pipeline assíncrono de ingestão de IA.
- [VE-07 (#65)](https://github.com/Vintex-Ages/back-end/issues/65) — observabilidade de IA.
- [VE-08 (#66)](https://github.com/Vintex-Ages/back-end/issues/66) — guardrails contra injeção.

Essas três issues estão em hold nesta sprint (S2) — o foco atual é a infraestrutura de teste local. Ver [Infraestrutura de teste local](../infraestrutura/teste-local).

A [VE-10 (#64)](https://github.com/Vintex-Ages/back-end/issues/64), a suíte de avaliação da IA, foi entregue pela [#326](https://github.com/Vintex-Ages/back-end/issues/326): ver [Avaliação da IA](./avaliacao-da-ia).
