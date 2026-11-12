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
# tipo leva as palavras de nome que o identificam, comparadas inteiras e sem
# acento, para "camisa" não casar com "camiseta" nem "calça" com "calçado".
# Tem tipo que o catálogo de hoje não tem (vestido, shorts): é para eles que a
# conversa precisa saber dizer "não temos".
TIPOS_DE_PECA: dict[str, tuple[str, ...]] = {
    "Camiseta": ("camiseta", "baby look", "t-shirt"),
    "Regata": ("regata",),
    "Camisa": ("camisa",),
    "Blusa": ("blusa", "bata"),
    "Moletom": ("moletom",),
    "Jaqueta": ("jaqueta",),
    "Casaco": ("casaco", "sobretudo", "trench coat"),
    "Blazer": ("blazer",),
    "Vestido": ("vestido",),
    "Saia": ("saia", "minissaia"),
    "Calça": ("calça",),
    "Shorts": ("shorts", "short", "bermuda"),
    "Macacão": ("macacão", "macaquinho"),
    "Tênis": ("tênis",),
    "Bota": ("bota", "coturno"),
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
    return re.findall(r"\w+", sem_acento)


def nome_e_do_tipo(nome: str, tipo: str) -> bool:
    """Se o nome da peça tem uma das palavras do tipo, inteira.

    "Rasteira de couro trançado" é Sandália; "Camiseta de banda" não é Camisa.
    Tipo fora de `TIPOS_DE_PECA` nunca casa.
    """
    palavras = _palavras(nome)
    for termo in TIPOS_DE_PECA.get(tipo, ()):
        alvo = _palavras(termo)
        tamanho = len(alvo)
        if any(
            palavras[i : i + tamanho] == alvo
            for i in range(len(palavras) - tamanho + 1)
        ):
            return True
    return False
