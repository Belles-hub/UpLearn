FROM python:3.13-slim

WORKDIR /srv

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Credenciais e chaves entram por variáveis de ambiente (veja .env.example),
# nunca dentro da imagem.
# O Render define a porta em $PORT (10000 por padrão); localmente cai em 8000.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
