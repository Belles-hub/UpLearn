"""Revisão espaçada (caixas de Leitner) para as questões que a pessoa errou.

Funções puras: recebem datas/números e devolvem datas/números, sem banco nem
IA, então dá pra testar sem nenhuma dependência externa.
"""

from datetime import date, timedelta

# Dias até a próxima revisão, por caixa. Acertou sobe uma caixa; errou volta
# pra primeira. Passou da última, o cartão está dominado e sai da fila.
INTERVALOS_DIAS = (1, 3, 7, 14)
CAIXA_DOMINADO = len(INTERVALOS_DIAS)

LIMITE_CARTOES_POR_QUIZ = 10
LIMITE_CARTOES_NA_FILA = 20


def proxima_revisao(caixa: int, acertou: bool, hoje: date) -> tuple[int, date | None]:
    """Devolve (nova_caixa, data_da_proxima_revisao). Data None = dominado."""
    nova_caixa = caixa + 1 if acertou else 0

    if nova_caixa >= CAIXA_DOMINADO:
        return CAIXA_DOMINADO, None

    return nova_caixa, hoje + timedelta(days=INTERVALOS_DIAS[nova_caixa])


def calcular_sequencia(atividade: list[dict], hoje: str) -> int:
    """Dias seguidos com atividade, terminando hoje (ou ontem, se hoje ainda
    não teve — a sequência só quebra quando um dia inteiro passa em branco)."""
    dias = {d["dia"]: d["perguntas"] > 0 for d in atividade}
    dia = date.fromisoformat(hoje)

    if not dias.get(dia.isoformat()):
        dia -= timedelta(days=1)

    sequencia = 0

    while dias.get(dia.isoformat()):
        sequencia += 1
        dia -= timedelta(days=1)

    return sequencia
