// Fase 2 — Limites nativos (helpers puros, testáveis sem DB).
// Todas as janelas são ROLANTES (agora - N), nunca dia corrido.

const H = 3600 * 1000;
const DAY = 24 * H;

const DEFAULTS = {
  maxDepositTx: 5000,
  maxDepositDay: 10000,
  maxWithdrawTx: 2000,
  maxWithdrawDay: 2000,
  newAccountGraceH: 24,
  newAccountCap7d: 500,
  globalDailyWithdrawCap: 20000,
  payoutsPaused: false,
  depositsPaused: false,
};

function num(v, fallback, min, max) {
  const n = parseFloat(v);
  if (!isFinite(n)) return fallback;
  if (min !== undefined && n < min) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
}

function parseLimitSettings(s) {
  s = s || {};
  const pick = (a, b) => (s[a] !== undefined && s[a] !== null ? s[a] : s[b]);
  return {
    // 0 = trava desligada (sem limite)
    maxDepositTx: num(pick('max_deposit_tx', 'maxDepositTx'), DEFAULTS.maxDepositTx, 0, 1000000),
    maxDepositDay: num(pick('max_deposit_day', 'maxDepositDay'), DEFAULTS.maxDepositDay, 0, 10000000),
    maxWithdrawTx: num(pick('max_withdraw_tx', 'maxWithdrawTx'), DEFAULTS.maxWithdrawTx, 0, 1000000),
    maxWithdrawDay: num(pick('max_withdraw_day', 'maxWithdrawDay'), DEFAULTS.maxWithdrawDay, 0, 10000000),
    newAccountGraceH: num(pick('new_account_grace_h', 'newAccountGraceH'), DEFAULTS.newAccountGraceH, 0, 720),
    newAccountCap7d: num(pick('new_account_cap_7d', 'newAccountCap7d'), DEFAULTS.newAccountCap7d, 0, 1000000),
    globalDailyWithdrawCap: num(pick('global_daily_withdraw_cap', 'globalDailyWithdrawCap'), DEFAULTS.globalDailyWithdrawCap, 0, 100000000),
    payoutsPaused: String(pick('payouts_paused', 'payoutsPaused') ?? '0') === '1'
      || pick('payouts_paused', 'payoutsPaused') === true,
    depositsPaused: String(pick('deposits_paused', 'depositsPaused') ?? '0') === '1'
      || pick('deposits_paused', 'depositsPaused') === true,
  };
}

// Soma |amount| das txs dentro da janela rolante [now - windowMs, now].
function sumInWindow(txs, windowMs, now) {
  const nowMs = now || Date.now();
  const from = nowMs - windowMs;
  return (txs || []).reduce((acc, t) => {
    const ts = new Date(t.createdAt || t.created_at).getTime();
    if (!isFinite(ts) || ts < from || ts > nowMs) return acc;
    return acc + Math.abs(parseFloat(t.amount || 0));
  }, 0);
}

// ms restantes até poder sacar de novo (0 = liberado).
function msUntilNextWithdraw(lastWithdrawAt, now, intervalMs) {
  if (!lastWithdrawAt) return 0;
  const last = new Date(lastWithdrawAt).getTime();
  if (!isFinite(last)) return 0;
  const nowMs = now || Date.now();
  const wait = (intervalMs || DAY) - (nowMs - last);
  return wait > 0 ? wait : 0;
}

function formatRetryMs(ms) {
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h <= 0) return `${rest}m`;
  return `${h}h${String(rest).padStart(2, '0')}m`;
}

function checkDepositLimits({ amount, deposits24h, limits }) {
  if (!(amount > 0)) return { ok: false, status: 400, error: 'Valor inválido.' };
  if (limits.maxDepositTx > 0 && amount > limits.maxDepositTx) {
    return { ok: false, status: 400, error: `Depósito máximo por transação: R$ ${limits.maxDepositTx.toFixed(2)}.` };
  }
  if (limits.maxDepositDay > 0 && (deposits24h || 0) + amount > limits.maxDepositDay) {
    return { ok: false, status: 429, error: `Limite de depósitos de 24h atingido (R$ ${limits.maxDepositDay.toFixed(2)}). Tente mais tarde.` };
  }
  return { ok: true };
}

function checkWithdrawLimits({ amount, user, withdraws24h, globalWithdraws24h, lastWithdrawAt, limits, now }) {
  const nowMs = now || Date.now();
  if (limits.payoutsPaused) {
    return { ok: false, status: 403, error: 'Saques pausados temporariamente. Tente mais tarde.' };
  }
  if (!(amount > 0)) return { ok: false, status: 400, error: 'Valor inválido.' };
  if (limits.maxWithdrawTx > 0 && amount > limits.maxWithdrawTx) {
    return { ok: false, status: 400, error: `Saque máximo por transação: R$ ${limits.maxWithdrawTx.toFixed(2)}.` };
  }
  // Carência conta nova + teto 7 dias (desde createdAt, não dia corrido)
  const created = new Date((user && (user.createdAt || user.created_at)) || 0).getTime();
  if (isFinite(created) && created > 0) {
    const ageH = (nowMs - created) / H;
    if (ageH < limits.newAccountGraceH) {
      const wait = limits.newAccountGraceH * H - (nowMs - created);
      return { ok: false, status: 403, error: `Primeiro saque libera após ${limits.newAccountGraceH}h de conta. Faltam ${formatRetryMs(wait)}.`, retryAfterMs: wait };
    }
    if (limits.newAccountCap7d > 0 && ageH < 7 * 24 && amount > limits.newAccountCap7d) {
      return { ok: false, status: 403, error: `Nos primeiros 7 dias o saque máximo é R$ ${limits.newAccountCap7d.toFixed(2)} por transação.` };
    }
  }
  // Intervalo rolante 24h (mata o bug 23:59 → 00:01)
  const wait = msUntilNextWithdraw(lastWithdrawAt, nowMs, DAY);
  if (wait > 0) {
    return { ok: false, status: 429, error: `Você já sacou nas últimas 24h. Tente em ${formatRetryMs(wait)}.`, retryAfterMs: wait };
  }
  if (limits.maxWithdrawDay > 0 && (withdraws24h || 0) + amount > limits.maxWithdrawDay) {
    return { ok: false, status: 429, error: `Limite de saques de 24h atingido (R$ ${limits.maxWithdrawDay.toFixed(2)}).` };
  }
  if (limits.globalDailyWithdrawCap > 0 && (globalWithdraws24h || 0) + amount > limits.globalDailyWithdrawCap) {
    return { ok: false, status: 429, code: 'GLOBAL_CAP', error: 'Volume máximo de saques da plataforma atingido nas últimas 24h. Sua solicitação entrou na fila.' };
  }
  return { ok: true };
}

// Bônus de boas-vindas expira em 7 dias se a conta nunca depositou.
function isSignupBonusExpired({ bonusCreatedAt, totalDeposited, now }) {
  if ((parseFloat(totalDeposited || 0)) > 0) return false;
  const ts = new Date(bonusCreatedAt).getTime();
  if (!isFinite(ts)) return false;
  return ((now || Date.now()) - ts) > 7 * DAY;
}

// Comissão só existe sobre dinheiro real (comprador já depositou ao menos o mínimo).
function shouldPayCommission({ buyerTotalDeposited, minDeposit }) {
  return parseFloat(buyerTotalDeposited || 0) >= parseFloat(minDeposit || 20);
}

module.exports = {
  DAY,
  DEFAULTS,
  parseLimitSettings,
  sumInWindow,
  msUntilNextWithdraw,
  formatRetryMs,
  checkDepositLimits,
  checkWithdrawLimits,
  isSignupBonusExpired,
  shouldPayCommission,
};
