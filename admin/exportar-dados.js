'use strict';

/**
 * Exporta TODOS os dados de uma usuária num arquivo JSON legível.
 *
 * Atende a LGPD:
 *   art. 18, II  — confirmação da existência e acesso aos dados
 *   art. 18, V   — portabilidade, em formato aberto e interoperável
 *   art. 9º      — transparência sobre o que é tratado
 *
 * Uso:
 *   node exportar-dados.js <uid>
 *
 * O arquivo sai em ./exportacoes/ e contém dados pessoais. Entregue apenas
 * à própria titular, por canal seguro, e apague a cópia local depois.
 */

const fs = require('fs');
const path = require('path');
const { iniciar, lerUid, registrarOperacao, dadosDosChats, erroFatal } = require('./_comum');

async function principal() {
  const { auth, db } = iniciar();
  const uid = lerUid();

  let conta;
  try {
    conta = await auth.getUser(uid);
  } catch (e) {
    erroFatal(`Nenhuma conta encontrada com o identificador ${uid}.`);
  }

  const refPerfil = db.collection('maes').doc(uid);
  const perfil = await refPerfil.get();

  if (!perfil.exists) {
    console.warn('Aviso: a conta existe, mas não há perfil gravado no Firestore.');
  }

  // Subcoleções: consentimentos, histórico e auditoria.
  const subcolecoes = {};
  for (const sub of await refPerfil.listCollections()) {
    const docs = await sub.get();
    subcolecoes[sub.id] = docs.docs.map((d) => ({ id: d.id, ...converter(d.data()) }));
  }

  // Chats: em quais participa e o que escreveu. As mensagens das outras
  // participantes não entram: são dados delas, não desta titular.
  const chats = (await dadosDosChats(db, uid)).map(({ chat, membro, mensagens }) => ({
    chat: chat.data().nome,
    participacao: membro.exists ? converter(membro.data()) : null,
    mensagensEscritas: mensagens.map((m) => converter({
      texto: m.data().texto,
      enviadaEm: m.data().enviadaEm,
      curtidas: (m.data().curtidas || []).length,
    })),
  }));

  const pacote = {
    geradoEm: new Date().toISOString(),
    aviso:
      'Este arquivo contém seus dados pessoais no aplicativo Nanã. ' +
      'Guarde-o em local seguro e não compartilhe com terceiros.',
    conta: {
      identificador: conta.uid,
      email: conta.email || null,
      emailVerificado: conta.emailVerified,
      criadaEm: conta.metadata.creationTime,
      ultimoAcesso: conta.metadata.lastSignInTime,
    },
    perfil: perfil.exists ? converter(perfil.data()) : null,
    ...subcolecoes,
    chats,
  };

  const pasta = path.join(__dirname, 'exportacoes');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `nana-${uid}-${Date.now()}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(pacote, null, 2), 'utf8');

  await registrarOperacao(db, {
    operacao: 'EXPORTACAO_DE_DADOS',
    uidAlvo: uid,
    detalhe: path.basename(arquivo),
  });

  console.log(`\nDados exportados para:\n  ${arquivo}\n`);
  console.log('Entregue somente à titular e apague esta cópia depois.\n');
}

/** Converte Timestamps do Firestore para texto legível. */
function converter(valor) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(converter);
  if (typeof valor === 'object') {
    const saida = {};
    for (const [chave, v] of Object.entries(valor)) saida[chave] = converter(v);
    return saida;
  }
  return valor;
}

principal().catch((e) => erroFatal(e.message));
