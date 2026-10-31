from contextlib import contextmanager

import groq
from fastapi import HTTPException


def exigir_encontrado(valor, mensagem: str):
    """Levanta 404 se valor for None e devolve o próprio valor caso
    contrário — o padrão "busquei algo no banco, não achei, vira 404" se
    repetia quase idêntico em mais de 15 lugares espalhados pelos routers
    (usuários, perfil, planos, desempenho, chat), cada um com sua própria
    cópia do mesmo if/raise."""
    if valor is None:
        raise HTTPException(status_code=404, detail=mensagem)

    return valor


@contextmanager
def traduzir_erros_da_ia(mensagem_de_falha: str):
    """Transforma as falhas possíveis da IA em respostas HTTP claras.

    Antes, chat, resumo e dashboard tinham cada um a própria cópia deste
    mesmo try/except. RuntimeError aqui é "IA sem chave configurada"."""
    try:
        yield

    except RuntimeError as erro:
        raise HTTPException(status_code=503, detail=str(erro))

    except groq.RateLimitError:
        raise HTTPException(
            status_code=429,
            detail="Muitas mensagens em pouco tempo. Aguarde alguns segundos e tente de novo."
        )

    except groq.APIError:
        raise HTTPException(status_code=502, detail=mensagem_de_falha)
