from unittest.mock import patch

import pytest

from app.services import mapa as servico
from tests.conftest import client

DIAS = ["2026-09-21", "2026-09-22"]

MAPA_DA_IA = {
    "resumo": "Você vai aprender a somar e comparar frações, um passo de cada vez.",
    "ramos": [
        {"titulo": "O que é uma fração", "pontos": ["Numerador e denominador", "Partes de um todo"]},
        {"titulo": "Frações equivalentes", "pontos": ["Multiplicar em cima e embaixo"]},
        {"titulo": "Somar frações", "pontos": ["Achar o MMC", "Somar os numeradores"]},
        {"titulo": "Comparar frações", "pontos": ["Deixar o mesmo denominador"]},
    ],
    "etapas": [
        {"dia": "2026-09-21", "meta": "Explicar o que é numerador e denominador"},
        {"dia": "2026-09-22", "meta": "Somar frações com o mesmo denominador"},
        {"dia": "2099-01-01", "meta": "Dia que não existe no plano"},
    ],
    "estrategias": ["Desenhe cada fração em uma barrinha", "Estude em blocos de 20 minutos"],
    "perguntas": ["Como eu sei qual fração é maior?", "Por que preciso do MMC?"],
    "mensagem": "Belle, um passo pequeno por dia já conta!",
}


# ---------- funções puras ----------

def test_validar_mapa_aceita_o_formato_combinado():
    mapa = servico.validar_mapa(MAPA_DA_IA, DIAS)

    assert len(mapa["ramos"]) == 4
    assert mapa["ramos"][2]["pontos"] == ["Achar o MMC", "Somar os numeradores"]
    assert mapa["gerado_em"] is not None


def test_validar_mapa_descarta_meta_de_dia_que_nao_existe():
    mapa = servico.validar_mapa(MAPA_DA_IA, DIAS)

    assert [e["dia"] for e in mapa["etapas"]] == DIAS


def test_validar_mapa_corta_textos_e_listas_gigantes():
    bruto = dict(MAPA_DA_IA)
    bruto["ramos"] = [{"titulo": "T" * 300, "pontos": ["p " * 200] * 10} for _ in range(20)]
    bruto["estrategias"] = ["e"] * 30
    bruto["perguntas"] = ["q"] * 30

    mapa = servico.validar_mapa(bruto, DIAS)

    assert len(mapa["ramos"]) == servico.MAX_RAMOS
    assert all(len(r["titulo"]) <= servico.TAMANHO_TITULO_RAMO + 3 for r in mapa["ramos"])
    assert all(len(r["pontos"]) <= servico.MAX_PONTOS_POR_RAMO for r in mapa["ramos"])
    assert all(len(p) <= servico.TAMANHO_PONTO + 3 for r in mapa["ramos"] for p in r["pontos"])
    assert len(mapa["estrategias"]) == servico.MAX_ESTRATEGIAS
    assert len(mapa["perguntas"]) == servico.MAX_PERGUNTAS


def test_validar_mapa_ignora_lixo_dentro_das_listas():
    bruto = dict(MAPA_DA_IA)
    bruto["ramos"] = ["texto solto", None, {"titulo": ""}] + MAPA_DA_IA["ramos"]
    bruto["etapas"] = [None, "x", {"dia": "2026-09-21"}, {"dia": "2026-09-21", "meta": "Meta boa"}]

    mapa = servico.validar_mapa(bruto, DIAS)

    assert len(mapa["ramos"]) == 4
    assert mapa["etapas"] == [{"dia": "2026-09-21", "meta": "Meta boa"}]


@pytest.mark.parametrize("bruto", [None, "texto", [], {}, {"ramos": []}, {"ramos": [{"titulo": "Só um"}]}])
def test_validar_mapa_sem_o_minimo_levanta_erro(bruto):
    with pytest.raises(ValueError):
        servico.validar_mapa(bruto, DIAS)


def test_pedido_usa_o_jeito_de_estudar_do_estudante():
    plano = {
        "titulo": "Frações", "materia": "Matemática", "conteudo": "Frações", "objetivo": "ir bem na prova",
        "data_avaliacao": "2026-09-25",
        "tarefas": [{"titulo": "Ler resumo", "tipo": "estudo", "duracao_min": 20, "dia": "2026-09-21"}],
    }

    pedido = servico._montar_pedido(
        "Belle Souza", {"serie": "6º ano", "estilo_aprendizagem": "mnemonica", "duracao_sessao": "curta", "modo_uso": "audio"},
        plano, ["2026-09-21"],
    )

    assert "Belle." in pedido and "Souza" not in pedido      # só o primeiro nome
    assert "6º ano" in pedido
    assert "truques de memorização" in pedido
    assert "sessões curtas" in pedido
    assert "ouvir" in pedido
    assert "2026-09-21: Estudo: Ler resumo (20 min)" in pedido


# ---------- API (IA mockada) ----------

PLANO_DA_IA = {
    "titulo": "Frações sem medo",
    "tarefas": [
        {"titulo": "Entender numerador e denominador", "tipo": "estudo", "duracao_min": 20},
        {"titulo": "Exercícios de frações", "tipo": "exercicio", "duracao_min": 20},
        {"titulo": "Revisão final", "tipo": "revisao", "duracao_min": 15},
    ],
}


def criar_plano(usuario):
    with patch("app.services.ia.gerar_json", return_value=PLANO_DA_IA):
        resposta = client.post(
            "/planos/gerar",
            json={"materia": "Matemática", "conteudo": "Frações", "minutos_por_dia": 30, "dificuldade": "media"},
            headers=usuario["headers"],
        )

    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def mapa_com_os_dias_do_plano(plano):
    dias = sorted({t["dia"] for t in plano["tarefas"]})
    bruto = dict(MAPA_DA_IA)
    bruto["etapas"] = [{"dia": d, "meta": f"Meta do dia {i + 1}"} for i, d in enumerate(dias)]
    return bruto


def test_gera_e_guarda_o_mapa_no_plano(usuario_teste):
    plano = criar_plano(usuario_teste)
    assert plano["mapa"] is None

    with patch("app.services.ia.gerar_json", return_value=mapa_com_os_dias_do_plano(plano)) as mock_ia:
        resposta = client.post(f"/planos/{plano['id']}/mapa", headers=usuario_teste["headers"])

    assert resposta.status_code == 200, resposta.text
    mapa = resposta.json()
    assert len(mapa["ramos"]) == 4 and mapa["etapas"] and mapa["gerado_em"]

    # O pedido leva os dados do plano e do estudante (e só isso).
    pedido = mock_ia.call_args.args[1]
    assert "Frações" in pedido and "Usuário" in pedido

    # Fica guardado: aparece na listagem sem gastar IA de novo.
    lista = client.get("/planos/", headers=usuario_teste["headers"]).json()
    assert lista[0]["mapa"]["ramos"][0]["titulo"] == "O que é uma fração"


def test_editar_o_plano_nao_apaga_o_mapa(usuario_teste):
    plano = criar_plano(usuario_teste)

    with patch("app.services.ia.gerar_json", return_value=mapa_com_os_dias_do_plano(plano)):
        client.post(f"/planos/{plano['id']}/mapa", headers=usuario_teste["headers"])

    tarefas = plano["tarefas"]
    tarefas[0]["concluida"] = True
    editado = client.put(
        f"/planos/{plano['id']}",
        json={"titulo": plano["titulo"], "pausado": False, "tarefas": tarefas},
        headers=usuario_teste["headers"],
    )

    assert editado.status_code == 200
    assert editado.json()["mapa"] is not None


def test_mapa_de_plano_inexistente_da_404(usuario_teste):
    resposta = client.post("/planos/nao-existe/mapa", headers=usuario_teste["headers"])

    assert resposta.status_code == 404


def test_mapa_exige_login():
    assert client.post("/planos/qualquer/mapa").status_code in (401, 403)


def test_mapa_com_ia_devolvendo_lixo_da_502_e_nao_salva(usuario_teste):
    plano = criar_plano(usuario_teste)

    with patch("app.services.ia.gerar_json", return_value={"ramos": []}):
        resposta = client.post(f"/planos/{plano['id']}/mapa", headers=usuario_teste["headers"])

    assert resposta.status_code == 502
    assert client.get(f"/planos/{plano['id']}", headers=usuario_teste["headers"]).json()["mapa"] is None


def test_mapa_sem_ia_configurada_da_503(usuario_teste):
    plano = criar_plano(usuario_teste)

    with patch("app.services.ia.gerar_json", side_effect=RuntimeError("GROQ_API_KEY não configurada.")):
        resposta = client.post(f"/planos/{plano['id']}/mapa", headers=usuario_teste["headers"])

    assert resposta.status_code == 503


def test_mapa_nao_e_acessivel_por_outro_usuario(usuario_teste):
    plano = criar_plano(usuario_teste)

    from tests.conftest import email_aleatorio
    outro = client.post("/auth/registrar", json={
        "nome": "Outra Pessoa", "email": email_aleatorio(), "aceitou_termos": True, "senha": "senha1234",
        "pergunta_seguranca": "Qual a cidade onde você nasceu?", "resposta_seguranca": "Recife",
    }).json()

    try:
        with patch("app.services.ia.gerar_json", return_value=mapa_com_os_dias_do_plano(plano)):
            resposta = client.post(
                f"/planos/{plano['id']}/mapa", headers={"Authorization": f"Bearer {outro['access_token']}"}
            )

        assert resposta.status_code == 404
    finally:
        client.delete(f"/usuarios/{outro['uid']}", headers={"Authorization": f"Bearer {outro['access_token']}"})
