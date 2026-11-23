'use strict';

/**
 * Exclui a conta de uma usuária e TODOS os seus dados.
 *
 * Atende a LGPD:
 *   art. 18, VI  — eliminação dos dados tratados com consentimento
 *   art. 16      — eliminação após o término do tratamento
 *   art. 15, III — término do tratamento quando o consentimento é revogado
 *
 * Uso:
 *   node excluir-conta.js <uid>
 *
 * A operação é IRREVERSÍVEL. Antes de apagar, o script gera uma exportação
 * de segurança, porque a titular tem direito a receber seus dados (art. 18, V)
 * e, depois da exclusão, não há de onde tirá-los.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const {
  iniciar,
  lerUid,
  confirmar,
  registrarOperacao,
  apagarComSubcolecoes,
  apagarDosChats,
  erroFatal,
} = require('./_comum');

async function principal() {
  const { auth, db } = iniciar();
  const uid = lerUid();

  let conta;
  try {
    conta = await auth.getUser(uid);
  } catch (e) {
    erroFatal(`Nenhuma conta encontrada com o identificador ${uid}.`);
  }

  console.log('\n--- Conta a ser excluída ---');
  console.log(`  identificador : ${conta.uid}`);
  console.log(`  e-mail        : ${conta.email || '(sem e-mail)'}`);
  console.log(`  criada em     : ${conta.metadata.creationTime}`);
  console.log('\nSerão apagados: o perfil, os consentimentos, o histórico,');
  console.log('os registros de auditoria, as mensagens nos chats e a própria');
  console.log('conta de acesso.');
  console.log('A operação NÃO pode ser desfeita.\n');

  const ok = await confirmar('Confirma a exclusão?', 'EXCLUIR');
  if (!ok) {
    console.log('\nOperação cancelada. Nada foi alterado.\n');
    return;
  }

  // Cópia de segurança antes de apagar.
  console.log('\nGerando exportação de segurança...');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'exportar-dados.js'), uid], {
      stdio: 'inherit',
    });
  } catch (e) {
    erroFatal('A exportação falhou. A exclusão foi interrompida por segurança.');
  }

  // 1. Dados no Firestore, incluindo subcoleções e chats.
  let removidos = await apagarDosChats(db, uid);
  const refPerfil = db.collection('maes').doc(uid);
  const perfil = await refPerfil.get();
  if (perfil.exists) {
    removidos += await apagarComSubcolecoes(db, refPerfil);
  }

  // 2. Conta de acesso. Isso invalida as sessões abertas no celular.
  await auth.deleteUser(uid);

  // 3. Registro da operação. Guarda só o identificador, nunca os dados
  //    apagados: senão a "exclusão" viraria uma cópia em outro lugar.
  await registrarOperacao(db, {
    operacao: 'EXCLUSAO_DE_CONTA',
    uidAlvo: uid,
    detalhe: `${removidos} documento(s) removido(s)`,
  });

  console.log(`\nConta excluída. ${removidos} documento(s) removido(s).`);
  console.log('As sessões abertas no aplicativo deixam de funcionar em até 1 hora.\n');
}

principal().catch((e) => erroFatal(e.message));
