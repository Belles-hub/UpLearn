<div align="center">

# UpLearn 📚

**Estude do seu jeito, com a ajuda do Up — um tutor de IA acessível e personalizado.**

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)
![Groq](https://img.shields.io/badge/IA-Groq-F55036)
![PWA](https://img.shields.io/badge/PWA-instalável-5A0FC8)
![Licença](https://img.shields.io/badge/licença-MIT-green)

</div>

---

## Sobre

A maioria das plataformas de estudo trata todo mundo igual. A UpLearn parte do contrário: cada pessoa lê, ouve e aprende de um jeito, e é o app que se adapta — não o contrário.

O **Up**, o tutor com IA, conversa no ritmo e no formato que a pessoa prefere (frases curtas, passo a passo, linguagem simples), lê fotos e arquivos da aula, monta planos de estudo e cria exercícios. Tudo isso dentro de uma interface com acessibilidade de verdade: fonte, contraste, leitura em voz alta, guia de leitura e VLibras.

**Princípios do projeto**

- **Acessibilidade não é extra.** Está no centro do produto, não escondida num menu.
- **Sem ranking, sem comparação.** Cada pessoa só se compara com ela mesma.
- **Nenhuma nota inventada.** A IA escreve as questões, mas a correção compara com o gabarito — a IA nunca "dá nota".
- **Privacidade primeiro.** Fotos e arquivos enviados são lidos na hora e não ficam guardados; dá para baixar ou apagar todos os seus dados.

## Índice

- [Funcionalidades](#funcionalidades)
- [Como funciona](#como-funciona)
- [Tecnologias](#tecnologias)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [API](#api)
- [Testes](#testes)
- [Docker](#docker-opcional)
- [Deploy](#deploy)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Roadmap](#roadmap)
- [Licença](#licença)

## Funcionalidades

**Estudar**
- 💬 **Tutor Up** — chat com IA que responde aos poucos (streaming) e adapta tamanho e formato da resposta ao perfil da pessoa.
- 📎 **Leitura de material** — fotos, PDF, Word e texto: a IA extrai o conteúdo e estuda em cima do que foi visto em sala.
- 🗓️ **Planos de estudo** gerados por IA, editáveis, com mapa do plano (assuntos-chave e trilha por dia) e exportação em PDF.
- 📝 **Quizzes** de múltipla escolha, com explicação em cada questão.
- 🔁 **Revisão espaçada** — as questões erradas voltam amanhã, depois em 3, 7 e 14 dias; acertou, o intervalo cresce, e ao dominar a questão ela sai da fila.

**Acompanhar**
- 📊 **Desempenho** — resultados por matéria, conquistas por esforço e resumo escrito pela IA.
- 🔥 **Sequência de dias** de estudo na tela inicial.
- 🔔 **Notificações** reais dos eventos da conta.

**Acessibilidade**
- Tamanho de fonte e ícones, fonte de leitura fácil (Atkinson Hyperlegible), modo escuro e alto contraste, cursor grande, guia e máscara de leitura, leitura de tela em voz alta, ditado por voz e tradução em Libras (VLibras).

**Conta e dados**
- Cadastro/login por e-mail + senha (com pergunta de segurança para recuperação) e login com Google.
- 📥 Baixar todos os seus dados (JSON) e 🗑️ excluir a conta, a qualquer momento (LGPD).
- 📱 **App instalável (PWA)** que abre mesmo sem internet.
- Limites diários e bloqueio por tentativas em cadastro, login e uso da IA.

## Como funciona

```
┌──────────────────────┐   HTTPS + JWT    ┌─────────────────────────┐
│  Frontend estático   │ ───────────────▶ │  API FastAPI            │
│  HTML · CSS · JS     │ ◀─────────────── │  (routers + services)   │
│  PWA · sem build     │   JSON / SSE     └──────┬─────────┬────────┘
└──────────────────────┘                         │         │
                                                 ▼         ▼
                                        ┌────────────┐ ┌────────────┐
                                        │ Firestore  │ │  Groq (IA) │
                                        │ (dados)    │ │ chat·visão │
                                        └────────────┘ └────────────┘
```

- O frontend fala com a API por `fetch` e recebe as respostas do Up em **Server-Sent Events**.
- Os *routers* só cuidam de HTTP e permissões; a regra de negócio e a IA ficam em `services/`, em funções puras sempre que possível (fácil de testar sem banco nem IA).
- Todo acesso ao Firestore passa por `crud_firebase.py`.

## Tecnologias

| Camada | Stack |
| --- | --- |
| Frontend | HTML, CSS e JavaScript puro (sem framework, sem build) · jsPDF para PDFs · Service Worker |
| Backend | Python 3.13 · FastAPI · Pydantic · PyJWT · bcrypt |
| IA | Groq API (chat, JSON estruturado e leitura de imagens) |
| Banco / Auth | Firebase (Firestore + Firebase Admin SDK) |
| Observabilidade | Sentry (opcional) · endpoint `/health` |
| Qualidade | pytest · ruff · pre-commit |
| Deploy / CI | Render · GitHub Actions · Docker |

## Rodando localmente

**Pré-requisitos:** Python 3.13, um projeto Firebase (Firestore + Authentication) e uma chave da [Groq](https://console.groq.com/keys).

### Backend

```bash
python -m venv venv
./venv/Scripts/activate        # Windows  (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env           # e preencha os valores
```

Coloque a chave de serviço do Firebase em `credentials/firebase-service-account.json` (Firebase Console → Configurações do projeto → Contas de serviço). Nem o `.env` nem `credentials/` vão para o git.

```bash
uvicorn app.main:app --reload
```

Documentação interativa em <http://127.0.0.1:8000/docs>.

### Frontend

A pasta `codes/` é estática. Use a extensão **Live Server** do VS Code (porta 5500) ou:

```bash
cd codes
python -m http.server 5500
```

`codes/config.js` detecta sozinho se está local ou publicado e aponta para a API certa.

## Variáveis de ambiente

Modelo completo em [`.env.example`](.env.example).

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `JWT_SECRET_KEY` | sim | Assinatura dos tokens |
| `FIREBASE_WEB_API_KEY` | sim | Login com e-mail/Google via Firebase |
| `FIREBASE_CREDENTIALS_JSON` | em produção | Conteúdo do JSON da service account (local usa o arquivo em `credentials/`) |
| `GROQ_API_KEY` | para a IA | Sem ela o chat responde 503 e o resto funciona |
| `GROQ_MODEL`, `GROQ_VISION_MODEL` | não | Trocam os modelos sem mexer no código |
| `CORS_ORIGINS_EXTRA` | em produção | URL(s) do frontend, separadas por vírgula |
| `CONFIA_EM_PROXY_REVERSO` | em produção | Lê o IP real via `X-Forwarded-For` atrás do proxy |
| `SENTRY_DSN` | não | Liga o monitoramento de erros |

## API

Todas as rotas, exceto `/health`, `/` e as de cadastro/login, exigem `Authorization: Bearer <token>`. O resumo abaixo cobre os grupos; o detalhe completo está em `/docs`.

| Grupo | Prefixo | O que faz |
| --- | --- | --- |
| Autenticação | `/auth` | Registrar, login, pergunta de segurança, redefinir senha |
| Usuários | `/usuarios` | Perfil, atualização, **exportar dados**, excluir conta |
| Perfil | `/perfil` | Preferências de estudo e de acessibilidade |
| Tutor Up | `/chat` | Conversa (`/chat/` e `/chat/stream`), leitura de material, resumo |
| Planos | `/planos` | Gerar, listar, editar, mapa do plano, excluir |
| Exercícios | `/exercicios` | Gerar quiz e salvar resultado |
| Revisão | `/revisao` | Questões a revisar hoje e registro do resultado |
| Desempenho | `/desempenho` | Painel completo e resumo rápido |
| Notificações | `/notificacoes` | Listar e marcar como lidas |
| Saúde | `/health` | Verificação de disponibilidade (sem banco nem IA) |

## Testes

```bash
pip install -r requirements-dev.txt
pytest tests/ -v
ruff check app tests     # lint
```

Os testes rodam contra o **Firestore de verdade** (não há emulador): criam dados com e-mails aleatórios (`@uplearn.teste`) e apagam tudo no final. **Use um projeto Firebase de desenvolvimento**, não o de produção.

Para rodar a checagem antes de cada commit: `pip install pre-commit && pre-commit install`.

## Docker (opcional)

```bash
docker build -t uplearn-api .
docker run -p 8000:8000 --env-file .env uplearn-api
```

A imagem não leva credenciais: passe `FIREBASE_CREDENTIALS_JSON` por variável de ambiente.

## Deploy

O [`render.yaml`](render.yaml) descreve os dois serviços (`uplearn-api` e `uplearn-frontend`).

1. No Render: **New +** → **Blueprint** → selecione o repositório.
2. Preencha as variáveis marcadas `sync: false` (`FIREBASE_CREDENTIALS_JSON` é o conteúdo inteiro do JSON, colado como texto).
3. Se o Render alterar os nomes/URLs dos serviços, atualize `CORS_ORIGINS_EXTRA` no `render.yaml` e a URL em `codes/config.js`.
4. No Firebase Console → Authentication → Settings → **Authorized domains**, adicione o domínio do frontend (necessário para o login com Google).

**CI:** o workflow [`tests.yml`](.github/workflows/tests.yml) roda lint e testes a cada push/PR na `main`. Cadastre em Settings → Secrets and variables → Actions: `FIREBASE_CREDENTIALS_JSON`, `FIREBASE_WEB_API_KEY`, `JWT_SECRET_KEY`, `GROQ_API_KEY`, `GROQ_MODEL` e `GROQ_VISION_MODEL`.

> Ao publicar uma versão nova dos arquivos do frontend, aumente `VERSAO` em `codes/sw.js` para o app instalado atualizar.

## Estrutura do projeto

```
app/                  Backend FastAPI
  routers/            Um router por área (HTTP e permissões)
  services/           Regras e integrações: IA, adaptação ao perfil, leitura de
                      material, planos, mapa, exercícios, revisão, desempenho
  crud_firebase.py    Toda a leitura/escrita no Firestore
  schemas.py          Modelos Pydantic (entrada/saída)
  auth.py             JWT, verificação de token, checagens de dono/bloqueio
  seguranca.py        Hash de senha, IP do cliente
codes/                Frontend estático (uma página por fluxo)
  acess.js            Painel de acessibilidade (carregado em todas as páginas)
  sessao.js           Sessão, chamadas à API e streaming
  sw.js · manifest.webmanifest   PWA
tests/                Suíte pytest
render.yaml           Blueprint de deploy (API + site estático)
Dockerfile            Imagem da API
.env.example          Modelo das variáveis de ambiente
```

## Segurança e privacidade

- Segredos ficam só em `.env`, `credentials/` e nas variáveis do Render/GitHub — nunca no código.
- Senhas com bcrypt; tokens JWT invalidados quando a senha muda.
- Bloqueio temporário após várias senhas erradas e limite de cadastros por IP, guardados no Firestore (funciona com várias instâncias).
- Limite diário de uso da IA por pessoa.
- CORS com lista explícita de origens, métodos e headers.
- A chave web do Firebase que aparece no frontend é pública por design — restrinja-a por domínio no Google Cloud Console.
- Se alguma chave já foi exposta (commit, print, conversa), **gere uma nova** no painel do serviço correspondente.

## Roadmap

- [ ] Meta diária de estudo configurável
- [ ] Memória da tutora (o Up lembra o que a pessoa já domina)
- [ ] Plano que se reajusta sozinho conforme acertos e dias perdidos
- [ ] Visão somente leitura para responsável ou professor (com consentimento)
- [ ] Testes de ponta a ponta do frontend (Playwright) e emulador do Firestore
- [ ] Cookie `HttpOnly` para o token e Content-Security-Policy

## Licença

Distribuído sob a licença MIT — veja [`LICENSE`](LICENSE).
