/* =========================================
   QUIZ — exercícios de múltipla escolha

   As questões vêm da IA; a correção é feita aqui, comparando com o gabarito
   que veio junto. O resultado é guardado só pra alimentar o SEU desempenho
   (sem ranking, sem comparar com outros alunos).

   Certo e errado sempre aparecem com ícone e texto, não só com cor.
========================================= */

const LETRAS = ['A', 'B', 'C', 'D'];


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('estudos', function () {

        const tela = document.getElementById('tela');
        const params = new URLSearchParams(location.search);

        let quiz = null;
        let indice = 0;
        let acertos = 0;
        let erradas = [];
        let respondida = false;

        /* ---- 1. montar o quiz ---- */

        function desenharFormulario(materiaInicial, conteudoInicial) {
            const materias = (UL.usuario.preferencias.materias && UL.usuario.preferencias.materias.length)
                ? UL.usuario.preferencias.materias.concat(UL.MATERIAS.filter(function (m) { return !UL.usuario.preferencias.materias.includes(m); }))
                : UL.MATERIAS;

            const materiaConhecida = materias.includes(materiaInicial);

            tela.innerHTML = `
                <form id="formQuiz" class="card entrar" novalidate>
                    <div class="campo">
                        <label for="qz-materia">Matéria</label>
                        <select id="qz-materia">${materias.map(function (m) { return `<option${m === materiaInicial ? ' selected' : ''}>${UL.esc(m)}</option>`; }).join('')}<option value="__outra"${materiaInicial && !materiaConhecida ? ' selected' : ''}>Outra…</option></select>
                    </div>
                    <div class="campo" id="qz-outra-campo" ${materiaInicial && !materiaConhecida ? '' : 'hidden'}>
                        <label for="qz-outra">Qual matéria?</label>
                        <input type="text" id="qz-outra" maxlength="40" value="${materiaConhecida ? '' : UL.esc(materiaInicial || '')}">
                    </div>
                    <div class="campo">
                        <label for="qz-conteudo">Sobre o que você quer praticar?</label>
                        <input type="text" id="qz-conteudo" maxlength="200" value="${UL.esc(conteudoInicial || '')}" placeholder="Ex.: Multiplicação de frações" required>
                        <p class="campo__erro" id="qz-conteudo-erro" role="alert"></p>
                    </div>
                    <div class="campo">
                        <span class="rotulo" id="qz-qtd-rot">Quantas questões?</span>
                        <div class="opcoes" id="qz-qtd" role="group" aria-labelledby="qz-qtd-rot">
                            ${[3, 5, 8].map(function (n) { return `<button type="button" class="chip" data-n="${n}" aria-pressed="${n === 5}">${n} questões</button>`; }).join('')}
                        </div>
                    </div>
                    <button type="submit" class="btn btn--primario btn--bloco"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Criar quiz</button>
                </form>`;

            const form = document.getElementById('formQuiz');
            const sel = document.getElementById('qz-materia');
            let quantidade = 5;

            sel.addEventListener('change', function () {
                document.getElementById('qz-outra-campo').hidden = sel.value !== '__outra';
            });

            document.getElementById('qz-qtd').addEventListener('click', function (e) {
                const chip = e.target.closest('.chip');

                if (!chip) return;

                quantidade = parseInt(chip.dataset.n, 10);
                this.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
            });

            form.addEventListener('submit', async function (e) {
                e.preventDefault();

                UL.limparErros(form);
                esconderNotificacao('aviso');

                const materia = sel.value === '__outra' ? document.getElementById('qz-outra').value.trim() : sel.value;
                const conteudo = document.getElementById('qz-conteudo').value.trim();

                if (materia.length < 2) {
                    document.getElementById('qz-outra').focus();
                    UL.toast('Escreva o nome da matéria.', 'erro');
                    return;
                }

                if (conteudo.length < 2) {
                    UL.mostrarErroCampo(document.getElementById('qz-conteudo'), 'Conte o assunto do quiz.');
                    document.getElementById('qz-conteudo').focus();
                    return;
                }

                tela.innerHTML = `
                    <div class="card carregando-ia" role="status">
                        <span class="pers pers--anima" data-p="estrela amarelo bocao relax"></span>
                        <h2>O Up está criando seu quiz…</h2>
                        <p class="subtitulo">Só um instante.</p>
                    </div>`;
                montarPersonagens(tela);

                try {
                    quiz = await api('/exercicios/quiz', { metodo: 'POST', corpo: { materia: materia, conteudo: conteudo, quantidade: quantidade } });
                    indice = 0;
                    acertos = 0;
                    erradas = [];
                    desenharQuestao();

                } catch (erro) {
                    desenharFormulario(materia, conteudo);
                    mostrarNotificacao('aviso', erro.message);
                }
            });
        }

        /* ---- 2. responder ---- */

        function desenharQuestao() {
            const q = quiz.questoes[indice];
            const total = quiz.questoes.length;
            const pct = Math.round(100 * indice / total);

            respondida = false;

            tela.innerHTML = `
                <section class="card entrar" aria-labelledby="enunciado">
                    <div class="quiz-cab">
                        <span class="selo">${UL.esc(quiz.materia)} · ${UL.esc(quiz.conteudo)}</span>
                        <strong>Questão ${indice + 1} de ${total}</strong>
                    </div>
                    <div class="progresso progresso--claro" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do quiz"><span style="width:${pct}%"></span></div>

                    <h2 id="enunciado" style="margin-top:18px">${UL.esc(q.enunciado)}</h2>

                    <div class="alternativas" role="group" aria-labelledby="enunciado">
                        ${q.alternativas.map(function (a, i) {
                            return `<button type="button" class="alternativa" data-i="${i}"><span class="letra" aria-hidden="true">${LETRAS[i]}</span><span>${UL.esc(a)}</span><span class="resultado"></span></button>`;
                        }).join('')}
                    </div>

                    <div id="retorno" aria-live="polite"></div>
                </section>`;

            tela.querySelector('.alternativas').addEventListener('click', function (e) {
                const botao = e.target.closest('.alternativa');

                if (botao && !respondida) responder(parseInt(botao.dataset.i, 10));
            });

            tela.querySelector('.alternativa').focus({ preventScroll: true });
        }

        function responder(escolhida) {
            const q = quiz.questoes[indice];
            const acertou = escolhida === q.correta;

            respondida = true;

            if (acertou) acertos += 1;
            else erradas.push(q);

            tela.querySelectorAll('.alternativa').forEach(function (b) {
                const i = parseInt(b.dataset.i, 10);
                const marca = b.querySelector('.resultado');

                b.disabled = true;

                if (i === q.correta) {
                    b.classList.add('certa');
                    marca.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Resposta certa';
                } else if (i === escolhida) {
                    b.classList.add('errada');
                    marca.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Sua resposta';
                }
            });

            const ultima = indice === quiz.questoes.length - 1;

            document.getElementById('retorno').innerHTML = `
                <p class="rotulo" style="margin:4px 0 8px">${acertou ? '🎉 Isso aí, você acertou!' : 'Quase! Vamos entender juntos:'}</p>
                <div class="explicacao">${UL.esc(q.explicacao || (acertou ? 'Muito bem!' : 'Confira a alternativa marcada como certa.'))}</div>
                <button type="button" class="btn btn--primario btn--bloco" id="btnProxima">${ultima ? 'Ver resultado' : 'Próxima questão'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;

            const proxima = document.getElementById('btnProxima');

            proxima.focus();
            proxima.addEventListener('click', function () {
                if (ultima) { desenharResultado(); return; }

                indice += 1;
                desenharQuestao();
            });
        }

        /* ---- 3. resultado ---- */

        async function desenharResultado() {
            const total = quiz.questoes.length;
            const taxa = acertos / total;

            const frase = taxa >= 0.8 ? 'Mandou muito bem!' : taxa >= 0.5 ? 'Você está no caminho certo!' : 'Errar faz parte de aprender. Bora revisar juntos?';
            const personagem = taxa >= 0.8 ? 'estrela amarelo bocao alto' : taxa >= 0.5 ? 'circulo verde feliz acena' : 'nuvem lilas piscando quadris';

            tela.innerHTML = `
                <section class="card placar entrar" aria-labelledby="tRes">
                    <span class="pers pers--anima" data-p="${personagem}"></span>
                    <h2 id="tRes">${frase}</h2>
                    <div class="placar__num">${acertos}<small style="font-size:.4em"> de ${total}</small></div>
                    <p class="subtitulo">${UL.esc(quiz.materia)} · ${UL.esc(quiz.conteudo)}</p>
                    <p id="statusSalvo" class="subtitulo" aria-live="polite">Salvando seu resultado…</p>
                    <div class="grade" style="width:100%;max-width:360px">
                        <a class="btn btn--primario btn--bloco" href="tutora.html?modo=aprender&materia=${encodeURIComponent(quiz.materia)}&assunto=${encodeURIComponent('Quero revisar ' + quiz.conteudo)}"><i class="fa-solid fa-comments" aria-hidden="true"></i> Revisar com o Up</a>
                        <button type="button" class="btn btn--suave btn--bloco" id="btnOutro">Fazer outro quiz</button>
                        <a class="btn btn--contorno btn--bloco" href="desempenho.html">Ver meu desempenho</a>
                    </div>
                </section>`;
            montarPersonagens(tela);

            document.getElementById('btnOutro').addEventListener('click', function () { desenharFormulario(quiz.materia, quiz.conteudo); });

            try {
                await api('/exercicios/resultado', { metodo: 'POST', corpo: { materia: quiz.materia, conteudo: quiz.conteudo, total: total, acertos: acertos,
                    erradas: erradas.map(function (q) { return { enunciado: q.enunciado, alternativas: q.alternativas, correta: q.correta, explicacao: q.explicacao || '' }; })
                } });
                document.getElementById('statusSalvo').textContent = erradas.length ? 'Resultado salvo. As questões que você errou voltam amanhã para revisar.' : 'Resultado salvo no seu desempenho.';
            } catch (erro) {
                document.getElementById('statusSalvo').textContent = 'Não foi possível salvar o resultado agora (' + erro.message + ').';
            }
        }

        desenharFormulario(params.get('materia') || '', params.get('conteudo') || '');
    });
});
