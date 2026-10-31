/* =========================================
   SERVICE WORKER — deixa o app instalável e abrir sem internet

   Só guarda os arquivos estáticos do próprio site. Chamadas à API e a
   outros domínios passam direto (dados da pessoa nunca ficam em cache).
   Para publicar uma versão nova dos arquivos, aumente VERSAO.
========================================= */

const VERSAO = 'uplearn-v1';

const BASICOS = [
    'inicio.html', 'estudos.html', 'tutora.html', 'quiz.html', 'revisao.html',
    'desempenho.html', 'perfil.html', 'acessibilidade.html',
    'uplearn.css', 'acess.js', 'config.js', 'sessao.js', 'app.js', 'personagens.js',
    'revisao.js', 'quiz.js', 'inicio.js', 'img/logo.png', 'img/icone-192.png', 'img/icone-512.png'
];

self.addEventListener('install', function (evento) {
    evento.waitUntil(
        caches.open(VERSAO)
            .then(function (cache) { return cache.addAll(BASICOS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (evento) {
    evento.waitUntil(
        caches.keys()
            .then(function (chaves) {
                return Promise.all(chaves.filter(function (c) { return c !== VERSAO; }).map(function (c) { return caches.delete(c); }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

// Rede primeiro (sempre a versão mais nova); sem rede, usa o que está guardado.
self.addEventListener('fetch', function (evento) {
    const pedido = evento.request;

    if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

    evento.respondWith(
        fetch(pedido)
            .then(function (resposta) {
                const copia = resposta.clone();

                if (resposta.ok) caches.open(VERSAO).then(function (cache) { cache.put(pedido, copia); });

                return resposta;
            })
            .catch(function () { return caches.match(pedido); })
    );
});
