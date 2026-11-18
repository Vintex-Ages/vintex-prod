"""Envia as fotos reais do catálogo de teste ao bucket de mídia.

Uso (de dentro do contêiner da API, ou local com o LocalStack)::

    python -m scripts.infra.seed_media [--dry-run]

Lê `app/seeds/fotos/manifest.json`, baixa cada foto da fonte original, confere
o `sha256`, o tipo (JPEG, PNG ou WebP) e o limite de 8 MiB do adaptador de IA e grava em
`MEDIA_BUCKET` com a chave do manifesto. Foto que já está no bucket é pulada,
então o script é idempotente. Os créditos ficam em `app/seeds/fotos/CREDITOS.md`.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from typing import Any

from app.config import settings
from app.seeds.fotos import FOTOS, Foto
from app.services.media_storage import create_media_s3_client

MAX_BYTES = 8 * 1024 * 1024  # Mesmo limite de app/services/ai/freellmapi.py.
TIPOS = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG\r\n\x1a\n": "image/png"}
USER_AGENT = "vintex-seed-media/1.0"


def tipo_da_imagem(body: bytes) -> str | None:
    """Tipo pelos bytes iniciais, não pelo cabeçalho da fonte."""
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return "image/webp"
    return next((tipo for magic, tipo in TIPOS.items() if body.startswith(magic)), None)


def baixar(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("maior que 8 MiB")
    return body


def validar(foto: Foto, body: bytes) -> str:
    """Devolve o content-type; recusa bytes que não sejam os do manifesto."""
    if hashlib.sha256(body).hexdigest() != foto.sha256:
        raise ValueError("sha256 diferente do manifesto")
    tipo = tipo_da_imagem(body)
    if tipo is None:
        raise ValueError("não é JPEG, PNG nem WebP")
    return tipo


def existe(client: Any, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
    except client.exceptions.ClientError as error:
        if error.response.get("Error", {}).get("Code") in {
            "404",
            "NoSuchKey",
            "NotFound",
        }:
            return False
        raise
    return True


def enviar(
    fotos: tuple[Foto, ...], client: Any, bucket: str, *, dry_run: bool = False
) -> dict[str, int]:
    resumo = {"enviadas": 0, "existentes": 0, "falhas": 0}
    for foto in fotos:
        if existe(client, bucket, foto.key):
            resumo["existentes"] += 1
            continue
        try:
            body = baixar(foto.source_url)
            tipo = validar(foto, body)
        except Exception as error:  # noqa: BLE001 - uma foto ruim não para as outras
            print(f"falha: {foto.key} ({error})")
            resumo["falhas"] += 1
            continue
        if not dry_run:
            client.put_object(Bucket=bucket, Key=foto.key, Body=body, ContentType=tipo)
        resumo["enviadas"] += 1
        print(f"{'conferida' if dry_run else 'enviada'}: {foto.key}")
    return resumo


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="baixa e confere as fotos, sem gravar no bucket",
    )
    args = parser.parse_args(argv)
    if not settings.MEDIA_BUCKET:
        print("MEDIA_BUCKET não configurado.")
        return 1
    resumo = enviar(
        FOTOS,
        create_media_s3_client(settings),
        settings.MEDIA_BUCKET,
        dry_run=args.dry_run,
    )
    print(
        f"{resumo['enviadas']} enviadas, {resumo['existentes']} já existiam, "
        f"{resumo['falhas']} falhas."
    )
    return 1 if resumo["falhas"] else 0


if __name__ == "__main__":
    sys.exit(main())
