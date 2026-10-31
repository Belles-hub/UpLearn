from unittest.mock import patch

from tests.conftest import client


def test_chat_sem_ia_configurada_da_503(usuario_teste):
    with patch(
        "app.services.ia.gerar_resposta",
        side_effect=RuntimeError("GROQ_API_KEY não configurada.")
    ):
        resposta = client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": []},
            headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 503


def test_chat_com_ia_mockada(usuario_teste):
    with patch("app.services.ia.gerar_resposta", return_value="Resposta de teste"):
        resposta = client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": []},
            headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 200
    assert resposta.json()["resposta"] == "Resposta de teste"


def test_tamanho_fonte_atual_sobrescreve_preferencia_do_cadastro(usuario_teste):
    # Cadastro não define tamanho_fonte nenhum — sem o campo na requisição,
    # a instrução de "fonte grande" não deveria aparecer.
    with patch("app.services.ia.gerar_resposta", return_value="ok") as mock_ia:
        client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": []},
            headers=usuario_teste["headers"]
        )

    instrucoes_sem_override = mock_ia.call_args.args[2]
    assert "fonte grande" not in instrucoes_sem_override

    # Com tamanho_fonte_atual="grande" na requisição (o que está na tela
    # agora), a instrução correspondente tem que aparecer no prompt.
    with patch("app.services.ia.gerar_resposta", return_value="ok") as mock_ia:
        client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": [], "tamanho_fonte_atual": "grande"},
            headers=usuario_teste["headers"]
        )

    instrucoes_com_override = mock_ia.call_args.args[2]
    assert "fonte grande" in instrucoes_com_override


def test_modo_e_materia_chegam_ao_prompt_do_up(usuario_teste):
    with patch("app.services.ia.gerar_resposta", return_value="ok") as mock_ia:
        resposta = client.post(
            "/chat/",
            json={"mensagem": "me ajuda", "historico": [], "modo": "praticar", "materia": "Matemática"},
            headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 200

    instrucoes = mock_ia.call_args.args[2]

    assert "Modo PRATICAR" in instrucoes
    assert "Matemática" in instrucoes


def test_modo_invalido_da_422(usuario_teste):
    resposta = client.post(
        "/chat/",
        json={"mensagem": "oi", "historico": [], "modo": "colar"},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 422


def test_mensagem_muito_longa_da_422(usuario_teste):
    resposta = client.post(
        "/chat/",
        json={"mensagem": "a" * 501, "historico": []},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 422


def test_limite_diario_de_chat(usuario_teste, monkeypatch):
    # Baixa o teto pra 1 só pra não precisar de 300 chamadas reais aqui.
    monkeypatch.setattr("app.crud_firebase.LIMITE_DIARIO_CHAT_USUARIO", 1)

    with patch("app.services.ia.gerar_resposta", return_value="ok"):
        primeira = client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": []},
            headers=usuario_teste["headers"]
        )

    assert primeira.status_code == 200

    segunda = client.post(
        "/chat/",
        json={"mensagem": "oi de novo", "historico": []},
        headers=usuario_teste["headers"]
    )

    assert segunda.status_code == 429


def test_resumo_sem_historico(usuario_teste):
    resposta = client.get("/chat/resumo", headers=usuario_teste["headers"])

    assert resposta.status_code == 200
    assert "ainda não teve" in resposta.json()["resposta"]


def test_resumo_com_historico_mockado(usuario_teste):
    with patch("app.services.ia.gerar_resposta", return_value="Resposta de teste"):
        client.post(
            "/chat/",
            json={"mensagem": "oi", "historico": []},
            headers=usuario_teste["headers"]
        )

    with patch("app.services.ia.gerar_resumo", return_value="Resumo de teste"):
        resposta = client.get("/chat/resumo", headers=usuario_teste["headers"])

    assert resposta.status_code == 200
    assert resposta.json()["resposta"] == "Resumo de teste"
