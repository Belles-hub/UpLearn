"""Resumo de estudo e flashcards do plano (pra baixar em PDF e imprimir).

Mesma divisão de responsabilidade do mapa: a IA só sugere o CONTEÚDO (tópicos
do resumo e pares pergunta/resposta); quem valida formato e tamanho é este
módulo, em Python. Assim tudo cabe na folha e na carta recortável, e o que a
IA inventar fora do combinado é descartado.
"""

from datetime import datetime, timezone

from app.services import adaptation, ia

MIN_TOPICOS = 3
MAX_TOPICOS = 8
MAX_PONTOS_POR_TOPICO = 5
MIN_CARTOES = 6
MAX_CARTOES = 20

TAMANHO_TITULO_TOPICO = 60
TAMANHO_PONTO = 160
TAMANHO_FRENTE = 110
TAMANHO_VERSO = 170

INSTRUCOES_FICHAS = (
    "Você é o Up, tutor de estudos da UpLearn, e prepara o material de revisão de um "
    "estudante (criança ou adolescente) para ele imprimir: um resumo de estudo e flashcards. "
    "Responda SEMPRE em JSON válido, em português do Brasil, sem nenhum texto fora do JSON. "
    "Escreva em texto simples: sem emojis, sem markdown, sem asteriscos, sem títulos com #. "
    "Frases curtas, linguagem simples e adequada à idade, tom gentil. Só conteúdo correto e "
    "do assunto pedido: se não tiver certeza de um fato, não o inclua. Nunca faça diagnóstico "
    "nem comente sobre dificuldades de aprendizagem do estudante."
)


def _texto(valor, limite: int) -> str:
    """Uma linha só, sem espaços sobrando, cortada no limite."""
    texto = " ".join(str(valor or "").split())

    if len(texto) <= limite:
        return texto

    corte = texto[:limite].rsplit(" ", 1)[0] if " " in texto[:limite] else texto[:limite]

    return corte.rstrip(" ,;:-") + "..."


def _montar_pedido(preferencias: dict, plano: dict) -> str:
    linhas = [
        f"Matéria: {plano['materia']}.",
        f"Conteúdo: {plano['conteudo']}.",
        f"Título do plano: {plano['titulo']}.",
    ]

    if plano.get("objetivo"):
        linhas.append(f"Objetivo do estudante: {plano['objetivo']}.")

    if preferencias.get("serie"):
        linhas.append(f"Série: {preferencias['serie']}. Ajuste o vocabulário a essa etapa escolar.")

    estilo = adaptation.ESTILOS.get(preferencias.get("estilo_aprendizagem"))

    if estilo:
        linhas.append(f"O estudante {estilo}. Escreva o resumo e os cartões no jeito dele.")

    if preferencias.get("tipo_resposta") == "curtas" or preferencias.get("tamanho_fonte") == "grande":
        linhas.append("Ele prefere textos curtos: seja bem direto.")

    return (
        "\n".join(linhas)
        + "\n\nDevolva um JSON com estas chaves:\n"
        f'- "resumo": lista de {MIN_TOPICOS} a {MAX_TOPICOS} tópicos do conteúdo, do mais básico ao mais avançado. '
        f'Cada um é {{"titulo": até {TAMANHO_TITULO_TOPICO} caracteres, "pontos": lista de 2 a {MAX_PONTOS_POR_TOPICO} '
        f"ideias que explicam o tópico, cada uma com até {TAMANHO_PONTO} caracteres}}.\n"
        f'- "cartoes": lista de {MIN_CARTOES + 2} a {MAX_CARTOES} flashcards. Cada um é {{"frente": uma pergunta ou termo '
        f'(até {TAMANHO_FRENTE} caracteres), "verso": a resposta direta (até {TAMANHO_VERSO} caracteres)}}. '
        "Cada cartão testa uma ideia só, e a frente não pode entregar a resposta."
    )


def validar_resumo(bruto: dict) -> list[dict]:
    """Tópicos do resumo, limpos e dentro dos limites. ValueError se a IA não
    devolveu o mínimo aproveitável."""
    resumo = []

    for item in bruto.get("resumo") if isinstance(bruto.get("resumo"), list) else []:
        if not isinstance(item, dict):
            continue

        titulo = _texto(item.get("titulo"), TAMANHO_TITULO_TOPICO)
        brutos = item.get("pontos") if isinstance(item.get("pontos"), list) else []
        pontos = [_texto(p, TAMANHO_PONTO) for p in brutos if isinstance(p, (str, int, float))]
        pontos = [p for p in pontos if p][:MAX_PONTOS_POR_TOPICO]

        if titulo and pontos:
            resumo.append({"titulo": titulo, "pontos": pontos})

        if len(resumo) >= MAX_TOPICOS:
            break

    if len(resumo) < MIN_TOPICOS:
        raise ValueError("A IA não devolveu tópicos suficientes para o resumo.")

    return resumo


def validar_cartoes(bruto: dict) -> list[dict]:
    """Pares frente/verso, limpos e dentro dos limites. ValueError se a IA não
    devolveu o mínimo aproveitável."""
    cartoes = []

    for item in bruto.get("cartoes") if isinstance(bruto.get("cartoes"), list) else []:
        if not isinstance(item, dict):
            continue

        frente = _texto(item.get("frente"), TAMANHO_FRENTE)
        verso = _texto(item.get("verso"), TAMANHO_VERSO)

        if frente and verso:
            cartoes.append({"frente": frente, "verso": verso})

        if len(cartoes) >= MAX_CARTOES:
            break

    if len(cartoes) < MIN_CARTOES:
        raise ValueError("A IA não devolveu cartões suficientes.")

    return cartoes


def validar_fichas(bruto) -> dict:
    """Devolve as fichas limpas e dentro dos limites. Levanta ValueError se a IA
    não devolveu o mínimo aproveitável (o router vira erro 502)."""
    if not isinstance(bruto, dict):
        raise ValueError("A IA não devolveu as fichas.")

    return {"resumo": validar_resumo(bruto), "cartoes": validar_cartoes(bruto), "gerado_em": datetime.now(timezone.utc)}


def gerar_fichas(preferencias: dict, plano: dict) -> dict:
    bruto = ia.gerar_json(INSTRUCOES_FICHAS, _montar_pedido(preferencias, plano), max_tokens=3500)

    return validar_fichas(bruto)
