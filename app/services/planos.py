"""Geração do plano de estudos.

Divisão de responsabilidade, igual à do desempenho: a IA só sugere a LISTA
de tarefas (títulos, tipos e duração). Quem decide quantas cabem por dia,
limita o tempo de estudo e distribui os dias é este módulo, em Python — assim
o plano nunca passa do tempo que a pessoa disse ter e não incentiva estudo em
excesso, mesmo que a IA exagere.
"""

from datetime import date, timedelta

from app import crud_firebase
from app.services import ia

TIPOS_VALIDOS = ("estudo", "exercicio", "revisao", "pausa")

MAX_TAREFAS = 16
# Quantos minutos seguidos de estudo antes de sugerir uma pausa.
MINUTOS_MAXIMOS_POR_TAREFA = 40

INSTRUCOES_PLANO = (
    "Você é o Up, tutor de estudos da UpLearn, e monta planos de estudo realistas "
    "para crianças e adolescentes. Responda SEMPRE em JSON válido, em português "
    "do Brasil, sem nenhum texto fora do JSON."
)

DIFICULDADE_TEXTO = {
    "facil": "sente que o assunto é fácil",
    "media": "sente que o assunto tem dificuldade média",
    "dificil": "sente que o assunto é difícil",
}


def _montar_pedido(dados, preferencias: dict) -> str:
    partes = [
        f"Matéria: {dados.materia}.",
        f"Conteúdo que o estudante quer aprender: {dados.conteudo}.",
        f"O estudante {DIFICULDADE_TEXTO[dados.dificuldade]}.",
        f"Tempo disponível por dia: {dados.minutos_por_dia} minutos.",
    ]

    if dados.objetivo:
        partes.append(f"Objetivo: {dados.objetivo}.")

    if dados.data_avaliacao:
        partes.append(f"Data da avaliação: {dados.data_avaliacao}.")

    if preferencias.get("serie"):
        partes.append(f"Série: {preferencias['serie']}.")

    if preferencias.get("duracao_sessao") == "curta":
        partes.append("Ele prefere sessões curtas: prefira tarefas de 10 a 20 minutos.")

    return (
        "\n".join(partes)
        + "\n\nMonte um plano com tarefas pequenas e alcançáveis. Devolva um JSON "
        'com as chaves:\n- "titulo": um título curto e motivador para o plano.\n'
        '- "tarefas": uma lista de 6 a 12 objetos, em ordem, cada um com '
        '"titulo" (curto e concreto, em até 90 caracteres), "tipo" (exatamente um '
        'de: "estudo", "exercicio", "revisao", "pausa") e "duracao_min" (inteiro).\n\n'
        "Regras: comece pelo mais básico e avance aos poucos; alterne estudo e "
        "exercícios; inclua pelo menos uma revisão perto do fim e pausas curtas "
        "(5 a 10 minutos) entre blocos longos; nenhuma tarefa pode passar de "
        f"{min(dados.minutos_por_dia, MINUTOS_MAXIMOS_POR_TAREFA)} minutos; não "
        "incentive estudar demais nem use frases que causem culpa."
    )


def validar_tarefas(bruto, minutos_por_dia: int) -> list[dict]:
    """Aceita só o que tem cara de tarefa de verdade e força os limites —
    a IA pode devolver tipo inventado, duração absurda ou lista enorme."""
    if not isinstance(bruto, list):
        return []

    limite_por_tarefa = min(minutos_por_dia, MINUTOS_MAXIMOS_POR_TAREFA)
    tarefas = []

    for item in bruto:
        if not isinstance(item, dict):
            continue

        titulo = str(item.get("titulo", "")).strip()[:120]

        if not titulo:
            continue

        tipo = item.get("tipo")

        if tipo not in TIPOS_VALIDOS:
            tipo = "estudo"

        try:
            duracao = int(item.get("duracao_min", 20))
        except (TypeError, ValueError):
            duracao = 20

        duracao = max(5, min(duracao, limite_por_tarefa))

        tarefas.append({
            "id": crud_firebase.novo_id_tarefa(),
            "titulo": titulo,
            "tipo": tipo,
            "duracao_min": duracao,
            "dia": None,
            "concluida": False,
        })

        if len(tarefas) >= MAX_TAREFAS:
            break

    return tarefas


def distribuir_dias(tarefas: list[dict], minutos_por_dia: int, inicio: date) -> list[dict]:
    """Preenche um dia de cada vez sem passar do tempo disponível; quando
    o dia enche, a tarefa vai pro dia seguinte."""
    dia = inicio
    usado = 0

    for tarefa in tarefas:
        if usado > 0 and usado + tarefa["duracao_min"] > minutos_por_dia:
            dia += timedelta(days=1)
            usado = 0

        tarefa["dia"] = dia.isoformat()
        usado += tarefa["duracao_min"]

    return tarefas


def gerar_plano(dados, preferencias: dict, hoje: date) -> dict:
    """Devolve {"titulo", "tarefas"} pronto pra salvar. Levanta ValueError se
    a IA não devolveu nada aproveitável (o router transforma em erro 502 —
    melhor avisar do que salvar um plano vazio ou inventado)."""
    bruto = ia.gerar_json(INSTRUCOES_PLANO, _montar_pedido(dados, preferencias), max_tokens=3000)

    tarefas = validar_tarefas(bruto.get("tarefas"), dados.minutos_por_dia)

    if len(tarefas) < 2:
        raise ValueError("A IA não devolveu tarefas suficientes.")

    titulo = str(bruto.get("titulo") or "").strip()[:120] or f"Plano de {dados.materia}"

    return {
        "titulo": titulo,
        "tarefas": distribuir_dias(tarefas, dados.minutos_por_dia, hoje),
    }
