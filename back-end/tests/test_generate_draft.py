from pathlib import Path

from scripts.docs.generate_draft import (
    PathMapEntry,
    group_by_page,
    load_path_map,
    match_page,
    render_draft,
)

ENTRIES = [
    PathMapEntry(pattern="app/core/**", page="arquitetura/fundacao-http"),
    PathMapEntry(pattern="infra/**", page="infraestrutura/teste-local"),
    PathMapEntry(pattern="Makefile", page="infraestrutura/teste-local"),
]


def test_match_page_encontra_padrao_glob():
    assert match_page("app/core/errors.py", ENTRIES) == "arquitetura/fundacao-http"


def test_match_page_normaliza_barra_invertida_do_windows():
    assert match_page("app\\core\\errors.py", ENTRIES) == "arquitetura/fundacao-http"


def test_match_page_casamento_exato():
    assert match_page("Makefile", ENTRIES) == "infraestrutura/teste-local"


def test_match_page_sem_casamento_retorna_none():
    assert match_page("app/models/user.py", ENTRIES) is None


def test_group_by_page_separa_mapeados_e_sem_mapeamento():
    mapped, unmapped = group_by_page(
        [
            "app/core/errors.py",
            "infra/vintex-infra/docker-compose.yml",
            "app/models/user.py",
        ],
        ENTRIES,
    )

    assert mapped == {
        "arquitetura/fundacao-http": ["app/core/errors.py"],
        "infraestrutura/teste-local": ["infra/vintex-infra/docker-compose.yml"],
    }
    assert unmapped == ["app/models/user.py"]


def test_render_draft_sem_nenhuma_mudanca():
    draft = render_draft({}, [])

    assert "Nenhum arquivo alterado" in draft


def test_render_draft_lista_paginas_e_nao_mapeados():
    draft = render_draft(
        {"infraestrutura/teste-local": ["Makefile"]},
        ["app/models/user.py"],
    )

    assert "`infraestrutura/teste-local`" in draft
    assert "`Makefile`" in draft
    assert "Sem mapeamento em path-map.json" in draft
    assert "`app/models/user.py`" in draft
    assert "nao bloqueia o merge" in draft


def test_load_path_map_le_o_arquivo_real_do_projeto():
    path_map_file = (
        Path(__file__).resolve().parent.parent / "documentation" / "path-map.json"
    )

    entries = load_path_map(path_map_file)

    assert len(entries) > 0
    assert all(isinstance(e, PathMapEntry) for e in entries)


def test_terraform_composition_maps_base_and_runtime_without_schema_change():
    entries = load_path_map(
        Path(__file__).resolve().parents[1] / "documentation/path-map.json"
    )
    for path in (
        "infra/terraform/aws/main.tf",
        "scripts/infra/terraform_env.py",
        "tests/test_terraform_make.py",
    ):
        assert match_page(path, entries) == "infraestrutura/aws-shared"
    assert (
        match_page("infra/terraform/aws/tests/staging.tftest.hcl", entries)
        == "infraestrutura/aws-staging"
    )


DOCUMENTATION = Path(__file__).resolve().parents[1] / "documentation"


def _paginas_do_portal() -> set[str]:
    docs = DOCUMENTATION / "docs"
    return {p.relative_to(docs).with_suffix("").as_posix() for p in docs.rglob("*.md")}


def test_toda_pagina_do_mapa_existe_no_portal():
    entries = load_path_map(DOCUMENTATION / "path-map.json")
    faltando = {e.page for e in entries} - _paginas_do_portal()
    assert not faltando, f"Páginas do path-map sem arquivo em docs/: {faltando}"


def test_toda_pagina_do_portal_tem_ao_menos_um_caminho_no_mapa():
    entries = load_path_map(DOCUMENTATION / "path-map.json")
    orfas = _paginas_do_portal() - {e.page for e in entries}
    assert not orfas, f"Páginas que nenhum caminho do path-map aponta: {orfas}"


def test_nenhum_padrao_repetido_no_mapa():
    # A primeira correspondência vence: um padrão repetido nunca é usado.
    padroes = [e.pattern for e in load_path_map(DOCUMENTATION / "path-map.json")]
    repetidos = {p for p in padroes if padroes.count(p) > 1}
    assert not repetidos, f"Padrões repetidos no path-map: {repetidos}"


def test_producao_e_worker_nao_caem_no_mapa_generico_de_infra():
    entries = load_path_map(DOCUMENTATION / "path-map.json")
    assert (
        match_page("infra/terraform/aws-production/main.tf", entries)
        == "infraestrutura/aws-producao"
    )
    assert (
        match_page("app/workers/ai_analysis.py", entries)
        == "infraestrutura/mensageria"
    )
