/* =========================================
   ENTRAR COM GOOGLE (usado por login.html e cadastro.html)

   Tenta primeiro o POPUP: o resultado volta direto pra esta página, sem
   depender de armazenamento compartilhado entre domínios. O redirect
   (navegar pro Google e voltar) quebra quando o site está num domínio
   diferente do authDomain do Firebase — o Chrome/Safari modernos bloqueiam
   esse armazenamento e o login "dava certo" mas voltava vazio. Ele fica só
   como plano B, quando o navegador bloqueia o popup.
========================================= */

const GOOGLE_PENDENTE_KEY = 'uplearn_google_pendente';

// Erros do popup em que vale tentar o redirect em vez de desistir.
const ERROS_DE_POPUP_BLOQUEADO = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'];
// A pessoa só fechou a janela ou clicou duas vezes: não é falha, não mostra aviso.
const ERROS_DE_POPUP_CANCELADO = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];


async function entrarComGoogle(botao, areaAviso) {
    UL.carregando(botao, true, 'Abrindo o Google...');

    try {
        const auth = await carregarFirebase();
        const provedor = new firebase.auth.GoogleAuthProvider();

        try {
            const resultado = await auth.signInWithPopup(provedor);

            await concluirLoginGoogle(resultado.user);
            return;

        } catch (erroPopup) {
            if (ERROS_DE_POPUP_CANCELADO.includes(erroPopup.code)) {
                UL.carregando(botao, false);
                return;
            }

            if (!ERROS_DE_POPUP_BLOQUEADO.includes(erroPopup.code)) throw erroPopup;
        }

        // Popup bloqueado pelo navegador: cai pro redirect.
        sessionStorage.setItem(GOOGLE_PENDENTE_KEY, '1');
        await auth.signInWithRedirect(provedor);

    } catch (erro) {
        console.error(erro);
        sessionStorage.removeItem(GOOGLE_PENDENTE_KEY);
        localStorage.removeItem(SESSAO_GOOGLE_KEY);
        mostrarNotificacao(areaAviso, 'Não foi possível entrar com o Google: ' + erro.message);
        UL.carregando(botao, false);
    }
}


// Termina o login: garante que o perfil existe e leva pra dentro do app.
async function concluirLoginGoogle(usuario) {
    const token = await usuario.getIdToken();
    const uid = usuario.uid;

    localStorage.setItem(SESSAO_GOOGLE_KEY, '1');

    let novo = false;

    try {
        await api('/usuarios/' + encodeURIComponent(uid));
    } catch (erro) {
        if (erro.status !== 404) throw erro;

        // Primeira vez com esta conta Google: cria o perfil.
        novo = true;

        const email = usuario.email || '';
        const nome = usuario.displayName || email.split('@')[0] || 'Estudante';

        const resposta = await fetch(API_BASE_URL + '/usuarios/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ nome: nome, email: email })
        });

        if (!resposta.ok && resposta.status !== 409) {
            throw new Error('Não foi possível criar seu perfil (' + resposta.status + ').');
        }
    }

    window.location.href = novo ? 'onboarding.html' : 'inicio.html';
}


// Roda ao carregar a página: se estamos voltando do Google (plano B por
// redirect), termina o login.
async function processarRetornoDoGoogle(areaAviso) {
    if (!sessionStorage.getItem(GOOGLE_PENDENTE_KEY)) {
        return;
    }

    try {
        const auth = await carregarFirebase();

        // getRedirectResult() pode nunca resolver em navegadores que bloqueiam
        // armazenamento entre domínios — sem este limite a pessoa ficava
        // esperando pra sempre, sem nenhuma mensagem.
        const resultado = await Promise.race([
            auth.getRedirectResult(),
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error('Tempo esgotado ao voltar do Google. Tente de novo — se continuar, verifique se cookies de terceiros estão bloqueados.'));
                }, 10000);
            })
        ]);

        sessionStorage.removeItem(GOOGLE_PENDENTE_KEY);

        if (!resultado || !resultado.user) {
            // Voltou do Google sem ninguém logado: o navegador bloqueou o
            // armazenamento entre domínios. Antes isto era ignorado em silêncio.
            throw new Error('O navegador bloqueou a volta do Google. Libere popups para este site e tente de novo.');
        }

        await concluirLoginGoogle(resultado.user);

    } catch (erro) {
        console.error(erro);
        sessionStorage.removeItem(GOOGLE_PENDENTE_KEY);
        localStorage.removeItem(SESSAO_GOOGLE_KEY);
        mostrarNotificacao(areaAviso, 'Não foi possível entrar com o Google: ' + erro.message);
    }
}
