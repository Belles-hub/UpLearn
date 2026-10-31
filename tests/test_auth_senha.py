from tests.conftest import client, email_aleatorio


def test_registrar_e_login(usuario_teste):
    resposta = client.post("/auth/login", json={
        "email": usuario_teste["email"],
        "senha": "senha1234"
    })

    assert resposta.status_code == 200
    assert resposta.json()["uid"] == usuario_teste["uid"]


def test_registrar_email_duplicado(usuario_teste):
    resposta = client.post("/auth/registrar", json={
        "nome": "Outro Nome",
        "email": usuario_teste["email"],
        "senha": "outrasenha",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": "Qualquer coisa"
    })

    assert resposta.status_code == 409


def test_login_senha_errada(usuario_teste):
    resposta = client.post("/auth/login", json={
        "email": usuario_teste["email"],
        "senha": "senhaerrada"
    })

    assert resposta.status_code == 401


def test_login_email_inexistente():
    resposta = client.post("/auth/login", json={
        "email": email_aleatorio(),
        "senha": "qualquercoisa"
    })

    assert resposta.status_code == 401


def test_pergunta_seguranca(usuario_teste):
    resposta = client.post("/auth/pergunta-seguranca", json={
        "email": usuario_teste["email"]
    })

    assert resposta.status_code == 200
    assert resposta.json()["pergunta"] == "Qual a cidade onde você nasceu?"


def test_pergunta_seguranca_email_inexistente():
    resposta = client.post("/auth/pergunta-seguranca", json={
        "email": email_aleatorio()
    })

    assert resposta.status_code == 404


def test_pergunta_seguranca_tambem_tem_limite():
    # Sem isso, dava pra martelar e-mail atrás de e-mail pra descobrir
    # quais e-mails têm conta, sem custo nenhum (oráculo de enumeração).
    from app import crud_firebase

    email = email_aleatorio()

    try:
        for _ in range(crud_firebase.MAX_TENTATIVAS):
            resposta = client.post("/auth/pergunta-seguranca", json={"email": email})
            assert resposta.status_code == 404, resposta.text

        bloqueado = client.post("/auth/pergunta-seguranca", json={"email": email})

        assert bloqueado.status_code == 429

    finally:
        crud_firebase.limpar_tentativas_de_login(email)


def test_redefinir_senha_revoga_token_antigo(usuario_teste):
    # Sem isto, um token roubado ANTES da troca de senha continuava
    # funcionando normalmente até expirar sozinho (até 7 dias depois) —
    # trocar a senha não adiantava nada contra quem já tinha o token.
    token_antigo = usuario_teste["token"]

    ainda_funciona = client.get(f"/usuarios/{usuario_teste['uid']}", headers=usuario_teste["headers"])
    assert ainda_funciona.status_code == 200

    resposta = client.post("/auth/redefinir-senha", json={
        "email": usuario_teste["email"],
        "resposta_seguranca": usuario_teste["resposta_seguranca"],
        "nova_senha": "senhanova123"
    })
    assert resposta.status_code == 200

    revogado = client.get(
        f"/usuarios/{usuario_teste['uid']}",
        headers={"Authorization": f"Bearer {token_antigo}"}
    )
    assert revogado.status_code == 401

    # O token NOVO (devolvido pelo próprio redefinir-senha) tem que valer —
    # senão a pessoa ficaria deslogada da sessão que acabou de criar.
    novo_token = resposta.json()["access_token"]
    funciona_de_novo = client.get(
        f"/usuarios/{usuario_teste['uid']}",
        headers={"Authorization": f"Bearer {novo_token}"}
    )
    assert funciona_de_novo.status_code == 200

    # Atualiza o fixture pra sua limpeza (no finally) usar um token válido.
    usuario_teste["headers"] = {"Authorization": f"Bearer {novo_token}"}


def test_redefinir_senha(usuario_teste):
    resposta = client.post("/auth/redefinir-senha", json={
        "email": usuario_teste["email"],
        "resposta_seguranca": usuario_teste["resposta_seguranca"],
        "nova_senha": "senhanova123"
    })

    assert resposta.status_code == 200

    login = client.post("/auth/login", json={
        "email": usuario_teste["email"],
        "senha": "senhanova123"
    })

    assert login.status_code == 200


def test_redefinir_senha_resposta_errada(usuario_teste):
    resposta = client.post("/auth/redefinir-senha", json={
        "email": usuario_teste["email"],
        "resposta_seguranca": "Resposta Errada",
        "nova_senha": "senhanova123"
    })

    assert resposta.status_code == 400


def test_redefinir_senha_resposta_nao_diferencia_maiuscula_nem_espaco(usuario_teste):
    # "Recife", " recife " e "RECIFE" têm que valer como a mesma resposta —
    # ninguém lembra se digitou com maiúscula da primeira vez.
    resposta = client.post("/auth/redefinir-senha", json={
        "email": usuario_teste["email"],
        "resposta_seguranca": "  RECIFE  ",
        "nova_senha": "senhanova123"
    })

    assert resposta.status_code == 200


def test_registrar_senha_curta():
    resposta = client.post("/auth/registrar", json={
        "nome": "Nome",
        "email": email_aleatorio(),
        "senha": "123",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": "Qualquer coisa"
    })

    assert resposta.status_code == 422


def test_limite_de_cadastro_por_ip(monkeypatch):
    # Diferente do bloqueio de login (por conta), spam de cadastro varia o
    # email a cada tentativa — por isso o freio aqui tem que ser por IP,
    # não por conta.
    monkeypatch.setattr("app.crud_firebase.LIMITE_REGISTROS_POR_IP", 1)

    emails_criados = []

    def registrar():
        email = email_aleatorio()
        emails_criados.append(email)
        return client.post("/auth/registrar", json={
            "nome": "Usuário Limite IP", "email": email, "senha": "senha1234",
            "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?", "resposta_seguranca": "Recife"
        })

    try:
        primeira = registrar()
        assert primeira.status_code == 200, primeira.text

        segunda = registrar()
        assert segunda.status_code == 429

    finally:

        for email in emails_criados:
            login = client.post("/auth/login", json={"email": email, "senha": "senha1234"})
            if login.status_code == 200:
                dados = login.json()
                client.delete(
                    f"/usuarios/{dados['uid']}",
                    headers={"Authorization": f"Bearer {dados['access_token']}"}
                )


def test_registrar_sem_resposta_seguranca():
    resposta = client.post("/auth/registrar", json={
        "nome": "Nome",
        "email": email_aleatorio(),
        "senha": "senha1234",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": ""
    })

    assert resposta.status_code == 422


# ---------- bloqueio por senhas erradas ----------
#
# Antes disso, login e redefinição aceitavam tentativas ilimitadas: dava pra
# testar senha atrás de senha (ou nome atrás de nome) sem nenhum freio.

def test_bloqueia_apos_varias_senhas_erradas():
    from app import crud_firebase

    email = email_aleatorio()

    client.post("/auth/registrar", json={
        "nome": "Usuário Bloqueio", "email": email, "senha": "senhaCerta1",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?", "resposta_seguranca": "Recife"
    })

    try:
        for _ in range(crud_firebase.MAX_TENTATIVAS):
            resposta = client.post("/auth/login", json={
                "email": email, "senha": "senhaErrada"
            })
            assert resposta.status_code == 401, resposta.text

        # Passou do limite: agora nem a senha certa entra.
        bloqueado = client.post("/auth/login", json={
            "email": email, "senha": "senhaCerta1"
        })

        assert bloqueado.status_code == 429
        assert "Aguarde" in bloqueado.json()["detail"]

    finally:
        crud_firebase.limpar_tentativas_de_login(email)
        dados = client.post("/auth/login", json={
            "email": email, "senha": "senhaCerta1"
        }).json()
        client.delete(
            f"/usuarios/{dados['uid']}",
            headers={"Authorization": f"Bearer {dados['access_token']}"}
        )


def test_acertar_a_senha_zera_a_contagem():
    from app import crud_firebase

    email = email_aleatorio()

    registro = client.post("/auth/registrar", json={
        "nome": "Usuário Contagem", "email": email, "senha": "senhaCerta1",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?", "resposta_seguranca": "Recife"
    }).json()

    try:
        # Erra algumas vezes, mas não o bastante pra bloquear.
        for _ in range(crud_firebase.MAX_TENTATIVAS - 1):
            client.post("/auth/login", json={
                "email": email, "senha": "errada"
            })

        assert client.post("/auth/login", json={
            "email": email, "senha": "senhaCerta1"
        }).status_code == 200

        # Zerou: erros de ontem não podem somar com os de hoje.
        assert crud_firebase.segundos_de_bloqueio(email) == 0

        for _ in range(crud_firebase.MAX_TENTATIVAS - 1):
            assert client.post("/auth/login", json={
                "email": email, "senha": "errada"
            }).status_code == 401

    finally:
        crud_firebase.limpar_tentativas_de_login(email)
        client.delete(
            f"/usuarios/{registro['uid']}",
            headers={"Authorization": f"Bearer {registro['access_token']}"}
        )


def test_redefinir_senha_tambem_tem_limite():
    from app import crud_firebase

    email = email_aleatorio()

    registro = client.post("/auth/registrar", json={
        "nome": "Usuário Reset", "email": email, "senha": "senhaCerta1",
        "aceitou_termos": True, "pergunta_seguranca": "Qual a cidade onde você nasceu?", "resposta_seguranca": "Recife"
    }).json()

    try:
        for _ in range(crud_firebase.MAX_TENTATIVAS):
            resposta = client.post("/auth/redefinir-senha", json={
                "email": email, "resposta_seguranca": "Resposta Chutada", "nova_senha": "outraSenha1"
            })
            assert resposta.status_code == 400, resposta.text

        bloqueado = client.post("/auth/redefinir-senha", json={
            "email": email, "resposta_seguranca": "Resposta Chutada", "nova_senha": "outraSenha1"
        })

        assert bloqueado.status_code == 429

    finally:
        crud_firebase.limpar_tentativas_de_login(email)
        client.delete(
            f"/usuarios/{registro['uid']}",
            headers={"Authorization": f"Bearer {registro['access_token']}"}
        )


def test_registro_de_tentativa_vencido_e_apagado():
    # O registro guarda um email e um horário. Depois que a janela de
    # bloqueio passa ele não serve mais pra nada e não pode continuar no
    # banco — senão a coleção vira um histórico permanente de quem errou
    # a senha alguma vez.
    from datetime import datetime, timedelta, timezone

    from app import crud_firebase

    email = email_aleatorio()
    referencia = crud_firebase._referencia_tentativas(email)

    antigo = datetime.now(timezone.utc) - timedelta(
        minutes=crud_firebase.BLOQUEIO_MINUTOS + 1
    )

    referencia.set({"falhas": crud_firebase.MAX_TENTATIVAS, "ultima_falha": antigo})

    try:
        assert crud_firebase.segundos_de_bloqueio(email) == 0
        assert not referencia.get().exists, "o registro vencido devia ter sido apagado"

    finally:
        referencia.delete()


def test_registrar_sem_aceitar_termos_da_422():
    resposta = client.post("/auth/registrar", json={
        "nome": "Nome",
        "email": email_aleatorio(),
        "senha": "senha1234",
        "aceitou_termos": False,
        "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": "Recife"
    })

    assert resposta.status_code == 422


def test_email_e_normalizado_no_cadastro_e_no_login():
    email = email_aleatorio()

    registro = client.post("/auth/registrar", json={
        "nome": "Usuário Maiúscula",
        "email": f"  {email.upper()}  ",
        "senha": "senha1234",
        "aceitou_termos": True,
        "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": "Recife"
    })

    try:
        assert registro.status_code == 200, registro.text
        # O id da conta é o e-mail em minúsculas, sem espaços.
        assert registro.json()["uid"] == email

        login = client.post("/auth/login", json={"email": email, "senha": "senha1234"})
        assert login.status_code == 200
    finally:
        dados = registro.json()
        client.delete(
            f"/usuarios/{dados['uid']}",
            headers={"Authorization": f"Bearer {dados['access_token']}"}
        )


def test_registrar_email_invalido_da_422():
    for invalido in ["semarroba.com", "a@b", "com/barra@x.com", "a b@x.com"]:
        resposta = client.post("/auth/registrar", json={
            "nome": "Nome",
            "email": invalido,
            "senha": "senha1234",
            "aceitou_termos": True,
            "pergunta_seguranca": "Qual a cidade onde você nasceu?",
            "resposta_seguranca": "Recife"
        })

        assert resposta.status_code == 422, invalido
