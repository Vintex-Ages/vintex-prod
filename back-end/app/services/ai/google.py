"""Provedor real do Google AI Studio (BE-US027-1, back-end#92).

Primeira chamada real a uma API de IA no projeto — até aqui, `unavailable`
era o único provider (VE-06). Cobre `embed`, `analyze_image` e, desde a
#260, `stream_interpret_search`: a pergunta do chat separada em filtro e
similaridade. Não gera texto conversacional; a resposta são as peças reais.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Sequence

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import settings
from app.constants.embedding import EMBEDDING_DIM
from app.services.ai.analysis_prompt import ANALYZE_IMAGE_PROMPT
from app.services.ai.base import (
    AIProvider,
    AIProviderError,
    AIProviderUnavailableError,
    ChatTurn,
    ImageAnalysisResult,
    ImagePhoto,
    SearchDone,
    SearchStreamEvent,
)
from app.services.ai.media_urls import image_download_url
from app.services.ai.search_interpretation import (
    INTERPRET_SEARCH_PROMPT,
    InterpretacaoDaPergunta,
    interpretacao_da_resposta,
    montar_pergunta,
)

_ANALYZE_IMAGE_PROMPT = ANALYZE_IMAGE_PROMPT

# Os quatro campos de lista fechada citam o vocabulário do catálogo
# (`app/constants/catalog.py`). Sem isso o modelo responde texto livre —
# "Camiseta" para categoria, "Branco e preto" para cor — e o formulário
# descarta, porque nenhum dos dois existe nas opções da tela. Dar a lista
# muda o preenchimento de 2 campos para 5.
# Teto para a chamada ao modelo (o SDK conta em milissegundos).
_GOOGLE_TIMEOUT_MS = 30_000
# A leitura da pergunta do chat tem prazo próprio. Ela é opcional (sem ela a
# busca segue por similaridade), e com o teto geral um modelo travado segurava
# a conversa meio minuto antes de tentar o próximo.
#
# Cada tentativa tem teto de 10s, e a cadeia inteira, com as trocas de modelo,
# as repetições do 503 e as esperas entre elas, para quando o que sobra do prazo
# não cabe mais uma tentativa.
#
# O prazo é 25s, não 30s: o API Gateway corta a requisição inteira em 30s
# (documento de infra de 02/09), e depois da leitura ainda vêm o vetor e a
# busca. Com 25s cabem duas tentativas que esgotam o tempo, não três: um tempo
# esgotado real passa um pouco dos 10s, e na rodada D (12/11), com prazo de 30s,
# duas leituras anunciaram o terceiro modelo e acabaram antes de chamá-lo. O 503
# responde na hora, então 503 seguido de tempo esgotado ainda chega ao terceiro.
#
# 10s é o mínimo que a API aceita: com 8s ela responde 400 "Minimum allowed
# deadline is 10s" em toda chamada (rodada de 12/11), e a leitura nunca sai.
_TETO_MINIMO_DA_API_MS = 10_000
_LEITURA_TETO_POR_TENTATIVA_MS = _TETO_MINIMO_DA_API_MS
_LEITURA_PRAZO_MS = 25_000
# O `sleep` pode acordar um pouco depois do pedido; sem folga, a espera
# terminava e a tentativa seguinte não cabia mais.
_FOLGA_DA_ESPERA_MS = 500


def _lista(valor: str) -> list[str]:
    nomes = [n.strip() for n in valor.split(",")]
    return [n for n in nomes if n]


def modelos_de_visao() -> list[str]:
    """`GOOGLE_VISION_MODEL` como lista, aceitando um nome só ou vários
    separados por vírgula."""
    return _lista(settings.GOOGLE_VISION_MODEL)


# Não existe `modelos_de_embedding()`, e é decisão, não esquecimento.
#
# O primeiro critério da `#209` pedia lista de modelos para visão **e** para
# embedding. O `#224` implementou o de embedding e foi revertido no `#227`,
# porque o critério estava errado quando eu o escrevi:
#
#   1. `find_similar` não filtra por `embedding_model`. Se o fallback
#      disparasse, o vetor da pergunta viria de um modelo e os do catálogo de
#      outro — e distância entre espaços vetoriais diferentes é ruído
#      apresentado como resultado. Um 503 é melhor: falha alto, o front mostra
#      "indisponível", e ninguém recebe resposta errada com cara de certa.
#   2. `scripts/backfill_embeddings.py` lê `GOOGLE_EMBEDDING_MODEL` cru para
#      gravar em `Product.embedding_model` (`String(60)`) e para decidir o que
#      reprocessar. Com lista, gravaria a lista inteira e reprocessaria o
#      catálogo a cada mudança de ordem.
#
# Fallback de visão é diferente e continua: cada `analyze_image` é
# independente, não há vetor guardado com que o resultado precise ser
# comparável.
#
# A `#246` fechou os dois pontos: `find_similar` só compara vetores do modelo
# que `modelo_de_embedding()` devolve, e o backfill passa a recusar lista. O
# fallback continua de fora: com o filtro, ele não devolveria ruído, mas
# esvaziaria a busca, porque nenhuma peça do catálogo teria o outro modelo.


def modelo_de_embedding() -> str:
    """O nome do modelo de embedding ativo, um só (back-end#246).

    É ele que vai para `Product.embedding_model` no backfill e é por ele que
    `find_similar` filtra. Lista separada por vírgula é recusada: gravaria a
    lista inteira na coluna e compararia vetores de espaços diferentes.
    """
    nome = settings.GOOGLE_EMBEDDING_MODEL.strip()
    if not nome or "," in nome:
        raise AIProviderError(
            "GOOGLE_EMBEDDING_MODEL aceita um nome de modelo só, sem lista: "
            f"recebeu {settings.GOOGLE_EMBEDDING_MODEL!r}."
        )
    return nome


def _e_indisponibilidade(exc: Exception) -> bool:
    """503 ou 429 do provedor, pelo código do SDK ou pela mensagem.

    O 429 (`RESOURCE_EXHAUSTED`) é a cota do provedor esgotada, o que a camada
    gratuita responde quando acabam as requisições (back-end#258). Para quem
    pede, é o mesmo que um 503: aquele modelo não responde agora, e outro pode
    responder. Antes o 429 caía direto no erro, sem tentar o próximo.
    """
    codigo = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if codigo in (503, 429):
        return True
    texto = str(exc).upper()
    return ("503" in texto and "UNAVAILABLE" in texto) or (
        "429" in texto and "RESOURCE_EXHAUSTED" in texto
    )


def _e_tempo_esgotado(exc: Exception) -> bool:
    """504 do provedor ou estouro do teto do lado do cliente.

    Medido em 11/11: 6 leituras da pergunta em 111 caíram com 504
    `DEADLINE_EXCEEDED` perto dos 30s. Nas 5 que ficaram no log, o primeiro
    modelo tinha dado 503, e em 4 o 504 veio do segundo: a cadeia parava ali,
    sem tentar o terceiro. O SDK manda o teto do cliente ao servidor
    (`X-Server-Timeout`), então o 504 perto dos 30s era o nosso próprio prazo.

    O httpx levanta `ReadTimeout`, que não herda de `TimeoutError`: por isso o
    nome da classe.
    """
    codigo = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if codigo == 504:
        return True
    if isinstance(exc, TimeoutError) or "Timeout" in type(exc).__name__:
        return True
    texto = str(exc).upper()
    return "DEADLINE_EXCEEDED" in texto or "TIMED OUT" in texto


def _erro_de_prazo(
    tarefa: str, prazo_ms: int | None, ultimo: Exception | None
) -> AIProviderError:
    """O erro de quando a cadeia para pelo prazo. Leva o último erro junto: só
    a mensagem do último modelo esconderia que houve tempo esgotado antes."""
    return AIProviderError(
        f"Falha ao {tarefa}: prazo de {(prazo_ms or 0) / 1000:.0f}s esgotado "
        f"antes da próxima tentativa (último erro: {ultimo})"
    )


logger = logging.getLogger(__name__)

# Rodadas da cadeia de modelos e a espera antes de cada repeticao. Medido em
# 05/10: os tres modelos responderam 503 no mesmo instante e voltaram em menos
# de dois minutos. A cadeia inteira falha em menos de um segundo, entao trocar
# de modelo nao cobre esse caso -- so esperar cobre.
#
# 2s + 4s de espera, mais as chamadas que respondem 503 na hora, cabem no limite
# de 30s que o API Gateway impoe (documento de infra de 02/09). Uma tentativa
# lenta de foto, com o teto geral de 30s, nao cabe: por isso a foto nao troca de
# modelo no tempo esgotado.
_RODADAS = 3
_ESPERA_ENTRE_RODADAS_S = (2.0, 4.0)

_IMAGE_DOWNLOAD_TIMEOUT_S = 10.0
# Alguns hosts (ex.: Wikimedia) recusam requisições sem User-Agent de navegador.
_IMAGE_DOWNLOAD_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VintexBot/1.0)"}

# Sem isso, uma foto (ou uma lista delas) arbitrariamente grande é baixada
# inteira em memória antes de qualquer verificação (revisão da Adrielle no
# PR #200). A quantidade de fotos já é limitada no schema da requisição
# (`ListingSuggestionsRequest`); aqui é o tamanho de cada uma.
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MiB por foto
_MAX_TOTAL_BYTES = 24 * 1024 * 1024  # 24 MiB somando todas as fotos da chamada
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
_DOWNLOAD_CHUNK_SIZE = 64 * 1024


def _partes_das_fotos(images: Sequence[ImagePhoto]) -> list[types.Part]:
    """O prompt e uma parte por foto — o formato que o modelo multimodal lê.

    Extraído de `analyze_image` (back-end#255): o download já produzia
    exatamente `(bytes, mime_type)`, e a busca por foto manda essa mesma
    dupla direto, sem URL. Tipo e tamanho são conferidos aqui também, e não
    só no download: quem chama `analyze_image_bytes` pode não ter passado
    por lá.
    """
    parts = [types.Part.from_text(text=ANALYZE_IMAGE_PROMPT)]
    for foto in images:
        mime_type = foto.mime_type.split(";")[0].strip().lower()
        if mime_type not in _ALLOWED_CONTENT_TYPES:
            raise AIProviderError(
                f"Tipo de arquivo não suportado para a foto: {mime_type or 'desconhecido'!r}."
            )
        if len(foto.data) > _MAX_IMAGE_BYTES:
            raise AIProviderError(
                f"Foto excede o tamanho máximo de {_MAX_IMAGE_BYTES // (1024 * 1024)}MiB."
            )
        parts.append(types.Part.from_bytes(data=foto.data, mime_type=mime_type))
    return parts


class GoogleAIProvider(AIProvider):
    def __init__(self) -> None:
        if not settings.GOOGLE_API_KEY:
            raise AIProviderUnavailableError(
                "GOOGLE_API_KEY não configurada para AI_PROVIDER=google."
            )
        # Sem `timeout`, o SDK passa `timeout=None` ao httpx, que significa
        # esperar para sempre. A rota e sincrona: uma chamada pendurada segura
        # uma thread do pool, e algumas delas derrubam a API inteira. A regra
        # da #150 e que demora tambem nao pode travar o cadastro.
        self._client = genai.Client(
            api_key=settings.GOOGLE_API_KEY,
            http_options=types.HttpOptions(timeout=_GOOGLE_TIMEOUT_MS),
        )

    def analyze_image(self, image_urls: Sequence[str]) -> ImageAnalysisResult:
        """Sugere atributos a partir das fotos indicadas por URL.

        Baixa cada foto e delega a análise aos bytes (back-end#255): o
        caminho da busca por foto não tem URL, e os dois precisam montar as
        mesmas partes para o modelo.
        """
        if not image_urls:
            return ImageAnalysisResult()
        return self.analyze_image_bytes(self._baixar_fotos(image_urls))

    def analyze_image_bytes(self, images: Sequence[ImagePhoto]) -> ImageAnalysisResult:
        """Sugere atributos a partir dos bytes das fotos (back-end#255).

        Não grava nada e não baixa nada: é o caminho da busca por foto, que
        recebe a imagem no corpo da requisição.
        """
        if not images:
            return ImageAnalysisResult()

        result = self._gerar_com_fallback(_partes_das_fotos(images))

        parsed = result.parsed
        if isinstance(parsed, ImageAnalysisResult):
            return parsed
        if result.text:
            try:
                return ImageAnalysisResult.model_validate_json(result.text)
            except ValueError as exc:
                raise AIProviderError(
                    f"Resposta do provedor não bate com o formato esperado: {exc}"
                ) from exc
        raise AIProviderError("Provedor não devolveu uma análise para as fotos.")

    @staticmethod
    def _baixar_fotos(image_urls: Sequence[str]) -> list[ImagePhoto]:
        """Baixa cada foto, com teto por foto e no total, e o tipo declarado.

        O teto por foto é conferido enquanto baixa, não depois: sem isso,
        uma foto arbitrariamente grande seria carregada inteira em memória
        antes de qualquer verificação (revisão da Adrielle no PR #200).
        """
        fotos: list[ImagePhoto] = []
        total_bytes = 0
        try:
            with httpx.Client(
                timeout=_IMAGE_DOWNLOAD_TIMEOUT_S,
                follow_redirects=True,
                headers=_IMAGE_DOWNLOAD_HEADERS,
            ) as client:
                for url in image_urls:
                    with client.stream("GET", image_download_url(url)) as photo:
                        photo.raise_for_status()
                        mime_type = photo.headers.get("content-type", "").split(";")[0]
                        if mime_type not in _ALLOWED_CONTENT_TYPES:
                            raise AIProviderError(
                                f"Tipo de arquivo não suportado para a foto: {mime_type or 'desconhecido'!r}."
                            )

                        chunks = bytearray()
                        for chunk in photo.iter_bytes(_DOWNLOAD_CHUNK_SIZE):
                            chunks += chunk
                            total_bytes += len(chunk)
                            if len(chunks) > _MAX_IMAGE_BYTES:
                                raise AIProviderError(
                                    f"Foto excede o tamanho máximo de {_MAX_IMAGE_BYTES // (1024 * 1024)}MiB."
                                )
                            if total_bytes > _MAX_TOTAL_BYTES:
                                raise AIProviderError(
                                    f"Fotos somadas excedem o tamanho máximo de {_MAX_TOTAL_BYTES // (1024 * 1024)}MiB."
                                )

                    fotos.append(ImagePhoto(data=bytes(chunks), mime_type=mime_type))
        except httpx.HTTPError as exc:
            raise AIProviderError(f"Falha ao baixar foto da peça: {exc}") from exc
        return fotos

    async def stream_interpret_search(
        self, query: str, history: Sequence[ChatTurn] = ()
    ) -> AsyncIterator[SearchStreamEvent]:
        """Separa a pergunta em filtro e similaridade (back-end#260).

        Uma chamada só, com saída estruturada, nos mesmos modelos de geração
        da análise de foto (`GOOGLE_VISION_MODEL`), com o mesmo fallback no
        503 e no 429. Não emite texto: o que a pessoa lê é o que foi
        interpretado (`InterpretedQuery`) e as peças, que o controller busca.
        """
        parts = [
            types.Part.from_text(text=INTERPRET_SEARCH_PROMPT),
            types.Part.from_text(text=montar_pergunta(query, history)),
        ]
        # O SDK é síncrono: no event loop, seguraria as outras requisições
        # enquanto o modelo responde.
        result = await asyncio.to_thread(
            self._gerar_com_fallback,
            parts,
            schema=InterpretacaoDaPergunta,
            tarefa="interpretar a pergunta",
            prazo_ms=_LEITURA_PRAZO_MS,
        )

        parsed = result.parsed
        if not isinstance(parsed, InterpretacaoDaPergunta):
            if not result.text:
                raise AIProviderError("Provedor não devolveu a interpretação.")
            try:
                parsed = InterpretacaoDaPergunta.model_validate_json(result.text)
            except ValueError as exc:
                raise AIProviderError(
                    f"Interpretação fora do formato esperado: {exc}"
                ) from exc

        yield interpretacao_da_resposta(parsed)
        yield SearchDone()

    def _gerar_com_fallback(
        self,
        parts: list[types.Part],
        *,
        schema: type[BaseModel] = ImageAnalysisResult,
        tarefa: str = "analisar as fotos",
        prazo_ms: int | None = None,
    ) -> types.GenerateContentResponse:
        """Tenta os modelos configurados em ordem, pulando os que dão 503 ou 429.

        Só esses fazem seguir para o próximo: é falta de capacidade ou de cota
        do provedor, e outro modelo costuma estar de pé no mesmo instante. 404 (nome que
        não existe para a chave) e 400 (entrada recusada) são erro nosso, e
        tentar outro só esconderia a causa.

        Quando a cadeia inteira responde 503, espera e repete. Medido em 05/10:
        os três modelos recusaram no mesmo instante e voltaram em menos de dois
        minutos. A cadeia falha em menos de um segundo, então trocar de modelo
        não cobre o congestionamento simultâneo -- só esperar cobre.

        Tempo esgotado (504 ou o teto do cliente) depende de `prazo_ms`:

        - sem prazo (a análise da foto), levanta na hora, como sempre fez: cada
          tentativa leva o teto geral de 30s, e trocar de modelo levaria a
          chamada a minutos;
        - com prazo (a leitura da pergunta), cada tentativa tem teto de 10s e
          tempo esgotado pula para o próximo modelo, como o 503, mas o modelo
          lento não volta nas rodadas de repetição. A cadeia para quando o que
          sobra do prazo não cabe mais uma tentativa, inclusive antes de
          esperar para repetir.
        """
        modelos = modelos_de_visao()
        if not modelos:
            # Sem isto, lista vazia caía no `raise` do fim com `ultimo = None` e
            # produzia "Falha ao ...: None", que não diz nada.
            raise AIProviderError(
                "GOOGLE_VISION_MODEL está vazio: nenhum modelo para tentar."
            )
        ultimo: Exception | None = None
        opcoes_http = (
            types.HttpOptions(timeout=_LEITURA_TETO_POR_TENTATIVA_MS)
            if prazo_ms is not None
            else None
        )
        inicio = time.monotonic()
        # Modelo que esgotou o tempo não volta nas rodadas de repetição: elas
        # são para o 503, que passa em segundos, e repetir o lento gastaria o
        # teto de novo sem chance melhor.
        lentos: set[str] = set()

        def cabe(espera_s: float = 0.0, folga_ms: float = 0.0) -> bool:
            if prazo_ms is None:
                return True
            gasto_ms = (time.monotonic() - inicio) * 1000
            sobra_ms = prazo_ms - gasto_ms - espera_s * 1000 - folga_ms
            return sobra_ms >= _LEITURA_TETO_POR_TENTATIVA_MS

        for rodada in range(_RODADAS):
            da_vez = [m for m in modelos if m not in lentos]
            if not da_vez:
                break
            if rodada:
                espera = _ESPERA_ENTRE_RODADAS_S[rodada - 1]
                # A folga cobre o atraso do próprio `sleep`: sem ela, a espera
                # podia terminar um pouco depois e a tentativa não caber.
                if not cabe(espera, _FOLGA_DA_ESPERA_MS):
                    raise _erro_de_prazo(tarefa, prazo_ms, ultimo) from ultimo
                logger.warning(
                    "Nenhum modelo respondeu; esperando %.0fs e repetindo os %d "
                    "que deram 503 (rodada %d de %d)",
                    espera,
                    len(da_vez),
                    rodada + 1,
                    _RODADAS,
                )
                time.sleep(espera)

            for modelo in da_vez:
                if not cabe():
                    raise _erro_de_prazo(tarefa, prazo_ms, ultimo) from ultimo
                comeco = time.monotonic()
                try:
                    return self._client.models.generate_content(
                        model=modelo,
                        contents=[types.Content(parts=parts)],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=schema,
                            http_options=opcoes_http,
                        ),
                    )
                except Exception as exc:  # SDK do Google não documenta uma exceção só
                    ultimo = exc
                    if _e_tempo_esgotado(exc) and prazo_ms is not None:
                        motivo = "tempo esgotado"
                        lentos.add(modelo)
                    elif _e_indisponibilidade(exc):
                        motivo = "indisponível (503)"
                    else:
                        raise AIProviderError(f"Falha ao {tarefa}: {exc}") from exc

                    # Sem "tentando o próximo": quem decide se ele cabe é o
                    # prazo, na volta do laço. A duração é o que diz se o 503
                    # respondeu na hora ou gastou o prazo.
                    logger.warning(
                        "Modelo %s %s em %.1fs",
                        modelo,
                        motivo,
                        time.monotonic() - comeco,
                    )

        raise AIProviderError(f"Falha ao {tarefa}: {ultimo}") from ultimo

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        # Um `types.Content` por texto: `contents=list(texts)` (strings soltas)
        # faz o SDK tratar a lista inteira como as partes de UM conteúdo só,
        # devolvendo um único vetor para todos os textos juntos — não um por
        # texto. Encapsular cada texto no seu próprio `Content` é o que faz o
        # batch devolver um vetor por entrada, na mesma ordem.
        contents = [types.Content(parts=[types.Part(text=text)]) for text in texts]
        # Um nome de modelo só, de propósito — o bloco de comentário no topo
        # deste arquivo explica por que não há fallback aqui.
        try:
            response = self._client.models.embed_content(
                model=settings.GOOGLE_EMBEDDING_MODEL,
                contents=contents,
                config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
            )
        except Exception as exc:  # SDK do Google não documenta uma exceção só
            raise AIProviderError(f"Falha ao gerar embedding: {exc}") from exc

        if response.embeddings is None or len(response.embeddings) != len(texts):
            raise AIProviderError(
                "Resposta de embedding do Google não tem um vetor por texto enviado."
            )

        vectors = [list(item.values or []) for item in response.embeddings]
        if any(len(vector) != EMBEDDING_DIM for vector in vectors):
            # Sem isso, um vetor vazio (`values=None`) ou de dimensão errada
            # (ex.: o modelo trocou o padrão) é gravado como se fosse válido —
            # e como o backfill é idempotente por `embedding IS NOT NULL`, a
            # peça nunca mais seria reprocessada, mesmo com o provedor bom.
            raise AIProviderError(
                f"Provedor devolveu vetor com dimensão diferente de {EMBEDDING_DIM}."
            )
        return vectors
