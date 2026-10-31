/* =========================================
   CADASTRO (e-mail + senha, ou Google)

   Só valida o básico aqui pra dar resposta rápida — quem decide de
   verdade é a API, e os erros dela aparecem no aviso do formulário.
========================================= */

document.addEventListener('DOMContentLoaded', function () {

    const form = document.getElementById('formCadastro');
    const botao = document.getElementById('btnCriar');

    const campos = {
        nome: document.getElementById('nome'),
        email: document.getElementById('email'),
        senha: document.getElementById('senha'),
        senha2: document.getElementById('senha2'),
        resposta: document.getElementById('resposta'),
        termos: document.getElementById('termos')
    };

    UL.ligarSenhas();
    processarRetornoDoGoogle('avisoCadastro');

    document.getElementById('btnGoogle').addEventListener('click', function () {
        entrarComGoogle(this, 'avisoCadastro');
    });

    function validar() {
        const erros = [];

        if (campos.nome.value.trim().length < 2) {
            erros.push([campos.nome, 'Digite seu nome.']);
        }

        if (!/^\S+@\S+\.\S{2,}$/.test(campos.email.value.trim())) {
            erros.push([campos.email, 'Digite um e-mail válido, como nome@exemplo.com.']);
        }

        if (campos.senha.value.length < 6) {
            erros.push([campos.senha, 'A senha precisa ter pelo menos 6 caracteres.']);
        }

        if (campos.senha2.value !== campos.senha.value) {
            erros.push([campos.senha2, 'As senhas não são iguais.']);
        }

        if (campos.resposta.value.trim().length < 2) {
            erros.push([campos.resposta, 'Escreva uma resposta para a pergunta de segurança.']);
        }

        if (!campos.termos.checked) {
            erros.push([campos.termos, 'Marque a caixa para aceitar os Termos e criar a conta.']);
        }

        return erros;
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        UL.limparErros(form);
        esconderNotificacao('avisoCadastro');

        const erros = validar();

        if (erros.length) {
            erros.forEach(function (par) { UL.mostrarErroCampo(par[0], par[1]); });
            erros[0][0].focus();
            return;
        }

        UL.carregando(botao, true, 'Criando sua conta...');

        try {
            const dados = await apiPublica('/auth/registrar', {
                nome: campos.nome.value.trim(),
                email: campos.email.value.trim(),
                senha: campos.senha.value,
                aceitou_termos: true,
                pergunta_seguranca: document.getElementById('pergunta').value,
                resposta_seguranca: campos.resposta.value.trim()
            });

            salvarSessaoLocal(dados.access_token, dados.uid);

            // Conta nova: comemora e segue pro próximo passo (contar como gosta de aprender).
            mostrarBoasVindas(campos.nome.value.trim());

        } catch (erro) {
            UL.carregando(botao, false);

            if (erro.status === 409) {
                mostrarNotificacao('avisoCadastro', 'Este e-mail já tem uma conta. Que tal entrar?', 'info');
                return;
            }

            mostrarNotificacao(
                'avisoCadastro',
                erro instanceof TypeError
                    ? 'Não conseguimos falar com o servidor. Confira sua internet e tente de novo.'
                    : erro.message
            );
        }
    });
});


// O "toque aqui" (high five) que aparece quando a conta é criada. Segue sozinho
// pro onboarding depois de um instante, ou na hora se a pessoa tocar no botão.
function mostrarBoasVindas(nome) {
    const el = document.createElement('div');

    el.className = 'boas-vindas';
    el.setAttribute('role', 'status');
    el.innerHTML = `
        <img src="img/toque.png" alt="" width="283" height="295">
        <h2>Conta criada! Toca aqui, ${UL.esc(UL.primeiroNome(nome))}!</h2>
        <p>Agora conta pra gente como você gosta de aprender.</p>
        <a class="btn btn--claro" href="onboarding.html">Vamos lá <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`;

    document.body.appendChild(el);
    el.querySelector('a').focus();

    setTimeout(function () { window.location.href = 'onboarding.html'; }, 2400);
}
