from unittest.mock import patch

import pytest

from app.services import fichas as servico
from tests.conftest import client
from tests.test_mapa import criar_plano

FICHAS_DA_IA = {
    "resumo": [
        {"titulo": "O que é uma fração", "pontos": ["Numerador e denominador", "Partes de um todo"]},
        {"titulo": "Frações equivalentes", "pontos": ["Multiplicar em cima e embaixo"]},
        {"titulo": "Somar frações", "pontos": ["Achar o MMC", "Somar os numeradores"]},
    ],
    "cartoes": [{"frente": f"Pergunta {i}?", "verso": f"Resposta {i}"} for i in range(8)],
}


# ---------- funções puras ----------

def test_validar_fichas_aceita_o_formato_combinado():
    fichas = servico.validar_fichas(FICHAS_DA_IA)

    assert len(fichas["resumo"]) == 3
    assert len(fichas["cartoes"]) == 8
    assert fichas["cartoes"][0] == {"frente": "Pergunta 0?", "verso": "Resposta 0"}
    assert fichas["gerado_em"] is not None


def test_validar_fichas_corta_textos_e_listas_gigantes():
    bruto = {
        "resumo": [{"titulo": "T" * 300, "pontos": ["p " * 200] * 10} for _ in range(20)],
        "cartoes": [{"frente": "f " * 200, "verso": "v " * 200} for _ in range(50)],
    }

    fichas = servico.validar_fichas(bruto)

    assert len(fichas["resumo"]) == servico.MAX_TOPICOS
    assert all(len(t["titulo"]) <= servico.TAMANHO_TITULO_TOPICO + 3 for t in fichas["resumo"])
    assert all(len(t["pontos"]) <= servico.MAX_PONTOS_POR_TOPICO for t in fichas["resumo"])
    assert all(len(p) <= servico.TAMANHO_PONTO + 3 for t in fichas["resumo"] for p in t["pontos"])
    assert len(fichas["cartoes"]) == servico.MAX_CARTOES
    assert all(len(c["frente"]) <= servico.TAMANHO_FRENTE + 3 for c in fichas["cartoes"])
    assert all(len(c["verso"]) <= servico.TAMANHO_VERSO + 3 for c in fichas["cartoes"])


def test_validar_fichas_ignora_lixo_dentro_das_listas():
    bruto = {
        "resumo": ["solto", None, {"titulo": "", "pontos": ["x"]}, {"titulo": "Sem pontos"}] + FICHAS_DA_IA["resumo"],
        "cartoes": [None, "x", {"frente": "só frente"}, {"verso": "só verso"}] + FICHAS_DA_IA["cartoes"],
    }

    fichas = servico.validar_fichas(bruto)

    assert len(fichas["resumo"]) == 3
    assert len(fichas["cartoes"]) == 8


@pytest.mark.parametrize("bruto", [
    None, "texto", [], {},
    {"resumo": FICHAS_DA_IA["resumo"]},                                        # sem cartões
    {"cartoes": FICHAS_DA_IA["cartoes"]},                                      # sem resumo
    {"resumo": FICHAS_DA_IA["resumo"], "cartoes": FICHAS_DA_IA["cartoes"][:3]},  # cartões de menos
])
def test_validar_fichas_sem_o_minimo_levanta_erro(bruto):
    with pytest.raises(ValueError):
        servico.validar_fichas(bruto)


def test_pedido_usa_o_jeito_de_estudar_do_estudante():
    plano = {"titulo": "Frações", "materia": "Matemática", "conteudo": "Frações", "objetivo": "ir bem na prova"}

    pedido = servico._montar_pedido({"serie": "6º ano", "estilo_aprendizagem": "mnemonica"}, plano)

    assert "Matemática" in pedido and "ir bem na prova" in pedido
    assert "6º ano" in pedido
    assert "truques de memorização" in pedido


# ---------- API (IA mockada) ----------

def test_gera_e_guarda_as_fichas_no_plano(usuario_teste):
    plano = criar_plano(usuario_teste)
    assert plano["fichas"] is None

    with patch("app.services.ia.gerar_json", return_value=FICHAS_DA_IA):
        resposta = client.post(f"/planos/{plano['id']}/fichas", headers=usuario_teste["headers"])

    assert resposta.status_code == 200, resposta.text
    assert len(resposta.json()["cartoes"]) == 8

    lista = client.get("/planos/", headers=usuario_teste["headers"]).json()
    assert lista[0]["fichas"]["resumo"][0]["titulo"] == "O que é uma fração"


def test_fichas_com_ia_devolvendo_lixo_da_502_e_nao_salva(usuario_teste):
    plano = criar_plano(usuario_teste)

    with patch("app.services.ia.gerar_json", return_value={"resumo": []}):
        resposta = client.post(f"/planos/{plano['id']}/fichas", headers=usuario_teste["headers"])

    assert resposta.status_code == 502
    assert client.get(f"/planos/{plano['id']}", headers=usuario_teste["headers"]).json()["fichas"] is None


def test_fichas_de_plano_inexistente_da_404(usuario_teste):
    assert client.post("/planos/nao-existe/fichas", headers=usuario_teste["headers"]).status_code == 404


def test_fichas_exige_login():
    assert client.post("/planos/qualquer/fichas").status_code in (401, 403)
