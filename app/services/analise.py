"""Monta os dados de conversa do painel de desempenho.

Divisão de responsabilidade proposital: todo NÚMERO que aparece em gráfico é
contado aqui em Python, a partir das mensagens salvas. A IA entra só pra
classificar cada pergunta numa matéria e pra escrever o resumo e as sugestões
— ela nunca devolve contagem, porque um número inventado num painel de
desempenho é pior que painel nenhum.

Nada aqui avalia capacidade ou inteligência: só descreve o que o estudante
estudou e sugere próximos passos.
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from app.services import ia

# O Brasil não usa mais horário de verão desde 2019, então um deslocamento fixo
# de -3h já dá o horário local certo o ano inteiro (evita depender do pacote
# tzdata, que não vem instalado por padrão no Windows).
FUSO_BRASIL = timezone(timedelta(hours=-3))

DIAS_NO_GRAFICO = 14

# Conjunto fechado de matérias: a IA escolhe uma destas por pergunta, nunca
# inventa um rótulo novo (senão o gráfico ganharia categorias infinitas).
MATERIAS = {
    "matematica": "Matemática",
    "portugues": "Português",
    "ciencias": "Ciências",
    "historia": "História",
    "geografia": "Geografia",
    "ingles": "Inglês",
    "outros": "Outros assuntos",
}


def _para_horario_local(momento):
    if momento is None:
        return None

    # O Firestore devolve datetime com timezone UTC.
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)

    return momento.astimezone(FUSO_BRASIL)


def calcular_metricas(mensagens: list[dict], hoje: date | None = None) -> dict:
    """Conta tudo que vira número na tela. Função pura — não chama IA nem banco."""

    if hoje is None:
        hoje = datetime.now(FUSO_BRASIL).date()

    perguntas = [m for m in mensagens if m["role"] == "user"]

    momentos = [
        _para_horario_local(m["criado_em"])
        for m in perguntas
        if m.get("criado_em") is not None
    ]

    dias_com_atividade = {m.date() for m in momentos}

    # Últimos 14 dias, incluindo os dias sem nenhuma conversa — um buraco no
    # gráfico é informação (mostra o intervalo real de uso), então não pode
    # sumir só porque não teve mensagem naquele dia.
    por_dia = Counter(m.date() for m in momentos)

    atividade_por_dia = []

    for recuo in range(DIAS_NO_GRAFICO - 1, -1, -1):
        dia = hoje - timedelta(days=recuo)

        atividade_por_dia.append({
            "dia": dia.isoformat(),
            "rotulo": dia.strftime("%d/%m"),
            "perguntas": por_dia.get(dia, 0),
        })

    semana = {hoje - timedelta(days=recuo) for recuo in range(7)}

    return {
        "total_perguntas": len(perguntas),
        "dias_ativos": len(dias_com_atividade),
        "primeira_conversa": min(dias_com_atividade).isoformat() if dias_com_atividade else None,
        "ultima_conversa": max(dias_com_atividade).isoformat() if dias_com_atividade else None,
        "atividade_por_dia": atividade_por_dia,
        "dias_ativos_ultima_semana": len(dias_com_atividade & semana),
    }


INSTRUCOES_ANALISE = (
    "Você é o Up, tutor de estudos da UpLearn, e analisa as perguntas de estudo "
    "que um estudante fez. Responda SEMPRE em JSON válido, em português do "
    "Brasil, sem nenhum texto fora do JSON."
)


def _montar_pedido(perguntas: list[str]) -> str:
    lista = "\n".join(
        f"{indice}. {texto}" for indice, texto in enumerate(perguntas, start=1)
    )

    materias_validas = ", ".join(f'"{chave}"' for chave in MATERIAS)

    return (
        f"Estas são as {len(perguntas)} perguntas que o estudante fez, em ordem:\n"
        f"{lista}\n\n"
        "Devolva um JSON com exatamente estas três chaves:\n\n"
        '1. "classificacoes": uma lista de strings com EXATAMENTE '
        f"{len(perguntas)} itens, um por pergunta, na mesma ordem. Cada item "
        f"deve ser um destes valores e nada mais: {materias_validas}. "
        "Não inclua contagem nem explicação, só o rótulo de cada pergunta.\n\n"
        '2. "resumo": um texto de 2 a 3 frases dizendo o que ele mais estudou '
        "e como tem sido, com tom encorajador.\n\n"
        '3. "recomendacoes": uma lista de 2 a 3 objetos, cada um com as chaves '
        '"titulo" (o que estudar ou revisar, em poucas palavras) e "motivo" '
        "(UMA frase curta explicando por que, citando algo concreto que ele "
        "perguntou). Não repita o mesmo assunto.\n\n"
        "REGRAS PARA TODO TEXTO QUE VOCÊ ESCREVER:\n"
        '- Fale direto com o estudante usando "você". Nunca na terceira pessoa.\n'
        "- Linguagem simples e gentil. Nunca julgue, compare com outros alunos "
        "nem sugira que ele tem alguma dificuldade de aprendizagem.\n"
        "- Baseie-se só no que ele realmente perguntou, sem inventar."
    )


def _contar_materias(classificacoes: list[str]) -> list[dict]:
    """Conta as matérias AQUI, não na IA — o gráfico precisa refletir os dados reais."""

    # Qualquer rótulo que a IA tenha inventado fora da lista fechada cai em "outros".
    normalizadas = [
        c if c in MATERIAS else "outros"
        for c in classificacoes
        if isinstance(c, str)
    ]

    contagem = Counter(normalizadas)

    materias = [
        {"id": identificador, "nome": nome, "perguntas": contagem.get(identificador, 0)}
        for identificador, nome in MATERIAS.items()
    ]

    # Só mostra matéria que realmente apareceu, da mais falada pra menos.
    materias = [m for m in materias if m["perguntas"] > 0]
    materias.sort(key=lambda m: m["perguntas"], reverse=True)

    return materias


def _validar_recomendacoes(bruto) -> list[dict]:
    recomendacoes = []
    ja_vistos = set()

    for item in bruto or []:
        if not isinstance(item, dict):
            continue

        titulo = str(item.get("titulo", "")).strip()[:80]

        if not titulo or titulo.lower() in ja_vistos:
            continue

        ja_vistos.add(titulo.lower())

        recomendacoes.append({
            "titulo": titulo,
            "motivo": str(item.get("motivo", "")).strip()[:200],
        })

    return recomendacoes[:3]


def analisar(mensagens: list[dict]) -> dict:
    """Parte que depende da IA: matéria de cada pergunta, resumo e sugestões."""

    perguntas = [m["content"] for m in mensagens if m["role"] == "user"]

    if not perguntas:
        return {"materias_conversadas": [], "resumo": None, "recomendacoes": []}

    bruto = ia.gerar_json(INSTRUCOES_ANALISE, _montar_pedido(perguntas))

    classificacoes = bruto.get("classificacoes") or []

    # A IA pode devolver uma lista de tamanho diferente do que foi pedido. Se
    # isso acontecer, as classificações não são confiáveis pra parear com as
    # perguntas — melhor mostrar o painel sem o gráfico de matérias do que
    # mostrar um gráfico errado.
    if not isinstance(classificacoes, list) or len(classificacoes) != len(perguntas):
        materias = []
    else:
        materias = _contar_materias(classificacoes)

    resumo = bruto.get("resumo")

    return {
        "materias_conversadas": materias,
        "resumo": str(resumo).strip() if resumo else None,
        "recomendacoes": _validar_recomendacoes(bruto.get("recomendacoes")),
    }
