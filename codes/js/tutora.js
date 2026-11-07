/* =========================================
   CHAT COM O UP (tutor de estudos)

   A conversa fica guardada só nesta aba (sessionStorage), pra não se perder
   ao navegar entre telas. O servidor guarda as perguntas pra montar o
   painel de desempenho, mas a conversa em si começa do zero a cada nova aba.
========================================= */

const CHAT_KEY = 'uplearn_chat';
const MAX_MENSAGENS_ENVIADAS = 20;
const MAX_MATERIAL = 3;

const SUGESTOES_POR_MODO = {
    aprender: ['Quero entender frações', 'Me explica o que é fotossíntese', 'Como funciona a regra de três?'],
    praticar: ['Me dá um exercício de matemática', 'Quero praticar verbos', 'Vamos treinar tabuada?'],
    revisar: ['Revisar o que é uma célula', 'Resumo da Revolução Francesa', 'Revisar as classes de palavras'],
    duvidas: ['Tenho uma dúvida numa atividade', 'Não entendi uma parte da aula', 'Como estudo melhor pra prova?'],
    desafio: ['Me dá um desafio de raciocínio', 'Um desafio de ciências, por favor', 'Um problema de matemática mais difícil']
};

const SUGESTOES_MATERIAL = [
    'Explique este material passo a passo',
    'Crie exercícios sobre isso',
    'Faça um resumo pra eu revisar',
    'Me faça perguntas pra ver se entendi'
];


document.addEventListener('DOMContentLoaded', function () {

    UL.iniciar('up', function () {

        const listaEl = document.getElementById('mensagens');
        const form = document.getElementById('formChat');
        const campo = document.getElementById('mensagem');
        const contador = document.getElementById('contador');
        const botaoEnviar = document.getElementById('btnEnviar');
        const selMateria = document.getElementById('materia');

        let estado = { modo: 'duvidas', materia: '', mensagens: [], material: [] };
        let enviando = false;

        // Anexos que ainda estão sendo lidos (ou deram erro). Só existem nesta tela.
        let pendentes = [];
        const miniaturas = {};

        try {
            const salvo = JSON.parse(sessionStorage.getItem(CHAT_KEY));

            if (salvo && Array.isArray(salvo.mensagens)) estado = Object.assign(estado, salvo);

            if (!Array.isArray(estado.material)) estado.material = [];
        } catch (erro) { /* começa do zero */ }

        // Matérias do estudante primeiro; se não escolheu nenhuma, a lista padrão.
        const minhas = UL.usuario.preferencias.materias || [];
        const todas = minhas.concat(UL.MATERIAS.filter(function (m) { return !minhas.includes(m); }));

        todas.forEach(function (m) {
            const op = document.createElement('option');
            op.value = op.textContent = m;
            selMateria.appendChild(op);
        });

        // Parâmetros de quem chegou aqui por um atalho (plano de estudos etc.).
        const params = new URLSearchParams(location.search);
        const assuntoInicial = params.get('assunto');

        if (params.get('materia') && todas.includes(params.get('materia'))) estado.materia = params.get('materia');
        if (UL.MODOS.some(function (m) { return m.id === params.get('modo'); })) estado.modo = params.get('modo');

        if (params.toString()) history.replaceState(null, '', 'tutora.html');

        selMateria.value = estado.materia;

        /* ---- desenho ---- */

        function guardar() {
            try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(estado)); } catch (erro) { /* sem armazenamento */ }
        }

        // Personagem do aluno (escolhido no perfil) e do Up — o mesmo da barra de navegação.
        const AVATAR_UP = 'nuvem lilas feliz chapeu';
        const chaveAvatar = (UL.usuario.preferencias || {}).avatar;
        const AVATAR_ALUNO = UL.AVATARES.find(function (a) { return a.split(' ')[0] === chaveAvatar; }) || UL.AVATARES[0];

        function linhaUp(conteudo) {
            return `<div class="msg msg--up">
                <span class="pers msg__av" data-p="${AVATAR_UP}"></span>
                <div class="msg__corpo"><div class="bolha-quem">Up</div>${conteudo}</div>
            </div>`;
        }

        function bolha(msg) {
            if (msg.role === 'user') {
                return `<div class="msg msg--eu">
                    <span class="pers msg__av" data-p="${AVATAR_ALUNO}"></span>
                    <div class="msg__corpo"><div class="bolha-quem bolha-quem--eu">Você</div><div class="bolha bolha--eu">${UL.esc(msg.content)}</div></div>
                </div>`;
            }

            return linhaUp(`<div class="bolha bolha--up${msg.erro ? ' erro' : ''}">
                    ${msg.erro ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' : ''}${msg.erro ? UL.esc(msg.content) : formatarRespostaIA(msg.content)}
                    ${msg.erro ? '' : `<button type="button" class="bolha__ouvir" data-ouvir aria-label="Ouvir esta resposta em voz alta"><i class="fa-solid fa-volume-high" aria-hidden="true"></i></button>`}
                </div>`);
        }

        function desenhar() {
            const abertura = linhaUp(`<div class="bolha bolha--up">
                Oi${UL.usuario ? ', ' + UL.esc(UL.primeiroNome(UL.usuario.nome)) : ''}! 👋 Eu sou o Up.<br>
                Escolha um jeito de estudar aí em cima e me conte o que você quer aprender. Se estiver difícil, eu dou uma dica pra começar!<br>
                Tem foto do caderno, PDF ou atividade da aula? Toque no clipe 📎 e me envie: eu leio e estudo com você em cima do que você viu em sala.
            </div>`);

            listaEl.innerHTML = abertura + estado.mensagens.map(bolha).join('');
            montarPersonagens(listaEl);

            // Resposta longa do Up: começa a ser lida pelo início. Nos outros casos, vai pro fim.
            const ultima = listaEl.lastElementChild;
            const ultimaEhResposta = estado.mensagens.length && estado.mensagens[estado.mensagens.length - 1].role !== 'user';

            if (ultimaEhResposta && ultima.offsetHeight > listaEl.clientHeight - 24) listaEl.scrollTop = ultima.offsetTop - 8;
            else listaEl.scrollTop = listaEl.scrollHeight;

            document.getElementById('sugestoes').hidden = estado.mensagens.length > 0;
        }

        function desenharModos() {
            document.getElementById('modos').innerHTML = UL.MODOS.map(function (m) {
                return `<button type="button" class="chip" data-modo="${m.id}" aria-pressed="${estado.modo === m.id}">${m.rotulo}</button>`;
            }).join('');

            // A fileira rola de lado: garante que o modo escolhido apareça.
            const modosEl = document.getElementById('modos');
            const ativo = modosEl.querySelector('[aria-pressed="true"]');

            if (ativo) modosEl.scrollLeft = Math.max(0, ativo.offsetLeft - 16);

            document.getElementById('modoDesc').textContent = UL.MODOS.find(function (m) { return m.id === estado.modo; }).desc;

            desenharSugestoes();
        }

        function desenharSugestoes() {
            const lista = estado.material.length ? SUGESTOES_MATERIAL : SUGESTOES_POR_MODO[estado.modo];

            document.getElementById('sugestoes').innerHTML = lista.map(function (s) {
                return `<button type="button" class="chip" data-sugestao="${UL.esc(s)}">${UL.esc(s)}</button>`;
            }).join('');

            campo.placeholder = estado.material.length ? 'Pergunte sobre isso…' : 'Digite sua mensagem…';
        }

        /* ---- material anexado (fotos, câmera, arquivos) ---- */

        function desenharMaterial() {
            const alvo = document.getElementById('material');

            const itens = estado.material.map(function (m) {
                const thumb = miniaturas[m.id];
                const visual = thumb
                    ? `<img src="${thumb}" alt="" width="32" height="32">`
                    : `<i class="fa-solid ${m.tipo === 'imagem' ? 'fa-image' : 'fa-file-lines'}" aria-hidden="true"></i>`;

                return `<div class="mat-chip">
                    <span class="mat-chip__visual">${visual}</span>
                    <span class="mat-chip__nome">${UL.esc(m.nome)}${m.aviso ? ' <small>(li só o começo)</small>' : ''}</span>
                    <button type="button" class="mat-chip__x" data-remover="${UL.esc(m.id)}" aria-label="Remover ${UL.esc(m.nome)} do material"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>`;
            });

            const espera = pendentes.map(function (p) {
                if (p.status === 'lendo') {
                    return `<div class="mat-chip mat-chip--lendo" role="status">
                        <span class="mat-chip__visual"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span>
                        <span class="mat-chip__nome">Lendo ${UL.esc(p.nome)}…</span>
                    </div>`;
                }

                return `<div class="mat-chip mat-chip--erro" role="alert">
                    <span class="mat-chip__visual"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
                    <span class="mat-chip__nome">${UL.esc(p.erro)}</span>
                    <button type="button" class="mat-chip__x" data-descartar="${UL.esc(p.id)}" aria-label="Fechar aviso"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>`;
            });

            alvo.innerHTML = itens.concat(espera).join('');
        }

        function vagasDeMaterial() {
            const lendo = pendentes.filter(function (p) { return p.status === 'lendo'; }).length;

            return MAX_MATERIAL - estado.material.length - lendo;
        }

        async function processarAnexo(arquivo) {
            const p = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome: arquivo.name || 'foto', status: 'lendo' };

            pendentes.push(p);
            desenharMaterial();

            try {
                let preparado;

                if (Anexos.ehImagem(arquivo)) preparado = await Anexos.prepararImagem(arquivo);
                else if (Anexos.ehDocumento(arquivo)) preparado = await Anexos.prepararDocumento(arquivo);
                else throw new Error('Esse tipo de arquivo ainda não dá pra ler. Envie uma foto, PDF, Word (.docx) ou texto (.txt).');

                const lido = await api('/chat/material', { metodo: 'POST', corpo: { nome: preparado.nome, dados: preparado.dados } });

                pendentes = pendentes.filter(function (x) { return x !== p; });

                estado.material.push({ id: p.id, nome: lido.nome, tipo: lido.tipo, texto: lido.texto, aviso: lido.aviso || null });

                if (preparado.thumb) miniaturas[p.id] = preparado.thumb;

                guardar();

                if (lido.aviso) UL.toast(lido.aviso, 'aviso');

            } catch (erro) {
                console.error(erro);
                p.status = 'erro';
                p.erro = erro instanceof TypeError ? 'Não consegui falar com o servidor. Confira sua internet e tente de novo.' : erro.message;
            }

            desenharMaterial();
            desenharSugestoes();
        }

        function anexar(arquivos) {
            arquivos = Array.from(arquivos || []);

            if (!arquivos.length) return;

            arquivos.forEach(function (arquivo) {
                if (vagasDeMaterial() <= 0) {
                    UL.toast('Você já anexou ' + MAX_MATERIAL + ' materiais. Remova um pra adicionar outro.', 'aviso');
                    return;
                }

                processarAnexo(arquivo);
            });
        }

        function digitando(ligado) {
            const antigo = document.getElementById('digitando');

            if (antigo) antigo.remove();

            if (!ligado) return;

            const el = document.createElement('div');

            el.id = 'digitando';
            el.innerHTML = linhaUp('<div class="bolha bolha--up"><span class="digitando" role="status" aria-label="O Up está pensando"><i></i><i></i><i></i></span></div>');
            montarPersonagens(el);
            listaEl.appendChild(el);
            listaEl.scrollTop = listaEl.scrollHeight;
        }

        /* ---- envio ---- */

        async function enviar(texto) {
            texto = texto.trim();

            if (!texto || enviando) return;

            enviando = true;
            botaoEnviar.disabled = true;

            const historicoParaEnviar = estado.mensagens
                .filter(function (m) { return !m.erro; })
                .slice(-MAX_MENSAGENS_ENVIADAS)
                .map(function (m) { return { role: m.role, content: m.content }; });

            estado.mensagens.push({ role: 'user', content: texto });
            guardar();
            desenhar();
            digitando(true);

            try {
                let resposta = null;
                let bolhaEl = null;

                try {
                    await apiFluxo('/chat/stream', {
                        mensagem: texto,
                        historico: historicoParaEnviar,
                        tamanho_fonte_atual: Acess.estado.fonte,
                        linguagem_simples: Acess.estado.linguagemSimples,
                        modo: estado.modo,
                        materia: estado.materia || null,
                        material: estado.material.map(function (m) { return { nome: m.nome, texto: m.texto }; })
                    }, function (pedaco) {
                        // Primeiro pedaço: troca o "pensando..." por uma bolha que vai crescendo.
                        if (!resposta) {
                            digitando(false);
                            resposta = { role: 'assistant', content: '' };
                            estado.mensagens.push(resposta);
                            desenhar();
                            bolhaEl = listaEl.lastElementChild.querySelector('.bolha--up');
                        }

                        resposta.content += pedaco;
                        bolhaEl.innerHTML = formatarRespostaIA(resposta.content);
                        listaEl.scrollTop = listaEl.scrollHeight;
                    });
                } catch (erroFluxo) {
                    // Se já chegou texto, mantém o que veio; senão, mostra o erro como antes.
                    if (!resposta) throw erroFluxo;

                    UL.toast('A resposta foi interrompida: ' + erroFluxo.message, 'erro');
                }

                if (!resposta) throw new Error('O Up não respondeu desta vez. Tente de novo.');

                // "Ler respostas do Up": fala sozinha, sem a pessoa precisar clicar.
                if (Acess.estado.lerRespostas) Acess.falar(paraLeituraEmVoz(resposta.content));

            } catch (erro) {
                console.error(erro);
                estado.mensagens.push({ role: 'assistant', content: erro.message, erro: true });
            }

            digitando(false);
            guardar();
            desenhar();

            enviando = false;
            botaoEnviar.disabled = false;
            campo.focus();
        }

        /* ---- eventos ---- */

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            const texto = campo.value;

            campo.value = '';
            atualizarCampo();
            enviar(texto);
        });

        // Enter envia; Shift+Enter quebra linha.
        campo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.requestSubmit();
            }
        });

        function atualizarCampo() {
            const n = campo.value.length;

            contador.textContent = n + '/500';
            contador.classList.toggle('perto', n > 430);

            // Cresce com o texto, até um limite.
            campo.style.height = 'auto';
            campo.style.height = Math.min(campo.scrollHeight, 140) + 'px';
        }

        campo.addEventListener('input', atualizarCampo);

        document.getElementById('modos').addEventListener('click', function (e) {
            const chip = e.target.closest('[data-modo]');

            if (!chip) return;

            estado.modo = chip.dataset.modo;
            guardar();
            desenharModos();
        });

        selMateria.addEventListener('change', function () {
            estado.materia = selMateria.value;
            guardar();
        });

        document.getElementById('sugestoes').addEventListener('click', function (e) {
            const chip = e.target.closest('[data-sugestao]');

            if (chip) enviar(chip.dataset.sugestao);
        });

        listaEl.addEventListener('click', function (e) {
            const botao = e.target.closest('[data-ouvir]');

            if (!botao) return;

            const bolhaEl = botao.closest('.bolha');
            const indice = Array.from(listaEl.querySelectorAll('.bolha--up:not(.erro)')).indexOf(bolhaEl) - 1;
            const respostas = estado.mensagens.filter(function (m) { return m.role === 'assistant' && !m.erro; });
            const msg = respostas[indice];

            if (!msg) return;

            if (Acess.falando) { Acess.parar(); return; }

            if (!Acess.falar(paraLeituraEmVoz(msg.content))) {
                UL.toast('Seu navegador não tem leitura em voz alta.', 'erro');
            }
        });

        /* ---- material de revisão em PDF (flashcards, mapa mental, dinâmicas) ---- */

        // Guarda o que o Up já preparou nesta conversa, pra baixar de novo sem gastar IA.
        // Vale enquanto a conversa e o material não mudarem.
        let cacheEstudo = { chave: '', itens: {} };

        function chaveDaConversa() {
            return estado.mensagens.length + '|' + estado.materia + '|' + estado.material.map(function (m) { return m.id; }).join(',');
        }

        function abrirMaterial() {
            const respostas = estado.mensagens.filter(function (m) { return !m.erro; });

            if (!respostas.length && !estado.material.length) {
                UL.toast('Converse um pouco com o Up (ou anexe o material da aula) antes de criar o material.', 'info');
                return;
            }

            if (cacheEstudo.chave !== chaveDaConversa()) cacheEstudo = { chave: chaveDaConversa(), itens: {} };

            const pronto = function (tipo) { return cacheEstudo.itens[tipo] ? ' Já está pronto!' : ''; };

            const s = UL.abrirSheet('Material de revisão', `
                <p class="subtitulo" style="margin-bottom:14px">O Up cria o material em cima da conversa${estado.material.length ? ' e do que você anexou' : ''}. É PDF e fica bom impresso, até em preto e branco.</p>
                <div class="baixar-opcoes">
                    <button type="button" class="baixar-op" data-op="flashcards">
                        <span class="baixar-op__icone"><i class="fa-solid fa-clone" aria-hidden="true"></i></span>
                        <span><strong>Flashcards</strong><small>Cartas de pergunta e resposta pra recortar e treinar a memória.${pronto('flashcards')}</small></span>
                    </button>
                    <button type="button" class="baixar-op" data-op="mapa">
                        <span class="baixar-op__icone"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i></span>
                        <span><strong>Mapa mental</strong><small>As ideias principais em galhos, com dicas pra memorizar e perguntas pra se testar.${pronto('mapa')}</small></span>
                    </button>
                    <button type="button" class="baixar-op" data-op="dinamicas">
                        <span class="baixar-op__icone"><i class="fa-solid fa-dice" aria-hidden="true"></i></span>
                        <span><strong>Cartões de dinâmicas</strong><small>Atividades curtas e divertidas pra revisar sozinho ou com um colega.${pronto('dinamicas')}</small></span>
                    </button>
                </div>
                <div id="materialEstado" role="status" aria-live="polite"></div>`);

            const estadoEl = s.el.querySelector('#materialEstado');
            const botoes = Array.from(s.el.querySelectorAll('[data-op]'));

            function ocupado(ligado, mensagem) {
                botoes.forEach(function (b) { b.disabled = ligado; });
                estadoEl.innerHTML = ligado
                    ? `<p class="carregando-ia" style="padding:14px 0"><span><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${UL.esc(mensagem)}</span></p>`
                    : '';
            }

            s.el.addEventListener('click', async function (e) {
                const botao = e.target.closest('[data-op]');

                if (!botao) return;

                const tipo = botao.dataset.op;
                const chave = cacheEstudo.chave;

                try {
                    let dados = cacheEstudo.itens[tipo];

                    if (!dados) {
                        ocupado(true, 'O Up está preparando o seu material… isso leva alguns segundos.');
                        dados = await api('/chat/estudo', {
                            metodo: 'POST',
                            corpo: {
                                tipo: tipo,
                                materia: estado.materia || null,
                                historico: respostas.slice(-MAX_MENSAGENS_ENVIADAS).map(function (m) { return { role: m.role, content: m.content }; }),
                                material: estado.material.map(function (m) { return { nome: m.nome, texto: m.texto }; })
                            }
                        });

                        // Só guarda se a conversa não mudou enquanto o Up trabalhava.
                        if (chave === cacheEstudo.chave) cacheEstudo.itens[tipo] = dados;
                    }

                    ocupado(true, 'Montando o PDF…');

                    const materia = estado.materia || 'Revisão';

                    if (tipo === 'flashcards') {
                        await FichasPdf.flashcards({ titulo: dados.titulo, materia: materia, conteudo: dados.titulo, fichas: { cartoes: dados.cartoes } });
                    } else if (tipo === 'mapa') {
                        await MapaPdf.baixar({ titulo: dados.titulo, materia: materia, conteudo: dados.titulo, tarefas: [], mapa: dados.mapa }, UL.usuario && UL.usuario.nome);
                    } else {
                        await FichasPdf.dinamicas({ titulo: dados.titulo, materia: materia, dinamicas: dados.dinamicas });
                    }

                    s.fechar();
                    UL.toast('PDF pronto! Ele foi para a sua pasta de downloads.', 'sucesso');

                } catch (erro) {
                    console.error(erro);
                    ocupado(false);
                    estadoEl.innerHTML = `<p class="cu-notificacao cu-notificacao--erro" role="alert"><span class="cu-notificacao-texto">${UL.esc(erro instanceof TypeError ? 'Não consegui falar com o servidor. Confira sua internet e tente de novo.' : (erro.message || 'Não foi possível gerar o PDF agora.'))}</span></p>`;
                }
            });
        }

        document.getElementById('btnMaterial').addEventListener('click', abrirMaterial);

        document.getElementById('btnNova').addEventListener('click', async function () {
            if (!estado.mensagens.length && !estado.material.length) return;

            const ok = await UL.confirmar('Começar uma conversa nova?', 'A conversa e o material anexado somem desta tela (suas perguntas continuam contando no seu desempenho).', 'Começar de novo');

            if (!ok) return;

            estado.mensagens = [];
            estado.material = [];
            cacheEstudo = { chave: '', itens: {} };
            pendentes = [];
            guardar();
            desenharMaterial();
            desenharSugestoes();
            desenhar();
            campo.focus();
        });

        /* ---- ditado por voz (Web Speech API) ---- */

        const botaoMic = document.getElementById('btnMic');
        const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
        let ouvindo = null;

        function pararDitado() {
            if (ouvindo) ouvindo.stop();
        }

        if (Reconhecimento) {
            botaoMic.hidden = false;

            botaoMic.addEventListener('click', function () {
                if (ouvindo) { pararDitado(); return; }

                // A voz do Up e o microfone ao mesmo tempo se misturariam.
                Acess.parar();

                const rec = new Reconhecimento();
                const antes = campo.value ? campo.value.replace(/\s+$/, '') + ' ' : '';
                let final = '';

                rec.lang = 'pt-BR';
                rec.interimResults = true;
                rec.continuous = true;

                rec.onresult = function (ev) {
                    let parcial = '';

                    for (let i = ev.resultIndex; i < ev.results.length; i++) {
                        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
                        else parcial += ev.results[i][0].transcript;
                    }

                    campo.value = (antes + final + parcial).slice(0, 500);
                    atualizarCampo();
                };

                rec.onerror = function (ev) {
                    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
                        UL.toast('Preciso da permissão do microfone pra te ouvir. Libere nas configurações do navegador.', 'aviso');
                    } else if (ev.error === 'no-speech') {
                        UL.toast('Não ouvi nada. Tente de novo, mais perto do microfone.', 'aviso');
                    } else if (ev.error !== 'aborted') {
                        UL.toast('O ditado por voz não funcionou agora. Você pode digitar.', 'erro');
                    }
                };

                rec.onend = function () {
                    ouvindo = null;
                    botaoMic.setAttribute('aria-pressed', 'false');
                    botaoMic.setAttribute('aria-label', 'Falar a mensagem (ditado por voz)');
                    botaoMic.querySelector('i').className = 'fa-solid fa-microphone';
                    campo.focus();
                };

                try {
                    rec.start();
                } catch (erro) {
                    return;
                }

                ouvindo = rec;
                botaoMic.setAttribute('aria-pressed', 'true');
                botaoMic.setAttribute('aria-label', 'Parar de ouvir');
                botaoMic.querySelector('i').className = 'fa-solid fa-stop';
            });

            // Enviar com o microfone ligado fecha o ditado antes.
            form.addEventListener('submit', pararDitado);
        }

        /* ---- menu de anexo (Câmera, Fotos, Arquivos) ---- */

        const menu = document.getElementById('menuAnexo');
        const botaoAnexo = document.getElementById('btnAnexo');
        const dlgCamera = document.getElementById('dlgCamera');
        const camVideo = document.getElementById('camVideo');
        const camAviso = document.getElementById('camAviso');
        const camFoto = document.getElementById('camFoto');

        function abrirMenu(abrir, devolverFoco) {
            menu.hidden = !abrir;
            botaoAnexo.setAttribute('aria-expanded', String(abrir));

            if (abrir) menu.querySelector('[role="menuitem"]').focus();
            else if (devolverFoco) botaoAnexo.focus();
        }

        botaoAnexo.addEventListener('click', function () { abrirMenu(menu.hidden, false); });

        document.addEventListener('click', function (e) {
            if (!menu.hidden && !menu.contains(e.target) && !botaoAnexo.contains(e.target)) abrirMenu(false, false);
        });

        menu.addEventListener('keydown', function (e) {
            const itens = Array.from(menu.querySelectorAll('[role="menuitem"]'));
            const i = itens.indexOf(document.activeElement);

            if (e.key === 'Escape') { e.preventDefault(); abrirMenu(false, true); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
        });

        async function abrirCamera() {
            // No celular, o app de câmera do aparelho faz melhor que qualquer tela nossa.
            if (Anexos.celular() || !Anexos.cameraDisponivel()) {
                document.getElementById('inCamera').click();
                return;
            }

            camAviso.textContent = 'Aponte a câmera para a página do caderno, do livro ou da atividade.';
            camFoto.disabled = true;
            dlgCamera.showModal();

            try {
                await Anexos.iniciarCamera(camVideo);
                camFoto.disabled = false;
                camFoto.focus();
            } catch (erro) {
                camAviso.textContent = Anexos.mensagemDeErroDaCamera(erro);
            }
        }

        function fecharCamera() {
            Anexos.pararCamera(camVideo);

            if (dlgCamera.open) dlgCamera.close();
        }

        dlgCamera.addEventListener('close', function () { Anexos.pararCamera(camVideo); botaoAnexo.focus(); });
        document.getElementById('camCancelar').addEventListener('click', fecharCamera);

        camFoto.addEventListener('click', async function () {
            try {
                const arquivo = await Anexos.capturarQuadro(camVideo);

                fecharCamera();
                anexar([arquivo]);
            } catch (erro) {
                camAviso.textContent = erro.message;
            }
        });

        menu.addEventListener('click', function (e) {
            const item = e.target.closest('[data-anexo]');

            if (!item) return;

            abrirMenu(false, false);

            if (item.dataset.anexo === 'camera') abrirCamera();
            else if (item.dataset.anexo === 'fotos') document.getElementById('inFotos').click();
            else document.getElementById('inArquivos').click();
        });

        ['inCamera', 'inFotos', 'inArquivos'].forEach(function (id) {
            const entrada = document.getElementById(id);

            entrada.addEventListener('change', function () {
                anexar(entrada.files);
                entrada.value = '';
            });
        });

        document.getElementById('material').addEventListener('click', function (e) {
            const remover = e.target.closest('[data-remover]');
            const descartar = e.target.closest('[data-descartar]');

            if (remover) {
                estado.material = estado.material.filter(function (m) { return m.id !== remover.dataset.remover; });
                delete miniaturas[remover.dataset.remover];
                guardar();
            } else if (descartar) {
                pendentes = pendentes.filter(function (p) { return p.id !== descartar.dataset.descartar; });
            } else {
                return;
            }

            desenharMaterial();
            desenharSugestoes();
            campo.focus();
        });

        // Arrastar arquivo pra cima da conversa, ou colar uma imagem (Ctrl+V), também anexa.
        const tela = document.querySelector('.chat-tela');

        ['dragenter', 'dragover'].forEach(function (nome) {
            tela.addEventListener(nome, function (e) {
                if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
                    e.preventDefault();
                    tela.classList.add('arrastando');
                }
            });
        });

        ['dragleave', 'drop'].forEach(function (nome) {
            tela.addEventListener(nome, function (e) {
                if (nome === 'dragleave' && tela.contains(e.relatedTarget)) return;

                tela.classList.remove('arrastando');
            });
        });

        tela.addEventListener('drop', function (e) {
            if (!e.dataTransfer || !e.dataTransfer.files.length) return;

            e.preventDefault();
            anexar(e.dataTransfer.files);
        });

        campo.addEventListener('paste', function (e) {
            const arquivos = Array.from((e.clipboardData && e.clipboardData.files) || []);

            if (arquivos.length) {
                e.preventDefault();
                anexar(arquivos);
            }
        });

        desenharModos();
        desenharMaterial();
        desenhar();
        atualizarCampo();

        if (assuntoInicial) enviar(assuntoInicial.slice(0, 500));
        else campo.focus({ preventScroll: true });
    });
});
