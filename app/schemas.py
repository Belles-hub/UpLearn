import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TipoResposta = Literal["curtas", "detalhadas"]
TamanhoFonte = Literal["pequena", "media", "grande"]
ModoUso = Literal["texto", "audio", "libras"]

# Como a pessoa prefere aprender — as seis opções da tela "Como você prefere
# aprender?". É uma preferência, não um diagnóstico: a tutora só usa isso
# pra escolher o formato da explicação, e a pessoa pode trocar quando quiser.
EstiloAprendizagem = Literal[
    "resumos", "passo_a_passo", "mnemonica", "quizzes", "conversa", "pratica"
]
DuracaoSessao = Literal["curta", "media", "longa"]

# Modos da tutora (briefing, seção 10).
ModoTutora = Literal["aprender", "praticar", "revisar", "duvidas", "desafio"]


class Preferencias(BaseModel):
    tipo_resposta: TipoResposta | None = None
    tamanho_fonte: TamanhoFonte | None = None
    modo_uso: ModoUso | None = None
    estilo_aprendizagem: EstiloAprendizagem | None = None
    duracao_sessao: DuracaoSessao | None = None
    # Texto livre, com teto de tamanho: são só rótulos ("6º ano", "Matemática").
    serie: str | None = Field(default=None, max_length=40)
    materias: list[str] | None = Field(default=None, max_length=12)
    objetivo: str | None = Field(default=None, max_length=200)
    # Marca que a pessoa passou (ou pulou) o onboarding — sem isso o app
    # perguntaria de novo a cada login.
    onboarding_concluido: bool | None = None
    # Qual personagem aparece no perfil (só um rótulo, ex.: "estrela").
    avatar: str | None = Field(default=None, max_length=20)

    @field_validator("materias")
    @classmethod
    def materias_limpas(cls, valor: list[str] | None) -> list[str] | None:
        if valor is None:
            return None

        limpas = [m.strip()[:40] for m in valor if m and m.strip()]

        return limpas


# Restrito de propósito: o e-mail vira o id do documento no Firestore, e um id
# não pode conter "/" (viraria um caminho de subcoleção).
_EMAIL = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$")


def _normalizar_email(valor: str) -> str:
    """E-mail é o identificador da conta: minúsculo e sem espaços, senão
    "Ana@x.com" e "ana@x.com" virariam duas contas diferentes."""
    limpo = valor.strip().lower()

    if not _EMAIL.match(limpo) or len(limpo) > 254:
        raise ValueError("Digite um e-mail válido (ex.: nome@exemplo.com).")

    return limpo


def _nome_valido(valor: str) -> str:
    valor = valor.strip()

    if len(valor) < 2:
        raise ValueError("Digite seu nome.")

    if len(valor) > 80:
        raise ValueError("O nome pode ter no máximo 80 caracteres.")

    return valor


def _senha_valida(valor: str) -> str:
    if len(valor) < 6:
        raise ValueError("A senha precisa ter pelo menos 6 caracteres.")

    if len(valor) > 72:
        # bcrypt só olha os primeiros 72 bytes: melhor recusar do que
        # aceitar uma senha que seria silenciosamente truncada.
        raise ValueError("A senha pode ter no máximo 72 caracteres.")

    return valor


class UsuarioCreate(BaseModel):
    """Perfil de quem entrou com o Google (o Firebase já provou o e-mail)."""
    nome: str
    email: str
    preferencias: Preferencias | None = None

    @field_validator("nome")
    @classmethod
    def nome_ok(cls, valor: str) -> str:
        return _nome_valido(valor)

    @field_validator("email")
    @classmethod
    def email_ok(cls, valor: str) -> str:
        return _normalizar_email(valor)


class UsuarioResponse(BaseModel):
    id: str
    nome: str
    email: str | None = None
    status: str
    preferencias: Preferencias

    model_config = ConfigDict(from_attributes=True)


class UsuarioUpdate(BaseModel):
    # O e-mail não entra aqui de propósito: ele é o identificador da conta
    # (id do documento) — trocar exigiria "mudar o documento de endereço".
    nome: str | None = None
    preferencias: Preferencias | None = None

    @field_validator("nome")
    @classmethod
    def nome_ok(cls, valor: str | None) -> str | None:
        return _nome_valido(valor) if valor is not None else None


class UsuarioRegistroSenha(BaseModel):
    nome: str
    email: str
    senha: str
    # Confirmação de que leu os Termos. Como o público inclui menores, o texto
    # dos Termos pede que um responsável acompanhe o cadastro.
    aceitou_termos: bool
    # A pergunta de segurança é quem confirma a identidade depois, no
    # "esqueci minha senha" — ainda não existe envio de e-mail no projeto.
    pergunta_seguranca: str
    resposta_seguranca: str
    preferencias: Preferencias | None = None

    @field_validator("nome")
    @classmethod
    def nome_ok(cls, valor: str) -> str:
        return _nome_valido(valor)

    @field_validator("email")
    @classmethod
    def email_ok(cls, valor: str) -> str:
        return _normalizar_email(valor)

    @field_validator("senha")
    @classmethod
    def senha_ok(cls, valor: str) -> str:
        return _senha_valida(valor)

    @field_validator("aceitou_termos")
    @classmethod
    def termos_obrigatorios(cls, valor: bool) -> bool:
        if not valor:
            raise ValueError("Você precisa aceitar os Termos de Uso e a Política de Privacidade.")
        return valor

    @field_validator("pergunta_seguranca")
    @classmethod
    def pergunta_nao_pode_ser_vazia(cls, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 5:
            raise ValueError("Escolha uma pergunta de segurança.")
        return valor

    @field_validator("resposta_seguranca")
    @classmethod
    def resposta_nao_pode_ser_vazia(cls, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 2:
            raise ValueError("Escreva uma resposta pra sua pergunta de segurança.")
        return valor


class LoginSenha(BaseModel):
    email: str
    senha: str

    @field_validator("email")
    @classmethod
    def email_ok(cls, valor: str) -> str:
        return _normalizar_email(valor)


class SolicitarRedefinicaoSenha(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_ok(cls, valor: str) -> str:
        return _normalizar_email(valor)


class PerguntaSegurancaResponse(BaseModel):
    pergunta: str


class RedefinirSenha(BaseModel):
    email: str
    resposta_seguranca: str
    nova_senha: str

    @field_validator("email")
    @classmethod
    def email_ok(cls, valor: str) -> str:
        return _normalizar_email(valor)

    @field_validator("nova_senha")
    @classmethod
    def senha_ok(cls, valor: str) -> str:
        return _senha_valida(valor)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    uid: str


class ChatMensagem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


# Limites do material anexado (o texto já vem lido pela rota /chat/material).
MAX_MATERIAIS_POR_CONVERSA = 4
MAX_CHARS_TODO_MATERIAL = 24000


class MaterialAnexado(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    texto: str = Field(min_length=1, max_length=9000)


class MaterialArquivo(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    # Arquivo em base64 (o tipo é conferido pelos bytes, não por este campo).
    dados: str = Field(min_length=8, max_length=7_500_000)


class MaterialLido(BaseModel):
    nome: str
    tipo: Literal["imagem", "documento"]
    texto: str
    aviso: str | None = None


class ChatRequest(BaseModel):
    mensagem: str = Field(min_length=1, max_length=500)
    historico: list[ChatMensagem] = Field(default=[], max_length=40)
    # Material de sala de aula que o estudante anexou nesta conversa.
    material: list[MaterialAnexado] = Field(default=[], max_length=MAX_MATERIAIS_POR_CONVERSA)
    # Tamanho de fonte que a pessoa está usando agora na tela — pode ser
    # diferente do que ela escolheu no onboarding.
    tamanho_fonte_atual: TamanhoFonte | None = None
    modo: ModoTutora = "duvidas"
    materia: str | None = Field(default=None, max_length=40)
    # Ajuste "Linguagem simples" do painel de acessibilidade, valendo agora.
    linguagem_simples: bool = False

    @field_validator("material")
    @classmethod
    def material_nao_passa_do_limite(cls, itens: list[MaterialAnexado]) -> list[MaterialAnexado]:
        if sum(len(m.texto) for m in itens) > MAX_CHARS_TODO_MATERIAL:
            raise ValueError("Material demais nesta conversa. Remova algum arquivo.")

        return itens


class ChatResponse(BaseModel):
    resposta: str


# ---------------------------------------------------------------------------
# Plano de estudos
# ---------------------------------------------------------------------------

TipoTarefa = Literal["estudo", "exercicio", "revisao", "pausa"]


class Tarefa(BaseModel):
    id: str = Field(max_length=40)
    titulo: str = Field(min_length=1, max_length=120)
    tipo: TipoTarefa = "estudo"
    duracao_min: int = Field(default=20, ge=1, le=180)
    # "YYYY-MM-DD" — dia sugerido; a pessoa pode mudar.
    dia: str | None = Field(default=None, max_length=10)
    concluida: bool = False

    @field_validator("dia")
    @classmethod
    def dia_valido(cls, valor: str | None) -> str | None:
        if valor in (None, ""):
            return None

        try:
            datetime.strptime(valor, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Use o formato AAAA-MM-DD para o dia.")

        return valor


class GerarPlanoRequest(BaseModel):
    materia: str = Field(min_length=2, max_length=40)
    conteudo: str = Field(min_length=2, max_length=200)
    objetivo: str | None = Field(default=None, max_length=200)
    # Minutos que a pessoa consegue estudar por dia. O teto evita planos
    # que incentivem estudo em excesso.
    minutos_por_dia: int = Field(default=30, ge=10, le=120)
    data_avaliacao: str | None = Field(default=None, max_length=10)
    dificuldade: Literal["facil", "media", "dificil"] = "media"

    @field_validator("data_avaliacao")
    @classmethod
    def data_valida(cls, valor: str | None) -> str | None:
        if valor in (None, ""):
            return None

        try:
            datetime.strptime(valor, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Use o formato AAAA-MM-DD para a data da avaliação.")

        return valor


class PlanoAtualizar(BaseModel):
    """O plano é editado por inteiro (adicionar, remover, reordenar, marcar
    como feito): o frontend manda a lista final de tarefas."""
    titulo: str = Field(min_length=1, max_length=120)
    pausado: bool = False
    tarefas: list[Tarefa] = Field(max_length=60)


class MapaRamo(BaseModel):
    titulo: str = Field(max_length=60)
    pontos: list[str] = Field(default=[], max_length=4)


class MapaEtapa(BaseModel):
    dia: str = Field(max_length=10)
    meta: str = Field(max_length=120)


class MapaPlano(BaseModel):
    """Mapa personalizado que a IA desenha pro plano (o PDF é montado no navegador)."""
    resumo: str = ""
    ramos: list[MapaRamo] = Field(default=[], max_length=6)
    etapas: list[MapaEtapa] = Field(default=[], max_length=60)
    estrategias: list[str] = Field(default=[], max_length=4)
    perguntas: list[str] = Field(default=[], max_length=5)
    mensagem: str = ""
    gerado_em: datetime | None = None


class FichaTopico(BaseModel):
    titulo: str = Field(max_length=70)
    pontos: list[str] = Field(default=[], max_length=5)


class FichaCartao(BaseModel):
    frente: str = Field(max_length=130)
    verso: str = Field(max_length=200)


class FichasPlano(BaseModel):
    """Resumo de estudo e flashcards que a IA prepara pro plano (os PDFs são montados no navegador)."""
    resumo: list[FichaTopico] = Field(default=[], max_length=8)
    cartoes: list[FichaCartao] = Field(default=[], max_length=20)
    gerado_em: datetime | None = None


class PlanoResponse(BaseModel):
    id: str
    titulo: str
    materia: str
    conteudo: str
    objetivo: str | None = None
    data_avaliacao: str | None = None
    pausado: bool = False
    criado_em: datetime | None = None
    tarefas: list[Tarefa]
    mapa: MapaPlano | None = None
    fichas: FichasPlano | None = None


# ---------------------------------------------------------------------------
# Exercícios (quiz) e desempenho
# ---------------------------------------------------------------------------

class GerarQuizRequest(BaseModel):
    materia: str = Field(min_length=2, max_length=40)
    conteudo: str = Field(min_length=2, max_length=200)
    quantidade: int = Field(default=5, ge=3, le=8)


class QuestaoQuiz(BaseModel):
    enunciado: str
    alternativas: list[str]
    correta: int
    explicacao: str


class QuizResponse(BaseModel):
    materia: str
    conteudo: str
    questoes: list[QuestaoQuiz]


class QuestaoErrada(BaseModel):
    """Questão que a pessoa errou — vira cartão de revisão espaçada."""
    enunciado: str = Field(min_length=1, max_length=400)
    alternativas: list[str] = Field(min_length=4, max_length=4)
    correta: int = Field(ge=0, le=3)
    explicacao: str = Field(default="", max_length=400)


class ResultadoExercicio(BaseModel):
    materia: str = Field(min_length=2, max_length=40)
    conteudo: str = Field(min_length=2, max_length=200)
    total: int = Field(ge=1, le=20)
    acertos: int = Field(ge=0, le=20)
    erradas: list[QuestaoErrada] = Field(default_factory=list, max_length=20)

    @field_validator("acertos")
    @classmethod
    def acertos_nao_passam_do_total(cls, valor: int, info) -> int:
        total = info.data.get("total")

        if total is not None and valor > total:
            raise ValueError("O número de acertos não pode passar do total de questões.")

        return valor


class DesempenhoMateria(BaseModel):
    materia: str
    exercicios: int
    questoes: int
    acertos: int
    # 0 a 100. Só existe quando há exercícios avaliados de verdade.
    taxa_acerto: int
    precisa_revisar: bool


class Conquista(BaseModel):
    id: str
    titulo: str
    descricao: str
    conquistada: bool


class AtividadeDia(BaseModel):
    dia: str
    rotulo: str
    perguntas: int


class Contagem(BaseModel):
    id: str
    nome: str
    perguntas: int


class Recomendacao(BaseModel):
    titulo: str
    motivo: str


class ProgressoPlanos(BaseModel):
    planos: int
    tarefas_total: int
    tarefas_concluidas: int
    minutos_estudados: int


class DesempenhoResponse(BaseModel):
    """Tudo é contado a partir do que foi de fato registrado (conversas,
    tarefas concluídas, exercícios) — nada é estimado nem inventado."""
    total_perguntas: int
    dias_ativos: int
    primeira_conversa: str | None = None
    ultima_conversa: str | None = None
    atividade_por_dia: list[AtividadeDia]
    materias_conversadas: list[Contagem]
    materias_exercicios: list[DesempenhoMateria]
    progresso_planos: ProgressoPlanos
    exercicios_total: int
    resumo: str | None = None
    recomendacoes: list[Recomendacao]
    conquistas: list[Conquista]
    # Dias com atividade nos últimos 7 — uma "sequência flexível": mostra
    # constância sem zerar nem punir quando a pessoa pula um dia.
    dias_ativos_ultima_semana: int
    preferencias: Preferencias
    analise_disponivel: bool = True


class ResumoRapido(BaseModel):
    """Versão leve do painel (sem IA) — é o que a tela inicial usa, pra abrir
    rápido e sem gastar o limite diário de mensagens."""
    total_perguntas: int
    dias_ativos_ultima_semana: int
    atividade_por_dia: list[AtividadeDia]
    progresso_planos: ProgressoPlanos
    exercicios_total: int
    sequencia_dias: int = 0
    revisao_pendente: int = 0


class CartaoRevisao(BaseModel):
    id: str
    materia: str
    enunciado: str
    alternativas: list[str]
    correta: int
    explicacao: str = ""
    caixa: int


class ResultadoRevisao(BaseModel):
    acertou: bool


class Notificacao(BaseModel):
    id: str
    tipo: str
    mensagem: str
    lida: bool
    criado_em: datetime | None = None
