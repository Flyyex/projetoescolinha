// Filtros do /admin — TDD RED: falha até public/admin-filters.js existir.
// Roda com: node --test tests/admin-filters.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const f = require('../public/admin-filters.js');

describe('matchWithdrawal', () => {
  const t = { id: 'WD-123', userName: 'Maria Silva', userPhone: '11987654321', pixKey: 'maria@email.com', status: 'pending' };

  it('status all + busca vazia passa tudo', () => {
    assert.equal(f.matchWithdrawal(t, { q: '', status: 'all' }), true);
  });

  it('filtra por status', () => {
    assert.equal(f.matchWithdrawal(t, { q: '', status: 'pending' }), true);
    assert.equal(f.matchWithdrawal(t, { q: '', status: 'approved' }), false);
  });

  it('busca acha nome parcial sem case', () => {
    assert.equal(f.matchWithdrawal(t, { q: 'maria', status: 'all' }), true);
    assert.equal(f.matchWithdrawal(t, { q: 'MARIA SIL', status: 'all' }), true);
  });

  it('busca acha telefone, pix e id', () => {
    assert.equal(f.matchWithdrawal(t, { q: '98765', status: 'all' }), true);
    assert.equal(f.matchWithdrawal(t, { q: 'maria@email', status: 'all' }), true);
    assert.equal(f.matchWithdrawal(t, { q: 'WD-123', status: 'all' }), true);
    assert.equal(f.matchWithdrawal(t, { q: 'joão', status: 'all' }), false);
  });

  it('combina busca + status', () => {
    assert.equal(f.matchWithdrawal(t, { q: 'maria', status: 'approved' }), false);
  });
});

describe('matchDeposit', () => {
  const d = { id: 'TX-1', userName: 'João', userPhone: '21999998888', status: 'approved', amount: 50 };

  it('status paid casa com approved', () => {
    assert.equal(f.matchDeposit(d, { q: '', status: 'paid' }), true);
    assert.equal(f.matchDeposit(d, { q: '', status: 'other' }), false);
  });

  it('busca por nome e id', () => {
    assert.equal(f.matchDeposit(d, { q: 'joão', status: 'all' }), true);
    assert.equal(f.matchDeposit(d, { q: 'TX-1', status: 'all' }), true);
    assert.equal(f.matchDeposit(d, { q: 'maria', status: 'all' }), false);
  });
});

describe('matchWebhook', () => {
  const l = { provider: 'misticpay', event_type: 'deposit', status: 'processed', customer_name: 'Ana', customer_phone: '31988887777', amount: 30 };

  it('filtra por provider', () => {
    assert.equal(f.matchWebhook(l, { q: '', status: 'all', provider: 'misticpay', kind: 'all' }), true);
    assert.equal(f.matchWebhook(l, { q: '', status: 'all', provider: 'asaas', kind: 'all' }), false);
  });

  it('filtra por tipo pix vs saque', () => {
    assert.equal(f.matchWebhook(l, { q: '', status: 'all', provider: 'all', kind: 'pix' }), true);
    assert.equal(f.matchWebhook(l, { q: '', status: 'all', provider: 'all', kind: 'withdraw' }), false);
    assert.equal(f.matchWebhook({ ...l, event_type: 'withdraw' }, { q: '', status: 'all', provider: 'all', kind: 'withdraw' }), true);
  });

  it('status processed vs outros', () => {
    assert.equal(f.matchWebhook(l, { q: '', status: 'processed', provider: 'all', kind: 'all' }), true);
    assert.equal(f.matchWebhook(l, { q: '', status: 'other', provider: 'all', kind: 'all' }), false);
  });

  it('busca por cliente', () => {
    assert.equal(f.matchWebhook(l, { q: 'ana', status: 'all', provider: 'all', kind: 'all' }), true);
    assert.equal(f.matchWebhook(l, { q: 'joão', status: 'all', provider: 'all', kind: 'all' }), false);
  });
});

describe('matchSupport', () => {
  const t = { userId: 'u1', userName: 'Carlos', phone: '41977776666', unread: 2, status: 'open' };

  it('aberto vs fechado', () => {
    assert.equal(f.matchSupport(t, { q: '', status: 'open' }), true);
    assert.equal(f.matchSupport(t, { q: '', status: 'closed' }), false);
  });

  it('busca por nome', () => {
    assert.equal(f.matchSupport(t, { q: 'carlos', status: 'all' }), true);
    assert.equal(f.matchSupport(t, { q: 'ana', status: 'all' }), false);
  });

  it('só não-lidas', () => {
    assert.equal(f.matchSupport(t, { q: '', status: 'all', onlyUnread: true }), true);
    assert.equal(f.matchSupport({ ...t, unread: 0 }, { q: '', status: 'all', onlyUnread: true }), false);
  });
});

describe('matchBonus', () => {
  const p = { code: 'TRUCKAUTO10', amount: 10, active: true };

  it('busca por código parcial', () => {
    assert.equal(f.matchBonus(p, { q: 'truckauto', status: 'all' }), true);
    assert.equal(f.matchBonus(p, { q: '10', status: 'all' }), true);
    assert.equal(f.matchBonus(p, { q: 'NATAL', status: 'all' }), false);
  });

  it('ativo vs off', () => {
    assert.equal(f.matchBonus(p, { q: '', status: 'active' }), true);
    assert.equal(f.matchBonus(p, { q: '', status: 'off' }), false);
  });
});

describe('matchLeader', () => {
  const l = { name: 'Paulo Líder', phone: '51966665555', rank: 'Ouro' };

  it('busca por nome e patente', () => {
    assert.equal(f.matchLeader(l, { q: 'paulo' }), true);
    assert.equal(f.matchLeader(l, { q: 'ouro' }), true);
    assert.equal(f.matchLeader(l, { q: 'prata' }), false);
  });
});
