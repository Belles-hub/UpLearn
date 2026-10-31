/* =========================================
   TELA INICIAL

   Tudo que aparece aqui vem dos planos e da atividade reais da pessoa.
   Sem dados, mostramos um estado vazio que convida a começar — nunca
   número inventado.
========================================= */

// Tarefas ainda não feitas dos planos ativos, na ordem em que devem ser feitas.
function tarefasPendentes(planos) {
    const lista = [];

    planos.filter(function (p) { return !p.pausado; }).forEach(function (plano) {
        plano.tarefas.forEach(function (t, i) {
            if (!t.concluida) lista.push({ plano: plano, tarefa: t, ordem: i });
        });
    });

    // Dia mais cedo primeiro; dentro do mesmo dia, a ordem do próprio plano.
    lista.sort(function (a, b) {
        return (a.tarefa.dia || '9999').localeCompare(b.tarefa.dia || '9999') || a.ordem - b.ordem;
    });

    return lista;
}


function desenharSemana(atividade) {
    const ultimos = atividade.slice(-7);
    const hoje = UL.hojeISO();
    const letras = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    document.getElementById('semana').innerHTML = ultimos.map(function (d) {
        const data = new Date(d.dia + 'T12:00:00');
        const ativo = d.perguntas > 0;

        return `<div class="semana__dia${ativo ? ' ativo' : ''}${d.dia === hoje ? ' hoje' : ''}"${d.dia === hoje ? ' aria-current="date"' : ''}>
            <span>${letras[data.getDay()]}</span>
            <b>${data.getDate()}</b>
            <span class="sinal">${ativo ? '<i class="fa-solid fa-check" aria-hidden="true"></i><span class="sr-only">com atividade</span>' : '<span class="sr-only">sem atividade</span>'}</span>
        </div>`;
    }).join('');
}


// Sequência de dias e revisão do dia: só aparecem quando há o que mostrar.
function desenharMetas(resumo) {
    const alvo = document.getElementById('metas');
    const partes = [];

    if (resumo.sequencia_dias > 0) {
        const n = resumo.sequencia_dias;

        partes.push(`<span class="selo"><i class="fa-solid fa-fire" aria-hidden="true"></i> ${n} ${n === 1 ? 'dia seguido' : 'dias seguidos'}</span>`);
    }

    if (resumo.revisao_pendente > 0) {
        const n = resumo.revisao_pendente;

        partes.push(`<a class="btn btn--suave" href="revisao.html"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Revisar ${n} ${n === 1 ? 'questão' : 'questões'} de hoje</a>`);
    }

    alvo.innerHTML = partes.join('');
    alvo.hidden = !partes.length;
}


function desenharContinuar(planos, pendentes) {
    const alvo = document.getElementById('continuar');

    // Um "palco": personagem em pé sobre a linha, e embaixo o que fazer agora.
    function palco(personagem, rotulo, titulo, texto, botoes) {
        alvo.innerHTML = `
            <div class="palco">
                <span class="conf" style="left:12%;top:26px" data-conf="brilho amarelo"></span>
                <span class="conf" style="right:12%;top:60px;width:16px" data-conf="bolinha ciano"></span>
                <span class="conf" style="right:20%;top:18px;width:18px" data-conf="traco rosa"></span>
                <span class="pers pers--anima" data-p="${personagem}"></span>
                <span class="palco__chao"></span>
                <span class="rotulo-mini">${rotulo}</span>
                <h2>${titulo}</h2>
                <p>${texto}</p>
                ${botoes}
            </div>`;
    }

    if (!planos.length) {
        palco('pera amarelo feliz acena', 'Vamos começar?', 'Monte seu primeiro plano de estudos',
            'Conte o que quer aprender e o Up organiza tudo em passos pequenos.',
            '<a class="btn btn--escuro" href="estudos.html?novo=1">Criar plano</a>');
        return;
    }

    if (!pendentes.length) {
        palco('estrela ciano bocao alto', 'Tudo em dia', 'Você terminou o que tinha planejado!',
            'Que tal um quiz rápido ou um novo plano?',
            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><a class="btn btn--escuro" href="quiz.html">Fazer um quiz</a><a class="btn btn--contorno" href="estudos.html?novo=1">Novo plano</a></div>');
        return;
    }

    const proxima = pendentes[0];

    palco('circulo amarelo feliz quadris', 'Continuar estudando · ' + UL.esc(proxima.plano.materia), UL.esc(proxima.tarefa.titulo),
        UL.esc(proxima.plano.titulo) + ' · ' + proxima.tarefa.duracao_min + ' min',
        `<a class="btn btn--escuro" href="estudos.html?plano=${encodeURIComponent(proxima.plano.id)}">Continuar <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`);
}


function desenharProximas(planos, pendentes) {
    const alvo = document.getElementById('proximas');

    if (!pendentes.length) {
        alvo.innerHTML = `
            <div class="card vazio">
                <span class="pers" data-p="hexagono azul dormindo relax"></span>
                <p>${planos.length ? 'Nenhuma atividade pendente. Bom descanso!' : 'Quando você criar um plano, suas próximas atividades aparecem aqui.'}</p>
            </div>`;
        return;
    }

    alvo.innerHTML = '<div class="pilha">' + pendentes.slice(0, 3).map(function (p) {
        const t = p.tarefa;

        return `<div class="pilha__card" style="background:var(--c-${(UL.TIPOS[t.tipo] || UL.TIPOS.estudo).cor})">
            <div class="pilha__linha"><span>${UL.esc(t.titulo)}</span><span>${t.duracao_min} min</span></div>
            <div class="pilha__meta"><i class="fa-solid ${(UL.TIPOS[t.tipo] || UL.TIPOS.estudo).icone}" aria-hidden="true"></i> ${(UL.TIPOS[t.tipo] || UL.TIPOS.estudo).rotulo} · ${UL.esc(UL.rotuloDia(t.dia))} · ${UL.esc(p.plano.materia)}</div>
        </div>`;
    }).join('') + '</div>';
}


function desenharProgresso(resumo) {
    const alvo = document.getElementById('progresso');
    const p = resumo.progresso_planos;

    if (!p.tarefas_total) {
        alvo.innerHTML = `
            <div class="card card--cor card--roxo" style="display:grid;gap:8px">
                <span class="rotulo-mini">Seu progresso</span>
                <h2>Ainda sem metas por aqui</h2>
                <p style="opacity:.9">Crie um plano de estudos e acompanhe cada passo concluído.</p>
            </div>`;
        return;
    }

    const pct = Math.round(100 * p.tarefas_concluidas / p.tarefas_total);

    alvo.innerHTML = `
        <div class="card card--cor card--roxo" style="display:grid;gap:12px">
            <span class="rotulo-mini">Seu progresso</span>
            <h2>${pct}% das metas concluídas</h2>
            <div class="progresso" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso das metas de estudo" style="color:var(--c-amarelo)"><span style="width:${pct}%"></span></div>
            <p>${p.tarefas_concluidas} de ${p.tarefas_total} atividades concluídas</p>
        </div>
        <div class="tiles" style="margin-top:14px">
            <div class="card card--cor card--laranja tile"><i class="fa-solid fa-clock" aria-hidden="true"></i><span class="tile__valor">${p.minutos_estudados}</span><span class="tile__rot">min de estudo concluídos</span></div>
            <div class="card card--cor card--lilas tile"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span class="tile__valor">${resumo.dias_ativos_ultima_semana}</span><span class="tile__rot">dia(s) com atividade na semana</span></div>
        </div>`;
}


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('inicio', async function (usuario) {

        document.getElementById('ola').textContent = 'Olá, ' + UL.primeiroNome(usuario.nome) + '! 👋';

        // Uma frase por dia — a mesma o dia todo, pra tela não "mudar sozinha".
        const diaDoAno = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        document.getElementById('frase').textContent = UL.escolher(UL.FRASES, diaDoAno);

        const [planosRes, resumoRes] = await Promise.allSettled([
            api('/planos/'),
            api('/desempenho/rapido')
        ]);

        const planos = planosRes.status === 'fulfilled' ? planosRes.value : [];
        const pendentes = tarefasPendentes(planos);

        desenharContinuar(planos, pendentes);
        desenharProximas(planos, pendentes);

        if (resumoRes.status === 'fulfilled') {
            desenharSemana(resumoRes.value.atividade_por_dia);
            desenharProgresso(resumoRes.value);
            desenharMetas(resumoRes.value);
        } else {
            document.getElementById('semana').hidden = true;
            document.getElementById('progresso').innerHTML =
                '<div class="card"><p>Não foi possível carregar seu progresso agora. Tente de novo mais tarde.</p></div>';
        }

        if (planosRes.status === 'rejected') {
            UL.toast('Não foi possível carregar seus planos agora.', 'erro');
        }

        montarPersonagens(document);
    });
});
