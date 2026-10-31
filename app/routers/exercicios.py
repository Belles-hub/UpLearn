from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app import crud_firebase, schemas
from app.auth import verificar_token
from app.erros import exigir_encontrado, traduzir_erros_da_ia
from app.routers.chat import registrar_uso_ou_429
from app.services import exercicios as servico_exercicios
from app.services import revisao

router = APIRouter(
    prefix="/exercicios",
    tags=["Exercícios"]
)


@router.post("/quiz", response_model=schemas.QuizResponse)
def gerar_quiz(dados: schemas.GerarQuizRequest, usuario_auth=Depends(verificar_token)):
    uid = usuario_auth["uid"]

    usuario = exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")

    registrar_uso_ou_429(uid)

    with traduzir_erros_da_ia("Não foi possível criar o quiz agora. Tente novamente em instantes."):
        try:
            questoes = servico_exercicios.gerar_quiz(
                dados.materia.strip(), dados.conteudo.strip(), dados.quantidade, usuario["preferencias"]
            )
        except (ValueError, KeyError, TypeError, AttributeError):
            raise HTTPException(
                status_code=502,
                detail="O Up não conseguiu criar o quiz desta vez. Tente de novo em instantes."
            )

    return schemas.QuizResponse(
        materia=dados.materia.strip(), conteudo=dados.conteudo.strip(), questoes=questoes
    )


@router.post("/resultado")
def salvar_resultado(dados: schemas.ResultadoExercicio, usuario_auth=Depends(verificar_token)):
    """Guarda o resultado de um quiz terminado. O navegador corrige comparando
    com o gabarito recebido; aqui só registramos o placar pra alimentar o
    painel de desempenho da própria pessoa (não existe ranking)."""
    uid = usuario_auth["uid"]
    materia = dados.materia.strip()

    crud_firebase.salvar_exercicio(uid, materia, dados.conteudo.strip(), dados.total, dados.acertos)

    # Questão errada volta amanhã pra revisão (revisão espaçada).
    if dados.erradas:
        amanha = date.fromisoformat(crud_firebase._dia_atual()) + timedelta(days=revisao.INTERVALOS_DIAS[0])

        crud_firebase.salvar_cartoes_revisao(
            uid,
            materia,
            [q.model_dump() for q in dados.erradas[:revisao.LIMITE_CARTOES_POR_QUIZ]],
            amanha.isoformat(),
        )

    return {"mensagem": "Resultado salvo."}
