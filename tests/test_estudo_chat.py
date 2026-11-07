from unittest.mock import patch

import pytest

from app.services import estudo_chat as servico
from tests.conftest import client
from tests.test_fichas import FICHAS_DA_IA
from tests.test_mapa import MAPA_DA_IA

HISTORICO = [
    {"role": "user", "content": "Me explica o que é fotossíntese"},
    {"role": "assistant", "content": "É como a planta faz o próprio alimento usando luz."},
]

DINAMICAS_DA_IA = {
    "titulo": "Fotossíntese",
    "dinamicas": [
        {"nome": f"Dinâmica {i}", "tempo_min": 10, "passos": ["Passo um", "Passo dois"], "dica": "Divirta-se"}
        for i in range(4)
    ],
}


# ---------- funções puras ----------

def test_validar_flashcards():
    saida = servico.validar("flashcards", {"titulo": "Fotossíntese", **FICHAS_DA_IA})

    assert saida["tipo"] == "flashcards" and saida["titulo"] == "Fotossíntese"
    assert len(saida["cartoes"]) == 8
    assert "mapa" not in saida and "dinamicas" not in saida


def test_validar_mapa_nao_exige_dias():
    saida = servico.validar("mapa", {"titulo": "Fotossíntese", **MAPA_DA_IA})

    assert len(saida["mapa"]["ramos"]) == 4
    assert saida["mapa"]["etapas"] == []          # conversa não tem dias de plano


def test_validar_dinamicas_limita_tempo_e_passos():
    bruto = {"dinamicas": [
        {"nome": "N" * 200, "tempo_min": 9999, "passos": ["p"] * 20, "dica": "d" * 500} for _ in range(20)
    ]}

    saida = servico.validar("dinamicas", bruto)

    assert saida["titulo"] == "Revisão da conversa"      # sem título da IA, usa um padrão
    assert len(saida["dinamicas"]) == servico.MAX_DINAMICAS
    assert all(d["tempo_min"] == servico.MAX_TEMPO_MIN for d in saida["dinamicas"])
    assert all(len(d["passos"]) == servico.MAX_PASSOS for d in saida["dinamicas"])
    assert all(len(d["nome"]) <= servico.TAMANHO_NOME_DINAMICA + 3 for d in saida["dinamicas"])
    assert all(len(d["dica"]) <= servico.TAMANHO_DICA + 3 for d in saida["dinamicas"])


def test_validar_dinamicas_ignora_lixo_e_tempo_invalido():
    bruto = {"dinamicas": [None, "x", {"nome": "Sem passos"}, {"nome": "Um passo", "passos": ["a"]}]
             + [{"nome": f"Boa {i}", "tempo_min": "muito", "passos": ["a", "b"]} for i in range(3)]}

    saida = servico.validar("dinamicas", bruto)

    assert [d["nome"] for d in saida["dinamicas"]] == ["Boa 0", "Boa 1", "Boa 2"]
    assert all(d["tempo_min"] == servico.TEMPO_PADRAO_MIN for d in saida["dinamicas"])


@pytest.mark.parametrize("tipo,bruto", [
    ("flashcards", None), ("flashcards", {}), ("mapa", {"ramos": []}), ("dinamicas", {"dinamicas": []}),
    ("dinamicas", {"dinamicas": DINAMICAS_DA_IA["dinamicas"][:2]}), ("outro", {}),
])
def test_validar_sem_o_minimo_levanta_erro(tipo, bruto):
    with pytest.raises(ValueError):
        servico.validar(tipo, bruto)


def test_pedido_leva_conversa_e_material_como_dados():
    pedido = servico._montar_pedido(
        "flashcards", {"serie": "6º ano"}, "Ciências", HISTORICO, [{"nome": "aula.pdf", "texto": "Clorofila é verde."}]
    )

    assert "Ciências" in pedido and "6º ano" in pedido
    assert "Estudante: Me explica o que é fotossíntese" in pedido
    assert "Up: É como a planta" in pedido
    assert "[aula.pdf]" in pedido and "Clorofila é verde." in pedido


def test_conversa_longa_fica_com_as_mensagens_mais_recentes():
    historico = [{"role": "user", "content": f"mensagem {i} " + "x" * 400} for i in range(100)]

    conversa = servico._conversa(historico)

    assert len(conversa) <= servico.MAX_CHARS_CONVERSA + 500
    assert "mensagem 99" in conversa and "mensagem 0 " not in conversa


# ---------- API (IA mockada) ----------

@pytest.mark.parametrize("tipo,bruto,campo", [
    ("flashcards", {"titulo": "Fotossíntese", **FICHAS_DA_IA}, "cartoes"),
    ("mapa", {"titulo": "Fotossíntese", **MAPA_DA_IA}, "mapa"),
    ("dinamicas", DINAMICAS_DA_IA, "dinamicas"),
])
def test_gera_o_material_da_conversa(usuario_teste, tipo, bruto, campo):
    with patch("app.services.ia.gerar_json", return_value=bruto) as mock_ia:
        resposta = client.post(
            "/chat/estudo",
            json={"tipo": tipo, "materia": "Ciências", "historico": HISTORICO},
            headers=usuario_teste["headers"],
        )

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["tipo"] == tipo and corpo["titulo"] == "Fotossíntese" and corpo[campo]
    assert "fotossíntese" in mock_ia.call_args.args[1]       # a conversa chegou no pedido


def test_sem_conversa_nem_material_da_422(usuario_teste):
    resposta = client.post("/chat/estudo", json={"tipo": "mapa"}, headers=usuario_teste["headers"])

    assert resposta.status_code == 422


def test_so_com_material_anexado_funciona(usuario_teste):
    with patch("app.services.ia.gerar_json", return_value=DINAMICAS_DA_IA):
        resposta = client.post(
            "/chat/estudo",
            json={"tipo": "dinamicas", "material": [{"nome": "aula.pdf", "texto": "Texto da aula"}]},
            headers=usuario_teste["headers"],
        )

    assert resposta.status_code == 200, resposta.text


def test_tipo_invalido_da_422(usuario_teste):
    resposta = client.post(
        "/chat/estudo", json={"tipo": "quiz", "historico": HISTORICO}, headers=usuario_teste["headers"]
    )

    assert resposta.status_code == 422


def test_ia_devolvendo_lixo_da_502(usuario_teste):
    with patch("app.services.ia.gerar_json", return_value={"cartoes": []}):
        resposta = client.post(
            "/chat/estudo", json={"tipo": "flashcards", "historico": HISTORICO}, headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 502


def test_sem_ia_configurada_da_503(usuario_teste):
    with patch("app.services.ia.gerar_json", side_effect=RuntimeError("GROQ_API_KEY não configurada.")):
        resposta = client.post(
            "/chat/estudo", json={"tipo": "mapa", "historico": HISTORICO}, headers=usuario_teste["headers"]
        )

    assert resposta.status_code == 503


def test_estudo_exige_login():
    assert client.post("/chat/estudo", json={"tipo": "mapa", "historico": HISTORICO}).status_code in (401, 403)
