// Bug de producao: o botao "Alugar" dos pontos de carregamento nao abria nada.
//
// Os carregadores NAO ficam em appState.products -- loadProducts() joga os CH-*
// em CHARGER_PRODUCTS (app.js:472-474), e e de la que a tela desenha o card
// (app.js:615). Mas hireVehicle() procurava o produto so em appState.products.
// Resultado: clicar em "Alugar" num ponto de carregamento nao achava o produto e
// retornava em silencio -- sem erro no console, sem aviso na tela. Drone
// funcionava, carregamento nunca.
//
// Sem browser: extrai a funcao pura do fonte e testa direto, como o
// social-art.test.js faz com calcularEncaixe.
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function extrair(nome) {
  const ini = src.indexOf('function ' + nome);
  if (ini < 0) throw new Error('funcao ' + nome + ' nao encontrada em public/app.js');
  let i = src.indexOf('{', ini);
  let nivel = 0, achou = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { nivel++; achou = true; }
    else if (src[i] === '}') { nivel--; if (achou && nivel === 0) return src.slice(ini, i + 1); }
  }
  throw new Error('nao consegui fechar ' + nome);
}

const NL = src.includes('\r\n') ? '\r\n' : '\n';
const tira2 = (s) => s.split(NL).map((l) => l.replace(/^  /, '')).join('\n');

const buscar = new Function(tira2(extrair('buscarProdutoAlugavel')) + '\nreturn buscarProdutoAlugavel;')();

// As duas listas como o app monta de verdade: drones em appState.products e
// carregadores em CHARGER_PRODUCTS.
const DRONES = [
  { id: 'NX-30', name: 'Drone 30', price: 30 },
  { id: 'NX-79', name: 'Drone 79', price: 79 }
];
const CARREGADORES = [
  { id: 'CH-050', name: 'Ponto 50', price: 50 },
  { id: 'CH-200', name: 'Ponto 200', price: 200 },
  { id: 'CH-500', name: 'Ponto 500', price: 500 },
  { id: 'CH-1200', name: 'Ponto 1200', price: 1200 }
];

describe('buscarProdutoAlugavel — o botao Alugar precisa achar o produto', () => {
  it('acha um drone na lista de drones', () => {
    const p = buscar(DRONES, CARREGADORES, 'NX-79');
    assert.ok(p, 'nao achou o drone');
    assert.equal(p.id, 'NX-79');
  });

  it('acha um ponto de carregamento na lista de carregadores (a regressao)', () => {
    const p = buscar(DRONES, CARREGADORES, 'CH-050');
    assert.ok(p, 'o botao Alugar do ponto de carregamento nao achou o produto');
    assert.equal(p.id, 'CH-050');
    assert.equal(p.price, 50);
  });

  it('acha os quatro pontos de carregamento do catalogo', () => {
    for (const c of CARREGADORES) {
      const p = buscar(DRONES, CARREGADORES, c.id);
      assert.ok(p, 'nao achou ' + c.id);
      assert.equal(p.id, c.id);
    }
  });

  it('devolve null para id que nao existe em nenhuma lista', () => {
    assert.equal(buscar(DRONES, CARREGADORES, 'CH-999'), null);
    assert.equal(buscar(DRONES, CARREGADORES, 'lixo'), null);
  });

  it('aguenta id numerico vindo do HTML (o onclick sempre devolve string)', () => {
    const dronesNum = [{ id: 101, name: 'Drone 101' }];
    const carregNum = [{ id: 202, name: 'Ponto 202' }];
    assert.ok(buscar(dronesNum, carregNum, '101'), 'id numerico na lista de drones');
    assert.ok(buscar(dronesNum, carregNum, '202'), 'id numerico na lista de carregadores');
    assert.ok(buscar(dronesNum, carregNum, 202), 'id numerico como numero');
  });

  it('aguenta lista vazia ou ausente', () => {
    assert.equal(buscar([], [], 'CH-050'), null);
    assert.equal(buscar(null, undefined, 'CH-050'), null);
    assert.ok(buscar(DRONES, null, 'NX-30'), 'drone achado mesmo sem lista de carregadores');
    assert.ok(buscar(null, CARREGADORES, 'CH-050'), 'carregador achado mesmo sem lista de drones');
  });

  it('ignora id vazio', () => {
    assert.equal(buscar(DRONES, CARREGADORES, ''), null);
    assert.equal(buscar(DRONES, CARREGADORES, null), null);
    assert.equal(buscar(DRONES, CARREGADORES, undefined), null);
  });
});

describe('hireVehicle tem que usar essa busca nas DUAS listas', () => {
  it('nao pode procurar so em appState.products', () => {
    // Trava o sintoma: se hireVehicle voltar a usar appState.products.find, o
    // carregamento quebra de novo e o teste(unitario) continuaria passando.
    const corpo = extrair('hireVehicle');
    assert.ok(/buscarProdutoAlugavel\s*\(/.test(corpo),
      'hireVehicle nao usa buscarProdutoAlugavel');
    assert.ok(!/appState\.products\.find\(/.test(corpo),
      'hireVehicle ainda procura direto em appState.products');
    assert.ok(/CHARGER_PRODUCTS/.test(corpo) || /buscarProdutoAlugavel/.test(corpo),
      'hireVehicle nao enxerga CHARGER_PRODUCTS');
  });

  it('nao volta em silencio quando o produto nao existe', () => {
    const corpo = extrair('hireVehicle');
    // Um return mudo era o que escondia o bug: a pessoa clicava e nada
    // acontecia, sem nenhum aviso.
    assert.ok(!/if\s*\(\s*!prod\s*\)\s*return;/.test(corpo),
      'hireVehicle ainda retorna em silencio quando nao acha o produto');
    assert.ok(/appNotice|Notice/.test(corpo),
      'hireVehicle precisa avisar o usuario quando nao acha o produto');
  });
});