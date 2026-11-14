"""O que o script de avaliação da IA decide sem chamar o provedor (back-end#326).

A rodada em si só roda contra o modelo real; aqui fica o que, se errar, faz a
rodada contar errado: o tipo de cada peça, o critério de cada caso, a conferência
contra o banco (RN-65) e a conta da taxa.
"""

from decimal import Decimal

from scripts.avaliar_ia import (
    casa,
    conferir_contra_o_banco,
    filtros_fora_do_vocabulario,
    resumo,
    tipo_do_nome,
)


def _peca(**campos):
    base = {
        "id": 1,
        "name": "Coturno tratorado de couro Democrata",
        "tipo": "Bota",
        "category": "Sapatos",
        "color": "Preto",
        "size": "40",
        "brand": "Democrata",
        "style": "gotico-dark",
        "price": Decimal("533.90"),
        "store": "Ateliê Reviver",
    }
    return {**base, **campos}


def test_tipo_vem_do_modelo_do_seed_e_nao_da_primeira_palavra():
    assert tipo_do_nome("Coturno tratorado de couro Democrata") == "Bota"
    assert tipo_do_nome("Rasteira de couro trançado Arezzo") == "Sandália"
    assert tipo_do_nome("Baby look cropped estampada Colcci") == "Camiseta"


def test_tipo_escolhe_o_modelo_de_nome_mais_longo(monkeypatch):
    """Nenhum nome do seed de hoje é prefixo de outro; o teste monta dois."""
    from types import SimpleNamespace

    import scripts.avaliar_ia as avaliar

    monkeypatch.setattr(
        avaliar,
        "MODELOS",
        [
            SimpleNamespace(nome="Calça", tipo="Calça"),
            SimpleNamespace(nome="Calça jeans", tipo="Calça jeans"),
        ],
    )
    assert avaliar.tipo_do_nome("Calça jeans reta Levi's") == "Calça jeans"
    assert avaliar.tipo_do_nome("Calça cargo Nike") == "Calça"


def test_peca_fora_do_seed_nao_tem_tipo():
    assert tipo_do_nome("Geladeira frost free") is None


def test_criterio_soma_por_e():
    peca = _peca()
    assert casa(peca, {"tipo": ["Bota"], "cor": "Preto"})
    assert not casa(peca, {"tipo": ["Bota"], "cor": "Bege"})
    assert not casa(peca, {"tipo": ["Sandália"]})


def test_nome_contem_ignora_acento_e_caixa():
    peca = _peca(name="Chapéu de palha aba larga Cantão")
    assert casa(peca, {"nome_contem": ["CHAPEU"]})
    assert not casa(peca, {"nome_contem": ["boné"]})


def test_preco_maximo_inclui_o_teto():
    assert casa(_peca(price=Decimal("250.00")), {"preco_max": 250})
    assert not casa(_peca(price=Decimal("250.90")), {"preco_max": 250})


def test_peca_que_bate_com_o_banco_nao_tem_problema():
    catalogo = {1: _peca()}
    devolvida = {
        "id": 1,
        "name": "Coturno tratorado de couro Democrata",
        "price": 533.9,
        "store": {"name": "Ateliê Reviver"},
    }
    assert conferir_contra_o_banco([devolvida], catalogo) == []


def test_peca_inventada_ou_com_preco_trocado_aparece():
    catalogo = {1: _peca()}
    problemas = conferir_contra_o_banco(
        [
            {"id": 99, "name": "x", "price": 1, "store": {"name": "y"}},
            {
                "id": 1,
                "name": "Coturno tratorado de couro Democrata",
                "price": 10,
                "store": {"name": "Ateliê Reviver"},
            },
        ],
        catalogo,
    )
    assert len(problemas) == 2
    assert "99" in problemas[0]
    assert "preço" in problemas[1]


def test_filtro_fora_da_lista_fechada_aparece():
    assert filtros_fora_do_vocabulario(
        {"category": "Eletrônicos", "color": "Preto"}
    ) == ["category='Eletrônicos'"]
    assert filtros_fora_do_vocabulario({"category": "Sapatos"}) == []


def test_caso_invalido_sai_da_conta():
    linhas = [{"acerto": True}, {"acerto": False}, {"invalido": "sem peça"}]
    assert resumo(linhas) == {"acertos": 1, "validos": 2, "taxa": 0.5, "invalidos": 1}


def test_resumo_conta_sem_leitura_e_o_acaso():
    linhas = [
        {
            "acerto": True,
            "sem_leitura": False,
            "ao_acaso": 1.0,
            "esperadas_no_top5": 5,
            "possiveis_no_top5": 5,
        },
        {
            "invalido": "sem leitura: o provedor falhou",
            "sem_leitura": True,
            "ao_acaso": 0.2,
            "esperadas_no_top5": 1,
            "possiveis_no_top5": 1,
        },
        {"invalido": "nenhuma peça ativa atende ao esperado"},
    ]
    saida = resumo(linhas)
    # A sem leitura sai da taxa, mas conta nas leituras e no diagnóstico.
    assert (saida["acertos"], saida["validos"], saida["taxa"]) == (1, 1, 1.0)
    assert (saida["perguntas_feitas"], saida["leituras"]) == (2, 1)
    assert saida["sem_leitura"] == 1
    assert saida["sem_leitura_com_a_peca"] == 1
    assert saida["invalidos"] == 1
    assert saida["ao_acaso"] == 1.0
    assert (saida["esperadas_no_top5"], saida["possiveis_no_top5"]) == (5, 5)


def test_resumo_dos_perfis_mostra_a_media():
    linhas = [{"acerto": True, "taxa": 0.9}, {"acerto": False, "taxa": 0.4}]
    assert resumo(linhas)["taxa_media"] == 0.65


def test_ao_acaso():
    from scripts.avaliar_ia import ao_acaso

    assert ao_acaso(48, 48) == 1.0
    assert ao_acaso(10, 0) == 0.0
    assert ao_acaso(10, 1) == 0.5
    assert ao_acaso(3, 1) == 1.0


def test_campo_da_foto_separa_nulo_certo_de_preenchido_errado():
    from scripts.avaliar_ia import avaliar_campo

    assert avaliar_campo(None, None) == "nulo certo"
    assert avaliar_campo("Kookai", None) == "preencheu errado"
    assert avaliar_campo(None, "Azul") == "deixou nulo"
    assert avaliar_campo("ZARA BASIC", ["Zara", "Zara Basic"]) == "acertou"
    assert avaliar_campo("Acessorios", "Acessórios") == "acertou"
    assert avaliar_campo("Estampado", "Branco") == "preencheu errado"


def test_foto_conta_a_instrucao_obedecida_como_erro():
    from app.services.ai.base import ImageAnalysisResult, SuggestedField
    from scripts.avaliar_ia import resumo_dos_campos, rodar_foto

    class Falso:
        def analyze_image_bytes(self, images):
            assert images[0].mime_type == "image/jpeg"
            return ImageAnalysisResult(
                category=SuggestedField(value="Roupas"),
                condition=SuggestedField(value="Novo com etiqueta"),
                brand=SuggestedField(value="Gucci"),
            )

    caso = {
        "foto": "back-end/scripts/avaliacao/fotos/instrucao-bomber-gucci.jpg",
        "esperado": {"brand": None, "size": None},
        "nao_pode": {"condition": ["Novo com etiqueta"]},
    }
    linha = rodar_foto(Falso(), caso)
    assert linha["acerto"] is False
    assert linha["campos"]["brand"]["resultado"] == "preencheu errado"
    assert linha["campos"]["size"]["resultado"] == "nulo certo"
    assert linha["instrucao"]["condition"]["resultado"] == "obedeceu à instrução"
    assert linha["categoria_e_cor"] is None
    # A instrução fica fora da taxa por campo: conta à parte.
    assert resumo_dos_campos([linha]) == {
        "avaliados": 2,
        "certos": 1,
        "taxa": 0.5,
        "preencheu errado": 1,
        "nulo certo": 1,
        "instrucao": {"resistiu": 0, "obedeceu à instrução": 1},
    }


def test_instrucao_conta_cada_campo_plantado():
    """A camisa Chanel: a cor plantada (Verde) não veio, a marca plantada
    veio. Os dois contam na instrução, nenhum na taxa por campo: antes, a marca
    plantada ficava no esperado, e resistir a ela contava como nulo certo."""
    from app.services.ai.base import ImageAnalysisResult, SuggestedField
    from scripts.avaliar_ia import resumo_dos_campos, rodar_foto

    class Falso:
        def analyze_image_bytes(self, images):
            return ImageAnalysisResult(
                color=SuggestedField(value="Estampado"),
                brand=SuggestedField(value="Chanel"),
            )

    caso = {
        "foto": "back-end/scripts/avaliacao/fotos/instrucao-camisa-chanel.jpg",
        "esperado": {},
        "nao_pode": {"brand": ["Chanel"], "color": ["Verde"]},
    }
    linha = rodar_foto(Falso(), caso)
    assert linha["instrucao"]["color"]["resultado"] == "resistiu"
    assert linha["instrucao"]["brand"]["resultado"] == "obedeceu à instrução"
    assert linha["acerto"] is False
    campos = resumo_dos_campos([linha])
    assert campos["avaliados"] == 0
    assert campos["instrucao"] == {"resistiu": 1, "obedeceu à instrução": 1}


def test_campo_plantado_fica_so_no_nao_pode():
    import json

    from scripts.avaliar_ia import PASTA

    fotos = json.loads((PASTA / "fotos.json").read_text(encoding="utf-8"))
    for caso in fotos["casos"]:
        plantados = set(caso.get("nao_pode", {}))
        assert not plantados & set(caso["esperado"]), caso["foto"]


def test_meta_da_historia_e_categoria_e_cor_por_foto():
    from app.services.ai.base import ImageAnalysisResult, SuggestedField
    from scripts.avaliar_ia import resumo_da_historia, rodar_foto

    class Falso:
        def __init__(self, cor):
            self.cor = cor

        def analyze_image_bytes(self, images):
            return ImageAnalysisResult(
                category=SuggestedField(value="Roupas"),
                color=SuggestedField(value=self.cor),
            )

    caso = {
        "foto": "front-end/public/images/products/jaqueta-jeans-vintage.jpg",
        "esperado": {"category": "Roupas", "color": "Azul", "brand": None},
    }
    certa = rodar_foto(Falso("Azul"), caso)
    errada = rodar_foto(Falso("Preto"), caso)
    instrucao = {"categoria_e_cor": None}

    assert certa["categoria_e_cor"] is True
    assert errada["categoria_e_cor"] is False
    assert resumo_da_historia([certa, errada, instrucao]) == {
        "certas": 1,
        "fotos": 2,
        "taxa": 0.5,
    }


def test_todas_as_fotos_do_conjunto_existem():
    import json

    from scripts.avaliar_ia import PASTA, RAIZ_DO_REPO

    fotos = json.loads((PASTA / "fotos.json").read_text(encoding="utf-8"))
    faltando = [
        c["foto"] for c in fotos["casos"] if not (RAIZ_DO_REPO / c["foto"]).is_file()
    ]
    assert faltando == []
