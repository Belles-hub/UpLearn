/* =========================================
   RECUPERAR SENHA (pergunta de segurança)

   Passo 1: e-mail -> a API devolve a pergunta cadastrada.
   Passo 2: resposta + nova senha -> a API confere e já devolve uma sessão.
========================================= */

document.addEventListener('DOMContentLoaded', function () {

    const passo1 = document.getElementById('passo1');
    const passo2 = document.getElementById('passo2');
    const email = document.getElementById('email');
    const resposta = document.getElementById('resposta');
    const novaSenha = document.getElementById('novaSenha');

    UL.ligarSenhas();

    passo1.addEventListener('submit', async function (e) {
        e.preventDefault();

        UL.limparErros(passo1);
        esconderNotificacao('avisoRedefinir');

        if (!/^\S+@\S+\.\S{2,}$/.test(email.value.trim())) {
            UL.mostrarErroCampo(email, 'Digite um e-mail válido, como nome@exemplo.com.');
            email.focus();
            return;
        }

        const botao = document.getElementById('btnPasso1');

        UL.carregando(botao, true, 'Procurando...');

        try {
            const dados = await apiPublica('/auth/pergunta-seguranca', { email: email.value.trim() });

            document.getElementById('textoPergunta').textContent = dados.pergunta;
            document.getElementById('subtituloPasso').textContent = 'Responda a pergunta e escolha uma senha nova.';

            passo1.hidden = true;
            passo2.hidden = false;
            resposta.focus();

        } catch (erro) {
            mostrarNotificacao('avisoRedefinir', erro.message);
        } finally {
            UL.carregando(botao, false);
        }
    });

    passo2.addEventListener('submit', async function (e) {
        e.preventDefault();

        UL.limparErros(passo2);
        esconderNotificacao('avisoRedefinir');

        let invalido = null;

        if (!resposta.value.trim()) {
            UL.mostrarErroCampo(resposta, 'Escreva sua resposta.');
            invalido = resposta;
        }

        if (novaSenha.value.length < 6) {
            UL.mostrarErroCampo(novaSenha, 'A senha precisa ter pelo menos 6 caracteres.');
            invalido = invalido || novaSenha;
        }

        if (invalido) {
            invalido.focus();
            return;
        }

        const botao = document.getElementById('btnPasso2');

        UL.carregando(botao, true, 'Salvando...');

        try {
            const dados = await apiPublica('/auth/redefinir-senha', {
                email: email.value.trim(),
                resposta_seguranca: resposta.value.trim(),
                nova_senha: novaSenha.value
            });

            salvarSessaoLocal(dados.access_token, dados.uid);
            window.location.href = 'inicio.html';

        } catch (erro) {
            UL.carregando(botao, false);
            mostrarNotificacao('avisoRedefinir', erro.message);
        }
    });
});
