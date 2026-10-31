"""Quiz de múltipla escolha gerado pela IA.

A IA escreve as questões; a correção é feita aqui e no navegador comparando
com o índice da alternativa correta — a IA nunca "corrige" a resposta do
estudante, então não existe nota inventada.
"""

from app.services import ia

INSTRUCOES_QUIZ = (
    "Você é o Up, tutor de estudos da UpLearn, e cria exercícios de múltipla "
    "escolha para crianças e adolescentes. Responda SEMPRE em JSON válido, em "
    "português do Brasil, sem nenhum texto fora do JSON."
)

MIN_QUESTOES_VALIDAS = 3


def _montar_pedido(materia: str, conteudo: str, quantidade: int, preferencias: dict) -> str:
    serie = preferencias.get("serie")
    nivel = f" O estudante está em: {serie}." if serie else ""

    return (
        f"Matéria: {materia}. Conteúdo: {conteudo}.{nivel}\n\n"
        f"Crie {quantidade} questões de múltipla escolha, da mais fácil pra mais "
        "difícil, sobre esse conteúdo. Devolva um JSON com a chave \"questoes\": "
        "uma lista em que cada item tem:\n"
        '- "enunciado": a pergunta, clara e curta;\n'
        '- "alternativas": lista com EXATAMENTE 4 textos curtos, só UMA correta '
        "e as outras plausíveis;\n"
        '- "correta": o índice (0 a 3) da alternativa correta;\n'
        '- "explicacao": 1 ou 2 frases explicando por que aquela é a correta, '
        "de um jeito encorajador.\n"
        "Confira a matemática e os fatos com cuidado: só uma alternativa pode "
        "estar certa. Não use markdown."
    )


def validar_questoes(bruto) -> list[dict]:
    """Descarta questão malformada em vez de mostrar uma pergunta quebrada
    (sem alternativas, gabarito fora da lista, alternativas repetidas)."""
    if not isinstance(bruto, list):
        return []

    questoes = []

    for item in bruto:
        if not isinstance(item, dict):
            continue

        enunciado = str(item.get("enunciado", "")).strip()
        alternativas = item.get("alternativas")
        correta = item.get("correta")
        explicacao = str(item.get("explicacao", "")).strip()

        if not enunciado or not isinstance(alternativas, list) or len(alternativas) != 4:
            continue

        alternativas = [str(a).strip() for a in alternativas]

        if any(not a for a in alternativas) or len(set(alternativas)) != 4:
            continue

        # bool é subclasse de int em Python — True/False não são um índice.
        if isinstance(correta, bool) or not isinstance(correta, int) or not 0 <= correta <= 3:
            continue

        questoes.append({
            "enunciado": enunciado[:400],
            "alternativas": [a[:200] for a in alternativas],
            "correta": correta,
            "explicacao": explicacao[:400],
        })

    return questoes


TENTATIVAS_DA_IA = 2


def gerar_quiz(materia: str, conteudo: str, quantidade: int, preferencias: dict) -> list[dict]:
    # A IA às vezes devolve JSON torto ou questões repetidas. Uma segunda
    # tentativa resolve a maioria dos casos sem a pessoa perceber.
    for _ in range(TENTATIVAS_DA_IA):
        try:
            bruto = ia.gerar_json(
                INSTRUCOES_QUIZ,
                _montar_pedido(materia, conteudo, quantidade, preferencias),
                max_tokens=3500,
            )

            questoes = validar_questoes(bruto.get("questoes"))
        except (ValueError, KeyError, TypeError, AttributeError):
            questoes = []

        if len(questoes) >= MIN_QUESTOES_VALIDAS:
            return questoes

    raise ValueError("A IA não devolveu questões suficientes.")
