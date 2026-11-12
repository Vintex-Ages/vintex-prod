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
feitas, então o script confere no banco o que ainda resta antes de começar,
pela origem que mais perguntou hoje: com a API no Docker, a origem que ela vê
não é o 127.0.0.1. Se a cota acabar no meio, o caso sai da conta e a conversa
para.

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

Falha que não é resposta da IA (rede, cota, erro do provedor, erro do próprio
script) tira o caso da conta e deixa o conjunto incompleto. Conjunto incompleto
não serve de base, e o script sai com código 2.

Cada rodada fica em `scripts/avaliacao/rodadas/`, com a resposta recebida, o
hash de cada conjunto e a nota de quem rodou. Ela é gravada a cada conjunto,
para uma falha no meio não perder o que já rodou. A saída compara cada conjunto
com a última rodada em que o mesmo conjunto, com os mesmos casos, rodou
completo.
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

from sqlalchemy import func, select

from app.config import settings
from app.constants.catalog import CATEGORIES, COLORS, CONDITIONS, SIZES
from app.core.pagination import DEFAULT_PAGE_SIZE, PageParams
from app.database import SessionLocal, engine
from app.models.ai_chat_usage import AIChatUsage
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
        linha["falha"] = True
        return linha
    cota = next((e for e in eventos if e.get("code") == "quota_exceeded"), None)
    if cota is not None:
        linha["invalido"] = f"cota esgotada: {cota.get('message')}"
        linha["falha"] = True
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
        # O teto lido é o pedido: "até 250" lido como 50 também cortaria.
        lido = filtros.get("price_max")
        linha["corte_lido"] = lido is not None and Decimal(str(lido)) == teto
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
        return {
            "estilos": estilos,
            "invalido": f"falha do provedor: {exc}"[:300],
            "falha": True,
        }
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
        # Um 429 ou 503 não é a IA errando a foto: sai da conta, como no perfil.
        return {
            "foto": caso["foto"],
            "invalido": f"falha do provedor: {exc}"[:300],
            "falha": True,
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
    linhas = [linha for linha in linhas if "invalido" not in linha]
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
    conferidas = [
        linha
        for linha in linhas
        if "invalido" not in linha and linha.get("categoria_e_cor") is not None
    ]
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
    sem_leitura = [caso for caso in validas if caso.get("sem_leitura")]
    if sem_leitura:
        saida["sem_leitura"] = len(sem_leitura)
        # A API não diz por que a leitura caiu (tempo esgotado, 429, resposta
        # que não se lê). Sem leitura e com a peça no top 5 é erro de
        # disponibilidade, não de busca.
        saida["sem_leitura_com_a_peca"] = sum(
            1 for caso in sem_leitura if caso.get("esperadas_no_top5")
        )
    erros = sum(1 for caso in validas if caso.get("erro"))
    if erros:
        saida["erros"] = erros
    acasos = [caso["ao_acaso"] for caso in validas if "ao_acaso" in caso]
    if acasos:
        saida["ao_acaso"] = round(sum(acasos) / len(acasos), 2)
        saida["casos_com_esperado"] = len(acasos)
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


def hash_do_conjunto(casos: list[dict[str, Any]]) -> str:
    """O hash dos casos que rodaram, não do arquivo: gravar a meta calibrada
    ou mexer em outro conjunto do mesmo arquivo não muda o que se mede."""
    texto = json.dumps(casos, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(texto.encode()).hexdigest()[:12]


def completo(linhas: list[dict[str, Any]], casos: int) -> bool:
    """Todos os casos rodaram e nenhum saiu da conta por falha. Caso inválido
    pelo catálogo (nenhuma peça esperada) não é falha: repete na próxima."""
    return len(linhas) == casos and not any(linha.get("falha") for linha in linhas)


def anterior_do_conjunto(
    conjunto: str, hash_atual: str, menos: Path
) -> dict[str, Any] | None:
    """A última rodada em que o conjunto rodou completo com os mesmos casos.

    Conjunto parcial, ou feito com outro esperado, não serve de base: a
    diferença acusaria mudança do modelo que é mudança do conjunto.
    """
    for arquivo in sorted(RODADAS.glob("*.json"), reverse=True):
        if arquivo == menos:
            continue
        try:
            rodada = json.loads(arquivo.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  rodada {arquivo.name} ilegível, pulada: {exc}")
            continue
        dados = rodada.get("conjuntos", {}).get(conjunto)
        if (
            dados is not None
            and dados.get("completo", False)
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
    desde = f"(desde {anterior['quando']})"
    velho = anterior["conjuntos"][conjunto]
    novo = atual["conjuntos"][conjunto]
    antes = {_chave(caso): caso for caso in velho["casos"]}
    mudou = False
    taxas = (velho.get("resumo", {}).get("taxa"), novo.get("resumo", {}).get("taxa"))
    if taxas[0] != taxas[1]:
        mudou = True
        # Leitura que cai é o provedor fora do ar, não a busca: uma taxa que
        # cai junto com ela não é regressão do código.
        caidas = [r.get("resumo", {}).get("sem_leitura", 0) for r in (velho, novo)]
        extra = (
            "" if caidas == [0, 0] else f" (sem leitura: {caidas[0]} -> {caidas[1]})"
        )
        print(f"  [{conjunto}] taxa: {taxas[0]} -> {taxas[1]}{extra} {desde}")
    for linha in novo["casos"]:
        chave = _chave(linha)
        velha = antes.get(chave)
        if velha is None:
            continue
        campos = [
            c
            for c in ("invalido", "acerto", "match_type", "categoria_e_cor", "taxa")
            if (c in linha or c in velha) and velha.get(c) != linha.get(c)
        ]
        if campos:
            mudou = True
            detalhes = ", ".join(
                f"{c}: {velha.get(c)} -> {linha.get(c)}" for c in campos
            )
            print(f"  [{conjunto}] {chave}: {detalhes} {desde}")
    if not mudou:
        print(f"  [{conjunto}] nada mudou {desde}")


def maior_uso_de_visitante(db, dia) -> int:
    """O que mais perguntou hoje entre os visitantes (`chave_da_pessoa`).

    O script não sabe com que origem a API o conta: rodando na máquina é o
    127.0.0.1, no Docker é o gateway da rede do compose. Conferir pela maior
    é o lado seguro.
    """
    maior = db.scalar(
        select(func.max(AIChatUsage.count)).where(
            AIChatUsage.day == dia, AIChatUsage.key.like("ip:%")
        )
    )
    return maior or 0


def cota_que_falta(db, perguntas: int) -> str | None:
    """O que impede a rodada de caber na cota de hoje, ou `None`.

    Compara o que resta no dia UTC, não o limite: duas rodadas seguidas somam.
    Os limites lidos são os do `.env` deste checkout, que é o da API.
    """
    dia = datetime.now(timezone.utc).date()
    uso = AIChatUsageRepository(db)
    projeto = settings.CHAT_QUOTA_PER_DAY - uso.contagem(dia, CHAVE_DO_PROJETO)
    pessoa = settings.CHAT_QUOTA_PER_PERSON - maior_uso_de_visitante(db, dia)
    if projeto >= perguntas and pessoa >= perguntas:
        return None
    return (
        f"A cota não cabe: {perguntas} perguntas, e hoje restam {pessoa} para a "
        "origem que mais perguntou "
        f"(CHAT_QUOTA_PER_PERSON={settings.CHAT_QUOTA_PER_PERSON}) e "
        f"{projeto} para o projeto (CHAT_QUOTA_PER_DAY={settings.CHAT_QUOTA_PER_DAY}). "
        "Suba as duas no .env da rodada e reinicie a API."
    )


def gravar(rodada: dict[str, Any], destino: Path) -> None:
    """Escreve ao lado e troca: interrompida no meio da escrita, a rodada
    anterior do mesmo arquivo fica inteira."""
    RODADAS.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_suffix(".tmp")
    temporario.write_text(
        json.dumps(rodada, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    temporario.replace(destino)


def _seguro(chave: dict[str, Any], rodar) -> dict[str, Any]:
    """Um caso que quebra o script (peça sem preço, foto que falta, erro do
    banco) sai da conta com o erro, em vez de perder o conjunto inteiro."""
    try:
        return rodar()
    except CotaAcabou:
        raise
    except Exception as exc:
        return {
            **chave,
            "invalido": f"o script falhou no caso: {exc!r}"[:300],
            "falha": True,
        }


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
            falta = cota_que_falta(db, perguntas)
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
                casos = perfis["casos"]
                linhas = [
                    _seguro(
                        {"estilos": caso["estilos"]},
                        lambda caso=caso: rodar_perfil(db, caso, catalogo),
                    )
                    for caso in casos
                ]
            elif conjunto == "fotos":
                casos = fotos["casos"]
                provider = get_ai_provider()
                for caso in casos:
                    linha = _seguro(
                        {"foto": caso["foto"]},
                        lambda caso=caso: rodar_foto(provider, caso),
                    )
                    marca = (
                        "invalido"
                        if "invalido" in linha
                        else ("ok" if linha["acerto"] else "erro")
                    )
                    print(f"  [fotos] {marca:8} {Path(caso['foto']).name}")
                    linhas.append(linha)
                extra = {
                    "historia": resumo_da_historia(linhas),
                    "campos": resumo_dos_campos(linhas),
                }
            else:
                casos = conversa[conjunto]["casos"]
                for caso in casos:
                    try:
                        linha = _seguro(
                            {"pergunta": caso["pergunta"]},
                            lambda caso=caso: rodar_caso(
                                args.api, conjunto, caso, catalogo
                            ),
                        )
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
                "hash": hash_do_conjunto(casos),
                "completo": completo(linhas, len(casos)),
                "resumo": resumo(linhas),
                **extra,
                "casos": linhas,
            }
            gravar(rodada, destino)
        rodada["completa"] = set(rodada["conjuntos"]) == set(escolhidos) and all(
            dados["completo"] for dados in rodada["conjuntos"].values()
        )
    finally:
        db.close()
        # Interrompida no meio, a rodada fica com o que já rodou.
        if rodada["conjuntos"]:
            gravar(rodada, destino)

    print(f"\nRodada gravada em {destino}")
    if cota_acabou:
        print("A cota acabou no meio: a conversa parou ali.")
    incompletos = [
        c for c in escolhidos if not rodada["conjuntos"].get(c, {}).get("completo")
    ]
    if incompletos:
        print(
            f"Incompletos, não servem de base: {', '.join(incompletos)}. "
            "Caso que saiu por falha está marcado com 'falha' na rodada."
        )
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
            de = (
                ""
                if r["casos_com_esperado"] == r["validos"]
                else f" nos {r['casos_com_esperado']} casos com esperado"
            )
            partes.append(
                f"ao acaso {r['ao_acaso']:.0%}{de} ({r['casos_que_passam_ao_acaso']} "
                "casos passam ao acaso)"
            )
        if "possiveis_no_top5" in r:
            partes.append(
                f"esperadas no top 5: {r['esperadas_no_top5']} de "
                f"{r['possiveis_no_top5']} possíveis"
            )
        if "taxa_media" in r:
            partes.append(f"média dentro dos estilos {r['taxa_media']:.0%}")
        if r.get("sem_leitura"):
            partes.append(
                f"{r['sem_leitura']} sem leitura, {r['sem_leitura_com_a_peca']} "
                "delas com a peça no top 5"
            )
        for chave, texto in (
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
    return 0 if rodada["completa"] else 2


if __name__ == "__main__":
    sys.exit(main())
