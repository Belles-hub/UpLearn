/* =========================================================
   PERSONAGENS DA UPLEARN

   Carinhas chapadas e sem contorno, no estilo do sol da logo: uma forma,
   uma cor, olhos fechados e um sorriso pequeno. Desenhadas em SVG por
   código — o mesmo elenco serve pra qualquer tela e tamanho, sem imagem.

   Uso no HTML:
     <span class="pers pers--anima" data-p="sol amarelo"></span>
     <span class="pers" data-p="lua lilas dormindo"></span>
     <span class="pers" data-p="pi laranja feliz chapeu"></span>

   Formas:      sol lua pi estrela nuvem coracao lampada livro planeta raio
                (os nomes antigos continuam valendo: circulo=sol, blob=lua,
                pera=pi, quadrado=livro, triangulo=lampada, hexagono=planeta)
   Cores:       rosa amarelo ciano laranja verde azul coral lilas roxo
   Expressões:  feliz (olhos fechados) dormindo piscando surpreso bravo triste bocao
   Extra:       chapeu (capelo de formatura)
   Confete:     <span class="conf" data-conf="brilho amarelo"></span>
                tipos: brilho traco bolinha — mesmas cores (+ branco)

   São só enfeite: ficam com aria-hidden e somem no "Modo foco".
========================================================= */

const PERS_TINTA = '#2d0a4e';

// Polígono com pontas: sol (muitas pontas) e estrela (cinco).
function persPontas(n, raioFora, raioDentro, cx, cy) {
    const pontos = [];

    for (let i = 0; i < n * 2; i++) {
        const raio = i % 2 === 0 ? raioFora : raioDentro;
        const angulo = (Math.PI * i) / n - Math.PI / 2;

        pontos.push((cx + raio * Math.cos(angulo)).toFixed(1) + ',' + (cy + raio * Math.sin(angulo)).toFixed(1));
    }

    return pontos.join(' ');
}

// forma -> [desenho(cor, tom), x do rosto, y do rosto, escala do rosto, y do topo (onde assenta o capelo)]
// "tom" é a mesma cor, um pouco mais escura, pra detalhes (anel, lombada, base).
const PERS_FORMAS = {
    sol: [function (cor) { return `<polygon points="${persPontas(14, 46, 35, 50, 50)}" stroke="${cor}" stroke-width="6" stroke-linejoin="round"/>`; }, 50, 52, 0.85, 4],
    lua: [function () { return '<path d="M53.6 6.4A44 44 0 1 0 87.5 69.4A36 36 0 0 1 53.6 6.4z" stroke-linejoin="round"/>'; }, 31, 56, 0.5, 6],
    pi: [function () { return '<rect x="6" y="8" width="88" height="42" rx="16"/><rect x="22" y="36" width="20" height="56" rx="10"/><rect x="58" y="36" width="20" height="56" rx="10"/>'; }, 50, 29, 0.62, 8],
    estrela: [function (cor) { return `<polygon points="${persPontas(5, 46, 24, 50, 54)}" stroke="${cor}" stroke-width="10" stroke-linejoin="round"/>`; }, 50, 56, 0.55, 8],
    nuvem: [function () { return '<circle cx="28" cy="60" r="22"/><circle cx="50" cy="40" r="28"/><circle cx="74" cy="58" r="22"/><rect x="24" y="58" width="52" height="26" rx="13"/>'; }, 50, 56, 0.8, 12],
    coracao: [function () { return '<path d="M50 92C14 64 6 42 6 29 6 15 17 7 29 7 39 7 46 13 50 21 54 13 61 7 71 7 83 7 94 15 94 29 94 42 86 64 50 92z" stroke-linejoin="round"/>'; }, 50, 42, 0.65, 8],
    lampada: [function (cor, tom) { return `<circle cx="50" cy="40" r="34"/><rect x="35" y="64" width="30" height="24" rx="8"/><rect x="37" y="82" width="26" height="10" rx="5" fill="${tom}"/>`; }, 50, 40, 0.75, 6],
    livro: [function (cor, tom) { return `<rect x="12" y="8" width="76" height="84" rx="12"/><path d="M12 20a12 12 0 0 1 12-12h4v84h-4a12 12 0 0 1-12-12z" fill="${tom}"/>`; }, 58, 50, 0.7, 8],
    planeta: [function (cor, tom) { return `<ellipse cx="50" cy="54" rx="48" ry="13" transform="rotate(-22 50 54)" fill="none" stroke="${tom}" stroke-width="7"/><circle cx="50" cy="52" r="32"/>`; }, 50, 52, 0.66, 20],
    raio: [function () { return '<path d="M60 5 22 54h22l-8 41 44-55H56z" stroke-width="8" stroke-linejoin="round"/>'; }, 50, 54, 0.45, 5]
};

// Nomes antigos -> forma nova.
const PERS_LEGADO = {
    circulo: 'sol', feijao: 'sol', blob: 'lua', pera: 'pi', quadrado: 'livro',
    triangulo: 'lampada', hexagono: 'planeta', meia: 'coracao'
};

// Olhos fechados e sorriso pequeno são o padrão; o resto são variações.
const PERS_ROSTOS = {
    sereno: '<path d="M-19-5q6 8 12 0M7-5q6 8 12 0M-6 10q6 6 12 0"/>',
    dormindo: '<path d="M-19-5q6 8 12 0M7-5q6 8 12 0M-4 11q4 3 8 0"/>',
    piscando: `<path d="M-19-5q6 8 12 0"/><circle class="pers__olho" cx="13" cy="-4" r="3.6" fill="${PERS_TINTA}" stroke="none"/><path d="M-6 10q6 6 12 0"/>`,
    bocao: `<circle class="pers__olho" cx="-13" cy="-4" r="3.6" fill="${PERS_TINTA}" stroke="none"/><circle class="pers__olho" cx="13" cy="-4" r="3.6" fill="${PERS_TINTA}" stroke="none"/><path d="M-11 6q11 18 22 0z" fill="${PERS_TINTA}"/>`,
    surpreso: `<circle class="pers__olho" cx="-13" cy="-4" r="3.6" fill="${PERS_TINTA}" stroke="none"/><circle class="pers__olho" cx="13" cy="-4" r="3.6" fill="${PERS_TINTA}" stroke="none"/><ellipse cx="0" cy="12" rx="5" ry="7" fill="${PERS_TINTA}"/>`,
    bravo: `<circle class="pers__olho" cx="-13" cy="-2" r="3.6" fill="${PERS_TINTA}" stroke="none"/><circle class="pers__olho" cx="13" cy="-2" r="3.6" fill="${PERS_TINTA}" stroke="none"/><path d="M-20-12-6-8M20-12 6-8M-8 15q8-6 16 0"/>`,
    triste: '<path d="M-19-3q6-8 12 0M7-3q6-8 12 0M-8 15q8-7 16 0"/>'
};

const PERS_CAPELO = `
    <g stroke="${PERS_TINTA}" stroke-width="3" stroke-linejoin="round" fill="${PERS_TINTA}">
        <polygon points="50,-4 88,10 50,24 12,10"/>
        <path d="M30 18v10q20 10 40 0V18" fill="${PERS_TINTA}"/>
        <path d="M84 12v16" fill="none"/>
        <circle cx="84" cy="32" r="3.5"/>
    </g>`;

// Brilhos, tracinhos e bolinhas soltos, como nos "confetes" das ilustrações.
function persConfete(descricao) {
    const partes = descricao.trim().split(/\s+/);
    const tipo = partes[0];
    const cor = partes[1] === 'branco' ? '#fff' : `var(--c-${partes[1] || 'amarelo'})`;

    if (tipo === 'bolinha') return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="${cor}"/></svg>`;
    if (tipo === 'traco') return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="9" width="20" height="6" rx="3" fill="${cor}" transform="rotate(-35 12 12)"/></svg>`;

    return `<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="${cor}" stroke-width="3" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/></g></svg>`;
}

function persSvg(descricao) {
    const partes = descricao.trim().split(/\s+/);
    const nome = PERS_LEGADO[partes[0]] || partes[0];
    const formaNome = PERS_FORMAS[nome] ? nome : 'sol';
    const forma = PERS_FORMAS[formaNome];
    const cor = partes[1] || 'amarelo';
    const chapeu = partes.includes('chapeu');

    // "feliz" (e qualquer expressão que não exista) vira o rostinho sereno do sol da logo.
    const expressao = PERS_ROSTOS[partes[2]] ? partes[2] : 'sereno';

    const preenchimento = cor === 'roxo' ? 'var(--lilas)' : `var(--c-${cor})`;
    const tom = `color-mix(in srgb, ${preenchimento} 78%, #2d0a4e)`;

    // O capelo assenta no topo de cada forma (a base dele entra 5 unidades no corpo).
    const escalaCapelo = 0.62;
    const capeloY = forma[4] + 5 - 33 * escalaCapelo;
    const capeloX = 50 - 50 * escalaCapelo;
    const topoVista = chapeu ? Math.min(0, Math.floor(capeloY - 4 * escalaCapelo - 2)) : 0;

    return `<svg viewBox="0 ${topoVista} 100 ${100 - topoVista}" class="pers__f-${formaNome}" aria-hidden="true" focusable="false">
        <g class="pers__corpo" fill="${preenchimento}" stroke="none">${forma[0](preenchimento, tom)}</g>
        <g transform="translate(${forma[1]} ${forma[2]}) scale(${forma[3]})" stroke="${PERS_TINTA}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" fill="none">${PERS_ROSTOS[expressao]}</g>
        ${chapeu ? `<g transform="translate(${capeloX.toFixed(1)} ${capeloY.toFixed(1)}) scale(${escalaCapelo})">${PERS_CAPELO}</g>` : ''}
    </svg>`;
}

function montarPersonagens(raiz) {
    (raiz || document).querySelectorAll('[data-p]:not([data-p-pronto])').forEach(function (el) {
        el.innerHTML = persSvg(el.dataset.p);
        el.dataset.pPronto = '1';
        el.setAttribute('aria-hidden', 'true');
    });

    (raiz || document).querySelectorAll('[data-conf]:not([data-p-pronto])').forEach(function (el) {
        el.innerHTML = persConfete(el.dataset.conf);
        el.dataset.pPronto = '1';
        el.setAttribute('aria-hidden', 'true');
    });
}

document.addEventListener('DOMContentLoaded', function () {
    montarPersonagens(document);
});
