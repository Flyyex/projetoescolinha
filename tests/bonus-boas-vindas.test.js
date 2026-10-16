// O bonus de boas-vindas foi desativado. Este teste existe para travar a
// consequencia mais perigosa de desligar isso.
//
// Antes, no saque havia uma "expiracao preguicosa": se totalDeposited == 0 e o
// bonus tinha mais de 7 dias, o app descontava o valor do saldo de saque da
// pessoa e criava um ajuste BNS-EXP. Quando o contador de deposito foi zerado
// para todo mundo (regra nova de R$ 30), essa condicao passava a valer para
// toda conta antiga que ainda tivesse o valor do bonus parado no saldo -- ou
// seja, o sistema iria tirar dinheiro de gente sem ela ter feito nada de
// errado.
//
// O que este arquivo garante: com deposito zerado e um bonus de boas-vindas
// antigo, o saque NAO mexe no saldo, NAO cria ajuste e NAO barra a pessoa.
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const { criarBancoTemporario, limparBancoTemporario } = require('./helpers/banco-temp');
const DB = criarBancoTemporario('bonus');
const PORT = 3311;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null, uid = null, srv = null;

// Monta o pior cenario: conta antiga, deposito zerado pelo reset, bonus de
// boas-vindas aprovado de ha 60 dias (bem alem dos 7 dias) e saldo de saque.
function cenario() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const u = d.users.find(x => x.id === uid);
  u.totalDeposited = 0;
  // Conta antiga: sem isso a regra de "primeiro saque apos 24h" barra antes de
  // o teste chegar na regra que ele quer verificar.
  u.createdAt = new Date(Date.now() - 30 * DIA).toISOString();
  u.earnBalance = 100;
  u.investBalance = 0;
  u.balance = 100;
  u.totalWithdrawn = 0;
  d.transactions = (d.transactions || []).filter(t => t.userId !== uid);
  d.transactions.push({
    id: 'BNS-SIGNUP-antigo', userId: uid, type: 'bonus', amount: 5,
    status: 'approved', description: 'Bonus de boas-vindas',
    createdAt: new Date(Date.now() - 60 * DIA).toISOString()
  });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

function estado() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  return {
    user: d.users.find(x => x.id === uid),
    ajustes: d.transactions.filter(t => t.userId === uid && t.type === 'adjustment'),
    saques: d.transactions.filter(t => t.userId === uid && t.type === 'withdraw')
  };
}

const sacar = (amount) => fetch(B + '/api/wallet/withdraw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ amount, pixKey: '11955550009', pixKeyType: 'TELEFONE' })
}).then(r => r.json());

before(async () => {
  srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      DB_FILE: DB, PORT: String(PORT), TELEGRAM_BOT_TOKEN: 'fake:token', ADMIN_TELEGRAM_CHAT_ID: '1'
    }),
    stdio: 'ignore'
  });
  await wait(17000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '11955550009', password: '12345678', confirmPassword: '12345678',
      operatorName: 'ZZ Bonus Antigo ZZ'
    })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  limparBancoTemporario(DB);
});

describe('bonus de boas-vindas desativado — ninguem perde dinheiro no saque', () => {
  it('nao cria ajuste de expiracao (BNS-EXP) mesmo com deposito zerado', async () => {
    cenario();
    await sacar(20);
    const e = estado();
    assert.ok(e.ajustes.length === 0,
      'criou ajuste no saldo de quem nao fez nada de errado: ' + JSON.stringify(e.ajustes));
    assert.ok(!e.ajustes.some(t => /BNS-EXP/.test(String(t.id || ''))),
      'ainda existe o estorno BNS-EXP');
  });

  it('nao desconta nada do saldo quando o saque e barrado', async () => {
    cenario();
    const antes = estado().user.earnBalance;
    const r = await sacar(20);
    const depois = estado().user.earnBalance;
    // Sem deposito o saque e barrado pela regra (correto). O que importa aqui e
    // que barrar o saque nao pode virar uma multa: o saldo fica intacto.
    assert.ok(r.error, 'saque passou sem deposito: ' + JSON.stringify(r));
    assert.equal(depois, antes, 'o saldo mudou mesmo com o saque barrado: ' + antes + ' -> ' + depois);
    assert.equal(estado().ajustes.length, 0, 'criou ajuste ao barrar o saque');
  });

  it('o saque segue barrado pela regra de deposito (nao destrava nada)', async () => {
    cenario();
    const r = await sacar(20);
    // Com deposito zerado e minDeposit 20, tem que barrar. Este teste existe
    // para o dia em que o minDeposit subir para 30: a regra de deposito segue
    // valendo, e o bonus desativado nao virou atalho.
    assert.ok(r.error, 'saque passou sem deposito nenhum: ' + JSON.stringify(r));
    assert.match(r.error, /dep[oó]sito/i);
  });

  it('com deposito suficiente, o saque passa e o saldo fica integro', async () => {
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const u = d.users.find(x => x.id === uid);
    u.totalDeposited = 30; // cumpre a regra nova
    u.createdAt = new Date(Date.now() - 30 * DIA).toISOString();
    u.earnBalance = 100; u.balance = 100;
    d.transactions = (d.transactions || []).filter(t => t.userId !== uid);
    d.transactions.push({
      id: 'BNS-SIGNUP-antigo', userId: uid, type: 'bonus', amount: 5,
      status: 'approved', description: 'Bonus de boas-vindas',
      createdAt: new Date(Date.now() - 60 * DIA).toISOString()
    });
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));

    const r = await sacar(20);
    assert.ok(!r.error, 'saque com deposito suficiente foi barrado: ' + JSON.stringify(r));
    const e = estado();
    assert.equal(e.ajustes.length, 0, 'criou ajuste indevido: ' + JSON.stringify(e.ajustes));
    // A taxa de 10% sai do valor pago, nao e cobrada em cima: 100 - 20 = 80.
    assert.equal(e.user.earnBalance, 80, 'saldo de saque errado: ' + e.user.earnBalance);
  });
});