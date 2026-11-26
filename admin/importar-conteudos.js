'use strict';

/**
 * Carrega os conteúdos educativos de dados/conteudos.json no Firestore.
 *
 * Cada conteúdo vira o documento conteudos/{id}. Rodar de novo atualiza os
 * mesmos documentos (não duplica). A data de publicação original é mantida.
 *
 * Uso:
 *   node importar-conteudos.js
 *
 * Regra 6 do documento do banco: só aparece no app o que tiver
 * status "publicado". Para tirar um conteúdo do ar sem apagar, mude o status
 * dele para "rascunho" no JSON e rode de novo.
 */

const fs = require('fs');
const path = require('path');
const { iniciar, registrarOperacao, erroFatal, admin } = require('./_comum');

const ARQUIVO = path.join(__dirname, '..', 'dados', 'conteudos.json');
const OBRIGATORIOS = ['id', 'titulo', 'descricao', 'texto', 'categoria', 'tipo', 'status'];
const STATUS = ['publicado', 'rascunho'];

function validar(c, i) {
  for (const campo of OBRIGATORIOS) {
    if (typeof c[campo] !== 'string' || !c[campo].trim()) {
      erroFatal(`Conteúdo nº ${i + 1}: o campo "${campo}" está vazio ou faltando.`);
    }
  }
  if (!/^[a-z0-9-]{3,80}$/.test(c.id)) {
    erroFatal(`Conteúdo "${c.id}": o id só pode ter letras minúsculas, números e hífen.`);
  }
  if (!STATUS.includes(c.status)) {
    erroFatal(`Conteúdo "${c.id}": status deve ser ${STATUS.join(' ou ')}.`);
  }
  if (!Array.isArray(c.fontes) || c.fontes.length === 0) {
    erroFatal(`Conteúdo "${c.id}": todo conteúdo de saúde precisa de pelo menos uma fonte.`);
  }
}

async function principal() {
  const { db } = iniciar();
  const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  if (!Array.isArray(lista) || lista.length === 0) erroFatal('dados/conteudos.json está vazio.');

  const ids = new Set();
  lista.forEach((c, i) => {
    validar(c, i);
    if (ids.has(c.id)) erroFatal(`Id repetido: ${c.id}`);
    ids.add(c.id);
  });

  const lote = db.batch();
  for (const c of lista) {
    const ref = db.collection('conteudos').doc(c.id);
    const atual = await ref.get();
    const { id, ...dados } = c;
    lote.set(ref, {
      ...dados,
      dataPublicacao:
        (atual.exists && atual.data().dataPublicacao) ||
        admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ${atual.exists ? 'atualizado' : 'novo      '}  ${c.id}`);
  }
  await lote.commit();

  await registrarOperacao(db, {
    operacao: 'CONTEUDOS_IMPORTADOS',
    uidAlvo: null,
    detalhe: `${lista.length} conteúdo(s)`,
  });
  console.log(`\n${lista.length} conteúdo(s) gravado(s) em "conteudos".\n`);
}

principal().catch((e) => erroFatal(e.message));
