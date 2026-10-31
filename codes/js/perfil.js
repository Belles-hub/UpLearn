/* =========================================
   PERFIL

   Dados da conta, preferências de aprendizagem, atalhos de acessibilidade,
   notificações e controle dos próprios dados (sair e excluir a conta).
========================================= */

const SESSOES_PERFIL = [
    { id: 'curta', rotulo: 'Curtas' },
    { id: 'media', rotulo: 'Médias' },
    { id: 'longa', rotulo: 'Longas' }
];

const RESPOSTAS_PERFIL = [
    { id: 'curtas', rotulo: 'Curtas e diretas' },
    { id: 'detalhadas', rotulo: 'Mais detalhadas' }
];

const NOMES_FONTE = { pequena: 'Pequena', media: 'Média', grande: 'Grande' };
const PROXIMA_FONTE = { pequena: 'media', media: 'grande', grande: 'pequena' };


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('perfil', async function (usuario) {

        const pref = usuario.preferencias || {};

        const escolhas = {
            avatar: pref.avatar || UL.AVATARES[0].split(' ')[0],
            materias: (pref.materias || []).slice(),
            estilo_aprendizagem: pref.estilo_aprendizagem || null,
            duracao_sessao: pref.duracao_sessao || null,
            tipo_resposta: pref.tipo_resposta || null
        };

        /* ---- topo ---- */

        function desenharTopo() {
            const nome = document.getElementById('nome').value.trim() || usuario.nome;
            const desc = UL.AVATARES.find(function (a) { return a.split(' ')[0] === escolhas.avatar; }) || UL.AVATARES[0];
            const alvo = document.getElementById('avatarTopo');

            alvo.dataset.p = desc;
            alvo.removeAttribute('data-p-pronto');
            montarPersonagens(alvo.parentNode);

            document.getElementById('nomePerfil').textContent = nome;
        }

        document.getElementById('emailPerfil').textContent = usuario.email || '';

        const seloSerie = document.getElementById('seloSerie');

        if (pref.serie) {
            seloSerie.hidden = false;
            seloSerie.textContent = pref.serie;
        }

        /* ---- acessibilidade rápida ---- */

        function atualizarQuick() {
            const e = Acess.estado;
            const marcar = function (id, ligado) { document.getElementById(id).setAttribute('aria-pressed', String(ligado)); };

            document.getElementById('qFonteVal').textContent = NOMES_FONTE[e.fonte];
            marcar('qFonte', e.fonte !== 'media');
            marcar('qAudio', e.audio);
            marcar('qLibras', e.libras);
            marcar('qContraste', document.documentElement.dataset.contraste === 'alto');
        }

        document.getElementById('qFonte').addEventListener('click', function () { Acess.definir('fonte', PROXIMA_FONTE[Acess.estado.fonte]); });
        document.getElementById('qAudio').addEventListener('click', function () { Acess.definir('audio', !Acess.estado.audio); });
        document.getElementById('qLibras').addEventListener('click', function () { Acess.definir('libras', !Acess.estado.libras); });
        document.getElementById('qContraste').addEventListener('click', function () {
            Acess.definir('contraste', document.documentElement.dataset.contraste !== 'alto');
        });

        Acess.aoMudar(atualizarQuick);
        atualizarQuick();

        /* ---- formulário ---- */

        document.getElementById('nome').value = usuario.nome;
        document.getElementById('objetivo').value = pref.objetivo || '';

        document.getElementById('nome').addEventListener('input', desenharTopo);

        const serie = document.getElementById('serie');

        UL.SERIES.forEach(function (s) {
            const op = document.createElement('option');
            op.value = op.textContent = s;
            serie.appendChild(op);
        });

        serie.value = pref.serie || '';

        // Avatares
        const avatares = document.getElementById('avatares');

        avatares.innerHTML = UL.AVATARES.map(function (a) {
            const chave = a.split(' ')[0];
            return `<button type="button" class="avatar-op" data-avatar="${chave}" aria-pressed="${escolhas.avatar === chave}" aria-label="Personagem ${chave}"><span class="pers" data-p="${a}"></span></button>`;
        }).join('');
        montarPersonagens(avatares);

        avatares.addEventListener('click', function (e) {
            const botao = e.target.closest('.avatar-op');

            if (!botao) return;

            escolhas.avatar = botao.dataset.avatar;
            avatares.querySelectorAll('.avatar-op').forEach(function (b) { b.setAttribute('aria-pressed', String(b === botao)); });
            desenharTopo();
        });

        // Matérias (múltipla escolha)
        const materias = document.getElementById('materias');
        const todasMaterias = UL.MATERIAS.concat(escolhas.materias.filter(function (m) { return !UL.MATERIAS.includes(m); }));

        materias.innerHTML = todasMaterias.map(function (m) {
            return `<button type="button" class="chip" data-materia="${UL.esc(m)}" aria-pressed="${escolhas.materias.includes(m)}">${UL.esc(m)}</button>`;
        }).join('');

        materias.addEventListener('click', function (e) {
            const chip = e.target.closest('.chip');

            if (!chip) return;

            const nome = chip.dataset.materia;
            const ligado = chip.getAttribute('aria-pressed') !== 'true';

            chip.setAttribute('aria-pressed', String(ligado));
            escolhas.materias = ligado ? escolhas.materias.concat(nome) : escolhas.materias.filter(function (m) { return m !== nome; });
        });

        // Grupos de escolha única
        function grupo(idEl, opcoes, chave) {
            const el = document.getElementById(idEl);

            el.innerHTML = opcoes.map(function (o) {
                return `<button type="button" class="chip" data-id="${o.id}" aria-pressed="${escolhas[chave] === o.id}">${UL.esc(o.titulo || o.rotulo)}</button>`;
            }).join('');

            el.addEventListener('click', function (e) {
                const chip = e.target.closest('.chip');

                if (!chip) return;

                const jaEstava = chip.getAttribute('aria-pressed') === 'true';

                el.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
                escolhas[chave] = jaEstava ? null : chip.dataset.id;
                chip.setAttribute('aria-pressed', String(!jaEstava));
            });
        }

        grupo('estilos', UL.ESTILOS, 'estilo_aprendizagem');
        grupo('sessoes', SESSOES_PERFIL, 'duracao_sessao');
        grupo('respostas', RESPOSTAS_PERFIL, 'tipo_resposta');

        desenharTopo();

        document.getElementById('formPerfil').addEventListener('submit', async function (e) {
            e.preventDefault();

            const form = e.target;
            const nome = document.getElementById('nome').value.trim();

            UL.limparErros(form);
            esconderNotificacao('avisoPerfil');

            if (nome.length < 2) {
                UL.mostrarErroCampo(document.getElementById('nome'), 'Digite seu nome.');
                document.getElementById('nome').focus();
                return;
            }

            const preferencias = {
                avatar: escolhas.avatar,
                serie: serie.value,
                materias: escolhas.materias,
                objetivo: document.getElementById('objetivo').value.trim()
            };

            ['estilo_aprendizagem', 'duracao_sessao', 'tipo_resposta'].forEach(function (k) {
                if (escolhas[k]) preferencias[k] = escolhas[k];
            });

            const botao = document.getElementById('btnSalvar');

            UL.carregando(botao, true, 'Salvando...');

            try {
                const atualizado = await api('/usuarios/' + encodeURIComponent(UL.uid), { metodo: 'PUT', corpo: { nome: nome, preferencias: preferencias } });

                UL.usuario = atualizado;
                mostrarNotificacao('avisoPerfil', 'Perfil atualizado!', 'sucesso');

                seloSerie.hidden = !atualizado.preferencias.serie;
                seloSerie.textContent = atualizado.preferencias.serie || '';

            } catch (erro) {
                mostrarNotificacao('avisoPerfil', erro.message);
            } finally {
                UL.carregando(botao, false);
            }
        });

        /* ---- notificações ---- */

        (async function () {
            const alvo = document.getElementById('listaNotif');

            try {
                const lista = await api('/notificacoes/' + encodeURIComponent(UL.uid));

                alvo.innerHTML = lista.length
                    ? lista.map(function (n) {
                        return `<div class="notif${n.lida ? '' : ' nova'}"><span>${UL.esc(n.mensagem)}</span><small>${n.lida ? '' : 'Nova · '}${UL.esc(UL.formatarDataHora(n.criado_em))}</small></div>`;
                    }).join('')
                    : '<div class="card vazio"><p>Nenhuma notificação por enquanto.</p></div>';

            } catch (erro) {
                alvo.innerHTML = '<div class="card"><p>Não foi possível carregar as notificações agora.</p></div>';
            }
        })();

        /* ---- sair e excluir ---- */

        document.getElementById('btnExportar').addEventListener('click', async function () {
            try {
                const dados = await api('/usuarios/' + encodeURIComponent(UL.uid) + '/exportar');
                const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
                const link = document.createElement('a');

                link.href = URL.createObjectURL(arquivo);
                link.download = 'meus-dados-uplearn.json';
                link.click();
                URL.revokeObjectURL(link.href);
            } catch (erro) {
                UL.toast('Não foi possível baixar seus dados agora: ' + erro.message, 'erro');
            }
        });

        document.getElementById('btnSair').addEventListener('click', UL.sair);

        document.getElementById('btnExcluir').addEventListener('click', async function () {
            const ok = await UL.confirmar(
                'Excluir sua conta?',
                'Isso apaga seu perfil, planos, resultados de exercícios e suas conversas. Não dá para desfazer.',
                'Excluir tudo'
            );

            if (!ok) return;

            try {
                await api('/usuarios/' + encodeURIComponent(UL.uid), { metodo: 'DELETE' });
                await encerrarSessao();
                window.location.href = 'index.html';
            } catch (erro) {
                UL.toast('Não foi possível excluir agora: ' + erro.message, 'erro');
            }
        });
    });
});
