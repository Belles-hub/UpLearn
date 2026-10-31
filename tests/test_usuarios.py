from app import crud_firebase
from tests.conftest import client, email_aleatorio


def test_buscar_proprio_perfil(usuario_teste):
    resposta = client.get(f"/usuarios/{usuario_teste['uid']}", headers=usuario_teste["headers"])

    assert resposta.status_code == 200
    assert resposta.json()["nome"] == "Usuário de Teste"


def test_buscar_perfil_de_outro_da_403(usuario_teste):
    resposta = client.get("/usuarios/outra.pessoa@uplearn.teste", headers=usuario_teste["headers"])

    assert resposta.status_code == 403


def test_buscar_sem_token_da_401(usuario_teste):
    resposta = client.get(f"/usuarios/{usuario_teste['uid']}")

    assert resposta.status_code == 401


def test_buscar_token_invalido_da_401(usuario_teste):
    resposta = client.get(
        f"/usuarios/{usuario_teste['uid']}",
        headers={"Authorization": "Bearer token-invalido"}
    )

    assert resposta.status_code == 401


def test_atualizar_nome(usuario_teste):
    resposta = client.put(
        f"/usuarios/{usuario_teste['uid']}",
        json={"nome": "Nome Novo"},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 200
    assert resposta.json()["nome"] == "Nome Novo"


def test_deletar_usuario(usuario_teste):
    resposta = client.delete(f"/usuarios/{usuario_teste['uid']}", headers=usuario_teste["headers"])

    assert resposta.status_code == 200

    resposta2 = client.get(f"/usuarios/{usuario_teste['uid']}", headers=usuario_teste["headers"])

    assert resposta2.status_code == 404


def test_email_da_conta_nao_muda_pelo_update(usuario_teste):
    # O e-mail é o identificador da conta: mandar outro no PUT é ignorado.
    resposta = client.put(
        f"/usuarios/{usuario_teste['uid']}",
        json={"email": "invasor@uplearn.teste", "nome": "Nome Novo"},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 200
    assert resposta.json()["email"] == usuario_teste["email"]
    assert resposta.json()["nome"] == "Nome Novo"


def test_atualizar_preferencias_de_aprendizagem(usuario_teste):
    resposta = client.put(
        f"/usuarios/{usuario_teste['uid']}",
        json={"preferencias": {
            "serie": "6º ano",
            "materias": ["Matemática", "  Ciências  ", ""],
            "estilo_aprendizagem": "passo_a_passo",
            "onboarding_concluido": True
        }},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 200

    preferencias = resposta.json()["preferencias"]

    assert preferencias["serie"] == "6º ano"
    assert preferencias["materias"] == ["Matemática", "Ciências"]
    assert preferencias["estilo_aprendizagem"] == "passo_a_passo"
    assert preferencias["onboarding_concluido"] is True


def test_estilo_de_aprendizagem_invalido_da_422(usuario_teste):
    resposta = client.put(
        f"/usuarios/{usuario_teste['uid']}",
        json={"preferencias": {"estilo_aprendizagem": "inventado"}},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 422


def test_perfil_google_usa_o_email_do_token():
    # Quem entra pelo Google tem o e-mail confirmado dentro do token — ele
    # vale mais do que o que veio digitado no corpo da requisição.
    uid_google = "google-uid-teste-" + email_aleatorio()[5:14]
    email_real = email_aleatorio()

    from app import auth
    from app.main import app

    app.dependency_overrides[auth.verificar_token] = lambda: {"uid": uid_google, "email": email_real}

    try:
        resposta = client.post("/usuarios/", json={"nome": "Conta Google", "email": "falso@exemplo.com"})

        assert resposta.status_code == 200, resposta.text
        assert resposta.json()["email"] == email_real
    finally:
        app.dependency_overrides.clear()
        crud_firebase.deletar_usuario(uid_google)
