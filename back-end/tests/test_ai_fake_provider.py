"""Provider determinístico usado pela suíte E2E (`AI_PROVIDER=fake`)."""

import pytest

from app.constants.embedding import EMBEDDING_DIM
from app.services.ai import get_ai_provider
from app.services.ai.base import InterpretedQuery, SearchDone
from app.services.ai.fake import FakeAIProvider
from app.services.ai.unavailable import UnavailableAIProvider


def test_analise_de_imagem_e_fixa_e_usa_vocabulario_do_catalogo() -> None:
    provider = FakeAIProvider()

    result = provider.analyze_image(["https://example.com/foto.jpg"])

    assert result.category is not None and result.category.value == "Roupas"
    assert result.color is not None and result.color.value == "Preto"
    assert result.condition is not None and result.condition.value == "Seminovo"
    # A análise não depende da foto: é o que torna a suíte reproduzível.
    assert provider.analyze_image_bytes([]).model_dump() == result.model_dump()


@pytest.mark.asyncio
async def test_pergunta_de_roupa_vira_filtro_de_categoria() -> None:
    provider = FakeAIProvider()

    events = [
        event
        async for event in provider.stream_interpret_search("quero um vestido preto")
    ]

    interpreted = next(event for event in events if isinstance(event, InterpretedQuery))
    assert interpreted.filters == {"category": "Roupas"}
    assert isinstance(events[-1], SearchDone)


@pytest.mark.asyncio
async def test_pergunta_de_calcado_vira_sapatos() -> None:
    provider = FakeAIProvider()

    events = [
        event
        async for event in provider.stream_interpret_search(
            "tenho um tênis pra combinar"
        )
    ]

    interpreted = next(event for event in events if isinstance(event, InterpretedQuery))
    assert interpreted.filters == {"category": "Sapatos"}


def test_embedding_tem_a_dimensao_do_catalogo_e_e_estavel() -> None:
    provider = FakeAIProvider()

    first = provider.embed(["vestido preto"])[0]
    second = provider.embed(["vestido preto"])[0]

    assert len(first) == EMBEDDING_DIM
    assert first == second
    assert abs(sum(value * value for value in first) - 1.0) < 1e-9


def test_texto_sem_token_ainda_gera_vetor_unitario() -> None:
    vector = FakeAIProvider().embed([""])[0]

    assert len(vector) == EMBEDDING_DIM
    assert vector[0] == 1.0


def test_fake_e_selecionavel_fora_de_producao(monkeypatch) -> None:
    monkeypatch.setattr("app.services.ai.factory.settings.AI_PROVIDER", "fake")
    monkeypatch.setattr("app.services.ai.factory.settings.APP_ENV", "development")

    assert isinstance(get_ai_provider(), FakeAIProvider)


def test_fake_nunca_e_selecionado_em_producao(monkeypatch) -> None:
    monkeypatch.setattr("app.services.ai.factory.settings.AI_PROVIDER", "fake")
    monkeypatch.setattr("app.services.ai.factory.settings.APP_ENV", "production")

    assert isinstance(get_ai_provider(), UnavailableAIProvider)
