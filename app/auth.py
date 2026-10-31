import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth


def exigir_dono(usuario_auth: dict, usuario_id: str):
    if usuario_auth["uid"] != usuario_id:
        raise HTTPException(
            status_code=403,
            detail="Você não tem permissão para acessar este usuário."
        )


def exigir_conta_liberada(identificador: str):
    """429 enquanto a conta está de castigo por tentativas erradas seguidas.

    Usado no login e na redefinição de senha — os dois reaproveitam o mesmo
    bloqueio de app/crud_firebase.py, com o e-mail como identificador."""
    from app import crud_firebase

    espera = crud_firebase.segundos_de_bloqueio(identificador)

    if espera == 0:
        return

    minutos = max(1, round(espera / 60))

    raise HTTPException(
        status_code=429,
        detail=(
            "Muitas tentativas nesta conta. "
            f"Aguarde {minutos} minuto(s) e tente de novo."
        )
    )

load_dotenv()

JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = "HS256"
JWT_EMISSOR = "uplearn-api"
JWT_EXPIRA_MINUTOS = 60 * 24 * 7  # 7 dias


def criar_token(uid: str, tipo: str = "usuario", versao: int = 0) -> str:
    payload = {
        "uid": uid,
        # "tipo" marca o token como de conta e-mail/senha — verificar_token
        # usa isso pra checar token_versao (troca de senha) a cada requisição.
        "tipo": tipo,
        "versao": versao,
        "iss": JWT_EMISSOR,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRA_MINUTOS)
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verificar_token(authorization: str | None = Header(default=None)):

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Token de autenticação não informado."
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Formato de token inválido."
        )

    token = authorization.split("Bearer ")[1]

    # Login por e-mail/senha: token próprio, assinado com nossa chave (HS256).
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])

        if payload.get("iss") == JWT_EMISSOR:
            uid = payload["uid"]

            # Token emitido antes de uma troca de senha tem que parar de
            # funcionar na hora, não só quando expirar sozinho (até 7 dias
            # depois). Um token sem "tipo" (emitido antes desta proteção
            # existir) passa direto — continua valendo até expirar, sem
            # deslogar quem já estava com sessão ativa.
            if payload.get("tipo") == "usuario":
                from app import crud_firebase

                if crud_firebase.buscar_token_versao(uid) != payload.get("versao", 0):
                    raise HTTPException(
                        status_code=401,
                        detail="Token inválido ou expirado."
                    )

            return {"uid": uid}

    except jwt.InvalidTokenError:
        pass

    # Login com Google: token emitido pelo Firebase Auth (RS256).
    try:
        usuario = firebase_auth.verify_id_token(token)
        return usuario

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Token inválido ou expirado."
        )
