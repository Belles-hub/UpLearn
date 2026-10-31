from datetime import date

from fastapi import APIRouter, Depends

from app import crud_firebase, schemas
from app.auth import verificar_token
from app.erros import exigir_encontrado
from app.services import revisao

router = APIRouter(
    prefix="/revisao",
    tags=["Revisão"]
)


@router.get("/", response_model=list[schemas.CartaoRevisao])
def cartoes_de_hoje(usuario_auth=Depends(verificar_token)):
    """Questões erradas que já estão na hora de rever."""
    cartoes = crud_firebase.listar_cartoes_revisao(
        usuario_auth["uid"], crud_firebase._dia_atual(), revisao.LIMITE_CARTOES_NA_FILA
    )

    return [schemas.CartaoRevisao(**c) for c in cartoes]


@router.post("/{cartao_id}/resultado")
def registrar_revisao(
    cartao_id: str,
    dados: schemas.ResultadoRevisao,
    usuario_auth=Depends(verificar_token)
):
    uid = usuario_auth["uid"]

    cartao = exigir_encontrado(
        crud_firebase.buscar_cartao_revisao(uid, cartao_id), "Cartão não encontrado."
    )

    hoje = date.fromisoformat(crud_firebase._dia_atual())
    caixa, proxima = revisao.proxima_revisao(cartao["caixa"], dados.acertou, hoje)

    crud_firebase.atualizar_cartao_revisao(uid, cartao_id, caixa, proxima.isoformat() if proxima else None)

    return {"dominado": proxima is None, "proxima_revisao": proxima.isoformat() if proxima else None}
