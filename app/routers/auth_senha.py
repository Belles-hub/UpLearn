from fastapi import APIRouter, HTTPException, Request

from app import crud_firebase, schemas
from app.auth import criar_token, exigir_conta_liberada
from app.seguranca import hash_senha, obter_ip_cliente, verificar_senha

router = APIRouter(
    prefix="/auth",
    tags=["Autenticação por e-mail e senha"]
)


@router.post("/registrar", response_model=schemas.TokenResponse)
def registrar_com_senha(dados: schemas.UsuarioRegistroSenha, request: Request):

    # Diferente do login (bloqueio por conta), quem faz spam de cadastro
    # varia o e-mail a cada tentativa — então o freio aqui é por IP.
    try:
        crud_firebase.registrar_tentativa_de_registro(obter_ip_cliente(request))
    except crud_firebase.LimiteDeUsoExcedidoError:
        raise HTTPException(
            status_code=429,
            detail="Muitos cadastros a partir deste endereço em pouco tempo. Tente novamente mais tarde."
        )

    if crud_firebase.existe_email(dados.email):
        raise HTTPException(
            status_code=409,
            detail="Este e-mail já está cadastrado."
        )

    senha_hash = hash_senha(dados.senha)

    # Normaliza antes de gerar o hash (mesmo critério usado depois pra
    # conferir): "Rex", "rex" e " rex " têm que valer como a mesma resposta.
    resposta_hash = hash_senha(dados.resposta_seguranca.strip().lower())

    usuario = crud_firebase.criar_perfil_senha(
        dados.email,
        dados.nome,
        senha_hash,
        dados.pergunta_seguranca,
        resposta_hash,
        preferencias=dados.preferencias
    )

    if usuario is None:
        raise HTTPException(
            status_code=409,
            detail="Este e-mail já está cadastrado."
        )

    token = criar_token(uid=dados.email)

    return schemas.TokenResponse(
        access_token=token,
        uid=dados.email
    )


@router.post("/pergunta-seguranca", response_model=schemas.PerguntaSegurancaResponse)
def obter_pergunta_seguranca(dados: schemas.SolicitarRedefinicaoSenha):
    """Primeiro passo do "esqueci minha senha": devolve QUAL pergunta essa
    conta tem cadastrada, sem revelar a resposta.

    Usa o MESMO limite de tentativas do login/redefinição (por e-mail):
    sem isso, esta rota vira um jeito de descobrir, sem custo nenhum, quais
    e-mails têm conta cadastrada — testando e-mail atrás de e-mail até um
    devolver 200 em vez de 404."""
    exigir_conta_liberada(dados.email)

    documento = crud_firebase.buscar_documento_por_email(dados.email)

    sem_conta = HTTPException(
        status_code=404,
        detail="Não foi possível iniciar a redefinição de senha para este e-mail."
    )

    if documento is None or "resposta_seguranca_hash" not in documento:
        crud_firebase.registrar_falha_de_login(dados.email)
        raise sem_conta

    return schemas.PerguntaSegurancaResponse(pergunta=documento["pergunta_seguranca"])


@router.post("/redefinir-senha", response_model=schemas.TokenResponse)
def redefinir_senha(dados: schemas.RedefinirSenha):

    # A resposta de segurança é quem confirma a identidade aqui — conferida
    # com bcrypt, igual senha de login. O mesmo limite de tentativas do
    # login vale aqui: sem ele, dava pra tentar resposta atrás de resposta
    # até acertar.
    exigir_conta_liberada(dados.email)

    documento = crud_firebase.buscar_documento_por_email(dados.email)

    resposta_invalida = HTTPException(
        status_code=400,
        detail="E-mail ou resposta de segurança não conferem."
    )

    if documento is None or "resposta_seguranca_hash" not in documento:
        crud_firebase.registrar_falha_de_login(dados.email)
        raise resposta_invalida

    resposta_normalizada = dados.resposta_seguranca.strip().lower()

    if not verificar_senha(resposta_normalizada, documento["resposta_seguranca_hash"]):
        crud_firebase.registrar_falha_de_login(dados.email)
        raise resposta_invalida

    crud_firebase.limpar_tentativas_de_login(dados.email)

    senha_hash = hash_senha(dados.nova_senha)

    # A nova versão precisa ir junto no token emitido agora, senão a
    # pessoa ficaria deslogada da própria sessão que acabou de criar
    # (o token que ela mesma vai receber já teria a versão "velha").
    nova_versao = crud_firebase.atualizar_senha(dados.email, senha_hash)

    token = criar_token(uid=dados.email, versao=nova_versao)

    return schemas.TokenResponse(
        access_token=token,
        uid=dados.email
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login_com_senha(dados: schemas.LoginSenha):

    exigir_conta_liberada(dados.email)

    documento = crud_firebase.buscar_documento_por_email(dados.email)

    credenciais_invalidas = HTTPException(
        status_code=401,
        detail="E-mail ou senha inválidos."
    )

    # A mesma resposta pra "e-mail não existe" e "senha errada", de
    # propósito: distinguir os dois entregaria de graça a informação de
    # quais e-mails têm conta na plataforma.
    if documento is None or "senha_hash" not in documento:
        crud_firebase.registrar_falha_de_login(dados.email)
        raise credenciais_invalidas

    if not verificar_senha(dados.senha, documento["senha_hash"]):
        crud_firebase.registrar_falha_de_login(dados.email)
        raise credenciais_invalidas

    crud_firebase.limpar_tentativas_de_login(dados.email)

    token = criar_token(uid=dados.email, versao=documento.get("token_versao", 0))

    return schemas.TokenResponse(
        access_token=token,
        uid=dados.email
    )
