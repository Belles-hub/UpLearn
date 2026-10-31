import random

import pytest
from fastapi.testclient import TestClient

from app.main import app

# Estes testes rodam contra o Firestore de verdade (não tem emulador
# configurado no projeto) — cada teste usa um e-mail aleatório e limpa
# o próprio usuário no final, pra não sobrar lixo nem colidir entre testes.

client = TestClient(app)


def email_aleatorio() -> str:
    return f"teste{random.randint(10**8, 10**9 - 1)}@uplearn.teste"


@pytest.fixture(autouse=True)
def _sem_limite_de_registro_nos_testes():
    # O TestClient sempre manda o mesmo "IP" fixo ("testclient") em toda
    # requisição — sem isto, o limite de cadastros por IP (pensado pra
    # barrar spam de verdade) bloquearia a suíte inteira depois de só
    # alguns testes, já que dezenas deles chamam /auth/registrar.
    from app import crud_firebase

    crud_firebase._referencia_registros("testclient").delete()
    yield
    crud_firebase._referencia_registros("testclient").delete()


@pytest.fixture
def usuario_teste():
    email = email_aleatorio()

    resposta = client.post("/auth/registrar", json={
        "nome": "Usuário de Teste",
        "email": email,
        "aceitou_termos": True,
        "senha": "senha1234",
        "pergunta_seguranca": "Qual a cidade onde você nasceu?",
        "resposta_seguranca": "Recife"
    })

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()

    info = {
        "email": email,
        "uid": dados["uid"],
        "token": dados["access_token"],
        "resposta_seguranca": "Recife",
        "headers": {"Authorization": f"Bearer {dados['access_token']}"}
    }

    yield info

    client.delete(f"/usuarios/{info['uid']}", headers=info["headers"])
