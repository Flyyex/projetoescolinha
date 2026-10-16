const {
  getAllActiveContracts,
  findUserById,
  updateUser,
  updateContract,
  createTransaction
} = require('../database');
const { broadcastDailySettlement } = require('./telegramBot');

/**
 * Motor de liquidação diária: percorre todos os contratos ativos
 * e credita o ganho diário na carteira dos usuários
 */
async function processDailySettlement() {
  let settlementsProcessed = 0;
  let totalCredited = 0;

  if (isSundayOff()) {
    console.log('[SETTLEMENT] Domingo: folga das frotas, nenhum rendimento creditado.');
    return { settlementsProcessed, totalCredited, sundayOff: true };
  }
  try {
    const activeContracts = await getAllActiveContracts();

    for (const contract of activeContracts) {
      const user = await findUserById(contract.userId);
      if (user) {
        // Credita rendimento no saldo de SAQUE
        await updateUser(user.id, { earnBalanceInc: contract.dailyReturn, balanceInc: contract.dailyReturn });

        const remaining = contract.daysRemaining - 1;
        const newStatus = remaining <= 0 ? 'Finalizado' : contract.status;

        await updateContract(contract.id, {
          daysRemaining: remaining,
          status: newStatus,
          lastSettlement: new Date().toISOString()
        });

        // Registra transação de rendimento
        await createTransaction({
          id: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: user.id,
          type: 'income',
          amount: contract.dailyReturn,
          status: 'approved',
          description: `Rendimento Diário - ${contract.productName}`,
          createdAt: new Date().toISOString()
        });

        settlementsProcessed++;
        totalCredited += contract.dailyReturn;
      }
    }

    console.log(`[SETTLEMENT] Processados ${settlementsProcessed} contratos. Total creditado: R$ ${totalCredited.toFixed(2)}`);

    if (settlementsProcessed > 0) {
      broadcastDailySettlement({ settlementsProcessed, totalCredited });
    }
  } catch (err) {
    console.error('[SETTLEMENT ERROR]:', err);
  }

  return { settlementsProcessed, totalCredited };
}

const SLICES_PER_DAY = 24;

module.exports = { processDailySettlement, processDripSlice, settleDayNow, SLICES_PER_DAY, firstYieldDay };

// ==========================================
// GOTEJAMENTO: divide o rendimento diario em fatias de hora em hora.
// Total do dia sempre exato (resto distribuido nas primeiras fatias).
// ==========================================

function todayKey() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// Domingo é folga: frotas rendem de segunda a sábado (horário de Brasília)
function isSundayOff(refDate) {
  try {
    const d = refDate || new Date();
    const weekday = d.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
    return weekday === 'Sun';
  } catch (e) {
    return (refDate || new Date()).getUTCDay() === 0;
  }
}

// Regra (fixa, sem chave): contrato novo só começa a render no dia SEGUINTE
// ao da contratação. O dia de espera NÃO consome dia do plano (daysRemaining
// só cai depois de 24 fatias), igual à folga de domingo.
// Contratos já existentes têm startDate no passado -> a condição nunca é
// verdadeira, então ficam intocados.
function firstYieldDay(startDate) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return null;
  // +24h desloca a data de Brasília em exatamente 1 dia
  const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  try {
    return next.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch (e) {
    return next.toISOString().slice(0, 10);
  }
}

function sliceCents(totalCents, idx) {
  const base = Math.floor(totalCents / SLICES_PER_DAY);
  const rem = totalCents - base * SLICES_PER_DAY;
  return base + (idx < rem ? 1 : 0);
}

async function creditSlice(contract, user, idx) {
  const totalCents = Math.round(parseFloat(contract.dailyReturn || 0) * 100);
  const cents = sliceCents(totalCents, idx);
  if (cents <= 0) return 0;
  const value = cents / 100;
  const now = new Date().toISOString();
  // Rendimento vai para o saldo de SAQUE (atômico)
  await updateUser(contract.userId, { earnBalanceInc: value, balanceInc: value });
  await createTransaction({
    id: `TX-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    userId: contract.userId,
    type: 'income',
    amount: value,
    status: 'approved',
    description: `Rendimento Drone - ${contract.productName} (${idx + 1}/${SLICES_PER_DAY})`,
    createdAt: now
  });
  return value;
}

async function runSlices(maxSlices) {
  let slicesCredited = 0;
  let totalCredited = 0;
  // Folga de domingo: não credita nem consome dia de plano (segunda recomeça zerada)
  if (isSundayOff()) {
    console.log('[DRIP] Domingo: folga das frotas, nenhum rendimento creditado.');
    return { slicesCredited, totalCredited, sundayOff: true };
  }
  const today = todayKey();
  const activeContracts = await getAllActiveContracts();
  for (const contract of activeContracts) {
    // Cota recién comprada só rende a partir do dia seguinte
    const firstDay = firstYieldDay(contract.startDate);
    if (firstDay && today < firstDay) continue;
    try {
      const user = await findUserById(contract.userId);
      if (!user) continue;
      let day = contract.dripDay;
      let count = parseInt(contract.dripCount || 0, 10) || 0;
      if (day !== today) { day = today; count = 0; }
      let done = count;
      while (done < SLICES_PER_DAY && (maxSlices <= 0 || (done - count) < maxSlices)) {
        const v = await creditSlice(contract, user, done);
        totalCredited = Math.round((totalCredited + v) * 100) / 100;
        slicesCredited++;
        done++;
        user.balance = Math.round((parseFloat(user.balance || 0) + v) * 100) / 100;
      }
      const dayComplete = done >= SLICES_PER_DAY;
      const patch = { dripDay: today, dripCount: done, lastSettlement: new Date().toISOString() };
      if (dayComplete) {
        const remaining = (parseInt(contract.daysRemaining, 10) || 0) - 1;
        patch.daysRemaining = remaining;
        patch.dripCount = 0;
        if (remaining <= 0) patch.status = 'Finalizado';
      }
      await updateContract(contract.id, patch);
    } catch (err) {
      console.error('[DRIP ERROR contract ' + contract.id + ']:', err.message);
    }
  }
  return { slicesCredited, totalCredited };
}

// 1 fatia por chamada (cron de hora em hora)
async function processDripSlice() {
  try {
    const r = await runSlices(1);
    console.log(`[DRIP] fatias: ${r.slicesCredited}, total: R$ ${r.totalCredited.toFixed(2)}`);
    return r;
  } catch (err) {
    console.error('[DRIP ERROR]:', err.message);
    return { slicesCredited: 0, totalCredited: 0 };
  }
}

// Completa o dia atual de uma vez (botao liquidar + catch-up)
async function settleDayNow() {
  try {
    const r = await runSlices(0);
    console.log(`[SETTLE-DAY] fatias: ${r.slicesCredited}, total: R$ ${r.totalCredited.toFixed(2)}`);
    if (r.slicesCredited > 0) {
      broadcastDailySettlement({ settlementsProcessed: r.slicesCredited, totalCredited: r.totalCredited });
    }
    return r;
  } catch (err) {
    console.error('[SETTLE-DAY ERROR]:', err.message);
    return { slicesCredited: 0, totalCredited: 0 };
  }
}


