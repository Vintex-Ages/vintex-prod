"""Recomendação pelo perfil de estilo, o "Garimpados para Você" (back-end#253)."""

from __future__ import annotations

import logging
from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.pagination import PageParams
from app.models.user_preference import UserPreference
from app.repositories.product_repository import ProductFeedRow, ProductRepository
from app.repositories.user_preference_repository import UserPreferenceRepository
from app.schemas.product_schema import (
    ProductFeedItemResponse,
    ProductFilters,
    RecommendationsResponse,
)
from app.services.style_profile import (
    estilos_do_perfil,
    texto_do_perfil,
    vetor_do_perfil,
)

logger = logging.getLogger(__name__)


class RecommendationController:
    """Peças parecidas com o perfil de estilo de quem pede (RN-62, RN-64).

    Sem perfil nunca é erro (RN-38): vem o feed genérico, com
    `personalized: false`, e não lista vazia (RN-61). O mesmo vale quando a
    recomendação não consegue sair: a IA falhou ao gerar o vetor do perfil, ou
    nenhuma peça do catálogo tem vetor ainda (ambiente sem IA, como a staging).

    As peças do estilo escolhido vêm antes das outras (back-end#346, VS-029):
    a semelhança sozinha deixava o estilo como uma palavra no meio do texto da
    peça, e a peça já guarda o estilo em `style`.
    """

    def __init__(self, db: Session):
        self.products = ProductRepository(db)
        self.preferences = UserPreferenceRepository(db)

    def recommend(self, user_id: int, params: PageParams) -> RecommendationsResponse:
        return self.recommend_for(
            self.preferences.list_for_user(user_id), params, user_id=user_id
        )

    def recommend_for(
        self,
        preferencias: Sequence[UserPreference],
        params: PageParams,
        *,
        user_id: int | None = None,
    ) -> RecommendationsResponse:
        """A recomendação para um conjunto de preferências.

        A rota passa as gravadas no onboarding. A suíte de avaliação
        (`scripts/avaliar_ia.py`) passa as de cada perfil, sem criar usuário.
        """
        texto = texto_do_perfil(preferencias)
        if texto is not None:
            try:
                vetor, modelo = vetor_do_perfil(texto)
            except Exception:  # noqa: BLE001 - a home não pode cair por causa da IA
                logger.warning(
                    "Recomendação genérica para %s: falha ao gerar o vetor do perfil.",
                    user_id,
                    exc_info=True,
                )
            else:
                parecidas, total = self.products.find_similar(
                    vetor,
                    modelo,
                    params,
                    prefer_styles=estilos_do_perfil(preferencias),
                )
                if total:
                    return self._resposta(parecidas, total, params, personalized=True)

        feed, total = self.products.get_active_feed(params, ProductFilters())
        return self._resposta(feed, total, params, personalized=False)

    @staticmethod
    def _resposta(
        rows: Sequence[ProductFeedRow],
        total: int,
        params: PageParams,
        *,
        personalized: bool,
    ) -> RecommendationsResponse:
        return RecommendationsResponse(
            items=[ProductFeedItemResponse.from_row(row) for row in rows],
            personalized=personalized,
            page=params.page,
            page_size=params.page_size,
            total=total,
        )
