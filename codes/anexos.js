/* =========================================
   ANEXOS DO CHAT (fotos, câmera e arquivos)

   Prepara o que o estudante escolhe pra ser lido pelo Up:
   - foto: reduz e converte pra JPEG aqui no aparelho (foto de celular
     tem vários MB; o Up não precisa disso pra ler um caderno);
   - PDF, Word e texto: só confere o tamanho e converte pra base64.

   Nada é enviado por aqui — quem chama manda pra API (/chat/material).
   O arquivo não fica guardado em lugar nenhum: some quando a página fecha.
========================================= */

const Anexos = (function () {

    const LADO_MAX = 1600;             // px do maior lado da foto
    const QUALIDADES = [0.82, 0.7, 0.55];
    const MAX_FOTO_BYTES = 3.5 * 1024 * 1024;
    const MAX_DOCUMENTO_BYTES = 5 * 1024 * 1024;
    const EXT_DOCUMENTO = /\.(pdf|docx|txt|md|csv)$/i;

    function ehImagem(arquivo) {
        return /^image\//.test(arquivo.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(arquivo.name || '');
    }

    function ehDocumento(arquivo) {
        return EXT_DOCUMENTO.test(arquivo.name || '');
    }

    function lerBase64(blob) {
        return new Promise(function (resolve, reject) {
            const leitor = new FileReader();

            leitor.onload = function () { resolve(String(leitor.result).split(',')[1] || ''); };
            leitor.onerror = function () { reject(new Error('Não consegui abrir esse arquivo.')); };
            leitor.readAsDataURL(blob);
        });
    }

    function carregarImagem(url) {
        return new Promise(function (resolve, reject) {
            const img = new Image();

            img.onload = function () { resolve(img); };
            img.onerror = function () {
                reject(new Error('Não consegui abrir essa foto. Tente tirar de novo ou envie em JPG ou PNG.'));
            };
            img.src = url;
        });
    }

    function paraBlob(canvas, qualidade) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', qualidade); });
    }

    function desenhar(fonte, largura, altura) {
        const canvas = document.createElement('canvas');

        canvas.width = largura;
        canvas.height = altura;

        const ctx = canvas.getContext('2d');

        // PNG com fundo transparente viraria preto em JPEG.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, largura, altura);
        ctx.drawImage(fonte, 0, 0, largura, altura);

        return canvas;
    }

    // Foto (ou quadro da câmera) -> { nome, dados (base64 do JPEG), thumb (data URL pequena) }
    async function prepararImagem(arquivo) {
        const url = URL.createObjectURL(arquivo);

        try {
            const img = await carregarImagem(url);
            const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
            let largura = Math.max(1, Math.round(img.naturalWidth * escala));
            let altura = Math.max(1, Math.round(img.naturalHeight * escala));

            let blob = null;

            for (let tentativa = 0; tentativa < QUALIDADES.length; tentativa++) {
                blob = await paraBlob(desenhar(img, largura, altura), QUALIDADES[tentativa]);

                if (blob && blob.size <= MAX_FOTO_BYTES) break;

                largura = Math.round(largura * 0.8);
                altura = Math.round(altura * 0.8);
            }

            if (!blob || blob.size > MAX_FOTO_BYTES) {
                throw new Error('Essa foto é grande demais. Tente uma foto menor.');
            }

            const lado = 96 / Math.max(img.naturalWidth, img.naturalHeight);
            const thumb = desenhar(img, Math.max(1, Math.round(img.naturalWidth * lado)), Math.max(1, Math.round(img.naturalHeight * lado)))
                .toDataURL('image/jpeg', 0.6);

            const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';

            return { nome: nome, dados: await lerBase64(blob), thumb: thumb };

        } finally {
            URL.revokeObjectURL(url);
        }
    }

    async function prepararDocumento(arquivo) {
        if (arquivo.size > MAX_DOCUMENTO_BYTES) {
            throw new Error('Esse arquivo é grande demais (limite de 5 MB). Envie só as páginas que você precisa.');
        }

        return { nome: arquivo.name, dados: await lerBase64(arquivo), thumb: null };
    }

    /* ---- câmera do computador (no celular usamos o app de câmera do aparelho) ---- */

    function cameraDisponivel() {
        return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    function celular() {
        return window.matchMedia('(pointer: coarse)').matches;
    }

    async function iniciarCamera(video) {
        const fluxo = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 } },
            audio: false
        });

        video.srcObject = fluxo;

        return fluxo;
    }

    function pararCamera(video) {
        const fluxo = video.srcObject;

        if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });

        video.srcObject = null;
    }

    async function capturarQuadro(video) {
        const largura = video.videoWidth;
        const altura = video.videoHeight;

        if (!largura || !altura) throw new Error('A câmera ainda não está pronta. Espere um instante.');

        const blob = await paraBlob(desenhar(video, largura, altura), 0.92);
        const agora = new Date();
        const hora = String(agora.getHours()).padStart(2, '0') + String(agora.getMinutes()).padStart(2, '0');

        return new File([blob], 'foto-' + hora + '.jpg', { type: 'image/jpeg' });
    }

    function mensagemDeErroDaCamera(erro) {
        if (erro && (erro.name === 'NotAllowedError' || erro.name === 'SecurityError')) {
            return 'A câmera está bloqueada. Libere o acesso no ícone de cadeado do navegador, ou escolha "Fotos".';
        }

        if (erro && erro.name === 'NotFoundError') {
            return 'Não encontrei uma câmera neste aparelho. Escolha "Fotos" para enviar uma imagem.';
        }

        return 'Não consegui abrir a câmera agora. Escolha "Fotos" para enviar uma imagem.';
    }

    return {
        ehImagem: ehImagem,
        ehDocumento: ehDocumento,
        prepararImagem: prepararImagem,
        prepararDocumento: prepararDocumento,
        cameraDisponivel: cameraDisponivel,
        celular: celular,
        iniciarCamera: iniciarCamera,
        pararCamera: pararCamera,
        capturarQuadro: capturarQuadro,
        mensagemDeErroDaCamera: mensagemDeErroDaCamera
    };

})();
