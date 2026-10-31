from fastapi import APIRouter, Depends

from app import crud_firebase, schemas
from app.auth import exigir_dono, verificar_token
from app.erros import exigir_encontrado

router = APIRouter(
    prefix="/perfil",
    tags=["Preferências de aprendizagem"]
)


@router.get("/{usuario_id}/preferencias", response_model=schemas.Preferencias)
def buscar_preferencias(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.buscar_usuario(usuario_id)

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias"]


@router.post("/{usuario_id}/preferencias/redefinir", response_model=schemas.Preferencias)
def redefinir_preferencias(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.redefinir_preferencias(usuario_id)

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias"]


@router.get("/{usuario_id}/acessibilidade")
def buscar_preferencias_visuais(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
) -> dict:
    """Ajustes do painel de acessibilidade (contraste, tamanho de texto,
    cursor etc.) salvos na conta — formato livre, definido pelo frontend."""
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.buscar_usuario(usuario_id)

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias_visuais"]


@router.put("/{usuario_id}/acessibilidade")
def salvar_preferencias_visuais(
    usuario_id: str,
    preferencias_visuais: dict,
    usuario_auth=Depends(verificar_token)
) -> dict:
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.salvar_preferencias_visuais(usuario_id, preferencias_visuais)

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias_visuais"]


@router.post("/{usuario_id}/acessibilidade/redefinir")
def redefinir_preferencias_visuais(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
) -> dict:
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.salvar_preferencias_visuais(usuario_id, {})

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias_visuais"]


@router.put("/{usuario_id}/preferencias", response_model=schemas.Preferencias)
def atualizar_preferencias(
    usuario_id: str,
    preferencias: schemas.Preferencias,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.atualizar_usuario(
        usuario_id,
        schemas.UsuarioUpdate(preferencias=preferencias)
    )

    return exigir_encontrado(usuario, "Usuário não encontrado.")["preferencias"]
