'use strict';

/**
 * Cria um chat na aba Apoio.
 *
 * O aplicativo não cria chats: quem decide os grupos e os nomes é a equipe.
 * As regras do Firestore bloqueiam a criação pelo celular.
 *
 * Uso:
 *   node criar-chat.js "Nome do chat"
 *
 * Para ver os chats que já existem:
 *   node criar-chat.js --listar
 */

const { iniciar, registrarOperacao, erroFatal, admin } = require('./_comum');

async function principal() {
  const { db } = iniciar();
  const argumento = (process.argv[2] || '').trim();

  if (argumento === '--listar') {
    const chats = await db.collection('chats').orderBy('criadoEm').get();
    if (chats.empty) console.log('\nNenhum chat criado ainda.\n');
    chats.forEach((c) => {
      console.log(`  ${c.id}  ${c.data().nome}  (${c.data().participantes} participantes)`);
    });
    return;
  }

  if (!argumento) {
    erroFatal('Informe o nome do chat.\n  Exemplo: node criar-chat.js "Amamentação"');
  }
  if (argumento.length > 60) {
    erroFatal('O nome do chat pode ter no máximo 60 caracteres.');
  }

  const repetido = await db.collection('chats').where('nome', '==', argumento).limit(1).get();
  if (!repetido.empty) {
    erroFatal(`Já existe um chat chamado "${argumento}".`);
  }

  const ref = await db.collection('chats').add({
    nome: argumento,
    participantes: 0,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  await registrarOperacao(db, { operacao: 'CHAT_CRIADO', uidAlvo: null, detalhe: ref.id });
  console.log(`\nChat "${argumento}" criado (${ref.id}).\n`);
}

principal().catch((e) => erroFatal(e.message));
