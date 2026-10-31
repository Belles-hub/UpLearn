/* =========================================
   NOTIFICAÇÃO EM BANNER — substitui alert()

   alert() nativo trava a página inteira, não é estilizável, não respeita
   o tamanho de fonte nem o contraste que a própria pessoa configurou no
   painel de acessibilidade, e sempre aparece no mesmo canto do sistema
   operacional — não perto de onde ela está olhando. Isto substitui por
   um banner de verdade, dentro da página, logo acima do botão que ela
   acabou de usar.

   Cada tela que usa isto precisa ter, no HTML, um <div> vazio com o id
   passado como "containerId" (ver notificacao.css pro estilo).
========================================= */

const CU_ICONE_NOTIFICACAO = {
    erro: '⚠️',
    sucesso: '✅',
    aviso: '⚠️',
    info: 'ℹ️'
};

const CU_TIMEOUTS_NOTIFICACAO = {};


// tipo: 'erro' (padrão) | 'sucesso' | 'aviso' | 'info'
function mostrarNotificacao(containerId, mensagem, tipo) {
    tipo = tipo || 'erro';

    const container = document.getElementById(containerId);

    if (!container) {
        // Nunca deixa o aviso sumir: se a tela esqueceu de criar o
        // container, isto cai pro alert() como rede de segurança.
        alert(mensagem);
        return;
    }

    // Erro interrompe a leitura de tela na hora (assertive); o resto
    // espera a pessoa terminar o que estava lendo (polite) — mesmo
    // critério que um leitor de tela usa pra decidir se interrompe.
    container.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    container.setAttribute('aria-live', tipo === 'erro' ? 'assertive' : 'polite');

    container.innerHTML = '';

    const banner = document.createElement('div');
    banner.className = 'cu-notificacao cu-notificacao--' + tipo;

    const icone = document.createElement('span');
    icone.className = 'cu-notificacao-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = CU_ICONE_NOTIFICACAO[tipo] || CU_ICONE_NOTIFICACAO.info;

    const texto = document.createElement('span');
    texto.className = 'cu-notificacao-texto';
    texto.textContent = mensagem;

    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'cu-notificacao-fechar';
    fechar.setAttribute('aria-label', 'Fechar aviso');
    fechar.innerHTML = '&times;';
    fechar.addEventListener('click', function () {
        esconderNotificacao(containerId);
    });

    banner.appendChild(icone);
    banner.appendChild(texto);
    banner.appendChild(fechar);
    container.appendChild(banner);

    // Leva o olhar (e o scroll) até o aviso — em formulário longo ele
    // pode nascer fora da área visível da tela.
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

    clearTimeout(CU_TIMEOUTS_NOTIFICACAO[containerId]);

    // Erro fica até a pessoa fechar ou tentar de novo — ela pode estar
    // lendo devagar (leitor de tela, Libras). Sucesso/aviso/info somem
    // sozinhos, pra não acumular banner de coisas que já deram certo.
    if (tipo !== 'erro') {
        CU_TIMEOUTS_NOTIFICACAO[containerId] = setTimeout(function () {
            esconderNotificacao(containerId);
        }, 6000);
    }
}


function esconderNotificacao(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    clearTimeout(CU_TIMEOUTS_NOTIFICACAO[containerId]);
    container.innerHTML = '';
}
