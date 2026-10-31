/* =========================================
   PLANO DE ESTUDOS EM PDF

   Monta o PDF aqui no navegador, a partir do plano que o estudante está vendo
   na tela (com as mudanças dele, mesmo as que ainda estão sendo salvas).
   Nada é enviado pra servidor.

   A biblioteca (jsPDF, MIT) está em js/vendor/ — vem junto com o site, então
   funciona mesmo em rede de escola que bloqueia sites de fora — e só é
   carregada quando a pessoa pede o PDF.

   O PDF funciona impresso em preto e branco: cada atividade tem uma caixinha
   pra marcar e o tipo e o tempo escritos por extenso (nada depende só de cor).
========================================= */

const PlanoPdf = (function () {

    const ROXO = [75, 31, 166];
    const TINTA = [27, 16, 53];
    const TINTA_2 = [74, 66, 98];
    const TINTA_3 = [109, 101, 133];
    const LILAS = [236, 231, 248];
    const BORDA = [227, 220, 243];
    const VERDE = [23, 117, 79];

    const PAGINA_L = 210;
    const PAGINA_A = 297;
    const MARGEM = 16;
    const LARGURA = PAGINA_L - 2 * MARGEM;
    const FIM_UTIL = PAGINA_A - 22;          // sobra espaço pro rodapé
    const COLUNA_DIREITA = 40;                // "Exercício · 120 min"
    const CAIXA = 5;                          // lado da caixinha de marcar

    const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

    let promessaBiblioteca = null;

    function carregarBiblioteca() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);

        if (!promessaBiblioteca) {
            promessaBiblioteca = new Promise(function (resolve, reject) {
                const tag = document.createElement('script');

                tag.src = 'js/vendor/jspdf.umd.min.js';
                tag.onload = function () { resolve(window.jspdf.jsPDF); };
                tag.onerror = function () {
                    promessaBiblioteca = null;
                    reject(new Error('Não consegui carregar o gerador de PDF. Confira sua internet e tente de novo.'));
                };
                document.head.appendChild(tag);
            });
        }

        return promessaBiblioteca;
    }

    // O logo é opcional: se não carregar, o PDF sai só com o nome escrito.
    function carregarLogo() {
        return new Promise(function (resolve) {
            const img = new Image();

            img.onload = function () {
                const canvas = document.createElement('canvas');

                // 13 mm de altura no papel: 460 px de largura já dá ~300 dpi.
                canvas.width = Math.min(460, img.naturalWidth);
                canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

                resolve({ dados: canvas.toDataURL('image/png'), proporcao: img.naturalWidth / img.naturalHeight });
            };
            img.onerror = function () { resolve(null); };
            img.src = 'img/logo.png';
        });
    }

    // A fonte padrão do PDF (Helvetica) cobre o português, mas não emojis nem
    // alguns símbolos. Troca o que tem equivalente simples e tira o resto.
    // (Por código de caractere, pra não depender de escapes dentro de regex.)
    const TROCAS = {
        0x2018: "'", 0x2019: "'", 0x201A: "'", 0x201C: '"', 0x201D: '"', 0x201E: '"',
        0x2013: '-', 0x2014: '-', 0x2212: '-', 0x2026: '...', 0x2022: '-', 0x25CF: '-',
        0x2009: ' ', 0x200A: ' ', 0x202F: ' ', 0xA0: ' '
    };

    function limpar(texto) {
        let saida = '';

        for (const ch of String(texto == null ? '' : texto).normalize('NFC')) {
            const c = ch.codePointAt(0);

            if (TROCAS[c] !== undefined) saida += TROCAS[c];
            else if (c === 9 || c === 10 || (c >= 0x20 && c <= 0x7E) || (c >= 0xA1 && c <= 0xFF)) saida += ch;
        }

        return saida.replace(/[ 	]{2,}/g, ' ').trim();
    }

    function dataBR(iso) {
        return iso ? String(iso).split('-').reverse().join('/') : '';
    }

    function diaExtenso(iso) {
        if (!iso) return 'Sem dia definido';

        const d = new Date(iso + 'T12:00:00');
        const nome = DIAS[d.getDay()];

        return nome.charAt(0).toUpperCase() + nome.slice(1) + ', ' + dataBR(iso);
    }

    function nomeDoArquivo(plano) {
        const slug = function (t) {
            return limpar(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        };

        const base = [slug(plano.materia), slug(plano.titulo)].filter(Boolean).join('-').slice(0, 60).replace(/-+$/, '');

        return 'plano-de-estudos' + (base ? '-' + base : '') + '.pdf';
    }

    function mmDaLinha(pt) {
        return pt * 0.3528 * 1.2;
    }


    async function baixar(plano) {
        const jsPDF = await carregarBiblioteca();
        const logo = await carregarLogo();

        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        let y = 0;
        let diaAtual;   // pra repetir o título do dia se ele continuar na página seguinte

        try { doc.setLanguage('pt-BR'); } catch (erro) { /* só metadado */ }

        doc.setProperties({
            title: limpar('Plano de estudos - ' + plano.titulo),
            subject: limpar(plano.materia + ' - ' + plano.conteudo),
            author: 'UpLearn',
            creator: 'UpLearn'
        });

        function cor(rgb, tipo) {
            if (tipo === 'texto') doc.setTextColor(rgb[0], rgb[1], rgb[2]);
            else if (tipo === 'preencher') doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        }

        function texto(conteudo, x, yy, tamanho, negrito, rgb, opcoes) {
            doc.setFont('helvetica', negrito ? 'bold' : 'normal');
            doc.setFontSize(tamanho);
            cor(rgb, 'texto');
            doc.text(conteudo, x, yy, opcoes);
        }

        function quebrar(conteudo, largura, tamanho, negrito) {
            doc.setFont('helvetica', negrito ? 'bold' : 'normal');
            doc.setFontSize(tamanho);

            return doc.splitTextToSize(conteudo, largura);
        }

        /* ---- cabeçalho (só na primeira página) ---- */

        cor(ROXO, 'preencher');
        doc.rect(0, 0, PAGINA_L, 38, 'F');

        if (logo) {
            const altura = 13;

            doc.addImage(logo.dados, 'PNG', MARGEM, 12.5, altura * logo.proporcao, altura);
        } else {
            texto('UpLearn', MARGEM, 22, 20, true, [255, 255, 255]);
        }

        texto('PLANO DE ESTUDOS', PAGINA_L - MARGEM, 22, 10, true, [255, 255, 255], { align: 'right' });

        y = 52;

        /* ---- título e dados ---- */

        const titulo = quebrar(limpar(plano.titulo), LARGURA, 21, true);

        texto(titulo, MARGEM, y, 21, true, TINTA);
        y += titulo.length * mmDaLinha(21) + 1;

        const assunto = quebrar(limpar(plano.materia + '  ·  ' + plano.conteudo), LARGURA, 11.5, false);

        texto(assunto, MARGEM, y, 11.5, false, TINTA_2);
        y += assunto.length * mmDaLinha(11.5) + 3;

        function dado(rotulo, valor) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);

            const larguraRotulo = doc.getTextWidth(rotulo) + 2;
            const linhas = quebrar(limpar(valor), LARGURA - larguraRotulo, 10, false);

            texto(rotulo, MARGEM, y, 10, true, TINTA);
            texto(linhas, MARGEM + larguraRotulo, y, 10, false, TINTA_2);
            y += linhas.length * mmDaLinha(10) + 0.8;
        }

        if (plano.objetivo) dado('Objetivo:', plano.objetivo);
        if (plano.data_avaliacao) dado('Avaliação:', dataBR(plano.data_avaliacao));
        if (plano.pausado) dado('Situação:', 'Plano pausado');

        const hoje = new Date();

        dado('Gerado em:', dataBR(UL.hojeISO()) + ' às ' + String(hoje.getHours()).padStart(2, '0') + ':' + String(hoje.getMinutes()).padStart(2, '0'));

        /* ---- progresso ---- */

        const total = plano.tarefas.length;
        const feitas = plano.tarefas.filter(function (t) { return t.concluida; }).length;
        const pct = total ? Math.round(100 * feitas / total) : 0;
        const minutosTotal = plano.tarefas.reduce(function (s, t) { return s + (t.duracao_min || 0); }, 0);

        y += 3;
        texto('Progresso: ' + feitas + ' de ' + total + ' atividades (' + pct + '%)', MARGEM, y, 10.5, true, TINTA);
        texto('Tempo total: ' + minutosTotal + ' min', PAGINA_L - MARGEM, y, 10.5, false, TINTA_2, { align: 'right' });

        y += 2.5;
        cor(LILAS, 'preencher');
        doc.roundedRect(MARGEM, y, LARGURA, 4, 2, 2, 'F');

        if (pct > 0) {
            cor(ROXO, 'preencher');
            doc.roundedRect(MARGEM, y, Math.max(4, LARGURA * pct / 100), 4, 2, 2, 'F');
        }

        y += 12;

        /* ---- atividades por dia ---- */

        function novaPagina() {
            doc.addPage();
            y = MARGEM + 4;
        }

        function tituloDoDia(iso, minutos, continuacao) {
            cor(LILAS, 'preencher');
            doc.roundedRect(MARGEM, y, LARGURA, 8.5, 2, 2, 'F');

            texto(diaExtenso(iso) + (continuacao ? ' (continuação)' : ''), MARGEM + 3.5, y + 5.8, 11, true, ROXO);

            if (minutos !== null) texto(minutos + ' min no dia', PAGINA_L - MARGEM - 3.5, y + 5.8, 9, false, TINTA_2, { align: 'right' });

            y += 11;
        }

        function minutosDoGrupo(inicio) {
            const dia = plano.tarefas[inicio].dia;
            let soma = 0;

            for (let k = inicio; k < plano.tarefas.length && plano.tarefas[k].dia === dia; k++) soma += plano.tarefas[k].duracao_min || 0;

            return soma;
        }

        function linhaDaTarefa(t) {
            const tipo = (UL.TIPOS[t.tipo] || UL.TIPOS.estudo).rotulo;
            const linhas = quebrar(limpar(t.titulo), LARGURA - CAIXA - 6 - COLUNA_DIREITA, 11, false);
            const altura = Math.max(11, linhas.length * mmDaLinha(11) + 5.5);

            if (y + altura > FIM_UTIL) {
                novaPagina();
                tituloDoDia(diaAtual, null, true);
            }

            const topoCaixa = y + 2.6;

            cor(TINTA, 'desenho');
            doc.setLineWidth(0.4);

            if (t.concluida) {
                cor(VERDE, 'preencher');
                doc.roundedRect(MARGEM + 1, topoCaixa, CAIXA, CAIXA, 1, 1, 'F');
                cor([255, 255, 255], 'desenho');
                doc.setLineWidth(0.7);
                doc.line(MARGEM + 2, topoCaixa + 2.7, MARGEM + 3.4, topoCaixa + 4);
                doc.line(MARGEM + 3.4, topoCaixa + 4, MARGEM + 5.6, topoCaixa + 1.4);
            } else {
                doc.roundedRect(MARGEM + 1, topoCaixa, CAIXA, CAIXA, 1, 1, 'S');
            }

            const xTexto = MARGEM + CAIXA + 5;

            linhas.forEach(function (linha, i) {
                const yy = y + 6.3 + i * mmDaLinha(11);

                texto(linha, xTexto, yy, 11, false, t.concluida ? TINTA_3 : TINTA);

                if (t.concluida) {
                    cor(TINTA_3, 'desenho');
                    doc.setLineWidth(0.25);
                    doc.line(xTexto, yy - 1.1, xTexto + doc.getTextWidth(linha), yy - 1.1);
                }
            });

            texto(tipo + '  ·  ' + t.duracao_min + ' min', PAGINA_L - MARGEM, y + 6.3, 9, false, TINTA_2, { align: 'right' });

            cor(BORDA, 'desenho');
            doc.setLineWidth(0.25);
            doc.line(MARGEM, y + altura, PAGINA_L - MARGEM, y + altura);

            y += altura;
        }

        if (!total) {
            texto('Este plano ainda não tem atividades.', MARGEM, y, 11, false, TINTA_2);
            y += 10;
        }

        plano.tarefas.forEach(function (t, i) {
            if (i === 0 || t.dia !== diaAtual) {
                // Não deixa o título do dia sozinho no fim da página.
                if (y + 11 + 12 > FIM_UTIL) novaPagina();

                diaAtual = t.dia;
                tituloDoDia(t.dia, minutosDoGrupo(i), false);
            }

            linhaDaTarefa(t);
        });

        /* ---- dica e anotações ---- */

        y += 8;

        const dica = quebrar('Dica: estudar um pouco por dia, com pausas, funciona melhor do que estudar tudo de uma vez.', LARGURA, 10, false);

        if (y + dica.length * mmDaLinha(10) > FIM_UTIL) novaPagina();

        texto(dica, MARGEM, y, 10, false, TINTA_2);
        y += dica.length * mmDaLinha(10) + 8;

        if (y + 38 <= FIM_UTIL) {
            texto('Minhas anotações', MARGEM, y, 11, true, TINTA);
            y += 3;

            cor(BORDA, 'desenho');
            doc.setLineWidth(0.3);

            for (let k = 0; k < 5 && y + 9 <= FIM_UTIL; k++) {
                y += 9;
                doc.line(MARGEM, y, PAGINA_L - MARGEM, y);
            }
        }

        /* ---- rodapé em todas as páginas ---- */

        const paginas = doc.getNumberOfPages();

        for (let p = 1; p <= paginas; p++) {
            doc.setPage(p);

            cor(BORDA, 'desenho');
            doc.setLineWidth(0.3);
            doc.line(MARGEM, PAGINA_A - 16, PAGINA_L - MARGEM, PAGINA_A - 16);

            texto('UpLearn  ·  Plano feito com a ajuda do Up (IA). Confira o conteúdo com seu professor ou material.', MARGEM, PAGINA_A - 10.5, 8, false, TINTA_3);
            texto('Página ' + p + ' de ' + paginas, PAGINA_L - MARGEM, PAGINA_A - 10.5, 8, false, TINTA_3, { align: 'right' });
        }

        doc.save(nomeDoArquivo(plano));
    }

    // Utilitários que o mapa (mapa-pdf.js) reaproveita.
    const util = {
        carregarBiblioteca: carregarBiblioteca,
        carregarLogo: carregarLogo,
        limpar: limpar,
        dataBR: dataBR,
        mmDaLinha: mmDaLinha,
        slug: function (t) { return nomeDoArquivo({ materia: '', titulo: t }).replace(/^plano-de-estudos-?/, '').replace(/\.pdf$/, ''); },
        cores: { ROXO: ROXO, TINTA: TINTA, TINTA_2: TINTA_2, TINTA_3: TINTA_3, LILAS: LILAS, BORDA: BORDA, VERDE: VERDE }
    };

    return { baixar: baixar, nomeDoArquivo: nomeDoArquivo, util: util };

})();
