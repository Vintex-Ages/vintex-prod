"""Provider determinístico para testes de ponta a ponta.

Não é um fornecedor real: devolve sempre a mesma análise de imagem e vetores
derivados do texto (bag-of-words com hash), para que a suíte E2E exercite os
fluxos de IA sem rede, sem cota e sem variação entre execuções.

Só é selecionável fora de produção (ver `factory.py`). Em produção o nome
`fake` cai no provider indisponível, como qualquer nome desconhecido.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import AsyncIterator, Sequence

from app.constants.embedding import EMBEDDING_DIM
from app.services.ai.base import (
    AIProvider,
    ChatTurn,
    ImageAnalysisResult,
    ImagePhoto,
    InterpretedQuery,
    SearchDone,
    SearchStreamEvent,
    SearchTextDelta,
    SuggestedField,
)

# Análise fixa: o formulário de cadastro precisa receber campos preenchidos e
# o teste precisa saber exatamente o que esperar. Os valores seguem o
# vocabulário fechado de `app/constants/catalog.py` — categoria "Roupas",
# cor "Preto", conservação "Seminovo" — para passarem nas validações do form.
_IMAGE_ANALYSIS = ImageAnalysisResult(
    category=SuggestedField(value="Roupas", confidence=0.98),
    color=SuggestedField(value="Preto", confidence=0.94),
    size=SuggestedField(value="M", confidence=0.9),
    condition=SuggestedField(value="Seminovo", confidence=0.88),
    description=SuggestedField(
        value="Peça preta em bom estado, com caimento reto e acabamento simples.",
        confidence=0.92,
    ),
    brand=SuggestedField(value="Zara", confidence=0.86),
    composition=SuggestedField(value="100% poliéster", confidence=0.8),
)

# Categoria pelo substantivo da pergunta: garante resultado previsível no chat
# sem depender de embeddings do catálogo (que o seed não gera).
_CATEGORY_KEYWORDS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("sapato", "tenis", "tênis", "bota", "sandalia", "sandália"), "Sapatos"),
    (("bolsa", "cinto", "acessorio", "acessório", "cachecol"), "Acessórios"),
    (
        ("vestido", "blusa", "camisa", "calca", "calça", "saia", "casaco", "jaqueta"),
        "Roupas",
    ),
)

_DELTAS = ("Procurando ", "peças ", "que combinam ", "com o que você pediu…")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


class FakeAIProvider(AIProvider):
    """Análise de imagem fixa, busca por palavra-chave e vetores estáveis."""

    def analyze_image(self, image_urls: Sequence[str]) -> ImageAnalysisResult:
        return _IMAGE_ANALYSIS.model_copy(deep=True)

    def analyze_image_bytes(self, images: Sequence[ImagePhoto]) -> ImageAnalysisResult:
        return _IMAGE_ANALYSIS.model_copy(deep=True)

    async def stream_interpret_search(
        self, query: str, history: Sequence[ChatTurn] = ()
    ) -> AsyncIterator[SearchStreamEvent]:
        for delta in _DELTAS:
            yield SearchTextDelta(delta=delta)

        yield InterpretedQuery(filters=self._filters(query), similarity=None)
        yield SearchDone()

    @staticmethod
    def _filters(query: str) -> dict[str, str]:
        text = _normalize(query)
        for keywords, category in _CATEGORY_KEYWORDS:
            if any(keyword in text for keyword in keywords):
                return {"category": category}
        return {}

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    @staticmethod
    def _embed_one(text: str) -> list[float]:
        vector = [0.0] * EMBEDDING_DIM
        for token in re.findall(r"[a-z0-9]+", _normalize(text)):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            first = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
            second = int.from_bytes(digest[4:8], "big") % EMBEDDING_DIM
            vector[first] += 1.0
            vector[second] += 0.5

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            # Texto sem token nenhum ainda precisa de um vetor válido: o
            # primeiro eixo evita NaN na distância de cosseno.
            vector[0] = 1.0
            return vector
        return [value / norm for value in vector]
