"""A voz da Vintex na conversa (BE-US028-1, back-end#329).

Até aqui a busca devolvia peças e nada mais: no caminho exato nenhum texto
saía, e a bolha só tinha a frase que o front escreve quando não chega `text`
(`fallbackFor`, `useVintexChat.ts`). A assistente buscava; não respondia.

O texto da personalidade mora aqui, versionado e fora do controller, como o
`analysis_prompt.py` guarda o prompt da foto.

**O modelo não escreve a resposta.** Ele comenta peça por peça, em saída
estruturada: o `product_id` e um comentário curto. O servidor monta o texto e
escreve o nome e o preço a partir do banco (RN-65). Preço errado dito com a
voz da plataforma é pior que peça sem comentário nenhum, e é o que acontece
quando o modelo escreve o preço: ele não vê a tabela, ele lembra de um número
parecido.

Antes de aparecer na tela, `fala_conferida` recusa a fala inteira quando um
comentário fala de peça que a busca não devolveu, ou tem número, `R$` ou
"reais". A frase pronta de antes desta issue é o que vale nesse caso.

Dois limites do que a conferência cobre, lidos no código e não medidos em
produção:

- **número por extenso passa.** A regra olha dígito, `R$` e as palavras de
  dinheiro ("reais", "pratas", "contos", "pila", "mangos"); "custa uns cento e
  vinte" não é pego. Palavra de número sozinha não entra na regra porque "um
  casaco" e "dois bolsos" derrubariam a fala toda. O que segura isso é o
  prompt, e o custo de errar é texto errado, não preço errado em campo nenhum.
- **a conferência não julga se o comentário é verdade.** Ela amarra o
  comentário a uma peça que existe; se o modelo elogiar o couro de uma peça
  de algodão, a frase sai. O que limita isso é o prompt mandar usar só os
  atributos da lista.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping, Sequence
from typing import NamedTuple

from app.services.ai.base import FalaDaVintex, PecaParaComentar
from app.services.ai.untrusted_text import INSTRUCAO_DE_DADOS, delimitar

logger = logging.getLogger("vintex.assistant")

# Quantas peças o texto comenta, das cinco que vão para a tela. Cinco
# comentários numa bolha de chat é parede de texto, e as duas últimas peças da
# lista são as menos parecidas com o pedido.
COMENTARIOS_NA_FALA = 3

# Comentário muito maior que o pedido não é o formato combinado: duas frases
# curtas cabem com folga nisto. Serve de teto para o modelo não encher a bolha.
_LIMITE_DO_COMENTARIO = 300

# Todo campo da peça é texto que alguém digitou: entra sem quebra de linha e
# cortado, para uma descrição comprida não virar a maior parte do prompt e para
# texto de várias linhas não imitar o formato da lista. A marca é o caso que
# obriga: é campo livre e o cadastro não limita o tamanho dela
# (`ProductCreate`), então cabe nela uma lista de peças inteira.
_LIMITE_DO_NOME = 150
_LIMITE_DA_DESCRICAO = 200
_LIMITE_DO_ATRIBUTO = 80

# A pergunta vai até onde a leitura dela vai (`_CARACTERES_POR_TURNO`, em
# `search_interpretation`). Comentar peça contra uma pergunta cortada na metade
# é pior que prompt grande: os filtros e as peças foram escolhidos com a
# pergunta inteira.
_LIMITE_DA_PERGUNTA = 500

_NUMERO = re.compile(r"\d")
# "R$", "reais" e a gíria de dinheiro que aparece por aqui, "pila"
# inclusive. Número por extenso continua passando, e está declarado no
# topo: palavra de número sozinha ("duzentos") não entra na regra, porque
# "um casaco" e "dois bolsos" derrubariam a fala toda.
_MOEDA = re.compile(r"r\$|\b(reais|pratas?|contos?|pilas?|mangos?)\b", re.IGNORECASE)
_ESPACO = re.compile(r"\s+")

_SITUACAO_EXATA = (
    "A busca achou peças para o que a pessoa pediu. Comente as que mais têm a "
    "ver com a pergunta."
)
_SITUACAO_ALTERNATIVA = (
    "A busca NÃO achou o que a pessoa pediu: estas são as peças mais parecidas "
    "do catálogo. Comente cada uma como alternativa, dizendo o que ela tem a "
    "ver com o pedido, e nunca como se fosse o que a pessoa pediu."
)

PERSONALIDADE_PROMPT = f"""\
Você é a Vintex, a assistente de um marketplace de brechós do Rio Grande do \
Sul. Alguém fez uma pergunta e a busca já devolveu as peças do catálogo. Seu \
trabalho é comentar essas peças. Você não escolhe peça, não procura outra e \
não escreve a resposta inteira: o sistema monta o texto com o que você \
comentar.

Para cada peça que valer um comentário, responda o `product_id` dela, como \
está na lista, e um comentário de uma ou duas frases curtas dizendo o que ela \
tem a ver com o que a pessoa pediu. Comente no máximo {COMENTARIOS_NA_FALA} \
peças, as que mais respondem à pergunta. Peça que não acrescenta nada fica de \
fora, e se nenhuma valer comentário devolva a lista vazia.

Tom: português do Brasil, informal e acolhedor, de quem trabalha no brechó e \
conhece as peças. Sem gíria forçada, sem "bah" nem "tchê" de enfeite, sem \
chamar a pessoa de cliente ou de usuário, sem emoji.

O comentário não pode ter:

- **nenhum número, nem "R$", nem a palavra "reais"**. O preço é escrito pelo \
sistema, antes do seu comentário. Tamanho que é número, como o de calçado, \
também não se escreve; tamanho que é letra (P, M, G) pode. Comentário com \
número é descartado inteiro, e aí a pessoa fica sem resposta nenhuma;
- o nome nem o preço da peça: o sistema escreve os dois antes do seu \
comentário, então repetir só ocupa espaço;
- atributo que não está na lista daquela peça. Se a peça não traz a marca, \
ela não tem marca conhecida: não estime pelo estilo, não adivinhe o tecido e \
não compare com peça que não está na lista;
- promessa de entrega, troca, desconto, reserva ou disponibilidade.

Use só o que vem na lista de cada peça: categoria, cor, tamanho, marca, \
conservação, cidade e a descrição que o vendedor escreveu.

{INSTRUCAO_DE_DADOS}
"""


class PecaNaFala(NamedTuple):
    """O que o servidor escreve de cada peça, os dois do banco: o nome como
    está cadastrado e o preço já formatado."""

    nome: str
    preco: str


def abertura_do_exato(quantas: int) -> str:
    """A frase que abre a resposta quando a busca achou o que foi pedido.

    A contagem é das peças que foram para a tela, contadas pelo servidor.
    """
    if quantas == 1:
        return "Achei uma peça que combina com o que você pediu."
    return f"Achei {quantas} peças que combinam com o que você pediu."


def montar_pecas(
    pergunta: str, pecas: Sequence[PecaParaComentar], *, alternativas: bool
) -> str:
    """O texto que vai ao modelo depois do prompt: a situação da busca e, em
    bloco de dado, a pergunta e as peças.

    A situação é instrução nossa e fica fora do bloco. A pergunta e **todo**
    campo da peça são texto de terceiro e vão dentro (back-end#262): o modelo
    lê para comentar, não para obedecer.

    Todo campo entra numa linha só. Marca com quebra de linha forja peça
    dentro da lista, com `product_id` que a busca não devolveu, e aí a
    conferência derruba a fala inteira: o texto de toda busca que trouxesse
    aquela peça viraria a frase pronta, em silêncio.
    """
    dados = [f"Pergunta: {_uma_linha(pergunta, _LIMITE_DA_PERGUNTA)}", "", "Peças:"]
    for peca in pecas:
        dados.append(f"- product_id: {peca.product_id}")
        for rotulo, valor in (
            ("nome", _uma_linha(peca.name, _LIMITE_DO_NOME)),
            ("categoria", _uma_linha(peca.category, _LIMITE_DO_ATRIBUTO)),
            ("cor", _uma_linha(peca.color, _LIMITE_DO_ATRIBUTO)),
            ("tamanho", _uma_linha(peca.size, _LIMITE_DO_ATRIBUTO)),
            ("marca", _uma_linha(peca.brand, _LIMITE_DO_ATRIBUTO)),
            ("conservação", _uma_linha(peca.condition, _LIMITE_DO_ATRIBUTO)),
            ("cidade", _uma_linha(peca.city, _LIMITE_DO_ATRIBUTO)),
            ("descrição", _uma_linha(peca.description, _LIMITE_DA_DESCRICAO)),
        ):
            if valor:
                dados.append(f"  {rotulo}: {valor}")

    situacao = _SITUACAO_ALTERNATIVA if alternativas else _SITUACAO_EXATA
    corpo = "\n".join(dados)
    return f"{situacao}\n\n{delimitar(corpo)}"


def fala_conferida(
    fala: FalaDaVintex,
    *,
    abertura: str,
    pecas: Mapping[int, PecaNaFala],
) -> str | None:
    """O texto pronto, ou `None` quando a fala não passa na conferência.

    Um comentário recusado derruba a fala inteira, não só a frase dele: o
    modelo que escreveu preço, ou que falou de peça que não está na lista,
    não é confiável para as outras frases da mesma resposta.

    Peça repetida é o caso que não derruba: a segunda menção é descartada antes
    de ser conferida, e o resto do texto segue valendo. A ordem importa: com a
    conferência antes do descarte, um segundo comentário da mesma peça escrito
    com número derrubava a fala por um texto que ninguém veria.

    O corte em `COMENTARIOS_NA_FALA` vem antes da conferência: comentário que
    não vai para a tela não derruba a fala. O que passa do teto não é lido, e
    recusar por causa dele seria recusar por texto que ninguém veria.
    """
    frases: list[str] = []
    vistos: set[int] = set()
    for comentario in fala.comentarios[:COMENTARIOS_NA_FALA]:
        if comentario.product_id in vistos:
            continue

        peca = pecas.get(comentario.product_id)
        if peca is None:
            logger.warning(
                "Fala descartada: comentário sobre a peça %s, que a busca não "
                "devolveu",
                comentario.product_id,
            )
            return None

        texto = _ESPACO.sub(" ", comentario.comentario).strip()
        if not texto or len(texto) > _LIMITE_DO_COMENTARIO:
            logger.warning(
                "Fala descartada: comentário da peça %s tem %d caracteres",
                comentario.product_id,
                len(texto),
            )
            return None
        if _NUMERO.search(texto) or _MOEDA.search(texto):
            logger.warning(
                "Fala descartada: comentário da peça %s escreve número ou preço",
                comentario.product_id,
            )
            return None

        vistos.add(comentario.product_id)
        frases.append(f"{peca.nome}, {peca.preco}. {_frase(texto)}")

    if not frases:
        return None
    return " ".join([abertura, *frases]) if abertura else " ".join(frases)


def _uma_linha(texto: str | None, limite: int) -> str | None:
    if not texto:
        return None
    return _ESPACO.sub(" ", texto).strip()[:limite] or None


def _frase(texto: str) -> str:
    """O comentário como frase, porque ele entra depois do ponto que fecha o
    nome e o preço: maiúscula no começo e ponto no fim."""
    com_ponto = texto if texto[-1] in ".!?" else f"{texto}."
    return com_ponto[0].upper() + com_ponto[1:]
