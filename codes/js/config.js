/* =========================================
   CONFIGURAÇÃO — URL BASE DA API

   Um lugar só. Detecta sozinho se está rodando local (localhost/127.0.0.1)
   ou já publicado, e usa a URL certa em cada caso.

   Precisa carregar ANTES de sessao.js e do script de cada página.
========================================= */

const API_BASE_URL = (function () {
    // "file:" cobre quem abre o .html direto no navegador (clique duplo,
    // sem servidor local) — nesse caso hostname vem vazio, não "localhost".
    const rodandoLocal =
        window.location.protocol === "file:" ||
        ["localhost", "127.0.0.1"].includes(window.location.hostname);

    if (rodandoLocal) {
        return "http://127.0.0.1:8000";
    }

    // URL do serviço da API no Render (render.yaml). Se o serviço for
    // renomeado ou recriado, atualize aqui também.
    return "https://uplearn-backend-qk2e.onrender.com";
})();
