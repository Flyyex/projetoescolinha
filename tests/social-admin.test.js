//-dotenv primeiro: o teste precisa da MESMA ADMIN_KEY que o servidor filho vai
// ler do .env. Sem isto o teste usaria 'devkey' e o servidor usaria a chave
// real — todas as rotas admin responderiam 401 e o teste passaria errado.
// (O `//-` no inicio evita que o shell trata a linha como comando.)
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const { criarBancoTemporario, limparBancoTemporario } = require('./helpers/banco-temp');
const DB = criarBancoTemporario('admin');
const PORT = 3302;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const ANTIGA = () => new Date(Date.now() - 5 * DIA).toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || 'devkey';

let token = null, uid = null, srv = null;

function estado() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  d.transactions = (d.transactions || []).filter(t => t.userId !== uid);
  d.users = d.users.map(u => u.id === uid ? {
    ...u, totalDeposited: 30, investBalance: 0, earnBalance: 0, balance: 0, createdAt: ANTIGA()
  } : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function plantarPosts(fn) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  for (const p of fn()) d.social_posts.push(Object.assign({ userId: uid, reward: 0 }, p));
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function saldos() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const u = d.users.find(x => x.id === uid) || {};
  return {
    invest: parseFloat(u.investBalance || 0),
    earn: parseFloat(u.earnBalance || 0),
    total: parseFloat(u.balance || 0)
  };
}
function criarPost(id) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = d.social_posts || [];
  d.social_posts.push({
    id: 'SP' + id, userId: uid, videoUrl: 'https://www.tiktok.com/@zz/video/' + id,
    urlHash: 'h' + id, network: 'tiktok', handle: '@zz', status: 'pending',
    rejectReason: null, reward: 0, createdAt: ANTIGA(), reviewedAt: null
  });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
  return 'SP' + id;
}

before(async () => {
  srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      DB_FILE: DB,
      PORT: String(PORT), TELEGRAM_BOT_TOKEN: 'fake:token', ADMIN_TELEGRAM_CHAT_ID: '1'
    }),
    stdio: 'ignore'
  });
  await wait(17000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550002', password: '12345678', confirmPassword: '12345678', operatorName: 'ZZ Social Admin ZZ' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  limparBancoTemporario(DB);
});

const A = () => ({ 'Content-Type': 'application/json', 'x-admin-key': KEY });
const aprovar = (id) => fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() }).then(r => r.json());
const adminGet = (p) => fetch(B + '/api/admin/social/' + p, { headers: A() }).then(r => r.json());

describe('aprovar credita R$ 1,00 no saldo Investir', () => {
  it('paga exatamente 1,00 e registra no extrato', async () => {
    estado();
    const id = criarPost('p1');
    const antes = saldos();
    const r = await aprovar(id);
    assert.equal(r.ok, true, JSON.stringify(r));
    const dep = saldos();
    assert.equal(Math.round((dep.invest - antes.invest) * 100) / 100, 1, 'invest +1,00');
    assert.equal(Math.round((dep.total - antes.total) * 100) / 100, 1, 'balance tambem +1,00');
    assert.equal(dep.earn, antes.earn, 'NAO pode cair em earn (que e sacavel)');

    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const tx = (d.transactions || []).find(t => t.type === 'commission' && parseFloat(t.amount) === 1 && t.userId === uid);
    assert.ok(tx, 'deveria existir transacao de comissao de 1,00');
  });

  it('aprovar DUAS vezes paga uma so', async () => {
    estado();
    const id = criarPost('p2');
    await aprovar(id);
    const meio = saldos();
    const r2 = await aprovar(id);
    assert.equal(r2.ok, false);
    assert.equal(r2.alreadyDone, true);
    const fim = saldos();
    assert.equal(Math.round((fim.invest - meio.invest) * 100) / 100, 0, 'a segunda nao pode pagar');
  });

  it('aprovar em PARALELO paga uma so', async () => {
    estado();
    const id = criarPost('p3');
    const antes = saldos();
    const rs = await Promise.all([aprovar(id), aprovar(id)]);
    const dep = saldos();
    assert.equal(Math.round((dep.invest - antes.invest) * 100) / 100, 1,
      'pagou ' + (dep.invest - antes.invest) + ' (tem que ser 1)');
    assert.equal(rs.filter(x => x.ok).length, 1, 'exatamente um ok');
    assert.equal(rs.filter(x => x.alreadyDone).length, 1, 'o outro sabe que ja foi analisado');
  });

  it('nao paga quem nao existe', async () => {
    estado();
    const r = await aprovar('SP_inexistente_zz');
    assert.equal(r.ok, false);
    assert.equal(saldos().invest, 0, 'nao pode creditar em lugar nenhum');
  });

  it('recusar nao paga nada', async () => {
    estado();
    const id = criarPost('p4');
    const r = await (await fetch(B + '/api/admin/social/' + id + '/reject', {
      method: 'POST', headers: A(), body: JSON.stringify({ reason: 'link não abre' })
    })).json();
    assert.equal(r.ok, true);
    assert.equal(saldos().invest, 0);
  });

  it('recusar depois de aprovado nao desconta (dinheiro ja foi liberado)', async () => {
    estado();
    const id = criarPost('p5');
    await aprovar(id);
    const depois = saldos();
    const r = await (await fetch(B + '/api/admin/social/' + id + '/reject', {
      method: 'POST', headers: A(), body: JSON.stringify({ reason: 'mudei de ideia' })
    })).json();
    assert.equal(r.ok, false);
    assert.equal(saldos().invest, depois.invest, 'saldo nao muda');
  });
});

describe('fila, stats e seguranca', () => {
  it('fila traz quem enviou e quantos ja aprovou', async () => {
    estado();
    criarPost('q1');
    const r = await adminGet('pending');
    assert.ok(Array.isArray(r.posts));
    const meu = r.posts.find(p => p.userId === uid);
    assert.ok(meu, 'meu post tem que estar na fila');
    assert.equal(typeof meu.operatorName, 'string');
    assert.equal(typeof meu.approvedBefore, 'number');
    assert.equal(r.reward, 1);
  });

  it('stats mostra o total pago no mes', async () => {
    estado();
    const antes = await adminGet('pending');
    const id = criarPost('q2');
    await aprovar(id);
    const depois = await adminGet('pending');
    assert.equal(depois.stats.paidTotal - antes.stats.paidTotal, 1, 'total subiu 1,00');
    assert.ok(depois.stats.paidThisMonth >= 1, 'total do mes subiu');
    assert.equal(typeof depois.stats.pending, 'number');
    assert.equal(typeof depois.stats.approvedCount, 'number');
  });

  it('fila so mostra pendente', async () => {
    estado();
    criarPost('q3');
    const id = criarPost('q4');
    await aprovar(id);
    const r = await adminGet('pending');
    assert.ok(!r.posts.find(p => p.id === id), 'aprovado nao fica na fila');
    assert.ok(r.posts.find(p => p.id === 'SPq3'), 'o outro continua');
  });

  it('com chave responde, sem chave nao — e nao pode ser o CRMRespondendo', async () => {
    // Cuidado: /api/* sem rota do admin cai no crmRouter, que responde 401
    // "CRM: autenticacao necessaria". Se eu so afirmasse "401 ou 403", este
    // teste passaria por acidente mesmo sem as rotas existindo. Por isso exijo
    // que COM a chave a resposta NAO seja de bloqueio, e que o corpo da
    // negacao nao seja o do CRM.
    estado();
    criarPost('s1');

    const semChave = await fetch(B + '/api/admin/social/pending', {
      headers: { 'Content-Type': 'application/json' }
    });
    assert.ok(semChave.status === 401 || semChave.status === 403,
      'sem chave tem que negar, veio ' + semChave.status);
    const corpoNegado = await semChave.text();
    assert.ok(!/CRM/i.test(corpoNegado),
      'negacao veio do CRM, nao do admin — a rota pode nem existir: ' + corpoNegado);

    const comChave = await fetch(B + '/api/admin/social/pending', { headers: A() });
    assert.equal(comChave.status, 200, 'com a chave a fila tem que abrir: ' + comChave.status);
    const corpoOk = await comChave.json();
    assert.ok(Array.isArray(corpoOk.posts), 'com chave precisa devolver a lista');
  });

  it('aprovar sem chave nao credita nada', async () => {
    estado();
    const id = criarPost('s2');
    const antes = saldos();
    const res = await fetch(B + '/api/admin/social/' + id + '/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    assert.ok(res.status === 401 || res.status === 403, 'veio ' + res.status);
    assert.equal(saldos().invest, antes.invest, 'nao pode ter creditado sem chave');
  });

  it('chave errada e negada', async () => {
    const res = await fetch(B + '/api/admin/social/pending', {
      headers: { 'Content-Type': 'application/json', 'x-admin-key': 'chave-errada-aa' }
    });
    assert.ok(res.status === 401 || res.status === 403, 'respondeu ' + res.status);
  });
});