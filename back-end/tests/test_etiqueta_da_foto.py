"""Marca, tamanho e composição só com texto lido na foto (back-end#345)."""

from __future__ import annotations

import json

import pytest

from app.services.ai import google as google_module
from app.services.ai.analysis_prompt import ANALYZE_IMAGE_PROMPT
from app.services.ai.base import ImageAnalysisResult, ImagePhoto, SuggestedField
from app.services.ai.etiqueta import RespostaDaFoto, analise_da_resposta


def campo(valor: str) -> SuggestedField:
    return SuggestedField(value=valor, confidence=0.9)


def resposta(label_text=None, **campos) -> RespostaDaFoto:
    base = {"category": campo("Roupas"), "color": campo("Branco")}
    base.update({k: campo(v) for k, v in campos.items()})
    return RespostaDaFoto(label_text=label_text, **base)


# --- a conferência -----------------------------------------------------------------


def test_marca_e_tamanho_sem_texto_da_etiqueta_saem_nulos():
    """O caso da blusa bordada: etiqueta ilegível, "Keds" e "M" inventados."""
    analise = analise_da_resposta(resposta(brand="Keds", size="M"))

    assert analise.brand is None
    assert analise.size is None
    assert analise.category.value == "Roupas"
    assert analise.color.value == "Branco"


def test_texto_vazio_conta_como_nao_lido():
    analise = analise_da_resposta(resposta(label_text="  ", brand="Kora"))

    assert analise.brand is None


def test_marca_que_nao_aparece_no_texto_lido_sai_nula():
    analise = analise_da_resposta(resposta(label_text="100% ALGODÃO", brand="Kookai"))

    assert analise.brand is None


@pytest.mark.parametrize(
    ("lido", "marca"),
    [
        ("LEVI'S 501", "Levi's"),
        ("Levi Strauss & Co.", "Levi's"),
        ("ZARA BASIC  Z1975", "ZARA BASIC"),
        ("kiikii", "KIIKII"),
        ("Hering — feito no Brasil", "hering"),
    ],
)
def test_marca_que_aparece_no_texto_lido_fica(lido, marca):
    analise = analise_da_resposta(resposta(label_text=lido, brand=marca))

    assert analise.brand is not None
    assert analise.brand.value == marca


@pytest.mark.parametrize(
    ("lido", "fica"),
    [("KORA M", True), ("TAM. 38", False), ("MADE IN BRAZIL", False), ("m", True)],
)
def test_tamanho_so_fica_como_palavra_do_texto_lido(lido, fica):
    analise = analise_da_resposta(resposta(label_text=lido, size="M"))

    assert (analise.size is not None) is fica


def test_composicao_depende_de_haver_texto_lido():
    sem = analise_da_resposta(resposta(composition="100% algodão"))
    com = analise_da_resposta(
        resposta(
            label_text="95% POLIESTER\n5% ELASTANO",
            composition="95% poliéster, 5% elastano",
        )
    )

    assert sem.composition is None
    assert com.composition.value == "95% poliéster, 5% elastano"


def test_a_analise_sai_sem_o_texto_lido():
    """O texto lido não chega ao formulário."""
    analise = analise_da_resposta(resposta(label_text="LEVI'S", brand="Levi's"))

    assert type(analise) is ImageAnalysisResult
    assert "label_text" not in analise.model_dump()


def test_o_prompt_pede_o_texto_lido():
    assert "label_text" in ANALYZE_IMAGE_PROMPT


# --- no provedor do Google -----------------------------------------------------------


class _Resposta:
    def __init__(self, parsed=None, text=None):
        self.parsed = parsed
        self.text = text


class _Modelos:
    def __init__(self, devolve):
        self.devolve = devolve
        self.chamadas: list[dict] = []

    def generate_content(self, **kwargs):
        self.chamadas.append(kwargs)
        return self.devolve


class _Cliente:
    def __init__(self, modelos):
        self.models = modelos


def _google(monkeypatch, devolve) -> tuple[google_module.GoogleAIProvider, _Modelos]:
    monkeypatch.setattr(google_module.settings, "GOOGLE_API_KEY", "chave-de-teste")
    modelos = _Modelos(devolve)
    monkeypatch.setattr(google_module.genai, "Client", lambda **_: _Cliente(modelos))
    return google_module.GoogleAIProvider(), modelos


FOTO = [ImagePhoto(b"foto", "image/jpeg")]


def test_google_pede_o_texto_lido_e_descarta_a_marca_inventada(monkeypatch):
    provider, modelos = _google(
        monkeypatch, _Resposta(parsed=resposta(brand="Keds", size="M"))
    )

    analise = provider.analyze_image_bytes(FOTO)

    assert modelos.chamadas[0]["config"].response_schema is RespostaDaFoto
    assert analise.brand is None
    assert analise.size is None


def test_google_pelo_texto_da_resposta_tambem_confere(monkeypatch):
    corpo = {"brand": {"value": "Kora"}, "label_text": None}
    provider, _ = _google(monkeypatch, _Resposta(text=json.dumps(corpo)))

    assert provider.analyze_image_bytes(FOTO).brand is None


def test_google_mantem_a_marca_lida(monkeypatch):
    provider, _ = _google(
        monkeypatch, _Resposta(parsed=resposta(label_text="LEVI'S", brand="Levi's"))
    )

    assert provider.analyze_image_bytes(FOTO).brand.value == "Levi's"
