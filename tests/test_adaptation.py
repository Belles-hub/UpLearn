from app.services import adaptation


def test_prompt_base_prioriza_aprendizagem_e_nao_diagnostica():
    instrucoes = adaptation.montar_instrucoes_sistema({})

    assert "UpLearn" in instrucoes
    assert "não entregue só o resultado" in instrucoes
    assert "nunca sugira que o estudante tem algum transtorno" in instrucoes


def test_cada_modo_tem_sua_instrucao():
    for modo, marcador in [
        ("aprender", "Modo APRENDER"),
        ("praticar", "Modo PRATICAR"),
        ("revisar", "Modo REVISAR"),
        ("duvidas", "Modo TIRAR DÚVIDAS"),
        ("desafio", "Modo DESAFIO"),
    ]:
        assert marcador in adaptation.montar_instrucoes_sistema({}, modo=modo)


def test_modo_desconhecido_cai_em_tirar_duvidas():
    assert "Modo TIRAR DÚVIDAS" in adaptation.montar_instrucoes_sistema({}, modo="qualquer")


def test_preferencias_do_estudante_entram_no_prompt():
    instrucoes = adaptation.montar_instrucoes_sistema({
        "serie": "6º ano",
        "objetivo": "tirar boa nota na prova",
        "estilo_aprendizagem": "mnemonica",
        "duracao_sessao": "curta",
        "modo_uso": "audio",
    }, materia="Ciências")

    assert "6º ano" in instrucoes
    assert "tirar boa nota na prova" in instrucoes
    assert "truques de memorização" in instrucoes
    assert "sessões curtas" in instrucoes
    assert "ouvir as respostas" in instrucoes
    assert "Ciências" in instrucoes


def test_sinal_de_confusao_muda_a_abordagem_so_com_repeticao():
    uma_vez = [{"role": "user", "content": "não entendi essa parte da explicação"}]
    duas_vezes = uma_vez + [{"role": "user", "content": "continua muito complicado pra mim"}]

    assert "Mude a abordagem" not in adaptation.montar_instrucoes_sistema({}, uma_vez)
    assert "Mude a abordagem" in adaptation.montar_instrucoes_sistema({}, duas_vezes)


def test_linguagem_simples_so_entra_quando_ligada():
    assert "LINGUAGEM SIMPLES" not in adaptation.montar_instrucoes_sistema({})
    assert "LINGUAGEM SIMPLES" in adaptation.montar_instrucoes_sistema({}, linguagem_simples=True)
