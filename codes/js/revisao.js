/* =========================================
   REVISÃO ESPAÇADA

   As questões que a pessoa errou num quiz voltam aqui no dia certo.
   Acertou: o intervalo cresce (1, 3, 7, 14 dias) e, depois do último,
   o cartão some de vez. Errou: volta amanhã. Nenhuma nota é gerada.
========================================= */

document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('inicio', async function () {

        const tela = document.getElementById('tela');
        const LETRAS = ['A', 'B', 'C', 'D'];

        let fila = [];
        let indice = 0;
        let acertos = 0;
        let dominadas = 0;

        function vazio(titulo, texto, personagem) {
            tela.innerHTML = `
                <section class="card vazio entrar">
                    <span class="pers pers--anima" data-p="${personagem}"></span>
                    <h2>${titulo}</h2>
                    <p class="subtitulo">${texto}</p>
                    <a class="btn btn--primario" href="quiz.html">Fazer um quiz</a>
                </section>`;
            montarPersonagens(tela);
        }

        // Leva as questões de hoje pra fora do app (caderno em PDF, com gabarito).
        async function baixarCaderno(botao) {
            botao.disabled = true;

            try {
                await FichasPdf.revisao(JSON.parse(JSON.stringify(fila)), UL.usuario && UL.usuario.nome);
                UL.toast('Caderno pronto! Ele foi para a sua pasta de downloads.', 'sucesso');
            } catch (erro) {
                UL.toast(erro.message || 'Não foi possível gerar o PDF agora.', 'erro');
            } finally {
                botao.disabled = false;
            }
        }

        function desenharCartao() {
            const c = fila[indice];
            const pct = Math.round(100 * indice / fila.length);

            tela.innerHTML = `
                <section class="card entrar" aria-labelledby="enunciado">
                    <div class="quiz-cab">
                        <span class="selo">${UL.esc(c.materia)}</span>
                        <strong>Cartão ${indice + 1} de ${fila.length}</strong>
                    </div>
                    <div class="progresso progresso--claro" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso da revisão"><span style="width:${pct}%"></span></div>

                    <h2 id="enunciado" style="margin-top:18px">${UL.esc(c.enunciado)}</h2>

                    <div class="alternativas" role="group" aria-labelledby="enunciado">
                        ${c.alternativas.map(function (a, i) {
                            return `<button type="button" class="alternativa" data-i="${i}"><span class="letra" aria-hidden="true">${LETRAS[i]}</span><span>${UL.esc(a)}</span><span class="resultado"></span></button>`;
                        }).join('')}
                    </div>

                    <div id="retorno" aria-live="polite"></div>
                </section>
                <button type="button" class="btn btn--suave btn--p" id="btnCaderno" title="Baixar as questões de hoje em PDF, com gabarito"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Baixar caderno de revisão (PDF)</button>`;

            document.getElementById('btnCaderno').addEventListener('click', function (e) { baixarCaderno(e.currentTarget); });

            const alternativas = tela.querySelector('.alternativas');

            alternativas.addEventListener('click', function (e) {
                const botao = e.target.closest('.alternativa');

                if (botao && !botao.disabled) responder(parseInt(botao.dataset.i, 10));
            });

            tela.querySelector('.alternativa').focus({ preventScroll: true });
        }

        async function responder(escolhida) {
            const c = fila[indice];
            const acertou = escolhida === c.correta;

            if (acertou) acertos += 1;

            tela.querySelectorAll('.alternativa').forEach(function (b) {
                const i = parseInt(b.dataset.i, 10);
                const marca = b.querySelector('.resultado');

                b.disabled = true;

                if (i === c.correta) {
                    b.classList.add('certa');
                    marca.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Resposta certa';
                } else if (i === escolhida) {
                    b.classList.add('errada');
                    marca.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Sua resposta';
                }
            });

            const ultima = indice === fila.length - 1;
            let aviso = '';

            try {
                const r = await api('/revisao/' + encodeURIComponent(c.id) + '/resultado', { metodo: 'POST', corpo: { acertou: acertou } });

                if (r.dominado) { dominadas += 1; aviso = ' Você dominou esta questão — ela não volta mais! 🎉'; }
            } catch (erro) {
                aviso = ' (Não foi possível registrar agora: ' + erro.message + ')';
            }

            document.getElementById('retorno').innerHTML = `
                <p class="rotulo" style="margin:4px 0 8px">${acertou ? '🎉 Isso aí, você acertou!' : 'Quase! Ela volta amanhã pra você tentar de novo.'}</p>
                <div class="explicacao">${UL.esc(c.explicacao || (acertou ? 'Muito bem!' : 'Confira a alternativa marcada como certa.'))}${UL.esc(aviso)}</div>
                <button type="button" class="btn btn--primario btn--bloco" id="btnProxima">${ultima ? 'Ver resultado' : 'Próxima'} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;

            const proxima = document.getElementById('btnProxima');

            proxima.focus();
            proxima.addEventListener('click', function () {
                if (ultima) { desenharFim(); return; }

                indice += 1;
                desenharCartao();
            });
        }

        function desenharFim() {
            tela.innerHTML = `
                <section class="card placar entrar" aria-labelledby="tRes">
                    <span class="pers pers--anima" data-p="estrela amarelo bocao alto"></span>
                    <h2 id="tRes">Revisão do dia concluída!</h2>
                    <div class="placar__num">${acertos}<small style="font-size:.4em"> de ${fila.length}</small></div>
                    <p class="subtitulo">${dominadas ? dominadas + ' questão(ões) dominada(s).' : 'Volte amanhã para continuar a sequência.'}</p>
                    <div class="grade" style="width:100%;max-width:360px">
                        <a class="btn btn--primario btn--bloco" href="inicio.html">Voltar ao início</a>
                        <a class="btn btn--contorno btn--bloco" href="quiz.html">Fazer um quiz</a>
                    </div>
                </section>`;
            montarPersonagens(tela);
        }

        try {
            fila = await api('/revisao/');
        } catch (erro) {
            tela.innerHTML = '<div class="card"><p>Não foi possível carregar a revisão agora: ' + UL.esc(erro.message) + '</p></div>';
            return;
        }

        if (!fila.length) {
            vazio('Nada para revisar hoje', 'Quando você errar questões num quiz, elas voltam aqui na hora certa para fixar.', 'hexagono azul dormindo relax');
            return;
        }

        desenharCartao();
    });
});
