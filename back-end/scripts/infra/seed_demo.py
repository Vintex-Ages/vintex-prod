"""Cria as contas de demo (comprador e vendedor) pela própria API.

Roda DENTRO do contêiner da API (via `docker exec -i ... python -`), falando
com a API em 127.0.0.1:8000, sem passar pelo CloudFront nem pelo Nginx: é por
isso que o cadastro público pode ficar fechado. Idempotente: se a conta já
existe, só confere o login; se a loja/as peças já existem, não duplica.

As senhas vêm do ambiente (DEMO_BUYER_PASSWORD / DEMO_SELLER_PASSWORD), nunca
de argumentos de linha de comando, e nunca são impressas.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.environ.get("DEMO_API_ROOT", "http://127.0.0.1:8000")
API = ROOT + "/api"

BUYER = {
    "name": "Comprador Demo",
    "email": "comprador.demo@example.com",
    "password": os.environ["DEMO_BUYER_PASSWORD"],
}
SELLER = {
    "name": "Vendedor Demo",
    "email": "vendedor.demo@example.com",
    "password": os.environ["DEMO_SELLER_PASSWORD"],
}

STORE = {
    "name": "Brechó Demo Vintex",
    "description": "Loja de demonstração. Dados sintéticos.",
    "pix_key": "demo@example.com",
    "document_type": "CPF",
    "document_value": "529.982.247-25",
    "address": {
        "street": "Rua Sete de Setembro",
        "number": "1020",
        "neighborhood": "Centro Histórico",
        "city": "Porto Alegre",
        "state": "RS",
        "zip_code": "90010-190",
    },
}

PRODUCTS = [
    {
        "name": "Jaqueta jeans vintage",
        "description": "Jaqueta jeans clássica, lavagem média.",
        "category": "Roupas",
        "color": "Azul",
        "size": "M",
        "condition": "Seminovo",
        "brand": "Levi's",
        "price": "149.90",
        "images": ["https://picsum.photos/seed/vintex-demo-1/600/800"],
    },
    {
        "name": "Vestido floral midi",
        "description": "Vestido midi estampado, tecido leve.",
        "category": "Roupas",
        "color": "Estampado",
        "size": "P",
        "condition": "Usado",
        "price": "89.90",
        "images": ["https://picsum.photos/seed/vintex-demo-2/600/800"],
    },
    {
        "name": "Tênis branco clássico",
        "description": "Tênis casual branco, solado limpo.",
        "category": "Sapatos",
        "color": "Branco",
        "size": "40",
        "condition": "Seminovo",
        "price": "129.90",
        "images": ["https://picsum.photos/seed/vintex-demo-3/600/800"],
    },
    {
        "name": "Bolsa de couro caramelo",
        "description": "Bolsa de couro com alça ajustável.",
        "category": "Acessórios",
        "color": "Bege",
        "condition": "Marcas de uso",
        "price": "199.90",
        "images": ["https://picsum.photos/seed/vintex-demo-4/600/800"],
    },
]


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, None


def wait_for_api(timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(ROOT + "/health", timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, ValueError):
            pass
        time.sleep(3)
    sys.exit("API não respondeu em /health.")


def ensure_user(account):
    status, body = call("POST", "/auth/register", account)
    if status == 201:
        print(f"conta criada: {account['email']}")
        return body["access_token"]
    status, body = call(
        "POST",
        "/auth/login",
        {"email": account["email"], "password": account["password"]},
    )
    if status == 200:
        print(f"conta já existia: {account['email']}")
        return body["access_token"]
    sys.exit(
        f"não foi possível criar nem entrar com {account['email']} (HTTP {status})"
    )


def ensure_store(token):
    status, _ = call("GET", "/users/me/store", token=token)
    if status == 200:
        print("loja já existia")
        return
    status, body = call("POST", "/users/me/store", STORE, token)
    if status != 201:
        sys.exit(f"falha ao criar a loja (HTTP {status}): {body}")
    print("loja criada")


def ensure_products(token):
    status, page = call("GET", "/users/me/products", token=token)
    existing = (
        {item["name"] for item in (page or {}).get("items", [])}
        if status == 200
        else set()
    )
    for product in PRODUCTS:
        if product["name"] in existing:
            continue
        status, body = call("POST", "/users/me/products", product, token)
        if status != 201:
            print(f"aviso: falha ao criar '{product['name']}' (HTTP {status})")
            continue
        status, _ = call(
            "POST", f"/users/me/products/{body['id']}/publish", token=token
        )
        print(
            f"peça criada: {product['name']} ({'publicada' if status == 200 else f'rascunho, HTTP {status}'})"
        )


def main():
    wait_for_api()
    ensure_user(BUYER)
    seller_token = ensure_user(SELLER)
    ensure_store(seller_token)
    ensure_products(seller_token)
    print("seed de demo concluído")


main()
