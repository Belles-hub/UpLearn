/* =========================================================
   CASCA DO APP — navegação, topo, avisos, janelas e dados comuns

   Toda tela logada faz o mesmo começo: confere a sessão, monta a barra de
   navegação, carrega o perfil e chama a função da própria tela. Isso fica
   aqui, em UL.iniciar(), pra nenhuma tela repetir.

   Precisa carregar DEPOIS de config.js, sessao.js e personagens.js.
========================================================= */

const UL = {
    usuario: null,
    uid: null
};

/* ---------- dados que várias telas usam ---------- */

UL.MATERIAS = [
    'Matemática', 'Português', 'Ciências', 'História', 'Geografia', 'Inglês',
    'Artes', 'Redação', 'Física', 'Química', 'Biologia'
];

UL.SERIES = [
    '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano',
    '1º ano do Ensino Médio', '2º ano do Ensino Médio', '3º ano do Ensino Médio', 'Outra'
];

UL.ESTILOS = [
    { id: 'resumos', titulo: 'Resumos', desc: 'O essencial, em poucas linhas', icone: 'fa-file-lines', cor: 'rosa' },
    { id: 'passo_a_passo', titulo: 'Passo a Passo', desc: 'Uma etapa de cada vez', icone: 'fa-shoe-prints', cor: 'ciano' },
    { id: 'mnemonica', titulo: 'Explicação Mnemônica', desc: 'Truques pra memorizar', icone: 'fa-lightbulb', cor: 'laranja' },
    { id: 'quizzes', titulo: 'Quizzes', desc: 'Aprender respondendo', icone: 'fa-circle-question', cor: 'verde' },
    { id: 'conversa', titulo: 'Falar', desc: 'Aprender conversando', icone: 'fa-comments', cor: 'amarelo' },
    { id: 'pratica', titulo: 'Quero praticar', desc: 'Menos teoria, mais exercícios', icone: 'fa-pencil', cor: 'coral' }
];

UL.MODOS = [
    { id: 'aprender', rotulo: 'Aprender', desc: 'Explicação passo a passo, uma etapa de cada vez.' },
    { id: 'praticar', rotulo: 'Praticar', desc: 'Exercícios um por vez, com dicas e feedback.' },
    { id: 'revisar', rotulo: 'Revisar', desc: 'Resumo dos pontos principais e perguntas rápidas.' },
    { id: 'duvidas', rotulo: 'Tirar dúvidas', desc: 'Conversa livre sobre o conteúdo.' },
    { id: 'desafio', rotulo: 'Desafio', desc: 'Uma atividade um pouco mais difícil pra testar o que entendeu.' }
];

// Tipos de tarefa do plano. Cada um tem cor, ícone E nome — a cor sozinha
// nunca é a única forma de saber o tipo (daltonismo).
UL.TIPOS = {
    estudo: { rotulo: 'Estudo', icone: 'fa-book-open', cor: 'azul' },
    exercicio: { rotulo: 'Exercício', icone: 'fa-pencil', cor: 'rosa' },
    revisao: { rotulo: 'Revisão', icone: 'fa-rotate', cor: 'verde' },
    pausa: { rotulo: 'Pausa', icone: 'fa-mug-hot', cor: 'ciano' }
};

UL.AVATARES = [
    'circulo rosa feliz', 'estrela amarelo dormindo', 'blob ciano piscando',
    'quadrado verde feliz', 'triangulo coral bocao', 'pera lilas dormindo',
    'hexagono azul feliz', 'nuvem laranja piscando'
];

// Frases pra tela inicial. Incentivam sem culpa: nenhuma fala de "dia perdido".
UL.FRASES = [
    'Um passo pequeno hoje já conta.',
    'Errar faz parte de aprender — o Up está aqui pra ajudar.',
    'Bora no seu ritmo? Não precisa ter pressa.',
    'Curiosidade é o melhor jeito de começar.',
    'Cada pergunta sua deixa a aula mais interessante.',
    'Estudar um pouquinho de cada vez funciona muito bem.',
    'Descansar também faz parte de estudar.'
];

/* ---------- utilidades ---------- */

UL.esc = escaparHtml;

UL.primeiroNome = function (nome) {
    return String(nome || '').trim().split(/\s+/)[0] || '';
};

UL.hojeISO = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

UL.somarDias = function (iso, dias) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

UL.rotuloDia = function (iso) {
    if (!iso) return 'Sem dia definido';

    if (iso === UL.hojeISO()) return 'Hoje';
    if (iso === UL.somarDias(UL.hojeISO(), 1)) return 'Amanhã';

    const d = new Date(iso + 'T12:00:00');
    const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()];

    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' · ' + semana;
};

UL.escolher = function (lista, i) {
    return lista[i % lista.length];
};

/* ---------- avisos rápidos ---------- */

UL.toast = function (mensagem, tipo) {
    tipo = tipo || 'info';

    let area = document.getElementById('ulToasts');

    if (!area) {
        area = document.createElement('div');
        area.id = 'ulToasts';
        area.setAttribute('aria-live', 'polite');
        area.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:300;display:grid;gap:8px;max-width:520px;margin:0 auto;pointer-events:none';
        document.body.appendChild(area);
    }

    const aviso = document.createElement('div');
    aviso.className = 'cu-notificacao cu-notificacao--' + tipo;
    aviso.style.pointerEvents = 'auto';
    aviso.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    aviso.innerHTML = `<span class="cu-notificacao-texto">${UL.esc(mensagem)}</span>`;
    area.appendChild(aviso);

    setTimeout(function () { aviso.remove(); }, tipo === 'erro' ? 8000 : 4500);
};

/* ---------- janela (sheet) acessível ---------- */

UL.abrirSheet = function (titulo, html) {
    const anterior = document.activeElement;

    const fundo = document.createElement('div');
    fundo.className = 'sheet-fundo';
    fundo.innerHTML = `
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitulo">
            <div class="sheet__cab">
                <h2 id="sheetTitulo">${UL.esc(titulo)}</h2>
                <button type="button" class="btn btn--icone" data-fechar aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <div data-corpo>${html}</div>
        </div>`;

    document.body.appendChild(fundo);
    document.body.style.overflow = 'hidden';

    const sheet = fundo.querySelector('.sheet');

    function fechar() {
        document.removeEventListener('keydown', aoTeclar);
        fundo.remove();
        document.body.style.overflow = '';
        if (anterior && anterior.focus) anterior.focus();
    }

    function aoTeclar(e) {
        if (e.key === 'Escape') { fechar(); return; }

        if (e.key !== 'Tab') return;

        // Mantém o Tab dentro da janela enquanto ela está aberta.
        const focaveis = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focaveis.length) return;

        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];

        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }

    document.addEventListener('keydown', aoTeclar);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    sheet.querySelector('[data-fechar]').addEventListener('click', fechar);

    montarPersonagens(fundo);
    (sheet.querySelector('input, select, textarea, [data-corpo] button') || sheet.querySelector('[data-fechar]')).focus();

    return { el: sheet, corpo: sheet.querySelector('[data-corpo]'), fechar: fechar };
};

UL.confirmar = function (titulo, texto, rotuloOk) {
    return new Promise(function (resolve) {
        const s = UL.abrirSheet(titulo, `
            <p class="subtitulo" style="margin-bottom:20px">${UL.esc(texto)}</p>
            <div class="grade">
                <button type="button" class="btn btn--perigo btn--bloco" data-ok>${UL.esc(rotuloOk || 'Confirmar')}</button>
                <button type="button" class="btn btn--suave btn--bloco" data-nao>Cancelar</button>
            </div>`);

        let resposta = false;

        s.el.querySelector('[data-ok]').addEventListener('click', function () { resposta = true; s.fechar(); });
        s.el.querySelector('[data-nao]').addEventListener('click', function () { s.fechar(); });

        // Resolve quando a janela sai da tela, seja por qual caminho for.
        const obs = new MutationObserver(function () {
            if (!document.body.contains(s.el)) { obs.disconnect(); resolve(resposta); }
        });
        obs.observe(document.body, { childList: true });
    });
};

/* ---------- navegação ---------- */

UL.NAV = [
    { id: 'inicio', href: 'inicio.html', icone: 'fa-house', rotulo: 'Início' },
    { id: 'estudos', href: 'estudos.html', icone: 'fa-calendar-check', rotulo: 'Estudos' },
    { id: 'up', href: 'tutora.html', rotulo: 'Up', personagem: 'nuvem lilas feliz' },
    { id: 'desempenho', href: 'desempenho.html', icone: 'fa-chart-simple', rotulo: 'Desempenho' },
    { id: 'perfil', href: 'perfil.html', icone: 'fa-user', rotulo: 'Perfil' }
];

UL.montarNav = function (pagina) {
    const nav = document.getElementById('nav');

    if (!nav) return;

    nav.className = 'nav';
    nav.setAttribute('aria-label', 'Navegação principal');

    nav.innerHTML =
        '<a class="nav__logo" href="inicio.html"><img src="img/logo.png" alt="UpLearn"></a>' +
        UL.NAV.map(function (item) {
            const atual = item.id === pagina ? ' aria-current="page"' : '';
            const icone = item.personagem
                ? `<span class="pers" data-p="${item.personagem}"></span>`
                : `<i class="fa-solid ${item.icone}" aria-hidden="true"></i>`;

            return `<a class="nav__item${item.personagem ? ' nav__item--up' : ''}" href="${item.href}"${atual}>${icone}<span>${item.rotulo}</span></a>`;
        }).join('') +
        '<button type="button" class="nav__sair" id="navSair"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Sair</span></button>';

    montarPersonagens(nav);

    nav.querySelector("#navSair").addEventListener('click', UL.sair);
};

UL.sair = async function () {
    await encerrarSessao();
    window.location.href = 'index.html';
};

// Topo das telas internas: logo (só no celular — no desktop ela fica na
// lateral), acessibilidade e notificações.
UL.montarTopo = function () {
    const topo = document.getElementById('topo');

    if (!topo) return;

    topo.className = 'topo';
    topo.innerHTML = `
        <a class="topo__logo marca" href="inicio.html" aria-label="UpLearn, ir para o início"><img src="img/logo.png" alt=""></a>
        <span class="topo__logo" style="flex:1"></span>
        <div class="topo__acoes">
            <a class="btn btn--icone" href="acessibilidade.html" aria-label="Acessibilidade"><i class="fa-solid fa-universal-access" aria-hidden="true"></i></a>
            <button type="button" class="btn btn--icone" id="btnNotif" aria-label="Notificações" style="position:relative">
                <i class="fa-regular fa-bell" aria-hidden="true"></i>
                <span id="notifBadge" hidden style="position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:var(--erro);color:#fff;font:800 .7rem/20px var(--fonte-corpo);text-align:center;padding:0 5px"></span>
            </button>
        </div>`;

    topo.querySelector('#btnNotif').addEventListener('click', UL.abrirNotificacoes);
};

UL.carregarNotificacoes = async function () {
    try {
        UL.notificacoes = await api('/notificacoes/' + encodeURIComponent(UL.uid));

        const naoLidas = UL.notificacoes.filter(function (n) { return !n.lida; }).length;
        const selo = document.getElementById('notifBadge');
        const botao = document.getElementById('btnNotif');

        if (selo) {
            selo.hidden = naoLidas === 0;
            selo.textContent = String(naoLidas);
        }

        if (botao) {
            botao.setAttribute('aria-label', naoLidas ? `Notificações, ${naoLidas} nova(s)` : 'Notificações');
        }
    } catch (erro) {
        UL.notificacoes = [];
    }
};

UL.formatarDataHora = function (valor) {
    if (!valor) return '';

    const d = new Date(valor);

    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

UL.abrirNotificacoes = async function () {
    const lista = UL.notificacoes || [];

    const html = lista.length
        ? `<div class="grade">${lista.map(function (n) {
            return `<div class="notif${n.lida ? '' : ' nova'}"><span>${UL.esc(n.mensagem)}</span><small>${n.lida ? '' : 'Nova · '}${UL.esc(UL.formatarDataHora(n.criado_em))}</small></div>`;
        }).join('')}</div>`
        : '<div class="vazio"><span class="pers" data-p="pera lilas dormindo relax"></span><p>Nenhuma notificação por enquanto. Tudo tranquilo por aqui!</p></div>';

    UL.abrirSheet('Notificações', html);

    if (lista.some(function (n) { return !n.lida; })) {
        try {
            await api('/notificacoes/' + encodeURIComponent(UL.uid) + '/marcar-lidas', { metodo: 'POST' });
            const selo = document.getElementById('notifBadge');
            if (selo) selo.hidden = true;
        } catch (erro) { /* só não marcou como lida desta vez */ }
    }
};

/* ---------- partida de toda tela logada ---------- */

const TAMANHO_FONTE_PARA_ACESS = { pequena: 'pequena', media: 'media', grande: 'grande' };

// pagina: id do item de navegação. aoCarregar(usuario): função da tela.
UL.iniciar = async function (pagina, aoCarregar, opcoes) {
    opcoes = opcoes || {};

    if (!opcoes.semNav) {
        UL.montarNav(pagina);
        UL.montarTopo();
    }

    const principal = document.getElementById('conteudo');

    try {
        const sessao = await obterSessaoAtual();
        UL.uid = sessao.uid;

        UL.usuario = await api('/usuarios/' + encodeURIComponent(sessao.uid));

        // Primeira vez: o tamanho de letra que a pessoa escolheu vale como
        // ponto de partida — depois disso quem manda é o painel de acessibilidade.
        if (!localStorage.getItem(ACESS_CHAVE) && TAMANHO_FONTE_PARA_ACESS[UL.usuario.preferencias.tamanho_fonte]) {
            Acess.definir('fonte', TAMANHO_FONTE_PARA_ACESS[UL.usuario.preferencias.tamanho_fonte]);
        }

        if (!UL.usuario.preferencias.onboarding_concluido && !opcoes.semOnboarding) {
            window.location.replace('onboarding.html');
            return;
        }

        if (!opcoes.semNav) UL.carregarNotificacoes();

        await aoCarregar(UL.usuario);

    } catch (erro) {
        console.error(erro);

        // Sessão inválida ou conta que não existe mais: volta pro login.
        if (erro.status === 401 || erro.status === 403 || erro.status === 404 || erro.message === 'Sem sessão ativa.') {
            limparSessaoLocal();
            window.location.replace('login.html');
            return;
        }

        // Qualquer outra falha (servidor fora do ar, sem internet): NÃO desloga
        // — a pessoa continua com a conta, só precisa tentar de novo.
        if (principal) {
            principal.innerHTML = `
                <div class="vazio">
                    <span class="pers pers--anima" data-p="blob coral triste relax"></span>
                    <h2>Não conseguimos carregar agora</h2>
                    <p>${UL.esc(erro.message || 'Verifique sua internet e tente de novo.')}</p>
                    <button type="button" class="btn btn--primario" onclick="location.reload()">Tentar de novo</button>
                </div>`;
            montarPersonagens(principal);
        }
    }
};

/* ---------- formulários ---------- */

UL.mostrarErroCampo = function (input, mensagem) {
    const campo = input.closest('.campo');
    const erro = campo && campo.querySelector('.campo__erro');

    if (campo) campo.classList.add('campo--erro');
    if (erro) { erro.textContent = mensagem; input.setAttribute('aria-describedby', erro.id); }
    input.setAttribute('aria-invalid', 'true');
};

UL.limparErros = function (form) {
    form.querySelectorAll('.campo--erro').forEach(function (c) { c.classList.remove('campo--erro'); });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
};

// Botão de mostrar/ocultar senha (.senha-wrap > input + button).
UL.ligarSenhas = function () {
    document.querySelectorAll('.senha-wrap').forEach(function (wrap) {
        const input = wrap.querySelector('input');
        const botao = wrap.querySelector('button');

        botao.addEventListener('click', function () {
            const mostrando = input.type === 'text';

            input.type = mostrando ? 'password' : 'text';
            botao.innerHTML = `<i class="fa-solid ${mostrando ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i>`;
            botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
            botao.setAttribute('aria-pressed', String(!mostrando));
        });
    });
};

UL.carregando = function (botao, ligado, textoOriginal) {
    if (ligado) {
        botao.dataset.original = botao.innerHTML;
        botao.disabled = true;
        botao.innerHTML = `<i class="fa-solid fa-circle-notch girando" aria-hidden="true"></i> ${UL.esc(textoOriginal || 'Aguarde...')}`;
    } else {
        botao.disabled = false;
        botao.innerHTML = botao.dataset.original || botao.innerHTML;
    }
};

// Esqueleto de carregamento (N blocos) dentro de um container.
UL.esqueleto = function (container, quantos, altura) {
    container.innerHTML = Array.from({ length: quantos || 3 }, function () {
        return `<div class="esqueleto" style="min-height:${altura || 90}px" aria-hidden="true"></div>`;
    }).join('');
    container.setAttribute('aria-busy', 'true');
};
