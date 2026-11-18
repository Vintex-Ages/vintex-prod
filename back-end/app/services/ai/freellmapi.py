"""Adaptador do endpoint interno FreeLLMAPI (OpenAI compatível)."""

from __future__ import annotations

import base64
import math
from collections.abc import AsyncIterator, Sequence

import httpx

from app.config import settings
from app.constants.embedding import EMBEDDING_DIM
from app.services.ai.analysis_prompt import ANALYZE_IMAGE_PROMPT
from app.services.ai.base import (
    AIProvider,
    AIProviderError,
    AIProviderUnavailableError,
    ChatTurn,
    ImageAnalysisResult,
    SearchStreamEvent,
)
from app.services.ai.etiqueta import RespostaDaFoto, analise_da_resposta
from app.services.ai.media_urls import image_download_url

_IMAGE_TIMEOUT_SECONDS = 10.0
_PROVIDER_TIMEOUT_SECONDS = 45.0
_MAX_IMAGE_BYTES = 8 * 1024 * 1024
_MAX_TOTAL_BYTES = 24 * 1024 * 1024
_DOWNLOAD_CHUNK_SIZE = 64 * 1024
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
_DOWNLOAD_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VintexBot/1.0)"}
_UNAVAILABLE_MESSAGE = "FreeLLMAPI não implementa esta operação."

# O gateway só garante JSON (`json_object`), sem o schema que o Google recebe:
# o formato vai no texto, e só aqui, para não mudar o prompt do Google.
_JSON_FORMAT = """
Responda somente com um objeto JSON, sem texto fora dele, neste formato \
(omita ou use null nos campos que não souber sugerir):
{"category": {"value": "...", "confidence": 0.9}, "color": {...}, \
"size": {...}, "condition": {...}, "description": {...}, "brand": {...}, \
"composition": {...}, "label_text": "..."}
"""


def _normalizar(vector: list[float]) -> list[float]:
    norma = math.sqrt(sum(x * x for x in vector))
    return [x / norma for x in vector] if norma else vector


class FreeLLMAPIProvider(AIProvider):
    """Usa o endpoint OpenAI compatível interno (FreeLLMAPI).

    Serve o worker de imagens (`analyze_image`) e, com `AI_PROVIDER=freellmapi`,
    a API síncrona (sugestão de cadastro e `embed` da busca). A conversa da
    busca (`stream_interpret_search`) não tem implementação aqui.
    """

    def __init__(self) -> None:
        if not settings.FREELLMAPI_API_KEY:
            raise AIProviderUnavailableError(
                "FREELLMAPI_API_KEY não configurada para o provedor de IA."
            )
        self._base_url = settings.FREELLMAPI_BASE_URL.rstrip("/")
        self._api_key = settings.FREELLMAPI_API_KEY
        self._model = settings.FREELLMAPI_MODEL

    async def stream_interpret_search(
        self, query: str, history: Sequence[ChatTurn] = ()
    ) -> AsyncIterator[SearchStreamEvent]:
        raise AIProviderUnavailableError(_UNAVAILABLE_MESSAGE)
        yield  # pragma: no cover - nunca alcançado; mantém a função geradora

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = httpx.post(
                f"{self._base_url}/embeddings",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": settings.FREELLMAPI_EMBEDDING_MODEL,
                    "input": list(texts),
                    "dimensions": EMBEDDING_DIM,
                },
                timeout=_PROVIDER_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            items = sorted(response.json()["data"], key=lambda item: item["index"])
            vectors = [[float(x) for x in item["embedding"]] for item in items]
        except httpx.HTTPStatusError as exc:
            raise AIProviderError(
                f"FreeLLMAPI respondeu HTTP {exc.response.status_code} no embedding."
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError(
                "FreeLLMAPI inacessível ou expirou no embedding."
            ) from exc
        except (KeyError, TypeError, ValueError) as exc:
            raise AIProviderError("FreeLLMAPI devolveu um embedding inválido.") from exc

        if len(vectors) != len(texts) or any(
            len(vector) != EMBEDDING_DIM for vector in vectors
        ):
            raise AIProviderError(
                f"FreeLLMAPI não devolveu um vetor de {EMBEDDING_DIM} dimensões "
                "por texto enviado."
            )
        # Com `dimensions` menor que a nativa o gateway devolve o vetor cortado,
        # sem norma 1; a busca por cosseno espera vetores normalizados.
        return [_normalizar(vector) for vector in vectors]

    def analyze_image(self, image_urls: Sequence[str]) -> ImageAnalysisResult:
        if not image_urls:
            return ImageAnalysisResult()

        images = self._download_images(image_urls)
        content: list[dict[str, object]] = [
            {"type": "text", "text": ANALYZE_IMAGE_PROMPT + _JSON_FORMAT}
        ]
        content.extend(
            {
                "type": "image_url",
                "image_url": {"url": data_url},
            }
            for data_url in images
        )

        try:
            response = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": content}],
                    "response_format": {"type": "json_object"},
                },
                timeout=_PROVIDER_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
            answer = payload["choices"][0]["message"]["content"]
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("resposta vazia")
            return analise_da_resposta(RespostaDaFoto.model_validate_json(answer))
        except httpx.HTTPStatusError as exc:
            # Só o status: o corpo e a URL podem carregar token ou foto pré-assinada.
            raise AIProviderError(
                f"FreeLLMAPI respondeu HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError("FreeLLMAPI inacessível ou expirou.") from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AIProviderError(
                f"FreeLLMAPI devolveu uma análise inválida ({type(exc).__name__})."
            ) from exc

    @staticmethod
    def _download_images(image_urls: Sequence[str]) -> list[str]:
        total_bytes = 0
        data_urls: list[str] = []
        try:
            with httpx.Client(
                timeout=_IMAGE_TIMEOUT_SECONDS,
                follow_redirects=True,
                headers=_DOWNLOAD_HEADERS,
            ) as client:
                for url in image_urls:
                    with client.stream("GET", image_download_url(url)) as response:
                        response.raise_for_status()
                        media_type = response.headers.get("content-type", "").split(
                            ";", maxsplit=1
                        )[0]
                        if media_type not in _ALLOWED_CONTENT_TYPES:
                            raise AIProviderError(
                                "Tipo de arquivo não suportado para a foto."
                            )

                        image = bytearray()
                        for chunk in response.iter_bytes(_DOWNLOAD_CHUNK_SIZE):
                            image.extend(chunk)
                            total_bytes += len(chunk)
                            if len(image) > _MAX_IMAGE_BYTES:
                                raise AIProviderError(
                                    "Foto excede o tamanho máximo de 8 MiB."
                                )
                            if total_bytes > _MAX_TOTAL_BYTES:
                                raise AIProviderError(
                                    "Fotos somadas excedem o tamanho máximo de 24 MiB."
                                )

                    encoded = base64.b64encode(image).decode("ascii")
                    data_urls.append(f"data:{media_type};base64,{encoded}")
        except httpx.HTTPError:
            # Evita incluir a URL, que pode conter query string pré-assinada.
            raise AIProviderError("Falha ao baixar foto da peça.") from None
        return data_urls
