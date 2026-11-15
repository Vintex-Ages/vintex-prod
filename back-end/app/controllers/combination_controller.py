"""Peças que combinam com a peça aberta (BE-US030-1, back-end#328)."""

from __future__ import annotations

import unicodedata
from collections.abc import Sequence
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.core.errors import ErrorCode, NotFound
from app.core.pagination import PageParams
from app.repositories.product_repository import ProductFeedRow, ProductRepository
from app.schemas.product_schema import (
    CombinationItemResponse,
    CombinationsResponse,
    ProductFilters,
)

# Quantas peças o conjunto mostra. O contrato não pagina e a issue não fixa o
# número: é um conjunto para a tela da peça, não uma listagem.
LIMITE_DE_COMBINACOES = 4
# Quantas candidatas a consulta traz antes de montar o conjunto. Com só três
# categorias no catálogo e o mesmo modelo publicado por várias lojas, as 4 mais
# parecidas eram, para uma calça jeans, quatro acessórios e duas bolsas iguais.
JANELA_DE_CANDIDATAS = LIMITE_DE_COMBINACOES * 6


class CombinationController:
    """Peças de outras categorias, ordenadas pela semelhança com a de origem.

    - **A origem só dá o vetor** (RN-63): o 404 é só para peça inexistente.
      Peça `reservado` ou `vendido` funciona igual, porque a combinação
      também aparece depois da compra.
    - **O que volta é `ativo`**, de categoria diferente da origem, e nunca
      a própria origem. Lojas diferentes são permitidas.
    - **A ordem é a semelhança** entre os vetores (RN-62), sem coocorrência de
      compra, dentro de cada categoria. O conjunto alterna as categorias e
      não repete nome de peça (`_montar_conjunto`).
    - **Sem vetor, ou sem peça parecida**, vem o catálogo de outras
      categorias com `fallback`, e não lista vazia (RN-61).

    Não chama o provedor de IA: o vetor da origem já está gravado.
    """

    def __init__(self, db: Session):
        self.products = ProductRepository(db)

    def combinations(self, product_id: int) -> CombinationsResponse:
        origem = self.products.get_detail_by_id(product_id)
        if origem is None:
            raise NotFound("Produto não encontrado.", code=ErrorCode.PRODUCT_NOT_FOUND)

        pagina = PageParams(page=1, page_size=JANELA_DE_CANDIDATAS)
        # Origem sem categoria: qualquer peça com categoria é de outra.
        categoria = origem.category or ""

        if origem.embedding is not None and origem.embedding_model:
            parecidas, _ = self.products.find_similar(
                origem.embedding,
                origem.embedding_model,
                pagina,
                exclude_category=categoria,
                exclude_product_id=origem.id,
            )
            if parecidas:
                return self._resposta(parecidas, "exact")

        catalogo, _ = self.products.get_active_feed(
            pagina,
            ProductFilters(),
            exclude_category=categoria,
            exclude_product_id=origem.id,
        )
        return self._resposta(catalogo, "fallback")

    def _resposta(
        self,
        rows: Sequence[ProductFeedRow],
        match_type: Literal["exact", "fallback"],
    ) -> CombinationsResponse:
        marcas = self.products.marcas([row["id"] for row in rows])
        pieces = [
            CombinationItemResponse.from_row(row)
            for row in _montar_conjunto(rows, marcas)
        ]
        return CombinationsResponse(
            pieces=pieces,
            match_type=match_type,
            total_amount=sum((piece.price for piece in pieces), Decimal("0")),
        )


def _normalizado(texto: str | None) -> str:
    """Sem acento, sem caixa e sem espaço sobrando, como a categoria no banco."""
    sem_acento = unicodedata.normalize("NFKD", texto or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return " ".join(sem_acento.lower().split())


def _modelo(nome: str, marca: str | None) -> str:
    """O nome sem a marca: "Tênis cano alto clássico Converse" e "Tenis cano
    alto clássico Adidas" são o mesmo modelo."""
    modelo = f" {_normalizado(nome)} "
    marca_normalizada = _normalizado(marca)
    if marca_normalizada:
        modelo = modelo.replace(f" {marca_normalizada} ", " ")
    return " ".join(modelo.split())


def _montar_conjunto(
    rows: Sequence[ProductFeedRow], marcas: dict[int, str | None]
) -> list[ProductFeedRow]:
    """Até `LIMITE_DE_COMBINACOES` peças, uma de cada categoria por vez.

    As linhas chegam na ordem da semelhança. O mesmo modelo entra uma vez só,
    comparando o nome sem a marca: duas lojas com a "Bolsa de palha com franjas
    Farm", ou o mesmo tênis da Converse e da Adidas, e um look com os dois não é
    um look. As categorias se revezam na ordem da mais parecida de cada uma,
    então uma calça recebe acessório, sapato, acessório, sapato, e não quatro
    acessórios.
    """
    por_categoria: dict[str, list[ProductFeedRow]] = {}
    nomes: set[str] = set()
    for row in rows:
        nome = _modelo(row["name"], marcas.get(row["id"]))
        if nome in nomes:
            continue
        nomes.add(nome)
        por_categoria.setdefault(_normalizado(row["category"]), []).append(row)

    filas = list(por_categoria.values())
    conjunto: list[ProductFeedRow] = []
    rodada = 0
    while len(conjunto) < LIMITE_DE_COMBINACOES and any(
        rodada < len(fila) for fila in filas
    ):
        for fila in filas:
            if rodada < len(fila) and len(conjunto) < LIMITE_DE_COMBINACOES:
                conjunto.append(fila[rodada])
        rodada += 1
    return conjunto
