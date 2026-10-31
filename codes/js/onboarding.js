/* =========================================
   ONBOARDING — "Como você prefere aprender?"

   Três passos curtos, todos opcionais, e dá pra pular a qualquer momento.
   Nada aqui é diagnóstico: são só preferências pra adaptar a experiência.
========================================= */

const SESSOES = [
    { id: 'curta', rotulo: 'Curtas (10–15 min)' },
    { id: 'media', rotulo: 'Médias (20–30 min)' },
    { id: 'longa', rotulo: 'Mais longas (40 min ou mais)' }
];

const MODOS_USO = [
    { id: 'texto', rotulo: 'Lendo texto', icone: 'fa-book-open' },
    { id: 'audio', rotulo: 'Ouvindo (áudio)', icone: 'fa-volume-high' },
    { id: 'libras', rotulo: 'Libras (VLibras)', icone: 'fa-hands' }
];

const RESPOSTAS = [
    { id: 'curtas', rotulo: 'Curtas e diretas' },
    { id: 'detalhadas', rotulo: 'Mais detalhadas' }
];


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('onboarding', function (usuario) {

        const pref = usuario.preferencias || {};

        const escolhas = {
            estilo_aprendizagem: pref.estilo_aprendizagem || null,
            serie: pref.serie || '',
            materias: (pref.materias || []).slice(),
            objetivo: pref.objetivo || '',
            duracao_sessao: pref.duracao_sessao || null,
            modo_uso: pref.modo_uso || null,
            tipo_resposta: pref.tipo_resposta || null
        };

        let passo = 1;

        const TOTAL = 3;

        /* ---- passo 1: estilos ---- */

        const gradeEstilos = document.getElementById('estilos');

        gradeEstilos.innerHTML = UL.ESTILOS.map(function (e) {
            return `<button type="button" class="estilo card--${e.cor}" data-id="${e.id}" aria-pressed="${escolhas.estilo_aprendizagem === e.id}" style="background:var(--c-${e.cor})">
                <i class="fa-solid ${e.icone}" aria-hidden="true"></i>
                <span>${UL.esc(e.titulo)}<small>${UL.esc(e.desc)}</small></span>
            </button>`;
        }).join('');

        gradeEstilos.addEventListener('click', function (ev) {
            const botao = ev.target.closest('.estilo');

            if (!botao) return;

            // Escolha única — clicar de novo no mesmo desmarca.
            const jaEstava = botao.getAttribute('aria-pressed') === 'true';

            gradeEstilos.querySelectorAll('.estilo').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });

            escolhas.estilo_aprendizagem = jaEstava ? null : botao.dataset.id;
            botao.setAttribute('aria-pressed', String(!jaEstava));
        });

        /* ---- passo 2: série, matérias, objetivo ---- */

        const serie = document.getElementById('serie');

        UL.SERIES.forEach(function (s) {
            const op = document.createElement('option');
            op.value = op.textContent = s;
            serie.appendChild(op);
        });

        serie.value = escolhas.serie;

        const materias = document.getElementById('materias');

        materias.innerHTML = UL.MATERIAS.map(function (m) {
            return `<button type="button" class="chip" aria-pressed="${escolhas.materias.includes(m)}">${UL.esc(m)}</button>`;
        }).join('');

        materias.addEventListener('click', function (ev) {
            const chip = ev.target.closest('.chip');

            if (!chip) return;

            const ligado = chip.getAttribute('aria-pressed') !== 'true';

            chip.setAttribute('aria-pressed', String(ligado));

            const nome = chip.textContent.replace(/^✓\s*/, '').trim();

            escolhas.materias = ligado
                ? escolhas.materias.concat(nome)
                : escolhas.materias.filter(function (m) { return m !== nome; });
        });

        document.getElementById('objetivo').value = escolhas.objetivo;

        /* ---- passo 3: grupos de escolha única ---- */

        function grupo(idEl, opcoes, chave) {
            const el = document.getElementById(idEl);

            el.innerHTML = opcoes.map(function (o) {
                return `<button type="button" class="chip" data-id="${o.id}" aria-pressed="${escolhas[chave] === o.id}">${o.icone ? `<i class="fa-solid ${o.icone}" aria-hidden="true"></i>` : ''}${UL.esc(o.rotulo)}</button>`;
            }).join('');

            el.addEventListener('click', function (ev) {
                const chip = ev.target.closest('.chip');

                if (!chip) return;

                const jaEstava = chip.getAttribute('aria-pressed') === 'true';

                el.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });

                escolhas[chave] = jaEstava ? null : chip.dataset.id;
                chip.setAttribute('aria-pressed', String(!jaEstava));
            });
        }

        grupo('sessoes', SESSOES, 'duracao_sessao');
        grupo('modos', MODOS_USO, 'modo_uso');
        grupo('respostas', RESPOSTAS, 'tipo_resposta');

        /* ---- navegação entre passos ---- */

        const btnVoltar = document.getElementById('btnVoltar');
        const btnAvancar = document.getElementById('btnAvancar');

        function mostrarPasso() {
            for (let i = 1; i <= TOTAL; i++) {
                document.getElementById('passo-' + i).hidden = i !== passo;
            }

            document.querySelectorAll('#passos li').forEach(function (li, i) {
                li.classList.toggle('feito', i < passo);
            });

            btnVoltar.hidden = passo === 1;
            btnAvancar.innerHTML = passo === TOTAL
                ? 'Começar a estudar <i class="fa-solid fa-check" aria-hidden="true"></i>'
                : 'Continuar <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';

            const titulo = document.getElementById('t' + passo);

            titulo.setAttribute('tabindex', '-1');
            titulo.focus();
            window.scrollTo({ top: 0 });
        }

        btnVoltar.addEventListener('click', function () { passo -= 1; mostrarPasso(); });

        btnAvancar.addEventListener('click', function () {
            if (passo < TOTAL) {
                passo += 1;
                mostrarPasso();
                return;
            }

            salvar(true);
        });

        document.getElementById('btnPular').addEventListener('click', function () { salvar(false); });

        async function salvar(comEscolhas) {
            const corpo = { onboarding_concluido: true };

            if (comEscolhas) {
                escolhas.serie = serie.value;
                escolhas.objetivo = document.getElementById('objetivo').value.trim();

                Object.keys(escolhas).forEach(function (k) {
                    const v = escolhas[k];

                    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;

                    corpo[k] = v;
                });
            }

            const botoes = [btnAvancar, btnVoltar, document.getElementById('btnPular')];

            botoes.forEach(function (b) { b.disabled = true; });

            try {
                await api('/perfil/' + encodeURIComponent(UL.uid) + '/preferencias', { metodo: 'PUT', corpo: corpo });

                // Quem escolheu ouvir ou Libras já sai com isso ligado.
                if (corpo.modo_uso === 'audio') Acess.definir('audio', true);
                if (corpo.modo_uso === 'libras') Acess.definir('libras', true);

                window.location.href = 'inicio.html';

            } catch (erro) {
                botoes.forEach(function (b) { b.disabled = false; });
                mostrarNotificacao('avisoOnb', erro.message);
            }
        }

        mostrarPasso();

    }, { semNav: true, semOnboarding: true });
});
