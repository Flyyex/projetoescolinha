// Relatorio de saude da plataforma: obrigação vs caixa, tendencia e concentracao.
// Camada fina: lê dados, chama services/reports.js (matematica pura) e devolve JSON.
// Nenhuma conta acontece aqui - ela esta toda em reports.js, que tem testes.
//
// NAO e um router express independente de proposito: exporta um factory que o
// routes/admin.js monta, para herdar o adminAuthMiddleware dele. Sem isso
// duplicaria a checagem de chave - e dois lugares de seguranca divergem.

const { getAllUsers, getAllTransactions } = require('../database');
const reports = require('../services/reports');
const { getGatewayBalance, supportsBalanceRead } = require('../services/gatewayBalance');

function intParam(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Suspensao de saque e o sinal mais forte de risco: dinheiro pedido que
// o admin ainda nao enviou.
function pendingWithdrawals(allTx) {
  let amount = 0, count = 0;
  for (const t of allTx) {
    if (t && t.type === 'withdraw' && t.status === 'pending') {
      amount += Math.abs(reports.money(t.amount));
      count++;
    }
  }
  return { amount: reports.money(amount), count };
}

function mountReports(router) {

// GET /overview?days=30&gateway=asaas
router.get('/reports/overview', async (req, res) => {
  try {
    const days = intParam(req.query.days, 30, 7, 180);
    const gateway = String(req.query.gateway || 'asaas').trim().toLowerCase();

    const [allTxRaw, allUsersRaw] = await Promise.all([getAllTransactions(), getAllUsers()]);

    // Contas de teste com saldo fake: fora de todos os calculos (serie,
    // obrigacao, concentracao, projecao). Os saldos foram zerados no banco,
    // mas o historico continua la - sem esse filtro a serie herdaria o passado.
    const excludedIds = reports.resolveExcludedIds(allUsersRaw);
    const { users: allUsers, transactions: allTx } =
      reports.withoutExcludedUsers(allUsersRaw, allTxRaw, excludedIds);
    const pending = pendingWithdrawals(allTx);

    const dailySeries = reports.buildDailySeries({
      transactions: allTx,
      users: allUsers,
      days,
      now: Date.now()
    });

    // Leitura de saldo e opcional: se a gateway nao suportar ou falhar,
    // o relatorio inteiro ainda sobe - so sem o gap.
    let gatewayResult = { ok: false, gateway, error: 'nao solicitado' };
    if (supportsBalanceRead(gateway)) {
      gatewayResult = await getGatewayBalance(gateway);
    } else {
      gatewayResult = { ok: false, gateway, error: 'Gateway sem leitura de saldo disponivel.' };
    }

    const liability = reports.buildLiability({
      users: allUsers,
      pendingWithdrawalsAmount: pending.amount,
      gatewayBalance: gatewayResult.ok ? gatewayResult.balance : null
    });

    const concentration = reports.buildConcentration({ users: allUsers });

    const closedCount = reports.closedDays(dailySeries).length;
    const projection = reports.projectCashFlow({
      dailySeries,
      currentCash: gatewayResult.ok ? gatewayResult.balance : liability.withdrawable,
      days: 30,
      // A fila de saque e dreno imediato: entra na projecao como tal.
      pendingWithdrawals: pending.amount,
      // Sem a obrigacao, a projecao olha so para o caixa e ignora que o
      // earn cresce todo dia via drip/bonus. E esse lado que decide a ruptura.
      withdrawableNow: liability.withdrawable
    });

    const totals = dailySeries.reduce((acc, r) => {
      acc.deposits = reports.money(acc.deposits + r.deposits);
      acc.withdrawals = reports.money(acc.withdrawals + r.withdrawals);
      acc.earnings = reports.money(acc.earnings + r.earnings);
      return acc;
    }, { deposits: 0, withdrawals: 0, earnings: 0 });

    res.json({
      generatedAt: new Date().toISOString(),
      windowDays: days,
      totals: {
        ...totals,
        net: reports.money(totals.deposits - totals.withdrawals)
      },
      dailySeries,
      liability,
      concentration,
      projection: {
        reliable: projection.reliable,
        direction: projection.direction,
        dailyNet: projection.dailyNet,
        dailyObligation: projection.dailyObligation,
        gapDailyDelta: projection.gapDailyDelta,
        withdrawableNow: projection.withdrawableNow,
        currentCash: projection.currentCash,
        pendingWithdrawals: projection.pendingWithdrawals || 0,
        breakevenDate: projection.breakevenDate,
        daysToBreakeven: projection.daysToBreakeven,
        horizonDays: projection.horizonDays,
        series: projection.series || null,
        warning: projection.warning,
        sufficiency: projection.sufficiency
      },
      gateway: gatewayResult,
      pendingWithdrawals: pending,
      closedDays: closedCount,
      // Sinal unico pro card principal: vermelho quando o caixa nao cobre a obrigacao,
      // ou quando a projecao (confiavel ou nao) ja data a ruptura.
      health: liability.covered === false
        ? 'critical'
        : (projection.reliable && projection.direction === 'burning' && projection.daysToBreakeven != null
            ? 'warning'
            : (projection.reliable && projection.daysToBreakeven === 0 ? 'critical' : 'ok'))
    });
  } catch (err) {
    console.error('[ADMIN ERROR /reports/overview]:', err);
    res.status(500).json({ error: 'Erro ao montar o relatorio.' });
  }
});

// GET /reports/holders?limit=50 - quem segura o saldo, ordenado
router.get('/reports/holders', async (req, res) => {
  try {
    const limit = intParam(req.query.limit, 50, 1, 200);
    const allUsersRaw = await getAllUsers();
    const excludedIds = reports.resolveExcludedIds(allUsersRaw);
    const allUsers = allUsersRaw.filter(u => u && !excludedIds.has(String(u.id)));
    const concentration = reports.buildConcentration({ users: allUsers });

    const rows = allUsers
      .map(u => ({
        id: u.id,
        operatorName: u.operatorName || ('Operador #' + u.id),
        phone: u.phone || '',
        balance: reports.money(u.balance),
        investBalance: reports.money(u.investBalance),
        earnBalance: reports.money(u.earnBalance),
        totalDeposited: reports.money(u.totalDeposited),
        totalWithdrawn: reports.money(u.totalWithdrawn),
        createdAt: u.createdAt || '',
        share: concentration.total > 0
          ? Math.round((reports.money(u.balance) / concentration.total) * 10000) / 10000
          : 0
      }))
      .filter(r => r.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    res.json({
      rows,
      concentration: {
        total: concentration.total,
        holders: concentration.holders,
        top5Share: concentration.top5Share,
        top10Share: concentration.top10Share,
        top1Share: concentration.top1Share,
        concentrated: concentration.concentrated
      }
    });
  } catch (err) {
    console.error('[ADMIN ERROR /reports/holders]:', err);
    res.status(500).json({ error: 'Erro ao listar holders.' });
  }
});

} // fim de mountReports

module.exports = { mountReports };