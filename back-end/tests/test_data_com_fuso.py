"""Toda data que sai da API diz o fuso dela (pendência F8).

O banco guarda UTC sem `tzinfo` e o front faz `new Date(iso)`, que lê string
sem offset como hora local: três horas adiantado em Brasília, e `elapsed`
negativo onde a tela calcula "há quanto tempo". O conserto é a serialização,
e o que este arquivo protege é o esquecimento: schema novo com campo de data
que volte a ser `datetime` pelado.
"""

from __future__ import annotations

import importlib
import pkgutil
from datetime import datetime, timedelta, timezone
from typing import Any, get_args, get_origin, get_type_hints

import pytest
from pydantic import BaseModel, PlainSerializer

import app.schemas
from app.schemas.datas import DataComFuso, com_fuso

BRASILIA = timezone(timedelta(hours=-3))


class _Resposta(BaseModel):
    quando: DataComFuso
    talvez: DataComFuso | None
    nunca: DataComFuso | None


def test_data_naive_sai_com_fuso() -> None:
    """O instante é o mesmo; o que muda é dizer que ele é UTC."""
    resposta = _Resposta(
        quando=datetime(2026, 11, 15, 17, 0, 0),
        talvez=datetime(2026, 11, 15, 17, 0, 0, tzinfo=timezone.utc),
        nunca=None,
    )

    assert resposta.model_dump_json() == (
        '{"quando":"2026-11-15T17:00:00Z",'
        '"talvez":"2026-11-15T17:00:00Z",'
        '"nunca":null}'
    )


def test_data_que_ja_tem_fuso_passa_intacta() -> None:
    """Fuso que não é UTC não é reescrito: o instante é o que importa."""
    com_offset = datetime(2026, 11, 15, 14, 0, 0, tzinfo=BRASILIA)

    assert com_fuso(com_offset) is com_offset


def test_o_openapi_continua_dizendo_date_time() -> None:
    """`PlainSerializer` com `return_type=datetime` mantém o formato no
    contrato: quem serializa ainda é o pydantic."""
    propriedade = _Resposta.model_json_schema(mode="serialization")["properties"]

    assert propriedade["quando"] == {
        "format": "date-time",
        "title": "Quando",
        "type": "string",
    }


def test_a_conta_do_ha_quanto_tempo_deixa_de_dar_negativo() -> None:
    """O defeito que a F8 descreve: comprovante enviado cinco minutos atrás
    aparecendo como "há menos de 1 minuto" porque a subtração dá negativo."""
    enviado = datetime(2026, 11, 15, 14, 0, 0)  # UTC, como o banco guarda
    agora = datetime(2026, 11, 15, 14, 5, 0, tzinfo=timezone.utc)

    # Como o front lia: string sem offset é hora local, então o instante vai
    # três horas para a frente e a peça parece enviada no futuro.
    lido_como_local = enviado.replace(tzinfo=BRASILIA)
    assert (agora - lido_como_local).total_seconds() == -10500

    assert (agora - com_fuso(enviado)).total_seconds() == 300


def _tem_data_nua(anotacao: Any) -> bool:
    """`True` quando a anotação carrega um `datetime` sem o serializador."""
    if hasattr(anotacao, "__metadata__"):
        interno, *metadados = get_args(anotacao)
        serializa = any(
            isinstance(m, PlainSerializer) and m.func is com_fuso for m in metadados
        )
        return False if serializa else _tem_data_nua(interno)
    if get_origin(anotacao) is not None:
        return any(_tem_data_nua(arg) for arg in get_args(anotacao))
    return anotacao is datetime


def _schemas() -> list[tuple[str, type[BaseModel]]]:
    classes: dict[str, type[BaseModel]] = {}
    for modulo in pkgutil.iter_modules(app.schemas.__path__):
        importado = importlib.import_module(f"app.schemas.{modulo.name}")
        for nome, objeto in vars(importado).items():
            if (
                isinstance(objeto, type)
                and issubclass(objeto, BaseModel)
                and objeto is not BaseModel
                and objeto.__module__ == importado.__name__
            ):
                classes[f"{modulo.name}.{nome}"] = objeto
    return sorted(classes.items())


@pytest.mark.parametrize(("nome", "schema"), _schemas())
def test_nenhum_schema_tem_campo_de_data_pelado(
    nome: str, schema: type[BaseModel]
) -> None:
    """Campo de data em schema é `DataComFuso`, não `datetime`.

    A regra vale também para schema de entrada, e de propósito: o serializador
    não muda validação nenhuma, e o campo de entrada de hoje é o de saída de
    amanhã. Se algum dia precisar de `datetime` pelado, o lugar de discutir é
    aqui, não na tela da administradora.

    Os schemas são varridos por reflexão, com `get_type_hints`, porque os
    módulos usam `from __future__ import annotations` e `__annotations__` ali é
    string. E a leitura não pode ser `model_fields[...].annotation`, que perde
    o `Annotated` quando ele está dentro de uma união, que é justo o caso de
    `DataComFuso | None`.
    """
    dicas = get_type_hints(schema, include_extras=True)
    nus = [campo for campo in schema.model_fields if _tem_data_nua(dicas.get(campo))]

    assert not nus, f"{nome}: {', '.join(nus)} precisa ser DataComFuso"
