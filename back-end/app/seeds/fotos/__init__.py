"""Fotos reais de roupa para o catálogo de teste, com licença livre.

`manifest.json` lista, para cada modelo de `app.seeds.pecas` (chave = slug do
nome), as fotos que mostram aquela peça, com a cor que aparece nelas. As fotos
"de consulta" não pertencem a nenhuma peça: servem para testar a busca por
imagem. O Git guarda só o manifesto e os créditos (`CREDITOS.md`); os bytes
ficam no bucket de mídia, enviados por `scripts/infra/seed_media.py`.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

MANIFEST = Path(__file__).with_name("manifest.json")
PREFIXO = "products/photos/seed/"
LICENCAS = frozenset({"cc0", "pdm", "by"})


@dataclass(frozen=True)
class Foto:
    key: str
    cor: str
    source_url: str
    landing_url: str
    license: str
    license_url: str
    author: str
    title: str
    sha256: str
    modelo: str | None = None  # None nas fotos de consulta.


def slug(texto: str) -> str:
    """`Calça jeans mom cintura alta` -> `calca-jeans-mom-cintura-alta`."""
    ascii_ = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")


def _carregar() -> tuple[dict[str, tuple[Foto, ...]], tuple[Foto, ...]]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    por_modelo = {
        modelo: tuple(Foto(**item, modelo=modelo) for item in fotos)
        for modelo, fotos in data["pecas"].items()
    }
    consulta = tuple(Foto(**item) for item in data["consulta"])
    return por_modelo, consulta


FOTOS_POR_MODELO, FOTOS_DE_CONSULTA = _carregar()
FOTOS: tuple[Foto, ...] = (
    *(foto for fotos in FOTOS_POR_MODELO.values() for foto in fotos),
    *FOTOS_DE_CONSULTA,
)
