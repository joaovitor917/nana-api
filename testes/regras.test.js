'use strict';

/**
 * Testes das regras de segurança do Firestore do Nanã.
 *
 * Seguem a estrutura do documento "Banco de Dados – Nanã" v0.2, traduzida
 * para coleções e subcoleções (ver docs/MODELO-DE-DADOS.md).
 *
 * Rodam contra o emulador local: nenhum dado real é tocado e nada é cobrado.
 *
 * Como rodar (dentro da pasta testes/):
 *   npm install
 *   npm test
 *
 * Precisa do Java instalado, porque o emulador do Firestore roda em Java.
 */

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp,
  writeBatch, increment, arrayUnion, arrayRemove, query, where, orderBy, limit,
} = require('firebase/firestore');

const MAE = 'mae_um';
const OUTRA = 'mae_dois';

let ambiente;

/** Sessão da dona, com e-mail verificado. */
function comoDona(uid = MAE) {
  return ambiente.authenticatedContext(uid, { email_verified: true }).firestore();
}

function semVerificar(uid = MAE) {
  return ambiente.authenticatedContext(uid, { email_verified: false }).firestore();
}

function deslogada() {
  return ambiente.unauthenticatedContext().firestore();
}

/** Grava sem passar pelas regras, para montar o cenário. */
async function semRegras(fn) {
  await ambiente.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

/** Cadastro mínimo válido de uma mãe. */
function mae(extras = {}) {
  return {
    status: 'ativa',
    idade: 28,
    dataCadastro: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    ...extras,
  };
}

/** Perfil de acolhimento mínimo válido. */
function perfil(extras = {}) {
  return {
    fasePosParto: 'GESTACAO',
    atualizadoEm: serverTimestamp(),
    ...extras,
  };
}

/** Registro de diário mínimo válido para a data informada. */
function registro(data, extras = {}) {
  return {
    dataRegistro: data,
    sentimento: 'CALMA',
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    ...extras,
  };
}

/** Deixa um consentimento concedido já gravado. */
async function consentir(finalidade, concedido = true, uid = MAE) {
  await semRegras((db) =>
    setDoc(doc(db, 'maes', uid, 'consentimentos', finalidade), {
      finalidade,
      concedido,
      versaoTexto: 'v1',
      registradoEm: new Date(),
    }),
  );
}

before(async function () {
  this.timeout(40000);
  ambiente = await initializeTestEnvironment({
    projectId: 'nana-testes',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

after(async () => ambiente && ambiente.cleanup());
beforeEach(async () => ambiente.clearFirestore());

// ---------------------------------------------------------------------------

describe('Mães: quem pode ler e escrever', () => {
  it('nega leitura de quem não entrou na conta', async () => {
    await assertFails(getDoc(doc(deslogada(), 'maes', MAE)));
  });

  it('nega ler o cadastro de outra mãe', async () => {
    await semRegras((db) => setDoc(doc(db, 'maes', OUTRA), { status: 'ativa' }));
    await assertFails(getDoc(doc(comoDona(MAE), 'maes', OUTRA)));
  });

  it('nega escrever no cadastro de outra mãe', async () => {
    await assertFails(setDoc(doc(comoDona(MAE), 'maes', OUTRA), mae()));
  });

  it('nega varrer a coleção de mães', async () => {
    await assertFails(getDocs(collection(comoDona(), 'maes')));
  });

  it('nega escrever sem o e-mail verificado', async () => {
    await assertFails(setDoc(doc(semVerificar(), 'maes', MAE), mae()));
  });

  it('permite criar e ler o próprio cadastro', async () => {
    await assertSucceeds(setDoc(doc(comoDona(), 'maes', MAE), mae({ nome: 'Maria' })));
    await assertSucceeds(getDoc(doc(comoDona(), 'maes', MAE)));
  });
});

describe('Mães: validação dos campos', () => {
  it('nega guardar senha no banco', async () => {
    await assertFails(
      setDoc(doc(comoDona(), 'maes', MAE), mae({ senha_hash: 'abc123' })),
    );
  });

  it('nega qualquer campo fora do modelo', async () => {
    await assertFails(setDoc(doc(comoDona(), 'maes', MAE), mae({ cpf: '000' })));
  });

  it('nega status inventado', async () => {
    await assertFails(setDoc(doc(comoDona(), 'maes', MAE), mae({ status: 'sei_la' })));
  });

  it('nega idade fora da faixa', async () => {
    await assertFails(setDoc(doc(comoDona(), 'maes', MAE), mae({ idade: 150 })));
  });

  it('nega nome acima do limite', async () => {
    await assertFails(setDoc(doc(comoDona(), 'maes', MAE), mae({ nome: 'a'.repeat(61) })));
  });

  it('nega carimbo de tempo vindo do celular', async () => {
    await assertFails(
      setDoc(doc(comoDona(), 'maes', MAE), {
        status: 'ativa',
        idade: 28,
        dataCadastro: new Date(2020, 0, 1),
        atualizadoEm: new Date(2020, 0, 1),
      }),
    );
  });

  it('exige a idade', async () => {
    await assertFails(
      setDoc(doc(comoDona(), 'maes', MAE), {
        status: 'ativa',
        dataCadastro: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      }),
    );
  });

  it('nega alterar a data de cadastro', async () => {
    const antes = new Date(Date.now() - 60000);
    await semRegras((db) =>
      setDoc(doc(db, 'maes', MAE), {
        status: 'ativa', idade: 28, dataCadastro: antes, atualizadoEm: antes,
      }),
    );
    await assertFails(
      updateDoc(doc(comoDona(), 'maes', MAE), {
        dataCadastro: serverTimestamp(), atualizadoEm: serverTimestamp(),
      }),
    );
  });

  it('permite a dona apagar a propria conta', async () => {
    await semRegras((db) => setDoc(doc(db, 'maes', MAE), { status: 'ativa' }));
    await assertSucceeds(deleteDoc(doc(comoDona(), 'maes', MAE)));
  });

  it('nega apagar a conta de outra mae', async () => {
    await semRegras((db) => setDoc(doc(db, 'maes', OUTRA), { status: 'ativa' }));
    await assertFails(deleteDoc(doc(comoDona(MAE), 'maes', OUTRA)));
  });
});

describe('Mães: limite de escrita', () => {
  it('nega duas atualizações em menos de 3 segundos', async () => {
    await semRegras((db) =>
      setDoc(doc(db, 'maes', MAE), {
        status: 'ativa', idade: 28, dataCadastro: new Date(), atualizadoEm: new Date(),
      }),
    );
    await assertFails(
      updateDoc(doc(comoDona(), 'maes', MAE), {
        nome: 'Maria', atualizadoEm: serverTimestamp(),
      }),
    );
  });

  it('permite atualizar quando já passou o intervalo', async () => {
    const antes = new Date(Date.now() - 60000);
    await semRegras((db) =>
      setDoc(doc(db, 'maes', MAE), {
        status: 'ativa', idade: 28, dataCadastro: antes, atualizadoEm: antes,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(comoDona(), 'maes', MAE), {
        nome: 'Maria', atualizadoEm: serverTimestamp(),
      }),
    );
  });
});

describe('Perfil de acolhimento', () => {
  const ref = (db, uid = MAE) => doc(db, 'maes', uid, 'perfil_acolhimento', 'principal');

  it('permite criar o próprio perfil', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), perfil({ nomeBebe: 'Helena' })));
  });

  it('exige a fase do pós-parto', async () => {
    await assertFails(
      setDoc(ref(comoDona()), { nomeBebe: 'Helena', atualizadoEm: serverTimestamp() }),
    );
  });

  it('nega fase inventada', async () => {
    await assertFails(setDoc(ref(comoDona()), perfil({ fasePosParto: 'QUALQUER' })));
  });

  it('nega ler o perfil de outra mãe', async () => {
    await semRegras((db) => setDoc(ref(db, OUTRA), { fasePosParto: 'GESTACAO' }));
    await assertFails(getDoc(ref(comoDona(MAE), OUTRA)));
  });

  it('nega um segundo perfil para a mesma mãe', async () => {
    await assertFails(
      setDoc(doc(comoDona(), 'maes', MAE, 'perfil_acolhimento', 'outro'), perfil()),
    );
  });
});

describe('Autodeclaração racial (dado sensível, LGPD art. 11)', () => {
  const ref = (db) => doc(db, 'maes', MAE, 'perfil_acolhimento', 'principal');

  it('nega gravar sem consentimento registrado', async () => {
    await assertFails(setDoc(ref(comoDona()), perfil({ autodeclaracao: 'PRETA' })));
  });

  it('nega gravar com consentimento recusado', async () => {
    await consentir('raca_autodeclarada', false);
    await assertFails(setDoc(ref(comoDona()), perfil({ autodeclaracao: 'PRETA' })));
  });

  it('permite gravar com consentimento concedido', async () => {
    await consentir('raca_autodeclarada');
    await assertSucceeds(setDoc(ref(comoDona()), perfil({ autodeclaracao: 'PRETA' })));
  });

  it('nega opção fora do escopo do app', async () => {
    await consentir('raca_autodeclarada');
    await assertFails(setDoc(ref(comoDona()), perfil({ autodeclaracao: 'BRANCA' })));
  });

  it('permite o perfil sem o campo, mesmo sem consentimento', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), perfil()));
  });
});

describe('Diário de cuidado', () => {
  const ref = (db, data = '2026-11-22', uid = MAE) =>
    doc(db, 'maes', uid, 'diario_cuidado', data);

  it('permite registrar um sentimento', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), registro('2026-11-22')));
  });

  it('exige que o id do documento seja a data', async () => {
    await assertFails(
      setDoc(doc(comoDona(), 'maes', MAE, 'diario_cuidado', 'abc'), registro('2026-11-22')),
    );
  });

  it('nega data em formato errado', async () => {
    await assertFails(setDoc(ref(comoDona(), '22-11-2026'), registro('22-11-2026')));
  });

  it('nega registro completamente vazio', async () => {
    await assertFails(
      setDoc(ref(comoDona()), {
        dataRegistro: '2026-11-22',
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      }),
    );
  });

  it('nega sentimento fora da lista', async () => {
    await assertFails(setDoc(ref(comoDona()), registro('2026-11-22', { sentimento: 'EUFORICA' })));
  });

  it('permite apagar o próprio registro', async () => {
    await semRegras((db) =>
      setDoc(doc(db, 'maes', MAE, 'diario_cuidado', '2026-11-22'), {
        dataRegistro: '2026-11-22', sentimento: 'BEM',
      }),
    );
    await assertSucceeds(deleteDoc(ref(comoDona())));
  });

  it('nega ler o diário de outra mãe', async () => {
    await semRegras((db) =>
      setDoc(doc(db, 'maes', OUTRA, 'diario_cuidado', '2026-11-22'), {
        dataRegistro: '2026-11-22', sentimento: 'BEM',
      }),
    );
    await assertFails(getDocs(collection(comoDona(MAE), 'maes', OUTRA, 'diario_cuidado')));
  });
});

describe('Sintomas (dado de saúde, LGPD art. 11)', () => {
  const ref = (db) => doc(db, 'maes', MAE, 'diario_cuidado', '2026-11-22');

  it('nega gravar sintomas sem consentimento', async () => {
    await assertFails(setDoc(ref(comoDona()), registro('2026-11-22', { sintomas: 'Cansaço' })));
  });

  it('permite gravar sintomas com consentimento concedido', async () => {
    await consentir('dados_de_saude');
    await assertSucceeds(setDoc(ref(comoDona()), registro('2026-11-22', { sintomas: 'Cansaço' })));
  });

  it('permite registrar só o sentimento, sem consentimento de saúde', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), registro('2026-11-22')));
  });
});

describe('Preferências de conteúdo', () => {
  const ref = (db, cat = 'AMAMENTACAO') =>
    doc(db, 'maes', MAE, 'preferencias_conteudo', cat);

  const pref = (categoria, ativo = true) => ({
    categoria, ativo, atualizadoEm: serverTimestamp(),
  });

  it('permite ativar uma categoria', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), pref('AMAMENTACAO')));
  });

  it('permite desativar uma categoria', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), pref('AMAMENTACAO', false)));
  });

  it('nega categoria inventada', async () => {
    await assertFails(setDoc(ref(comoDona(), 'CRIPTOMOEDA'), pref('CRIPTOMOEDA')));
  });

  it('nega categoria diferente do id do documento', async () => {
    await assertFails(setDoc(ref(comoDona(), 'AMAMENTACAO'), pref('PARTO')));
  });
});

describe('Consentimento', () => {
  const ref = (db, f = 'raca_autodeclarada') => doc(db, 'maes', MAE, 'consentimentos', f);
  const corpo = (finalidade, concedido) => ({
    finalidade, concedido, versaoTexto: 'v1', registradoEm: serverTimestamp(),
  });

  it('permite registrar e depois revogar', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), corpo('raca_autodeclarada', true)));
    await assertSucceeds(setDoc(ref(comoDona()), corpo('raca_autodeclarada', false)));
  });

  it('nega apagar o registro de consentimento', async () => {
    await consentir('raca_autodeclarada');
    await assertFails(deleteDoc(ref(comoDona())));
  });

  it('nega finalidade fora da lista', async () => {
    await assertFails(setDoc(ref(comoDona(), 'vender_dados'), corpo('vender_dados', true)));
  });

  it('nega finalidade diferente do id do documento', async () => {
    await assertFails(setDoc(ref(comoDona()), corpo('dados_de_saude', true)));
  });
});

describe('Auditoria', () => {
  const ref = (db, uid = MAE) => doc(db, 'maes', uid, 'auditoria', 'ev1');
  const evento = () => ({
    acao: 'PERFIL_ATUALIZADO',
    campos: ['nome', 'cidade'],
    registradoEm: serverTimestamp(),
    origem: 'android',
  });

  it('permite criar um registro', async () => {
    await assertSucceeds(setDoc(ref(comoDona()), evento()));
  });

  it('nega alterar um registro já gravado', async () => {
    await semRegras((db) => setDoc(ref(db), { acao: 'PERFIL_LIDO', registradoEm: new Date() }));
    await assertFails(updateDoc(ref(comoDona()), { acao: 'PERFIL_ATUALIZADO' }));
  });

  it('nega apagar um registro', async () => {
    await semRegras((db) => setDoc(ref(db), { acao: 'PERFIL_LIDO', registradoEm: new Date() }));
    await assertFails(deleteDoc(ref(comoDona())));
  });

  it('nega guardar o valor do campo, só o nome', async () => {
    await assertFails(
      setDoc(ref(comoDona()), {
        acao: 'PERFIL_ATUALIZADO',
        campos: ['nome'],
        valores: { nome: 'Maria' },
        registradoEm: serverTimestamp(),
      }),
    );
  });

  it('nega ação fora da lista', async () => {
    await assertFails(
      setDoc(ref(comoDona()), { acao: 'APAGAR_TUDO', registradoEm: serverTimestamp() }),
    );
  });

  it('nega ler a auditoria de outra mãe', async () => {
    await semRegras((db) => setDoc(ref(db, OUTRA), { acao: 'PERFIL_LIDO', registradoEm: new Date() }));
    await assertFails(getDoc(ref(comoDona(MAE), OUTRA)));
  });
});

describe('Coleções ainda não implementadas', () => {
  it('nega consultas', async () => {
    await assertFails(setDoc(doc(comoDona(), 'consultas', 'c1'), { especialidade: 'x' }));
  });

  it('nega conteúdos', async () => {
    await assertFails(getDoc(doc(comoDona(), 'conteudos', 'c1')));
  });

  it('nega conversas e mensagens', async () => {
    await assertFails(setDoc(doc(comoDona(), 'conversas', 'c1'), { tipo: 'privada' }));
    await assertFails(setDoc(doc(comoDona(), 'mensagens', 'm1'), { conteudo: 'oi' }));
  });

  it('nega qualquer coleção fora do modelo', async () => {
    await assertFails(setDoc(doc(comoDona(), 'qualquer_coisa', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(comoDona(), '_operacoes_admin', 'x')));
  });
});

// ---------------------------------------------------------------------------
// Chats da aba Apoio
// ---------------------------------------------------------------------------

const CHAT = 'chat_um';
const ENTRADA = new Date('2026-01-01T12:00:00Z');
const idMsg = (uid, n) => `${uid}_${ENTRADA.getTime()}_${n}`;

/** Chat criado pela equipe, com as participantes indicadas já dentro. */
async function chatCom(membros = [], extras = {}) {
  await semRegras(async (db) => {
    await setDoc(doc(db, 'chats', CHAT), {
      nome: 'Amamentação', participantes: membros.length, criadoEm: new Date(),
    });
    for (const uid of membros) {
      await setDoc(doc(db, 'chats', CHAT, 'membros', uid), {
        nome: null, entrouEm: ENTRADA, lidoEm: ENTRADA, ultimaMensagemEm: null, enviadas: 0,
        ...extras,
      });
    }
  });
}

/** Entrar no chat como o app faz: participante + contador, num lote só. */
function entrar(db, uid = MAE, membro = {}) {
  const lote = writeBatch(db);
  lote.set(doc(db, 'chats', CHAT, 'membros', uid), {
    nome: null, entrouEm: serverTimestamp(), lidoEm: serverTimestamp(),
    ultimaMensagemEm: null, enviadas: 0, ...membro,
  });
  lote.update(doc(db, 'chats', CHAT), { participantes: increment(1) });
  return lote.commit();
}

/** Enviar como o app faz: mensagem + contador da participante, num lote. */
function enviar(db, n, { uid = MAE, texto = 'Oi, tudo bem?', id, extras = {} } = {}) {
  const lote = writeBatch(db);
  lote.set(doc(db, 'chats', CHAT, 'mensagens', id || idMsg(uid, n)), {
    autora: uid, texto, enviadaEm: serverTimestamp(), curtidas: [], ...extras,
  });
  lote.update(doc(db, 'chats', CHAT, 'membros', uid), {
    enviadas: n, ultimaMensagemEm: serverTimestamp(), lidoEm: serverTimestamp(),
  });
  lote.delete(doc(db, 'chats', CHAT, 'digitando', uid));
  return lote.commit();
}

describe('Chats: lista e entrada', () => {
  it('permite ver a lista de chats com e-mail verificado', async () => {
    await chatCom();
    await assertSucceeds(getDocs(collection(comoDona(), 'chats')));
  });

  it('nega a lista de chats a quem não entrou na conta', async () => {
    await chatCom();
    await assertFails(getDocs(collection(deslogada(), 'chats')));
  });

  it('nega criar chat pelo aplicativo', async () => {
    await assertFails(setDoc(doc(comoDona(), 'chats', 'novo'), { nome: 'x', participantes: 0 }));
  });

  it('nega renomear um chat', async () => {
    await chatCom([MAE]);
    await assertFails(updateDoc(doc(comoDona(), 'chats', CHAT), { nome: 'Outro' }));
  });

  it('permite entrar num chat', async () => {
    await chatCom();
    await assertSucceeds(entrar(comoDona(), MAE, { nome: 'Maria' }));
  });

  it('nega entrar sem contar no número de participantes', async () => {
    await chatCom();
    await assertFails(setDoc(doc(comoDona(), 'chats', CHAT, 'membros', MAE), {
      nome: null, entrouEm: serverTimestamp(), lidoEm: serverTimestamp(), enviadas: 0,
    }));
  });

  it('nega inflar o número de participantes sem entrar', async () => {
    await chatCom();
    await assertFails(updateDoc(doc(comoDona(), 'chats', CHAT), { participantes: increment(1) }));
  });

  it('nega colocar outra pessoa dentro do chat', async () => {
    await chatCom();
    const db = comoDona(MAE);
    const lote = writeBatch(db);
    lote.set(doc(db, 'chats', CHAT, 'membros', OUTRA), {
      nome: null, entrouEm: serverTimestamp(), lidoEm: serverTimestamp(), enviadas: 0,
    });
    lote.update(doc(db, 'chats', CHAT), { participantes: increment(1) });
    await assertFails(lote.commit());
  });

  it('nega entrar sem e-mail verificado', async () => {
    await chatCom();
    await assertFails(entrar(semVerificar()));
  });

  it('permite sair do chat', async () => {
    await chatCom([MAE]);
    const db = comoDona();
    const lote = writeBatch(db);
    lote.delete(doc(db, 'chats', CHAT, 'membros', MAE));
    lote.update(doc(db, 'chats', CHAT), { participantes: increment(-1) });
    await assertSucceeds(lote.commit());
  });

  it('nega tirar outra participante do chat', async () => {
    await chatCom([MAE, OUTRA]);
    const db = comoDona(MAE);
    const lote = writeBatch(db);
    lote.delete(doc(db, 'chats', CHAT, 'membros', OUTRA));
    lote.update(doc(db, 'chats', CHAT), { participantes: increment(-1) });
    await assertFails(lote.commit());
  });
});

describe('Chats: Regra 5, só participantes leem', () => {
  it('nega ler mensagens de um chat em que não está', async () => {
    await chatCom([OUTRA]);
    await assertFails(getDocs(collection(comoDona(MAE), 'chats', CHAT, 'mensagens')));
  });

  it('nega ver quem participa de um chat em que não está', async () => {
    await chatCom([OUTRA]);
    await assertFails(getDocs(collection(comoDona(MAE), 'chats', CHAT, 'membros')));
  });

  it('permite à participante ler as mensagens', async () => {
    await chatCom([MAE, OUTRA]);
    await assertSucceeds(getDocs(collection(comoDona(MAE), 'chats', CHAT, 'mensagens')));
  });

  it('permite saber se já participa, mesmo antes de entrar', async () => {
    await chatCom();
    await assertSucceeds(getDoc(doc(comoDona(MAE), 'chats', CHAT, 'membros', MAE)));
  });

  it('fora do chat, alcança só as próprias mensagens', async () => {
    await chatCom([OUTRA]);
    await semRegras((db) => setDoc(doc(db, 'chats', CHAT, 'mensagens', 'antiga'), {
      autora: MAE, texto: 'oi', enviadaEm: new Date(), curtidas: [],
    }));
    const msgs = collection(comoDona(MAE), 'chats', CHAT, 'mensagens');
    await assertSucceeds(getDocs(query(msgs, where('autora', '==', MAE))));
    await assertFails(getDocs(query(msgs, where('autora', '==', OUTRA))));
  });
});

describe('Chats: envio de mensagens', () => {
  it('permite enviar uma mensagem', async () => {
    await chatCom([MAE]);
    await assertSucceeds(enviar(comoDona(), 1));
  });

  it('fluxo real: entra no chat e envia a primeira mensagem', async () => {
    await chatCom();
    const db = comoDona();
    await assertSucceeds(entrar(db));
    const membro = await getDoc(doc(db, 'chats', CHAT, 'membros', MAE));
    const id = `${MAE}_${membro.data().entrouEm.toMillis()}_1`;
    await assertSucceeds(enviar(db, 1, { id }));
  });

  it('nega enviar em nome de outra participante', async () => {
    await chatCom([MAE, OUTRA]);
    await assertFails(enviar(comoDona(MAE), 1, { extras: { autora: OUTRA } }));
  });

  it('nega enviar sem estar no chat', async () => {
    await chatCom([OUTRA]);
    await assertFails(enviar(comoDona(MAE), 1));
  });

  it('nega mensagem vazia', async () => {
    await chatCom([MAE]);
    await assertFails(enviar(comoDona(), 1, { texto: '   ' }));
  });

  it('nega mensagem com mais de 1000 caracteres', async () => {
    await chatCom([MAE]);
    await assertFails(enviar(comoDona(), 1, { texto: 'a'.repeat(1001) }));
  });

  it('nega campos fora do modelo na mensagem', async () => {
    await chatCom([MAE]);
    await assertFails(enviar(comoDona(), 1, { extras: { nomeAutora: 'Maria' } }));
  });

  it('nega data de envio escolhida pelo aparelho', async () => {
    await chatCom([MAE]);
    await assertFails(enviar(comoDona(), 1, { extras: { enviadaEm: new Date('2020-01-01') } }));
  });

  it('nega mensagem sem atualizar o contador de envio', async () => {
    await chatCom([MAE]);
    await assertFails(setDoc(doc(comoDona(), 'chats', CHAT, 'mensagens', idMsg(MAE, 1)), {
      autora: MAE, texto: 'oi', enviadaEm: serverTimestamp(), curtidas: [],
    }));
  });

  it('nega id de mensagem fora da sequência', async () => {
    await chatCom([MAE]);
    await assertFails(enviar(comoDona(), 1, { id: idMsg(MAE, 7) }));
  });

  it('nega várias mensagens num lote só', async () => {
    await chatCom([MAE]);
    const db = comoDona();
    const lote = writeBatch(db);
    for (const id of ['a', 'b', 'c']) {
      lote.set(doc(db, 'chats', CHAT, 'mensagens', id), {
        autora: MAE, texto: 'spam', enviadaEm: serverTimestamp(), curtidas: [],
      });
    }
    lote.update(doc(db, 'chats', CHAT, 'membros', MAE), {
      enviadas: 1, ultimaMensagemEm: serverTimestamp(),
    });
    await assertFails(lote.commit());
  });

  it('nega mais de uma mensagem a cada 2 segundos', async () => {
    await chatCom([MAE], { enviadas: 1, ultimaMensagemEm: new Date() });
    await assertFails(enviar(comoDona(), 2));
  });

  it('permite nova mensagem passado o intervalo', async () => {
    await chatCom([MAE], { enviadas: 1, ultimaMensagemEm: new Date(Date.now() - 5000) });
    await assertSucceeds(enviar(comoDona(), 2));
  });

  it('nega editar o texto de uma mensagem enviada', async () => {
    await chatCom([MAE]);
    await semRegras((db) => setDoc(doc(db, 'chats', CHAT, 'mensagens', 'm'), {
      autora: MAE, texto: 'oi', enviadaEm: new Date(), curtidas: [],
    }));
    await assertFails(updateDoc(doc(comoDona(), 'chats', CHAT, 'mensagens', 'm'), { texto: 'outro' }));
  });

  it('permite apagar a própria mensagem e nega apagar a de outra', async () => {
    await chatCom([MAE, OUTRA]);
    await semRegras(async (db) => {
      await setDoc(doc(db, 'chats', CHAT, 'mensagens', 'minha'), {
        autora: MAE, texto: 'oi', enviadaEm: new Date(), curtidas: [],
      });
      await setDoc(doc(db, 'chats', CHAT, 'mensagens', 'dela'), {
        autora: OUTRA, texto: 'oi', enviadaEm: new Date(), curtidas: [],
      });
    });
    await assertSucceeds(deleteDoc(doc(comoDona(MAE), 'chats', CHAT, 'mensagens', 'minha')));
    await assertFails(deleteDoc(doc(comoDona(MAE), 'chats', CHAT, 'mensagens', 'dela')));
  });
});

describe('Chats: curtidas', () => {
  async function mensagemDaOutra(curtidas = []) {
    await chatCom([MAE, OUTRA]);
    await semRegras((db) => setDoc(doc(db, 'chats', CHAT, 'mensagens', 'm'), {
      autora: OUTRA, texto: 'oi', enviadaEm: new Date(), curtidas,
    }));
    return doc(comoDona(MAE), 'chats', CHAT, 'mensagens', 'm');
  }

  it('permite curtir e descurtir', async () => {
    const ref = await mensagemDaOutra();
    await assertSucceeds(updateDoc(ref, { curtidas: arrayUnion(MAE) }));
    await assertSucceeds(updateDoc(ref, { curtidas: arrayRemove(MAE) }));
  });

  it('nega curtir em nome de outra pessoa', async () => {
    const ref = await mensagemDaOutra();
    await assertFails(updateDoc(ref, { curtidas: arrayUnion('mae_tres') }));
  });

  it('nega apagar a curtida de outra pessoa', async () => {
    const ref = await mensagemDaOutra(['mae_tres']);
    await assertFails(updateDoc(ref, { curtidas: [] }));
  });
});

describe('Chats: nome e leitura', () => {
  it('permite atualizar o próprio nome exibido e a hora de leitura', async () => {
    await chatCom([MAE]);
    await assertSucceeds(updateDoc(doc(comoDona(), 'chats', CHAT, 'membros', MAE), {
      nome: 'Maria', lidoEm: serverTimestamp(),
    }));
  });

  it('nega mudar o nome de outra participante', async () => {
    await chatCom([MAE, OUTRA]);
    await assertFails(updateDoc(doc(comoDona(MAE), 'chats', CHAT, 'membros', OUTRA), { nome: 'x' }));
  });

  it('nega zerar o contador de envio', async () => {
    await chatCom([MAE], { enviadas: 5 });
    await assertFails(updateDoc(doc(comoDona(), 'chats', CHAT, 'membros', MAE), { enviadas: 0 }));
  });
});

describe('Chats: quem está digitando', () => {
  it('permite marcar que está digitando', async () => {
    await chatCom([MAE]);
    await assertSucceeds(setDoc(doc(comoDona(), 'chats', CHAT, 'digitando', MAE), { em: serverTimestamp() }));
  });

  it('nega marcar em nome de outra', async () => {
    await chatCom([MAE, OUTRA]);
    await assertFails(setDoc(doc(comoDona(MAE), 'chats', CHAT, 'digitando', OUTRA), { em: serverTimestamp() }));
  });

  it('nega marcar mais de uma vez a cada 3 segundos', async () => {
    await chatCom([MAE]);
    await semRegras((db) => setDoc(doc(db, 'chats', CHAT, 'digitando', MAE), { em: new Date() }));
    await assertFails(setDoc(doc(comoDona(), 'chats', CHAT, 'digitando', MAE), { em: serverTimestamp() }));
  });

  it('nega ver quem digita num chat em que não está', async () => {
    await chatCom([OUTRA]);
    await assertFails(getDocs(collection(comoDona(MAE), 'chats', CHAT, 'digitando')));
  });
});
