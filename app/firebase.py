import json
import os

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

load_dotenv()

credenciais_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")

if credenciais_json:
    # Produção (ex: Render): a chave de serviço inteira vai numa variável
    # de ambiente, já que o .json não pode ser commitado no git.
    dados_credencial = json.loads(credenciais_json)
else:
    # Desenvolvimento local: lê do arquivo (está no .gitignore).
    with open("credentials/firebase-service-account.json", encoding="utf-8") as arquivo:
        dados_credencial = json.load(arquivo)

cred = credentials.Certificate(dados_credencial)

firebase_admin.initialize_app(cred)

db = firestore.client()

# Sem Firebase Storage aqui de propósito — exige plano pago (Blaze)
# vinculado só pra existir, mesmo dentro da cota grátis.
