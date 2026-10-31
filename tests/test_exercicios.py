from unittest.mock import patch

from app.services import exercicios as servico
from tests.conftest import client


def _questao(**mudancas):
    base = {
        "enunciado": "Quanto é 3 x 4?",
        "alternativas": ["10", "12", "14", "16"],
        "correta": 1,
        "explicacao": "3 x 4 = 12.",
    }
    return {**base, **mudancas}


# ---------- funções puras ----------

def test_validar_questoes_mantem_as_boas():
    assert len(servico.validar_questoes([_questao(), _questao(correta=0)])) == 2


def test_validar_questoes_descarta_as_quebradas():
    bruto = [
        _questao(alternativas=["a", "b", "c"]),          # só 3 alternativas
        _questao(alternativas=["a", "a", "b", "c"]),     # repetidas
        _questao(alternativas=["a", "", "b", "c"]),      # vazia
        _questao(correta=4),                             # gabarito fora da lista
        _questao(correta="1"),                           # gabarito não é inteiro
        _questao(correta=True),                          # bool não é índice
        _questao(enunciado="  "),                        # sem pergunta
        "lixo",
    ]

    assert servico.validar_questoes(bruto) == []


def test_validar_questoes_com_entrada_que_nao_e_lista():
    assert servico.validar_questoes(None) == []


# ---------- API (IA mockada) ----------

def test_gerar_quiz(usuario_teste):
    retorno = {"questoes": [_questao(), _questao(correta=2), _questao(correta=3)]}

    with patch("app.services.ia.gerar_json", return_value=retorno):
        resposta = client.post(
            "/exercicios/quiz",
            json={"materia": "Matemática", "conteudo": "Multiplicação", "quantidade": 3},
            headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 200, resposta.text
    assert len(resposta.json()["questoes"]) == 3


def test_quiz_com_poucas_questoes_validas_da_502(usuario_teste):
    with patch("app.services.ia.gerar_json", return_value={"questoes": [_questao()]}):
        resposta = client.post(
            "/exercicios/quiz",
            json={"materia": "Matemática", "conteudo": "Multiplicação"},
            headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 502


def test_salvar_resultado_e_aparecer_no_desempenho(usuario_teste):
    salvo = client.post(
        "/exercicios/resultado",
        json={"materia": "Matemática", "conteudo": "Multiplicação", "total": 5, "acertos": 4},
        headers=usuario_teste["headers"]
    )

    assert salvo.status_code == 200

    painel = client.get("/desempenho/", headers=usuario_teste["headers"]).json()

    assert painel["exercicios_total"] == 1
    assert painel["materias_exercicios"] == [{
        "materia": "Matemática", "exercicios": 1, "questoes": 5,
        "acertos": 4, "taxa_acerto": 80, "precisa_revisar": False,
    }]
    assert {c["id"]: c["conquistada"] for c in painel["conquistas"]}["primeiro_quiz"] is True


def test_resultado_com_mais_acertos_que_questoes_da_422(usuario_teste):
    resposta = client.post(
        "/exercicios/resultado",
        json={"materia": "Matemática", "conteudo": "Frações", "total": 3, "acertos": 4},
        headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 422
