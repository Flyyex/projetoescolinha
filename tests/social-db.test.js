const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DB = path.join(__dirname, '..', 'data.json');
const backup = fs.readFileSync(DB, 'utf8');
const db = require('../database');
const { REWARD_AMOUNT } = require('../services/social');

const UID = 'usr_teste_social';

function plantar(posts) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== UID);
  for (const p of posts) d.social_posts.push({ userId: UID, ...p });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
// A fila busca o nome do usuario. Sem um usuario real no data.json, o
// operatorName viria null e o teste nao provaria nada do que o admin ve.
function plantarUsuario() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.users = (d.users || []).filter(u => u.id !== UID);
  d.users.push({ id: UID, operatorName: 'ZZ Teste Social ZZ', phone: '11988880000' });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function removerUsuario() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== UID);
  d.users = (d.users || []).filter(u => u.id !== UID);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
const meuPosts = () => JSON.parse(fs.readFileSync(DB, 'utf8')).social_posts.filter(p => p.userId === UID);

before(() => { plantarUsuario(); plantar([]); });
after(() => { fs.writeFileSync(DB, backup); });

// Todas as funcoes de database.js sao async. Sem await, o resultado e uma
// Promise e p.status vem undefined -- foi o que quebrou a primeira versao
// deste teste.
const criar = (hash, url) => db.createSocialPost(UID, {
  url: url || ('https://www.tiktok.com/@a/video/' + hash), urlHash: hash, network: 'tiktok', handle: '@a'
});

describe('createSocialPost', () => {
  it('cria pendente com reward zerado', async () => {
    plantar([]);
    const p = await criar('h1');
    assert.equal(p.status, 'pending');
    assert.equal(p.reward, 0, 'reward so e gravado na aprovacao — nunca na criacao');
    assert.equal(p.userId, UID);
    assert.ok(p.id, 'tem id');
  });

  it('bloqueia url_hash repetido', async () => {
    plantar([]);
    await criar('h1');
    const dup = await criar('h1');
    assert.ok(dup.error, 'segundo create com mesmo hash tem que falhar');
    assert.equal(meuPosts().length, 1, 'so uma linha gravada');
  });
});

describe('approveSocialPost — o mais importante do projeto', () => {
  it('aprova uma vez e grava reward 1.00', async () => {
    plantar([]);
    const p = await criar('h2');
    const r = await db.approveSocialPost(p.id);
    assert.equal(r.ok, true);
    assert.equal(r.post.status, 'approved');
    assert.equal(r.post.reward, 1);
  });

  it('aprovar de novo nao muda nada e avisa alreadyDone', async () => {
    const alvo = meuPosts().find(p => p.status === 'approved');
    const r = await db.approveSocialPost(alvo.id);
    assert.equal(r.ok, false);
    assert.equal(r.alreadyDone, true);
    assert.equal(r.post.reward, 1, 'reward nao pode ser reescrito');
  });

  it('id inexistente devolve erro, nao lanca', async () => {
    const r = await db.approveSocialPost('SP_nao_existe_xyz');
    assert.equal(r.ok, false);
    assert.ok(r.error, 'deve informar o erro');
    assert.equal(r.alreadyDone, undefined);
  });

  it('getSocialStats reflete o delta deste teste', async () => {
    const antes = await db.getSocialStats();
    const p = await criar('h9');
    await db.approveSocialPost(p.id);
    const depois = await db.getSocialStats();
    assert.equal(depois.paidTotal - antes.paidTotal, 1, 'exatamente +1,00 no total pago');
    assert.equal(depois.approvedCount - antes.approvedCount, 1);
    assert.equal(depois.pending - antes.pending, 0, 'o post saiu da fila');
    assert.ok(depois.paidThisMonth >= 1, 'aprovacao de hoje conta no mes');
  });
});

describe('rejectSocialPost', () => {
  it('recusa com motivo', async () => {
    plantar([]);
    const p = await criar('h4');
    const r = await db.rejectSocialPost(p.id, 'link nao abre');
    assert.equal(r.ok, true);
    assert.equal(r.post.status, 'rejected');
    assert.equal(r.post.rejectReason, 'link nao abre');
  });

  it('recusa em post ja aprovado nao volta pra pendente', async () => {
    plantar([]);
    const p = await criar('h5');
    await db.approveSocialPost(p.id);
    const r = await db.rejectSocialPost(p.id, 'mudei de ideia');
    assert.equal(r.ok, false);
    assert.equal(r.post.status, 'approved', 'status nao pode regredir');
  });

  it('recusa sem motivo usa texto padrao', async () => {
    plantar([]);
    const p = await criar('h6');
    const r = await db.rejectSocialPost(p.id, '');
    assert.equal(r.ok, true);
    assert.ok(r.post.rejectReason && r.post.rejectReason.length > 3, 'precisa de motivo legivel');
  });
});

describe('reenvio apos recusa', () => {
  it('hash recusado NAO bloqueia reenvio; hash pendente bloqueia', async () => {
    plantar([]);
    await criar('reenvio');
    const segundo = await criar('reenvio');
    assert.ok(segundo.error, 'ainda pendente: bloqueado');

    const pend = meuPosts().find(p => p.status === 'pending');
    await db.rejectSocialPost(pend.id, 'link quebrado');
    const terceiro = await criar('reenvio');
    assert.ok(!terceiro.error, 'depois de recusar, tem que poder reenviar');
  });
});

describe('contagens e leituras', () => {
  it('conta pendentes e aprovados separadamente', async () => {
    // So pode existir UM pendente por pessoa (createSocialPost recusa o
    // segundo), entao cada criacao e liberada aprovando ou recusando o
    // anterior. A versao anterior deste teste criava 3 pendentes seguidos e
    // dependia da regra frouxa.
    plantar([]);
    const a = await criar('c1');
    await db.rejectSocialPost(a.id, 'nao e sobre drone');

    const b = await criar('c2');
    await db.approveSocialPost(b.id);

    const c = await criar('c3');
    assert.ok(!c.error, 'o terceiro pendente tem que entrar: os anteriores ja sairam da fila');
    await db.approveSocialPost(c.id);

    assert.equal(await db.countPendingSocialByUser(UID), 0, 'aprovado o ultimo, nao sobra pendente');
    assert.equal(await db.countApprovedSocialByUser(UID), 2);
    const lista = await db.getUserSocialPosts(UID);
    assert.equal(lista.length, 3);
    assert.ok(a.id && lista.some(p => p.id === a.id));
  });

  it('recusa um segundo pendente da mesma pessoa', async () => {
    // Regra que a revisao pediu: um pendente por vez, garantido no banco.
    plantar([]);
    await criar('u1');
    const segundo = await criar('u2');
    assert.ok(segundo.error, 'o segundo pendente tem que ser recusado');
    assert.match(segundo.error, /pendente/i);
    assert.equal(await db.countPendingSocialByUser(UID), 1);
  });

  it('getPendingSocialPosts traz quem enviou e quantos ja aprovou', async () => {
    const fila = await db.getPendingSocialPosts();
    const meu = fila.find(p => p.userId === UID);
    assert.ok(meu, 'meu post pendente tem que aparecer na fila');
    assert.equal(meu.operatorName, 'ZZ Teste Social ZZ', 'fila traz o nome de quem enviou');
    assert.equal(typeof meu.phone, 'string', 'fila traz phone');
    assert.equal(typeof meu.approvedBefore, 'number', 'fila traz quantos ja aprovou');
  });

  it('getSocialPostById acha e devolve null para inexistente', async () => {
    const p = meuPosts()[0];
    assert.equal((await db.getSocialPostById(p.id)).id, p.id);
    assert.equal(await db.getSocialPostById('SP_inexistente'), null);
  });
});

describe('Ruling 2 — as duas constantes do premio iguais', () => {
  it('SOCIAL_REWARD do banco bate com REWARD_AMOUNT do service', () => {
    // database.js nao importa services/ (camada), entao a constante e duplicada.
    // Este teste e o que impede as duas de divergirem em silencio.
    assert.equal(REWARD_AMOUNT, 1);
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'database.js'), 'utf8');
    const m = fonte.match(/const SOCIAL_REWARD\s*=\s*([\d.]+)/);
    assert.ok(m, 'SOCIAL_REWARD tem que estar declarada em database.js');
    assert.equal(parseFloat(m[1]), REWARD_AMOUNT, 'SOCIAL_REWARD divergiu de REWARD_AMOUNT');
  });
});