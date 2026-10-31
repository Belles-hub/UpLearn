from datetime import date, datetime, timezone
from unittest.mock import patch

from app.services import analise, desempenho
from tests.conftest import client

# ---------- métricas de conversa (função pura) ----------


def _pergunta(dia: int, hora: int = 15):
    return {
        "role": "user",
        "content": "pergunta",
        "criado_em": datetime(2026, 9, dia, hora + 3, 0, tzinfo=timezone.utc),  # UTC -> Brasil (-3h)
    }


def test_metricas_contam_so_perguntas_e_dias():
    mensagens = [_pergunta(10), _pergunta(10), {"role": "assistant", "content": "r", "criado_em": None}, _pergunta(12)]

    metricas = analise.calcular_metricas(mensagens, hoje=date(2026, 9, 12))

    assert metricas["total_perguntas"] == 3
    assert metricas["dias_ativos"] == 2
    assert metricas["primeira_conversa"] == "2026-09-10"
    assert metricas["ultima_conversa"] == "2026-09-12"
    assert len(metricas["atividade_por_dia"]) == analise.DIAS_NO_GRAFICO
    # Dia sem conversa aparece com zero, não some do gráfico.
    assert metricas["atividade_por_dia"][-2]["perguntas"] == 0
    assert metricas["atividade_por_dia"][-1]["perguntas"] == 1


def test_dias_ativos_na_ultima_semana_ignora_dias_antigos():
    mensagens = [_pergunta(1), _pergunta(9), _pergunta(11), _pergunta(12)]

    metricas = analise.calcular_metricas(mensagens, hoje=date(2026, 9, 12))

    assert metricas["dias_ativos"] == 4
    assert metricas["dias_ativos_ultima_semana"] == 3


def test_matérias_inventadas_pela_ia_viram_outros():
    materias = analise._contar_materias(["matematica", "matematica", "quimica_quantica", 7, "portugues"])

    assert materias == [
        {"id": "matematica", "nome": "Matemática", "perguntas": 2},
        {"id": "portugues", "nome": "Português", "perguntas": 1},
        {"id": "outros", "nome": "Outros assuntos", "perguntas": 1},
    ]


def test_recomendacoes_sao_limpas_e_limitadas():
    bruto = [
        {"titulo": "Frações", "motivo": "Você perguntou sobre 1/2."},
        {"titulo": "frações", "motivo": "repetida"},
        {"titulo": "", "motivo": "sem título"},
        "lixo",
        {"titulo": "Verbos", "motivo": "x"},
        {"titulo": "Mapas", "motivo": "x"},
        {"titulo": "Extra", "motivo": "x"},
    ]

    resultado = analise._validar_recomendacoes(bruto)

    assert [r["titulo"] for r in resultado] == ["Frações", "Verbos", "Mapas"]


# ---------- exercícios, planos e conquistas (funções puras) ----------

def test_taxa_de_acerto_por_materia():
    exercicios = [
        {"materia": "Matemática", "conteudo": "a", "total": 5, "acertos": 2},
        {"materia": "matemática", "conteudo": "b", "total": 5, "acertos": 4},
        {"materia": "Português", "conteudo": "c", "total": 4, "acertos": 4},
    ]

    resumo = {m["materia"]: m for m in desempenho.resumir_exercicios(exercicios)}

    assert resumo["Matemática"]["exercicios"] == 2
    assert resumo["Matemática"]["taxa_acerto"] == 60     # 6 de 10
    assert resumo["Matemática"]["precisa_revisar"] is False
    assert resumo["Português"]["taxa_acerto"] == 100


def test_materia_com_poucos_acertos_pede_revisao():
    resumo = desempenho.resumir_exercicios([{"materia": "Física", "conteudo": "x", "total": 10, "acertos": 3}])

    assert resumo[0]["precisa_revisar"] is True


def test_sem_exercicios_nao_ha_materias():
    assert desempenho.resumir_exercicios([]) == []


def test_progresso_dos_planos_nao_conta_pausa_como_estudo():
    planos = [{"tarefas": [
        {"tipo": "estudo", "duracao_min": 20, "concluida": True},
        {"tipo": "pausa", "duracao_min": 5, "concluida": True},
        {"tipo": "exercicio", "duracao_min": 15, "concluida": False},
    ]}]

    assert desempenho.resumir_planos(planos) == {
        "planos": 1, "tarefas_total": 3, "tarefas_concluidas": 2, "minutos_estudados": 20,
    }


def test_conquistas_so_sao_ganhas_com_dados_reais():
    vazio = desempenho.calcular_conquistas(
        0, 0, {"planos": 0, "tarefas_total": 0, "tarefas_concluidas": 0, "minutos_estudados": 0}, []
    )

    assert not any(c["conquistada"] for c in vazio)

    cheio = desempenho.calcular_conquistas(
        4, 3,
        {"planos": 1, "tarefas_total": 12, "tarefas_concluidas": 10, "minutos_estudados": 200},
        [{"materia": "Matemática", "conteudo": "x", "total": 5, "acertos": 5}],
    )

    assert all(c["conquistada"] for c in cheio)


# ---------- API ----------

def test_desempenho_de_conta_nova_vem_vazio_e_sem_chamar_ia(usuario_teste):
    with patch("app.services.ia.gerar_json") as ia:
        resposta = client.get("/desempenho/", headers=usuario_teste["headers"])

    assert resposta.status_code == 200, resposta.text

    painel = resposta.json()

    assert painel["total_perguntas"] == 0
    assert painel["materias_exercicios"] == []
    assert painel["progresso_planos"]["tarefas_total"] == 0
    assert painel["resumo"] is None
    assert not any(c["conquistada"] for c in painel["conquistas"])
    ia.assert_not_called()


def test_desempenho_continua_com_numeros_se_a_ia_falhar(usuario_teste):
    with patch("app.services.ia.gerar_resposta", return_value="ok"):
        client.post("/chat/", json={"mensagem": "o que é fração?", "historico": []}, headers=usuario_teste["headers"])

    with patch("app.services.ia.gerar_json", side_effect=RuntimeError("sem chave")):
        resposta = client.get("/desempenho/", headers=usuario_teste["headers"])

    assert resposta.status_code == 200

    painel = resposta.json()

    assert painel["analise_disponivel"] is False
    assert painel["total_perguntas"] == 1


def test_desempenho_exige_autenticacao():
    assert client.get("/desempenho/").status_code == 401


def test_resumo_rapido_nao_usa_ia(usuario_teste):
    with patch("app.services.ia.gerar_json") as ia:
        resposta = client.get("/desempenho/rapido", headers=usuario_teste["headers"])

    assert resposta.status_code == 200, resposta.text

    corpo = resposta.json()

    assert corpo["total_perguntas"] == 0
    assert corpo["exercicios_total"] == 0
    assert len(corpo["atividade_por_dia"]) == analise.DIAS_NO_GRAFICO
    ia.assert_not_called()
