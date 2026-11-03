/* =========================================
   RESUMO, FLASHCARDS E CADERNO DE REVISÃO EM PDF (pra imprimir)

   Três saídas, todas montadas aqui no navegador (nada vai pra servidor):

     resumo(plano)      — resumo de estudo do plano, com espaço pra anotar
     flashcards(plano)  — cartas pra recortar: páginas de frente e de verso,
                          com o verso espelhado pra imprimir frente e verso
     revisao(cartoes)   — caderno com as questões da revisão do dia e o
                          gabarito (com explicação) na última página

   O conteúdo do resumo e dos cartões é escrito pela IA pra este estudante e
   guardado no plano (plano.fichas); o caderno de revisão vem das questões que
   a pessoa errou. Impresso em preto e branco continua funcionando: nada
   depende só de cor.
========================================= */

const FichasPdf = (function () {

    const U = PlanoPdf.util;
    const C = U.cores;

    const L = 210;
    const A = 297;
    const MARGEM = 16;
    const LARGURA = L - 2 * MARGEM;
    const FIM_UTIL = A - 22;                 // sobra espaço pro rodapé

    const LETRAS = ['A', 'B', 'C', 'D'];

    // Cartas: 2 colunas x 4 linhas por página.
    const CARTA_L = 90;
    const CARTA_A = 62;
    const GRADE_X = (L - 2 * CARTA_L) / 2;
    const GRADE_Y = 24;

    const PASTEIS = [
        [247, 166, 218], [241, 242, 91], [126, 232, 246], [255, 180, 138], [181, 240, 154], [157, 180, 255]
    ];


    function nomeDoArquivo(prefixo, plano) {
        const base = plano
            ? [U.slug(plano.materia), U.slug(plano.titulo)].filter(Boolean).join('-').slice(0, 60).replace(/-+$/, '')
            : '';

        return prefixo + (base ? '-' + base : '') + '.pdf';
    }

    // Ferramentas de desenho em cima de um documento jsPDF.
    async function abrirDocumento(titulo, assunto) {
        const jsPDF = await U.carregarBiblioteca();
        const logo = await U.carregarLogo();
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

        try { doc.setLanguage('pt-BR'); } catch (erro) { /* só metadado */ }

        doc.setProperties({ title: U.limpar(titulo), subject: U.limpar(assunto || ''), author: 'UpLearn', creator: 'UpLearn' });

        function cor(rgb, tipo) {
            if (tipo === 'texto') doc.setTextColor(rgb[0], rgb[1], rgb[2]);
            else if (tipo === 'preencher') doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        }

        function fonte(tamanho, negrito) {
            doc.setFont('helvetica', negrito ? 'bold' : 'normal');
            doc.setFontSize(tamanho);
        }

        function texto(conteudo, x, y, tamanho, rgb, negrito, opcoes) {
            fonte(tamanho, negrito);
            cor(rgb, 'texto');
            doc.text(conteudo, x, y, opcoes);
        }

        function quebrar(conteudo, largura, tamanho, negrito) {
            fonte(tamanho, negrito);

            return doc.splitTextToSize(U.limpar(conteudo), largura);
        }

        function cabecalho(subtitulo) {
            cor(C.ROXO, 'preencher');
            doc.rect(0, 0, L, 22, 'F');

            if (logo) doc.addImage(logo.dados, 'PNG', MARGEM, 5.5, 11 * logo.proporcao, 11);
            else texto('UpLearn', MARGEM, 15, 16, [255, 255, 255], true);

            texto(subtitulo, L - MARGEM, 13.5, 10, [255, 255, 255], true, { align: 'right' });
        }

        function rodape(frase) {
            const paginas = doc.getNumberOfPages();

            for (let p = 1; p <= paginas; p++) {
                doc.setPage(p);

                cor(C.BORDA, 'desenho');
                doc.setLineWidth(0.3);
                doc.line(MARGEM, A - 16, L - MARGEM, A - 16);

                texto(frase, MARGEM, A - 10.5, 8, C.TINTA_3, false);
                texto('Página ' + p + ' de ' + paginas, L - MARGEM, A - 10.5, 8, C.TINTA_3, false, { align: 'right' });
            }
        }

        return { doc: doc, cor: cor, fonte: fonte, texto: texto, quebrar: quebrar, cabecalho: cabecalho, rodape: rodape };
    }

    function linhaMm(pt) { return U.mmDaLinha(pt); }


    /* =========================================
       RESUMO DE ESTUDO
    ========================================= */

    async function resumo(plano) {
        const fichas = plano.fichas;

        if (!fichas || !fichas.resumo || !fichas.resumo.length) throw new Error('Esse plano ainda não tem um resumo.');

        const d = await abrirDocumento('Resumo de estudo - ' + plano.titulo, plano.materia + ' - ' + plano.conteudo);
        const doc = d.doc;

        d.cabecalho('RESUMO DE ESTUDO');

        let y = 36;

        d.texto(d.quebrar(plano.titulo, LARGURA, 20, true), MARGEM, y, 20, C.TINTA, true);
        y += d.quebrar(plano.titulo, LARGURA, 20, true).length * linhaMm(20) + 1;
        d.texto(U.limpar(plano.materia + '  ·  ' + plano.conteudo), MARGEM, y, 11, C.TINTA_2, false);
        y += 10;

        function novaPagina() {
            doc.addPage();
            d.cabecalho('RESUMO DE ESTUDO');
            y = 34;
        }

        fichas.resumo.forEach(function (topico, i) {
            const titulo = d.quebrar(topico.titulo, LARGURA - 12, 13, true);
            const pontos = topico.pontos.map(function (p) { return d.quebrar(p, LARGURA - 14, 11, false); });
            const altura = titulo.length * linhaMm(13) + 4
                + pontos.reduce(function (s, l) { return s + l.length * linhaMm(11) + 2.2; }, 0) + 6;

            if (y + Math.min(altura, 40) > FIM_UTIL) novaPagina();

            // Número em círculo (legível também sem cor).
            d.cor(C.LILAS, 'preencher');
            doc.circle(MARGEM + 4, y - 1.2, 4, 'F');
            d.texto(String(i + 1), MARGEM + 4, y, 10, C.ROXO, true, { align: 'center' });
            d.texto(titulo, MARGEM + 12, y, 13, C.TINTA, true);
            y += titulo.length * linhaMm(13) + 3;

            pontos.forEach(function (linhas) {
                if (y + linhas.length * linhaMm(11) > FIM_UTIL) novaPagina();

                d.cor(C.ROXO, 'preencher');
                doc.circle(MARGEM + 14.5, y - 1.1, 0.8, 'F');
                d.texto(linhas, MARGEM + 18, y, 11, C.TINTA_2, false);
                y += linhas.length * linhaMm(11) + 2.2;
            });

            y += 5;
        });

        // Espaço pra pessoa escrever com as próprias palavras.
        if (y + 40 > FIM_UTIL) novaPagina();

        d.texto('Com as minhas palavras', MARGEM, y, 12, C.TINTA, true);
        d.cor(C.BORDA, 'desenho');
        doc.setLineWidth(0.3);

        for (let k = 0; k < 6 && y + 9 <= FIM_UTIL; k++) {
            y += 9;
            doc.line(MARGEM, y, L - MARGEM, y);
        }

        d.rodape('UpLearn  ·  Resumo feito pelo Up (IA). Confira o conteúdo com seu professor ou material.');
        doc.save(nomeDoArquivo('resumo-de-estudo', plano));
    }


    /* =========================================
       FLASHCARDS (cartas pra recortar)
    ========================================= */

    async function flashcards(plano) {
        const fichas = plano.fichas;

        if (!fichas || !fichas.cartoes || !fichas.cartoes.length) throw new Error('Esse plano ainda não tem flashcards.');

        const d = await abrirDocumento('Flashcards - ' + plano.titulo, plano.materia + ' - ' + plano.conteudo);
        const doc = d.doc;
        const cartoes = fichas.cartoes;
        const porPagina = 8;
        const paginas = Math.ceil(cartoes.length / porPagina);

        // Escolhe o maior tamanho de letra em que o texto cabe na carta.
        function ajustar(conteudo, largura, altura, negrito, maximo) {
            for (let tamanho = maximo; tamanho >= 8; tamanho--) {
                const linhas = d.quebrar(conteudo, largura, tamanho, negrito);

                if (linhas.length * linhaMm(tamanho) <= altura) return { linhas: linhas, tamanho: tamanho };
            }

            return { linhas: d.quebrar(conteudo, largura, 8, negrito).slice(0, Math.floor(altura / linhaMm(8))), tamanho: 8 };
        }

        function desenharCarta(x, y, indice, lado) {
            const c = cartoes[indice];
            const pastel = PASTEIS[indice % PASTEIS.length];
            const frente = lado === 'frente';

            // Contorno tracejado = linha de corte.
            d.cor(C.TINTA_3, 'desenho');
            doc.setLineWidth(0.25);
            doc.setLineDashPattern([1.6, 1.6], 0);
            doc.rect(x, y, CARTA_L, CARTA_A);
            doc.setLineDashPattern([], 0);

            if (frente) {
                d.cor(pastel, 'preencher');
                doc.rect(x + 3, y + 3, CARTA_L - 6, 5, 'F');
            }

            d.texto((frente ? 'PERGUNTA ' : 'RESPOSTA ') + (indice + 1), x + 5, y + 7, 7.5, frente ? C.TINTA : C.ROXO, true);

            const ajuste = ajustar(frente ? c.frente : c.verso, CARTA_L - 16, CARTA_A - 26, frente, frente ? 15 : 13);
            const alturaTexto = ajuste.linhas.length * linhaMm(ajuste.tamanho);
            const topo = y + 14 + (CARTA_A - 26 - alturaTexto) / 2;

            d.texto(ajuste.linhas, x + CARTA_L / 2, topo + linhaMm(ajuste.tamanho) * 0.8, ajuste.tamanho, C.TINTA, frente, { align: 'center' });

            d.texto('UpLearn · ' + U.limpar(plano.materia), x + CARTA_L / 2, y + CARTA_A - 4, 6.5, C.TINTA_3, false, { align: 'center' });
        }

        function pagina(p, lado) {
            d.cabecalho(lado === 'frente' ? 'FLASHCARDS · FRENTE' : 'FLASHCARDS · VERSO');
            d.texto(
                lado === 'frente'
                    ? 'Recorte nas linhas tracejadas. Imprima as páginas de frente e de verso na mesma folha (virando pela borda comprida).'
                    : 'Verso das cartas da página anterior. As colunas ficam espelhadas de propósito: assim cada resposta cai atrás da sua pergunta.',
                MARGEM, 28, 8, C.TINTA_3, false
            );

            for (let k = 0; k < porPagina; k++) {
                const indice = p * porPagina + k;

                if (indice >= cartoes.length) break;

                const linha = Math.floor(k / 2);
                let coluna = k % 2;

                if (lado === 'verso') coluna = 1 - coluna;

                desenharCarta(GRADE_X + coluna * CARTA_L, GRADE_Y + 6 + linha * CARTA_A, indice, lado);
            }
        }

        for (let p = 0; p < paginas; p++) {
            if (p > 0) doc.addPage();
            pagina(p, 'frente');
            doc.addPage();
            pagina(p, 'verso');
        }

        doc.save(nomeDoArquivo('flashcards', plano));
    }


    /* =========================================
       CADERNO DE REVISÃO
    ========================================= */

    async function revisao(cartoes, nomeAluno) {
        if (!cartoes || !cartoes.length) throw new Error('Não há questões para levar no caderno.');

        const d = await abrirDocumento('Caderno de revisão', 'Questões para rever');
        const doc = d.doc;
        const primeiroNome = U.limpar(nomeAluno || '').split(' ')[0];

        d.cabecalho('CADERNO DE REVISÃO');

        let y = 36;

        d.texto('Revisão' + (primeiroNome ? ' de ' + primeiroNome : ''), MARGEM, y, 20, C.TINTA, true);
        y += 7;
        d.texto('Responda no papel e só depois confira o gabarito, na última página.', MARGEM, y, 11, C.TINTA_2, false);
        y += 10;

        function novaPagina() {
            doc.addPage();
            d.cabecalho('CADERNO DE REVISÃO');
            y = 34;
        }

        cartoes.forEach(function (c, i) {
            const enunciado = d.quebrar(c.enunciado, LARGURA - 10, 11.5, true);
            const alternativas = c.alternativas.map(function (a) { return d.quebrar(a, LARGURA - 24, 10.5, false); });
            const altura = enunciado.length * linhaMm(11.5) + 3
                + alternativas.reduce(function (s, l) { return s + l.length * linhaMm(10.5) + 2.4; }, 0) + 6;

            if (y + altura > FIM_UTIL) novaPagina();

            d.texto(String(i + 1) + '.', MARGEM, y, 11.5, C.ROXO, true);
            d.texto(enunciado, MARGEM + 9, y, 11.5, C.TINTA, true);
            y += enunciado.length * linhaMm(11.5) + 3;

            alternativas.forEach(function (linhas, k) {
                d.cor(C.TINTA_3, 'desenho');
                doc.setLineWidth(0.3);
                doc.circle(MARGEM + 12, y - 1.3, 2.2);
                d.texto(LETRAS[k], MARGEM + 12, y - 0.2, 7.5, C.TINTA, true, { align: 'center' });
                d.texto(linhas, MARGEM + 18, y, 10.5, C.TINTA_2, false);
                y += linhas.length * linhaMm(10.5) + 2.4;
            });

            y += 6;
        });

        /* ---- gabarito ---- */

        novaPagina();
        d.texto('Gabarito', MARGEM, y, 18, C.TINTA, true);
        y += 9;

        cartoes.forEach(function (c, i) {
            const certa = LETRAS[c.correta] + ') ' + c.alternativas[c.correta];
            const linhasCerta = d.quebrar(certa, LARGURA - 14, 10.5, true);
            const linhasExp = c.explicacao ? d.quebrar(c.explicacao, LARGURA - 14, 9.5, false) : [];
            const altura = linhasCerta.length * linhaMm(10.5) + linhasExp.length * linhaMm(9.5) + 8;

            if (y + altura > FIM_UTIL) novaPagina();

            d.texto(String(i + 1) + '.', MARGEM, y, 10.5, C.ROXO, true);
            d.texto(linhasCerta, MARGEM + 9, y, 10.5, C.VERDE, true);
            y += linhasCerta.length * linhaMm(10.5) + 1.5;

            if (linhasExp.length) {
                d.texto(linhasExp, MARGEM + 9, y, 9.5, C.TINTA_2, false);
                y += linhasExp.length * linhaMm(9.5);
            }

            y += 5;
        });

        d.rodape('UpLearn  ·  Questões que você errou, com revisão espaçada. Boa revisão!');
        doc.save('caderno-de-revisao.pdf');
    }

    return { resumo: resumo, flashcards: flashcards, revisao: revisao };

})();
