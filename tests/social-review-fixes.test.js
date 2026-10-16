// Achados da revisão final. Cada teste aqui FALHOU antes da correção e tem que
// passar depois. Os três primeiros são buracos de dinheiro.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const { criarBancoTemporario, limparBancoTemporario } = require('./helpers/banco-temp');
const social = require('../services/social');

const DB = criarBancoTemporario('fix');
const PORT = 3304;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const ANTIGA = () => new Date(Date.now() - 5 * DIA).toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || 'devkey';

let token = null, uid = null, srv = null;

function estado(over) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  d.transactions = (d.transactions || []).filter(t => t.userId !== uid);
  d.users = d.users.map(u => u.id === uid ? Object.assign({}, u, {
    totalDeposited: 30, investBalance: 0, earnBalance: 0, balance: 0, createdAt: ANTIGA()
  }, over || {}) : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
const saldos = () => {
  const u = JSON.parse(fs.readFileSync(DB, 'utf8')).users.find(x => x.id === uid) || {};
  return { invest: parseFloat(u.investBalance || 0), earn: parseFloat(u.earnBalance || 0), total: parseFloat(u.balance || 0) };
};

const ADM = { 'Content-Type': 'application/json', 'x-admin-key': KEY };
const post = (body) => fetch(B + '/api/social/posts', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(body)
}).then(r => r.json());
const info = () => fetch(B + '/api/social/info', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
const aprovar = (id) => fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: ADM }).then(r => r.json());
const fila = () => fetch(B + '/api/admin/social/pending', { headers: ADM }).then(r => r.json());

before(async () => {
  srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, {
      PORT: String(PORT), DB_FILE: DB,
      TELEGRAM_BOT_TOKEN: 'fake:token', ADMIN_TELEGRAM_CHAT_ID: '1'
    }),
    stdio: 'ignore'
  });
  await wait(17000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550004', password: '12345678', confirmPassword: '12345678', operatorName: 'ZZ Revisao ZZ' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  limparBancoTemporario(DB);
});

describe('C1 — aprovar NAO pode apagar um deposito que caiu junto', () => {
  it('credito por incremento: um deposito de R$500 sobrevive a aprovacao', async () => {
    estado({ investBalance: 500, balance: 500, totalDeposited: 500 });
    const p = await post({ videoUrl: 'https://www.tiktok.com/@r/video/c1', network: 'tiktok', handle: '@r' });
    assert.equal(p.ok, true, JSON.stringify(p));

    await aprovar(p.post.id);
    const s = saldos();
    assert.equal(s.invest, 501, 'os R$500 do deposito + R$1 do premio. Veio ' + s.invest);
    assert.equal(s.total, 501);
  });

  it('duas aprovacoes em PARALELO do mesmo operador creditam as duas', async () => {
    estado({ investBalance: 10, balance: 10 });
    const a = await post({ videoUrl: 'https://www.tiktok.com/@r/video/c1a', network: 'tiktok', handle: '@r' });
    const r1 = await aprovar(a.post.id);
    const b = await post({ videoUrl: 'https://www.tiktok.com/@r/video/c1b', network: 'tiktok', handle: '@r' });
    const r2 = await aprovar(b.post.id);
    assert.equal(r1.ok && r2.ok, true);
    assert.equal(saldos().invest, 12, '10 + 1 + 1. Veio ' + saldos().invest);
  });
});

describe('C2 — o mesmo video nao pode pagar duas vezes com variantes de URL', () => {
  const equivalentes = [
    'https://tiktok.com/@maria/video/7123456789',
    'https://www.tiktok.com/@maria/video/7123456789',
    'https://www.tiktok.com/@Maria/video/7123456789',
    'https://www.tiktok.com/%40maria/video/7123456789'
  ];

  it('todas essas formas produzem o MESMO hash de dedupe', () => {
    const hashes = equivalentes.map(u => {
      const n = social.normalizeUrl(u);
      assert.ok(!n.error, 'URL da lista foi rejeitada: ' + u + ' -> ' + n.error);
      return n.hash;
    });
    assert.equal(new Set(hashes).size, 1, 'viraram hashes diferentes: ' + JSON.stringify(equivalentes));
  });

  it('barra final, query e http nao quebram a equivalencia', () => {
    const h = new Set([
      social.normalizeUrl('https://www.tiktok.com/@maria/video/7123456789').hash,
      social.normalizeUrl('https://www.tiktok.com/@maria/video/7123456789/').hash,
      social.normalizeUrl('https://www.tiktok.com/@maria/video/7123456789?is_from_webapp=1').hash,
      social.normalizeUrl('http://www.tiktok.com/@maria/video/7123456789').hash
    ]);
    assert.equal(h.size, 1, 'query/barra/protocolo geraram ' + h.size + ' hashes');
  });

  it('no app, enviar o mesmo video duas vezes com variantes é barrado', async () => {
    estado();
    const primeiro = await post({ videoUrl: 'https://www.tiktok.com/@joana/video/9001', network: 'tiktok', handle: '@j' });
    assert.equal(primeiro.ok, true, JSON.stringify(primeiro));
    const comWww = await post({ videoUrl: 'https://tiktok.com/@joana/video/9001', network: 'tiktok', handle: '@j' });
    assert.ok(comWww.error, 'variante com www tem que ser barrada: ' + JSON.stringify(comWww));
  });
});

describe('C3 — so pode existir UM video pendente, mesmo com varias requisicoes juntas', () => {
  it('tres envios simultaneos criam UM pendente, nao tres', async () => {
    estado();
    const antes = (await info()).pendingCount;
    const rs = await Promise.all([
      post({ videoUrl: 'https://www.tiktok.com/@j/video/p1', network: 'tiktok', handle: '@j' }),
      post({ videoUrl: 'https://www.tiktok.com/@j/video/p2', network: 'tiktok', handle: '@j' }),
      post({ videoUrl: 'https://www.tiktok.com/@j/video/p3', network: 'tiktok', handle: '@j' })
    ]);
    const criados = rs.filter(r => r.ok).length;
    const depois = (await info()).pendingCount;
    assert.equal(criados, 1, 'criaram ' + criados + ' (tem que ser 1)');
    assert.equal(depois - antes, 1, 'a fila subiu ' + (depois - antes) + ' (tem que ser 1)');
  });
});

describe('C5 — o material precisa do aviso de risco (CVM)', () => {
  it('as instrucoes dizem que o rendimento nao e garantido', async () => {
    estado();
    const r = await info();
    assert.ok(Array.isArray(r.instrucoes) && r.instrucoes.length > 0, 'instrucoes presentes');
    // Os roteiros prontos sairam, mas o aviso de risco nao pode ter saido com
    // eles: e o que segura a parte de divulgacao.
    const acha = r.instrucoes.some(t =>
      /varia|não é garantido|nao e garantido|não tem retorno|nao tem retorno/i.test(String(t)));
    assert.ok(acha, 'nenhuma instrucao com aviso de risco: ' + JSON.stringify(r.instrucoes));
  });
});

describe('I2 — o total ganho do operador nao pode saturar', () => {
  it('105 videos aprovados somam 105, nao os 100 do LIMIT', async () => {
    estado();
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    d.social_posts = d.social_posts || [];
    d.social_posts = d.social_posts.filter(p => p.userId !== uid);
    for (let i = 0; i < 105; i++) {
      d.social_posts.push({
        id: 'SPt' + i, userId: uid, videoUrl: 'https://x/' + i, urlHash: 't' + i,
        network: 'tiktok', handle: '@j', status: 'approved', reward: 1,
        createdAt: ANTIGA(), reviewedAt: ANTIGA()
      });
    }
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
    const r = await info();
    assert.equal(r.totalEarned, 105, 'mostrou ' + r.totalEarned + ' (tem que ser 105)');
    assert.equal(r.approvedCount, 105);
  });
});

describe('I6 — o valor mostrado vem do backend, nao esta escrito no HTML', () => {
  it('as instrucoes citam o valor que o backend devolveu', async () => {
    estado();
    const r = await info();
    assert.equal(r.reward, 1);
    const texto = (r.instrucoes || []).join(' ');
    assert.ok(texto.includes('R$ 1'), 'a instrucao tem que citar o premio do backend: ' + texto);
  });
});

describe('I4 — falha de credito tem que ser visivel para o admin', () => {
  it('a fila mostra tambem os aprovados que nao foram creditados', async () => {
    estado();
    // post aprovado SEM credito: e o caso que hoje some da fila em silencio
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    d.social_posts = d.social_posts || [];
    d.social_posts.push({
      id: 'SPorfao', userId: uid, videoUrl: 'https://www.tiktok.com/@j/video/orfao',
      urlHash: 'orfao', network: 'tiktok', handle: '@j', status: 'approved',
      reward: 1, createdAt: ANTIGA(), reviewedAt: ANTIGA(), creditedAt: null
    });
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
    const r = await fila();
    const orfao = (r.posts || []).find(p => p.id === 'SPorfao');
    assert.ok(orfao, 'o video aprovado sem credito tem que aparecer para o admin ver');
    assert.equal(orfao.precisaCredito, true, 'marcado como pendente de credito');
  });
});