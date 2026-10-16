// i18n de DADOS (catálogo): pickLang com fallback PT, status e cidades.
// Roda com: node --test tests/i18n-data.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const D = require('../public/i18n-data.js');

describe('pickLang', () => {
  const prod = { description: 'Drone compacto', description_es: 'Dron compacto', description_en: 'Compact drone' };

  it('usa o idioma ativo quando existe', () => {
    assert.equal(D.pickLang(prod, 'description', 'es'), 'Dron compacto');
    assert.equal(D.pickLang(prod, 'description', 'en'), 'Compact drone');
  });

  it('cai no PT quando vazio ou ausente', () => {
    assert.equal(D.pickLang(prod, 'description', 'zh'), 'Drone compacto');
    assert.equal(D.pickLang({ description: 'X' }, 'description', 'es'), 'X');
  });

  it('pt sempre resolve', () => {
    assert.equal(D.pickLang(prod, 'description', 'pt'), 'Drone compacto');
  });
});

describe('cityName', () => {
  // Cidades dos EUA: nao mudam de nome entre os idiomas, entao cada uma tem que
  // devolver exatamente o que entrou.
  it('as cidades dos EUA sao iguais em qualquer idioma', () => {
    assert.equal(D.cityName('Kansas City, MO', 'en'), 'Kansas City, MO');
    assert.equal(D.cityName('Kansas City, MO', 'es'), 'Kansas City, MO');
    assert.equal(D.cityName('Kansas City, MO', 'zh'), 'Kansas City, MO');
    assert.equal(D.cityName('Los Angeles, CA', 'en'), 'Los Angeles, CA');
    assert.equal(D.cityName('Los Angeles, CA', 'zh'), 'Los Angeles, CA');
  });

  it('traduz "Todas as Cidades"', () => {
    assert.equal(D.cityName('Todas as Cidades', 'en'), 'All cities');
    assert.equal(D.cityName('Todas as Cidades', 'es'), 'Todas las ciudades');
  });

  it('cidade desconhecida volta crua (fallback PT)', () => {
    assert.equal(D.cityName('Curitiba, PR', 'zh'), 'Curitiba, PR');
  });
});
