from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app import crud_firebase, schemas
from app.auth import verificar_token
from app.erros import exigir_encontrado, traduzir_erros_da_ia
from app.routers.chat import registrar_uso_ou_429
from app.services import analise
from app.services import mapa as servico_mapa
from app.services import planos as servico_planos

router = APIRouter(
    prefix="/planos",
    tags=["Plano de estudos"]
)


@router.get("/", response_model=list[schemas.PlanoResponse])
def listar(usuario_auth=Depends(verificar_token)):
    return crud_firebase.listar_planos(usuario_auth["uid"])


@router.post("/gerar", response_model=schemas.PlanoResponse)
def gerar(dados: schemas.GerarPlanoRequest, usuario_auth=Depends(verificar_token)):
    uid = usuario_auth["uid"]

    usuario = exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")

    registrar_uso_ou_429(uid)

    hoje = datetime.now(analise.FUSO_BRASIL).date()

    with traduzir_erros_da_ia("Não foi possível montar o plano agora. Tente novamente em instantes."):
        try:
            plano = servico_planos.gerar_plano(dados, usuario["preferencias"], hoje)
        except (ValueError, KeyError, TypeError, AttributeError):
            # IA devolveu algo que não dá pra aproveitar (JSON fora do formato,
            # lista vazia...). Melhor avisar do que salvar um plano inventado.
            raise HTTPException(
                status_code=502,
                detail="O Up não conseguiu montar o plano desta vez. Tente de novo em instantes."
            )

    try:
        salvo = crud_firebase.criar_plano(uid, {
            "titulo": plano["titulo"],
            "materia": dados.materia.strip(),
            "conteudo": dados.conteudo.strip(),
            "objetivo": dados.objetivo,
            "data_avaliacao": dados.data_avaliacao,
            "tarefas": plano["tarefas"],
        })
    except crud_firebase.LimiteDePlanosError:
        raise HTTPException(
            status_code=409,
            detail="Você já tem muitos planos guardados. Apague algum plano antigo para criar outro."
        )

    crud_firebase.criar_notificacao(uid, "plano", f"Seu plano \"{salvo['titulo']}\" está pronto!")

    return salvo


@router.get("/{plano_id}", response_model=schemas.PlanoResponse)
def buscar(plano_id: str, usuario_auth=Depends(verificar_token)):
    plano = crud_firebase.buscar_plano(usuario_auth["uid"], plano_id)

    return exigir_encontrado(plano, "Plano não encontrado.")


@router.put("/{plano_id}", response_model=schemas.PlanoResponse)
def atualizar(plano_id: str, dados: schemas.PlanoAtualizar, usuario_auth=Depends(verificar_token)):
    plano = crud_firebase.atualizar_plano(
        usuario_auth["uid"],
        plano_id,
        dados.titulo.strip(),
        dados.pausado,
        [tarefa.model_dump() for tarefa in dados.tarefas],
    )

    return exigir_encontrado(plano, "Plano não encontrado.")


@router.post("/{plano_id}/mapa", response_model=schemas.MapaPlano)
def gerar_mapa(plano_id: str, usuario_auth=Depends(verificar_token)):
    """A IA desenha um mapa personalizado do plano (assuntos-chave, trilha por dia,
    estratégias do jeito do estudante). Fica guardado no plano."""
    uid = usuario_auth["uid"]

    usuario = exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")
    plano = exigir_encontrado(crud_firebase.buscar_plano(uid, plano_id), "Plano não encontrado.")

    registrar_uso_ou_429(uid)

    with traduzir_erros_da_ia("Não foi possível desenhar o mapa agora. Tente novamente em instantes."):
        try:
            mapa = servico_mapa.gerar_mapa(usuario.get("nome", ""), usuario["preferencias"], plano)
        except (ValueError, KeyError, TypeError, AttributeError):
            raise HTTPException(
                status_code=502,
                detail="O Up não conseguiu desenhar o mapa desta vez. Tente de novo em instantes."
            )

    salvo = crud_firebase.salvar_mapa_plano(uid, plano_id, mapa)

    return exigir_encontrado(salvo, "Plano não encontrado.")["mapa"]


@router.delete("/{plano_id}")
def deletar(plano_id: str, usuario_auth=Depends(verificar_token)):
    if not crud_firebase.deletar_plano(usuario_auth["uid"], plano_id):
        raise HTTPException(status_code=404, detail="Plano não encontrado.")

    return {"mensagem": "Plano excluído."}
