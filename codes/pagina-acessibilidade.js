/* =========================================
   TELA DE ACESSIBILIDADE

   Funciona logado (com a barra de navegação) e deslogado (a pessoa pode
   ajustar a tela antes mesmo de criar a conta). Os botões só refletem e
   mudam o estado do motor de acessibilidade (acess.js).
========================================= */

document.addEventListener('DOMContentLoaded', function () {

    function ligar() {
        const grupoFonte = document.getElementById('gFonte');
        const grupoEsp = document.getElementById('gEsp');
        const grupoPresets = document.getElementById('gPresets');

        grupoPresets.innerHTML = Object.keys(ACESS_PRESETS).map(function (id) {
            const p = ACESS_PRESETS[id];

            return `<button type="button" class="acess-op" data-preset="${id}" aria-pressed="false"><i class="fa-solid ${p.icone}" aria-hidden="true"></i>${p.rotulo}<small>${p.desc}</small></button>`;
        }).join('');

        grupoPresets.addEventListener('click', function (ev) {
            const b = ev.target.closest('[data-preset]');

            if (!b) return;

            Acess.aplicarPreset(b.dataset.preset);
            UL.toast('Ajustes "' + ACESS_PRESETS[b.dataset.preset].rotulo + '" aplicados.', 'info');
        });

        function atualizar() {
            const e = Acess.estado;
            const ativo = Acess.presetAtivo();

            grupoPresets.querySelectorAll('[data-preset]').forEach(function (b) {
                b.setAttribute('aria-pressed', String(b.dataset.preset === ativo));
            });

            grupoFonte.querySelectorAll('[data-fonte]').forEach(function (b) {
                b.setAttribute('aria-pressed', String(e.fonte === b.dataset.fonte));
            });

            grupoEsp.querySelectorAll('[data-esp]').forEach(function (b) {
                b.setAttribute('aria-pressed', String(e.espacamento === parseInt(b.dataset.esp, 10)));
            });

            document.querySelectorAll('[data-chave]').forEach(function (b) {
                const chave = b.dataset.chave;
                let ligado = e[chave];

                // Tema e contraste podem estar "seguindo o sistema" (null): mostra o que está valendo.
                if (chave === 'escuro') ligado = document.documentElement.dataset.tema === 'escuro';
                if (chave === 'contraste') ligado = document.documentElement.dataset.contraste === 'alto';

                b.setAttribute('aria-pressed', String(Boolean(ligado)));
            });

            document.getElementById('notaSalvo').textContent = localStorage.getItem(SESSAO_TOKEN_KEY) || localStorage.getItem(SESSAO_GOOGLE_KEY)
                ? 'Seus ajustes ficam salvos neste aparelho e na sua conta.'
                : 'Seus ajustes ficam salvos neste aparelho. Entre na sua conta para levar para outros aparelhos.';
        }

        grupoFonte.addEventListener('click', function (ev) {
            const b = ev.target.closest('[data-fonte]');
            if (b) Acess.definir('fonte', b.dataset.fonte);
        });

        grupoEsp.addEventListener('click', function (ev) {
            const b = ev.target.closest('[data-esp]');
            if (b) Acess.definir('espacamento', parseInt(b.dataset.esp, 10));
        });

        document.querySelectorAll('[data-chave]').forEach(function (b) {
            b.addEventListener('click', function () {
                const chave = b.dataset.chave;

                if (chave === 'escuro') return Acess.definir('escuro', document.documentElement.dataset.tema !== 'escuro');
                if (chave === 'contraste') return Acess.definir('contraste', document.documentElement.dataset.contraste !== 'alto');

                Acess.definir(chave, !Acess.estado[chave]);
            });
        });

        document.getElementById('btnRedefinir').addEventListener('click', function () {
            Acess.redefinir();
            UL.toast('Ajustes redefinidos.', 'info');
        });

        Acess.aoMudar(atualizar);
        atualizar();
        montarPersonagens(document);
    }

    const logado = localStorage.getItem(SESSAO_TOKEN_KEY) || localStorage.getItem(SESSAO_GOOGLE_KEY);

    if (logado) {
        UL.iniciar('perfil', ligar);
        return;
    }

    // Sem login: sem navegação, com um caminho de volta.
    document.getElementById('app').classList.add('sem-nav');
    document.getElementById('nav').remove();
    document.getElementById('topo').innerHTML = '<a class="marca" href="index.html" aria-label="UpLearn, voltar para o início"><img src="img/logo.png" alt=""></a>';
    document.getElementById('topo').className = 'topo';

    ligar();
});
