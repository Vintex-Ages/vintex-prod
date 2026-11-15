"""Moderação de anúncios pela administradora (back-end#327).

Tirar do ar (RN-80) é despublicar com motivo gravado — o registro que o
vendedor vê na peça dele —, e devolver é o mesmo caminho do `publish` do
vendedor, inclusive a exigência de foto (RN-47). A diferença está em quem pode:
só a administradora mexe na peça de qualquer vendedor (RN-32), e o vendedor não
republica sozinho o que a moderação tirou (RN-80). A devolução também respeita
de onde a peça veio: a que o vendedor tinha pausado volta pausada, e não entra
no feed por uma suspensão (RN-50).
"""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.clock import utcnow_naive
from app.core.errors import AppError, Conflict, ErrorCode, NotFound, ValidationError
from app.core.pagination import Page, PageParams
from app.models.product import Product
from app.models.user import User
from app.repositories.notification_repository import NotificationRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.admin_moderation_schema import (
    ModeratedProductResponse,
    ModerationAuthor,
    ModerationResponse,
    ModerationStore,
)
from app.services.product_embedding import pedir_embedding, precisa_de_embedding


class AdminModerationController:
    """Suspender, devolver à vitrine e listar as peças Suspensas (back-end#327)."""

    def __init__(
        self,
        db: Session,
        agendar_embedding: Callable[[int], None] | None = None,
    ):
        self.products = ProductRepository(db)
        self.notifications = NotificationRepository(db)
        # Mesmo gancho do `ProductController`: o vetor é gerado depois da
        # resposta, e a devolução à vitrine volta a valer na busca por
        # semelhança (back-end#245).
        self._agendar_embedding = agendar_embedding or (lambda _product_id: None)

    def suspend(self, product_id: int, reason: str, admin: User) -> ModerationResponse:
        """Tira a peça do ar com motivo, data e autor (RN-80).

        Peça `vendido`, `reservado` ou `rascunho` responde 409 e não muda de
        estado: a primeira é dinheiro contado (RN-53), a segunda está num
        pedido aberto (RN-46) e a terceira nunca foi publicada — suspendê-la
        sairia da aba de rascunhos do vendedor para um estado de moderação que
        não tirou nada do ar. A RN-80 não abre exceção, então o anúncio
        inadequado já reservado continua no ar até o pedido resolver.

        A peça `despublicado` pode: é a que o vendedor pausou, e o estado de
        origem fica gravado para o `restore` devolvê-la pausada (RN-50).

        Suspender de novo atualiza o motivo e a data, sem avisar outra vez: o
        vendedor não precisa de dois avisos da mesma suspensão, mas o aviso que
        ele já tem passa a dizer o motivo novo. Devolvida à vitrine e suspensa
        de novo, é outra suspensão — e outro aviso, com a data dele.
        """
        product = self._get(product_id)
        self._recusar_status_incompativel(product)

        ja_estava = product.moderated_at is not None
        if not ja_estava:
            # Só na primeira suspensão: na segunda a peça já está em
            # `despublicado`, e gravar isso apagaria de onde ela veio.
            product.moderation_previous_status = product.status
        product.status = "despublicado"
        product.moderation_reason = reason
        product.moderated_at = utcnow_naive()
        product.moderated_by_id = admin.id
        if ja_estava:
            self.notifications.update_moderation_reason(
                user_id=product.store.seller.user_id,
                product_id=product.id,
                reason=reason,
            )
        else:
            # O aviso leva o motivo (RN-80): "suspensa" sem o porquê não diz ao
            # vendedor o que corrigir.
            self.notifications.add_moderation(
                user_id=product.store.seller.user_id,
                product_id=product.id,
                reason=reason,
            )
        self.products.commit()
        return _resposta(product)

    def restore(self, product_id: int, admin: User) -> ModerationResponse:
        """Devolve a peça Suspensa ao estado de onde a suspensão a tirou (RN-80).

        Sem foto, recusa: a `republish` saiu na `#230` justamente por usar o
        sentido `-> ativo` sem esta checagem e pôr peça sem imagem no feed
        público. Aqui é a mesma regra, pelo mesmo motivo.

        `ativo` fixo seria a moderação publicando por conta própria: a peça que
        o vendedor tinha pausado entraria no feed sem ele publicar (RN-50). O
        status sai de `moderation_previous_status`, então a pausada volta
        pausada — e o caminho dela de volta ao feed continua sendo o `publish`
        do vendedor.

        Devolver uma peça que não está suspensa é conflito: esta rota não é o
        "publicar" geral da administradora.
        """
        product = self._get(product_id)
        if product.moderated_at is None:
            raise Conflict(
                "Esta peça não está suspensa pela moderação.",
                code=ErrorCode.PRODUCT_NOT_SUSPENDED,
            )
        if not product.images:
            raise ValidationError(
                "Devolver à vitrine exige ao menos uma foto.",
                fields={"images": "A peça precisa de ao menos uma foto para voltar."},
            )
        if product.moderation_previous_status is None:
            # Invariante do `suspend`: toda Suspensa tem a origem gravada. Nulo
            # aqui é defeito de gravação, não dado do usuário.
            raise RuntimeError("Peça suspensa sem o estado anterior gravado.")

        product.status = product.moderation_previous_status
        product.moderation_reason = None
        product.moderated_at = None
        product.moderated_by_id = None
        product.moderation_previous_status = None

        # O vetor só vale para a peça no feed: devolvida a `despublicado`, ela
        # continua fora da busca, e o vetor é pedido pelo `publish` do vendedor.
        gerar_vetor = product.status == "ativo" and precisa_de_embedding(product)
        if gerar_vetor:
            pedir_embedding(product)
        self.products.commit()
        if gerar_vetor:
            self._agendar_embedding(product.id)
        return _resposta(product)

    def list_suspended(self, params: PageParams) -> Page[ModeratedProductResponse]:
        """As peças tiradas do ar pela moderação, mais recente primeiro.

        A lista é de Suspensas, não de todas as `despublicado`: a peça que o
        vendedor pausou não entra, e é por isso que a distinção existe.
        """
        products, total = self.products.list_moderated(params)
        return Page[ModeratedProductResponse](
            items=[_item(product) for product in products],
            page=params.page,
            page_size=params.page_size,
            total=total,
        )

    def _get(self, product_id: int) -> Product:
        product = self.products.get_by_id(product_id)
        if product is None:
            raise NotFound("Peça não encontrada.", code=ErrorCode.PRODUCT_NOT_FOUND)
        return product

    @staticmethod
    def _recusar_status_incompativel(product: Product) -> None:
        """`vendido`, `reservado` e `rascunho` não mudam de estado (409).

        `despublicado` passa: é a peça que o vendedor pausou, e a suspensão
        guarda esse estado para o `restore` devolvê-la pausada (RN-50).
        """
        if product.status == "vendido":
            raise AppError(
                "Peça vendida não pode ser despublicada.",
                code=ErrorCode.PRODUCT_SOLD,
                status_code=409,
            )
        if product.status == "reservado":
            raise AppError(
                "Peça reservada em um pedido não pode ser despublicada.",
                code=ErrorCode.PRODUCT_NOT_EDITABLE,
                status_code=409,
            )
        if product.status == "rascunho":
            # Devolver à vitrine grava `ativo`: o rascunho, que nunca esteve no
            # feed, entraria por uma suspensão que não deveria existir (RN-50).
            raise AppError(
                "Peça em rascunho nunca foi publicada; não há o que suspender.",
                code=ErrorCode.PRODUCT_NOT_EDITABLE,
                status_code=409,
            )


def _resposta(product: Product) -> ModerationResponse:
    return ModerationResponse(
        product_id=product.id,
        status=product.status,
        moderation_reason=product.moderation_reason,
        moderated_at=product.moderated_at,
    )


def _item(product: Product) -> ModeratedProductResponse:
    if product.moderated_at is None:
        # Invariante da consulta (`moderated_at IS NOT NULL`): se cair aqui, é
        # defeito de `list_moderated`, e não dado do usuário.
        raise RuntimeError("Peça da lista de Suspensas sem data de moderação.")
    autor = None
    if product.moderated_by is not None:
        autor = ModerationAuthor(
            id=product.moderated_by.id, name=product.moderated_by.name
        )
    return ModeratedProductResponse(
        id=product.id,
        name=product.name,
        price=product.price,
        cover_image_url=product.cover_image_url,
        status=product.status,
        store=ModerationStore(id=product.store.id, name=product.store.name),
        moderation_reason=product.moderation_reason or "",
        moderated_at=product.moderated_at,
        moderated_by=autor,
    )
