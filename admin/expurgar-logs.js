'use strict';

/**
 * Apaga registros de auditoria mais antigos que o prazo de guarda.
 *
 * Marco Civil da Internet, art. 15: o provedor de aplicações deve guardar os
 * registros de acesso por 6 meses. Esse prazo é um MÍNIMO legal, mas a LGPD
 * (art. 15, I e art. 16) manda eliminar o dado quando o tratamento termina.
 * Guardar além do necessário é, por si só, um risco: é mais dado para vazar.
 *
 * Por isso o padrão aqui são 6 meses: cumpre a obrigação e não guarda a mais.
 *
 * Uso:
 *   node expurgar-logs.js            apaga registros com mais de 6 meses
 *   node expurgar-logs.js 180        mesmo que acima, em dias
 *   node expurgar-logs.js 180 teste  mostra o que seria apagado, sem apagar
 *
 * Convém rodar uma vez por mês. Na mão mesmo, ou pelo Agendador de Tarefas
 * do Windows / cron no Linux.
 */

const { iniciar, confirmar, registrarOperacao, erroFatal } = require('./_comum');

const DIAS_PADRAO = 183; // ~6 meses

async function principal() {
  const { db } = iniciar();

  const dias = Number(process.argv[2] || DIAS_PADRAO);
  if (!Number.isFinite(dias) || dias < 183) {
    erroFatal(
      'O prazo não pode ser menor que 183 dias (~6 meses).\n' +
      'O art. 15 do Marco Civil exige a guarda por esse período mínimo.'
    );
  }
  const apenasTeste = process.argv[3] === 'teste';

  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  console.log(`\nProcurando registros anteriores a ${limite.toISOString()}...`);

  // collectionGroup varre a subcoleção "auditoria" de todas as usuárias.
  const antigos = await db
    .collectionGroup('auditoria')
    .where('registradoEm', '<', limite)
    .limit(5000)
    .get();

  if (antigos.empty) {
    console.log('\nNenhum registro vencido. Nada a fazer.\n');
    return;
  }

  console.log(`Encontrados ${antigos.size} registro(s) vencido(s).`);

  if (apenasTeste) {
    console.log('\nModo teste: nada foi apagado.\n');
    return;
  }

  const ok = await confirmar(
    `\nApagar ${antigos.size} registro(s) de auditoria?`,
    'EXPURGAR'
  );
  if (!ok) {
    console.log('\nOperação cancelada. Nada foi alterado.\n');
    return;
  }

  // Em lotes: o Firestore aceita no máximo 500 operações por lote.
  let apagados = 0;
  for (let i = 0; i < antigos.docs.length; i += 400) {
    const lote = db.batch();
    for (const doc of antigos.docs.slice(i, i + 400)) {
      lote.delete(doc.ref);
    }
    await lote.commit();
    apagados += Math.min(400, antigos.docs.length - i);
    console.log(`  ${apagados}/${antigos.size}`);
  }

  await registrarOperacao(db, {
    operacao: 'EXPURGO_DE_AUDITORIA',
    uidAlvo: '(todas)',
    detalhe: `${apagados} registro(s), anteriores a ${limite.toISOString()}`,
  });

  console.log(`\n${apagados} registro(s) apagado(s).`);
  if (antigos.size === 5000) {
    console.log('O limite de 5000 por execução foi atingido. Rode de novo.\n');
  } else {
    console.log('');
  }
}

principal().catch((e) => erroFatal(e.message));
