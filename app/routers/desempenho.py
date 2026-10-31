import groq
from fastapi import APIRouter, Depends

from app import crud_firebase, schemas
from app.auth import verificar_token
from app.erros import exigir_encontrado
from app.services import analise, desempenho, revisao

router = APIRouter(
    prefix="/desempenho",
    tags=["Desempenho"]
)


@router.get("/rapido", response_model=schemas.ResumoRapido)
def resumo_rapido(usuario_auth=Depends(verificar_token)):
    uid = usuario_auth["uid"]

    metricas = analise.calcular_metricas(crud_firebase.listar_mensagens_com_data(uid))

    hoje = crud_firebase._dia_atual()

    return schemas.ResumoRapido(
        total_perguntas=metricas["total_perguntas"],
        dias_ativos_ultima_semana=metricas["dias_ativos_ultima_semana"],
        atividade_por_dia=metricas["atividade_por_dia"],
        progresso_planos=desempenho.resumir_planos(crud_firebase.listar_planos(uid)),
        exercicios_total=len(crud_firebase.listar_exercicios(uid)),
        sequencia_dias=revisao.calcular_sequencia(metricas["atividade_por_dia"], hoje),
        revisao_pendente=crud_firebase.contar_cartoes_revisao(uid, hoje),
    )


@router.get("/", response_model=schemas.DesempenhoResponse)
def painel(usuario_auth=Depends(verificar_token)):
    uid = usuario_auth["uid"]

    usuario = exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")

    mensagens = crud_firebase.listar_mensagens_com_data(uid)
    planos = crud_firebase.listar_planos(uid)
    exercicios = crud_firebase.listar_exercicios(uid)

    metricas = analise.calcular_metricas(mensagens)
    progresso = desempenho.resumir_planos(planos)

    # A parte escrita (matérias, resumo, sugestões) depende da IA; os números
    # não. Se a IA estiver fora do ar ou sem cota, o painel ainda abre com
    # tudo que já é dado real — derrubar a página inteira por causa disso
    # seria pior pro estudante do que mostrar o que já temos.
    resultado_ia = {"materias_conversadas": [], "resumo": None, "recomendacoes": []}
    analise_disponivel = True

    if mensagens:
        try:
            resultado_ia = analise.analisar(mensagens)

        # TypeError/AttributeError cobrem a IA devolvendo algo inesperado
        # (completion vazio — json.loads(None) é TypeError — ou um JSON
        # válido só que não-objeto, tipo uma lista no lugar de um dict).
        except (RuntimeError, groq.APIError, ValueError, KeyError, TypeError, AttributeError):
            analise_disponivel = False

    return schemas.DesempenhoResponse(
        **metricas,
        **resultado_ia,
        materias_exercicios=desempenho.resumir_exercicios(exercicios),
        progresso_planos=progresso,
        exercicios_total=len(exercicios),
        conquistas=desempenho.calcular_conquistas(
            metricas["total_perguntas"],
            metricas["dias_ativos_ultima_semana"],
            progresso,
            exercicios,
        ),
        preferencias=usuario["preferencias"],
        analise_disponivel=analise_disponivel,
    )
