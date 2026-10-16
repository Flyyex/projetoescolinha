const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const social = require('../services/social');

describe('normalizeUrl', () => {
  it('normaliza e gera hash estavel', () => {
    const a = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789');
    const b = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789/');
    assert.equal(a.error, undefined);
    assert.equal(a.hash, b.hash, 'mesma URL com barra final gera mesmo hash');
  });

  it('ignora query de rastreio no hash (mesmo video, links diferentes)', () => {
    // O mesmo video compartilhado no WhatsApp chega com parametros diferentes
    // (?is_from_webapp, ?sender_device, ?lang). Se o hash includisse a query, o
    // mesmo video passaria pela regra de duplicata duas vezes e o admin
    // aprovaria (e pagaria) duas vezes.
    const a = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789');
    const b = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789?is_from_webapp=1&sender_device=pc');
    assert.equal(a.hash, b.hash, 'query de rastreio nao pode gerar outro hash');
    assert.notEqual(a.url, b.url, 'mas a URL mostrada ao admin continua sendo a que o operador enviou');
  });

  it('rejeita URL vazia ou sem http', () => {
    assert.ok(social.normalizeUrl('').error);
    assert.ok(social.normalizeUrl('tiktok.com/@x').error);
  });

  it('rejeita URL longa demais', () => {
    assert.ok(social.normalizeUrl('https://tiktok.com/' + 'a'.repeat(600)).error);
  });
});

describe('isAllowedHost', () => {
  it('aceita as redes da campanha', () => {
    for (const u of [
      'https://www.tiktok.com/@a/video/1',
      'https://vm.tiktok.com/ZM123/',
      'https://www.instagram.com/reel/ABC/',
      'https://youtube.com/shorts/xyz',
      'https://youtu.be/xyz',
      'https://www.facebook.com/watch?v=1'
    ]) assert.equal(social.isAllowedHost(u), true, u);
  });

  it('bloqueia host parecido (prefixo enganoso)', () => {
    assert.equal(social.isAllowedHost('https://youtube.com.evil.com/x'), false);
    assert.equal(social.isAllowedHost('https://tiktok.com.branco.net/x'), false);
    assert.equal(social.isAllowedHost('https://naotiktok.com/x'), false);
  });

  it('aceita link com www (TikTok/IG entregam assim)', () => {
    // Sem isso NENHUM link real de TikTok ou Instagram passaria: eles vem
    // como www.tiktok.com / www.instagram.com.
    assert.equal(social.isAllowedHost('https://www.tiktok.com/@a/video/1'), true);
    assert.equal(social.isAllowedHost('https://www.instagram.com/reel/A/'), true);
    assert.equal(social.isAllowedHost('https://www.facebook.com/watch?v=1'), true);
  });

  it('barra invertida nao engana: o host continua sendo o real', () => {
    // O parser trata \ como / em esquema especial, entao o host e Authority
    // ate a primeira barra. O ataque real seria colocar o dominio verdadeiro
    // DEPOIS da barra invertida para o parser ler tiktok.com.
    assert.equal(social.isAllowedHost('https://tiktok.com\\@evil.com/x'), true, 'host e tiktok.com de verdade');
    assert.equal(social.isAllowedHost('https://evil.com\\@tiktok.com/x'), false, 'host e evil.com: nao pode passar');
    assert.equal(social.isAllowedHost('not-a-url'), false);
  });
});

describe('REWARD_AMOUNT', () => {
  it('e exatamente 1 real', () => {
    assert.equal(social.REWARD_AMOUNT, 1);
  });
});

describe('isEligibleToPost', () => {
  const DIA = 864e5;
  const agora = Date.now();

  it('bloqueia conta com menos de 24h', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 2 * 3600 * 1000).toISOString(),
      totalDeposited: 100, pendingCount: 0
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /24h/);
  });

  it('bloqueia conta sem deposito', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 0, pendingCount: 0
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /dep[oó]sito/i);
  });

  it('bloqueia quem ja tem video pendente', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 100, pendingCount: 1
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /pendente/i);
  });

  it('libera conta antiga com deposito e sem pendencia', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 30, pendingCount: 0
    });
    assert.equal(r.ok, true);
  });

  it('nao libera conta sem createdAt valido', () => {
    for (const criado of [null, undefined, '', 'data-errada']) {
      const r = social.isEligibleToPost({ createdAt: criado, totalDeposited: 100, pendingCount: 0 });
      assert.equal(r.ok, false, 'createdAt=' + JSON.stringify(criado) + ' deveria barrar');
    }
  });
});