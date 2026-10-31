/* =========================================
   ENTRAR COM GOOGLE (usado por login.html e cadastro.html)

   Usa redirect (não popup): navega pro Google e volta pra cá. O popup
   depende de o navegador não bloquear a checagem "a janela fechou", e o
   Chrome recente bloqueia exatamente isso — o login travava sem aviso.
========================================= */

const GOOGLE_PENDENTE_KEY = 'uplearn_google_pendente';


async function entrarComGoogle(botao, areaAviso) {
    UL.carregando(botao, true, 'Abrindo o Google...');

    try {
        const auth = await carregarFirebase();

        sessionStorage.setItem(GOOGLE_PENDENTE_KEY, '1');

        await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());

    } catch (erro) {
        console.error(erro);
        sessionStorage.removeItem(GOOGLE_PENDENTE_KEY);
        mostrarNotificacao(areaAviso, 'Não foi possível abrir o Google: ' + erro.message);
        UL.carregando(botao, false);
    }
}


// Roda ao carregar a página: se estamos voltando do Google, termina o login.
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
            return;
        }

        const token = await resultado.user.getIdToken();
        const uid = resultado.user.uid;

        localStorage.setItem(SESSAO_GOOGLE_KEY, '1');

        let novo = false;

        try {
            await api('/usuarios/' + encodeURIComponent(uid));
        } catch (erro) {
            if (erro.status !== 404) throw erro;

            // Primeira vez com esta conta Google: cria o perfil.
            novo = true;

            const email = resultado.user.email || '';
            const nome = resultado.user.displayName || email.split('@')[0] || 'Estudante';

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

    } catch (erro) {
        console.error(erro);
        sessionStorage.removeItem(GOOGLE_PENDENTE_KEY);
        localStorage.removeItem(SESSAO_GOOGLE_KEY);
        mostrarNotificacao(areaAviso, 'Não foi possível entrar com o Google: ' + erro.message);
    }
}
