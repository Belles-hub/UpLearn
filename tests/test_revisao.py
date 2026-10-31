from datetime import date
from unittest.mock import patch

from app.services import revisao
from tests.conftest import client

HOJE = date(2026, 10, 31)


def _errada(**mudancas):
    base = {
        "enunciado": "Quanto é 3 x 4?",
        "alternativas": ["10", "12", "14", "16"],
        "correta": 1,
        "explicacao": "3 x 4 = 12.",
    }
    return {**base, **mudancas}


# ---------- funções puras ----------

def test_acertar_sobe_de_caixa_e_espaca_mais():
    caixa, proxima = revisao.proxima_revisao(0, True, HOJE)

    assert caixa == 1
    assert (proxima - HOJE).days == revisao.INTERVALOS_DIAS[1]


def test_errar_volta_pra_primeira_caixa():
    caixa, proxima = revisao.proxima_revisao(3, False, HOJE)

    assert caixa == 0
    assert (proxima - HOJE).days == revisao.INTERVALOS_DIAS[0]


def test_acertar_na_ultima_caixa_domina_o_cartao():
    caixa, proxima = revisao.proxima_revisao(revisao.CAIXA_DOMINADO - 1, True, HOJE)

    assert caixa == revisao.CAIXA_DOMINADO
    assert proxima is None


def _atividade(*perguntas_por_dia):
    """Lista de dias terminando em HOJE; o último item é hoje."""
    from datetime import timedelta

    n = len(perguntas_por_dia)

    return [
        {"dia": (HOJE - timedelta(days=n - 1 - i)).isoformat(), "rotulo": "", "perguntas": p}
        for i, p in enumerate(perguntas_por_dia)
    ]


def test_sequencia_conta_dias_seguidos_ate_hoje():
    assert revisao.calcular_sequencia(_atividade(0, 1, 2, 1), HOJE.isoformat()) == 3


def test_sequencia_nao_quebra_se_hoje_ainda_nao_teve_atividade():
    assert revisao.calcular_sequencia(_atividade(1, 1, 0), HOJE.isoformat()) == 2


def test_sequencia_quebra_depois_de_um_dia_em_branco():
    assert revisao.calcular_sequencia(_atividade(1, 1, 0, 0), HOJE.isoformat()) == 0


# ---------- API ----------

def test_health_nao_precisa_de_login():
    resposta = client.get("/health")

    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}
    assert resposta.headers["x-content-type-options"] == "nosniff"


def test_questao_errada_vira_cartao_e_so_aparece_quando_vence(usuario_teste):
    headers = usuario_teste["headers"]

    resposta = client.post("/exercicios/resultado", headers=headers, json={
        "materia": "Matemática", "conteudo": "Multiplicação",
        "total": 3, "acertos": 2, "erradas": [_errada()],
    })

    assert resposta.status_code == 200, resposta.text

    # Recém-errada: só volta amanhã, então a fila de hoje está vazia.
    assert client.get("/revisao/", headers=headers).json() == []


def test_cartao_vencido_pode_ser_revisado_e_domina(usuario_teste):
    from app import crud_firebase

    uid, headers = usuario_teste["uid"], usuario_teste["headers"]

    crud_firebase.salvar_cartoes_revisao(uid, "Matemática", [_errada()], "2000-01-01")

    fila = client.get("/revisao/", headers=headers).json()

    assert len(fila) == 1
    assert fila[0]["enunciado"] == "Quanto é 3 x 4?"

    assert client.get("/desempenho/rapido", headers=headers).json()["revisao_pendente"] == 1

    # Errou: continua na fila (volta pra amanhã, então some de hoje).
    r = client.post(f"/revisao/{fila[0]['id']}/resultado", headers=headers, json={"acertou": False})
    assert r.status_code == 200 and r.json()["dominado"] is False
    assert client.get("/revisao/", headers=headers).json() == []


def test_cartao_inexistente_da_404(usuario_teste):
    r = client.post("/revisao/naoexiste/resultado", headers=usuario_teste["headers"], json={"acertou": True})

    assert r.status_code == 404


def test_exportar_dados_traz_tudo_menos_segredos(usuario_teste):
    r = client.get(f"/usuarios/{usuario_teste['uid']}/exportar", headers=usuario_teste["headers"])

    assert r.status_code == 200
    corpo = r.json()

    assert corpo["perfil"]["email"] == usuario_teste["email"]
    assert "senha_hash" not in corpo["perfil"]
    assert "resposta_seguranca_hash" not in corpo["perfil"]
    assert "revisao" in corpo


def test_exportar_dados_de_outra_pessoa_e_negado(usuario_teste):
    r = client.get("/usuarios/outra-pessoa/exportar", headers=usuario_teste["headers"])

    assert r.status_code == 403


def test_chat_em_fluxo_entrega_pedacos_e_salva_a_conversa(usuario_teste):
    headers = usuario_teste["headers"]

    with patch("app.services.ia.gerar_resposta_stream", return_value=iter(["Olá, ", "tudo bem?"])):
        r = client.post("/chat/stream", headers=headers, json={"mensagem": "oi", "historico": []})

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert '"texto": "Olá, "' in r.text
    assert '"fim": true' in r.text

    from app import crud_firebase

    salvas = crud_firebase.listar_mensagens(usuario_teste["uid"])

    assert [m["content"] for m in salvas] == ["oi", "Olá, tudo bem?"]
