// Fase 2 — Limites nativos. TDD RED: este teste deve FALHAR até services/limits.js existir.
// Roda com: node --test tests/limits.test.js (sem dependências)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const limits = require('../services/limits');

const H = 3600 * 1000;
const NOW = new Date('2026-09-29T12:00:00Z').getTime();
const iso = (ms) => new Date(ms).toISOString();

describe('parseLimitSettings', () => {
  it('aplica defaults quando settings vazio', () => {
    const l = limits.parseLimitSettings({});
    assert.equal(l.maxDepositTx, 5000);
    assert.equal(l.maxDepositDay, 10000);
    assert.equal(l.maxWithdrawTx, 2000);
    assert.equal(l.maxWithdrawDay, 2000);
    assert.equal(l.newAccountGraceH, 24);
    assert.equal(l.newAccountCap7d, 500);
    assert.equal(l.globalDailyWithdrawCap, 20000);
    assert.equal(l.payoutsPaused, false);
    assert.equal(l.depositsPaused, false);
  });

  it('saneia valores inválidos para defaults', () => {
    const l = limits.parseLimitSettings({ max_withdraw_tx: 'abc', max_deposit_tx: -5 });
    assert.equal(l.maxWithdrawTx, 2000);
    assert.equal(l.maxDepositTx, 5000);
  });
});

describe('sumInWindow', () => {
  it('soma só a janela rolante de 24h, não o dia corrido', () => {
    const txs = [
      { amount: 1000, createdAt: iso(NOW - 2 * H) }, // dentro
      { amount: 500, createdAt: iso(NOW - 26 * H) }, // fora
    ];
    assert.equal(limits.sumInWindow(txs, 24 * H, NOW), 1000);
  });

  it('transação de ontem 23:59 conta se ainda dentro de 24h', () => {
    const txs = [{ amount: 700, createdAt: iso(NOW - 12 * H) }];
    assert.equal(limits.sumInWindow(txs, 24 * H, NOW), 700);
  });
});

describe('msUntilNextWithdraw', () => {
  it('bloqueia saque 00:01 quando o anterior foi 23:59 (bug atual)', () => {
    const last = NOW - 2 * 60 * 1000; // 2 min atrás
    const wait = limits.msUntilNextWithdraw(last, NOW, 24 * H);
    assert.ok(wait > 23 * H, `esperava >23h, veio ${wait}`);
  });

  it('libera após 24h completas', () => {
    assert.equal(limits.msUntilNextWithdraw(NOW - 25 * H, NOW, 24 * H), 0);
  });

  it('sem saque anterior libera', () => {
    assert.equal(limits.msUntilNextWithdraw(null, NOW, 24 * H), 0);
  });
});

describe('checkDepositLimits', () => {
  const L = { maxDepositTx: 5000, maxDepositDay: 10000 };

  it('rejeita depósito acima do máx por transação', () => {
    const r = limits.checkDepositLimits({ amount: 5001, deposits24h: 0, limits: L });
    assert.equal(r.ok, false);
  });

  it('rejeita quando soma 24h estoura o teto diário', () => {
    const r = limits.checkDepositLimits({ amount: 1000, deposits24h: 9500, limits: L });
    assert.equal(r.ok, false);
  });

  it('aceita depósito normal dentro dos tetos', () => {
    const r = limits.checkDepositLimits({ amount: 100, deposits24h: 0, limits: L });
    assert.equal(r.ok, true);
  });
});

describe('checkWithdrawLimits', () => {
  const L = {
    maxWithdrawTx: 2000, maxWithdrawDay: 2000,
    newAccountGraceH: 24, newAccountCap7d: 500,
    globalDailyWithdrawCap: 20000, payoutsPaused: false,
  };
  const oldUser = { createdAt: iso(NOW - 30 * 24 * H), totalDeposited: 100 };

  it('rejeita acima do máx por transação', () => {
    const r = limits.checkWithdrawLimits({
      amount: 2001, user: oldUser, withdraws24h: 0, globalWithdraws24h: 0,
      lastWithdrawAt: null, limits: L, now: NOW,
    });
    assert.equal(r.ok, false);
  });

  it('conta nova (<24h) não saca (carência)', () => {
    const r = limits.checkWithdrawLimits({
      amount: 50, user: { createdAt: iso(NOW - 2 * H), totalDeposited: 20 },
      withdraws24h: 0, globalWithdraws24h: 0, lastWithdrawAt: null, limits: L, now: NOW,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /carência|24h/i);
  });

  it('conta com 3 dias respeita teto de R$500', () => {
    const r = limits.checkWithdrawLimits({
      amount: 600, user: { createdAt: iso(NOW - 3 * 24 * H), totalDeposited: 600 },
      withdraws24h: 0, globalWithdraws24h: 0, lastWithdrawAt: null, limits: L, now: NOW,
    });
    assert.equal(r.ok, false);
  });

  it('teto global bloqueia com 429', () => {
    const r = limits.checkWithdrawLimits({
      amount: 100, user: oldUser, withdraws24h: 0, globalWithdraws24h: 19950,
      lastWithdrawAt: null, limits: L, now: NOW,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 429);
    assert.equal(r.code, 'GLOBAL_CAP');
  });

  it('emergência pausa saques', () => {
    const r = limits.checkWithdrawLimits({
      amount: 100, user: oldUser, withdraws24h: 0, globalWithdraws24h: 0,
      lastWithdrawAt: null, limits: { ...L, payoutsPaused: true }, now: NOW,
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  });

  it('fluxo normal passa e não exige retry', () => {
    const r = limits.checkWithdrawLimits({
      amount: 100, user: oldUser, withdraws24h: 0, globalWithdraws24h: 0,
      lastWithdrawAt: NOW - 25 * H, limits: L, now: NOW,
    });
    assert.equal(r.ok, true);
  });
});

describe('bônus expiração 7 dias', () => {
  it('bônus >7d sem depósito expira', () => {
    assert.equal(limits.isSignupBonusExpired({
      bonusCreatedAt: iso(NOW - 8 * 24 * H), totalDeposited: 0, now: NOW,
    }), true);
  });

  it('bônus com depósito não expira', () => {
    assert.equal(limits.isSignupBonusExpired({
      bonusCreatedAt: iso(NOW - 30 * 24 * H), totalDeposited: 20, now: NOW,
    }), false);
  });

  it('bônus novo sem depósito ainda vale', () => {
    assert.equal(limits.isSignupBonusExpired({
      bonusCreatedAt: iso(NOW - 2 * 24 * H), totalDeposited: 0, now: NOW,
    }), false);
  });
});

describe('comissão só sobre dinheiro real', () => {
  it('comprador sem depósito não gera comissão', () => {
    assert.equal(limits.shouldPayCommission({ buyerTotalDeposited: 0, minDeposit: 20 }), false);
  });

  it('comprador com depósito gera comissão', () => {
    assert.equal(limits.shouldPayCommission({ buyerTotalDeposited: 50, minDeposit: 20 }), true);
  });
});

describe('formatRetryMs', () => {
  it('formata countdown pt-BR', () => {
    assert.equal(limits.formatRetryMs((13 * H) + (22 * 60 * 1000)), '13h22m');
  });
});

describe('0 = sem limite', () => {
  it('parse aceita 0 nos tetos', () => {
    const l = limits.parseLimitSettings({ max_deposit_tx: 0, max_withdraw_day: 0, global_daily_withdraw_cap: 0, new_account_cap_7d: 0 });
    assert.equal(l.maxDepositTx, 0);
    assert.equal(l.maxWithdrawDay, 0);
    assert.equal(l.globalDailyWithdrawCap, 0);
    assert.equal(l.newAccountCap7d, 0);
  });

  it('depósito gigante passa com tetos zerados', () => {
    const r = limits.checkDepositLimits({
      amount: 999999, deposits24h: 999999,
      limits: { maxDepositTx: 0, maxDepositDay: 0 },
    });
    assert.equal(r.ok, true);
  });

  it('saque gigante passa com tetos zerados e conta antiga', () => {
    const r = limits.checkWithdrawLimits({
      amount: 999999,
      user: { createdAt: iso(NOW - 30 * 24 * H), totalDeposited: 9999999 },
      withdraws24h: 999999, globalWithdraws24h: 99999999,
      lastWithdrawAt: NOW - 25 * H,
      limits: {
        maxWithdrawTx: 0, maxWithdrawDay: 0, newAccountGraceH: 24,
        newAccountCap7d: 0, globalDailyWithdrawCap: 0, payoutsPaused: false,
      },
      now: NOW,
    });
    assert.equal(r.ok, true);
  });
});
