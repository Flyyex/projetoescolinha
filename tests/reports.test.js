// Testes de services/reports.js. Funcoes puras: sem banco, sem rede, sem env.
// Por isso rodam em qualquer maquina - node --test "tests/*.test.js"

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDailySeries,
  buildLiability,
  buildConcentration,
  projectCashFlow,
  assessHistorySufficiency,
  resolveExcludedIds,
  withoutExcludedUsers,
  DEFAULT_EXCLUDED_PHONES
} = require('../services/reports');

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse('2026-09-01T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const dayKeyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

test('buildDailySeries: separa depositos de saques por dia', () => {
  const tx = [
    { type: 'deposit', status: 'approved', amount: 100, createdAt: iso(BASE) },
    { type: 'deposit', status: 'approved', amount: 50, createdAt: iso(BASE + 1000) },
    { type: 'withdraw', status: 'approved', amount: -30, createdAt: iso(BASE) },
    { type: 'withdraw', status: 'pending', amount: -20, createdAt: iso(BASE) }
  ];
  const rows = buildDailySeries({ transactions: tx, users: [], days: 3, now: BASE });

  assert.equal(rows.length, 3, 'deve devolver exatamente `days` linhas');
  // A serie termina no proprio dia de `now`, entao o movimento cai na ultima linha.
  const d0 = rows[rows.length - 1];
  assert.equal(d0.date, '2026-09-01');
  assert.equal(d0.deposits, 150, 'soma depositos aprovados do dia');
  assert.equal(d0.withdrawals, 30, 'saques aprovados em valor absoluto');
  assert.equal(d0.pendingWithdrawals, 20, 'separado do que foi aprovado');
  assert.equal(d0.net, 120, 'net = entradas - saidas');
});

test('buildDailySeries: ignora transacoes fora da janela', () => {
  const tx = [{ type: 'deposit', status: 'approved', amount: 999, createdAt: iso(BASE - 30 * DAY) }];
  const rows = buildDailySeries({ transactions: tx, users: [], days: 7, now: BASE });
  assert.equal(rows.reduce((a, r) => a + r.deposits, 0), 0, 'transacao antiga nao entra na serie');
});

test('buildDailySeries: devolve serie sem buracos quando nao ha movimento', () => {
  const rows = buildDailySeries({ transactions: [], users: [], days: 10, now: BASE });
  assert.equal(rows.length, 10);
  assert.ok(rows.every(r => r.deposits === 0 && r.withdrawals === 0));
  assert.ok(rows.every(r => r.date), 'todo dia tem data');
});

test('buildDailySeries: entradas vindas de null nao quebram', () => {
  assert.deepEqual(buildDailySeries({ users: [], days: 2, now: BASE }).length, 2);
  assert.deepEqual(buildDailySeries({ transactions: [], days: 2, now: BASE }).length, 2);
  assert.deepEqual(buildDailySeries(null, 2, BASE).length, 2);
});

test('buildLiability: separa o que e seu do que voce deve', () => {
  const users = [
    { investBalance: 100, earnBalance: 50, commissionBalance: 10 },
    { investBalance: 200, earnBalance: 25, commissionBalance: 0 }
  ];
  const l = buildLiability({ users, pendingWithdrawalsAmount: 30 });

  assert.equal(l.invest, 300, 'investBalance = dinheiro do usuario, nao e seu');
  assert.equal(l.earn, 75, 'earnBalance = obrigacao sacavel');
  assert.equal(l.commission, 10, 'comissao e bucket separado');
  // balance = invest + earn. Comissao NAO entra no derivado (ver wallet.js:780),
  // entao somar ela aqui inflaria a obrigacao.
  assert.equal(l.total, 375, 'total = invest + earn, sem comissao');
  assert.equal(l.withdrawable, 105, 'saque sai daqui: earn + pending');
});

test('buildLiability: saldo unico e legado ainda conta', () => {
  // Usuarios antigos podem ter so `balance` preenchido (campo derivado).
  const l = buildLiability({ users: [{ balance: 60 }], pendingWithdrawalsAmount: 0 });
  assert.equal(l.total, 60, 'sem invest/earn explicitos, usa balance');
  assert.equal(l.invest, 0);
  assert.equal(l.earn, 0);
});

test('buildLiability: sem usuarios nao explode', () => {
  const l = buildLiability({ users: [] });
  assert.equal(l.total, 0);
  assert.equal(l.withdrawable, 0);
});

test('buildLiability: gap negativo quando a gateway nao cobre a obrigacao', () => {
  const users = [{ investBalance: 0, earnBalance: 1000 }];
  const l = buildLiability({ users, pendingWithdrawalsAmount: 0, gatewayBalance: 400 });
  assert.equal(l.gap, -600, 'gap = caixa - obrigacao sacavel');
  assert.equal(l.covered, false);
});

test('buildLiability: sem saldo da gateway o gap e null, nao zero', () => {
  const l = buildLiability({ users: [{ earnBalance: 100 }], gatewayBalance: null });
  assert.equal(l.gap, null, 'null = desconhecido; 0 seria mentira');
  assert.equal(l.covered, null);
});

test('buildConcentration: calcula share do top 5', () => {
  const users = [
    { balance: 500 }, { balance: 300 }, { balance: 100 },
    { balance: 60 }, { balance: 30 }, { balance: 10 }
  ];
  const c = buildConcentration({ users });
  assert.equal(c.total, 1000);
  assert.equal(c.top5Balance, 990);
  assert.equal(c.top5Share, 0.99);
  assert.equal(c.top1Share, 0.5);
  assert.equal(c.concentrated, true, '>50% em 5 maos e risco de churn concentrado');
});

test('buildConcentration: base espalhada nao acusa concentracao', () => {
  const users = Array.from({ length: 10 }, (_, i) => ({ balance: 100 }));
  const c = buildConcentration({ users });
  assert.equal(c.top5Share, 0.5);
  assert.equal(c.concentrated, false);
});

test('buildConcentration: ordena do maior para o menor', () => {
  const c = buildConcentration({ users: [{ balance: 10 }, { balance: 90 }, { balance: 50 }] });
  assert.equal(c.top[0].balance, 90);
  assert.equal(c.top[2].balance, 10);
});

test('projectCashFlow: projeta cruzamento da linha de zero', () => {
  // 35 dias fechados queimando 100/dia -> cruza os 1000 em ~10 dias.
  // A projecao exige 30+ dias de historico e ignora o dia corrente (parcial).
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -100 });
  }
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30 });
  assert.equal(p.reliable, true, 'com 40 dias de historico projeta');
  assert.equal(p.dailyNet, -100);
  assert.ok(p.breakevenDate, 'deve achar a data de cruzamento');
  assert.equal(p.daysToBreakeven, 10, '1000 / 100');
  assert.equal(p.direction, 'burning');
});

test('projectCashFlow: dia parcial nao derruba a projecao', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -100 });
  }
  rows.push({ date: dayKeyOf(Date.now()), net: -100 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30 });
  assert.equal(p.dailyNet, -100, 'hoje (parcial) nao altera a mediana');
  assert.equal(p.daysToBreakeven, 10);
});

test('projectCashFlow: Ignora hoje quando o dia corrente distorce a media', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 0 });
  }
  rows.push({ date: dayKeyOf(Date.now()), net: -999 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 100, days: 30 });
  assert.equal(p.reliable, false, 'mediana dos dias fechados e 0, sem sinal');
});

test('projectCashFlow: usa mediana, nao media (outlier nao inclina a reta)', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -10 });
  }
  // Um dia de saque massivo (usuario esvaziando a carteira).
  rows.push({ date: dayKeyOf(Date.now() - 20 * 86400000), net: -100000 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30 });
  assert.equal(p.dailyNet, -10, 'mediana ignora o outlier de -100000');
});

test('projectCashFlow: caixa subindo mas obrigacao subindo mais = ruptura do gap', () => {
  // O caso traiçoeiro: net +100/dia (caixa crescendo), mas earn +150/dia.
  // Sem olhar a obrigacao, a resposta seria "crescendo, sem ruptura".
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 100, earnings: 150 });
  }
  const p = projectCashFlow({
    dailySeries: rows, currentCash: 1000, days: 30, withdrawableNow: 800
  });
  assert.equal(p.reliable, true);
  assert.equal(p.direction, 'growing', 'o caixa sozinho esta crescendo');
  assert.equal(p.dailyObligation, 150);
  assert.equal(p.gapDailyDelta, -50, 'o buraco aumenta 50/dia');
  assert.equal(p.daysToBreakeven, 4, 'gap de 200 / 50 por dia');
  assert.ok(p.breakevenDate, 'data a ruptura mesmo crescendo');
});

test('projectCashFlow: obrigacao crescendo devagar nao gera ruptura', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 100, earnings: 20 });
  }
  const p = projectCashFlow({
    dailySeries: rows, currentCash: 1000, days: 30, withdrawableNow: 800
  });
  assert.equal(p.gapDailyDelta, 80, 'gap melhora 80/dia');
  assert.equal(p.breakevenDate, null, 'sem cruzamento no horizonte');
});

test('projectCashFlow: ja descoberto hoje = ruptura imediata', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 100, earnings: 10 });
  }
  const p = projectCashFlow({
    dailySeries: rows, currentCash: 500, days: 30, withdrawableNow: 900
  });
  assert.equal(p.daysToBreakeven, 0);
  assert.equal(p.breakevenDate, dayKeyOf(Date.now()));
});

test('projectCashFlow: sem withdrawableNow mantem comportamento legado', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -100 });
  }
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30 });
  assert.equal(p.withdrawableNow, null);
  assert.equal(p.daysToBreakeven, 10, 'caixa zerando em 10 dias');
});

test('projectCashFlow: caixa crescendo nunca cruza', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 50 });
  }
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30 });
  assert.equal(p.reliable, true);
  assert.equal(p.breakevenDate, null, 'crescendo nao cruza zero');
  assert.equal(p.direction, 'growing');
});

test('projectCashFlow: sem dados suficientes nao projeta', () => {
  const rows = [{ date: dayKeyOf(Date.now() - 5 * 86400000), net: -50 }];
  const p = projectCashFlow({ dailySeries: rows, currentCash: 100, days: 30 });
  assert.equal(p.reliable, false, '1 dia de historico nao justifica projecao');
  assert.equal(p.breakevenDate, null);
  assert.ok(p.warning, 'precisa avisar o usuario');
});

test('projectCashFlow: net zero nao projeta', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) {
    rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 0 });
  }
  const p = projectCashFlow({ dailySeries: rows, currentCash: 100, days: 30 });
  assert.equal(p.reliable, false, 'mediana zero = sem sinal, nao projetar');
});

test('assessHistorySufficiency: menos de 5 dias e insuficiente', () => {
  const r = assessHistorySufficiency({ daysWithData: 3, daysWindow: 30 });
  assert.equal(r.sufficient, false);
  assert.equal(r.level, 'insufficient');
});

test('assessHistorySufficiency: nivel sobe com o historico', () => {
  assert.equal(assessHistorySufficiency({ daysWithData: 8 }).level, 'low');
  assert.equal(assessHistorySufficiency({ daysWithData: 20 }).level, 'medium');
  assert.equal(assessHistorySufficiency({ daysWithData: 40 }).level, 'high');
});

test('assessHistorySufficiency: 5+ dias ja projeta (destrava previsao)', () => {
  const r = assessHistorySufficiency({ daysWithData: 6, daysWindow: 30 });
  assert.equal(r.sufficient, true, 'com 6 dias projeta, em vez de esperar 30');
  assert.equal(r.level, 'low', 'mas declara confianca baixa');
  assert.ok(/curto/i.test(r.message), 'o aviso continua dizendo que e fraco');
});

test('exclusao: resolve ids pelos telefones, ignorando formatacao', () => {
  const users = [
    { id: 'u1', phone: '41985175036' },
    { id: 'u2', phone: '(41) 99554-3736' },
    { id: 'u3', phone: '41999990001' }
  ];
  const ids = resolveExcludedIds(users);
  assert.ok(ids.has('u1'), 'telefone puro casa');
  assert.ok(ids.has('u2'), 'telefone formatado casa depois de normalizar');
  assert.ok(!ids.has('u3'), 'usuario real fica');
});

test('exclusao: lista padrao contem os 3 fakes conhecidos', () => {
  assert.deepEqual([...DEFAULT_EXCLUDED_PHONES].sort(), ['41985175036', '41995543736', '41996851867'].sort());
});

test('exclusao: filtra usuarios e transacoes juntos', () => {
  const users = [
    { id: 'fake', phone: '41985175036', earnBalance: 1500 },
    { id: 'real', phone: '41999990001', earnBalance: 100 }
  ];
  const tx = [
    { userId: 'fake', type: 'deposit', status: 'approved', amount: 330, createdAt: iso(BASE) },
    { userId: 'real', type: 'deposit', status: 'approved', amount: 50, createdAt: iso(BASE) }
  ];
  const ids = resolveExcludedIds(users);
  const clean = withoutExcludedUsers(users, tx, ids);
  assert.equal(clean.users.length, 1);
  assert.equal(clean.users[0].id, 'real');
  assert.equal(clean.transactions.length, 1);
  const l = buildLiability({ users: clean.users, pendingWithdrawalsAmount: 0 });
  assert.equal(l.earn, 100, 'saldo fake nao entra na obrigacao');
  const rows = buildDailySeries({ transactions: clean.transactions, users: clean.users, days: 3, now: BASE });
  assert.equal(rows[rows.length - 1].deposits, 50, 'deposito fake nao entra na serie');
});

test('exclusao: sem match nao remove ninguem', () => {
  const users = [{ id: 'a', phone: '1' }];
  const tx = [{ userId: 'a', type: 'deposit', status: 'approved', amount: 10, createdAt: iso(BASE) }];
  const clean = withoutExcludedUsers(users, tx, resolveExcludedIds(users));
  assert.equal(clean.users.length, 1);
  assert.equal(clean.transactions.length, 1);
});

test('assessHistorySufficiency: dispersao alta marca volátil', () => {
  assert.equal(assessHistorySufficiency({ daysWithData: 40, dispersion: 1.4 }).volatile, true);
  assert.equal(assessHistorySufficiency({ daysWithData: 40, dispersion: 0.2 }).volatile, false);
});

test('projectCashFlow: projeta com historico curto, avisando a fraqueza', () => {
  const rows = [];
  for (let i = 9; i >= 1; i--) rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -40 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 500, days: 30 });
  assert.equal(p.reliable, true, '9 dias bastam para projetar');
  assert.equal(p.sufficiency.level, 'low');
  assert.equal(p.daysToBreakeven, 13, '500/40 arredondado para cima');
  assert.ok(p.sufficiency.message.includes('curto'));
});

test('projectCashFlow: saque pendente conta como dreno imediato', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: -10 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 1000, days: 30, pendingWithdrawals: 300 });
  // Sem descontar o pendente: 1000/10 = 100 dias (fora do horizonte).
  // Descontando: 700/10 = 70 dias (ainda fora). Verifica que descontou:
  assert.equal(p.series[0].projected, 700, 'serie comeca ja descontando a fila');
  assert.equal(p.pendingWithdrawals, 300);
});

test('projectCashFlow: pendente maior que o caixa = vermelho imediato', () => {
  const rows = [];
  for (let i = 40; i >= 1; i--) rows.push({ date: dayKeyOf(Date.now() - i * 86400000), net: 50 });
  const p = projectCashFlow({ dailySeries: rows, currentCash: 200, days: 30, pendingWithdrawals: 500 });
  assert.equal(p.daysToBreakeven, 0, 'ja quebra com o que esta na fila');
  assert.equal(p.breakevenDate, dayKeyOf(Date.now()));
});

test('buildDailySeries: saque usa approvedAt, nao createdAt', () => {
  // Pedido ha 40 dias, aprovado ontem. O dinheiro drenou ontem.
  const y = Date.now() - 86400000;
  const tx = [{
    type: 'withdraw', status: 'approved', amount: -500,
    createdAt: iso(Date.now() - 40 * DAY), approvedAt: iso(y)
  }];
  const rows = buildDailySeries({ transactions: tx, users: [], days: 45, now: Date.now() });
  const ontem = rows.find(r => r.date === dayKeyOf(y));
  assert.equal(ontem.withdrawals, 500, 'conta no dia da aprovacao');
  const antigo = rows.find(r => r.date === dayKeyOf(Date.now() - 40 * DAY));
  assert.equal(antigo.withdrawals, 0, 'nao conta no dia do pedido');
});

test('buildDailySeries: saque sem approvedAt cai no createdAt', () => {
  const tx = [{ type: 'withdraw', status: 'approved', amount: -90, createdAt: iso(BASE) }];
  const rows = buildDailySeries({ transactions: tx, users: [], days: 3, now: BASE });
  assert.equal(rows[rows.length - 1].withdrawals, 90);
});