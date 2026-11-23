'use strict';

/**
 * Base compartilhada pelos scripts administrativos.
 *
 * ATENÇÃO: estes scripts usam o Admin SDK, que IGNORA as regras de segurança
 * do Firestore. Quem os executa enxerga e altera os dados de qualquer usuária.
 * Por isso:
 *
 *   - rode somente numa máquina de confiança;
 *   - nunca coloque a chave de serviço no repositório do GitHub;
 *   - registre quem rodou, quando e por quê (o script já grava isso).
 *
 * LGPD, art. 37: o controlador mantém registro das operações de tratamento.
 * Decreto 8.771/2016, art. 13, III: o acesso aos registros deve ser restrito
 * e controlado.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/** Caminho da chave de serviço, vindo da variável de ambiente. */
function caminhoDaChave() {
  const caminho = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!caminho) {
    erroFatal(
      'Defina a variável GOOGLE_APPLICATION_CREDENTIALS com o caminho da chave de serviço.\n' +
      '  No Windows (PowerShell):\n' +
      '    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\chaves\\nana-admin.json"\n' +
      '  No Linux ou Mac:\n' +
      '    export GOOGLE_APPLICATION_CREDENTIALS=/caminho/nana-admin.json'
    );
  }
  if (!fs.existsSync(caminho)) {
    erroFatal(`Chave de serviço não encontrada em: ${caminho}`);
  }
  return caminho;
}

/** Inicializa o Admin SDK uma única vez. */
function iniciar() {
  caminhoDaChave();
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return { auth: admin.auth(), db: admin.firestore() };
}

/** Lê o identificador da usuária dos argumentos da linha de comando. */
function lerUid() {
  const uid = process.argv[2];
  if (!uid || uid.length < 6) {
    erroFatal(
      'Informe o identificador da usuária.\n' +
      `  Exemplo: node ${path.basename(process.argv[1])} AbC123dEf456`
    );
  }
  return uid;
}

/** Pede confirmação explícita antes de uma ação irreversível. */
function confirmar(pergunta, palavraEsperada) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${pergunta}\nDigite "${palavraEsperada}" para confirmar: `, (resposta) => {
      rl.close();
      resolve(resposta.trim() === palavraEsperada);
    });
  });
}

/**
 * Grava no diário administrativo o que foi feito, por quem e quando.
 * Fica fora do documento da usuária, porque precisa sobreviver à exclusão
 * da conta para comprovar que o pedido foi atendido.
 */
async function registrarOperacao(db, { operacao, uidAlvo, detalhe }) {
  await db.collection('_operacoes_admin').add({
    operacao,
    uidAlvo,
    detalhe: detalhe || null,
    executadoPor: process.env.OPERADOR || require('os').userInfo().username,
    executadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Apaga um documento e todas as suas subcoleções, em lotes.
 * Firestore não apaga subcoleção junto com o documento pai: se isso for
 * esquecido, os dados pessoais continuam lá depois de "excluir a conta".
 */
async function apagarComSubcolecoes(db, refDoc, tamanhoLote = 300) {
  let removidos = 0;
  const subcolecoes = await refDoc.listCollections();
  for (const sub of subcolecoes) {
    removidos += await apagarColecao(db, sub, tamanhoLote);
  }
  await refDoc.delete();
  return removidos + 1;
}

async function apagarColecao(db, refColecao, tamanhoLote) {
  let total = 0;
  while (true) {
    const pagina = await refColecao.limit(tamanhoLote).get();
    if (pagina.empty) return total;

    const lote = db.batch();
    for (const doc of pagina.docs) {
      const filhas = await doc.ref.listCollections();
      for (const filha of filhas) {
        total += await apagarColecao(db, filha, tamanhoLote);
      }
      lote.delete(doc.ref);
    }
    await lote.commit();
    total += pagina.size;

    if (pagina.size < tamanhoLote) return total;
  }
}

/**
 * Participações e mensagens de uma usuária nos chats da aba Apoio.
 * Percorre os chats um a um: são poucos, criados pela equipe, e assim não é
 * preciso índice de grupo de coleções sobre o campo "autora".
 */
async function dadosDosChats(db, uid) {
  const chats = await db.collection('chats').get();
  const resultado = [];
  for (const chat of chats.docs) {
    const membro = await chat.ref.collection('membros').doc(uid).get();
    const mensagens = await chat.ref.collection('mensagens').where('autora', '==', uid).get();
    if (!membro.exists && mensagens.empty) continue;
    resultado.push({ chat, membro, mensagens: mensagens.docs });
  }
  return resultado;
}

/**
 * Remove a usuária de todos os chats e apaga as mensagens que ela escreveu.
 * Devolve quantos documentos foram removidos.
 */
async function apagarDosChats(db, uid) {
  let total = 0;
  for (const { chat, membro, mensagens } of await dadosDosChats(db, uid)) {
    for (let i = 0; i < mensagens.length; i += 400) {
      const lote = db.batch();
      mensagens.slice(i, i + 400).forEach((m) => lote.delete(m.ref));
      await lote.commit();
    }
    total += mensagens.length;

    const lote = db.batch();
    lote.delete(chat.ref.collection('digitando').doc(uid));
    if (membro.exists) {
      lote.delete(membro.ref);
      lote.update(chat.ref, { participantes: admin.firestore.FieldValue.increment(-1) });
      total += 1;
    }
    await lote.commit();
  }
  return total;
}

function erroFatal(mensagem) {
  console.error(`\nERRO: ${mensagem}\n`);
  process.exit(1);
}

module.exports = {
  admin,
  iniciar,
  lerUid,
  confirmar,
  registrarOperacao,
  apagarComSubcolecoes,
  dadosDosChats,
  apagarDosChats,
  erroFatal,
};
