from tests.conftest import client


def test_buscar_preferencias_padrao(usuario_teste):
    resposta = client.get(
        f"/perfil/{usuario_teste['uid']}/preferencias",
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 200
    assert resposta.json() == {
        "tipo_resposta": None,
        "tamanho_fonte": None,
        "modo_uso": None,
        "estilo_aprendizagem": None,
        "duracao_sessao": None,
        "serie": None,
        "materias": None,
        "objetivo": None,
        "onboarding_concluido": None,
        "avatar": None,
    }


def test_atualizar_preferencias(usuario_teste):
    resposta = client.put(
        f"/perfil/{usuario_teste['uid']}/preferencias",
        json={"modo_uso": "libras"},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 200
    assert resposta.json()["modo_uso"] == "libras"


def test_preferencias_de_outro_da_403(usuario_teste):
    resposta = client.get(
        "/perfil/outra.pessoa@uplearn.teste/preferencias",
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 403
