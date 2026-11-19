"""Fotos reais do catálogo de teste (#111): manifesto, envio ao bucket e seed."""

import hashlib
import re

import pytest

from app.constants.catalog import COLORS
from app.models import Product
from app.seeds import fotos as fotos_mod
from app.seeds import pecas
from app.seeds.fotos import FOTOS, FOTOS_DE_CONSULTA, FOTOS_POR_MODELO, Foto
from app.seeds.lojas import seed_lojas
from scripts.infra import seed_media

BASE = "https://d123456789abcd.cloudfront.net"
EXTENSAO = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def test_manifesto_tem_no_maximo_dez_fotos_com_fonte_legal():
    assert 1 <= len(FOTOS) <= 10
    assert len({foto.key for foto in FOTOS}) == len(FOTOS)
    for foto in FOTOS:
        assert foto.key.startswith(fotos_mod.PREFIXO)
        assert ".." not in foto.key
        assert re.fullmatch(r"[0-9a-f]{64}", foto.sha256)
        assert foto.license in fotos_mod.LICENCAS
        assert foto.source_url.startswith("https://")
        assert foto.landing_url.startswith("https://")
        assert foto.license_url.startswith("https://creativecommons.org/")
        assert foto.author and foto.title


def test_toda_foto_de_peca_e_de_um_modelo_e_de_uma_cor_dele():
    modelos = {fotos_mod.slug(m.nome): m for m in pecas.MODELOS}
    for chave, fotos in FOTOS_POR_MODELO.items():
        assert chave in modelos, chave
        for foto in fotos:
            assert foto.modelo == chave
            assert foto.cor in modelos[chave].cores and foto.cor in COLORS
    assert all(foto.modelo is None for foto in FOTOS_DE_CONSULTA)


def test_slug_tira_acento_e_pontuacao():
    assert fotos_mod.slug("Calça jeans mom cintura alta") == (
        "calca-jeans-mom-cintura-alta"
    )
    assert fotos_mod.slug("Óculos de sol oval retrô") == "oculos-de-sol-oval-retro"


@pytest.mark.parametrize(
    "body,tipo",
    [
        (b"\xff\xd8\xff\xe0resto", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\nresto", "image/png"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (b"<html>", None),
        (b"RIFF\x00\x00\x00\x00WAVEfmt ", None),
    ],
)
def test_tipo_vem_dos_bytes(body, tipo):
    assert seed_media.tipo_da_imagem(body) == tipo


def foto_sintetica(body: bytes, key: str = "products/photos/seed/x-1.jpg") -> Foto:
    return Foto(
        key=key,
        cor="Azul",
        source_url="https://example.test/x.jpg",
        landing_url="https://example.test/x",
        license="cc0",
        license_url="https://creativecommons.org/publicdomain/zero/1.0/",
        author="Autor",
        title="Título",
        sha256=hashlib.sha256(body).hexdigest(),
    )


class _ClientError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


class _FakeS3:
    class exceptions:  # noqa: N801 - imita boto3
        ClientError = _ClientError

    def __init__(self, existing=()):
        self.objects = {key: b"" for key in existing}
        self.puts = []

    def head_object(self, Bucket, Key):  # noqa: N803 - assinatura do boto3
        if Key not in self.objects:
            raise _ClientError("404")

    def put_object(self, Bucket, Key, Body, ContentType):  # noqa: N803
        self.puts.append((Bucket, Key, ContentType))
        self.objects[Key] = Body


def test_envia_so_o_que_falta_e_com_o_tipo_dos_bytes(monkeypatch):
    jpeg = b"\xff\xd8\xff\xe0foto"
    nova = foto_sintetica(jpeg)
    existente = foto_sintetica(jpeg, "products/photos/seed/y-1.jpg")
    monkeypatch.setattr(seed_media, "baixar", lambda url: jpeg)
    client = _FakeS3(existing=[existente.key])

    resumo = seed_media.enviar((nova, existente), client, "bucket")

    assert resumo == {"enviadas": 1, "existentes": 1, "falhas": 0}
    assert client.puts == [("bucket", nova.key, "image/jpeg")]


def test_bytes_diferentes_do_manifesto_nao_sobem(monkeypatch):
    foto = foto_sintetica(b"\xff\xd8\xff\xe0original")
    monkeypatch.setattr(seed_media, "baixar", lambda url: b"\xff\xd8\xff\xe0trocada")
    client = _FakeS3()

    resumo = seed_media.enviar((foto,), client, "bucket")

    assert resumo["falhas"] == 1 and client.puts == []


def test_dry_run_confere_sem_gravar(monkeypatch):
    jpeg = b"\xff\xd8\xff\xe0foto"
    monkeypatch.setattr(seed_media, "baixar", lambda url: jpeg)
    client = _FakeS3()

    resumo = seed_media.enviar((foto_sintetica(jpeg),), client, "b", dry_run=True)

    assert resumo["enviadas"] == 1 and client.puts == []


def test_erro_do_s3_que_nao_e_404_nao_vira_ausencia():
    client = _FakeS3()

    def negado(Bucket, Key):  # noqa: N803
        raise _ClientError("403")

    client.head_object = negado
    with pytest.raises(_ClientError):
        seed_media.existe(client, "bucket", "k")


def test_extensao_da_chave_bate_com_o_tipo_esperado():
    for foto in FOTOS:
        assert any(foto.key.endswith(ext) for ext in EXTENSAO.values())


@pytest.fixture
def lojas(db_session):
    seed_lojas(db_session)
    db_session.commit()


def _resumo(products):
    return [(p.name, p.brand, p.size, p.condition, p.price, p.status) for p in products]


def test_seed_usa_foto_real_e_a_cor_dela_sem_mudar_o_sorteio(
    db_session, lojas, monkeypatch
):
    monkeypatch.setattr(pecas.settings, "PUBLIC_BASE_URL", "")
    sem_foto = _resumo(pecas.seed_pecas(db_session))
    db_session.rollback()

    monkeypatch.setattr(pecas.settings, "PUBLIC_BASE_URL", BASE + "/")
    products = pecas.seed_pecas(db_session)

    assert _resumo(products) == sem_foto
    com_foto = 0
    for product in products:
        url = product.images[0].image_url
        if url.startswith(pecas.PICSUM):
            continue
        com_foto += 1
        modelo = next(m for m in pecas.MODELOS if product.name.startswith(m.nome))
        [foto] = [
            f
            for f in FOTOS_POR_MODELO[fotos_mod.slug(modelo.nome)]
            if url.endswith(f.key)
        ]
        assert url == f"{BASE}/api/media/{foto.key}"
        assert len(product.images) == 1
        assert product.color == foto.cor
        assert f"Cor: {foto.cor.lower()}." in product.description
    assert com_foto > 0


def test_refresh_troca_o_picsum_e_apaga_o_vetor(db_session, lojas, monkeypatch):
    monkeypatch.setattr(pecas.settings, "PUBLIC_BASE_URL", "")
    pecas.seed_pecas(db_session)
    db_session.commit()
    for product in db_session.query(Product):
        product.embedding_status = "done"
    db_session.commit()

    monkeypatch.setattr(pecas.settings, "PUBLIC_BASE_URL", BASE)
    trocadas = pecas.atualizar_fotos(db_session)
    db_session.commit()

    assert trocadas > 0
    reais = [
        p
        for p in db_session.query(Product)
        if p.images[0].image_url.startswith(f"{BASE}/api/media/")
    ]
    assert len(reais) == trocadas
    assert all(p.embedding_status is None for p in reais)
    assert pecas.atualizar_fotos(db_session) == 0  # idempotente


def test_refresh_exige_a_url_publica(db_session, monkeypatch):
    monkeypatch.setattr(pecas.settings, "PUBLIC_BASE_URL", "")
    with pytest.raises(RuntimeError):
        pecas.atualizar_fotos(db_session)
