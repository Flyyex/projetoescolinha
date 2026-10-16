// Zera o contador de deposito de todas as contas.
//
// PARA QUE SERVE
// A regra de saque vai passar a exigir R$ 30 depositados. Como o contador
// totalDeposited e acumulado e nunca expira, quem ja depositou R$ 500 continua
// sacando sem nunca mais depositar. Este script zera o contador para que a
// exigencia valha a partir de agora.
//
// O QUE ESTE SCRIPT NAO FAZ
// Nao toca em investBalance, earnBalance, balance, totalWithdrawn, contratos,
// transacoes, PIX, telefone nem em nada mais. Mexe em UM campo: totalDeposited.
//
// COMO RODAR
//   node scripts/zero-contador-deposito.js              -> so mostra (dry-run)
//   node scripts/zero-contador-deposito.js --aplicar    -> faz a Alteracao
//
// SEMPRE rode o dry-run primeiro e confira os numeros.
//
// ORDEM IMPORTANTE
// Zere o contador ANTES de subir a regra para 30. Se voce subir a regra antes,
// existe uma janela em que quem ja depositou muito ainda consegue sacar.
'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../database');

const APLICAR = process.argv.includes('--aplicar');
const LIMITE = 30;
const RAIZ = path.join(__dirname, '..');

function brl(n) {
  return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
}

function linha(char) {
  return char.repeat(68);
}

(async () => {
  console.log(linha('='));
  console.log('  ZERO DO CONTADOR DE DEPOSITO');
  console.log(linha('='));
  console.log('  modo ............. ' + (APLICAR ? 'APLICAR (escreve no banco)' : 'DRY-RUN (nao escreve nada)'));
  console.log('  banco ............ ' + (db.isPostgres ? 'PostgreSQL' : 'JSON (arquivo)'));
  console.log('  campo alterado .... totalDeposited');
  console.log('  saldos ........... NAO sao tocados');
  console.log('');

  const users = await db.getAllUsers();
  if (!Array.isArray(users) || !users.length) {
    console.log('  Nenhum usuario encontrado. Abortando sem tocar em nada.');
    process.exit(1);
  }

  const alvo = users
    .map(u => ({ u, v: parseFloat(u.totalDeposited || 0) }))
    .filter(x => x.v !== 0);

  const bloqueados = alvo.filter(x => x.v >= LIMITE);
  const soma = alvo.reduce((t, x) => t + x.v, 0);

  console.log(linha('-'));
  console.log('  CONTAS');
  console.log(linha('-'));
  console.log('  total de contas ......... ' + users.length);
  console.log('  contador diferente de 0 . ' + alvo.length);
  console.log('  ja em zero (nao mudam) .. ' + (users.length - alvo.length));
  console.log('  soma a zerar ............ ' + brl(soma));
  console.log('');
  console.log('  IMPACTO NA REGRA DE SAQUE (exigencia de ' + brl(LIMITE) + '):');
  console.log('  quem passa a ficar travado ate depositar de novo .. ' + bloqueados.length);
  console.log('  quem nunca chegou em ' + brl(LIMITE) + ' (ja travado) ......... ' + (alvo.length - bloqueados.length));
  console.log('');

  if (bloqueados.length) {
    console.log(linha('-'));
    console.log('  MAIORES CONTADORES (quem mais vai sentir)');
    console.log(linha('-'));
    bloqueados.slice().sort((a, b) => b.v - a.v).slice(0, 10).forEach(x => {
      const nome = (x.u.operatorName || '(sem nome)').slice(0, 26);
      const tel = x.u.phone || '?';
      console.log('  ' + brl(x.v).padStart(12) + '  ' + nome.padEnd(26) + '  ' + tel);
    });
    if (bloqueados.length > 10) {
      console.log('  ... e mais ' + (bloqueados.length - 10) + ' conta(s).');
    }
    console.log('');
  }

  if (!APLICAR) {
    console.log(linha('='));
    console.log('  DRY-RUN: nada foi alterado.');
    console.log('  Se os numeros baterem, rode de novo com --aplicar');
    console.log(linha('='));
    process.exit(0);
  }

  // Backup antes de escrever. Sem isso nao da para desfazer.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(RAIZ, 'backups', 'contador-deposito-' + stamp + '.json');
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({
    geradoEm: new Date().toISOString(),
    motivo: 'zero do contador de deposito para a regra de saque de R$ 30',
    contas: alvo.map(x => ({
      id: x.u.id, phone: x.u.phone,
      operatorName: x.u.operatorName,
      totalDepositedAntes: x.v
    }))
  }, null, 2), 'utf-8');
  console.log('  backup gravado em: ' + path.relative(RAIZ, backupPath));
  console.log('');

  let ok = 0, falhou = 0;
  const erros = [];
  for (const x of alvo) {
    try {
      // updateUser com valor absoluto (sem sufixo Inc) substitui o campo.
      await db.updateUser(x.u.id, { totalDeposited: 0 });
      ok++;
    } catch (e) {
      falhou++;
      erros.push(x.u.id + ' (' + (x.u.phone || '?') + '): ' + e.message);
    }
  }

  console.log(linha('-'));
  console.log('  RESULTADO');
  console.log(linha('-'));
  console.log('  zeradas ................. ' + ok);
  console.log('  com falha ............... ' + falhou);
  if (erros.length) {
    console.log('');
    console.log('  FALHAS (rode de novo para pegar as que faltaram):');
    erros.slice(0, 15).forEach(e => console.log('    ' + e));
  }
  console.log('');
  console.log('  Lembret: agora suba a regra de saque para R$ 30 no painel admin');
  console.log('  (Configuracoes > deposito minimo). A comissao de indicacao sobe junto.');
  console.log(linha('='));

  process.exit(falhou ? 1 : 0);
})().catch(e => {
  console.error('\n  ERRO: ' + e.message);
  console.error('  Nada foi concluido.');
  process.exit(1);
});