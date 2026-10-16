/* Filtros client-side do /admin — predicados puros.
 * UMD: funciona via <script src> no browser (window.AdminFilters)
 * e via require() no node --test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminFilters = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(v) {
    return String(v || '').toLowerCase().trim();
  }

  function has(q, ...fields) {
    if (!q) return true;
    const needle = norm(q);
    return fields.some((f) => norm(f).indexOf(needle) !== -1);
  }

  function matchWithdrawal(t, f) {
    t = t || {}; f = f || {};
    const st = norm(f.status || 'all');
    if (st !== 'all' && norm(t.status) !== st) return false;
    return has(f.q, t.userName, t.userPhone, t.pixKey, t.id);
  }

  function matchDeposit(d, f) {
    d = d || {}; f = f || {};
    const st = norm(f.status || 'all');
    if (st === 'paid' && norm(d.status) !== 'approved') return false;
    if (st === 'other' && norm(d.status) === 'approved') return false;
    return has(f.q, d.userName, d.userPhone, d.id, d.description);
  }

  function matchWebhook(l, f) {
    l = l || {}; f = f || {};
    const st = norm(f.status || 'all');
    if (st === 'processed' && norm(l.status) !== 'processed') return false;
    if (st === 'other' && norm(l.status) === 'processed') return false;
    const pv = norm(f.provider || 'all');
    if (pv !== 'all' && norm(l.provider) !== pv) return false;
    const kind = norm(f.kind || 'all');
    const ev = norm(l.event_type || l.eventType);
    if (kind === 'pix' && ev === 'withdraw') return false;
    if (kind === 'withdraw' && ev !== 'withdraw') return false;
    return has(f.q,
      l.customer_name, l.customerName, l.customer_phone, l.customerPhone,
      l.matched_user_id, l.matchedUserId, l.amount, l.id);
  }

  function matchSupport(t, f) {
    t = t || {}; f = f || {};
    const st = norm(f.status || 'all');
    if ((st === 'open' || st === 'closed') && norm(t.status || 'open') !== st) return false;
    if (f.onlyUnread && !(parseInt(t.unread, 10) > 0)) return false;
    return has(f.q, t.userName, t.phone, t.userId);
  }

  function matchBonus(p, f) {
    p = p || {}; f = f || {};
    const st = norm(f.status || 'all');
    if (st === 'active' && !p.active) return false;
    if (st === 'off' && p.active) return false;
    return has(f.q, p.code);
  }

  function matchLeader(l, f) {
    l = l || {}; f = f || {};
    return has(f.q, l.name, l.phone, l.rank);
  }

  return {
    matchWithdrawal: matchWithdrawal,
    matchDeposit: matchDeposit,
    matchWebhook: matchWebhook,
    matchSupport: matchSupport,
    matchBonus: matchBonus,
    matchLeader: matchLeader
  };
}));
