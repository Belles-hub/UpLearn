/* =========================================
   DESEMPENHO

   Cada número aqui é contado no servidor a partir do que a pessoa fez de
   verdade (perguntas, tarefas concluídas, quizzes). A IA só escreve o
   resumo e as sugestões. Sem dado, mostramos um estado vazio — nunca
   um número inventado.
========================================= */

const ICONE_CONQUISTA = {
    primeira_conversa: 'fa-comments', primeiro_plano: 'fa-calendar-plus', primeira_tarefa: 'fa-shoe-prints',
    dez_tarefas: 'fa-medal', primeiro_quiz: 'fa-pencil', quiz_perfeito: 'fa-star', tres_dias: 'fa-seedling'
};


function graficoAtividade(dias) {
    const largura = 640, altura = 210, esq = 34, dir = 8, topo = 14, base = 30;
    const area = largura - esq - dir;
    const maximo = Math.max(1, ...dias.map(function (d) { return d.perguntas; }));
    const passo = area / dias.length;
    const larguraBarra = Math.min(28, passo * 0.62);
    const h = altura - topo - base;

    const barras = dias.map(function (d, i) {
        const alt = Math.round(h * d.perguntas / maximo);
        const x = esq + i * passo + (passo - larguraBarra) / 2;

        return `<rect class="barra" x="${x.toFixed(1)}" y="${topo + h - alt}" width="${larguraBarra.toFixed(1)}" height="${alt}" rx="5"/>` +
            (d.perguntas ? `<text x="${(x + larguraBarra / 2).toFixed(1)}" y="${topo + h - alt - 4}" text-anchor="middle">${d.perguntas}</text>` : '') +
            (i % 2 === 0 || dias.length < 8 ? `<text x="${(x + larguraBarra / 2).toFixed(1)}" y="${altura - 10}" text-anchor="middle">${UL.esc(d.rotulo)}</text>` : '');
    }).join('');

    const tabela = dias.map(function (d) { return `<tr><td>${UL.esc(d.rotulo)}</td><td>${d.perguntas}</td></tr>`; }).join('');

    return `
        <svg class="grafico" viewBox="0 0 ${largura} ${altura}" role="img" aria-labelledby="gTit">
            <title id="gTit">Perguntas feitas ao Up por dia, nos últimos ${dias.length} dias</title>
            <line class="grade-h" x1="${esq}" x2="${largura - dir}" y1="${topo}" y2="${topo}"/>
            <text x="${esq - 6}" y="${topo + 4}" text-anchor="end">${maximo}</text>
            <line class="linha-base" x1="${esq}" x2="${largura - dir}" y1="${topo + h}" y2="${topo + h}"/>
            <text x="${esq - 6}" y="${topo + h + 4}" text-anchor="end">0</text>
            ${barras}
        </svg>
        <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">Ver os números em tabela</summary>
            <table style="width:100%;margin-top:8px;border-collapse:collapse"><thead><tr><th scope="col" style="text-align:left">Dia</th><th scope="col" style="text-align:left">Perguntas</th></tr></thead><tbody>${tabela}</tbody></table>
        </details>`;
}


function desenharPainel(d) {
    const p = d.progresso_planos;
    const ultimos7 = d.atividade_por_dia.slice(-7);
    const letras = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    /* ---- resumo do Up ---- */

    let resumo;

    if (d.resumo) {
        resumo = `
            <section class="card card--cor card--lilas entrar" style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center" aria-labelledby="tResumo">
                <div>
                    <span class="rotulo-mini">Resumo do Up</span>
                    <h2 id="tResumo" style="margin:4px 0 8px">Como você está indo</h2>
                    <p>${UL.esc(d.resumo)}</p>
                </div>
                <span class="pers pers--anima so-enfeite" data-p="nuvem roxo feliz chapeu acena" style="width:110px"></span>
            </section>`;
    } else if (!d.analise_disponivel) {
        resumo = '<p class="cu-notificacao cu-notificacao--info" role="status">O resumo escrito pelo Up não está disponível agora, mas todos os seus números estão aqui embaixo.</p>';
    } else {
        resumo = `
            <section class="card vazio entrar">
                <span class="pers pers--anima" data-p="pera amarelo feliz acena"></span>
                <p>Converse com o Up e faça quizzes: o resumo do seu progresso aparece aqui.</p>
                <a class="btn btn--primario btn--p" href="tutora.html">Conversar com o Up</a>
            </section>`;
    }

    const recomendacoes = d.recomendacoes.length ? `
        <section class="secao" aria-labelledby="tRec">
            <h2 id="tRec" style="margin-bottom:12px">Que tal revisar?</h2>
            <div class="grade grade--auto">${d.recomendacoes.map(function (r, i) {
                const cor = ['amarelo', 'ciano', 'rosa'][i % 3];

                return `<a class="card card--cor card--${cor}" style="text-decoration:none;color:#1b1035;display:grid;gap:6px" href="tutora.html?modo=revisar&assunto=${encodeURIComponent('Quero revisar ' + r.titulo)}">
                    <strong style="font:800 1.05rem var(--fonte-titulo)">${UL.esc(r.titulo)}</strong>
                    <span>${UL.esc(r.motivo)}</span>
                    <span style="font-weight:800"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Revisar com o Up</span>
                </a>`;
            }).join('')}</div>
        </section>` : '';

    /* ---- números ---- */

    const tiles = `
        <div class="tiles secao">
            <div class="card card--cor card--rosa tile"><i class="fa-solid fa-comments" aria-hidden="true"></i><span class="tile__valor">${d.total_perguntas}</span><span class="tile__rot">perguntas ao Up</span></div>
            <div class="card card--cor card--verde tile"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span class="tile__valor">${p.tarefas_concluidas}<small style="font-size:.5em">/${p.tarefas_total}</small></span><span class="tile__rot">atividades do plano</span></div>
            <div class="card card--cor card--laranja tile"><i class="fa-solid fa-clock" aria-hidden="true"></i><span class="tile__valor">${p.minutos_estudados}</span><span class="tile__rot">min de estudo concluídos</span></div>
            <div class="card card--cor card--ciano tile"><i class="fa-solid fa-pencil" aria-hidden="true"></i><span class="tile__valor">${d.exercicios_total}</span><span class="tile__rot">quizzes feitos</span></div>
        </div>`;

    /* ---- sequência flexível ---- */

    const sequencia = `
        <section class="card card--cor card--amarelo secao" aria-labelledby="tSeq">
            <h2 id="tSeq">Sua semana</h2>
            <div class="sequencia" role="list">${ultimos7.map(function (dia) {
                const data = new Date(dia.dia + 'T12:00:00');
                const ativo = dia.perguntas > 0;

                return `<span role="listitem" class="${ativo ? 'on' : ''}" aria-label="${data.getDate()}/${data.getMonth() + 1}: ${ativo ? 'teve atividade' : 'sem atividade'}">${ativo ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : letras[data.getDay()]}</span>`;
            }).join('')}</div>
            <p style="margin-top:10px">${d.dias_ativos_ultima_semana === 0
                ? 'Sem pressão: quando estiver a fim, o Up está por aqui.'
                : `Você teve atividade em <strong>${d.dias_ativos_ultima_semana}</strong> dos últimos 7 dias. Cada dia conta — e descansar também faz parte!`}</p>
        </section>`;

    /* ---- gráfico ---- */

    const grafico = `
        <section class="card secao" aria-labelledby="tGraf">
            <h2 id="tGraf" style="margin-bottom:10px">Conversas com o Up</h2>
            ${d.total_perguntas
                ? graficoAtividade(d.atividade_por_dia)
                : '<div class="vazio"><span class="pers" data-p="triangulo laranja dormindo relax"></span><p>Quando você conversar com o Up, o gráfico dos seus dias de estudo aparece aqui.</p></div>'}
        </section>`;

    /* ---- exercícios por matéria ---- */

    const materiasEx = d.materias_exercicios.length
        ? `<div class="grade grade--auto">${d.materias_exercicios.map(function (m) {
            const revisar = m.precisa_revisar;

            return `<article class="materia-card">
                <div class="materia-card__linha">
                    <span class="materia-card__nome">${UL.esc(m.materia)}</span>
                    <span class="materia-card__taxa">${m.taxa_acerto}%</span>
                </div>
                <div class="progresso progresso--claro" role="progressbar" aria-valuenow="${m.taxa_acerto}" aria-valuemin="0" aria-valuemax="100" aria-label="Taxa de acerto em ${UL.esc(m.materia)}"><span style="width:${m.taxa_acerto}%"></span></div>
                <p class="subtitulo" style="font-size:.88rem">${m.acertos} acertos em ${m.questoes} questões · ${m.exercicios} quiz${m.exercicios > 1 ? 'zes' : ''}</p>
                <span class="selo ${revisar ? 'selo--aviso' : 'selo--ok'}" style="justify-self:start"><i class="fa-solid ${revisar ? 'fa-rotate' : 'fa-circle-check'}" aria-hidden="true"></i> ${revisar ? 'Vale revisar' : 'Indo bem'}</span>
                ${revisar ? `<a class="btn btn--suave btn--p" href="tutora.html?modo=revisar&materia=${encodeURIComponent(m.materia)}&assunto=${encodeURIComponent('Quero revisar ' + m.materia)}">Revisar com o Up</a>` : ''}
            </article>`;
        }).join('')}</div>`
        : `<div class="card vazio"><span class="pers" data-p="quadrado verde piscando quadris"></span><p>Sua taxa de acertos por matéria aparece aqui depois do primeiro quiz.</p><a class="btn btn--primario btn--p" href="quiz.html">Fazer um quiz</a></div>`;

    const exercicios = `
        <section class="secao" aria-labelledby="tEx">
            <h2 id="tEx" style="margin-bottom:12px">Exercícios por matéria</h2>
            ${materiasEx}
        </section>`;

    /* ---- matérias conversadas ---- */

    const maxConv = Math.max(1, ...d.materias_conversadas.map(function (m) { return m.perguntas; }));

    const conversadas = d.materias_conversadas.length ? `
        <section class="card secao" aria-labelledby="tConv">
            <h2 id="tConv" style="margin-bottom:12px">Do que você mais perguntou</h2>
            <div class="barras-h">${d.materias_conversadas.map(function (m) {
                return `<div class="barra-h"><span>${UL.esc(m.nome)}</span><div class="progresso progresso--claro" aria-hidden="true"><span style="width:${Math.round(100 * m.perguntas / maxConv)}%"></span></div><strong>${m.perguntas}</strong></div>`;
            }).join('')}</div>
        </section>` : '';

    /* ---- conquistas ---- */

    const ganhas = d.conquistas.filter(function (c) { return c.conquistada; }).length;

    const conquistas = `
        <section class="secao" id="conquistas" aria-labelledby="tConq">
            <div class="secao__cab"><h2 id="tConq">Conquistas</h2><span class="selo">${ganhas} de ${d.conquistas.length}</span></div>
            <p class="subtitulo" style="margin-bottom:12px">Elas celebram seu esforço e prática. Ninguém perde conquista, e não tem competição.</p>
            <div class="conquistas">${d.conquistas.map(function (c) {
                return `<div class="conquista${c.conquistada ? ' ganha' : ''}">
                    <i class="fa-solid ${c.conquistada ? (ICONE_CONQUISTA[c.id] || 'fa-star') : 'fa-lock'}" aria-hidden="true"></i>
                    <strong>${UL.esc(c.titulo)}</strong>
                    <small>${UL.esc(c.descricao)}</small>
                    <small style="font-weight:800">${c.conquistada ? '✓ Conquistada' : 'Ainda não'}</small>
                </div>`;
            }).join('')}</div>
        </section>`;

    const painel = document.getElementById('painel');

    painel.innerHTML = resumo + recomendacoes + tiles + sequencia + grafico + exercicios + conversadas + conquistas;
    painel.removeAttribute('aria-busy');
    montarPersonagens(painel);
}


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('desempenho', async function () {

        try {
            desenharPainel(await api('/desempenho/'));

            if (location.hash === '#conquistas') {
                const el = document.getElementById('conquistas');
                if (el) el.scrollIntoView();
            }

        } catch (erro) {
            document.getElementById('painel').innerHTML = `
                <div class="card vazio">
                    <span class="pers pers--anima" data-p="blob coral triste relax"></span>
                    <h2>Não foi possível carregar</h2>
                    <p>${UL.esc(erro.message)}</p>
                    <button type="button" class="btn btn--primario" onclick="location.reload()">Tentar de novo</button>
                </div>`;
            montarPersonagens(document.getElementById('painel'));
        }
    });
});
