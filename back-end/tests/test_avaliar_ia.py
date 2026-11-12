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


def test_tipo_escolhe_o_modelo_de_nome_mais_longo():
    assert tipo_do_nome("Calça jeans mom cintura alta Levi's") == "Calça jeans"
    assert tipo_do_nome("Calça cargo larga Nike") == "Calça"


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
