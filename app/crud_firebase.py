import logging
import uuid
from datetime import datetime, timedelta, timezone

from google.cloud import firestore
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from google.cloud.firestore_v1.base_query import FieldFilter

from app.firebase import db

logger = logging.getLogger(__name__)


class LimiteDeUsoExcedidoError(Exception):
    pass


def _dia_atual() -> str:
    return datetime.now(timezone(timedelta(hours=-3))).date().isoformat()


def _incrementar_contador_diario(
    referencia,
    campo_contagem: str,
    campo_dia: str,
    limite_padrao: int,
    campo_limite: str | None = None,
    campos_extra: dict | None = None,
) -> None:
    """Incrementa um contador "zera todo dia" (usado pelo limite de chat) de
    forma atômica, via transação do Firestore, e levanta
    LimiteDeUsoExcedidoError se já bateu o teto.

    Sem a transação, duas requisições simultâneas liam o mesmo valor ANTES
    de qualquer uma escrever de volta — as duas passavam na checagem e o
    limite diário furava exatamente no cenário que ele deveria evitar (um
    token vazado gerando uso sem freio).
    """
    hoje = _dia_atual()

    @firestore.transactional
    def _transacao(transacao):
        snapshot = referencia.get(transaction=transacao)

        if not snapshot.exists:
            return

        dados = snapshot.to_dict()
        limite = dados.get(campo_limite, limite_padrao) if campo_limite else limite_padrao
        uso_hoje = dados.get(campo_contagem, 0) if dados.get(campo_dia) == hoje else 0

        if uso_hoje >= limite:
            raise LimiteDeUsoExcedidoError()

        atualizacoes = {campo_contagem: uso_hoje + 1, campo_dia: hoje}

        if campos_extra:
            atualizacoes.update(campos_extra)

        transacao.update(referencia, atualizacoes)

    _transacao(db.transaction())


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------

def _perfil_dict(uid: str, dados: dict) -> dict:
    return {
        "id": uid,
        "nome": dados.get("nome"),
        "email": dados.get("email"),
        "status": dados.get("status", "ativo"),
        "preferencias": dados.get("preferencias") or {},
        # Ajustes do painel de acessibilidade (contraste, tamanho de texto,
        # cursor etc.). Formato livre de propósito: quem define o formato é
        # o painel no frontend, não o backend — assim um ajuste novo lá não
        # exige alterar nada aqui.
        "preferencias_visuais": dados.get("preferencias_visuais") or {}
    }


MENSAGEM_BOAS_VINDAS = "Bem-vindo(a) à UpLearn! Sua conta foi criada com sucesso."


def criar_perfil(uid: str, usuario):
    """Perfil de quem entrou com o Google. O uid vem sempre do token já
    verificado pelo Firebase (nunca do cliente)."""
    referencia = db.collection("usuarios").document(uid)

    if referencia.get().exists:
        return None

    dados = {
        "nome": usuario.nome,
        "email": usuario.email,
        "status": "ativo",
        "preferencias": (
            usuario.preferencias.model_dump(exclude_none=True)
            if usuario.preferencias
            else {}
        )
    }

    referencia.set(dados)

    criar_notificacao(uid, "boas_vindas", MENSAGEM_BOAS_VINDAS)

    return _perfil_dict(uid, dados)


def criar_perfil_senha(
    email: str,
    nome: str,
    senha_hash: str,
    pergunta_seguranca: str,
    resposta_seguranca_hash: str,
    preferencias=None
):
    # Sem Firebase Auth por trás, o próprio e-mail (normalizado) vira o id do
    # documento. create() falha se já existir, então duas requisições
    # simultâneas com o mesmo e-mail não criam duas contas.
    referencia = db.collection("usuarios").document(email)

    dados = {
        "nome": nome,
        "email": email,
        "senha_hash": senha_hash,
        "pergunta_seguranca": pergunta_seguranca,
        "resposta_seguranca_hash": resposta_seguranca_hash,
        "status": "ativo",
        "preferencias": (
            preferencias.model_dump(exclude_none=True)
            if preferencias
            else {}
        )
    }

    try:
        referencia.create(dados)
    except Exception as erro:
        # google.api_core.exceptions.AlreadyExists
        if erro.__class__.__name__ == "AlreadyExists":
            return None
        raise

    criar_notificacao(email, "boas_vindas", MENSAGEM_BOAS_VINDAS)

    return _perfil_dict(email, dados)


def existe_email(email: str) -> bool:
    return db.collection("usuarios").document(email).get().exists


def buscar_documento_por_email(email: str):
    # Usado só no login por senha: aqui precisamos do senha_hash,
    # que _perfil_dict nunca expõe pra fora da API.
    documento = db.collection("usuarios").document(email).get()

    if not documento.exists:
        return None

    return documento.to_dict()


def buscar_token_versao(uid: str) -> int:
    """0 se a conta não existe ou nunca trocou de senha — versão inicial
    implícita, sem precisar escrever o campo em toda conta nova."""
    documento = db.collection("usuarios").document(uid).get()

    if not documento.exists:
        return 0

    return documento.to_dict().get("token_versao", 0)


def atualizar_senha(email: str, senha_hash: str) -> int | None:
    """Troca o hash e sobe o token_versao — verificar_token (app/auth.py)
    confere essa versão a cada requisição, então qualquer token emitido
    ANTES desta troca vira inválido na hora.

    Devolve a nova versão (pra o router poder embutir ela no token que
    ele mesmo emite logo em seguida, senão a pessoa ficaria deslogada da
    própria sessão que acabou de criar ao redefinir a senha)."""
    referencia = db.collection("usuarios").document(email)
    documento = referencia.get()

    if not documento.exists:
        return None

    nova_versao = documento.to_dict().get("token_versao", 0) + 1

    criar_notificacao(email, "seguranca", "Sua senha foi alterada. Se não foi você, redefina de novo agora.")

    referencia.update({
        "senha_hash": senha_hash,
        "token_versao": nova_versao,
    })

    return nova_versao


def buscar_usuario(uid: str):
    documento = db.collection("usuarios").document(uid).get()

    if not documento.exists:
        return None

    return _perfil_dict(uid, documento.to_dict())


def atualizar_usuario(uid: str, dados):
    referencia = db.collection("usuarios").document(uid)

    documento = referencia.get()

    if not documento.exists:
        return None

    atualizacoes = dados.model_dump(exclude_unset=True, exclude_none=True)

    dados_atuais = documento.to_dict()

    # O Firestore substitui o mapa inteiro quando recebe um dict aninhado.
    # Usar caminhos com ponto atualiza só os campos realmente enviados.
    preferencias = atualizacoes.pop("preferencias", None)

    dados_atuais.update(atualizacoes)

    if preferencias:
        dados_atuais["preferencias"] = {
            **dados_atuais.get("preferencias", {}),
            **preferencias
        }
        for campo, valor in preferencias.items():
            atualizacoes[f"preferencias.{campo}"] = valor

    if atualizacoes:
        referencia.update(atualizacoes)

    return _perfil_dict(uid, dados_atuais)


def redefinir_preferencias(uid: str):
    """Volta as preferências de aprendizagem pro estado inicial (nenhuma
    escolhida). Usa .update() com o mapa inteiro, não caminho com ponto —
    é o único jeito de LIMPAR campos que a pessoa tinha escolhido antes,
    em vez de só sobrescrever os que vierem na requisição."""
    referencia = db.collection("usuarios").document(uid)
    documento = referencia.get()

    if not documento.exists:
        return None

    referencia.update({"preferencias": {}})

    dados_atuais = documento.to_dict()
    dados_atuais["preferencias"] = {}

    return _perfil_dict(uid, dados_atuais)


def salvar_preferencias_visuais(uid: str, preferencias_visuais: dict):
    """Sobrescreve o painel de acessibilidade inteiro (não faz merge campo a
    campo) — é assim que o painel no frontend sempre manda o estado, então
    reflete exatamente o que a pessoa vê na tela dela."""
    referencia = db.collection("usuarios").document(uid)
    documento = referencia.get()

    if not documento.exists:
        return None

    referencia.update({"preferencias_visuais": preferencias_visuais})

    dados_atuais = documento.to_dict()
    dados_atuais["preferencias_visuais"] = preferencias_visuais

    return _perfil_dict(uid, dados_atuais)


# ---------------------------------------------------------------------------
# Chat com a tutora
# ---------------------------------------------------------------------------

LIMITE_DIARIO_CHAT_USUARIO = 300


def registrar_uso_chat(uid: str):
    """Limite diário por pessoa — protege contra um token vazado gerando
    custo de IA sem freio. Fica no Firestore, não em memória, pelo mesmo
    motivo do bloqueio de login: a API pode rodar em mais de uma instância.

    Também vale pro quiz e pra geração de plano, que gastam IA do mesmo jeito."""
    referencia = db.collection("usuarios").document(uid)

    _incrementar_contador_diario(
        referencia, "contagem_chat_uso", "contagem_chat_dia", LIMITE_DIARIO_CHAT_USUARIO
    )


def salvar_mensagem(uid: str, role: str, content: str, materia: str | None = None):
    dados = {
        "role": role,
        "content": content,
        "criado_em": SERVER_TIMESTAMP
    }

    if materia:
        dados["materia"] = materia

    db.collection("usuarios").document(uid).collection("mensagens").add(dados)


def listar_mensagens(uid: str, limite: int = 50):
    # limit_to_last() não pode ser usado com .stream() (limitação do
    # cliente do Firestore) — precisa de .get(), que já retorna a lista pronta.
    documentos = (
        db.collection("usuarios").document(uid).collection("mensagens")
        .order_by("criado_em")
        .limit_to_last(limite)
        .get()
    )

    return [
        {"role": doc.to_dict()["role"], "content": doc.to_dict()["content"]}
        for doc in documentos
    ]


def listar_mensagens_com_data(uid: str, limite: int = 300):
    # Igual a listar_mensagens(), mas carregando também o horário de cada
    # mensagem — é o que permite montar os gráficos de atividade.
    documentos = (
        db.collection("usuarios").document(uid).collection("mensagens")
        .order_by("criado_em")
        .limit_to_last(limite)
        .get()
    )

    mensagens = []

    for doc in documentos:
        dados = doc.to_dict()

        mensagens.append({
            "role": dados["role"],
            "content": dados["content"],
            # criado_em pode vir None se o documento acabou de ser criado e o
            # SERVER_TIMESTAMP ainda não foi resolvido pelo Firestore.
            "criado_em": dados.get("criado_em")
        })

    return mensagens


# ---------------------------------------------------------------------------
# Notificações
# ---------------------------------------------------------------------------

def criar_notificacao(uid: str, tipo: str, mensagem: str) -> None:
    """Notificação real de eventos da própria conta (boas-vindas, senha
    alterada, plano criado) — nada de frase sorteada no frontend."""
    db.collection("usuarios").document(uid).collection("notificacoes").add({
        "tipo": tipo,
        "mensagem": mensagem,
        "lida": False,
        "criado_em": SERVER_TIMESTAMP
    })


def listar_notificacoes(uid: str, limite: int = 20):
    documentos = (
        db.collection("usuarios").document(uid).collection("notificacoes")
        .order_by("criado_em", direction=firestore.Query.DESCENDING)
        .limit(limite)
        .get()
    )

    return [
        {
            "id": documento.id,
            "tipo": documento.to_dict()["tipo"],
            "mensagem": documento.to_dict()["mensagem"],
            "lida": documento.to_dict().get("lida", False),
            "criado_em": documento.to_dict().get("criado_em")
        }
        for documento in documentos
    ]


def marcar_notificacoes_como_lidas(uid: str) -> None:
    documentos = (
        db.collection("usuarios").document(uid).collection("notificacoes")
        .where(filter=FieldFilter("lida", "==", False))
        .get()
    )

    lote = db.batch()

    for documento in documentos:
        lote.update(documento.reference, {"lida": True})

    lote.commit()


# ---------------------------------------------------------------------------
# Planos de estudo
# ---------------------------------------------------------------------------

LIMITE_PLANOS_POR_USUARIO = 20


class LimiteDePlanosError(Exception):
    pass


def _plano_dict(documento) -> dict:
    dados = documento.to_dict()

    return {
        "id": documento.id,
        "titulo": dados.get("titulo", ""),
        "materia": dados.get("materia", ""),
        "conteudo": dados.get("conteudo", ""),
        "objetivo": dados.get("objetivo"),
        "data_avaliacao": dados.get("data_avaliacao"),
        "pausado": dados.get("pausado", False),
        "criado_em": dados.get("criado_em"),
        "tarefas": dados.get("tarefas", []),
        "mapa": dados.get("mapa"),
    }


def _colecao_planos(uid: str):
    return db.collection("usuarios").document(uid).collection("planos")


def criar_plano(uid: str, dados: dict) -> dict:
    """dados: titulo, materia, conteudo, objetivo, data_avaliacao, tarefas."""
    colecao = _colecao_planos(uid)

    # Teto de planos guardados por pessoa — sem ele, dava pra encher o banco
    # chamando a geração em loop.
    if len(list(colecao.limit(LIMITE_PLANOS_POR_USUARIO).stream())) >= LIMITE_PLANOS_POR_USUARIO:
        raise LimiteDePlanosError()

    referencia = colecao.document()

    referencia.set({**dados, "pausado": False, "criado_em": SERVER_TIMESTAMP})

    return _plano_dict(referencia.get())


def listar_planos(uid: str) -> list[dict]:
    documentos = _colecao_planos(uid).order_by(
        "criado_em", direction=firestore.Query.DESCENDING
    ).limit(LIMITE_PLANOS_POR_USUARIO).get()

    return [_plano_dict(d) for d in documentos]


def buscar_plano(uid: str, plano_id: str) -> dict | None:
    documento = _colecao_planos(uid).document(plano_id).get()

    if not documento.exists:
        return None

    return _plano_dict(documento)


def atualizar_plano(uid: str, plano_id: str, titulo: str, pausado: bool, tarefas: list[dict]) -> dict | None:
    referencia = _colecao_planos(uid).document(plano_id)

    if not referencia.get().exists:
        return None

    referencia.update({"titulo": titulo, "pausado": pausado, "tarefas": tarefas})

    return _plano_dict(referencia.get())


def salvar_mapa_plano(uid: str, plano_id: str, mapa: dict) -> dict | None:
    """Guarda o mapa gerado pela IA no próprio plano (pra baixar de novo sem gastar IA)."""
    referencia = _colecao_planos(uid).document(plano_id)

    if not referencia.get().exists:
        return None

    referencia.update({"mapa": mapa})

    return _plano_dict(referencia.get())


def deletar_plano(uid: str, plano_id: str) -> bool:
    referencia = _colecao_planos(uid).document(plano_id)

    if not referencia.get().exists:
        return False

    referencia.delete()

    return True


def novo_id_tarefa() -> str:
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Revisão espaçada (questões erradas que voltam na hora certa)
# ---------------------------------------------------------------------------

def _colecao_revisao(uid: str):
    return db.collection("usuarios").document(uid).collection("revisao")


def salvar_cartoes_revisao(uid: str, materia: str, cartoes: list[dict], proxima: str) -> None:
    for cartao in cartoes:
        _colecao_revisao(uid).add({
            **cartao,
            "materia": materia,
            "caixa": 0,
            "proxima_revisao": proxima,
            "criado_em": SERVER_TIMESTAMP,
        })


def listar_cartoes_revisao(uid: str, ate: str, limite: int) -> list[dict]:
    """Cartões cuja data de revisão já chegou (ISO yyyy-mm-dd compara como texto)."""
    documentos = (
        _colecao_revisao(uid)
        .where(filter=FieldFilter("proxima_revisao", "<=", ate))
        .limit(limite)
        .get()
    )

    return [{"id": d.id, **d.to_dict()} for d in documentos]


def contar_cartoes_revisao(uid: str, ate: str) -> int:
    documentos = (
        _colecao_revisao(uid)
        .where(filter=FieldFilter("proxima_revisao", "<=", ate))
        .limit(100)
        .get()
    )

    return len(documentos)


def buscar_cartao_revisao(uid: str, cartao_id: str) -> dict | None:
    documento = _colecao_revisao(uid).document(cartao_id).get()

    return {"id": documento.id, **documento.to_dict()} if documento.exists else None


def atualizar_cartao_revisao(uid: str, cartao_id: str, caixa: int, proxima: str | None) -> None:
    referencia = _colecao_revisao(uid).document(cartao_id)

    # Dominado: sai da fila de vez (guardar só ocuparia espaço).
    if proxima is None:
        referencia.delete()
        return

    referencia.update({"caixa": caixa, "proxima_revisao": proxima})


# ---------------------------------------------------------------------------
# Exportação dos dados da conta (direito de acesso da LGPD)
# ---------------------------------------------------------------------------

def _serializavel(valor):
    if isinstance(valor, datetime):
        return valor.isoformat()

    if isinstance(valor, dict):
        return {k: _serializavel(v) for k, v in valor.items()}

    if isinstance(valor, list):
        return [_serializavel(v) for v in valor]

    return valor


def exportar_dados(uid: str) -> dict | None:
    referencia = db.collection("usuarios").document(uid)
    documento = referencia.get()

    if not documento.exists:
        return None

    dados = documento.to_dict()

    # Nada de hash de senha, versão de token ou resposta de segurança no arquivo.
    for campo in ("senha_hash", "token_versao", "resposta_seguranca_hash"):
        dados.pop(campo, None)

    exportado = {"perfil": _serializavel(dados)}

    for nome in SUBCOLECOES_DO_USUARIO:
        exportado[nome] = [
            {"id": d.id, **_serializavel(d.to_dict())}
            for d in referencia.collection(nome).stream()
        ]

    return exportado


# ---------------------------------------------------------------------------
# Exercícios (resultado dos quizzes)
# ---------------------------------------------------------------------------

LIMITE_EXERCICIOS_LISTADOS = 200


def salvar_exercicio(uid: str, materia: str, conteudo: str, total: int, acertos: int) -> None:
    db.collection("usuarios").document(uid).collection("exercicios").add({
        "materia": materia,
        "conteudo": conteudo,
        "total": total,
        "acertos": acertos,
        "criado_em": SERVER_TIMESTAMP,
    })


def listar_exercicios(uid: str, limite: int = LIMITE_EXERCICIOS_LISTADOS) -> list[dict]:
    documentos = (
        db.collection("usuarios").document(uid).collection("exercicios")
        .order_by("criado_em", direction=firestore.Query.DESCENDING)
        .limit(limite)
        .get()
    )

    return [
        {
            "materia": d.to_dict().get("materia", ""),
            "conteudo": d.to_dict().get("conteudo", ""),
            "total": d.to_dict().get("total", 0),
            "acertos": d.to_dict().get("acertos", 0),
            "criado_em": d.to_dict().get("criado_em"),
        }
        for d in documentos
    ]


"""Bloqueio temporário depois de várias senhas erradas.

A contagem fica no Firestore, não em memória, de propósito: em produção a API
pode rodar em mais de uma instância (ou serverless), e um contador em memória
seria zerado a cada processo novo — ou seja, não protegeria nada.

O bloqueio é por conta, não por IP: quem tenta adivinhar a senha de alguém
troca de IP com facilidade, mas o alvo continua sendo a mesma conta.
"""

MAX_TENTATIVAS = 5
BLOQUEIO_MINUTOS = 15


def _referencia_tentativas(email: str):
    return db.collection("tentativas_login").document(email)


def _venceu(dados: dict) -> bool:
    """Registro mais velho que a janela de bloqueio não serve mais pra nada."""
    ultima = dados.get("ultima_falha")

    if ultima is None:
        return True

    return datetime.now(timezone.utc) - ultima >= timedelta(minutes=BLOQUEIO_MINUTOS)


def segundos_de_bloqueio(email: str) -> int:
    """0 se pode tentar; senão, quantos segundos faltam pra liberar."""
    referencia = _referencia_tentativas(email)
    documento = referencia.get()

    if not documento.exists:
        return 0

    dados = documento.to_dict()

    # Vencido: apaga em vez de só ignorar. Este registro guarda um e-mail
    # e um horário — não pode ficar no banco depois de perder a utilidade.
    if _venceu(dados):
        referencia.delete()
        return 0

    if dados.get("falhas", 0) < MAX_TENTATIVAS:
        return 0

    liberado_em = dados["ultima_falha"] + timedelta(minutes=BLOQUEIO_MINUTOS)
    restante = (liberado_em - datetime.now(timezone.utc)).total_seconds()

    return max(0, int(restante))


def registrar_falha_de_login(email: str):
    referencia = _referencia_tentativas(email)
    documento = referencia.get()

    falhas = 0

    if documento.exists:
        dados = documento.to_dict()
        # Erro de digitação de semana passada não soma com o de hoje.
        falhas = 0 if _venceu(dados) else dados.get("falhas", 0)

    agora = datetime.now(timezone.utc)

    referencia.set({
        "falhas": falhas + 1,
        "ultima_falha": agora,
        # Campo existe só pra uma política de TTL do Firestore poder apagar
        # sozinha o que ninguém mais consultar. A limpeza acima cobre quem
        # volta a tentar; o TTL cobre quem nunca mais aparece. Precisa ser
        # ligado uma vez no console: Firestore > TTL, coleção
        # "tentativas_login", campo "expira_em".
        "expira_em": agora + timedelta(minutes=BLOQUEIO_MINUTOS),
    })


def limpar_tentativas_de_login(email: str):
    """Acertou a senha: a contagem some, pra um erro de digitação de ontem
    não somar com o de hoje."""
    _referencia_tentativas(email).delete()


"""Limite de cadastros por IP.

Diferente do bloqueio de login (por conta), quem faz spam de cadastro varia o
e-mail a cada tentativa — não tem conta pra bloquear ainda, porque é isso que
está sendo criado. Por isso este limite é por IP."""

LIMITE_REGISTROS_POR_IP = 5
JANELA_REGISTRO_MINUTOS = 60


def _referencia_registros(ip: str):
    return db.collection("tentativas_registro").document(ip)


def registrar_tentativa_de_registro(ip: str):
    """Conta mais um cadastro vindo desse IP na última hora; bloqueia
    quando passa do limite. LimiteDeUsoExcedidoError é a mesma exceção já
    usada pelo limite diário de chat — o tratamento no router é sempre o
    mesmo: virar 429."""
    referencia = _referencia_registros(ip)
    documento = referencia.get()
    agora = datetime.now(timezone.utc)

    if documento.exists:
        dados = documento.to_dict()
        primeira_tentativa = dados.get("primeira_tentativa")

        if primeira_tentativa and agora - primeira_tentativa < timedelta(minutes=JANELA_REGISTRO_MINUTOS):
            if dados.get("contagem", 0) >= LIMITE_REGISTROS_POR_IP:
                raise LimiteDeUsoExcedidoError()

            referencia.update({"contagem": dados.get("contagem", 0) + 1})
            return

    referencia.set({
        "contagem": 1,
        "primeira_tentativa": agora,
        # TTL do Firestore apaga sozinho o que ninguém mais consultar —
        # precisa ser ligado uma vez no console (Firestore > TTL, coleção
        # "tentativas_registro", campo "expira_em"), igual o de login.
        "expira_em": agora + timedelta(minutes=JANELA_REGISTRO_MINUTOS),
    })


# ---------------------------------------------------------------------------
# Exclusão de conta
# ---------------------------------------------------------------------------

# Subcoleções que pertencem à pessoa. O Firestore não apaga subcoleções junto
# com o documento pai, então excluir a conta (direito de exclusão da LGPD)
# precisa passar por todas elas.
SUBCOLECOES_DO_USUARIO = ("mensagens", "notificacoes", "planos", "exercicios", "revisao")


def deletar_usuario(uid: str):
    referencia = db.collection("usuarios").document(uid)

    documento = referencia.get()

    if not documento.exists:
        return None

    for nome in SUBCOLECOES_DO_USUARIO:
        for item in referencia.collection(nome).stream():
            item.reference.delete()

    referencia.delete()

    _referencia_tentativas(uid).delete()

    return {"id": uid}
