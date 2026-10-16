// Matematica do relatorio de saude da plataforma.
// Funcoes PURAS: nao leem banco, nao chamam rede, nao leem env.
// Tudo que precisa de I/O acontece em routes/reports.js antes de chamar aqui.
//
// Contexto do dominio (ver ARCHITECTURE.md / CONCERNS.md):
// - balance e derivado: balance = investBalance + earnBalance
// - investBalance = dinheiro que o usuario depositou (nao e seu)
// - earnBalance  = rendimento + bonus = obrigacao sua, sacavel
// - A "falencia" aqui nao e o caixa do negocio: e o caixa na gateway
//   deixar de cobrir o que voce deve aos usuarios.

const DAY_MS = 24 * 60 * 60 * 1000;

// Arredonda em centavos. Dinheiro nao acumula erro de float.
function money(v) {
  const n = parseFloat(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

function dayKey(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Soma por dia, preservando dias vazios. Sem isso o grafico cai a zero
// em dia sem movimento e mente sobre a tendencia.
function buildDailySeries(opts, daysArg, nowArg) {
  // Aceita chamada posicional (tests) e por objeto (rotas).
  const o = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
  const transactions = o.transactions;
  const users = o.users;
  const days = o.days !== undefined ? o.days : daysArg;
  const now = o.now !== undefined ? o.now : nowArg;
  const totalDays = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
  const txList = Array.isArray(transactions) ? transactions : [];
  const userList = Array.isArray(users) ? users : [];
  const end = now ? new Date(now).getTime() : Date.now();
  const endKey = dayKey(end);
  const startMs = end - (totalDays - 1) * DAY_MS;
  const startKey = dayKey(startMs);

  const byDay = {};
  for (let i = 0; i < totalDays; i++) {
    const k = dayKey(startMs + i * DAY_MS);
    byDay[k] = { date: k, deposits: 0, withdrawals: 0, pendingWithdrawals: 0, earnings: 0, net: 0 };
  }

  for (const t of txList) {
    const type = String(t.type || '');
    const status = String(t.status || 'approved');

    // Saque aprovado tem duas datas: createdAt (quando o usuario pediu) e
    // approvedAt (quando o admin liberou e o Pix saiu). Para prever QUANDO o
    // caixa drena, vale approvedAt - um saque pedido ha 30 dias mas aprovado
    // ontem drenou ontem. Usar createdAt joga o dinheiro no dia errado e
    // distorce a projecao justamente nos casos que importam.
    const effectiveDate = (type === 'withdraw' && status === 'approved' && t.approvedAt)
      ? t.approvedAt
      : t.createdAt;

    const k = dayKey(effectiveDate);
    if (!k || !byDay[k]) continue;
    const row = byDay[k];
    const amt = num(t.amount);

    if (type === 'deposit') {
      if (status === 'approved') row.deposits += amt;
    } else if (type === 'withdraw') {
      if (status === 'approved') row.withdrawals += Math.abs(amt);
      else if (status === 'pending') row.pendingWithdrawals += Math.abs(amt);
    } else if (type === 'earn' || type === 'commission' || type === 'bonus') {
      if (status === 'approved') row.earnings += Math.abs(amt);
    }
  }

  const rows = Object.values(byDay).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of rows) {
    r.deposits = money(r.deposits);
    r.withdrawals = money(r.withdrawals);
    r.pendingWithdrawals = money(r.pendingWithdrawals);
    r.earnings = money(r.earnings);
    r.net = money(r.deposits - r.withdrawals);
  }
  for (const u of userList) {
    const k = dayKey(u && u.createdAt);
    if (k && byDay[k]) byDay[k].newUsers = 1;
  }
  void startKey; void endKey;
  return rows;
}

// O dia corrente e parcial: o dia ainda nao acabou, entao o net dele e menor
// que o real. Usar na media derruba a projecao e cria alarme falso.
// Por isso a serie entrega o dia, mas a projecao recebe so dias fechados.
function closedDays(rows) {
  const todayKey = dayKey(Date.now());
  return rows.filter(r => r.date < todayKey);
}

// Obrigacao vs caixa. O campo que responde "quando eu quebro".
function buildLiability({ users, pendingWithdrawalsAmount, gatewayBalance }) {
  const list = Array.isArray(users) ? users : [];
  let invest = 0, earn = 0, commission = 0, derived = 0;

  for (const u of list) {
    if (!u) continue;
    const hasBuckets = u.investBalance !== undefined || u.earnBalance !== undefined;
    if (hasBuckets) {
      invest += num(u.investBalance);
      earn += num(u.earnBalance);
    } else {
      // Usuario legado: so o campo derivado balance foi preenchido.
      derived += num(u.balance);
    }
    commission += num(u.commissionBalance);
  }

  invest = money(invest);
  earn = money(earn);
  commission = money(commission);
  const pending = money(pendingWithdrawalsAmount);

  const total = money(invest + earn + derived);
  const withdrawable = money(earn + pending);

  const hasCash = gatewayBalance !== null && gatewayBalance !== undefined && isFinite(parseFloat(gatewayBalance));
  const cash = hasCash ? money(gatewayBalance) : null;
  const gap = hasCash ? money(cash - withdrawable) : null;

  return {
    invest,
    earn,
    commission,
    legacyDerived: derived,
    total,
    withdrawable,
    gatewayBalance: cash,
    hasGatewayBalance: hasCash,
    gap,
    covered: hasCash ? gap >= 0 : null,
    coverageRatio: hasCash && withdrawable > 0 ? money(cash / withdrawable) : null
  };
}

// "Poucos users, sempre os mesmos": mede se a base e real ou sao poucas maos.
function buildConcentration({ users }) {
  const list = (Array.isArray(users) ? users : [])
    .map(u => ({ balance: money(u && (u.balance !== undefined ? u.balance : num(u.investBalance) + num(u.earnBalance))) }))
    .filter(u => u.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const total = money(list.reduce((a, u) => a + u.balance, 0));
  const sumTop = (n) => money(list.slice(0, n).reduce((a, u) => a + u.balance, 0));
  const top5Balance = sumTop(5);
  const top10Balance = sumTop(10);

  return {
    total,
    holders: list.length,
    top5Balance,
    top10Balance,
    top5Share: total > 0 ? Math.round((top5Balance / total) * 1000) / 1000 : 0,
    top10Share: total > 0 ? Math.round((top10Balance / total) * 1000) / 1000 : 0,
    top1Share: list.length > 0 && total > 0
      ? Math.round((list[0].balance / total) * 1000) / 1000 : 0,
    // Regra de risco: 5 maos com mais da metade do saldo = base nao diversificada.
    concentrated: total > 0 && (top5Balance / total) > 0.5,
    top: list.slice(0, 10)
  };
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Confianca da projecao, em vez de um gate binario.
// Antes: 30 dias ou nada. Agora: projeta com o que existe e diz o quanto
// se pode confiar. Um medico nao esconde o diagnostico porque o exame
// tem ruido - ele mostra e marca a ressalva.
function assessHistorySufficiency({ daysWithData, daysWindow, dispersion }) {
  const d = parseInt(daysWithData, 10) || 0;
  const w = parseInt(daysWindow, 10) || 30;
  const disp = parseFloat(dispersion);

  let level;
  if (d >= 30) level = 'high';
  else if (d >= 14) level = 'medium';
  else if (d >= 5) level = 'low';
  else level = 'insufficient';

  const enough = d >= 5;
  let message;
  if (level === 'high') {
    message = 'Historico robusto (' + d + ' dias de movimento). Projecao confiavel.';
  } else if (level === 'medium') {
    message = 'Historico medio (' + d + ' dias). Projecao utilizavel, com margem de erro real.';
  } else if (level === 'low') {
    message = 'Historico curto (' + d + ' dias de ' + w + '). Projecao tentatively: um pico isolado muda o numero. ' +
      'Use como direcao, nao como previsao.';
  } else {
    message = 'Sem historico suficiente (' + d + ' de ' + w + ' dias com movimento). ' +
      'Projecao desativada - qualquer linha aqui seria inventada.';
  }

  return {
    sufficient: enough,
    level,
    daysWithData: d,
    daysWindow: w,
    // Dispersao alta = o negocio oscila muito = projecao menos confiavel,
    // mesmo com 30 dias de historico.
    volatile: isFinite(disp) && disp > 0.6,
    message
  };
}

// Projecao por mediana do net diario. Mediana e nao media porque um dia de
// saque grande (o usuario que esvaziou a carteira) nao deve puxar a reta toda.
function projectCashFlow({ dailySeries, currentCash, days, pendingWithdrawals, withdrawableNow }) {
  const all = Array.isArray(dailySeries) ? dailySeries : [];
  const rows = all.length ? closedDays(all) : all;
  const nets = rows.map(r => money(r && r.net)).filter(n => isFinite(n));
  const earns = rows.map(r => money(r && r.earnings)).filter(n => isFinite(n));
  const daysWithData = nets.length;
  const horizon = Math.max(1, Math.min(180, parseInt(days, 10) || 30));

  const med = Math.round(median(nets) * 100) / 100;
  const cash = money(currentCash);

  // Obrigacao tambem cresce: drip de rendimento + bonus + comissao criam
  // direito de saque todo dia, independente do caixa. Projetar so o caixa
  // e olhar so para um lado do balanco - com os numeros reais da base
  // (earn 4x o invest), e esse lado que decide a ruptura.
  const medEarn = Math.round(median(earns) * 100) / 100;
  const wd0raw = parseFloat(withdrawableNow);
  const wd0 = isFinite(wd0raw) ? money(wd0raw) : null;

  // Dispersao relativa (IQR/mediana absoluta) para saber se o negocio e estavel.
  const absNets = nets.map(n => Math.abs(n)).sort((a, b) => a - b);
  const absMed = median(absNets);
  const p25 = absNets[Math.floor(absNets.length * 0.25)] || 0;
  const p75 = absNets[Math.floor(absNets.length * 0.75)] || 0;
  const dispersion = absMed > 0 ? Math.round(((p75 - p25) / absMed) * 100) / 100 : 0;

  const sufficiency = assessHistorySufficiency({
    daysWithData,
    daysWindow: all.length || horizon,
    dispersion
  });

  // Ja entra negativo = quebro agora.
  if (isFinite(cash) && cash <= 0) {
    return {
      reliable: false, direction: 'burning', dailyNet: med, currentCash: cash,
      breakevenDate: null, daysToBreakeven: 0, horizonDays: horizon,
      warning: 'Caixa ja esta zerado ou negativo.', sufficiency
    };
  }

  if (!sufficiency.sufficient || med === 0) {
    return {
      reliable: false,
      direction: med < 0 ? 'burning' : med > 0 ? 'growing' : 'flat',
      dailyNet: med,
      currentCash: cash,
      breakevenDate: null,
      daysToBreakeven: null,
      horizonDays: horizon,
      series: [],
      warning: !sufficiency.sufficient
        ? sufficiency.message
        : 'Net diario medio e zero: sem sinal de tendencia.',
      sufficiency
    };
  }

  const daily = Array.from({ length: horizon + 1 }, (_, i) => {
    const k = dayKey(Date.now() + i * DAY_MS);
    return { date: k, projected: money(cash + med * i) };
  });

  // Saques pendentes entram como dreno imediato, nao distribuido ao longo
  // dos proximos dias: se ha R$ 5 mil na fila de aprovacao, esse dinheiro sai
  // no curto prazo e fingir que ele sai "gradualmente" subestima o risco.
  const pendingOut = money(pendingWithdrawals);
  let adjustedCash = cash;
  let pendingAdjusted = false;
  if (pendingOut > 0 && isFinite(pendingOut)) {
    adjustedCash = money(cash - pendingOut);
    pendingAdjusted = true;
  }

  // Recalcula o cruzamento sobre o caixa liquido (ja descontando pendencias).
  // Quando a obrigacao e conhecida, o cruzamento que importa nao e o caixa
  // zerando - e o caixa deixando de cobrir a obrigacao:
  //   gap(t) = (cash + med*t) - (wd0 + medEarn*t)
  // Sem wd0 (modo legado), cai no comportamento antigo: caixa zerando.
  breakevenDate = null;
  daysToBreakeven = null;
  let gapDailyDelta = null;
  if (wd0 !== null) {
    const gap0 = money(adjustedCash - wd0);
    gapDailyDelta = money(med - medEarn);
    if (gap0 < 0) {
      // Ja descoberto hoje.
      breakevenDate = dayKey(Date.now());
      daysToBreakeven = 0;
    } else if (gapDailyDelta < 0) {
      daysToBreakeven = Math.ceil(gap0 / Math.abs(gapDailyDelta));
      if (daysToBreakeven <= horizon) {
        breakevenDate = dayKey(Date.now() + daysToBreakeven * DAY_MS);
      }
    }
  } else if (med < 0 && adjustedCash > 0) {
    daysToBreakeven = Math.ceil(adjustedCash / Math.abs(med));
    if (daysToBreakeven <= horizon) {
      breakevenDate = dayKey(Date.now() + daysToBreakeven * DAY_MS);
    }
  } else if (adjustedCash <= 0 && isFinite(adjustedCash)) {
    // Ja esta no vermelho contando so o que o usuario pediu.
    breakevenDate = dayKey(Date.now());
    daysToBreakeven = 0;
  }

  const series = pendingAdjusted
    ? daily.map((d, i) => ({ date: d.date, projected: money(cash - pendingOut + med * i) }))
    : daily;

  return {
    reliable: true,
    direction: med < 0 ? 'burning' : med > 0 ? 'growing' : 'flat',
    dailyNet: med,
    dailyObligation: medEarn,
    gapDailyDelta,
    withdrawableNow: wd0,
    currentCash: cash,
    pendingWithdrawals: pendingOut,
    breakevenDate,
    daysToBreakeven,
    horizonDays: horizon,
    series,
    sufficiency,
    warning: null
  };
}

// Contas de teste com saldo fake (saldos zerados e drones finalizados no
// banco em 02/10/2026, mas o historico de transacoes delas continua la).
// Excluidas de TODOS os calculos para nao distorcer serie, obrigacao,
// concentracao nem projecao. Para tirar ou acrescentar alguem, edite a lista.
const DEFAULT_EXCLUDED_PHONES = [
  '41985175036', // Operador #1645
  '41995543736', // Operador #8317
  '41996851867' // Piazin
];

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

// Resolve os ids a excluir a partir dos telefones (o banco guarda o userId
// nas transacoes, nao o telefone).
function resolveExcludedIds(users, extraPhones) {
  const phones = new Set(
    [...DEFAULT_EXCLUDED_PHONES, ...(Array.isArray(extraPhones) ? extraPhones : [])]
      .map(normalizePhone)
      .filter(Boolean)
  );
  const ids = new Set();
  for (const u of (Array.isArray(users) ? users : [])) {
    if (u && u.id !== undefined && phones.has(normalizePhone(u.phone))) ids.add(String(u.id));
  }
  return ids;
}

// Devolve { users, transactions } sem as contas excluidas. A rota aplica
// ANTES de qualquer builder, entao serie historica, obrigacao, concentracao,
// projecao e holders ficam limpos de uma vez.
function withoutExcludedUsers(users, transactions, excludedIds) {
  const ids = excludedIds instanceof Set ? excludedIds : new Set();
  const cleanUsers = (Array.isArray(users) ? users : [])
    .filter(u => u && !ids.has(String(u.id)));
  const cleanTx = (Array.isArray(transactions) ? transactions : [])
    .filter(t => t && !ids.has(String(t.userId)));
  return { users: cleanUsers, transactions: cleanTx };
}

module.exports = {
  buildDailySeries,
  buildLiability,
  buildConcentration,
  projectCashFlow,
  assessHistorySufficiency,
  closedDays,
  resolveExcludedIds,
  withoutExcludedUsers,
  DEFAULT_EXCLUDED_PHONES,
  money,
  DAY_MS
};