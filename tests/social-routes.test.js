// Sobe o servidor real em porta alta e fala HTTP de verdade. Sem tocar a rede
// externa: o Telegram e interceptado por token falso no servidor filho.
//
// Cada teste monta o estado que precisa. Nada depende do teste anterior -- a
// primeira versao fazia, e um teste que herda estado do anterior passa sem
// provar nada.
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const { normalizeUrl } = require('../services/social');

const { criarBancoTemporario, limparBancoTemporario } = require('./helpers/banco-temp');
const DB = criarBancoTemporario('rotas');
const PORT = 3301;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const ANTIGA = () => new Date(Date.now() - 5 * DIA).toISOString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null, uid = null, srv = null;

// Estados nomeados, um por regra. Chamar sem argumento = elegivel.
function estado(perfil) {
  const agora = new Date().toISOString();
  const perfis = {
    elegivel: { createdAt: ANTIGA(), totalDeposited: 30 },
    semDeposito: { createdAt: ANTIGA(), totalDeposited: 0 },
    contaNova: { createdAt: agora, totalDeposited: 30 },
    novoSemDeposito: { createdAt: agora, totalDeposited: 0 }
  };
  const p = perfis[perfil || 'elegivel'];
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(x => x.userId !== uid);
  d.users = d.users.map(u => u.id === uid ? Object.assign({}, u, p) : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

function marcarPosts(fn) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(x => x.userId !== uid);
  for (const p of fn()) d.social_posts.push(Object.assign({ userId: uid, reward: 0 }, p));
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

const post = (body) => fetch(B + '/api/social/posts', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify(body)
}).then(r => r.json());
const get = (p) => fetch(B + '/api/social' + p, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());

const URL_OK = 'https://www.tiktok.com/@zz/video/771';

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
    body: JSON.stringify({ phone: '11955550001', password: '12345678', confirmPassword: '12345678', operatorName: 'ZZ Social Rotas ZZ' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  limparBancoTemporario(DB);
});

describe('POST /api/social/posts — cada regra isolada', () => {
  it('bloqueia conta SEM deposito (conta antiga, para nao cair na regra das 24h)', async () => {
    estado('semDeposito');
    const r = await post({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' });
    assert.ok(r.error, 'deveria barrar: ' + JSON.stringify(r));
    assert.match(r.error, /dep[oó]sito/i);
  });

  it('bloqueia conta nova (com deposito)', async () => {
    estado('contaNova');
    const r = await post({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' });
    assert.ok(r.error);
    assert.match(r.error, /24h/);
  });

  it('bloqueia host nao permitido', async () => {
    estado();
    const r = await post({ videoUrl: 'https://youtube.com.evil.com/x', network: 'tiktok', handle: '@a' });
    assert.ok(r.error, 'deveria barrar host');
  });

  it('bloqueia link sem http', async () => {
    estado();
    const r = await post({ videoUrl: 'tiktok.com/@a/video/1', network: 'tiktok', handle: '@a' });
    assert.ok(r.error);
  });

  it('exige autenticacao', async () => {
    const res = await fetch(B + '/api/social/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' })
    });
    assert.equal(res.status, 401);
  });

  it('ACEITA conta elegivel e devolve pending', async () => {
    estado();
    const r = await post({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.post.status, 'pending');
    assert.equal(r.post.userId, uid);
  });
});

describe('POST /api/social/posts — um por vez e dedupe', () => {
  it('bloqueia o segundo enquanto o primeiro esta pendente', async () => {
    estado();
    const primeiro = await post({ videoUrl: 'https://www.tiktok.com/@zz/video/900', network: 'tiktok', handle: '@zz' });
    assert.equal(primeiro.ok, true);
    const segundo = await post({ videoUrl: 'https://www.instagram.com/zz/reel/ABC9/', network: 'instagram', handle: '@zz' });
    assert.ok(segundo.error, 'deveria barrar o segundo');
    assert.match(segundo.error, /pendente/i);
  });

  it('bloqueia link que JA esta no banco, com status aprovado', async () => {
    estado();
    // O hash tem que ser o REAL (o mesmo que a rota calcula). Plantar um hash
    // falso nao prova nada: a rota nunca casaria com ele.
    const real = normalizeUrl(URL_OK).hash;
    marcarPosts(() => [{
      id: 'SP_preaprovado', videoUrl: URL_OK, urlHash: real,
      network: 'tiktok', handle: '@zz', status: 'approved', createdAt: new Date().toISOString()
    }]);
    const r = await post({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' });
    assert.ok(r.error, 'link ja usado tem que ser barrado pelo hash');
  });

  it('bloqueia o mesmo link reenviado com query de rastreio', async () => {
    estado();
    const primeiro = await post({ videoUrl: URL_OK, network: 'tiktok', handle: '@zz' });
    assert.equal(primeiro.ok, true);
    const mesmo = await post({
      videoUrl: URL_OK + '?is_from_webapp=1&sender_device=pc',
      network: 'tiktok', handle: '@zz'
    });
    assert.ok(mesmo.error, 'query de rastreio nao pode furar o dedupe');
  });
});

describe('GET /api/social/info', () => {
  it('devolve o link com o inviteCode do proprio usuario', async () => {
    estado();
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const code = d.users.find(u => u.id === uid).inviteCode;
    const r = await get('/info');
    assert.match(r.link, new RegExp('ref=' + code));
    // O link vai para a bio do TikTok: precisa ser ABSOLUTO. Sem APP_URL no
    // .env, um caminho relativo ("/presell?ref=...") sairia e colado num video
    // nao abriria nada.
    assert.match(r.link, /^https?:\/\//, 'link tem que ser absoluto: ' + r.link);
    assert.match(r.link, new RegExp('/presell\\?ref=' + code));
    assert.match(r.hashtags, /#truckauto/i);
    assert.match(r.hashtags, /#investimentos/i);
    assert.match(r.hashtags, /#truckautodrones/i);
    assert.equal(r.reward, 1);
  });

it('conta total ganho, aprovados e pendentes', async () => {
    estado();
    marcarPosts(() => [
      { id: 'A', videoUrl: 'https://x/1', urlHash: 'z1', network: 'tiktok', status: 'approved', reward: 1, createdAt: ANTIGA() },
      { id: 'P', videoUrl: 'https://x/2', urlHash: 'z2', network: 'tiktok', status: 'pending', createdAt: ANTIGA() }
    ]);
    const r = await get('/info');
    assert.equal(r.totalEarned, 1);
    assert.equal(r.approvedCount, 1);
    assert.equal(r.pendingCount, 1);
  });

  it('exige autenticacao', async () => {
    const res = await fetch(B + '/api/social/info');
    assert.equal(res.status, 401);
  });
});

describe('GET /api/social/posts', () => {
  it('lista so os videos do proprio usuario', async () => {
    estado();
    marcarPosts(() => [
      { id: 'M1', videoUrl: 'https://x/1', urlHash: 'y1', network: 'tiktok', status: 'pending', createdAt: ANTIGA() },
      { id: 'M2', videoUrl: 'https://x/2', urlHash: 'y2', network: 'tiktok', status: 'rejected', rejectReason: 'link quebrado', createdAt: ANTIGA() }
    ]);
    const r = await get('/posts');
    assert.equal(r.posts.length, 2);
    for (const p of r.posts) assert.equal(p.userId, uid, 'nao pode vazar video de outro usuario');
  });
});