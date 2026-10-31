import json

import groq
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app import crud_firebase, schemas
from app.auth import verificar_token
from app.erros import exigir_encontrado, traduzir_erros_da_ia
from app.services import adaptation, ia, material

router = APIRouter(
    prefix="/chat",
    tags=["Tutor Up"]
)

MENSAGEM_LIMITE_DIARIO = (
    "Você atingiu o limite de mensagens de hoje. "
    "Descanse um pouco e volte amanhã!"
)


def registrar_uso_ou_429(uid: str):
    """Conta um uso de IA do dia; se já bateu o teto, vira 429."""
    try:
        crud_firebase.registrar_uso_chat(uid)
    except crud_firebase.LimiteDeUsoExcedidoError:
        raise HTTPException(status_code=429, detail=MENSAGEM_LIMITE_DIARIO)


@router.post("/", response_model=schemas.ChatResponse)
def conversar(
    dados: schemas.ChatRequest,
    usuario_auth=Depends(verificar_token)
):
    uid = usuario_auth["uid"]

    usuario = crud_firebase.buscar_usuario(uid)

    usuario = exigir_encontrado(usuario, "Usuário não encontrado.")

    registrar_uso_ou_429(uid)

    # O tamanho de fonte que o estudante está usando agora na tela (se veio
    # na requisição) reflete o uso real dele melhor do que a preferência
    # salva no onboarding, então tem prioridade.
    preferencias_efetivas = dict(usuario["preferencias"])

    if dados.tamanho_fonte_atual:
        preferencias_efetivas["tamanho_fonte"] = dados.tamanho_fonte_atual

    historico = [item.model_dump() for item in dados.historico]

    instrucoes = adaptation.montar_instrucoes_sistema(
        preferencias_efetivas,
        historico,
        modo=dados.modo,
        materia=dados.materia,
        material=[item.model_dump() for item in dados.material],
        linguagem_simples=dados.linguagem_simples,
    )

    with traduzir_erros_da_ia("Não foi possível falar com o Up agora. Tente novamente em instantes."):
        resposta = ia.gerar_resposta(dados.mensagem, historico, instrucoes)

    crud_firebase.salvar_mensagem(uid, "user", dados.mensagem, materia=dados.materia)
    crud_firebase.salvar_mensagem(uid, "assistant", resposta)

    return schemas.ChatResponse(resposta=resposta)


@router.post("/stream")
def conversar_em_fluxo(
    dados: schemas.ChatRequest,
    usuario_auth=Depends(verificar_token)
):
    """Mesma conversa de POST /chat/, mas a resposta chega aos poucos
    (Server-Sent Events): cada evento `data:` é um JSON {"texto": "..."},
    e o fim vem como {"fim": true}. Falha no meio vira {"erro": "..."}."""
    uid = usuario_auth["uid"]

    usuario = exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")

    registrar_uso_ou_429(uid)

    preferencias_efetivas = dict(usuario["preferencias"])

    if dados.tamanho_fonte_atual:
        preferencias_efetivas["tamanho_fonte"] = dados.tamanho_fonte_atual

    historico = [item.model_dump() for item in dados.historico]

    instrucoes = adaptation.montar_instrucoes_sistema(
        preferencias_efetivas,
        historico,
        modo=dados.modo,
        materia=dados.materia,
        material=[item.model_dump() for item in dados.material],
        linguagem_simples=dados.linguagem_simples,
    )

    def evento(carga: dict) -> str:
        return "data: " + json.dumps(carga, ensure_ascii=False) + "\n\n"

    def fluxo():
        partes = []

        try:
            for pedaco in ia.gerar_resposta_stream(dados.mensagem, historico, instrucoes):
                partes.append(pedaco)
                yield evento({"texto": pedaco})

        except (RuntimeError, groq.APIError):
            yield evento({"erro": "Não foi possível falar com o Up agora. Tente novamente em instantes."})
            return

        crud_firebase.salvar_mensagem(uid, "user", dados.mensagem, materia=dados.materia)
        crud_firebase.salvar_mensagem(uid, "assistant", "".join(partes))

        yield evento({"fim": True})

    return StreamingResponse(
        fluxo(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/material", response_model=schemas.MaterialLido)
def ler_material(
    dados: schemas.MaterialArquivo,
    usuario_auth=Depends(verificar_token)
):
    """Lê uma foto ou arquivo da aula e devolve o texto. Nada é guardado: o
    arquivo só existe na memória durante esta chamada."""
    uid = usuario_auth["uid"]

    exigir_encontrado(crud_firebase.buscar_usuario(uid), "Usuário não encontrado.")

    try:
        preparado = material.preparar(dados.nome, dados.dados)

        # Foto usa o modelo de visão (custa mais): conta no limite diário.
        # PDF, Word e texto são lidos aqui mesmo, sem IA.
        if preparado.eh_imagem:
            registrar_uso_ou_429(uid)

        with traduzir_erros_da_ia("Não consegui ler esse arquivo agora. Tente de novo em instantes."):
            tipo, texto, aviso = material.ler(preparado)

    except material.MaterialInvalido as erro:
        raise HTTPException(status_code=erro.status, detail=str(erro))

    return schemas.MaterialLido(nome=preparado.nome, tipo=tipo, texto=texto, aviso=aviso)


@router.get("/resumo", response_model=schemas.ChatResponse)
def resumo(
    usuario_auth=Depends(verificar_token)
):
    uid = usuario_auth["uid"]

    usuario = crud_firebase.buscar_usuario(uid)

    usuario = exigir_encontrado(usuario, "Usuário não encontrado.")

    historico = crud_firebase.listar_mensagens(uid)

    if not historico:
        return schemas.ChatResponse(
            resposta="Você ainda não teve nenhuma conversa com o Up. Que tal começar agora?"
        )

    registrar_uso_ou_429(uid)

    instrucoes = adaptation.montar_instrucoes_sistema(usuario["preferencias"], historico)

    with traduzir_erros_da_ia("Não foi possível gerar o resumo agora. Tente novamente em instantes."):
        resposta = ia.gerar_resumo(historico, instrucoes)

    return schemas.ChatResponse(resposta=resposta)
