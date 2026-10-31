from fastapi import APIRouter, Depends, HTTPException

from app import crud_firebase, schemas
from app.auth import exigir_dono, verificar_token
from app.erros import exigir_encontrado

router = APIRouter(
    prefix="/usuarios",
    tags=["Usuários"]
)


@router.post("/", response_model=schemas.UsuarioResponse)
def criar_usuario(
    usuario: schemas.UsuarioCreate,
    usuario_auth=Depends(verificar_token)
):
    uid = usuario_auth["uid"]

    # Quem entrou pelo Google tem o e-mail já confirmado dentro do próprio
    # token — esse vale mais do que o que veio digitado na requisição.
    email_do_token = usuario_auth.get("email")

    if email_do_token:
        usuario = usuario.model_copy(update={"email": email_do_token.strip().lower()})

    novo_usuario = crud_firebase.criar_perfil(uid, usuario)

    if novo_usuario is None:
        raise HTTPException(
            status_code=409,
            detail="Usuário já cadastrado."
        )

    return novo_usuario


@router.get("/{usuario_id}", response_model=schemas.UsuarioResponse)
def buscar_usuario(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.buscar_usuario(usuario_id)

    return exigir_encontrado(usuario, "Usuário não encontrado.")


@router.get("/{usuario_id}/exportar")
def exportar_dados(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
):
    """Tudo que a UpLearn guarda da pessoa, num JSON só (direito de acesso da LGPD)."""
    exigir_dono(usuario_auth, usuario_id)

    return exigir_encontrado(crud_firebase.exportar_dados(usuario_id), "Usuário não encontrado.")


@router.put("/{usuario_id}", response_model=schemas.UsuarioResponse)
def atualizar_usuario(
    usuario_id: str,
    dados: schemas.UsuarioUpdate,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.atualizar_usuario(usuario_id, dados)

    return exigir_encontrado(usuario, "Usuário não encontrado")


@router.delete("/{usuario_id}")
def deletar_usuario(
    usuario_id: str,
    usuario_auth=Depends(verificar_token)
):
    exigir_dono(usuario_auth, usuario_id)

    usuario = crud_firebase.deletar_usuario(usuario_id)

    exigir_encontrado(usuario, "Usuário não encontrado")

    return {
        "mensagem": "Usuário excluído com sucesso."
    }
