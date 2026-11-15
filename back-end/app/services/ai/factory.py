"""Ponto único de troca de provedor de IA.

Trocar de fornecedor é registrar a nova classe em `_PROVIDERS` e apontar
`AI_PROVIDER` (env) para a chave correspondente — nenhuma feature muda
(critério de aceite da VE-06).
"""

from __future__ import annotations

from app.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.fake import FakeAIProvider
from app.services.ai.google import GoogleAIProvider
from app.services.ai.unavailable import UnavailableAIProvider

_PROVIDERS: dict[str, type[AIProvider]] = {
    "unavailable": UnavailableAIProvider,
    "google": GoogleAIProvider,
    # Determinístico, para a suíte E2E (ver `fake.py`). Nunca em produção.
    "fake": FakeAIProvider,
}


def get_ai_provider() -> AIProvider:
    """Instancia o provider configurado em `settings.AI_PROVIDER`.

    Nome desconhecido ou não configurado cai em `UnavailableAIProvider`
    (degrada sem erro fatal, em vez de derrubar a aplicação).
    """
    name = settings.AI_PROVIDER
    if name == "fake" and settings.APP_ENV == "production":
        name = "unavailable"
    provider_cls = _PROVIDERS.get(name, UnavailableAIProvider)
    return provider_cls()
