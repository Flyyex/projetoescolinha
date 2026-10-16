const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../public/i18n.js');

describe('resolveLang', () => {
  it('prefere salvo válido', () => {
    assert.equal(I.resolveLang('es', 'en-US'), 'es');
  });
  it('mapeia navigator para suportados', () => {
    assert.equal(I.resolveLang('', 'en-US'), 'en');
    assert.equal(I.resolveLang('', 'zh-CN'), 'zh');
    assert.equal(I.resolveLang('', 'es-MX'), 'es');
  });
  it('cai em pt para resto/lixo', () => {
    assert.equal(I.resolveLang('', 'fr-FR'), 'pt');
    assert.equal(I.resolveLang('xx', 'xx'), 'pt');
  });
});

describe('lookup', () => {
  const pt = { nav: { home: 'Início' } };
  it('acha chave aninhada', () => {
    assert.equal(I.lookup({ nav: { home: 'Inicio' } }, pt, 'nav.home'), 'Inicio');
  });
  it('fallback pt quando falta', () => {
    assert.equal(I.lookup({}, pt, 'nav.home'), 'Início');
  });
  it('devolve a chave quando nem pt tem', () => {
    assert.equal(I.lookup({}, {}, 'x.y'), 'x.y');
  });
});

describe('interpolate', () => {
  it('troca {var}', () => {
    assert.equal(I.interpolate('Mín R$ {min}', { min: '15,00' }), 'Mín R$ 15,00');
  });
  it('mantém placeholder sem valor', () => {
    assert.equal(I.interpolate('Olá {nome}', {}), 'Olá {nome}');
  });
});
