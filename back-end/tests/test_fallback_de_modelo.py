"""503 num modelo faz tentar o proximo da lista (back-end#209).

Medido em 27/09 com a API real: 4 falhas em 5 chamadas num intervalo de vinte
minutos, com seis outros modelos respondendo no mesmo periodo. A capacidade
oscila por modelo, entao depender de um nome unico deixa a funcionalidade
central da sprint sujeita a uma moeda.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from app.config import settings
from app.services.ai import google as mod
from app.services.ai.base import AIProviderError, ImageAnalysisResult


class _Erro(Exception):
    """Erro do SDK, que expoe o codigo em `.code`."""

    def __init__(self, code: int, mensagem: str) -> None:
        super().__init__(mensagem)
        self.code = code


class _SemEspera:
    """O `time` do módulo `google` sem a espera entre rodadas. Troca só o
    módulo, não o `time` do processo."""

    def __init__(self) -> None:
        import time

        self.monotonic = time.monotonic

    def sleep(self, _segundos: float) -> None:
        pass


class _Modelos:
    """Dubla `client.models`, respondendo por modelo."""

    def __init__(self, respostas: dict[str, Any]) -> None:
        self.respostas = respostas
        self.chamados: list[str] = []

    def generate_content(self, *, model: str, **_: Any) -> Any:  # noqa: ANN401
        self.chamados.append(model)
        r = self.respostas[model]
        if isinstance(r, Exception):
            raise r
        return r


class _Resposta:
    def __init__(self, parsed: ImageAnalysisResult) -> None:
        self.parsed = parsed
        self.text = None


def _provider(monkeypatch, modelos: str, respostas: dict[str, Any]) -> tuple:
    """Exercita `_gerar_com_fallback` direto.

    O download das fotos e inline no `analyze_image`, entao chamar por la
    exigiria rede. A escolha de modelo, que e o que este arquivo cobre, mora
    no metodo abaixo e nao depende das imagens.
    """
    monkeypatch.setattr(settings, "GOOGLE_VISION_MODEL", modelos)
    monkeypatch.setattr(settings, "GOOGLE_API_KEY", "chave-de-teste")

    p = mod.GoogleAIProvider()
    duble = _Modelos(respostas)
    p._client = type("C", (), {"models": duble})()
    return p, duble


def test_lista_com_um_nome_so_continua_funcionando(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_VISION_MODEL", "gemini-3.8-flash")
    assert mod.modelos_de_visao() == ["gemini-3.8-flash"]


def test_lista_separada_por_virgula_vira_lista(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_VISION_MODEL", " a , b ,, c ")
    assert mod.modelos_de_visao() == ["a", "b", "c"]


@pytest.mark.parametrize(
    ("exc", "esperado"),
    [
        (_Erro(503, "UNAVAILABLE"), True),
        (Exception("503 UNAVAILABLE. high demand"), True),
        # Cota do provedor esgotada (back-end#258).
        (_Erro(429, "RESOURCE_EXHAUSTED"), True),
        (Exception("429 RESOURCE_EXHAUSTED. Quota exceeded"), True),
        (_Erro(404, "NOT_FOUND"), False),
        (_Erro(400, "INVALID_ARGUMENT"), False),
        (Exception("qualquer outra coisa"), False),
    ],
)
def test_reconhece_indisponibilidade(exc: Exception, esperado: bool) -> None:
    assert mod._e_indisponibilidade(exc) is esperado


def test_503_no_primeiro_usa_o_segundo(monkeypatch) -> None:
    esperado = ImageAnalysisResult()
    p, duble = _provider(
        monkeypatch,
        "primeiro,segundo",
        {
            "primeiro": _Erro(503, "UNAVAILABLE. high demand"),
            "segundo": _Resposta(esperado),
        },
    )

    assert p._gerar_com_fallback([]).parsed == esperado
    assert duble.chamados == ["primeiro", "segundo"]


def test_429_no_primeiro_usa_o_segundo(monkeypatch) -> None:
    """Cota do dia esgotada num modelo (back-end#258): a cota da camada
    gratuita é por modelo, e o próximo da lista pode ainda ter."""
    esperado = ImageAnalysisResult()
    p, duble = _provider(
        monkeypatch,
        "primeiro,segundo",
        {
            "primeiro": _Erro(429, "RESOURCE_EXHAUSTED. Quota exceeded"),
            "segundo": _Resposta(esperado),
        },
    )

    assert p._gerar_com_fallback([]).parsed == esperado
    assert duble.chamados == ["primeiro", "segundo"]


def test_404_no_primeiro_nao_tenta_o_segundo(monkeypatch) -> None:
    """Nome que nao existe para a chave e erro de configuracao. Tentar outro
    esconderia a causa e o time perseguiria o sintoma errado."""
    p, duble = _provider(
        monkeypatch,
        "primeiro,segundo",
        {
            "primeiro": _Erro(404, "NOT_FOUND"),
            "segundo": _Resposta(ImageAnalysisResult()),
        },
    )

    with pytest.raises(AIProviderError):
        p._gerar_com_fallback([])

    assert duble.chamados == ["primeiro"]


def test_todos_indisponiveis_levanta_erro_de_provedor(monkeypatch) -> None:
    """Esgotar a cadeia nao basta mais: so levanta depois das rodadas (#264).

    Este teste afirmava uma passada so, `["a", "b", "c"]`. A #264 mudou isso de
    proposito: medido em 05/10, os tres modelos responderam 503 no mesmo
    instante e voltaram em menos de dois minutos, entao trocar de modelo nao
    cobria o congestionamento simultaneo.
    """
    p, duble = _provider(
        monkeypatch,
        "a,b,c",
        {n: _Erro(503, "UNAVAILABLE") for n in ("a", "b", "c")},
    )
    monkeypatch.setattr(mod, "time", _SemEspera())

    with pytest.raises(AIProviderError, match="Falha ao analisar"):
        p._gerar_com_fallback([])

    assert duble.chamados == ["a", "b", "c"] * mod._RODADAS


def test_todos_sem_cota_levanta_o_mesmo_erro_do_503(monkeypatch) -> None:
    """O mesmo `AIProviderError` que a rota já traduz em 503 `AI_UNAVAILABLE`
    (`test_listing_suggestions_*`): o front não precisa de um caso novo.

    A cota esgotada (429) é indisponibilidade como o 503, então também passa
    pelas rodadas da #264 -- são `_RODADAS` passadas pela cadeia, não uma.
    """
    p, duble = _provider(
        monkeypatch,
        "a,b",
        {"a": _Erro(429, "RESOURCE_EXHAUSTED"), "b": _Erro(503, "UNAVAILABLE")},
    )
    monkeypatch.setattr(mod, "time", _SemEspera())

    with pytest.raises(AIProviderError, match="Falha ao analisar"):
        p._gerar_com_fallback([])

    assert duble.chamados == ["a", "b"] * mod._RODADAS


# --- tempo esgotado (504 e teto do cliente) ---------------------------------


# O do httpx, que o SDK deixa subir. Ele não herda de `TimeoutError`: é pelo
# nome que `_e_tempo_esgotado` o reconhece.
ReadTimeout = httpx.ReadTimeout


@pytest.mark.parametrize(
    ("exc", "esperado"),
    [
        (_Erro(504, "DEADLINE_EXCEEDED"), True),
        (Exception("504 DEADLINE_EXCEEDED. Deadline expired"), True),
        (TimeoutError("timed out"), True),
        (ReadTimeout("The read operation timed out"), True),
        (_Erro(503, "UNAVAILABLE"), False),
        (Exception("qualquer outra coisa"), False),
    ],
)
def test_reconhece_tempo_esgotado(exc: Exception, esperado: bool) -> None:
    assert mod._e_tempo_esgotado(exc) is esperado


class _Relogio:
    """Relógio falso, só no módulo `google`: a espera entre rodadas anda o
    tempo da espera."""

    def __init__(self, monkeypatch) -> None:
        self.agora = 0.0
        self.esperas: list[float] = []
        self.monotonic = lambda: self.agora
        self.sleep = self.esperar
        monkeypatch.setattr(mod, "time", self)

    def esperar(self, segundos: float) -> None:
        self.esperas.append(segundos)
        self.agora += segundos


# Um tempo esgotado real passa um pouco do teto: conexão, envio e rede.
_ESTOURO_S = mod._LEITURA_TETO_POR_TENTATIVA_MS / 1000 + 0.2


class _ModelosComTempo(_Modelos):
    """Tempo esgotado gasta 10,2s no relógio; 503 gasta quase nada."""

    def __init__(self, respostas: dict[str, Any], relogio: _Relogio) -> None:
        super().__init__(respostas)
        self.relogio = relogio
        self.configs: list[Any] = []

    def generate_content(self, *, model: str, **kwargs: Any) -> Any:  # noqa: ANN401
        self.configs.append(kwargs.get("config"))
        resposta = self.respostas[model]
        if isinstance(resposta, Exception) and mod._e_tempo_esgotado(resposta):
            self.relogio.agora += _ESTOURO_S
        else:
            self.relogio.agora += 0.1
        return super().generate_content(model=model, **kwargs)


def _provider_com_prazo(monkeypatch, modelos: str, respostas: dict[str, Any]):
    p, _ = _provider(monkeypatch, modelos, {})
    relogio = _Relogio(monkeypatch)
    duble = _ModelosComTempo(respostas, relogio)
    p._client = type("C", (), {"models": duble})()
    return p, duble, relogio


_PRAZO = mod._LEITURA_PRAZO_MS


def test_504_no_segundo_tenta_o_terceiro(monkeypatch) -> None:
    """O caso medido em 11/11: 503 no primeiro, 504 no segundo, e a cadeia
    parava sem tentar o terceiro."""
    esperado = ImageAnalysisResult()
    p, duble, _ = _provider_com_prazo(
        monkeypatch,
        "a,b,c",
        {
            "a": _Erro(503, "UNAVAILABLE"),
            "b": _Erro(504, "DEADLINE_EXCEEDED"),
            "c": _Resposta(esperado),
        },
    )

    assert p._gerar_com_fallback([], prazo_ms=_PRAZO).parsed == esperado
    assert duble.chamados == ["a", "b", "c"]


def test_tempo_esgotado_em_todos_para_no_prazo(monkeypatch) -> None:
    """Dois tempos esgotados gastam 20,4s: o terceiro não cabe em 25s, e a
    cadeia para sem esperar nem repetir."""
    p, duble, relogio = _provider_com_prazo(
        monkeypatch,
        "a,b,c",
        {m: ReadTimeout("timed out") for m in "abc"},
    )

    with pytest.raises(AIProviderError, match="prazo de 25s esgotado"):
        p._gerar_com_fallback([], prazo_ms=_PRAZO)

    assert duble.chamados == ["a", "b"]
    assert relogio.esperas == []
    assert relogio.agora <= _PRAZO / 1000


def test_um_modelo_so_que_esgota_o_tempo_nao_repete(monkeypatch) -> None:
    p, duble, relogio = _provider_com_prazo(
        monkeypatch, "a", {"a": ReadTimeout("timed out")}
    )

    with pytest.raises(AIProviderError, match="timed out"):
        p._gerar_com_fallback([], prazo_ms=_PRAZO)

    assert duble.chamados == ["a"]
    assert relogio.esperas == []


def test_espera_entre_rodadas_conta_no_prazo(monkeypatch) -> None:
    """503 e dois tempos esgotados gastam 20,5s: a espera de 2s mais uma
    tentativa de 10s passaria do prazo, então a cadeia para sem esperar."""
    p, duble, relogio = _provider_com_prazo(
        monkeypatch,
        "a,b,c",
        {"a": _Erro(503, "UNAVAILABLE"), "b": ReadTimeout("x"), "c": ReadTimeout("x")},
    )

    with pytest.raises(AIProviderError, match="prazo"):
        p._gerar_com_fallback([], prazo_ms=_PRAZO)

    assert duble.chamados == ["a", "b", "c"]
    assert relogio.esperas == []
    assert relogio.agora <= _PRAZO / 1000


def test_503_e_tempo_esgotado_repete_so_o_do_503(monkeypatch) -> None:
    """503 no primeiro e tempo esgotado no segundo: a repetição volta só ao
    primeiro, que é o que pode ter voltado."""
    esperado = ImageAnalysisResult()
    respostas: dict[str, Any] = {
        "a": _Erro(503, "UNAVAILABLE"),
        "b": ReadTimeout("x"),
    }
    p, duble, relogio = _provider_com_prazo(monkeypatch, "a,b", respostas)

    def segunda_rodada_responde(segundos: float) -> None:
        relogio.esperas.append(segundos)
        relogio.agora += segundos
        respostas["a"] = _Resposta(esperado)

    relogio.sleep = segunda_rodada_responde

    assert p._gerar_com_fallback([], prazo_ms=_PRAZO).parsed == esperado
    assert duble.chamados == ["a", "b", "a"]
    assert relogio.esperas == [mod._ESPERA_ENTRE_RODADAS_S[0]]


def test_tempo_esgotado_seguido_de_503_repete_sem_o_lento(monkeypatch) -> None:
    """Tempo esgotado no primeiro e 503 nos outros dois: a repetição não volta
    ao lento, que gastaria o teto de novo."""
    esperado = ImageAnalysisResult()
    respostas: dict[str, Any] = {
        "a": ReadTimeout("x"),
        "b": _Erro(503, "UNAVAILABLE"),
        "c": _Erro(503, "UNAVAILABLE"),
    }
    p, duble, relogio = _provider_com_prazo(monkeypatch, "a,b,c", respostas)

    def segunda_rodada_responde(segundos: float) -> None:
        relogio.esperas.append(segundos)
        relogio.agora += segundos
        respostas["b"] = _Resposta(esperado)

    relogio.sleep = segunda_rodada_responde

    assert p._gerar_com_fallback([], prazo_ms=_PRAZO).parsed == esperado
    assert duble.chamados == ["a", "b", "c", "b"]
    assert relogio.agora <= _PRAZO / 1000


def test_erro_de_prazo_guarda_a_causa(monkeypatch) -> None:
    p, _, _ = _provider_com_prazo(
        monkeypatch, "a,b,c", {m: ReadTimeout("timed out") for m in "abc"}
    )

    with pytest.raises(AIProviderError) as erro:
        p._gerar_com_fallback([], prazo_ms=_PRAZO)

    assert isinstance(erro.value.__cause__, ReadTimeout)


def test_sem_prazo_tempo_esgotado_levanta_na_hora(monkeypatch) -> None:
    """A análise de foto não tem prazo próprio: cada tentativa leva o teto
    geral de 30s, e trocar de modelo levaria a chamada a minutos."""
    p, duble = _provider(
        monkeypatch,
        "a,b,c",
        {"a": _Erro(504, "DEADLINE_EXCEEDED"), "b": _Resposta(ImageAnalysisResult())},
    )

    with pytest.raises(AIProviderError, match="DEADLINE_EXCEEDED"):
        p._gerar_com_fallback([])

    assert duble.chamados == ["a"]


def test_teto_por_tentativa_so_vai_com_prazo(monkeypatch) -> None:
    p, duble, _ = _provider_com_prazo(
        monkeypatch, "a", {"a": _Resposta(ImageAnalysisResult())}
    )

    p._gerar_com_fallback([], prazo_ms=_PRAZO)
    p._gerar_com_fallback([])

    assert duble.configs[0].http_options.timeout == mod._LEITURA_TETO_POR_TENTATIVA_MS
    assert duble.configs[1].http_options is None


def test_leitura_da_pergunta_usa_o_prazo(monkeypatch) -> None:
    from app.services.ai.search_interpretation import InterpretacaoDaPergunta

    resposta = _Resposta(ImageAnalysisResult())
    resposta.parsed = InterpretacaoDaPergunta(category="Sapatos")
    p, duble, _ = _provider_com_prazo(monkeypatch, "a", {"a": resposta})

    async def ler() -> list:
        return [e async for e in p.stream_interpret_search("tênis")]

    prazos: list[int | None] = []
    original = p._gerar_com_fallback

    def espiar(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        prazos.append(kwargs.get("prazo_ms"))
        return original(*args, **kwargs)

    monkeypatch.setattr(p, "_gerar_com_fallback", espiar)
    asyncio.run(ler())

    assert prazos == [mod._LEITURA_PRAZO_MS]
    assert duble.configs[0].http_options.timeout == mod._LEITURA_TETO_POR_TENTATIVA_MS


def test_nenhum_teto_fica_abaixo_do_minimo_da_api() -> None:
    # Abaixo de 10s a API responde 400 INVALID_ARGUMENT em toda chamada, e o
    # dublê deste arquivo não reproduz isso: com 8s, os testes passavam e as
    # 37 leituras da rodada de 12/11 falharam. O `== 10_000` fixa o mínimo.
    for teto in (mod._LEITURA_TETO_POR_TENTATIVA_MS, mod._GOOGLE_TIMEOUT_MS):
        assert teto >= mod._TETO_MINIMO_DA_API_MS == 10_000
    assert mod._LEITURA_PRAZO_MS >= mod._LEITURA_TETO_POR_TENTATIVA_MS


def test_prazo_da_leitura_deixa_lugar_para_a_busca() -> None:
    # O API Gateway corta a requisição em 30s, e depois da leitura vêm o vetor
    # e a busca.
    assert mod._LEITURA_PRAZO_MS + mod._FOLGA_DA_ESPERA_MS < 30_000
