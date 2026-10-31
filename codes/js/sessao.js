/* =========================================
   SESSÃO, CHAMADAS À API E TEXTO DA IA

   Dois jeitos de estar logado:
   - e-mail + senha: o token emitido pela API fica no localStorage;
   - Google: a sessão fica com o SDK do Firebase, que só é carregado se a
     pessoa realmente entrou por lá (não pesa pra quem entra por e-mail).

   Precisa carregar DEPOIS de config.js e ANTES do script de cada página.
========================================= */

const SESSAO_TOKEN_KEY = 'uplearn_token';
const SESSAO_UID_KEY = 'uplearn_uid';
const SESSAO_GOOGLE_KEY = 'uplearn_via_google';

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAisN58YJF7oKokjiG5Fw-tHAzzQH1v-AI',
    authDomain: 'uplearn-26.firebaseapp.com',
    projectId: 'uplearn-26'
};


function salvarSessaoLocal(token, uid) {
    localStorage.setItem(SESSAO_TOKEN_KEY, token);
    localStorage.setItem(SESSAO_UID_KEY, uid);
}


function limparSessaoLocal() {
    localStorage.removeItem(SESSAO_TOKEN_KEY);
    localStorage.removeItem(SESSAO_UID_KEY);
    localStorage.removeItem(SESSAO_GOOGLE_KEY);
    sessionStorage.removeItem('uplearn_chat');
}


function carregarScript(src) {
    return new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Não foi possível carregar ' + src)); };
        document.head.appendChild(s);
    });
}


let _promessaFirebase = null;

// Carrega o SDK do Firebase Auth uma única vez, só quando alguém precisa.
function carregarFirebase() {
    if (!_promessaFirebase) {
        _promessaFirebase = carregarScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
            .then(function () { return carregarScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'); })
            .then(function () {
                firebase.initializeApp(FIREBASE_CONFIG);
                return firebase.auth();
            });
    }

    return _promessaFirebase;
}


// Resolve { token, uid } da sessão atual. Rejeita se não há sessão.
async function obterSessaoAtual() {
    const token = localStorage.getItem(SESSAO_TOKEN_KEY);
    const uid = localStorage.getItem(SESSAO_UID_KEY);

    if (token && uid) {
        return { token, uid };
    }

    if (!localStorage.getItem(SESSAO_GOOGLE_KEY)) {
        throw new Error('Sem sessão ativa.');
    }

    const auth = await carregarFirebase();

    const usuario = await new Promise(function (resolve) {
        const cancelar = auth.onAuthStateChanged(function (u) { cancelar(); resolve(u); });
    });

    if (!usuario) {
        throw new Error('Sem sessão ativa.');
    }

    return { token: await usuario.getIdToken(), uid: usuario.uid };
}


async function encerrarSessao() {
    const eraGoogle = localStorage.getItem(SESSAO_GOOGLE_KEY);

    limparSessaoLocal();

    if (eraGoogle) {
        try {
            const auth = await carregarFirebase();
            await auth.signOut();
        } catch (erro) {
            // Sem sessão do Google ativa — tudo bem.
        }
    }
}


/* =========================================
   CHAMADAS À API (com token e erro legível)
========================================= */

function mensagemDeErro(corpo, status) {
    const detalhe = corpo && corpo.detail;

    // 422 do FastAPI devolve uma lista; cada item tem uma frase em "msg".
    if (Array.isArray(detalhe)) {
        return detalhe.map(function (i) { return String(i.msg).replace(/^Value error, /, ''); }).join(' ');
    }

    return detalhe || 'Algo deu errado (' + status + '). Tente de novo.';
}


// Sem o /: api('/planos/') -> GET com token. Lança Error(mensagem clara).
async function api(caminho, opcoes) {
    opcoes = opcoes || {};

    const { token } = await obterSessaoAtual();

    const resposta = await fetch(API_BASE_URL + caminho, {
        method: opcoes.metodo || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined
    });

    const corpo = await resposta.json().catch(function () { return null; });

    if (!resposta.ok) {
        const erro = new Error(mensagemDeErro(corpo, resposta.status));
        erro.status = resposta.status;
        throw erro;
    }

    return corpo;
}


// Chamada sem token (login, cadastro, recuperação de senha).
// POST que devolve a resposta aos poucos (Server-Sent Events). Chama
// aoPedaco(texto) a cada pedaço; resolve quando o servidor manda {fim:true}.
async function apiFluxo(caminho, corpo, aoPedaco) {
    const { token } = await obterSessaoAtual();

    const resposta = await fetch(API_BASE_URL + caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(corpo)
    });

    if (!resposta.ok) {
        const erroCorpo = await resposta.json().catch(function () { return null; });
        const erro = new Error(mensagemDeErro(erroCorpo, resposta.status));
        erro.status = resposta.status;
        throw erro;
    }

    const leitor = resposta.body.getReader();
    const decodificador = new TextDecoder();
    let sobra = '';

    for (;;) {
        const { done, value } = await leitor.read();

        if (done) break;

        sobra += decodificador.decode(value, { stream: true });

        const eventos = sobra.split('\n\n');
        sobra = eventos.pop();

        for (const bruto of eventos) {
            if (!bruto.startsWith('data: ')) continue;

            const evento = JSON.parse(bruto.slice(6));

            if (evento.erro) throw new Error(evento.erro);
            if (evento.texto) aoPedaco(evento.texto);
        }
    }
}


async function apiPublica(caminho, corpo) {
    const resposta = await fetch(API_BASE_URL + caminho, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
    });

    const dados = await resposta.json().catch(function () { return null; });

    if (!resposta.ok) {
        const erro = new Error(mensagemDeErro(dados, resposta.status));
        erro.status = resposta.status;
        throw erro;
    }

    return dados;
}


/* =========================================
   FORMATAÇÃO SEGURA DE RESPOSTA DE IA

   O prompt pede pra IA usar só negrito e lista — mas nem sempre ela
   obedece 100%. Este formatador escapa todo o HTML (nada que a IA escreva
   vira código) e "traduz" cabeçalho, tabela e citação pra algo legível.
========================================= */

function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}


function aplicarNegrito(linha) {
    return linha.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}


const RE_SEPARADOR = /^(-{3,}|\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?)$/;


function formatarRespostaIA(texto) {
    let html = '';
    let lista = null;

    function fechar() {
        if (lista) { html += `</${lista}>`; lista = null; }
    }

    function item(tipo, conteudo) {
        if (lista !== tipo) { fechar(); html += `<${tipo}>`; lista = tipo; }
        html += `<li>${conteudo}</li>`;
    }

    const proc = function (c) { return aplicarNegrito(escaparHtml(c)); };

    texto.split('\n').forEach(function (linha) {
        const seco = linha.trim();

        if (seco && RE_SEPARADOR.test(seco)) return;

        const cabecalho = linha.match(/^\s{0,3}#{1,6}\s+(.*)/);
        const citacao = linha.match(/^\s{0,3}>\s?(.*)/);
        const tabela = linha.match(/^\s*\|(.+)\|\s*$/);
        const marcador = linha.match(/^\s*[-*]\s+(.*)/);
        const numerado = linha.match(/^\s*\d+[.)]\s+(.*)/);

        if (cabecalho) { fechar(); html += `<strong>${proc(cabecalho[1])}</strong><br>`; }
        else if (citacao) { fechar(); html += `${proc(citacao[1])}<br>`; }
        else if (tabela) {
            const celulas = tabela[1].split('|').map(function (c) { return c.trim(); }).filter(Boolean);
            if (celulas.length) item('ul', celulas.map(proc).join(' — '));
        }
        else if (marcador) item('ul', proc(marcador[1]));
        else if (numerado) item('ol', proc(numerado[1]));
        else { fechar(); html += seco ? `${proc(linha)}<br>` : '<br>'; }
    });

    fechar();

    return html;
}


// Texto puro pra leitura em voz alta — sem símbolos de marcação.
function paraLeituraEmVoz(texto) {
    const partes = [];

    texto.split('\n').forEach(function (linha) {
        const seco = linha.trim();

        if (!seco || RE_SEPARADOR.test(seco)) return;

        let conteudo = linha
            .replace(/^\s{0,3}#{1,6}\s+/, '')
            .replace(/^\s{0,3}>\s?/, '')
            .replace(/^\s*[-*]\s+/, '')
            .replace(/^\s*\d+[.)]\s+/, '');

        if (/^\s*\|.+\|\s*$/.test(linha)) {
            conteudo = linha.split('|').map(function (c) { return c.trim(); }).filter(Boolean).join(', ');
        }

        conteudo = conteudo.replace(/\*\*(.+?)\*\*/g, '$1').trim();

        if (conteudo) partes.push(conteudo);
    });

    return partes.join('. ');
}
