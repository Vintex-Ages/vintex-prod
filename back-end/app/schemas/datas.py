"""Data que sai da API com fuso (pendência F8).

O banco guarda UTC **sem** `tzinfo`: as colunas são `DateTime` puro, sem
`timezone=True`, e o que é calculado em Python vem do `utcnow_naive()`
(`app/core/clock.py`). `datetime` naive serializa sem offset,
`"2026-11-15T17:00:00"`, e o `new Date(iso)` do front lê string sem offset
como **hora local**. Em Brasília isso é três horas adiantado em toda tela que
mostra data.

O estrago não é só cosmético. Na fila da administradora e no sino o front
calcula `agora - createdAt`: com a data três horas à frente, a subtração dá
negativo e o comprovante enviado há três horas aparece como "há menos de um
minuto".

O conserto é de um lado só, e não mexe no banco nem no valor: o que passa a
sair é o `Z`. Trocar as colunas por `timezone=True` seria migration nas sete
tabelas, com o `utcnow_naive()` e todas as comparações atrás.

Uso: no schema de resposta, `DataComFuso` no lugar de `datetime`. A
serialização muda; a validação, não, então `datetime` naive continua entrando
igual. O `tests/test_data_com_fuso.py` varre os schemas e reprova campo de
data de resposta que esqueça o tipo.
"""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def com_fuso(valor: datetime) -> datetime:
    """O mesmo instante, dito com fuso. Naive é lido como UTC, que é o que o
    banco guarda; data que já vem ciente passa intacta."""
    if valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor


# `return_type=datetime` é o que mantém `format: date-time` no OpenAPI: quem
# serializa a data ainda é o pydantic, a função só diz qual é o fuso dela.
DataComFuso = Annotated[datetime, PlainSerializer(com_fuso, return_type=datetime)]
