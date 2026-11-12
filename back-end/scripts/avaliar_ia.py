"""Mede a qualidade da IA contra os conjuntos de referência (back-end#326).

Uso::

    python -m scripts.avaliar_ia --contar      # só diz quantas chamadas vai gastar
    python -m scripts.avaliar_ia               # roda os conjuntos e grava a rodada
    python -m scripts.avaliar_ia --so perfis   # um conjunto só

Pré-condições: o banco com o seed (`app.seeds.lojas` e `app.seeds.pecas`) e os
vetores (`scripts.backfill_embeddings`); a API de pé em `--api`; o provedor de
IA real no `.env`.

**A conversa passa pela rota de verdade**, com interpretação, filtro, relaxamento
e aviso, porque é isso que se mede. A cota (back-end#258) trava na sexta
pergunta de uma mesma origem; ela não é contornada por dentro: quem roda sobe
`CHAT_QUOTA_PER_PERSON` e `CHAT_QUOTA_PER_DAY` no `.env` da rodada (são
`BaseSettings`) e reinicia a API. O script confere os dois antes de começar e
para se a rodada não couber.

**Os perfis de estilo não passam pela rota**, que exige login: o script monta o
texto e o vetor do perfil pelas mesmas funções da recomendação
(`app/services/style_profile.py`) e chama `find_similar` como
`RecommendationController.recommend`.

O esperado de cada caso é escrito contra o seed pelo **tipo do modelo**, não pelo
id: a cada rodada o script calcula no banco quais peças ativas atendem ao caso.
Caso de catálogo sem nenhuma peça esperada, ou caso de "não temos" que passou a
ter peça, é inválido para aquele catálogo e sai da conta, com aviso.

Toda peça devolvida é conferida contra o banco (RN-65): id, nome, preço e loja.
Uma peça que não bate reprova a rodada inteira, e o script sai com código 1.

Cada rodada fica em `scripts/avaliacao/rodadas/`, com a resposta recebida, e a
saída mostra o que mudou desde a rodada anterior.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.config import settings
from app.constants.catalog import CATEGORIES, COLORS, CONDITIONS, SIZES
from app.core.pagination import DEFAULT_PAGE_SIZE, PageParams
from app.database import SessionLocal, engine
from app.models.product import Product
from app.models.user_preference import UserPreference
from app.repositories.product_repository import ProductRepository
from app.seeds.pecas import MODELOS
from app.services.style_profile import texto_do_perfil, vetor_do_perfil

PASTA = Path(__file__).resolve().parent / "avaliacao"
RODADAS = PASTA / "rodadas"
CONJUNTOS_DA_CONVERSA = ("catalogo", "nao_temos", "instrucao")
PECAS_NO_CHAT = 5
CHAMADAS_POR_PERGUNTA = 2  # interpretação da pergunta + vetor
CHAMADAS_POR_PERFIL = 1  # vetor do perfil


def sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def tipo_do_nome(nome: str) -> str | None:
    """O tipo do modelo do seed que gerou a peça. O nome é o do modelo seguido
    da marca, então o modelo é o de nome mais longo que começa o nome."""
    candidatos = [m for m in MODELOS if nome.startswith(m.nome)]
    if not candidatos:
        return None
    return max(candidatos, key=lambda m: len(m.nome)).tipo


def catalogo_ativo(db) -> dict[int, dict[str, Any]]:
    pecas = db.query(Product).filter(Product.status == "ativo").all()
    return {
        p.id: {
            "id": p.id,
            "name": p.name,
            "tipo": tipo_do_nome(p.name),
            "category": p.category,
            "color": p.color,
            "size": p.size,
            "brand": p.brand,
            "style": p.style,
            "price": Decimal(p.price),
            "store": p.store.name,
        }
        for p in pecas
    }


def casa(peca: dict[str, Any], criterio: dict[str, Any]) -> bool:
    if "tipo" in criterio and peca["tipo"] not in criterio["tipo"]:
        return False
    if "categoria" in criterio and peca["category"] != criterio["categoria"]:
        return False
    if "cor" in criterio and peca["color"] != criterio["cor"]:
        return False
    if "tamanho" in criterio and peca["size"] != criterio["tamanho"]:
        return False
    if "marca" in criterio and sem_acento(peca["brand"] or "") != sem_acento(
        criterio["marca"]
    ):
        return False
    if "estilo" in criterio and peca["style"] not in criterio["estilo"]:
        return False
    if "preco_max" in criterio and peca["price"] > Decimal(str(criterio["preco_max"])):
        return False
    if "nome_contem" in criterio and not any(
        sem_acento(palavra) in sem_acento(peca["name"])
        for palavra in criterio["nome_contem"]
    ):
        return False
    return True


def perguntar(api: str, texto: str) -> tuple[list[dict[str, Any]], float]:
    corpo = json.dumps({"messages": [{"role": "user", "text": texto}]}).encode()
    pedido = urllib.request.Request(
        f"{api}/api/ai/chat", data=corpo, headers={"Content-Type": "application/json"}
    )
    eventos: list[dict[str, Any]] = []
    inicio = time.monotonic()
    with urllib.request.urlopen(pedido, timeout=180) as resposta:
        for linha in resposta:
            linha = linha.decode().strip()
            if linha.startswith("data:"):
                eventos.append(json.loads(linha[5:]))
    return eventos, round(time.monotonic() - inicio, 1)


def conferir_contra_o_banco(
    pecas: list[dict[str, Any]], catalogo: dict[int, dict[str, Any]]
) -> list[str]:
    """RN-65: o que não bate com o banco. Lista vazia é a resposta certa."""
    problemas = []
    for peca in pecas:
        real = catalogo.get(peca.get("id"))
        if real is None:
            problemas.append(f"peça {peca.get('id')} não está ativa no catálogo")
            continue
        if peca.get("name") != real["name"]:
            problemas.append(f"peça {real['id']}: nome {peca.get('name')!r}")
        if Decimal(str(peca.get("price"))) != real["price"]:
            problemas.append(f"peça {real['id']}: preço {peca.get('price')}")
        loja = (peca.get("store") or {}).get("name")
        if loja != real["store"]:
            problemas.append(f"peça {real['id']}: loja {loja!r}")
    return problemas


def filtros_fora_do_vocabulario(filtros: dict[str, Any]) -> list[str]:
    listas = {
        "category": CATEGORIES,
        "color": COLORS,
        "condition": CONDITIONS,
        "size": SIZES,
    }
    return [
        f"{campo}={filtros[campo]!r}"
        for campo, lista in listas.items()
        if filtros.get(campo) is not None and filtros[campo] not in lista
    ]


def rodar_caso(
    api: str, conjunto: str, caso: dict[str, Any], catalogo: dict[int, dict[str, Any]]
) -> dict[str, Any]:
    linha: dict[str, Any] = {"pergunta": caso["pergunta"]}
    espera_alternativa = conjunto == "nao_temos" or caso.get("fora_do_escopo", False)

    if "esperado" in caso:
        esperadas = sorted(i for i, p in catalogo.items() if casa(p, caso["esperado"]))
        linha["esperadas"] = esperadas
        if not esperadas:
            linha["invalido"] = "nenhuma peça ativa atende ao esperado"
            return linha
    if "ausente" in caso:
        presentes = sorted(i for i, p in catalogo.items() if casa(p, caso["ausente"]))
        if presentes:
            linha["invalido"] = f"o catálogo tem {presentes}, então não é 'não temos'"
            return linha

    eventos, segundos = perguntar(api, caso["pergunta"])
    leitura = next((e for e in eventos if e.get("type") == "interpreted"), None)
    produtos = next((e for e in eventos if e.get("type") == "products"), None)
    erro = next((e for e in eventos if e.get("type") in ("error", "quota")), None)
    pecas = (produtos or {}).get("products", [])
    ids = [p.get("id") for p in pecas]
    filtros = (leitura or {}).get("filters") or {}

    linha.update(
        {
            "segundos": segundos,
            "leitura": leitura
            and {"filters": filtros, "similarity": leitura.get("similarity")},
            "match_type": (produtos or {}).get("match_type"),
            "aviso": "".join(
                e.get("delta", "") for e in eventos if e.get("type") == "text"
            )
            or None,
            "ids": ids,
            "nomes": [p.get("name") for p in pecas],
            "erro": erro,
            "fora_do_catalogo": conferir_contra_o_banco(pecas, catalogo),
            "filtro_fora_do_vocabulario": filtros_fora_do_vocabulario(filtros),
        }
    )

    if espera_alternativa:
        linha["acerto"] = bool(
            not erro and linha["match_type"] == "fallback" and pecas and linha["aviso"]
        )
    else:
        no_top = [i for i in ids[:PECAS_NO_CHAT] if i in linha["esperadas"]]
        linha["esperadas_no_top5"] = len(no_top)
        linha["possiveis_no_top5"] = min(PECAS_NO_CHAT, len(linha["esperadas"]))
        linha["primeira_esperada"] = bool(ids) and ids[0] in linha["esperadas"]
        linha["acerto"] = bool(not erro and no_top and linha["match_type"] == "exact")

    if "corte" in caso:
        teto = Decimal(str(caso["corte"]["preco_max"]))
        linha["corte_respeitado"] = all(
            catalogo[i]["price"] <= teto for i in ids if i in catalogo
        )
        linha["corte_lido"] = filtros.get("price_max") is not None
        linha["acerto"] = linha["acerto"] and linha["corte_respeitado"]

    if linha["filtro_fora_do_vocabulario"]:
        linha["acerto"] = False
    return linha


def rodar_perfil(
    db, caso: dict[str, Any], catalogo: dict[int, dict[str, Any]]
) -> dict[str, Any]:
    estilos = caso["estilos"]
    texto = texto_do_perfil([UserPreference(type="estilo", value=v) for v in estilos])
    vetor, modelo = vetor_do_perfil(texto)
    rows, _ = ProductRepository(db).find_similar(
        vetor, modelo, PageParams(page=1, page_size=DEFAULT_PAGE_SIZE)
    )
    disponiveis = sum(1 for p in catalogo.values() if p["style"] in estilos)
    k = min(DEFAULT_PAGE_SIZE, disponiveis)
    primeiras = [r["id"] for r in rows[:k]]
    dentro = sum(1 for i in primeiras if catalogo.get(i, {}).get("style") in estilos)
    taxa = dentro / k if k else 0.0
    return {
        "estilos": estilos,
        "k": k,
        "dentro_dos_estilos": dentro,
        "taxa": round(taxa, 2),
        "ids": [r["id"] for r in rows],
        "acerto": k > 0 and taxa >= 0.8,
        "fora_do_catalogo": conferir_contra_o_banco(
            [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "price": r["price"],
                    "store": {"name": r["store_name"]},
                }
                for r in rows
            ],
            catalogo,
        ),
    }


def resumo(linhas: list[dict[str, Any]]) -> dict[str, Any]:
    validas = [caso for caso in linhas if "invalido" not in caso]
    acertos = sum(1 for caso in validas if caso.get("acerto"))
    return {
        "acertos": acertos,
        "validos": len(validas),
        "taxa": round(acertos / len(validas), 2) if validas else None,
        "invalidos": len(linhas) - len(validas),
    }


def commit_atual() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=PASTA,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def rodada_anterior() -> dict[str, Any] | None:
    arquivos = sorted(RODADAS.glob("*.json"))
    return json.loads(arquivos[-1].read_text(encoding="utf-8")) if arquivos else None


def mostrar_diferenca(anterior: dict[str, Any], atual: dict[str, Any]) -> None:
    print(
        f"\nO que mudou desde a rodada {anterior['quando']} ({anterior.get('commit')}):"
    )
    mudou = False
    for conjunto, dados in atual["conjuntos"].items():
        antes = {
            (caso.get("pergunta") or ",".join(caso.get("estilos", []))): caso
            for caso in anterior.get("conjuntos", {}).get(conjunto, {}).get("casos", [])
        }
        for linha in dados["casos"]:
            chave = linha.get("pergunta") or ",".join(linha.get("estilos", []))
            velha = antes.get(chave)
            if velha is None:
                continue
            campos = [
                c
                for c in ("acerto", "match_type")
                if c in linha and velha.get(c) != linha.get(c)
            ]
            if campos:
                mudou = True
                detalhes = ", ".join(
                    f"{c}: {velha.get(c)} -> {linha.get(c)}" for c in campos
                )
                print(f"  [{conjunto}] {chave}: {detalhes}")
    if not mudou:
        print("  nenhum acerto ou rótulo mudou")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--so", choices=[*CONJUNTOS_DA_CONVERSA, "perfis"], action="append"
    )
    parser.add_argument("--contar", action="store_true", help="só mostra as chamadas")
    args = parser.parse_args()

    escolhidos = args.so or [*CONJUNTOS_DA_CONVERSA, "perfis"]
    conversa = json.loads((PASTA / "conversa.json").read_text(encoding="utf-8"))
    perfis = json.loads((PASTA / "perfis.json").read_text(encoding="utf-8"))

    perguntas = sum(len(conversa[c]["casos"]) for c in escolhidos if c in conversa)
    n_perfis = len(perfis["casos"]) if "perfis" in escolhidos else 0
    chamadas = perguntas * CHAMADAS_POR_PERGUNTA + n_perfis * CHAMADAS_POR_PERFIL
    print(
        f"Vai gastar até {chamadas} chamadas ao provedor: {perguntas} perguntas x "
        f"{CHAMADAS_POR_PERGUNTA} + {n_perfis} perfis x {CHAMADAS_POR_PERFIL}."
    )
    if args.contar:
        return 0
    if perguntas and (
        settings.CHAT_QUOTA_PER_PERSON < perguntas
        or settings.CHAT_QUOTA_PER_DAY < perguntas
    ):
        print(
            f"A cota não cabe: {perguntas} perguntas, CHAT_QUOTA_PER_PERSON="
            f"{settings.CHAT_QUOTA_PER_PERSON}, CHAT_QUOTA_PER_DAY={settings.CHAT_QUOTA_PER_DAY}. "
            "Suba as duas no .env da rodada e reinicie a API."
        )
        return 2

    # Com APP_DEBUG o motor imprime cada SQL, e a saída da rodada some no meio.
    engine.echo = False
    db = SessionLocal()
    try:
        catalogo = catalogo_ativo(db)
        rodada: dict[str, Any] = {
            "quando": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "commit": commit_atual(),
            "modelos": {
                "conversa": settings.GOOGLE_VISION_MODEL,
                "vetor": settings.GOOGLE_EMBEDDING_MODEL,
            },
            "pecas_ativas": len(catalogo),
            "chamadas_previstas": chamadas,
            "conjuntos": {},
        }
        for conjunto in escolhidos:
            if conjunto == "perfis":
                linhas = [rodar_perfil(db, caso, catalogo) for caso in perfis["casos"]]
            else:
                linhas = []
                for caso in conversa[conjunto]["casos"]:
                    linha = rodar_caso(args.api, conjunto, caso, catalogo)
                    marca = (
                        "invalido"
                        if "invalido" in linha
                        else ("ok" if linha.get("acerto") else "erro")
                    )
                    print(f"  [{conjunto}] {marca:8} {caso['pergunta']}")
                    linhas.append(linha)
            rodada["conjuntos"][conjunto] = {"resumo": resumo(linhas), "casos": linhas}
    finally:
        db.close()

    anterior = rodada_anterior()
    RODADAS.mkdir(parents=True, exist_ok=True)
    destino = RODADAS / f"{rodada['quando'].replace(':', '')}.json"
    destino.write_text(
        json.dumps(rodada, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )

    print(f"\nRodada gravada em {destino.relative_to(PASTA.parent.parent)}")
    metas = {
        **{c: conversa[c]["meta"]["proposta"] for c in CONJUNTOS_DA_CONVERSA},
        "perfis": perfis["meta"]["proposta"],
    }
    for conjunto, dados in rodada["conjuntos"].items():
        r = dados["resumo"]
        taxa = "-" if r["taxa"] is None else f"{r['taxa']:.0%}"
        extra = f", {r['invalidos']} inválidos" if r["invalidos"] else ""
        print(
            f"  {conjunto:10} {r['acertos']}/{r['validos']} ({taxa}), meta proposta {metas[conjunto]:.0%}{extra}"
        )
    if anterior:
        mostrar_diferenca(anterior, rodada)

    problemas = [
        (conjunto, linha.get("pergunta") or linha.get("estilos"), p)
        for conjunto, dados in rodada["conjuntos"].items()
        for linha in dados["casos"]
        for p in linha.get("fora_do_catalogo", [])
    ]
    if problemas:
        print("\nRN-65 reprovada: peça devolvida que não bate com o banco.")
        for conjunto, caso, problema in problemas:
            print(f"  [{conjunto}] {caso}: {problema}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
