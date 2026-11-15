"""Contrato do `POST /api/ai/chat` (BE-US027-3, back-end#149).

Eventos SSE combinados com o front (`FE-SVC-vintex-ai-chat`, front-end#199):
`text | products | interpreted | done | error`.

- `interpreted` (back-end#260): o que a pergunta virou, com `filters` nos
  nomes do catálogo (`category`, `price_max`...) e `similarity`.
- `text`: a resposta escrita da assistente, depois das peças (back-end#329).
  A frase que abre é do servidor (quantas peças, ou o aviso de que são
  alternativas, RN-61) e o comentário de cada peça vem de uma segunda chamada
  ao modelo, conferido antes de sair (`app/services/ai/personalidade.py`).
  Vem num evento só, inteiro: a versão anterior deste contrato dizia que não
  havia geração de texto conversacional, e isso valeu até a #329.
- `products`, com `match_type` (`exact` ou `fallback`, como no feed).
- `error`, e `error` com `code: quota_exceeded` (back-end#258).
- `done`, sempre por último.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.product_schema import ProductFeedItemResponse
from app.services.ai.base import ChatTurn, InterpretedQuery, SearchDone, SearchTextDelta


class ChatRequest(BaseModel):
    messages: list[ChatTurn]


class ChatProductsEvent(BaseModel):
    """As peças da resposta. `match_type` tem o sentido do feed: `fallback`
    quando nada casou com os filtros da pergunta e estas são alternativas
    (RN-61, back-end#260)."""

    type: Literal["products"] = "products"
    products: list[ProductFeedItemResponse]
    match_type: Literal["exact", "fallback"] = "exact"


class ChatErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class ChatQuotaEvent(BaseModel):
    """A cota do chat acabou (back-end#258).

    É um `error`, com `code` e `retry_at` (ISO 8601, UTC): os nomes que o
    `vintexAiService` do front já lê. Com `code: quota_exceeded`, a tela mostra
    o aviso de cota e trava o envio até `retry_at`.
    """

    type: Literal["error"] = "error"
    code: Literal["quota_exceeded"] = "quota_exceeded"
    message: str
    retry_at: str


ChatEvent = (
    SearchTextDelta
    | ChatProductsEvent
    | InterpretedQuery
    | SearchDone
    | ChatErrorEvent
    | ChatQuotaEvent
)
