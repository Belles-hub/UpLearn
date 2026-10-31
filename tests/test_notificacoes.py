from tests.conftest import client


def test_cadastro_gera_notificacao_de_boas_vindas(usuario_teste):
    resposta = client.get(f"/notificacoes/{usuario_teste['uid']}", headers=usuario_teste["headers"])

    assert resposta.status_code == 200
    notificacoes = resposta.json()

    assert any(n["tipo"] == "boas_vindas" for n in notificacoes)
    assert all(n["lida"] is False for n in notificacoes)


def test_marcar_como_lidas(usuario_teste):
    resposta = client.post(
        f"/notificacoes/{usuario_teste['uid']}/marcar-lidas",
        headers=usuario_teste["headers"]
    )
    assert resposta.status_code == 200

    resposta2 = client.get(f"/notificacoes/{usuario_teste['uid']}", headers=usuario_teste["headers"])
    assert all(n["lida"] is True for n in resposta2.json())


def test_trocar_senha_gera_notificacao_de_seguranca(usuario_teste):
    redefinicao = client.post("/auth/redefinir-senha", json={
        "email": usuario_teste["email"],
        "resposta_seguranca": usuario_teste["resposta_seguranca"],
        "nova_senha": "outraSenha456"
    })

    # Redefinir senha sobe o token_versao — o token antigo (capturado no
    # fixture, antes da troca) para de valer, então usa o novo emitido aqui.
    novo_token = redefinicao.json()["access_token"]

    resposta = client.get(
        f"/notificacoes/{usuario_teste['uid']}",
        headers={"Authorization": f"Bearer {novo_token}"}
    )
    tipos = [n["tipo"] for n in resposta.json()]

    assert "seguranca" in tipos


def test_notificacoes_de_outro_da_403(usuario_teste):
    resposta = client.get("/notificacoes/outra.pessoa@uplearn.teste", headers=usuario_teste["headers"])

    assert resposta.status_code == 403


def test_notificacoes_exige_autenticacao(usuario_teste):
    resposta = client.get(f"/notificacoes/{usuario_teste['uid']}")

    assert resposta.status_code == 401
