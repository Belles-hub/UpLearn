/* =========================================
   MAPA DO PLANO DE ESTUDOS EM PDF (pra imprimir)

   O conteúdo do mapa (assuntos-chave, metas por dia, estratégias e perguntas de
   autoteste) é escrito pela IA pra este estudante e guardado no plano
   (plano.mapa). Aqui só desenhamos, no navegador, em folha A4 deitada:

     1. Mapa   — o assunto no centro e os "galhos" com o que dominar
     2. Trilha — uma parada por dia de estudo, até a avaliação
     3. Meu jeito de estudar — estratégias, perguntas pra se testar e um recado

   Impresso em preto e branco continua funcionando: os galhos são numerados, os
   dias têm data e nada depende só de cor.
========================================= */

const MapaPdf = (function () {

    const U = PlanoPdf.util;
    const C = U.cores;

    const L = 297;
    const A = 210;
    const MARGEM = 14;
    const FIM_UTIL = A - 14;

    // Pastéis da marca, um por galho (o texto é sempre escuro, então lê bem em qualquer um).
    const PASTEIS = [
        [247, 166, 218], [241, 242, 91], [126, 232, 246], [255, 180, 138], [181, 240, 154], [157, 180, 255]
    ];

    const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const NOMES_TIPO = { estudo: 'Estudo', exercicio: 'Exercício', revisao: 'Revisão', pausa: 'Pausa' };


    function diaCurto(iso) {
        if (!iso) return 'Sem dia definido';

        const d = new Date(iso + 'T12:00:00');

        return DIAS_CURTOS[d.getDay()].charAt(0).toUpperCase() + DIAS_CURTOS[d.getDay()].slice(1) + ', ' + U.dataBR(iso).slice(0, 5);
    }

    function nomeDoArquivo(plano) {
        const base = [U.slug(plano.materia), U.slug(plano.titulo)].filter(Boolean).join('-').slice(0, 60).replace(/-+$/, '');

        return 'mapa-de-estudos' + (base ? '-' + base : '') + '.pdf';
    }

    // Uma parada por dia (em ordem de data; "sem dia" por último).
    function paradasDoPlano(plano, mapa) {
        const porDia = {};

        (plano.tarefas || []).forEach(function (t) {
            const chave = t.dia || '';

            (porDia[chave] = porDia[chave] || []).push(t);
        });

        const metas = {};

        (mapa.etapas || []).forEach(function (e) { metas[e.dia] = e.meta; });

        return Object.keys(porDia).sort(function (a, b) {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
        }).map(function (dia) {
            return { tipo: 'dia', dia: dia, tarefas: porDia[dia], meta: metas[dia] || '' };
        });
    }


    async function baixar(plano, nomeAluno) {
        const mapa = plano.mapa;

        if (!mapa || !mapa.ramos || !mapa.ramos.length) throw new Error('Esse plano ainda não tem um mapa.');

        const jsPDF = await U.carregarBiblioteca();
        const logo = await U.carregarLogo();

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
        const primeiroNome = U.limpar(nomeAluno || '').split(' ')[0];

        try { doc.setLanguage('pt-BR'); } catch (erro) { /* só metadado */ }

        doc.setProperties({
            title: U.limpar('Mapa de estudos - ' + plano.titulo),
            subject: U.limpar(plano.materia + ' - ' + plano.conteudo),
            author: 'UpLearn',
            creator: 'UpLearn'
        });

        /* ---- ferramentas de desenho ---- */

        function cor(rgb, tipo) {
            if (tipo === 'texto') doc.setTextColor(rgb[0], rgb[1], rgb[2]);
            else if (tipo === 'preencher') doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        }

        function fonte(tamanho, negrito, italico) {
            doc.setFont('helvetica', negrito ? 'bold' : (italico ? 'italic' : 'normal'));
            doc.setFontSize(tamanho);
        }

        function texto(conteudo, x, y, tamanho, rgb, negrito, opcoes, italico) {
            fonte(tamanho, negrito, italico);
            cor(rgb, 'texto');
            doc.text(conteudo, x, y, opcoes);
        }

        function quebrar(conteudo, largura, tamanho, negrito, italico) {
            fonte(tamanho, negrito, italico);

            return doc.splitTextToSize(U.limpar(conteudo), largura);
        }

        function linhasDe(pt) { return U.mmDaLinha(pt); }

        function bolinha(x, y, r, rgb) {
            cor(rgb, 'preencher');
            doc.circle(x, y, r, 'F');
        }

        function cabecalho(subtitulo) {
            cor(C.ROXO, 'preencher');
            doc.rect(0, 0, L, 22, 'F');

            if (logo) doc.addImage(logo.dados, 'PNG', MARGEM, 5.5, 11 * logo.proporcao, 11);
            else texto('UpLearn', MARGEM, 15, 16, [255, 255, 255], true);

            texto(subtitulo, L - MARGEM, 13.5, 10, [255, 255, 255], true, { align: 'right' });
        }

        /* =========================================
           PÁGINA 1 — O MAPA
        ========================================= */

        cabecalho(plano.tarefas && plano.tarefas.length ? 'MAPA DO PLANO DE ESTUDOS' : 'MAPA MENTAL');

        const tituloMapa = primeiroNome ? 'Mapa de estudos de ' + primeiroNome : 'Mapa de estudos';

        texto(U.limpar(tituloMapa), MARGEM, 31, 16, C.TINTA, true);

        if (mapa.resumo) {
            const linhasResumo = quebrar(mapa.resumo, L - 2 * MARGEM, 9.5, false).slice(0, 2);

            texto(linhasResumo, MARGEM, 37, 9.5, C.TINTA_2, false);
        }

        // Onde ficam os galhos: metade à esquerda, metade à direita, do 1 ao N.
        const ramos = mapa.ramos.slice(0, 6);
        const naEsquerda = Math.ceil(ramos.length / 2);
        const cx = L / 2;
        const areaTopo = 48;
        const areaAltura = 148;
        const cy = areaTopo + areaAltura / 2;
        const larguraCaixa = 86;
        const espaco = 6;
        // Com 3 galhos por lado as caixas são compactas; com menos, crescem (e a letra também).
        const alturaCaixa = Math.min(58, (areaAltura - (naEsquerda - 1) * espaco) / naEsquerda);

        function posicaoDaCaixa(i) {
            const esquerda = i < naEsquerda;
            const indiceNaColuna = esquerda ? i : i - naEsquerda;
            const totalNaColuna = esquerda ? naEsquerda : ramos.length - naEsquerda;
            const alturaColuna = totalNaColuna * alturaCaixa + (totalNaColuna - 1) * espaco;

            return {
                esquerda: esquerda,
                x: esquerda ? MARGEM : L - MARGEM - larguraCaixa,
                y: cy - alturaColuna / 2 + indiceNaColuna * (alturaCaixa + espaco)
            };
        }

        // Ligações do centro até cada galho (por baixo de tudo).
        cor(C.TINTA_3, 'desenho');
        doc.setLineWidth(0.7);

        ramos.forEach(function (ramo, i) {
            const p = posicaoDaCaixa(i);
            const xIni = p.esquerda ? cx - 34 : cx + 34;
            const xFim = p.esquerda ? p.x + larguraCaixa : p.x;
            const yFim = p.y + alturaCaixa / 2;
            const meio = (xIni + xFim) / 2;

            doc.lines([[meio - xIni, 0, meio - xIni, yFim - cy, xFim - xIni, yFim - cy]], xIni, cy, [1, 1], 'S');
        });

        // O galho: número, título e as ideias-chave (a letra encolhe até caber na caixa).
        ramos.forEach(function (ramo, i) {
            const p = posicaoDaCaixa(i);
            const largTexto = larguraCaixa - 17;
            const titulo = U.limpar(ramo.titulo);
            // Caixas grandes (poucos galhos) reservam um cantinho igual pra anotações à mão.
            const reservaNotas = alturaCaixa >= 52 ? 20 : 0;
            const alturaUtil = alturaCaixa - reservaNotas;
            let tamanho = alturaCaixa >= 52 ? 12 : 9.5;
            let pontos = (ramo.pontos || []).map(U.limpar).filter(Boolean);
            let linhasTitulo;
            let blocos;

            function medir() {
                linhasTitulo = quebrar(titulo, largTexto, tamanho + 1.5, true).slice(0, 2);
                blocos = pontos.map(function (pt) { return quebrar(pt, largTexto - 3.5, tamanho, false); });

                return 4.5 + linhasTitulo.length * linhasDe(tamanho + 1.5) + 1.5
                    + blocos.reduce(function (s, b) { return s + b.length * linhasDe(tamanho) + 0.9; }, 0) + 2;
            }

            while (medir() > alturaUtil && tamanho > 7) tamanho -= 0.5;
            while (medir() > alturaUtil && pontos.length > 1) pontos.pop();

            cor(PASTEIS[i % PASTEIS.length], 'preencher');
            cor(C.TINTA, 'desenho');
            doc.setLineWidth(0.4);
            doc.roundedRect(p.x, p.y, larguraCaixa, alturaCaixa, 4, 4, 'FD');

            bolinha(p.x + 8, p.y + 8.5, 4.2, C.TINTA);
            texto(String(i + 1), p.x + 8, p.y + 9.9, 10, [255, 255, 255], true, { align: 'center' });

            let y = p.y + 8.2;

            linhasTitulo.forEach(function (linha) {
                texto(linha, p.x + 15, y, tamanho + 1.5, C.TINTA, true);
                y += linhasDe(tamanho + 1.5);
            });

            y += 0.8;

            blocos.forEach(function (bloco) {
                bolinha(p.x + 16.2, y - 1, 0.65, C.TINTA);

                bloco.forEach(function (linha) {
                    texto(linha, p.x + 19, y, tamanho, C.TINTA, false);
                    y += linhasDe(tamanho);
                });

                y += 0.9;
            });

            // Sobrou espaço na caixa? Vira um cantinho pra escrever à mão (é pra imprimir).
            const fundo = p.y + alturaCaixa;

            if (reservaNotas) {
                texto('Minhas anotações', p.x + 7, fundo - 14.5, 7, C.TINTA_2, true);
                cor(C.TINTA_3, 'desenho');
                doc.setLineWidth(0.25);
                doc.line(p.x + 7, fundo - 9, p.x + larguraCaixa - 7, fundo - 9);
                doc.line(p.x + 7, fundo - 3.5, p.x + larguraCaixa - 7, fundo - 3.5);
            }
        });

        // O centro: o assunto do plano.
        cor(C.ROXO, 'preencher');
        doc.ellipse(cx, cy, 34, 20, 'F');

        const materia = U.limpar(plano.materia).toUpperCase();
        const linhasCentro = quebrar(plano.conteudo, 56, 12.5, true).slice(0, 3);
        const alturaCentro = linhasDe(8) + 1.5 + linhasCentro.length * linhasDe(12.5);
        let yc = cy - alturaCentro / 2 + linhasDe(8) - 0.5;

        texto(materia.slice(0, 26), cx, yc, 8, [216, 204, 251], true, { align: 'center' });
        yc += 1.5;

        linhasCentro.forEach(function (linha) {
            yc += linhasDe(12.5);
            texto(linha, cx, yc - 0.6, 12.5, [255, 255, 255], true, { align: 'center' });
        });

        if (plano.data_avaliacao) {
            texto('Avaliação: ' + U.dataBR(plano.data_avaliacao), cx, cy + 27.5, 9, C.ROXO, true, { align: 'center' });
        }

        /* =========================================
           PÁGINAS 2+ — A TRILHA
        ========================================= */

        // Mapa que nasceu de uma conversa não tem dias nem atividades: sem trilha.
        const paradas = plano.tarefas && plano.tarefas.length ? paradasDoPlano(plano, mapa) : [];

        if (paradas.length) paradas.push({ tipo: 'chegada' });

        const POR_PAGINA = 10;

        function desenharParada(p, i, xc, yc, numero) {
            const cartaoL = 50;
            const cartaoA = 50;
            const topoCartao = yc + 9.5;

            // Círculo da parada
            if (p.tipo === 'chegada') {
                bolinha(xc, yc, 7, C.ROXO);
                cor([255, 255, 255], 'desenho');
                doc.setLineWidth(0.8);
                doc.line(xc - 2.6, yc + 4.2, xc - 2.6, yc - 4.6);
                cor([255, 255, 255], 'preencher');
                doc.triangle(xc - 2.6, yc - 4.6, xc + 4, yc - 2.2, xc - 2.6, yc + 0.2, 'F');
            } else {
                cor(PASTEIS[(numero - 1) % PASTEIS.length], 'preencher');
                cor(C.TINTA, 'desenho');
                doc.setLineWidth(0.5);
                doc.circle(xc, yc, 7, 'FD');
                texto(String(numero), xc, yc + 1.9, 11, C.TINTA, true, { align: 'center' });
            }

            // Cartão
            cor([255, 255, 255], 'preencher');
            cor(C.TINTA_3, 'desenho');
            doc.setLineWidth(0.3);
            doc.roundedRect(xc - cartaoL / 2, topoCartao, cartaoL, cartaoA, 3, 3, 'FD');

            const x0 = xc - cartaoL / 2 + 3;
            const larg = cartaoL - 6;
            let y = topoCartao + 5.5;

            if (p.tipo === 'chegada') {
                texto(plano.data_avaliacao ? 'Dia da avaliação' : 'Chegada', x0, y, 9.5, C.ROXO, true);
                y += 4.8;

                if (plano.data_avaliacao) {
                    texto(diaCurto(plano.data_avaliacao), x0, y, 8.5, C.TINTA_2, true);
                    y += 5;
                }

                const objetivo = plano.objetivo ? 'Seu objetivo: ' + plano.objetivo : 'Você seguiu seu plano um passo de cada vez.';
                const linhas = quebrar(objetivo, larg, 8, false).slice(0, 5);

                texto(linhas, x0, y, 8, C.TINTA, false);
                y += linhas.length * linhasDe(8) + 2;

                const fim = quebrar('Respire fundo: você se preparou passo a passo.', larg, 7.5, false, true).slice(0, 3);

                texto(fim, x0, y, 7.5, C.TINTA_2, false, undefined, true);

                return;
            }

            texto(diaCurto(p.dia), x0, y, 9.5, C.TINTA, true);

            const minutos = p.tarefas.reduce(function (s, t) { return s + (t.duracao_min || 0); }, 0);

            texto(minutos + ' min', xc + cartaoL / 2 - 3, y, 8, C.TINTA_2, false, { align: 'right' });
            y += 4;

            if (p.meta) {
                const linhasMeta = quebrar('Meta: ' + p.meta, larg, 7.8, false, true).slice(0, 3);

                texto(linhasMeta, x0, y, 7.8, C.ROXO, false, undefined, true);
                y += linhasMeta.length * linhasDe(7.8) + 2;
            }

            // Atividades do dia (as que não couberem viram "+N atividades").
            const limite = topoCartao + cartaoA - 3;
            let mostradas = 0;

            for (let k = 0; k < p.tarefas.length; k++) {
                const t = p.tarefas[k];
                const tipoTxt = NOMES_TIPO[t.tipo] || 'Estudo';
                const linhas = quebrar(tipoTxt + ': ' + t.titulo + ' (' + t.duracao_min + ' min)', larg - 4.5, 7.6, false).slice(0, 3);
                const altura = linhas.length * linhasDe(7.6) + 1;
                const restantes = p.tarefas.length - k - 1;

                if (y + altura > limite - (restantes > 0 ? 3.5 : 0) && k > 0) break;

                cor(C.TINTA, 'desenho');
                doc.setLineWidth(0.25);

                if (t.concluida) {
                    cor(C.VERDE, 'preencher');
                    doc.rect(x0, y - 2.4, 2.6, 2.6, 'F');
                } else {
                    doc.rect(x0, y - 2.4, 2.6, 2.6, 'S');
                }

                texto(linhas, x0 + 4.2, y, 7.6, C.TINTA, false);
                y += altura;
                mostradas++;
            }

            if (mostradas < p.tarefas.length) {
                texto('+ ' + (p.tarefas.length - mostradas) + ' atividade(s)', x0, y + 0.5, 7, C.TINTA_2, true);
            }
        }

        let numeroDaParada = 0;

        for (let inicio = 0; inicio < paradas.length; inicio += POR_PAGINA) {
            const grupo = paradas.slice(inicio, inicio + POR_PAGINA);

            doc.addPage();
            cabecalho('TRILHA DO PLANO');

            texto(plano.data_avaliacao ? 'Minha trilha até a avaliação' : 'Minha trilha de estudos', MARGEM, 31, 16, C.TINTA, true);
            texto('Cada parada é um dia de estudo. Marque as atividades que você já fez e siga no seu ritmo.', MARGEM, 37, 9.5, C.TINTA_2, false);

            const pos = grupo.map(function (_, i) {
                const linha = i < 5 ? 0 : 1;
                const coluna = linha === 0 ? i : 9 - i;

                return { x: MARGEM + (L - 2 * MARGEM) * (coluna + 0.5) / 5, y: linha === 0 ? 55 : 134 };
            });

            // O caminho por baixo das paradas.
            cor([216, 204, 251], 'desenho');
            doc.setLineWidth(2.6);
            doc.setLineCap('round');

            for (let i = 0; i < pos.length - 1; i++) {
                const a = pos[i];
                const b = pos[i + 1];

                if (i === 4) {
                    doc.lines([[24, 0, 24, b.y - a.y, b.x - a.x, b.y - a.y]], a.x, a.y, [1, 1], 'S');
                } else {
                    doc.line(a.x, a.y, b.x, b.y);
                }
            }

            grupo.forEach(function (p, i) {
                if (p.tipo === 'dia') numeroDaParada++;

                desenharParada(p, i, pos[i].x, pos[i].y, numeroDaParada);
            });

            doc.setLineCap('butt');

            // Trilha curta: sobra espaço embaixo, então cabe um "como usar".
            if (grupo.length <= 7) {
                const bx = MARGEM;
                const by = 132;
                const dicas = [
                    'Cole este mapa onde você estuda.',
                    'Ao terminar uma atividade, marque a caixinha.',
                    'Errou ou travou? Sem problema: volte um passo e chame o Up.',
                    'Descansar também faz parte de estudar.'
                ];

                cor(C.LILAS, 'preencher');
                doc.roundedRect(bx, by, 132, 52, 4, 4, 'F');
                texto('COMO USAR A SUA TRILHA', bx + 7, by + 9, 8, C.ROXO, true);

                let yd = by + 17;

                dicas.forEach(function (d, k) {
                    const linhasDica = quebrar(d, 112, 9.5, false);

                    bolinha(bx + 9, yd - 1.1, 3.1, C.TINTA);
                    texto(String(k + 1), bx + 9, yd + 0.1, 8, [255, 255, 255], true, { align: 'center' });
                    texto(linhasDica, bx + 16, yd, 9.5, C.TINTA, false);
                    yd += linhasDica.length * linhasDe(9.5) + 3.6;
                });
            }
        }

        /* =========================================
           ÚLTIMA PÁGINA — MEU JEITO DE ESTUDAR
        ========================================= */

        const temEstrategias = mapa.estrategias && mapa.estrategias.length;
        const temPerguntas = mapa.perguntas && mapa.perguntas.length;

        if (temEstrategias || temPerguntas || mapa.mensagem) {
            doc.addPage();
            cabecalho('MEU JEITO DE ESTUDAR');

            const colunaL = 128;
            const xDir = L - MARGEM - colunaL;

            texto('Do meu jeito', MARGEM, 31, 16, C.TINTA, true);

            if (temEstrategias) {
                let y = 44;

                texto('Estratégias pra mim', MARGEM, y, 11.5, C.ROXO, true);
                y += 3;
                cor(C.BORDA, 'desenho');
                doc.setLineWidth(0.4);
                doc.line(MARGEM, y, MARGEM + colunaL, y);
                y += 7;

                mapa.estrategias.forEach(function (e, i) {
                    const linhas = quebrar(e, colunaL - 11, 10, false);

                    bolinha(MARGEM + 3.5, y - 1.1, 3.4, PASTEIS[i % PASTEIS.length]);
                    texto(String(i + 1), MARGEM + 3.5, y + 0.2, 8.5, C.TINTA, true, { align: 'center' });
                    texto(linhas, MARGEM + 10, y, 10, C.TINTA, false);
                    y += linhas.length * linhasDe(10) + 5.5;
                });
            }

            if (temPerguntas) {
                let y = 44;

                texto('Pergunte-se: me teste!', xDir, y, 11.5, C.ROXO, true);
                y += 3;
                cor(C.BORDA, 'desenho');
                doc.setLineWidth(0.4);
                doc.line(xDir, y, xDir + colunaL, y);
                y += 7;

                mapa.perguntas.forEach(function (q, i) {
                    const linhas = quebrar(q, colunaL - 8, 10, true);
                    const altura = linhas.length * linhasDe(10) + 15;

                    if (y + altura > 160) return;

                    texto(String(i + 1) + '.', xDir, y, 10, C.ROXO, true);
                    texto(linhas, xDir + 6, y, 10, C.TINTA, true);
                    y += linhas.length * linhasDe(10) + 5.5;

                    // Duas linhas pra escrever a resposta com a própria letra.
                    cor(C.BORDA, 'desenho');
                    doc.setLineWidth(0.3);
                    doc.line(xDir + 6, y, xDir + colunaL, y);
                    y += 6.5;
                    doc.line(xDir + 6, y, xDir + colunaL, y);
                    y += 9;
                });
            }

            if (mapa.mensagem) {
                const yBox = 168;
                const linhasMsg = quebrar(mapa.mensagem, L - 2 * MARGEM - 24, 11, true);

                cor(C.LILAS, 'preencher');
                doc.roundedRect(MARGEM, yBox, L - 2 * MARGEM, 24, 4, 4, 'F');
                texto('UM RECADO DO UP', MARGEM + 8, yBox + 7, 7.5, C.ROXO, true);
                texto(linhasMsg.slice(0, 2), MARGEM + 8, yBox + 13.5, 11, C.TINTA, true);
            }
        }

        /* ---- rodapé em todas as páginas ---- */

        const paginas = doc.getNumberOfPages();

        for (let p = 1; p <= paginas; p++) {
            doc.setPage(p);

            cor(C.BORDA, 'desenho');
            doc.setLineWidth(0.3);
            doc.line(MARGEM, A - 10.5, L - MARGEM, A - 10.5);

            texto('UpLearn  ·  Mapa feito pelo Up (IA) só pra você. Confira o conteúdo com seu professor ou material.', MARGEM, A - 6, 7.5, C.TINTA_3, false);
            texto('Página ' + p + ' de ' + paginas, L - MARGEM, A - 6, 7.5, C.TINTA_3, false, { align: 'right' });
        }

        doc.save(nomeDoArquivo(plano));
    }

    return { baixar: baixar, nomeDoArquivo: nomeDoArquivo };

})();
