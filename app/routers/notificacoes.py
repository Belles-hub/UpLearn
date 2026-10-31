from fastapi import APIRouter, Depends

from app import crud_firebase, schemas
from app.auth import exigir_dono, verificar_token

router = APIRouter(
    prefix="/notificacoes",
    tags=["Notificações"]
)


@router.get("/{usuario_id}", response_model=list[schemas.Notificacao])
def listar_notificacoes(usuario_id: str, usuario_auth=Depends(verificar_token)):
    exigir_dono(usuario_auth, usuario_id)

    return crud_firebase.listar_notificacoes(usuario_id)


@router.post("/{usuario_id}/marcar-lidas")
def marcar_notificacoes_como_lidas(usuario_id: str, usuario_auth=Depends(verificar_token)):
    exigir_dono(usuario_auth, usuario_id)

    crud_firebase.marcar_notificacoes_como_lidas(usuario_id)

    return {"mensagem": "Notificações marcadas como lidas."}
