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
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any, get_args, get_origin, get_type_hints

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute
from pydantic import BaseModel, PlainSerializer
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.schemas
from app.core.clock import utcnow_naive
from app.models.user import User
from app.schemas.datas import DataComFuso, com_fuso
from app.views import api_router

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
    """Os schemas do pacote, subpacote incluído (`walk_packages`)."""

    def _levanta(nome: str) -> None:
        raise ImportError(f"não foi possível importar {nome}")

    classes: dict[str, type[BaseModel]] = {}
    for modulo in pkgutil.walk_packages(
        app.schemas.__path__, "app.schemas.", onerror=_levanta
    ):
        importado = importlib.import_module(modulo.name)
        curto = modulo.name.removeprefix("app.schemas.")
        for nome, objeto in vars(importado).items():
            if (
                isinstance(objeto, type)
                and issubclass(objeto, BaseModel)
                and objeto is not BaseModel
                and objeto.__module__ == importado.__name__
            ):
                classes[f"{curto}.{nome}"] = objeto
    return sorted(classes.items())


def _descer(anotacao: Any, achados: set[type[BaseModel]]) -> None:
    """Todo modelo alcançável a partir de uma anotação, descendo em campo,
    união e genérico (`Page[X]`).

    A descida lê as duas fontes de anotação de propósito. `get_type_hints`
    carrega o `Annotated`, que é o que o teste de nudez precisa, mas num
    genérico parametrizado ele devolve o `TypeVar` sem resolver: em
    `Page[CartStoreResponse]` o campo `items` vem como `list[~T]`, e a
    caminhada morre ali. O `model_fields` tem o tipo já substituído e serve
    para andar. Sem as duas, os 17 modelos que só são alcançáveis dentro de um
    `Page[...]` ficam invisíveis.
    """
    if isinstance(anotacao, type) and issubclass(anotacao, BaseModel):
        if anotacao in achados:
            return
        achados.add(anotacao)
        for dica in get_type_hints(anotacao, include_extras=True).values():
            _descer(dica, achados)
        for campo in anotacao.model_fields.values():
            _descer(campo.annotation, achados)
        return
    for argumento in get_args(anotacao):
        _descer(argumento, achados)


def _rotas(router: APIRouter) -> Iterator[APIRoute]:
    """As rotas de verdade, achatando os routers incluídos.

    `api_router.routes` não guarda as rotas dos routers de domínio: guarda um
    `_IncludedRouter` por `include_router`, com o router original dentro. Sem
    descer nele a varredura vê 20 itens e nenhum `response_model`.
    """
    for rota in router.routes:
        original = getattr(rota, "original_router", None)
        if original is not None:
            yield from _rotas(original)
        elif isinstance(rota, APIRoute):
            yield rota


def _modelos_de_resposta() -> list[tuple[str, type[BaseModel]]]:
    """O que a API devolve de verdade: o `response_model` de cada rota e tudo
    o que ele aninha, onde quer que a classe more.

    A varredura do pacote não basta. `ImageAnalysisResult` é o corpo de
    `POST /api/ai/listing-suggestions` e mora em `app/services/ai/base.py`:
    campo de data acrescentado lá sairia sem fuso e nenhum teste veria.
    """
    achados: set[type[BaseModel]] = set()
    for rota in _rotas(api_router):
        modelo = getattr(rota, "response_model", None)
        if modelo is not None:
            _descer(modelo, achados)
    return sorted(
        ((f"{m.__module__}.{m.__name__}", m) for m in achados), key=lambda par: par[0]
    )


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


@pytest.mark.parametrize(("nome", "schema"), _modelos_de_resposta())
def test_nenhuma_resposta_da_api_tem_campo_de_data_pelado(
    nome: str, schema: type[BaseModel]
) -> None:
    """A mesma regra, cobrada pelo lado do contrato.

    O teste de cima varre o pacote `app.schemas` e pega o esquecimento de
    quem escreve schema novo lá. Este parte das rotas e desce nos aninhados,
    e é o que pega modelo de resposta que mora fora do pacote.
    """
    dicas = get_type_hints(schema, include_extras=True)
    nus = [campo for campo in schema.model_fields if _tem_data_nua(dicas.get(campo))]

    assert not nus, f"{nome}: {', '.join(nus)} precisa ser DataComFuso"


@pytest.mark.postgres
def test_o_relogio_do_banco_esta_em_utc(pg_session: Session) -> None:
    """`com_fuso` rotula como UTC o que o banco gravou, e para oito dos
    dezessete campos quem grava é o Postgres.

    Nove vêm do `utcnow_naive()`, UTC por construção. Os outros oito leem
    coluna com `server_default=func.now()` (`app/models/base_model.py:13`,
    `payment.py`, `order_status_history.py`): `now()` é `timestamptz` e a
    coluna é `timestamp` sem fuso, então quem decide o valor gravado é o
    `TimeZone` da sessão, que o repositório não fixa em lugar nenhum (não há
    `TZ` nem `PGTZ` no `docker-compose.yml`). Se ele não for UTC, esses oito
    campos saem com o rótulo errado, e na direção contrária à da F8.

    Este teste não roda nesta máquina, que não tem Postgres: quem o cobra é a
    CI, onde o banco é o `pgvector/pgvector:pg16` do compose.
    """
    do_banco = pg_session.execute(text("SELECT now()::timestamp")).scalar_one()

    assert abs(do_banco - utcnow_naive()) < timedelta(minutes=1)


def test_a_varredura_das_rotas_enxerga_a_api_inteira() -> None:
    """Varredura cega é pior que varredura nenhuma: `parametrize` com lista
    vazia vira `skip`, e `skip` passa por verde na saída do pytest.

    O `ImageAnalysisResult` está aqui de propósito: ele é o corpo de
    `POST /api/ai/listing-suggestions` e mora em `app/services/ai/base.py`,
    fora do pacote de schemas. Se a varredura deixar de alcançá-lo, é porque
    voltou a olhar só a árvore de `app/schemas`.
    """
    nomes = [nome for nome, _ in _modelos_de_resposta()]

    assert len(nomes) > 70
    assert "app.services.ai.base.ImageAnalysisResult" in nomes
    # Alcançável só dentro de um `Page[...]`: o canário da descida em genérico.
    assert "app.schemas.notification_schema.NotificationResponse" in nomes


@pytest.mark.postgres
def test_a_coluna_com_default_do_banco_grava_utc(pg_session: Session) -> None:
    """O teste acima mede o relógio da sessão; este mede o que a coluna guarda.

    `created_at` tem `server_default=func.now()`, e entre o `now()` e a coluna
    `timestamp` sem fuso há a conversão que o `TimeZone` da sessão governa. As
    migrations não são uniformes (`sa.text("now()")` em algumas,
    `sa.text("(CURRENT_TIMESTAMP)")` em outras), e nenhuma das duas expressões
    é conferida por este arquivo em lugar nenhum: o que se cobra aqui é o valor
    que sobra depois do INSERT, que é o que a API devolve.
    """
    usuario = User(
        name="Teste do fuso",
        email="fuso@example.com",
        password_hash="nao-importa",
    )
    pg_session.add(usuario)
    pg_session.flush()
    pg_session.refresh(usuario)

    assert abs(usuario.created_at - utcnow_naive()) < timedelta(minutes=1)
