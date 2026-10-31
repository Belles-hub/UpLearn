"""Números do painel de desempenho que vêm de tarefas e exercícios reais.

Tudo aqui é função pura (recebe listas, devolve dicionários) — não chama IA
nem banco, então dá pra testar sem nenhuma dependência externa.
"""

# Abaixo disso a taxa de acerto de uma matéria vira "vale revisar". É só uma
# sugestão de estudo, nunca uma nota nem um julgamento sobre o estudante.
LIMITE_REVISAR = 60


def resumir_exercicios(exercicios: list[dict]) -> list[dict]:
    """Agrupa os quizzes por matéria. A taxa só existe porque há questões
    avaliadas de verdade — sem exercício, a matéria simplesmente não aparece."""
    por_materia: dict[str, dict] = {}

    for exercicio in exercicios:
        chave = exercicio["materia"].strip().lower()
        item = por_materia.setdefault(chave, {
            "materia": exercicio["materia"].strip(),
            "exercicios": 0,
            "questoes": 0,
            "acertos": 0,
        })

        item["exercicios"] += 1
        item["questoes"] += exercicio["total"]
        item["acertos"] += exercicio["acertos"]

    resumo = []

    for item in por_materia.values():
        taxa = round(100 * item["acertos"] / item["questoes"]) if item["questoes"] else 0

        resumo.append({
            **item,
            "taxa_acerto": taxa,
            "precisa_revisar": taxa < LIMITE_REVISAR,
        })

    resumo.sort(key=lambda m: m["exercicios"], reverse=True)

    return resumo


def resumir_planos(planos: list[dict]) -> dict:
    tarefas = [t for plano in planos for t in plano.get("tarefas", [])]
    concluidas = [t for t in tarefas if t.get("concluida")]

    return {
        "planos": len(planos),
        "tarefas_total": len(tarefas),
        "tarefas_concluidas": len(concluidas),
        # Pausa não conta como tempo de estudo.
        "minutos_estudados": sum(
            t.get("duracao_min", 0) for t in concluidas if t.get("tipo") != "pausa"
        ),
    }


def calcular_conquistas(
    total_perguntas: int,
    dias_ativos_ultima_semana: int,
    progresso_planos: dict,
    exercicios: list[dict],
) -> list[dict]:
    """Conquistas por esforço e prática. Só se ganha — nunca se perde —, e
    não existe ranking: cada uma compara a pessoa só com ela mesma."""
    algum_quiz_perfeito = any(
        e["total"] >= 3 and e["acertos"] == e["total"] for e in exercicios
    )

    definicoes = [
        ("primeira_conversa", "Primeira conversa",
         "Você conversou com o Up pela primeira vez.",
         total_perguntas >= 1),
        ("primeiro_plano", "Plano criado",
         "Você montou seu primeiro plano de estudos.",
         progresso_planos["planos"] >= 1),
        ("primeira_tarefa", "Primeiro passo",
         "Você concluiu sua primeira tarefa de estudo.",
         progresso_planos["tarefas_concluidas"] >= 1),
        ("dez_tarefas", "Constância",
         "Você concluiu 10 tarefas de estudo.",
         progresso_planos["tarefas_concluidas"] >= 10),
        ("primeiro_quiz", "Hora de praticar",
         "Você terminou seu primeiro quiz.",
         len(exercicios) >= 1),
        ("quiz_perfeito", "Mandou bem!",
         "Você acertou todas as questões de um quiz.",
         algum_quiz_perfeito),
        ("tres_dias", "Ritmo bom",
         "Você estudou em 3 dias diferentes na mesma semana.",
         dias_ativos_ultima_semana >= 3),
    ]

    return [
        {"id": id_, "titulo": titulo, "descricao": descricao, "conquistada": bool(feito)}
        for id_, titulo, descricao, feito in definicoes
    ]
