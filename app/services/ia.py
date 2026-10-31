import json
import os
import re
from functools import lru_cache

import groq
from dotenv import load_dotenv

load_dotenv()

MODELO_PADRAO = "openai/gpt-oss-120b"
# Só alguns modelos da Groq aceitam imagem (o padrão acima não). Como o catálogo
# muda, dá pra trocar por GROQ_VISION_MODEL sem mexer em código.
MODELO_VISAO_PADRAO = "qwen/qwen3.8-27b"
MAX_TOKENS_VISAO = 1400
MAX_TOKENS_RESPOSTA = 1024
# A análise do histórico devolve um JSON com uma classificação por mensagem,
# então precisa de mais espaço que uma resposta de chat comum.
MAX_TOKENS_ANALISE = 3000

INSTRUCAO_VISAO = (
    "Esta imagem é material de estudo de um estudante (página de caderno, livro, "
    "lousa, atividade, prova ou anotação). Escreva em português: (1) a transcrição "
    "fiel de todo o texto visível, incluindo enunciados, números e fórmulas, na "
    "ordem em que aparecem; (2) uma descrição curta de figuras, gráficos, tabelas "
    "ou desenhos que façam parte do conteúdo. Se algum trecho estiver ilegível, "
    "escreva [ilegível] — nunca invente. Ignore pessoas e rostos: não os descreva. "
    "Se a imagem não tiver conteúdo de estudo, diga apenas isso, em uma frase. "
    "Responda só com a transcrição e a descrição, sem comentários seus."
)

INSTRUCAO_RESUMO = (
    "Resuma nossa conversa de estudo até agora, em português, de forma objetiva "
    "e encorajadora: o que o estudante já aprendeu, o que ainda vale revisar e "
    "um próximo passo sugerido."
)


@lru_cache
def _obter_client() -> groq.Groq:
    # Carregado sob demanda (não na importação do módulo) pra não derrubar
    # a API inteira no startup só porque o chat ainda não foi configurado.
    chave = os.environ.get("GROQ_API_KEY")

    if not chave:
        raise RuntimeError(
            "GROQ_API_KEY não configurada. "
            "Crie uma chave em console.groq.com/keys e adicione no .env."
        )

    return groq.Groq(api_key=chave)


def _chamar_modelo(mensagens: list[dict]) -> str:
    client = _obter_client()

    # GROQ_MODEL permite trocar o modelo sem mexer em código, já que o
    # catálogo de modelos da Groq muda com mais frequência que o da Anthropic.
    modelo = os.environ.get("GROQ_MODEL") or MODELO_PADRAO

    resposta = client.chat.completions.create(
        model=modelo,
        max_tokens=MAX_TOKENS_RESPOSTA,
        messages=mensagens,
    )

    return resposta.choices[0].message.content


def gerar_resposta(mensagem: str, historico: list[dict], instrucoes_sistema: str) -> str:
    mensagens = [
        {"role": "system", "content": instrucoes_sistema},
        *historico,
        {"role": "user", "content": mensagem}
    ]

    return _chamar_modelo(mensagens)


def gerar_resposta_stream(mensagem: str, historico: list[dict], instrucoes_sistema: str):
    """Igual a gerar_resposta, mas devolve os pedaços de texto conforme chegam."""
    client = _obter_client()
    modelo = os.environ.get("GROQ_MODEL") or MODELO_PADRAO

    fluxo = client.chat.completions.create(
        model=modelo,
        max_tokens=MAX_TOKENS_RESPOSTA,
        stream=True,
        messages=[
            {"role": "system", "content": instrucoes_sistema},
            *historico,
            {"role": "user", "content": mensagem},
        ],
    )

    for pedaco in fluxo:
        if pedaco.choices and pedaco.choices[0].delta.content:
            yield pedaco.choices[0].delta.content


def descrever_imagem(mime: str, dados_base64: str) -> str:
    """Lê uma foto de material de estudo e devolve o texto transcrito + uma
    descrição curta das figuras. A imagem não é guardada em lugar nenhum."""
    client = _obter_client()
    modelo = os.environ.get("GROQ_VISION_MODEL") or MODELO_VISAO_PADRAO

    resposta = client.chat.completions.create(
        model=modelo,
        max_tokens=MAX_TOKENS_VISAO,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": INSTRUCAO_VISAO},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{dados_base64}"}},
            ],
        }],
    )

    texto = resposta.choices[0].message.content or ""

    # Alguns modelos "pensam em voz alta" dentro de <think>; isso não é conteúdo do material.
    return re.sub(r"<think>.*?</think>", "", texto, flags=re.S).strip()


def gerar_json(instrucoes_sistema: str, pedido: str, max_tokens: int = MAX_TOKENS_ANALISE) -> dict:
    """Chama o modelo exigindo JSON de volta e devolve o dict já parseado."""
    client = _obter_client()
    modelo = os.environ.get("GROQ_MODEL") or MODELO_PADRAO

    resposta = client.chat.completions.create(
        model=modelo,
        max_tokens=max_tokens,
        # Sem isso o modelo costuma embrulhar o JSON em ```json ... ``` ou
        # escrever um texto de introdução antes — os dois quebram o parse.
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": instrucoes_sistema},
            {"role": "user", "content": pedido}
        ],
    )

    return json.loads(resposta.choices[0].message.content)


def gerar_resumo(historico: list[dict], instrucoes_sistema: str) -> str:
    mensagens = [
        {"role": "system", "content": instrucoes_sistema},
        *historico,
        {"role": "user", "content": INSTRUCAO_RESUMO}
    ]

    return _chamar_modelo(mensagens)
