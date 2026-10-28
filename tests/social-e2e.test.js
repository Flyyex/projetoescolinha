// Ponta a ponta do Programa Social: o caminho real, do operador ate o saldo.
// Este arquivo NAO repete o que social-routes e social-admin ja provam caso a
// caso. Ele prova a TRAVESSIA: o que o operador ve, o que o admin ve e o que o
// saldo faz, no mesmo fluxo, sem estado herdado entre testes.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const { criarBancoTemporario, limparBancoTemporario } = require('./helpers/banco-temp');

const DB = criarBancoTemporario('e2e');
const PORT = 3303;
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
function saldos() {
  const u = JSON.parse(fs.readFileSync(DB, 'utf8')).users.find(x => x.id === uid) || {};
  return { invest: parseFloat(u.investBalance || 0), earn: parseFloat(u.earnBalance || 0), total: parseFloat(u.balance || 0) };
}

const OP = { 'Content-Type': 'application/json' };
const ADM = { 'Content-Type': 'application/json', 'x-admin-key': KEY };
const op = {
  get: (p) => fetch(B + '/api/social' + p, { headers: Object.assign({ Authorization: 'Bearer ' + token }, OP) }).then(r => r.json()),
  post: (p, body) => fetch(B + '/api/social' + p, { method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + token }, OP), body: JSON.stringify(body) }).then(r => r.json())
};
const admin = {
  fila: () => fetch(B + '/api/admin/social/pending', { headers: ADM }).then(r => r.json()),
  aprovar: (id) => fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: ADM }).then(r => r.json()),
  recusar: (id, reason) => fetch(B + '/api/admin/social/' + id + '/reject', { method: 'POST', headers: ADM, body: JSON.stringify({ reason }) }).then(r => r.json())
};

const URL_VIDEO = 'https://www.tiktok.com/@joana/video/770001';

before(async () => {
  srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      PORT: String(PORT), DB_FILE: DB,
      TELEGRAM_BOT_TOKEN: 'fake:token', ADMIN_TELEGRAM_CHAT_ID: '1', ADMIN_KEY: 'test_admin_key_12345'
    }),
    stdio: 'ignore'
  });
  await wait(17000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550003', password: '12345678', confirmPassword: '12345678', operatorName: 'Joana E2E' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  limparBancoTemporario(DB);
});

describe('travessia completa: o operador posta, o admin aprova, o saldo muda', () => {
  it('fluxo feliz inteiro', async () => {
    estado();

    // 1. o operador abre o programa e ve o material
    const info = await op.get('/info');
    assert.match(info.link, /ref=/);
    assert.ok(Array.isArray(info.instrucoes) && info.instrucoes.length > 0, 'instrucoes na tela');
    assert.equal(info.totalEarned, 0, 'comeca em zero');
    assert.equal(info.approvedCount, 0);
    assert.equal(info.pendingCount, 0);

    // 2. envia o video
    const envio = await op.post('/posts', { videoUrl: URL_VIDEO, network: 'tiktok', handle: '@joana' });
    assert.equal(envio.ok, true, 'envio: ' + JSON.stringify(envio));
    const postId = envio.post.id;

    // 3. o operador ve o video como pendente, sem dinheiro
    const depoisEnvio = await op.get('/info');
    assert.equal(depoisEnvio.pendingCount, 1);
    assert.equal(depoisEnvio.totalEarned, 0, 'nao pode gerar dinheiro antes de aprovar');
    const lista = await op.get('/posts');
    assert.equal(lista.posts.length, 1);
    assert.equal(lista.posts[0].status, 'pending');

    // 4. o admin ve na fila, com quem enviou
    const fila = await admin.fila();
    const meu = fila.posts.find(p => p.id === postId);
    assert.ok(meu, 'video tem que aparecer na fila do admin');
    assert.equal(meu.operatorName, 'Joana E2E');
    assert.equal(meu.approvedBefore, 0);

    // 5. admin aprova
    const ap = await admin.aprovar(postId);
    assert.equal(ap.ok, true, 'aprovacao: ' + JSON.stringify(ap));

    // 6. o saldo mudou exatamente 1,00 e so no Investir
    const s = saldos();
    assert.equal(s.invest, 1, 'invest +1,00');
    assert.equal(s.total, 1, 'balance +1,00');
    assert.equal(s.earn, 0, 'earn fica intacto (e o que e sacavel)');

    // 7. o operador ve o ganho e o historico
    const fim = await op.get('/info');
    assert.equal(fim.totalEarned, 1);
    assert.equal(fim.approvedCount, 1);
    assert.equal(fim.pendingCount, 0);
    const hist = await op.get('/posts');
    assert.equal(hist.posts[0].status, 'approved');

    // 8. saiu da fila
    const fila2 = await admin.fila();
    assert.ok(!fila2.posts.find(p => p.id === postId), 'aprovado nao fica na fila');
  });

  it('recusa mostra o motivo para o operador e libera o reenvio', async () => {
    estado();
    const envio = await op.post('/posts', { videoUrl: URL_VIDEO, network: 'tiktok', handle: '@joana' });
    assert.equal(envio.ok, true);

    const motivo = 'O link do vídeo não está abrindo.';
    const rec = await admin.recusar(envio.post.id, motivo);
    assert.equal(rec.ok, true, 'recusa: ' + JSON.stringify(rec));

    // o operador le o motivo
    const hist = await op.get('/posts');
    const meu = hist.posts.find(p => p.id === envio.post.id);
    assert.equal(meu.status, 'rejected');
    assert.equal(meu.rejectReason, motivo, 'o motivo precisa chegar no app, nao sumir');

    // e pode reenviar
    const reenvio = await op.post('/posts', { videoUrl: URL_VIDEO, network: 'tiktok', handle: '@joana' });
    assert.equal(reenvio.ok, true, 'depois de recusar tem que poder reenviar: ' + JSON.stringify(reenvio));
    assert.notEqual(reenvio.post.id, envio.post.id, 'e um novo registro');
  });

  it('dois videos seguidos: um por vez, com aprovacao no meio', async () => {
    estado();
    const a = await op.post('/posts', { videoUrl: 'https://www.tiktok.com/@j/video/1', network: 'tiktok', handle: '@j' });
    assert.equal(a.ok, true);
    const bloqueado = await op.post('/posts', { videoUrl: 'https://www.tiktok.com/@j/video/2', network: 'tiktok', handle: '@j' });
    assert.ok(bloqueado.error, 'segundo tem que esperar');

    await admin.aprovar(a.post.id);
    const b = await op.post('/posts', { videoUrl: 'https://www.tiktok.com/@j/video/2', network: 'tiktok', handle: '@j' });
    assert.equal(b.ok, true, 'aprovado o primeiro, o segundo entra');

    await admin.aprovar(b.post.id);
    const info = await op.get('/info');
    assert.equal(info.approvedCount, 2);
    assert.equal(info.totalEarned, 2, 'dois videos = R$ 2,00');
    assert.equal(saldos().invest, 2);
    assert.equal(saldos().earn, 0, 'nada disso e sacavel');
  });

  it('o total pago no mes reflete a soma real', async () => {
    estado();
    const antes = await admin.fila();
    for (let i = 1; i <= 3; i++) {
      const p = await op.post('/posts', { videoUrl: 'https://www.tiktok.com/@j/video/m' + i, network: 'tiktok', handle: '@j' });
      assert.equal(p.ok, true, 'video ' + i);
      await admin.aprovar(p.post.id);
    }
    const depois = await admin.fila();
    assert.equal(depois.stats.paidTotal - antes.stats.paidTotal, 3, 'R$ 3,00 a mais no total');
    assert.ok(depois.stats.paidThisMonth >= 3, 'e entra no total do mes');
    assert.equal(saldos().invest, 3);
  });
});

describe('o tracker do TikTok recebe o evento da recompensa', () => {
  it('aprovar cria transacao visivel no extrato do operador', async () => {
    estado();
    const p = await op.post('/posts', { videoUrl: 'https://www.tiktok.com/@j/video/tx1', network: 'tiktok', handle: '@j' });
    await admin.aprovar(p.post.id);
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const tx = (d.transactions || []).find(t => t.userId === uid && t.type === 'commission');
    assert.ok(tx, 'a recompensa tem que aparecer como transacao no extrato');
    assert.equal(parseFloat(tx.amount), 1);
    assert.ok(tx.description, 'com descricao legivel');
  });
});