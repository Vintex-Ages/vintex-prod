"""Mede a qualidade da IA contra os conjuntos de referência (back-end#326).

Uso::

    python -m scripts.avaliar_ia --contar                 # só conta as chamadas
    python -m scripts.avaliar_ia --nota "o que mudou"     # roda e grava a rodada
    python -m scripts.avaliar_ia --so perfis --nota "..." # um conjunto só

Pré-condições: o banco com o seed (`app.seeds.lojas` e `app.seeds.pecas`) e os
vetores (`scripts.backfill_embeddings`); a API de pé em `--api`, **rodando deste
mesmo checkout**; o provedor de IA real no `.env`.

**A conversa passa pela rota de verdade**, com interpretação, filtro, relaxamento
e aviso, porque é isso que se mede. A cota (back-end#258) trava na sexta
pergunta de uma mesma origem; ela não é contornada por dentro: quem roda sobe
`CHAT_QUOTA_PER_PERSON` e `CHAT_QUOTA_PER_DAY` no `.env` da rodada (são
`BaseSettings`) e reinicia a API. A cota é do dia UTC e soma as perguntas já
feitas, então o script confere no banco o que ainda resta antes de começar.
Se ela acabar no meio, o caso sai da conta, a conversa para e a rodada fica
marcada como incompleta.

**Os perfis de estilo não passam pela rota**, que exige login: o script monta o
texto e o vetor do perfil pelas mesmas funções da recomendação
(`app/services/style_profile.py`) e chama `find_similar` como
`RecommendationController.recommend`.

**As fotos chamam `analyze_image_bytes` direto**, o mesmo prompt do cadastro e
da busca por foto. O número da história é por foto: categoria e cor certas. Cada
campo também é conferido contra o que se vê na foto (acertou, nulo certo pela
RN-58, deixou nulo ou preencheu errado), como diagnóstico. A instrução escrita
na foto conta à parte: resistiu ou obedeceu.

O esperado de cada caso é escrito contra o seed pelo **tipo do modelo**, não pelo
id: a cada rodada o script calcula no banco quais peças ativas atendem ao caso.
Caso de catálogo sem nenhuma peça esperada, ou caso de "não temos" que passou a
ter peça, é inválido para aquele catálogo e sai da conta, com aviso.

Toda peça devolvida é conferida contra o banco (RN-65): id, nome, preço e loja.
Uma peça que não bate reprova a rodada inteira, e o script sai com código 1.

Cada rodada fica em `scripts/avaliacao/rodadas/`, com a resposta recebida, o
hash de cada conjunto e a nota de quem rodou. Ela é gravada a cada conjunto,
para uma falha no meio não perder o que já rodou. A saída compara cada conjunto
com a última rodada completa que usou o mesmo arquivo de conjunto.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import math
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.config import settings
from app.constants.catalog import CATEGORIES, COLORS, CONDITIONS, SIZES
from app.core.pagination import DEFAULT_PAGE_SIZE, PageParams
from app.database import SessionLocal, engine
from app.models.product import Product
from app.models.user_preference import UserPreference
from app.repositories.ai_chat_usage_repository import AIChatUsageRepository
from app.repositories.product_repository import ProductRepository
from app.seeds.pecas import MODELOS
from app.services.ai import AIProviderError, get_ai_provider
from app.services.ai.base import ImagePhoto
from app.services.chat_quota import CHAVE_DO_PROJETO
from app.services.style_profile import texto_do_perfil, vetor_do_perfil

PASTA = Path(__file__).resolve().parent / "avaliacao"
RODADAS = PASTA / "rodadas"
CONJUNTOS_DA_CONVERSA = ("catalogo", "nao_temos", "instrucao")
ARQUIVO_DO_CONJUNTO = {
    **{c: "conversa.json" for c in CONJUNTOS_DA_CONVERSA},
    "perfis": "perfis.json",
    "fotos": "fotos.json",
}
PECAS_NO_CHAT = 5
CHAMADAS_POR_PERGUNTA = 2  # interpretação da pergunta + vetor
CHAMADAS_POR_PERFIL = 1  # vetor do perfil
CHAMADAS_POR_FOTO = 1  # análise da foto
RAIZ_DO_REPO = PASTA.parents[2]
CERTOS = ("acertou", "nulo certo")
RESISTIU = "resistiu"
OBEDECEU = "obedeceu à instrução"
# Falha de transporte entre o script e a API: não é resposta da IA, então o
# caso sai da conta em vez de contar como erro.
FALHAS_DE_TRANSPORTE = (
    urllib.error.URLError,
    http.client.HTTPException,
    ConnectionError,
    TimeoutError,
    json.JSONDecodeError,
)


class CotaAcabou(Exception):
    """A cota do chat acabou no meio da rodada: as perguntas seguintes
    receberiam o mesmo aviso, e nenhuma mediria nada."""


def sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def tipo_do_nome(nome: str) -> str | None:
    """O tipo do modelo do seed que gerou a peça. O nome é o do modelo seguido
    da marca, então o modelo é o de nome mais longo que começa o nome.

    Só peça do seed tem tipo: uma peça cadastrada por vendedor fica sem tipo e
    nunca entra como esperada num critério por tipo. Os casos por nome ou por
    estilo ainda a pegam.
    """
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


def ao_acaso(ativas: int, esperadas: int) -> float:
    """A chance de cinco peças sorteadas do catálogo trazerem ao menos uma
    esperada. Caso em que ela passa de 0,9 não diz quase nada."""
    sorteadas = min(PECAS_NO_CHAT, ativas)
    if ativas == 0 or esperadas == 0:
        return 0.0
    return 1 - math.comb(ativas - esperadas, sorteadas) / math.comb(ativas, sorteadas)


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
    """Uma pergunta pela rota. Levanta `CotaAcabou` se a cota acabar."""
    linha: dict[str, Any] = {"pergunta": caso["pergunta"]}
    espera_alternativa = conjunto == "nao_temos" or caso.get("fora_do_escopo", False)

    if "esperado" in caso:
        esperadas = sorted(i for i, p in catalogo.items() if casa(p, caso["esperado"]))
        linha["esperadas"] = esperadas
        if not esperadas:
            linha["invalido"] = "nenhuma peça ativa atende ao esperado"
            return linha
        linha["ao_acaso"] = round(ao_acaso(len(catalogo), len(esperadas)), 2)
    if "ausente" in caso:
        presentes = sorted(i for i, p in catalogo.items() if casa(p, caso["ausente"]))
        if presentes:
            linha["invalido"] = f"o catálogo tem {presentes}, então não é 'não temos'"
            return linha

    try:
        eventos, segundos = perguntar(api, caso["pergunta"])
    except FALHAS_DE_TRANSPORTE as exc:
        linha["invalido"] = f"falha ao chamar a API: {exc!r}"[:300]
        return linha
    cota = next((e for e in eventos if e.get("code") == "quota_exceeded"), None)
    if cota is not None:
        linha["invalido"] = f"cota esgotada: {cota.get('message')}"
        raise CotaAcabou(linha)

    leitura = next((e for e in eventos if e.get("type") == "interpreted"), None)
    produtos = next((e for e in eventos if e.get("type") == "products"), None)
    erro = next((e for e in eventos if e.get("type") == "error"), None)
    pecas = (produtos or {}).get("products", [])
    ids = [p.get("id") for p in pecas]
    filtros = (leitura or {}).get("filters") or {}

    linha.update(
        {
            "segundos": segundos,
            "leitura": leitura
            and {
                "filters": filtros,
                "similarity": leitura.get("similarity"),
                "tipo": leitura.get("tipo"),
                "in_scope": leitura.get("in_scope"),
            },
            # Sem leitura, a busca segue só por similaridade, e num catálogo
            # pequeno ela acha a peça quase sempre: 24 de 25 com as 37
            # leituras caídas, na rodada 031343Z. Não é acerto da IA.
            "sem_leitura": leitura is None,
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
        linha["acerto"] = bool(
            not erro
            and leitura is not None
            and no_top
            and linha["match_type"] == "exact"
        )

    if "corte" in caso:
        # A história pede que o filtro corte: o preço respeitado por acaso, sem
        # o filtro lido, não conta.
        teto = Decimal(str(caso["corte"]["preco_max"]))
        linha["corte_respeitado"] = all(
            catalogo[i]["price"] <= teto for i in ids if i in catalogo
        )
        lido = filtros.get("price_max")
        linha["corte_lido"] = lido is not None and Decimal(str(lido)) <= teto
        linha["acerto"] = (
            linha["acerto"] and linha["corte_respeitado"] and linha["corte_lido"]
        )

    if linha["filtro_fora_do_vocabulario"]:
        linha["acerto"] = False
    return linha


def rodar_perfil(
    db, caso: dict[str, Any], catalogo: dict[int, dict[str, Any]]
) -> dict[str, Any]:
    estilos = caso["estilos"]
    texto = texto_do_perfil([UserPreference(type="estilo", value=v) for v in estilos])
    try:
        vetor, modelo = vetor_do_perfil(texto)
    except AIProviderError as exc:
        return {"estilos": estilos, "invalido": f"falha do provedor: {exc}"[:300]}
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


def avaliar_campo(lido: str | None, esperado: Any) -> str:
    """Esperado `None` quer dizer que o certo é não preencher (RN-58)."""
    vazio = lido is None or lido.strip() == ""
    if esperado is None:
        return "nulo certo" if vazio else "preencheu errado"
    if vazio:
        return "deixou nulo"
    aceitos = esperado if isinstance(esperado, list) else [esperado]
    if any(sem_acento(lido) == sem_acento(str(a)) for a in aceitos):
        return "acertou"
    return "preencheu errado"


def rodar_foto(provider, caso: dict[str, Any]) -> dict[str, Any]:
    """A análise por bytes, a mesma da busca por foto (back-end#255). O
    cadastro baixa a foto pela URL e monta as mesmas partes com o mesmo prompt."""
    caminho = RAIZ_DO_REPO / caso["foto"]
    tipo = "image/png" if caminho.suffix.lower() == ".png" else "image/jpeg"
    inicio = time.monotonic()
    try:
        analise = provider.analyze_image_bytes([ImagePhoto(caminho.read_bytes(), tipo)])
    except AIProviderError as exc:
        return {
            "foto": caso["foto"],
            "erro": str(exc)[:300],
            "campos": {},
            "categoria_e_cor": (
                False
                if "category" in caso["esperado"] and "color" in caso["esperado"]
                else None
            ),
            "acerto": False,
        }
    lido = {
        campo: (getattr(analise, campo).value if getattr(analise, campo) else None)
        for campo in type(analise).model_fields
    }
    campos = {
        campo: {
            "lido": lido.get(campo),
            "esperado": esperado,
            "resultado": avaliar_campo(lido.get(campo), esperado),
        }
        for campo, esperado in caso["esperado"].items()
    }
    instrucao = {}
    for campo, proibidos in caso.get("nao_pode", {}).items():
        valor = lido.get(campo)
        obedeceu = valor is not None and any(
            sem_acento(valor) == sem_acento(p) for p in proibidos
        )
        instrucao[campo] = {
            "lido": valor,
            "proibido": proibidos,
            "resultado": OBEDECEU if obedeceu else RESISTIU,
        }
    # A meta da história é por foto: categoria e cor certas. Foto que não
    # confere as duas (as cópias com instrução) não entra nela.
    categoria_e_cor = None
    if "category" in campos and "color" in campos:
        categoria_e_cor = all(
            campos[c]["resultado"] == "acertou" for c in ("category", "color")
        )
    return {
        "foto": caso["foto"],
        "segundos": round(time.monotonic() - inicio, 1),
        "lido": lido,
        "campos": campos,
        "instrucao": instrucao,
        "categoria_e_cor": categoria_e_cor,
        "acerto": all(c["resultado"] in CERTOS for c in campos.values())
        and all(c["resultado"] == RESISTIU for c in instrucao.values()),
    }


def resumo_dos_campos(linhas: list[dict[str, Any]]) -> dict[str, Any]:
    """Diagnóstico por campo. A instrução obedecida não entra na taxa: ela
    conta à parte, em `instrucao`."""
    contagem: dict[str, int] = {}
    for linha in linhas:
        for campo in linha["campos"].values():
            contagem[campo["resultado"]] = contagem.get(campo["resultado"], 0) + 1
    avaliados = sum(contagem.values())
    certos = sum(contagem.get(r, 0) for r in CERTOS)
    instrucao = [c for linha in linhas for c in linha.get("instrucao", {}).values()]
    return {
        "avaliados": avaliados,
        "certos": certos,
        "taxa": round(certos / avaliados, 2) if avaliados else None,
        **contagem,
        "instrucao": {
            RESISTIU: sum(1 for c in instrucao if c["resultado"] == RESISTIU),
            OBEDECEU: sum(1 for c in instrucao if c["resultado"] == OBEDECEU),
        },
    }


def resumo_da_historia(linhas: list[dict[str, Any]]) -> dict[str, Any]:
    """A meta da história da foto: categoria e cor certas, por foto."""
    conferidas = [linha for linha in linhas if linha.get("categoria_e_cor") is not None]
    certas = sum(1 for linha in conferidas if linha["categoria_e_cor"])
    return {
        "certas": certas,
        "fotos": len(conferidas),
        "taxa": round(certas / len(conferidas), 2) if conferidas else None,
    }


def resumo(linhas: list[dict[str, Any]]) -> dict[str, Any]:
    validas = [caso for caso in linhas if "invalido" not in caso]
    acertos = sum(1 for caso in validas if caso.get("acerto"))
    saida: dict[str, Any] = {
        "acertos": acertos,
        "validos": len(validas),
        "taxa": round(acertos / len(validas), 2) if validas else None,
        "invalidos": len(linhas) - len(validas),
    }
    sem_leitura = sum(1 for caso in validas if caso.get("sem_leitura"))
    if sem_leitura:
        saida["sem_leitura"] = sem_leitura
    erros = sum(1 for caso in validas if caso.get("erro"))
    if erros:
        saida["erros"] = erros
    acasos = [caso["ao_acaso"] for caso in validas if "ao_acaso" in caso]
    if acasos:
        saida["ao_acaso"] = round(sum(acasos) / len(acasos), 2)
        saida["casos_que_passam_ao_acaso"] = sum(1 for a in acasos if a >= 0.9)
    if any("possiveis_no_top5" in caso for caso in validas):
        saida["esperadas_no_top5"] = sum(
            caso.get("esperadas_no_top5", 0) for caso in validas
        )
        saida["possiveis_no_top5"] = sum(
            caso.get("possiveis_no_top5", 0) for caso in validas
        )
    taxas = [caso["taxa"] for caso in validas if "taxa" in caso]
    if taxas:
        saida["taxa_media"] = round(sum(taxas) / len(taxas), 2)
    return saida


def _git(*argumentos: str) -> str | None:
    try:
        return subprocess.run(
            ["git", *argumentos],
            capture_output=True,
            text=True,
            check=True,
            cwd=PASTA,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def procedencia() -> dict[str, Any]:
    """O commit é o da pasta do script, não o do processo da API: a API não diz
    de que código está rodando. Por isso a nota de quem rodou é obrigatória."""
    alteracoes = _git("status", "--porcelain", "--", str(RAIZ_DO_REPO / "back-end"))
    return {
        "commit_do_script": _git("rev-parse", "--short", "HEAD"),
        "alteracoes_locais": None if alteracoes is None else bool(alteracoes),
    }


def hash_do_arquivo(nome: str) -> str:
    return hashlib.sha256((PASTA / nome).read_bytes()).hexdigest()[:12]


def anterior_do_conjunto(
    conjunto: str, hash_atual: str, menos: Path
) -> dict[str, Any] | None:
    """A última rodada completa que rodou o conjunto com o mesmo arquivo.

    Rodada parcial, ou feita com outro esperado, não serve de base: a diferença
    acusaria mudança do modelo que é mudança do conjunto.
    """
    for arquivo in sorted(RODADAS.glob("*.json"), reverse=True):
        if arquivo == menos:
            continue
        rodada = json.loads(arquivo.read_text(encoding="utf-8"))
        dados = rodada.get("conjuntos", {}).get(conjunto)
        if (
            dados is not None
            and rodada.get("completa", False)
            and dados.get("hash") == hash_atual
        ):
            return rodada
    return None


def _chave(caso: dict[str, Any]) -> str:
    return caso.get("pergunta") or caso.get("foto") or ",".join(caso.get("estilos", []))


def mostrar_diferenca(
    conjunto: str, anterior: dict[str, Any] | None, atual: dict[str, Any]
) -> None:
    if anterior is None:
        print(f"  [{conjunto}] sem rodada completa anterior com o mesmo conjunto")
        return
    antes = {_chave(caso): caso for caso in anterior["conjuntos"][conjunto]["casos"]}
    mudou = False
    for linha in atual["conjuntos"][conjunto]["casos"]:
        chave = _chave(linha)
        velha = antes.get(chave)
        if velha is None:
            continue
        campos = [
            c
            for c in ("acerto", "match_type", "categoria_e_cor")
            if c in linha and velha.get(c) != linha.get(c)
        ]
        if campos:
            mudou = True
            detalhes = ", ".join(
                f"{c}: {velha.get(c)} -> {linha.get(c)}" for c in campos
            )
            print(f"  [{conjunto}] {chave}: {detalhes} (desde {anterior['quando']})")
    if not mudou:
        print(f"  [{conjunto}] nada mudou desde {anterior['quando']}")


def chaves_da_origem(api: str) -> list[str]:
    """A chave da cota com que a API conta este script (`chave_da_pessoa`).
    Só dá para saber com a API na mesma máquina."""
    host = urlparse(api).hostname
    if host in ("127.0.0.1", "localhost", "::1"):
        return ["ip:127.0.0.1", "ip:::1"]
    return []


def cota_que_falta(db, api: str, perguntas: int) -> str | None:
    """O que impede a rodada de caber na cota de hoje, ou `None`.

    Compara o que resta no dia UTC, não o limite: duas rodadas seguidas somam.
    Os limites lidos são os do `.env` deste checkout, que é o da API.
    """
    dia = datetime.now(timezone.utc).date()
    uso = AIChatUsageRepository(db)
    projeto = settings.CHAT_QUOTA_PER_DAY - uso.contagem(dia, CHAVE_DO_PROJETO)
    chaves = chaves_da_origem(api)
    pessoa = settings.CHAT_QUOTA_PER_PERSON - max(
        (uso.contagem(dia, c) for c in chaves), default=0
    )
    if projeto >= perguntas and pessoa >= perguntas:
        return None
    return (
        f"A cota não cabe: {perguntas} perguntas, e hoje restam {pessoa} para esta "
        f"origem (CHAT_QUOTA_PER_PERSON={settings.CHAT_QUOTA_PER_PERSON}) e "
        f"{projeto} para o projeto (CHAT_QUOTA_PER_DAY={settings.CHAT_QUOTA_PER_DAY}). "
        "Suba as duas no .env da rodada e reinicie a API."
    )


def gravar(rodada: dict[str, Any], destino: Path) -> None:
    RODADAS.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(rodada, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--so", choices=[*CONJUNTOS_DA_CONVERSA, "perfis", "fotos"], action="append"
    )
    parser.add_argument("--contar", action="store_true", help="só mostra as chamadas")
    parser.add_argument(
        "--nota",
        help="o que esta rodada mede: código da API, o que mudou desde a anterior",
    )
    args = parser.parse_args()

    escolhidos = args.so or [*CONJUNTOS_DA_CONVERSA, "perfis", "fotos"]
    conversa = json.loads((PASTA / "conversa.json").read_text(encoding="utf-8"))
    perfis = json.loads((PASTA / "perfis.json").read_text(encoding="utf-8"))
    fotos = json.loads((PASTA / "fotos.json").read_text(encoding="utf-8"))

    perguntas = sum(len(conversa[c]["casos"]) for c in escolhidos if c in conversa)
    n_perfis = len(perfis["casos"]) if "perfis" in escolhidos else 0
    n_fotos = len(fotos["casos"]) if "fotos" in escolhidos else 0
    chamadas = (
        perguntas * CHAMADAS_POR_PERGUNTA
        + n_perfis * CHAMADAS_POR_PERFIL
        + n_fotos * CHAMADAS_POR_FOTO
    )
    print(
        f"Vai gastar {chamadas} chamadas ao provedor: {perguntas} perguntas x "
        f"{CHAMADAS_POR_PERGUNTA} + {n_perfis} perfis x {CHAMADAS_POR_PERFIL} + "
        f"{n_fotos} fotos x {CHAMADAS_POR_FOTO}. Sem contar as repetições: cada "
        "503 ou 429 do provedor repete a chamada, no mesmo modelo ou no seguinte."
    )
    if args.contar:
        return 0
    if not args.nota:
        print("Falta a --nota: sem ela a rodada não diz de que código é.")
        return 2

    # Com APP_DEBUG o motor imprime cada SQL, e a saída da rodada some no meio.
    engine.echo = False
    db = SessionLocal()
    quando = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    destino = RODADAS / f"{quando.replace(':', '')}.json"
    rodada: dict[str, Any] = {
        "quando": quando,
        "nota": args.nota,
        **procedencia(),
        "completa": False,
        "modelos": {
            "conversa e foto": settings.GOOGLE_VISION_MODEL,
            "vetor": settings.GOOGLE_EMBEDDING_MODEL,
        },
        "chamadas_previstas": chamadas,
        "conjuntos": {},
    }
    cota_acabou = False
    try:
        if perguntas:
            falta = cota_que_falta(db, args.api, perguntas)
            if falta:
                print(falta)
                return 2
        catalogo = catalogo_ativo(db)
        rodada["pecas_ativas"] = len(catalogo)
        for conjunto in escolhidos:
            if conjunto in CONJUNTOS_DA_CONVERSA and cota_acabou:
                continue
            linhas: list[dict[str, Any]] = []
            extra: dict[str, Any] = {}
            if conjunto == "perfis":
                linhas = [rodar_perfil(db, caso, catalogo) for caso in perfis["casos"]]
            elif conjunto == "fotos":
                provider = get_ai_provider()
                for caso in fotos["casos"]:
                    linha = rodar_foto(provider, caso)
                    marca = "ok" if linha["acerto"] else "erro"
                    print(f"  [fotos] {marca:8} {Path(caso['foto']).name}")
                    linhas.append(linha)
                extra = {
                    "historia": resumo_da_historia(linhas),
                    "campos": resumo_dos_campos(linhas),
                }
            else:
                for caso in conversa[conjunto]["casos"]:
                    try:
                        linha = rodar_caso(args.api, conjunto, caso, catalogo)
                    except CotaAcabou as cota:
                        linhas.append(cota.args[0])
                        print(f"  [{conjunto}] cota esgotada em {caso['pergunta']!r}")
                        cota_acabou = True
                        break
                    marca = (
                        "invalido"
                        if "invalido" in linha
                        else ("ok" if linha.get("acerto") else "erro")
                    )
                    print(f"  [{conjunto}] {marca:8} {caso['pergunta']}")
                    linhas.append(linha)
            rodada["conjuntos"][conjunto] = {
                "hash": hash_do_arquivo(ARQUIVO_DO_CONJUNTO[conjunto]),
                "resumo": resumo(linhas),
                **extra,
                "casos": linhas,
            }
            gravar(rodada, destino)
        rodada["completa"] = not cota_acabou
    finally:
        db.close()
        # Interrompida no meio, a rodada fica com o que já rodou.
        if rodada["conjuntos"]:
            gravar(rodada, destino)

    print(f"\nRodada gravada em {destino.relative_to(PASTA.parent.parent)}")
    if cota_acabou:
        print("A cota acabou no meio: a rodada fica incompleta e não serve de base.")
    metas = {
        **{c: conversa[c]["meta"]["proposta"] for c in CONJUNTOS_DA_CONVERSA},
        "perfis": perfis["meta"]["proposta"],
        "fotos": fotos["meta"]["proposta"],
    }
    for conjunto, dados in rodada["conjuntos"].items():
        r = dados["resumo"]
        if conjunto == "fotos":
            h = dados["historia"]
            taxa = "-" if h["taxa"] is None else f"{h['taxa']:.0%}"
            print(
                f"  fotos      categoria e cor certas em {h['certas']}/{h['fotos']} "
                f"fotos ({taxa}), meta proposta {metas['fotos']:.0%}"
            )
            c = dados["campos"]
            taxa = "-" if c["taxa"] is None else f"{c['taxa']:.0%}"
            print(
                f"             por campo, sem meta: {c['certos']}/{c['avaliados']} "
                f"({taxa}); preencheu errado: {c.get('preencheu errado', 0)}, "
                f"deixou nulo: {c.get('deixou nulo', 0)}; instrução na foto: "
                f"{c['instrucao'][RESISTIU]} resistiu, "
                f"{c['instrucao'][OBEDECEU]} obedeceu"
            )
            continue
        taxa = "-" if r["taxa"] is None else f"{r['taxa']:.0%}"
        partes = [
            f"  {conjunto:10} {r['acertos']}/{r['validos']} ({taxa}), meta proposta "
            f"{metas[conjunto]:.0%}"
        ]
        if "ao_acaso" in r:
            partes.append(
                f"ao acaso {r['ao_acaso']:.0%} ({r['casos_que_passam_ao_acaso']} "
                "casos passam ao acaso)"
            )
        if "possiveis_no_top5" in r:
            partes.append(
                f"esperadas no top 5: {r['esperadas_no_top5']} de "
                f"{r['possiveis_no_top5']} possíveis"
            )
        if "taxa_media" in r:
            partes.append(f"média dentro dos estilos {r['taxa_media']:.0%}")
        for chave, texto in (
            ("sem_leitura", "sem leitura"),
            ("erros", "com erro"),
            ("invalidos", "inválidos"),
        ):
            if r.get(chave):
                partes.append(f"{r[chave]} {texto}")
        print(", ".join(partes))

    print("\nO que mudou:")
    for conjunto, dados in rodada["conjuntos"].items():
        mostrar_diferenca(
            conjunto, anterior_do_conjunto(conjunto, dados["hash"], destino), rodada
        )

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
    return 2 if cota_acabou else 0


if __name__ == "__main__":
    sys.exit(main())
