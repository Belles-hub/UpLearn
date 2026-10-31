/* =========================================
   LOGIN (e-mail + senha, ou Google)
========================================= */

document.addEventListener('DOMContentLoaded', function () {

    // Quem já está logado não precisa ver o login.
    if (localStorage.getItem(SESSAO_TOKEN_KEY) && !sessionStorage.getItem(GOOGLE_PENDENTE_KEY)) {
        window.location.replace('inicio.html');
        return;
    }

    const form = document.getElementById('formLogin');
    const email = document.getElementById('email');
    const senha = document.getElementById('senha');
    const botao = document.getElementById('btnEntrar');

    UL.ligarSenhas();
    processarRetornoDoGoogle('avisoLogin');

    document.getElementById('btnGoogle').addEventListener('click', function () {
        entrarComGoogle(this, 'avisoLogin');
    });

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        UL.limparErros(form);
        esconderNotificacao('avisoLogin');

        let invalido = null;

        if (!/^\S+@\S+\.\S{2,}$/.test(email.value.trim())) {
            UL.mostrarErroCampo(email, 'Digite um e-mail válido, como nome@exemplo.com.');
            invalido = invalido || email;
        }

        if (!senha.value) {
            UL.mostrarErroCampo(senha, 'Digite sua senha.');
            invalido = invalido || senha;
        }

        if (invalido) {
            invalido.focus();
            return;
        }

        UL.carregando(botao, true, 'Entrando...');

        try {
            const dados = await apiPublica('/auth/login', { email: email.value.trim(), senha: senha.value });

            salvarSessaoLocal(dados.access_token, dados.uid);
            window.location.href = 'inicio.html';

        } catch (erro) {
            UL.carregando(botao, false);

            const semServidor = erro instanceof TypeError;

            mostrarNotificacao(
                'avisoLogin',
                semServidor
                    ? 'Não conseguimos falar com o servidor. Confira sua internet e tente de novo.'
                    : erro.message
            );
        }
    });
});
