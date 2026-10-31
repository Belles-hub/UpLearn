from datetime import date
from unittest.mock import patch

from app.services import planos as servico
from tests.conftest import client

# ---------- funções puras (não usam IA nem banco) ----------


def test_validar_tarefas_descarta_lixo_e_limita_tempo():
    bruto = [
        {"titulo": "Ler sobre frações", "tipo": "estudo", "duracao_min": 25},
        {"titulo": "", "tipo": "estudo", "duracao_min": 10},          # sem título
        "não é um dicionário",
        {"titulo": "Tipo inventado", "tipo": "hackear", "duracao_min": "abc"},
        {"titulo": "Tarefa gigante", "tipo": "exercicio", "duracao_min": 999},
    ]

    tarefas = servico.validar_tarefas(bruto, minutos_por_dia=30)

    assert [t["titulo"] for t in tarefas] == ["Ler sobre frações", "Tipo inventado", "Tarefa gigante"]
    assert tarefas[1]["tipo"] == "estudo"       # tipo inválido vira "estudo"
    assert tarefas[1]["duracao_min"] == 20      # duração ilegível vira o padrão
    assert tarefas[2]["duracao_min"] == 30      # nunca passa do tempo do dia
    assert all(t["concluida"] is False and t["id"] for t in tarefas)


def test_validar_tarefas_limita_a_quantidade():
    bruto = [{"titulo": f"Tarefa {i}", "tipo": "estudo", "duracao_min": 10} for i in range(50)]

    assert len(servico.validar_tarefas(bruto, 30)) == servico.MAX_TAREFAS


def test_validar_tarefas_com_entrada_que_nao_e_lista():
    assert servico.validar_tarefas(None, 30) == []
    assert servico.validar_tarefas({"titulo": "x"}, 30) == []


def test_distribuir_dias_nao_passa_do_tempo_diario():
    tarefas = [
        {"duracao_min": 20}, {"duracao_min": 20}, {"duracao_min": 20},
        {"duracao_min": 30}, {"duracao_min": 10},
    ]

    servico.distribuir_dias(tarefas, minutos_por_dia=40, inicio=date(2026, 9, 1))

    assert [t["dia"] for t in tarefas] == [
        "2026-09-01", "2026-09-01",   # 20 + 20 = 40
        "2026-09-02",                 # 20 (30 não cabe junto)
        "2026-09-03", "2026-09-03",   # 30 + 10 = 40
    ]


# ---------- API (IA mockada) ----------

PLANO_DA_IA = {
    "titulo": "Frações sem medo",
    "tarefas": [
        {"titulo": "Entender numerador e denominador", "tipo": "estudo", "duracao_min": 20},
        {"titulo": "Pausa rápida", "tipo": "pausa", "duracao_min": 5},
        {"titulo": "Exercícios de frações", "tipo": "exercicio", "duracao_min": 20},
        {"titulo": "Revisão final", "tipo": "revisao", "duracao_min": 15},
    ],
}

PEDIDO = {"materia": "Matemática", "conteudo": "Frações", "minutos_por_dia": 30}


def _gerar(usuario_teste, pedido=PEDIDO, retorno=PLANO_DA_IA):
    with patch("app.services.ia.gerar_json", return_value=retorno):
        return client.post("/planos/gerar", json=pedido, headers=usuario_teste["headers"])


def test_gerar_editar_e_apagar_plano(usuario_teste):
    resposta = _gerar(usuario_teste)

    assert resposta.status_code == 200, resposta.text

    plano = resposta.json()

    assert plano["titulo"] == "Frações sem medo"
    assert len(plano["tarefas"]) == 4
    # Nenhum dia passa de 30 minutos, mesmo somando as tarefas todas.
    por_dia = {}
    for t in plano["tarefas"]:
        por_dia[t["dia"]] = por_dia.get(t["dia"], 0) + t["duracao_min"]
    assert max(por_dia.values()) <= 30

    # Editar: marcar a primeira como feita, remover a última, adicionar uma nova.
    tarefas = plano["tarefas"][:-1]
    tarefas[0]["concluida"] = True
    tarefas.append({"id": "minha-tarefa", "titulo": "Minha tarefa", "tipo": "estudo", "duracao_min": 10})

    editado = client.put(
        f"/planos/{plano['id']}",
        json={"titulo": "Meu plano", "pausado": True, "tarefas": tarefas},
        headers=usuario_teste["headers"]
    )

    assert editado.status_code == 200, editado.text
    assert editado.json()["titulo"] == "Meu plano"
    assert editado.json()["pausado"] is True
    assert editado.json()["tarefas"][0]["concluida"] is True
    assert editado.json()["tarefas"][-1]["titulo"] == "Minha tarefa"

    lista = client.get("/planos/", headers=usuario_teste["headers"]).json()

    assert [p["id"] for p in lista] == [plano["id"]]

    apagado = client.delete(f"/planos/{plano['id']}", headers=usuario_teste["headers"])

    assert apagado.status_code == 200
    assert client.get(f"/planos/{plano['id']}", headers=usuario_teste["headers"]).status_code == 404


def test_plano_de_outra_pessoa_nao_aparece(usuario_teste):
    # Planos ficam dentro do documento de quem os criou: o uid vem do token,
    # então não existe como pedir o plano de outra conta por id.
    plano = _gerar(usuario_teste).json()

    outro = client.get(f"/planos/{plano['id']}")

    assert outro.status_code == 401


def test_plano_com_ia_sem_tarefas_uteis_da_502(usuario_teste):
    resposta = _gerar(usuario_teste, retorno={"titulo": "x", "tarefas": [{"titulo": ""}]})

    assert resposta.status_code == 502
    assert client.get("/planos/", headers=usuario_teste["headers"]).json() == []


def test_plano_com_ia_fora_do_ar_da_503(usuario_teste):
    with patch("app.services.ia.gerar_json", side_effect=RuntimeError("GROQ_API_KEY não configurada.")):
        resposta = client.post("/planos/gerar", json=PEDIDO, headers=usuario_teste["headers"])

    assert resposta.status_code == 503


def test_pedido_de_plano_com_tempo_excessivo_da_422(usuario_teste):
    # O teto de minutos por dia existe pra o app não incentivar estudo em excesso.
    resposta = _gerar(usuario_teste, pedido={**PEDIDO, "minutos_por_dia": 600})

    assert resposta.status_code == 422


def test_data_da_avaliacao_invalida_da_422(usuario_teste):
    resposta = _gerar(usuario_teste, pedido={**PEDIDO, "data_avaliacao": "amanhã"})

    assert resposta.status_code == 422


def test_planos_exigem_autenticacao():
    assert client.get("/planos/").status_code == 401
    assert client.post("/planos/gerar", json=PEDIDO).status_code == 401
