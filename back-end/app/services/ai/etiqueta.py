"""Marca, tamanho e composição só com texto lido na foto (back-end#345).

O prompt já proíbe chutar a marca e o tamanho, e o modelo preenchia os dois
mesmo com a etiqueta ilegível: a blusa bordada da suíte de avaliação voltou
como "Kookai", "Kora" e "Keds", sempre "M", em cinco rodadas. Pedir o texto
lido junto dá algo para conferir do lado de cá, em vez de depender só da
instrução.

O texto lido (`label_text`) serve só para esta conferência: a análise que sai
daqui é a `ImageAnalysisResult` de sempre, sem ele, e não chega ao formulário.
"""

from __future__ import annotations

import logging
import re
import unicodedata

from app.services.ai.base import ImageAnalysisResult, SuggestedField

logger = logging.getLogger(__name__)

# Marca e tamanho só com quase certeza. Medido em 14/11 contra o Gemini, 11
# chamadas: as marcas que estão na foto (Levi's, Zara Basic, KIIKII) vieram
# sempre com 1,0; a marca inventada da blusa bordada veio com 0,8 e 0,9, e com
# um nome diferente a cada chamada (Keds, Kook), junto de um texto lido também
# inventado ("Keds M"). No tamanho não separa tão limpo: o "M" da camiseta,
# que está na etiqueta, veio uma vez com 0,9. O corte vale para os dois porque
# o vendedor preenche o campo vazio e não percebe o valor errado.
CONFIANCA_MINIMA = 0.95


class RespostaDaFoto(ImageAnalysisResult):
    """O que o modelo responde: a análise mais o texto que ele leu."""

    label_text: str | None = None


def analise_da_resposta(resposta: ImageAnalysisResult) -> ImageAnalysisResult:
    """A análise com marca, tamanho e composição conferidos contra o texto lido.

    - **Sem texto lido, os três caem.** Etiqueta ilegível não gera valor
      (RN-59, VS-015).
    - **Marca só fica se aparecer no texto lido**, sem acento, sem caixa e sem
      pontuação: "Levi's" casa com "LEVI'S" e com "Levi Strauss" (RN-58).
    - **Tamanho só fica se for uma palavra do texto lido**: "M" casa com
      "KORA M", e não com "MADE IN".
    - **Marca e tamanho precisam de confiança de pelo menos
      `CONFIANCA_MINIMA`.** O modelo também inventa o texto lido, e aí a
      conferência acima não pega; a confiança baixa pega. Sem confiança
      informada, vale só a conferência do texto.
    - **Composição só depende de haver texto lido**: ela é copiada da etiqueta
      com quebra de linha e pontuação próprias, e comparar o texto descartaria
      a composição certa.

    Campo que cai fica nulo, e o vendedor preenche (RN-56, RN-57). Os outros
    campos não mudam.
    """
    texto = getattr(resposta, "label_text", None) or ""
    palavras = _palavras(texto)
    corrido = "".join(palavras)

    campos = {
        nome: getattr(resposta, nome) for nome in ImageAnalysisResult.model_fields
    }
    marca = campos["brand"]
    if marca is not None and (
        _pouca_confianca(marca) or not _contem(corrido, "".join(_palavras(marca.value)))
    ):
        _descartar(campos, "brand", texto)
    tamanho = campos["size"]
    if tamanho is not None and (
        _pouca_confianca(tamanho) or "".join(_palavras(tamanho.value)) not in palavras
    ):
        _descartar(campos, "size", texto)
    if campos["composition"] is not None and not palavras:
        _descartar(campos, "composition", texto)
    return ImageAnalysisResult(**campos)


def _palavras(texto: str) -> list[str]:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.findall(r"[a-z0-9]+", sem_acento.lower())


def _pouca_confianca(campo: SuggestedField) -> bool:
    return campo.confidence is not None and campo.confidence < CONFIANCA_MINIMA


def _contem(corrido: str, valor: str) -> bool:
    return bool(valor) and valor in corrido


def _descartar(campos: dict, nome: str, texto: str) -> None:
    logger.info(
        "Análise da foto: %s %r (confiança %s) descartado; texto lido: %r.",
        nome,
        campos[nome].value,
        campos[nome].confidence,
        texto,
    )
    campos[nome] = None
