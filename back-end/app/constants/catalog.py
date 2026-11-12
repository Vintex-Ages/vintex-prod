"""Vocabulário fechado dos atributos da peça.

Estes são os valores que o catálogo realmente guarda em `products.*` e que os
filtros comparam por igualdade. Quem escreve num desses campos — o seed, o
formulário de cadastro, a sugestão da IA — tem que usar exatamente estes
valores, senão a peça existe mas não é encontrada pelo filtro.

Estava só dentro de `app/seeds/pecas.py`, onde nada além do seed enxergava.
A sugestão da IA (`back-end#150`) respondia texto livre por isso: o prompt
pedia "tipo da peça" e devolvia "Camiseta", que não é categoria nenhuma do
catálogo, e "Branco e preto", que não é cor nenhuma. O vendedor via o aviso de
que a IA leu algo fora da lista e tinha que escolher à mão.
"""

from __future__ import annotations

import re
import unicodedata

CATEGORIES: tuple[str, ...] = ("Roupas", "Sapatos", "Acessórios")

COLORS: tuple[str, ...] = (
    "Preto",
    "Branco",
    "Bege",
    "Vermelho",
    "Azul",
    "Verde",
    "Estampado",
)

CONDITIONS: tuple[str, ...] = (
    "Novo com etiqueta",
    "Seminovo",
    "Usado",
    "Marcas de uso",
)

# Numeração para calçado e letra para o resto; a peça usa uma faixa ou a outra
# conforme a categoria, e o modelo escolhe pelo que enxerga na foto.
SIZES: tuple[str, ...] = ("PP", "P", "M", "G", "GG", "36", "38", "40", "42")

# Tipo de peça (back-end#231). A categoria tem três valores, então "vestido" e
# "calça" são os dois "Roupas", e a conversa devolvia calça como resposta certa
# para quem pediu vestido. A peça não guarda o tipo: ele é lido do nome. Cada
# tipo leva as palavras de nome que o identificam, comparadas palavra a palavra,
# sem acento e pela raiz (`_raiz`), para "camisa" não casar com "camiseta" nem
# "calça" com "calçado", e "Botas", "Bolsinha" ou "Vestidão" casarem com o tipo.
# A lista tem tipo que o seed de hoje não tem ativo (vestido): é para esses que
# a conversa precisa saber dizer "não temos".
TIPOS_DE_PECA: dict[str, tuple[str, ...]] = {
    "Camiseta": ("camiseta", "baby look", "babylook", "t-shirt", "tshirt"),
    "Regata": ("regata",),
    "Camisa": ("camisa",),
    "Blusa": ("blusa", "bata"),
    "Moletom": ("moletom",),
    "Jaqueta": ("jaqueta",),
    "Casaco": ("casaco", "sobretudo", "trench coat", "trenchcoat"),
    "Blazer": ("blazer",),
    "Vestido": ("vestido",),
    "Saia": ("saia", "minissaia"),
    "Calça": ("calça",),
    "Shorts": ("shorts", "short", "bermuda"),
    "Macacão": ("macacão", "macaquinho"),
    "Tênis": ("tênis",),
    "Bota": ("bota", "botina", "coturno"),
    "Sandália": ("sandália", "rasteira", "rasteirinha"),
    "Scarpin": ("scarpin",),
    "Mocassim": ("mocassim",),
    "Sapatilha": ("sapatilha",),
    "Chinelo": ("chinelo",),
    "Bolsa": ("bolsa",),
    "Mochila": ("mochila",),
    "Carteira": ("carteira",),
    "Cinto": ("cinto",),
    "Boné": ("boné",),
    "Chapéu": ("chapéu",),
    "Óculos de sol": ("óculos",),
    "Bijuteria": ("brinco", "colar", "pulseira", "anel"),
    "Relógio": ("relógio",),
}


def lista(valores: tuple[str, ...]) -> str:
    """Valores separados por vírgula, para citar dentro de um prompt."""
    return ", ".join(valores)


def _palavras(texto: str) -> list[str]:
    decomposto = unicodedata.normalize("NFKD", texto.casefold())
    sem_acento = "".join(c for c in decomposto if not unicodedata.combining(c))
    return [_raiz(p) for p in re.findall(r"\w+", sem_acento)]


# Palavras de nome de peça que a raiz confundiria com um tipo: "Camisa de
# botão" não é bota, "Calça cargo com bolsos" não é bolsa.
_NAO_SAO_TIPO = frozenset(
    {
        "botao",
        "botoes",
        "bolso",
        "bolsos",
        "bolsinho",
        "bolsinhos",
        "calcinha",
        "calcinhas",
        "calcao",
        "calcoes",
        "cinta",
        "cintas",
        "colarinho",
        "colarinhos",
        "bote",
        "boto",
        "sai",
    }
)
# Com "z" o diminutivo vem da palavra inteira ("bonezinho" é "bone" mais
# "zinho"); sem "z" ele substitui a vogal final ("botinha" é "bot" mais "inha").
_DIMINUTIVOS_COM_Z = ("zinhas", "zinhos", "zinha", "zinho")
_DIMINUTIVOS = ("inhas", "inhos", "inha", "inho")


def _raiz(palavra: str) -> str:
    """A palavra sem diminutivo, aumentativo, plural e vogal final, para
    comparar nome de peça, que é texto livre do vendedor: "Botinha", "Botas" e
    "Bota" dão "bot"; "Bolsinha" e "Bolsa" dão "bols"; "Vestidão" e "Vestido"
    dão "vestid".

    Não é um radicalizador de português: é o bastante para os termos de
    `TIPOS_DE_PECA`. Palavra de `_NAO_SAO_TIPO` não vira raiz de tipo nenhum.
    """
    if palavra in _NAO_SAO_TIPO:
        return f"~{palavra}"
    for sufixo in _DIMINUTIVOS_COM_Z:
        if palavra.endswith(sufixo) and len(palavra) - len(sufixo) >= 3:
            palavra = palavra[: -len(sufixo)]
            # "botãozinho" é "botão" mais "zinho", e continua não sendo bota.
            if palavra in _NAO_SAO_TIPO:
                return f"~{palavra}"
            break
    else:
        for sufixo in _DIMINUTIVOS:
            if palavra.endswith(sufixo) and len(palavra) - len(sufixo) >= 3:
                raiz = palavra[: -len(sufixo)]
                # "casaquinho" é "casac", "sandalinha" é "sandal".
                if raiz.endswith(("qu", "gu")):
                    raiz = raiz[:-1]
                    raiz = raiz[:-1] + ("c" if raiz.endswith("q") else "g")
                return raiz
    if palavra.endswith(("oes", "aes", "aos")):
        palavra = palavra[:-3] + "ao"
    elif palavra.endswith("eis"):
        palavra = palavra[:-3] + "el"
    elif palavra.endswith("s") and len(palavra) > 3:
        palavra = palavra[:-1]
    # Aumentativo: "vestidão", "casacão", "bolsão".
    if palavra.endswith("zao") and len(palavra) > 5:
        palavra = palavra[:-3]
    elif palavra.endswith("ao") and len(palavra) > 4:
        palavra = palavra[:-2]
    # "sandália" e "sandalinha", "relógio" e "relógios".
    if palavra.endswith(("ia", "io")) and len(palavra) > 4:
        palavra = palavra[:-2]
    elif palavra.endswith(("a", "e", "o")) and len(palavra) > 3:
        palavra = palavra[:-1]
    # "mocassim" e "mocassins", "moletom" e "moleton". Só em palavra longa:
    # "bom", de "bom estado", viraria "bon", a raiz de boné.
    if palavra.endswith("m") and len(palavra) > 4:
        palavra = palavra[:-1] + "n"
    return palavra


def _contem(palavras: list[str], termo: str) -> bool:
    alvo = _palavras(termo)
    tamanho = len(alvo)
    return any(
        palavras[i : i + tamanho] == alvo for i in range(len(palavras) - tamanho + 1)
    )


def nome_e_do_tipo(nome: str, tipo: str) -> bool:
    """Se o nome da peça tem uma das palavras do tipo, pela raiz.

    "Rasteira de couro trançado" é Sandália; "Camiseta de banda" não é Camisa.
    Tipo fora de `TIPOS_DE_PECA` nunca casa. Nome que só diz o modelo ("Nike
    Air Force 1") não é de tipo nenhum.
    """
    palavras = _palavras(nome)
    return any(_contem(palavras, termo) for termo in TIPOS_DE_PECA.get(tipo, ()))
