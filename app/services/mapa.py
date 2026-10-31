"""Mapa personalizado do plano de estudos (pra baixar e imprimir).

Mesma divisão de responsabilidade do plano: a IA só sugere o CONTEÚDO do mapa
(os assuntos-chave, uma meta por dia, estratégias e perguntas de autoteste);
quem valida formato, tamanho e o que é aproveitável é este módulo, em Python.
Assim o mapa sempre cabe na folha impressa, e o que a IA inventar de fora do
combinado (campo extra, texto gigante, dia que não existe no plano) é descartado.
"""

from datetime import datetime, timezone

from app.services import adaptation, ia

MIN_RAMOS = 3
MAX_RAMOS = 6
MAX_PONTOS_POR_RAMO = 4
MAX_ESTRATEGIAS = 4
MAX_PERGUNTAS = 5

TAMANHO_RESUMO = 240
TAMANHO_TITULO_RAMO = 50
TAMANHO_PONTO = 90
TAMANHO_META = 110
TAMANHO_ESTRATEGIA = 130
TAMANHO_PERGUNTA = 120
TAMANHO_MENSAGEM = 200

NOMES_DOS_TIPOS = {"estudo": "Estudo", "exercicio": "Exercício", "revisao": "Revisão", "pausa": "Pausa"}

INSTRUCOES_MAPA = (
    "Você é o Up, tutor de estudos da UpLearn, e desenha o MAPA do plano de estudos "
    "de um estudante (criança ou adolescente) para ele imprimir e colar na mesa. "
    "Responda SEMPRE em JSON válido, em português do Brasil, sem nenhum texto fora do JSON. "
    "Escreva em texto simples: sem emojis, sem markdown, sem asteriscos, sem títulos com #. "
    "Frases curtas, linguagem simples e adequada à idade, tom gentil e encorajador, sem "
    "cobrança nem frases que causem culpa. Nunca faça diagnóstico nem comente sobre "
    "dificuldades de aprendizagem do estudante. Não invente conteúdo fora do assunto pedido. "
    "As perguntas de autoteste servem pra ele pensar: não escreva as respostas."
)


def _texto(valor, limite: int) -> str:
    """Uma linha só, sem espaços sobrando, cortada no limite (sem quebrar palavra no meio
    quando dá pra evitar)."""
    texto = " ".join(str(valor or "").split())

    if len(texto) <= limite:
        return texto

    corte = texto[:limite].rsplit(" ", 1)[0] if " " in texto[:limite] else texto[:limite]

    return corte.rstrip(" ,;:-") + "..."


def _lista_de_textos(bruto, maximo: int, limite: int) -> list[str]:
    if not isinstance(bruto, list):
        return []

    itens = [_texto(item, limite) for item in bruto if isinstance(item, (str, int, float))]

    return [i for i in itens if i][:maximo]


def _dias_do_plano(plano: dict) -> list[str]:
    """Dias em que o plano tem tarefa, na ordem, sem repetir."""
    dias = []

    for tarefa in plano["tarefas"]:
        dia = tarefa.get("dia")

        if dia and dia not in dias:
            dias.append(dia)

    return dias


def _montar_pedido(nome: str, preferencias: dict, plano: dict, dias: list[str]) -> str:
    linhas = [
        f"Nome do estudante: {nome.split()[0] if nome else 'o estudante'}.",
        f"Matéria: {plano['materia']}.",
        f"Conteúdo que ele quer aprender: {plano['conteudo']}.",
        f"Título do plano: {plano['titulo']}.",
    ]

    if plano.get("objetivo"):
        linhas.append(f"Objetivo dele: {plano['objetivo']}.")

    if plano.get("data_avaliacao"):
        linhas.append(f"Data da avaliação: {plano['data_avaliacao']}.")

    if preferencias.get("serie"):
        linhas.append(f"Série: {preferencias['serie']}. Ajuste o vocabulário a essa etapa escolar.")

    estilo = adaptation.ESTILOS.get(preferencias.get("estilo_aprendizagem"))

    if estilo:
        linhas.append(f"O estudante {estilo}. Deixe as estratégias e os pontos do mapa no jeito dele.")

    if preferencias.get("duracao_sessao") == "curta":
        linhas.append("Ele prefere sessões curtas: as estratégias devem ser de blocos pequenos.")
    elif preferencias.get("duracao_sessao") == "longa":
        linhas.append("Ele prefere sessões longas, mas sugira pausas.")

    if preferencias.get("modo_uso") == "audio":
        linhas.append("Ele prefere ouvir: inclua uma estratégia de ler em voz alta ou ouvir o Up.")

    if preferencias.get("tipo_resposta") == "curtas" or preferencias.get("tamanho_fonte") == "grande":
        linhas.append("Ele prefere textos curtos: seja bem direto.")

    linhas.append("\nAtividades do plano, dia a dia:")

    for dia in dias:
        tarefas = [t for t in plano["tarefas"] if t.get("dia") == dia]
        resumo = "; ".join(
            f"{NOMES_DOS_TIPOS.get(t.get('tipo'), 'Estudo')}: {t['titulo']} ({t['duracao_min']} min)" for t in tarefas
        )
        linhas.append(f"- {dia}: {resumo}")

    return (
        "\n".join(linhas)
        + "\n\nDevolva um JSON com estas chaves:\n"
        f'- "resumo": 1 ou 2 frases dizendo, pra ele, o que vai aprender e por que é possível (até {TAMANHO_RESUMO} caracteres).\n'
        f'- "ramos": lista de {MIN_RAMOS} a {MAX_RAMOS} assuntos-chave do conteúdo (os "galhos" do mapa), do mais básico ao mais avançado. '
        f'Cada um é {{"titulo": até {TAMANHO_TITULO_RAMO} caracteres, "pontos": lista de 2 a {MAX_PONTOS_POR_RAMO} '
        f"ideias curtas pra dominar, cada uma com até {TAMANHO_PONTO} caracteres}}.\n"
        f'- "etapas": uma meta curta por dia do plano, na mesma ordem dos dias acima. Cada uma é {{"dia": a data exatamente '
        f'como aparece acima (AAAA-MM-DD), "meta": o que ele consegue fazer ao fim desse dia, começando com um verbo, até {TAMANHO_META} caracteres}}.\n'
        f'- "estrategias": {MAX_ESTRATEGIAS - 1} a {MAX_ESTRATEGIAS} dicas de como estudar esse conteúdo no jeito dele, cada uma até {TAMANHO_ESTRATEGIA} caracteres.\n'
        f'- "perguntas": {MAX_PERGUNTAS - 2} a {MAX_PERGUNTAS} perguntas pra ele se testar sozinho depois de estudar, cada uma até {TAMANHO_PERGUNTA} caracteres, sem resposta.\n'
        f'- "mensagem": uma mensagem final curta e acolhedora, chamando-o pelo nome, até {TAMANHO_MENSAGEM} caracteres.'
    )


def validar_mapa(bruto, dias_validos: list[str]) -> dict:
    """Devolve o mapa limpo e dentro dos limites. Levanta ValueError se a IA não
    devolveu o mínimo aproveitável (o router vira erro 502)."""
    if not isinstance(bruto, dict):
        raise ValueError("A IA não devolveu um mapa.")

    ramos = []

    for item in bruto.get("ramos") if isinstance(bruto.get("ramos"), list) else []:
        if not isinstance(item, dict):
            continue

        titulo = _texto(item.get("titulo"), TAMANHO_TITULO_RAMO)
        pontos = _lista_de_textos(item.get("pontos"), MAX_PONTOS_POR_RAMO, TAMANHO_PONTO)

        if titulo:
            ramos.append({"titulo": titulo, "pontos": pontos})

        if len(ramos) >= MAX_RAMOS:
            break

    if len(ramos) < MIN_RAMOS:
        raise ValueError("A IA não devolveu assuntos suficientes para o mapa.")

    etapas = []
    vistos = set()

    for item in bruto.get("etapas") if isinstance(bruto.get("etapas"), list) else []:
        if not isinstance(item, dict):
            continue

        dia = item.get("dia")
        meta = _texto(item.get("meta"), TAMANHO_META)

        # Só metas de dias que existem no plano — data inventada não entra.
        if dia in dias_validos and dia not in vistos and meta:
            etapas.append({"dia": dia, "meta": meta})
            vistos.add(dia)

    return {
        "resumo": _texto(bruto.get("resumo"), TAMANHO_RESUMO),
        "ramos": ramos,
        "etapas": etapas,
        "estrategias": _lista_de_textos(bruto.get("estrategias"), MAX_ESTRATEGIAS, TAMANHO_ESTRATEGIA),
        "perguntas": _lista_de_textos(bruto.get("perguntas"), MAX_PERGUNTAS, TAMANHO_PERGUNTA),
        "mensagem": _texto(bruto.get("mensagem"), TAMANHO_MENSAGEM),
        "gerado_em": datetime.now(timezone.utc),
    }


def gerar_mapa(nome: str, preferencias: dict, plano: dict) -> dict:
    dias = _dias_do_plano(plano)
    bruto = ia.gerar_json(INSTRUCOES_MAPA, _montar_pedido(nome, preferencias, plano, dias), max_tokens=2500)

    return validar_mapa(bruto, dias)
