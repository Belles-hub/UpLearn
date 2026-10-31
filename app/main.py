import os

import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth_senha,
    chat,
    desempenho,
    exercicios,
    notificacoes,
    perfil,
    planos,
    revisao,
    usuarios,
)

load_dotenv()

# Monitoramento de erro em produção — só liga se SENTRY_DSN estiver
# configurada (variável de ambiente, não fica hardcoded aqui). Sem ela,
# isto não faz nada: continua tudo funcionando igual, só sem reportar
# erros pra lugar nenhum. Precisa de uma conta em sentry.io (tem plano
# gratuito) pra gerar o DSN.
sentry_dsn = os.environ.get("SENTRY_DSN")

if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        # % de requisições rastreadas pra performance (não é amostra de
        # erro — erro sempre é capturado). 20% é um meio-termo razoável
        # pra não estourar a cota do plano gratuito com um volume alto.
        traces_sample_rate=0.2,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
    )


app = FastAPI(
    title="UpLearn API",
    description="API da UpLearn: aprendizagem com IA, acessível e personalizada.",
    version="2.0.0"
)

# Domínios que podem chamar a API pelo navegador.
ORIGENS_PERMITIDAS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

# Em produção, adicione a URL real do frontend na variável de ambiente
# CORS_ORIGINS_EXTRA (separadas por vírgula), sem precisar mexer no código.
origens_extra = os.environ.get("CORS_ORIGINS_EXTRA", "")

if origens_extra:
    ORIGENS_PERMITIDAS += [
        origem.strip() for origem in origens_extra.split(",") if origem.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_PERMITIDAS,
    allow_credentials=True,
    # Lista explícita (não "*"): a API só usa estes métodos e headers de
    # verdade — dar só o que é realmente necessário reduz o estrago se um
    # dia a lista de origens acabar ficando ampla demais por engano.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


app.include_router(usuarios.router)
app.include_router(auth_senha.router)
app.include_router(perfil.router)
app.include_router(chat.router)
app.include_router(planos.router)
app.include_router(exercicios.router)
app.include_router(desempenho.router)
app.include_router(notificacoes.router)
app.include_router(revisao.router)


@app.middleware("http")
async def cabecalhos_de_seguranca(request, call_next):
    resposta = await call_next(request)

    resposta.headers.setdefault("X-Content-Type-Options", "nosniff")
    resposta.headers.setdefault("X-Frame-Options", "DENY")
    resposta.headers.setdefault("Referrer-Policy", "no-referrer")

    return resposta


@app.get("/health")
def health():
    """Para o Render e monitores de uptime: não toca em banco nem em IA."""
    return {"status": "ok"}


@app.get("/")
def home():
    return {
        "mensagem": "Bem-vindo à API da UpLearn!",
        "status": "online"
    }
