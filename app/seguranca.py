import os

import bcrypt
from fastapi import Request

# Só confia no X-Forwarded-For quando a API está de fato atrás de um proxy
# reverso confiável (Render). Sem essa flag, qualquer cliente pode mandar
# esse header com um IP inventado e furar o limite de cadastro por IP —
# então por padrão o header é ignorado e vale o IP da conexão TCP mesmo.
CONFIA_EM_PROXY_REVERSO = os.environ.get("CONFIA_EM_PROXY_REVERSO", "false").lower() == "true"


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha.encode("utf-8"), senha_hash.encode("utf-8"))


def obter_ip_cliente(request: Request) -> str:
    """Atrás de proxy reverso (Render), request.client.host é o IP do
    proxy, não de quem fez a requisição de verdade — o IP real vem no
    header X-Forwarded-For, posto lá pelo proxy."""
    if CONFIA_EM_PROXY_REVERSO:
        encaminhado = request.headers.get("x-forwarded-for")

        if encaminhado:
            # A cadeia é "cliente, proxy1, proxy2, ...": cada proxy pelo
            # caminho ACRESCENTA um item, nunca reescreve os anteriores.
            # O cliente controla tudo que manda de saída, então pode
            # forjar itens no INÍCIO da lista — mas o ÚLTIMO item é
            # sempre o que o proxy mais próximo da nossa API viu com os
            # próprios olhos, esse não dá pra forjar.
            return encaminhado.split(",")[-1].strip()

    return request.client.host if request.client else "desconhecido"
