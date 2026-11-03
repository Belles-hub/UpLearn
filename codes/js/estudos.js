/* =========================================
   PLANO DE ESTUDOS

   O plano é gerado pela IA, mas é SEU: dá pra marcar como feito, editar,
   trocar de lugar, adicionar, remover, pausar. Cada mudança é salva na hora
   (a lista inteira vai junto — é simples e evita conflito entre edições).
========================================= */

let planos = [];
let atual = null;
let editandoId = null;
let adicionando = false;
let filaDeSalvamento = Promise.resolve();

const DIFICULDADES = [
    { id: 'facil', rotulo: 'Acho fácil' },
    { id: 'media', rotulo: 'Mais ou menos' },
    { id: 'dificil', rotulo: 'Acho difícil' }
];

const MINUTOS_POR_SESSAO = { curta: 20, media: 30, longa: 45 };


function novoIdTarefa() {
    return (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 12);
}


/* ---------- salvar ---------- */

function salvar() {
    const plano = atual;
    const corpo = {
        titulo: plano.titulo,
        pausado: plano.pausado,
        tarefas: plano.tarefas
    };

    // Uma de cada vez, na ordem — dois cliques rápidos não se atropelam.
    filaDeSalvamento = filaDeSalvamento
        .then(function () { return api('/planos/' + encodeURIComponent(plano.id), { metodo: 'PUT', corpo: corpo }); })
        .catch(async function (erro) {
            UL.toast('Não foi possível salvar essa mudança: ' + erro.message, 'erro');
            await carregar(plano.id);
        });
}


function resumoDoPlano(plano) {
    const total = plano.tarefas.length;
    const feitas = plano.tarefas.filter(function (t) { return t.concluida; }).length;

    return { total: total, feitas: feitas, pct: total ? Math.round(100 * feitas / total) : 0 };
}


/* ---------- desenho ---------- */

function desenharAbas() {
    const abas = document.getElementById('abas');

    abas.hidden = planos.length < 2;

    abas.innerHTML = planos.map(function (p) {
        return `<button type="button" class="chip" data-id="${UL.esc(p.id)}" aria-pressed="${atual && atual.id === p.id}">${UL.esc(p.materia)}: ${UL.esc(p.titulo)}</button>`;
    }).join('');
}


function htmlTarefa(t, i, total) {
    const tipo = UL.TIPOS[t.tipo] || UL.TIPOS.estudo;
    const nome = UL.esc(t.titulo);

    if (editandoId === t.id) {
        return `<li class="tarefa tarefa--edicao" data-id="${UL.esc(t.id)}">
            <form data-form-editar novalidate>
                <div class="campo"><label for="ed-titulo">O que fazer</label><input type="text" id="ed-titulo" maxlength="120" value="${nome}" required></div>
                <div class="linha">
                    <div class="campo"><label for="ed-tipo">Tipo</label>
                        <select id="ed-tipo">${Object.keys(UL.TIPOS).map(function (k) { return `<option value="${k}"${k === t.tipo ? ' selected' : ''}>${UL.TIPOS[k].rotulo}</option>`; }).join('')}</select></div>
                    <div class="campo"><label for="ed-min">Minutos</label><input type="number" id="ed-min" min="1" max="180" value="${t.duracao_min}"></div>
                </div>
                <div class="campo"><label for="ed-dia">Dia</label><input type="date" id="ed-dia" value="${UL.esc(t.dia || '')}"></div>
                <div style="display:flex;gap:8px"><button type="submit" class="btn btn--primario btn--p">Salvar</button><button type="button" class="btn btn--suave btn--p" data-acao="cancelar">Cancelar</button></div>
            </form>
        </li>`;
    }

    return `<li class="tarefa${t.concluida ? ' feita' : ''}" data-id="${UL.esc(t.id)}">
        <button type="button" class="marcar" data-acao="marcar" aria-pressed="${t.concluida}" aria-label="${t.concluida ? 'Desmarcar' : 'Marcar como feita'}: ${nome}">${t.concluida ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}</button>
        <div>
            <div class="tarefa__titulo">${nome}</div>
            <div class="tarefa__meta">
                <span class="selo tipo-${UL.esc(t.tipo)}"><i class="fa-solid ${tipo.icone}" aria-hidden="true"></i> ${tipo.rotulo}</span>
                <span class="selo"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${t.duracao_min} min</span>
            </div>
        </div>
        <div class="tarefa__acoes">
            <button type="button" class="btn btn--icone" data-acao="subir" aria-label="Mover para cima: ${nome}"${i === 0 ? ' disabled' : ''}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--icone" data-acao="descer" aria-label="Mover para baixo: ${nome}"${i === total - 1 ? ' disabled' : ''}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--icone" data-acao="editar" aria-label="Editar: ${nome}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="btn btn--icone" data-acao="remover" aria-label="Remover: ${nome}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
        </div>
    </li>`;
}


function htmlFormAdicionar() {
    return `<li class="tarefa tarefa--edicao">
        <form data-form-adicionar novalidate>
            <div class="campo"><label for="ad-titulo">Nova tarefa</label><input type="text" id="ad-titulo" maxlength="120" placeholder="Ex.: Refazer os exercícios da página 42" required></div>
            <div class="linha">
                <div class="campo"><label for="ad-tipo">Tipo</label>
                    <select id="ad-tipo">${Object.keys(UL.TIPOS).map(function (k) { return `<option value="${k}">${UL.TIPOS[k].rotulo}</option>`; }).join('')}</select></div>
                <div class="campo"><label for="ad-min">Minutos</label><input type="number" id="ad-min" min="1" max="180" value="20"></div>
            </div>
            <div class="campo"><label for="ad-dia">Dia</label><input type="date" id="ad-dia" value="${UL.hojeISO()}"></div>
            <div style="display:flex;gap:8px"><button type="submit" class="btn btn--primario btn--p">Adicionar</button><button type="button" class="btn btn--suave btn--p" data-acao="cancelar-add">Cancelar</button></div>
        </form>
    </li>`;
}


function desenharPlano() {
    const alvo = document.getElementById('plano');

    if (!atual) {
        alvo.innerHTML = `
            <div class="card vazio entrar">
                <span class="pers pers--anima" data-p="pera amarelo feliz acena"></span>
                <h2>Nenhum plano por aqui ainda</h2>
                <p>Conte para o Up o que você quer aprender e ele monta um plano com passos pequenos, revisões e pausas.</p>
                <button type="button" class="btn btn--primario" data-acao="novo">Criar meu primeiro plano</button>
            </div>`;
        montarPersonagens(alvo);
        return;
    }

    const r = resumoDoPlano(atual);
    const ultimoDia = atual.tarefas.map(function (t) { return t.dia; }).filter(Boolean).sort().pop();
    const passouDaProva = atual.data_avaliacao && ultimoDia && ultimoDia > atual.data_avaliacao;

    let ultimoCabecalho = null;

    const lista = atual.tarefas.map(function (t, i) {
        let cab = '';

        if (t.dia !== ultimoCabecalho) {
            ultimoCabecalho = t.dia;
            cab = `<li class="dia-titulo">${UL.esc(UL.rotuloDia(t.dia))}</li>`;
        }

        return cab + htmlTarefa(t, i, atual.tarefas.length);
    }).join('');

    alvo.innerHTML = `
        <section class="card card--cor card--roxo plano-cab entrar" aria-labelledby="tituloPlano">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
                <div>
                    <span class="rotulo-mini">${UL.esc(atual.materia)} · ${UL.esc(atual.conteudo)}</span>
                    <h2 id="tituloPlano" style="margin-top:4px">${UL.esc(atual.titulo)}</h2>
                </div>
                <button type="button" class="btn btn--icone" data-acao="renomear" aria-label="Renomear o plano" style="flex:none"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            </div>
            ${atual.pausado ? '<p><span class="selo selo--aviso"><i class="fa-solid fa-pause" aria-hidden="true"></i> Plano pausado</span> Ele não aparece na tela inicial até você retomar.</p>' : ''}
            <div>
                <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:6px"><span>Progresso geral</span><span>${r.pct}%</span></div>
                <div class="progresso" role="progressbar" aria-valuenow="${r.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso geral do plano" style="color:var(--c-amarelo)"><span style="width:${r.pct}%"></span></div>
                <p style="margin-top:6px;opacity:.9">${r.feitas} de ${r.total} atividades concluídas</p>
            </div>
            ${atual.data_avaliacao ? `<p><i class="fa-solid fa-flag" aria-hidden="true"></i> Avaliação em ${UL.esc(atual.data_avaliacao.split('-').reverse().join('/'))}</p>` : ''}
            ${passouDaProva ? '<p class="selo selo--aviso" style="justify-self:start"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Algumas atividades ficam depois da avaliação. Reorganize os dias ou crie um plano com mais minutos por dia.</p>' : ''}
            <div style="display:flex;flex-wrap:wrap;gap:8px">
                <a class="btn btn--claro btn--p" href="quiz.html?materia=${encodeURIComponent(atual.materia)}&conteudo=${encodeURIComponent(atual.conteudo)}"><i class="fa-solid fa-pencil" aria-hidden="true"></i> Praticar com quiz</a>
                <a class="btn btn--contorno-claro btn--p" href="tutora.html?materia=${encodeURIComponent(atual.materia)}&assunto=${encodeURIComponent('Quero estudar ' + atual.conteudo)}"><i class="fa-solid fa-comments" aria-hidden="true"></i> Perguntar ao Up</a>
                <button type="button" class="btn btn--contorno-claro btn--p" data-acao="pausar"><i class="fa-solid ${atual.pausado ? 'fa-play' : 'fa-pause'}" aria-hidden="true"></i> ${atual.pausado ? 'Retomar' : 'Pausar'}</button>
                <button type="button" class="btn btn--contorno-claro btn--p" data-acao="baixar" title="Baixar o plano em PDF, pra guardar ou imprimir"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Baixar e imprimir</button>
            </div>
        </section>

        <section class="secao" aria-labelledby="tTarefas">
            <div class="secao__cab">
                <h2 id="tTarefas">Atividades</h2>
                <button type="button" class="btn btn--suave btn--p" data-acao="ordenar-dia"><i class="fa-solid fa-arrow-down-1-9" aria-hidden="true"></i> Organizar por dia</button>
            </div>
            <ul class="linha-tempo" style="margin-top:0">${lista}${adicionando ? htmlFormAdicionar() : ''}</ul>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
                <button type="button" class="btn btn--suave" data-acao="adicionar"${adicionando ? ' hidden' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar tarefa</button>
                <button type="button" class="btn btn--perigo" data-acao="excluir-plano"><i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir plano</button>
            </div>
            <p class="subtitulo" style="margin-top:14px;font-size:.88rem">Dica: estudar um pouco por dia, com pausas, funciona melhor do que estudar tudo de uma vez.</p>
        </section>`;

    montarPersonagens(alvo);
    desenharAbas();
}


/* ---------- carregar ---------- */

async function carregar(idPreferido) {
    planos = await api('/planos/');

    const pedido = idPreferido || new URLSearchParams(location.search).get('plano');

    atual = planos.find(function (p) { return p.id === pedido; }) || planos.find(function (p) { return !p.pausado; }) || planos[0] || null;

    editandoId = null;
    adicionando = false;

    desenharPlano();
}


/* ---------- ações nas tarefas ---------- */

function acaoNaTarefa(acao, id) {
    const i = atual.tarefas.findIndex(function (t) { return t.id === id; });

    if (i < 0) return;

    const t = atual.tarefas[i];

    if (acao === 'marcar') {
        t.concluida = !t.concluida;
        salvar();
        desenharPlano();
        if (t.concluida) UL.toast('Muito bem! Mais um passo concluído. 🎉', 'sucesso');
        const botao = document.querySelector(`[data-id="${CSS.escape(id)}"] [data-acao="marcar"]`);
        if (botao) botao.focus();
    }
    else if (acao === 'editar') { editandoId = id; adicionando = false; desenharPlano(); document.getElementById('ed-titulo').focus(); }
    else if (acao === 'cancelar') { editandoId = null; desenharPlano(); }
    else if (acao === 'remover') {
        UL.confirmar('Remover tarefa?', `“${t.titulo}” sai do seu plano.`, 'Remover').then(function (ok) {
            if (!ok) return;
            atual.tarefas.splice(i, 1);
            salvar();
            desenharPlano();
        });
    }
    else if (acao === 'subir' || acao === 'descer') {
        const j = acao === 'subir' ? i - 1 : i + 1;

        if (j < 0 || j >= atual.tarefas.length) return;

        atual.tarefas.splice(i, 1);
        atual.tarefas.splice(j, 0, t);
        salvar();
        desenharPlano();

        const botao = document.querySelector(`[data-id="${CSS.escape(id)}"] [data-acao="${acao}"]`);
        if (botao && !botao.disabled) botao.focus();
    }
}


function lerCamposDaTarefa(prefixo) {
    const titulo = document.getElementById(prefixo + '-titulo').value.trim();
    const minutos = parseInt(document.getElementById(prefixo + '-min').value, 10);

    if (!titulo) {
        UL.toast('Escreva o que fazer nessa tarefa.', 'erro');
        document.getElementById(prefixo + '-titulo').focus();
        return null;
    }

    if (!(minutos >= 1 && minutos <= 180)) {
        UL.toast('Use entre 1 e 180 minutos.', 'erro');
        document.getElementById(prefixo + '-min').focus();
        return null;
    }

    return {
        titulo: titulo,
        tipo: document.getElementById(prefixo + '-tipo').value,
        duracao_min: minutos,
        dia: document.getElementById(prefixo + '-dia').value || null
    };
}


/* ---------- novo plano ---------- */

function abrirNovoPlano() {
    const pref = (UL.usuario && UL.usuario.preferencias) || {};
    const minutos = MINUTOS_POR_SESSAO[pref.duracao_sessao] || 30;
    const materiasDoUsuario = (pref.materias && pref.materias.length) ? pref.materias : UL.MATERIAS;

    const s = UL.abrirSheet('Novo plano de estudos', `
        <div id="avisoNovo" class="cu-notificacao-area"></div>
        <form id="formNovo" novalidate>
            <div class="campo">
                <label for="np-materia">Matéria</label>
                <select id="np-materia">${materiasDoUsuario.map(function (m) { return `<option>${UL.esc(m)}</option>`; }).join('')}<option value="__outra">Outra…</option></select>
            </div>
            <div class="campo" id="np-outra-campo" hidden>
                <label for="np-outra">Qual matéria?</label>
                <input type="text" id="np-outra" maxlength="40">
            </div>
            <div class="campo">
                <label for="np-conteudo">O que você quer aprender?</label>
                <input type="text" id="np-conteudo" maxlength="200" placeholder="Ex.: Frações e números decimais" required>
                <p class="campo__erro" id="np-conteudo-erro" role="alert"></p>
            </div>
            <div class="campo">
                <label for="np-objetivo">Objetivo (opcional)</label>
                <input type="text" id="np-objetivo" maxlength="200" value="${UL.esc(pref.objetivo || '')}" placeholder="Ex.: ir bem na prova">
            </div>
            <div class="campo">
                <label for="np-min">Tempo por dia: <output id="np-min-out">${minutos}</output> min</label>
                <input type="range" id="np-min" min="10" max="120" step="5" value="${minutos}">
                <span class="dica">Estudar pouco por dia, com constância, funciona melhor que maratonas.</span>
            </div>
            <div class="campo">
                <label for="np-data">Data da avaliação (se tiver)</label>
                <input type="date" id="np-data" min="${UL.hojeISO()}">
            </div>
            <div class="campo">
                <span class="rotulo" id="np-dif-rot">Como você acha o assunto?</span>
                <div class="opcoes" id="np-dif" role="group" aria-labelledby="np-dif-rot">${DIFICULDADES.map(function (d) { return `<button type="button" class="chip" data-id="${d.id}" aria-pressed="${d.id === 'media'}">${d.rotulo}</button>`; }).join('')}</div>
            </div>
            <button type="submit" class="btn btn--primario btn--bloco"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Montar meu plano</button>
        </form>`);

    const form = s.el.querySelector('#formNovo');
    const selMateria = s.el.querySelector('#np-materia');
    let dificuldade = 'media';

    selMateria.addEventListener('change', function () {
        s.el.querySelector('#np-outra-campo').hidden = selMateria.value !== '__outra';
    });

    s.el.querySelector('#np-min').addEventListener('input', function () {
        s.el.querySelector('#np-min-out').textContent = this.value;
    });

    s.el.querySelector('#np-dif').addEventListener('click', function (e) {
        const chip = e.target.closest('.chip');

        if (!chip) return;

        dificuldade = chip.dataset.id;
        this.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
    });

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        UL.limparErros(form);
        esconderNotificacao('avisoNovo');

        const materia = selMateria.value === '__outra' ? s.el.querySelector('#np-outra').value.trim() : selMateria.value;
        const conteudo = s.el.querySelector('#np-conteudo').value.trim();

        if (materia.length < 2) {
            UL.mostrarErroCampo(s.el.querySelector('#np-outra'), 'Escreva o nome da matéria.');
            s.el.querySelector('#np-outra').focus();
            return;
        }

        if (conteudo.length < 2) {
            UL.mostrarErroCampo(s.el.querySelector('#np-conteudo'), 'Conte o que você quer aprender.');
            s.el.querySelector('#np-conteudo').focus();
            return;
        }

        const corpo = {
            materia: materia,
            conteudo: conteudo,
            objetivo: s.el.querySelector('#np-objetivo').value.trim() || null,
            minutos_por_dia: parseInt(s.el.querySelector('#np-min').value, 10),
            data_avaliacao: s.el.querySelector('#np-data').value || null,
            dificuldade: dificuldade
        };

        // O formulário só é escondido (não apagado): se a IA falhar, a pessoa
        // volta pra ele com tudo que já tinha digitado.
        const carregando = document.createElement('div');

        carregando.className = 'carregando-ia';
        carregando.setAttribute('role', 'status');
        carregando.innerHTML = `
            <span class="pers pers--anima" data-p="nuvem lilas dormindo chapeu relax"></span>
            <h3>O Up está montando seu plano…</h3>
            <p class="subtitulo">Isso leva alguns segundos.</p>`;

        form.hidden = true;
        s.corpo.appendChild(carregando);
        montarPersonagens(carregando);

        try {
            const novo = await api('/planos/gerar', { metodo: 'POST', corpo: corpo });

            s.fechar();
            await carregar(novo.id);
            UL.toast('Plano pronto! Confira, ajuste do seu jeito e, se quiser, baixe o mapa ou a lista em PDF.', 'sucesso');

        } catch (erro) {
            carregando.remove();
            form.hidden = false;
            mostrarNotificacao('avisoNovo', erro.message);
        }
    });
}


/* ---------- baixar e imprimir ---------- */

// Saídas em PDF: lista de atividades, mapa, resumo de estudo e flashcards (os três últimos desenhados pela IA só pra esta pessoa).
function abrirBaixar() {
    const plano = atual;

    const s = UL.abrirSheet('Baixar e imprimir', `
        <p class="subtitulo" style="margin-bottom:14px">Escolha o que levar pra fora do app. Todos são PDF e ficam bons impressos, até em preto e branco.</p>
        <div class="baixar-opcoes">
            <button type="button" class="baixar-op" data-op="lista">
                <span class="baixar-op__icone"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span>
                <span><strong>Lista de atividades</strong><small>Todas as tarefas por dia, com caixinha pra marcar. Boa pra colar na mesa.</small></span>
            </button>
            <button type="button" class="baixar-op" data-op="mapa">
                <span class="baixar-op__icone"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i></span>
                <span><strong>Mapa do plano</strong><small>O Up desenha um mapa só seu: os assuntos-chave, a trilha dia a dia e dicas do seu jeito de estudar.${plano.mapa ? ' Já está pronto!' : ''}</small></span>
            </button>
            <button type="button" class="baixar-op" data-op="resumo">
                <span class="baixar-op__icone"><i class="fa-solid fa-book-open" aria-hidden="true"></i></span>
                <span><strong>Resumo de estudo</strong><small>Os tópicos principais em frases curtas, com espaço pra você escrever com as suas palavras.${plano.fichas ? ' Já está pronto!' : ''}</small></span>
            </button>
            <button type="button" class="baixar-op" data-op="flashcards">
                <span class="baixar-op__icone"><i class="fa-solid fa-clone" aria-hidden="true"></i></span>
                <span><strong>Flashcards</strong><small>Cartas de pergunta e resposta pra recortar e treinar a memória.${plano.fichas ? ' Já estão prontas!' : ''}</small></span>
            </button>
        </div>
        <div id="baixarEstado" role="status" aria-live="polite"></div>
        ${plano.mapa ? '<button type="button" class="btn btn--suave btn--p" data-op="mapa-novo"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Pedir um mapa novo ao Up</button>' : ''}
        ${plano.fichas ? '<button type="button" class="btn btn--suave btn--p" data-op="fichas-novas"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Pedir resumo e cartões novos ao Up</button>' : ''}`);

    const estado = s.el.querySelector('#baixarEstado');
    const botoes = Array.from(s.el.querySelectorAll('[data-op]'));

    function ocupado(ligado, mensagem) {
        botoes.forEach(function (b) { b.disabled = ligado; });
        estado.innerHTML = ligado
            ? `<p class="carregando-ia" style="padding:14px 0"><span><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${UL.esc(mensagem)}</span></p>`
            : '';
    }

    s.el.addEventListener('click', async function (e) {
        const botao = e.target.closest('[data-op]');

        if (!botao) return;

        const op = botao.dataset.op;

        try {
            if (op === 'lista') {
                ocupado(true, 'Montando o PDF…');
                await PlanoPdf.baixar(JSON.parse(JSON.stringify(plano)));
                s.fechar();
                UL.toast('PDF pronto! Ele foi para a sua pasta de downloads.', 'sucesso');
                return;
            }

            // Resumo e flashcards vêm da mesma chamada à IA e ficam guardados no plano.
            if (op === 'resumo' || op === 'flashcards' || op === 'fichas-novas') {
                if (!plano.fichas || op === 'fichas-novas') {
                    ocupado(true, 'O Up está preparando o seu material… isso leva alguns segundos.');
                    plano.fichas = await api('/planos/' + encodeURIComponent(plano.id) + '/fichas', { metodo: 'POST' });
                }

                ocupado(true, 'Montando o PDF…');

                if (op === 'flashcards') await FichasPdf.flashcards(JSON.parse(JSON.stringify(plano)));
                else await FichasPdf.resumo(JSON.parse(JSON.stringify(plano)));

                s.fechar();
                UL.toast('PDF pronto! Ele foi para a sua pasta de downloads.', 'sucesso');
                return;
            }

            // Mapa: se ainda não existe (ou a pessoa pediu um novo), o Up desenha agora.
            if (!plano.mapa || op === 'mapa-novo') {
                ocupado(true, 'O Up está desenhando o seu mapa… isso leva alguns segundos.');
                plano.mapa = await api('/planos/' + encodeURIComponent(plano.id) + '/mapa', { metodo: 'POST' });
            }

            ocupado(true, 'Montando o PDF…');
            await MapaPdf.baixar(JSON.parse(JSON.stringify(plano)), UL.usuario && UL.usuario.nome);
            s.fechar();
            UL.toast('Mapa pronto! Ele foi para a sua pasta de downloads.', 'sucesso');

        } catch (erro) {
            console.error(erro);
            ocupado(false);
            estado.innerHTML = `<p class="cu-notificacao cu-notificacao--erro" role="alert"><span class="cu-notificacao-texto">${UL.esc(erro instanceof TypeError ? 'Não consegui falar com o servidor. Confira sua internet e tente de novo.' : (erro.message || 'Não foi possível gerar o PDF agora.'))}</span></p>`;
        }
    });
}


/* ---------- eventos ---------- */

document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('estudos', async function () {

        await carregar();

        if (new URLSearchParams(location.search).get('novo') === '1') {
            abrirNovoPlano();
        }

        document.getElementById('btnNovo').addEventListener('click', abrirNovoPlano);

        document.getElementById('abas').addEventListener('click', function (e) {
            const chip = e.target.closest('.chip');

            if (!chip) return;

            atual = planos.find(function (p) { return p.id === chip.dataset.id; });
            editandoId = null;
            adicionando = false;
            desenharPlano();
        });

        const alvo = document.getElementById('plano');

        alvo.addEventListener('click', async function (e) {
            const botao = e.target.closest('[data-acao]');

            if (!botao) return;

            const acao = botao.dataset.acao;
            const li = botao.closest('[data-id]');

            if (acao === 'novo') return abrirNovoPlano();

            if (!atual) return;

            if (li && ['marcar', 'editar', 'cancelar', 'remover', 'subir', 'descer'].includes(acao)) {
                return acaoNaTarefa(acao, li.dataset.id);
            }

            if (acao === 'adicionar') { adicionando = true; editandoId = null; desenharPlano(); document.getElementById('ad-titulo').focus(); }
            else if (acao === 'cancelar-add') { adicionando = false; desenharPlano(); }
            else if (acao === 'pausar') { atual.pausado = !atual.pausado; salvar(); desenharPlano(); }
            else if (acao === 'baixar') { abrirBaixar(); }
            else if (acao === 'ordenar-dia') {
                // sort é estável: dentro do mesmo dia, a ordem que a pessoa deu é mantida.
                atual.tarefas.sort(function (a, b) { return (a.dia || '9999').localeCompare(b.dia || '9999'); });
                salvar();
                desenharPlano();
            }
            else if (acao === 'renomear') {
                const s = UL.abrirSheet('Renomear plano', `
                    <form id="formNome"><div class="campo"><label for="novoNome">Nome do plano</label><input type="text" id="novoNome" maxlength="120" value="${UL.esc(atual.titulo)}"></div>
                    <button type="submit" class="btn btn--primario btn--bloco">Salvar</button></form>`);

                s.el.querySelector('#formNome').addEventListener('submit', function (ev) {
                    ev.preventDefault();

                    const nome = s.el.querySelector('#novoNome').value.trim();

                    if (!nome) return;

                    atual.titulo = nome;
                    salvar();
                    s.fechar();
                    desenharPlano();
                });
            }
            else if (acao === 'excluir-plano') {
                const ok = await UL.confirmar('Excluir este plano?', `“${atual.titulo}” e todas as suas atividades serão apagados. Isso não dá para desfazer.`, 'Excluir plano');

                if (!ok) return;

                try {
                    await api('/planos/' + encodeURIComponent(atual.id), { metodo: 'DELETE' });
                    await carregar();
                    UL.toast('Plano excluído.', 'info');
                } catch (erro) {
                    UL.toast(erro.message, 'erro');
                }
            }
        });

        alvo.addEventListener('submit', function (e) {
            e.preventDefault();

            if (e.target.matches('[data-form-editar]')) {
                const dados = lerCamposDaTarefa('ed');

                if (!dados) return;

                Object.assign(atual.tarefas.find(function (t) { return t.id === editandoId; }), dados);
                editandoId = null;
                salvar();
                desenharPlano();
            }
            else if (e.target.matches('[data-form-adicionar]')) {
                const dados = lerCamposDaTarefa('ad');

                if (!dados) return;

                if (atual.tarefas.length >= 60) {
                    UL.toast('Um plano pode ter até 60 atividades.', 'erro');
                    return;
                }

                atual.tarefas.push(Object.assign({ id: novoIdTarefa(), concluida: false }, dados));
                adicionando = false;
                salvar();
                desenharPlano();
                UL.toast('Tarefa adicionada.', 'sucesso');
            }
        });
    });
});
