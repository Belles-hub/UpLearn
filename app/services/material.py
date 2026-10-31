"""Leitura do material de sala de aula que o estudante anexa no chat.

Foto do caderno, print da lousa, PDF da prova, documento do professor: o Up
lê o arquivo UMA vez (na hora do anexo) e devolve só o texto. Esse texto vai
junto nas próximas perguntas da conversa, então o Up "lembra" do material sem
que a imagem precise ser reenviada — e nada disso é guardado no banco.

O tipo do arquivo vem dos primeiros bytes, não do nome nem do mime que o
navegador informou: quem controla esses dois é quem envia.
"""

import base64
import binascii
import html
import io
import re
import zipfile
from dataclasses import dataclass

from app.services import ia

MAX_BYTES_IMAGEM = 4 * 1024 * 1024
MAX_BYTES_DOCUMENTO = 5 * 1024 * 1024
MAX_CHARS_MATERIAL = 8000
MAX_PAGINAS_PDF = 40
# Um .docx é um zip: sem este teto, um arquivo pequeno pode "explodir" na memória.
MAX_BYTES_DOCX_DESCOMPACTADO = 15 * 1024 * 1024

MIME_IMAGEM = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


class MaterialInvalido(Exception):
    """Arquivo que não dá pra ler. `status` é o código HTTP que a rota devolve."""

    def __init__(self, mensagem: str, status: int = 422):
        super().__init__(mensagem)
        self.status = status


@dataclass
class Preparado:
    nome: str
    tipo: str  # jpeg | png | webp | pdf | docx | texto
    conteudo: bytes

    @property
    def eh_imagem(self) -> bool:
        return self.tipo in MIME_IMAGEM


def limpar_nome(nome: str) -> str:
    """O nome do arquivo volta pra tela e entra no prompt: sem quebra de linha
    nem caractere de controle, e curto."""
    nome = re.sub(r"[\x00-\x1f\x7f]+", " ", nome or "").strip()
    return nome[:80] or "material"


def _detectar_tipo(nome: str, conteudo: bytes) -> str:
    if conteudo.startswith(b"\xff\xd8\xff"):
        return "jpeg"

    if conteudo.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"

    if conteudo[:4] == b"RIFF" and conteudo[8:12] == b"WEBP":
        return "webp"

    if conteudo.startswith(b"%PDF"):
        return "pdf"

    if conteudo.startswith(b"PK\x03\x04") and nome.lower().endswith(".docx"):
        return "docx"

    if nome.lower().endswith((".txt", ".md", ".csv")) and b"\x00" not in conteudo[:2048]:
        return "texto"

    raise MaterialInvalido(
        "Esse tipo de arquivo ainda não dá pra ler. Envie uma foto (JPG, PNG ou WEBP), "
        "um PDF, um documento do Word (.docx) ou um texto (.txt).",
        status=415,
    )


def preparar(nome: str, dados_base64: str) -> Preparado:
    """Decodifica e valida (tipo e tamanho) sem gastar IA."""
    try:
        conteudo = base64.b64decode(dados_base64, validate=True)
    except (binascii.Error, ValueError):
        raise MaterialInvalido("Não consegui abrir esse arquivo. Tente enviar de novo.")

    if not conteudo:
        raise MaterialInvalido("Esse arquivo está vazio.")

    nome = limpar_nome(nome)
    tipo = _detectar_tipo(nome, conteudo)
    limite = MAX_BYTES_IMAGEM if tipo in MIME_IMAGEM else MAX_BYTES_DOCUMENTO

    if len(conteudo) > limite:
        raise MaterialInvalido(
            f"Esse arquivo é grande demais (limite de {limite // (1024 * 1024)} MB). "
            "Tente uma foto menor ou só as páginas que você precisa.",
            status=413,
        )

    return Preparado(nome=nome, tipo=tipo, conteudo=conteudo)


def _normalizar(texto: str) -> str:
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def _texto_de_pdf(conteudo: bytes) -> str:
    from pypdf import PdfReader

    try:
        leitor = PdfReader(io.BytesIO(conteudo))

        if leitor.is_encrypted and not leitor.decrypt(""):
            raise MaterialInvalido("Esse PDF tem senha e não consegui abrir.")

        partes = []
        total = 0

        for pagina in leitor.pages[:MAX_PAGINAS_PDF]:
            trecho = pagina.extract_text() or ""
            partes.append(trecho)
            total += len(trecho)

            if total > MAX_CHARS_MATERIAL * 2:
                break

    except MaterialInvalido:
        raise
    except Exception:
        raise MaterialInvalido("Não consegui abrir esse PDF. Ele pode estar danificado.")

    return "\n\n".join(partes)


def _texto_de_docx(conteudo: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(conteudo)) as zf:
            info = zf.getinfo("word/document.xml")

            if info.file_size > MAX_BYTES_DOCX_DESCOMPACTADO:
                raise MaterialInvalido("Esse documento é grande demais.", status=413)

            xml = zf.read(info).decode("utf-8", errors="replace")

    except MaterialInvalido:
        raise
    except (zipfile.BadZipFile, KeyError):
        raise MaterialInvalido("Não consegui abrir esse documento do Word.")

    # Sem parser de XML de propósito: só o que importa (texto dos parágrafos).
    paragrafos = []

    for paragrafo in xml.split("</w:p>"):
        paragrafo = paragrafo.replace("<w:tab/>", "\t").replace("<w:br/>", "\n")
        pedacos = re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", paragrafo, flags=re.S)
        paragrafos.append(html.unescape("".join(pedacos)))

    return "\n".join(paragrafos)


def _texto_puro(conteudo: bytes) -> str:
    try:
        return conteudo.decode("utf-8")
    except UnicodeDecodeError:
        return conteudo.decode("cp1252", errors="replace")


def ler(preparado: Preparado) -> tuple[str, str, str | None]:
    """Devolve (tipo para a tela, texto, aviso). A imagem é lida pelo modelo de
    visão; os demais formatos viram texto aqui mesmo, sem IA."""

    aviso = None

    if preparado.eh_imagem:
        dados = base64.b64encode(preparado.conteudo).decode("ascii")
        texto = _normalizar(ia.descrever_imagem(MIME_IMAGEM[preparado.tipo], dados))

        if len(texto) < 15:
            raise MaterialInvalido(
                "Não consegui enxergar conteúdo de estudo nessa foto. "
                "Tente de novo com mais luz e o texto bem enquadrado."
            )

        tipo_tela = "imagem"

    else:
        if preparado.tipo == "pdf":
            texto = _texto_de_pdf(preparado.conteudo)
        elif preparado.tipo == "docx":
            texto = _texto_de_docx(preparado.conteudo)
        else:
            texto = _texto_puro(preparado.conteudo)

        texto = _normalizar(texto)

        if len(texto) < 15:
            raise MaterialInvalido(
                "Não achei texto nesse arquivo. Se for um PDF escaneado, tire fotos "
                "das páginas e envie como foto."
            )

        tipo_tela = "documento"

    if len(texto) > MAX_CHARS_MATERIAL:
        texto = texto[:MAX_CHARS_MATERIAL].rstrip() + " […]"
        aviso = "Li só o começo do arquivo (é muito longo). Envie o trecho que você quer estudar."

    return tipo_tela, texto, aviso
