"""Provider síncrono via FreeLLMAPI: embedding, validação e erros com status."""

import math

import httpx
import pytest

from app.constants.embedding import EMBEDDING_DIM
from app.services.ai import factory, modelo_de_embedding
from app.services.ai.analysis_prompt import ANALYZE_IMAGE_PROMPT
from app.services.ai.base import (
    AIProviderError,
    AIProviderUnavailableError,
    ImageAnalysisResult,
)
from app.services.ai.freellmapi import _JSON_FORMAT, FreeLLMAPIProvider


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(
        "app.services.ai.freellmapi.settings.FREELLMAPI_API_KEY", "fake-test-token"
    )


class _Response:
    def __init__(self, status: int = 200, payload: dict | None = None):
        self.status_code = status
        self._payload = payload or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("POST", "http://freellmapi:3001/v1/x")
            raise httpx.HTTPStatusError(
                "erro", request=request, response=httpx.Response(self.status_code)
            )

    def json(self):
        return self._payload


def _embedding_payload(vectors: list[list[float]]) -> dict:
    return {
        "data": [
            {"index": index, "embedding": vector}
            for index, vector in enumerate(vectors)
        ]
    }


def test_embed_requests_configured_family_and_dimension(monkeypatch) -> None:
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs["json"]
        captured["headers"] = kwargs["headers"]
        return _Response(payload=_embedding_payload([[3.0, 4.0] + [0.0] * 766]))

    monkeypatch.setattr("app.services.ai.freellmapi.httpx.post", fake_post)

    [vector] = FreeLLMAPIProvider().embed(["camiseta preta"])

    assert captured["url"] == "http://freellmapi:3001/v1/embeddings"
    assert captured["json"] == {
        "model": "gemini-embedding-001",
        "input": ["camiseta preta"],
        "dimensions": EMBEDDING_DIM,
    }
    assert captured["headers"]["Authorization"] == "Bearer fake-test-token"
    assert len(vector) == EMBEDDING_DIM
    assert math.isclose(math.sqrt(sum(x * x for x in vector)), 1.0)
    assert vector[:2] == pytest.approx([0.6, 0.8])


def test_embed_keeps_input_order_when_gateway_reorders(monkeypatch) -> None:
    first = [1.0] + [0.0] * (EMBEDDING_DIM - 1)
    second = [0.0, 1.0] + [0.0] * (EMBEDDING_DIM - 2)
    payload = _embedding_payload([first, second])
    payload["data"].reverse()
    monkeypatch.setattr(
        "app.services.ai.freellmapi.httpx.post",
        lambda *a, **k: _Response(payload=payload),
    )

    assert FreeLLMAPIProvider().embed(["a", "b"]) == [first, second]


def test_embed_empty_input_does_not_call_gateway(monkeypatch) -> None:
    def fail(*args, **kwargs):
        raise AssertionError("não deveria chamar o gateway")

    monkeypatch.setattr("app.services.ai.freellmapi.httpx.post", fail)

    assert FreeLLMAPIProvider().embed([]) == []


@pytest.mark.parametrize(
    "payload",
    [
        _embedding_payload([[1.0, 2.0]]),  # dimensão errada
        _embedding_payload([]),  # menos vetores que textos
        {"data": [{"index": 0}]},  # sem "embedding"
        {},  # sem "data"
    ],
)
def test_embed_rejects_malformed_responses(monkeypatch, payload) -> None:
    monkeypatch.setattr(
        "app.services.ai.freellmapi.httpx.post",
        lambda *a, **k: _Response(payload=payload),
    )

    with pytest.raises(AIProviderError):
        FreeLLMAPIProvider().embed(["camiseta"])


@pytest.mark.parametrize("status", [401, 429, 502])
def test_errors_report_status_without_leaking_body(monkeypatch, status) -> None:
    monkeypatch.setattr(
        "app.services.ai.freellmapi.httpx.post", lambda *a, **k: _Response(status)
    )

    with pytest.raises(AIProviderError, match=f"HTTP {status}") as failure:
        FreeLLMAPIProvider().embed(["camiseta"])

    assert "fake-test-token" not in str(failure.value)


def test_embed_wraps_transport_errors(monkeypatch) -> None:
    def boom(*args, **kwargs):
        raise httpx.ConnectTimeout("lento")

    monkeypatch.setattr("app.services.ai.freellmapi.httpx.post", boom)

    with pytest.raises(AIProviderError, match="inacessível"):
        FreeLLMAPIProvider().embed(["camiseta"])


@pytest.mark.asyncio
async def test_stream_interpret_search_is_unavailable() -> None:
    with pytest.raises(AIProviderUnavailableError):
        async for _ in FreeLLMAPIProvider().stream_interpret_search("calça"):
            pass


def test_factory_selects_freellmapi(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "AI_PROVIDER", "freellmapi")

    assert isinstance(factory.get_ai_provider(), FreeLLMAPIProvider)


@pytest.mark.parametrize(
    "provider,expected",
    [("freellmapi", "gemini-embedding-001"), ("google", "modelo-google")],
)
def test_embedding_model_follows_the_active_provider(
    monkeypatch, provider, expected
) -> None:
    """É o nome gravado em `Product.embedding_model` e o filtro da busca."""
    monkeypatch.setattr("app.services.ai.google.settings.AI_PROVIDER", provider)
    monkeypatch.setattr(
        "app.services.ai.google.settings.GOOGLE_EMBEDDING_MODEL", "modelo-google"
    )

    assert modelo_de_embedding() == expected


def test_freellmapi_embedding_model_rejects_lists(monkeypatch) -> None:
    monkeypatch.setattr("app.services.ai.google.settings.AI_PROVIDER", "freellmapi")
    monkeypatch.setattr(
        "app.services.ai.google.settings.FREELLMAPI_EMBEDDING_MODEL", "a,b"
    )

    with pytest.raises(AIProviderError, match="FREELLMAPI_EMBEDDING_MODEL"):
        modelo_de_embedding()


def test_result_treats_null_value_as_empty_field() -> None:
    """Foto sem roupa: o modelo responde `{"value": null}` em vez de omitir."""
    result = ImageAnalysisResult.model_validate_json(
        '{"category": {"value": null, "confidence": 0.0},'
        ' "color": {"value": "  ", "confidence": 0.0},'
        ' "size": {"value": 38, "confidence": 0.8},'
        ' "description": {"value": "Paisagem sem roupa", "confidence": 1.0}}'
    )

    assert result.category is None
    assert result.color is None
    assert result.size is not None and result.size.value == "38"
    assert result.description is not None
    assert result.description.value == "Paisagem sem roupa"


def test_photo_response_with_null_values_still_goes_through_label_check() -> None:
    """A resposta do gateway passa por `RespostaDaFoto` antes da conferência."""
    from app.services.ai.etiqueta import RespostaDaFoto, analise_da_resposta

    resposta = RespostaDaFoto.model_validate_json(
        '{"category": {"value": "Roupas", "confidence": 0.9},'
        ' "brand": {"value": null}, "composition": {"value": ""},'
        ' "label_text": null}'
    )
    result = analise_da_resposta(resposta)

    assert result.category is not None and result.category.value == "Roupas"
    assert result.brand is None and result.composition is None


def test_gateway_prompt_asks_for_json_object() -> None:
    """Groq recusa `response_format=json_object` sem a palavra "json" no prompt.

    O formato vai só na chamada do gateway; o prompt comum, que o Google usa
    com schema estruturado, não muda.
    """
    assert "json" in _JSON_FORMAT.lower()
    for campo in ("category", "composition", "label_text", '"value"'):
        assert campo in _JSON_FORMAT
    assert "json" not in ANALYZE_IMAGE_PROMPT.lower()
