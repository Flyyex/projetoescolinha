const express = require('express');
// Premio do Programa Social. Constante compartilhada com services/social.js
// (o teste social-db trava que as duas nao divergem).
const { REWARD_AMOUNT } = require('../services/social');
const router = express.Router();
const {
  getPendingSocialPosts,
  getSocialStats,
  approveSocialPost,
  rejectSocialPost,
  markSocialCredited,
  getGlobalMetrics,
  getAllTransactions,
  findTransactionById,
  updateTransaction,
  getAllUsers,
  getTransactionsByUserId,
  findUserById,
  findUserByPhone,
  createUser,
  updateUser,
  deleteUser,
  getContractsByUserId,
  createContract,
  deleteContract,
  createTransaction,
  deleteTransaction,
  claimWithdrawal,
  getAllProducts,
  findProductById,
  updateProduct,
  getAnalyticsMetrics,
  getWebhookLogs,
  findWebhookLogById,
  updateWebhookLog,
  getSystemSettings,
  updateSystemSetting,
  normalizeGatewayOrder,
  getGatewayOrder,
  normalizeGatewayDisabled,
  getGatewayDisabled,
  getMoneyLimits,
  getPixChargeStats,
  newUserId,
  newInviteCode,
  findUserByInviteCode,
  newContractId,
  normPromoCode,
  createPromoCode,
  listPromoCodes,
  setPromoActive,
  deletePromoCode,
  sendSupportMessage,
  getSupportMessages,
  getSupportThreads,
  markSupportRead
} = require('../database');

const { processDripSlice } = require('../services/settlementEngine');
const { isMisticEnabled, sendPixTransfer: sendMisticPix, getMisticStatus, checkTransaction: checkMisticTransaction } = require('../services/misticpay');
const { isAsaasEnabled, sendPixTransfer: sendAsaasPix } = require('../services/asaas');
const crmDb = require('../services/crmDb');
const {
  calculateUserNetwork,
  evaluateUserRank,
  getUserCareerOverview,
  distributeCareerCommissions,
  RANKS
} = require('../services/careerEngine');

const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD;

// Sem ADMIN_KEY/ADMIN_PASSWORD configurado, o painel admin nao sobe em nenhum ambiente.
if (!ADMIN_KEY) {
  throw new Error('[SECURITY] ADMIN_KEY não definida. Configure a variável de ambiente ADMIN_KEY ou ADMIN_PASSWORD.');
}

// Rota pública para configurações do frontend (WhatsApp, Pixel)
router.get('/public-settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    const limits = await getMoneyLimits();
    res.json({
      whatsappNumber: settings.whatsappNumber,
      metaPixelId: settings.metaPixelId,
      tiktokPixelId: settings.tiktokPixelId,
      minDeposit: limits.minDeposit,
      minWithdraw: limits.minWithdraw,
      withdrawFee: limits.withdrawFee
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar configurações públicas.' });
  }
});

// Rota para validar a Chave de Administrador
let lastVerifyAlertAt = 0;
router.post('/auth/verify', (req, res) => {
  const { key } = req.body;
  if (key && key.trim() === ADMIN_KEY) {
    return res.json({ authenticated: true, message: 'Acesso administrativo concedido.' });
  }
  // Alerta anti-invasão (throttle 5 min p/ não virar spam)
  try {
    if (Date.now() - lastVerifyAlertAt > 5 * 60 * 1000) {
      lastVerifyAlertAt = Date.now();
      const { notifyAdminSecurityAlert } = require('../services/telegramBot');
      const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || '');
      notifyAdminSecurityAlert({
        title: 'Tentativa de acesso ao /admin com chave inválida',
        detail: 'IP: ' + ip
      }).catch(() => {});
    }
  } catch (e) {}
  return res.status(401).json({ authenticated: false, error: 'Chave de Administrador inválida.' });
});

// Middleware de Proteção para todas as rotas administrativas
function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (key && key === ADMIN_KEY) {
    return next();
  }

  return res.status(401).json({ error: 'Acesso não autorizado. Chave de Administrador necessária.' });
}

router.use(adminAuthMiddleware);

// ============ PROGRAMA SOCIAL (admin) ============
// Tudo abaixo do router.use acima, entao ja fica atras da chave de admin.
// Importante: sem isso o /api/* cai no crmRouter, que responde 401 "CRM:
// autenticacao necessaria" e faz um teste de seguranca passar por engano.

router.get('/social/pending', async (req, res) => {
  try {
    const [posts, stats] = await Promise.all([getPendingSocialPosts(), getSocialStats()]);
    res.json({ posts, stats, reward: REWARD_AMOUNT });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /pending]:', err);
    res.status(500).json({ error: 'Erro ao carregar a fila de vídeos.' });
  }
});

router.get('/social/history', async (req, res) => {
  try {
    const stats = await getSocialStats();
    res.json({ stats });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /history]:', err);
    res.status(500).json({ error: 'Erro ao carregar o histórico.' });
  }
});

// Aprova e credita R$ 1,00 no saldo INVESTIR da pessoa.
//
// A ordem importa. approveSocialPost so marca `approved` se a linha ainda
// estiver `pending` (UPDATE ... WHERE status='pending'), e o credito so roda
// se veio ok:true. Aprovar duas vezes, recarregar a pagina ou abrir em duas
// abas -> nao paga duas vezes. E por isso que o valor vem da constante e
// nunca do corpo da requisicao.
//
// Recusar depois de aprovado nao desconta: o dinheiro ja foi liberado para a
// pessoa e nao ha como reverter isso.
router.post('/social/:id/approve', async (req, res) => {
  try {
    const r = await approveSocialPost(req.params.id);

    // Reparo: o post ja foi aprovado numa tentativa anterior, mas o credito
    // nunca foi confirmado (falha de banco no meio). Sem este caminho o R$ 1
    // ficava perdido para sempre e o admin nao tinha como recuperar.
    if (!r.ok && r.alreadyDone && r.post && r.post.status === 'approved' && r.post.precisaCredito) {
      const reparo = await creditarSocial(req.params.id, r.post);
      return res.status(reparo.ok ? 200 : 500).json(reparo);
    }

    if (!r.ok) {
      return res.status(r.alreadyDone ? 409 : 404)
        .json({ ok: false, alreadyDone: !!r.alreadyDone, error: r.error || 'Este vídeo já foi analisado.' });
    }
    const reparo = await creditarSocial(r.post.id, r.post);
    if (!reparo.ok) {
      return res.status(500).json({ ok: false, error: reparo.error });
    }
    const stats = await getSocialStats();
    res.json({ ok: true, post: r.post, reparado: reparo.reparado, stats });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /approve]:', err);
    res.status(500).json({ error: 'Erro ao aprovar o vídeo.' });
  }
});

// Credita o R$ 1 de um post aprovado. Incremento atomico (nunca valor
// absoluto) e marcacao de "creditado" so DEPOIS que o saldo foi mexido.
async function creditarSocial(postId, post) {
  try {
    const user = await findUserById(post.userId);
    if (!user) {
      // Sem usuario nao ha para quem creditar: o post fica marcado como nao
      // creditado e volta para a fila, em vez de sumir.
      console.error('[ADMIN SOCIAL] post sem usuário:', postId, post.userId);
      return { ok: false, error: 'Operador do vídeo não existe mais.' };
    }
    const reward = REWARD_AMOUNT;
    await updateUser(post.userId, { investBalanceInc: reward, balanceInc: reward });
    await createTransaction({
      id: postId + '-C',
      userId: post.userId,
      type: 'commission',
      amount: reward,
      status: 'approved',
      description: 'Vídeo aprovado no programa social',
      createdAt: new Date().toISOString()
    });
    const reparado = await markSocialCredited(postId);
    return { ok: true, reparado };
  } catch (err) {
    console.error('[ADMIN SOCIAL] falha ao creditar:', postId, err && err.message);
    return { ok: false, error: 'O saldo não pôde ser creditado. Tente de novo.' };
  }
}

router.post('/social/:id/reject', async (req, res) => {
  try {
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
    const r = await rejectSocialPost(req.params.id, reason);
    if (!r.ok) {
      return res.status(r.alreadyDone ? 409 : 404)
        .json({ ok: false, alreadyDone: !!r.alreadyDone, error: r.error || 'Este vídeo já foi analisado.' });
    }
    res.json({ ok: true, post: r.post });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /reject]:', err);
    res.status(500).json({ error: 'Erro ao recusar o vídeo.' });
  }
});

// Diagnóstico das gateways (protegido; sem segredos: só status + último erro da Mistic)
router.get('/gateways', async (req, res) => {
  try {
    const { isSyncPayEnabled } = require('../services/syncpay');
    const { isAsaasEnabled } = require('../services/asaas');
    res.json({
      mistic: getMisticStatus(),
      syncpay: { enabled: isSyncPayEnabled() },
      asaas: { enabled: isAsaasEnabled() },
      cartpanda: { enabled: true, mode: process.env.CARTPANDA_API_TOKEN ? 'api' : 'simulated' },
      order: await getGatewayOrder(),
      disabled: await getGatewayDisabled()
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar gateways.' });
  }
});

// Origem dos leads: de qual anuncio/campanha veio cada cadastro.
// Le os UTMs + fbclid que o app salva no lead no momento do cadastro.
router.get('/leads-origin', async (req, res) => {
  try {
    const leads = crmDb.getLeads ? crmDb.getLeads() : [];
    // Padroes antigos ("meta_ads"/"frotas_escala") eram preenchidos quando o lead
    // NAO tinha parametro de campanha. Traduzir pra "direto" pra nao mentir.
    const CAMPANHA_PADRAO_ANTIGA = ['frotas_escala', 'truckauto - cadastro direto'];
    const rows = leads.map(l => {
      const fbc = l.fbclid || '';
      const criativo = l.utm_content || '';
      const palavra = l.utm_term || '';
      const campanhaBruta = l.utm_campaign || '';
      const veioDeAnuncio = !!fbc || !!criativo || !!palavra ||
        !CAMPANHA_PADRAO_ANTIGA.includes(String(campanhaBruta).toLowerCase().trim());
      return {
        id: l.id,
        nome: l.name || '',
        telefone: l.phone || '',
        etapa: l.stage || '',
        valor: parseFloat(l.value || 0),
        veioDeAnuncio,
        origem: veioDeAnuncio ? (l.utm_source || 'facebook') : 'direto',
        campanha: veioDeAnuncio ? campanhaBruta : '',
        criativo,
        palavra,
        fbclid: fbc,
        criadoEm: l.createdAt || ''
      };
    });

    // Resumo por campanha (so o que realmente veio de anuncio)
    const porCampanha = {};
    for (const r of rows) {
      const k = r.veioDeAnuncio ? (r.campanha || '(sem nome de campanha)') : '(direto / sem anúncio)';
      if (!porCampanha[k]) porCampanha[k] = { campanha: k, leads: 0, origem: r.origem || '', criativos: {}, palavras: {}, valor: 0, deAnuncio: r.veioDeAnuncio };
      porCampanha[k].leads++;
      porCampanha[k].valor += r.valor;
      if (r.criativo) porCampanha[k].criativos[r.criativo] = (porCampanha[k].criativos[r.criativo] || 0) + 1;
      if (r.palavra) porCampanha[k].palavras[r.palavra] = (porCampanha[k].palavras[r.palavra] || 0) + 1;
    }
    const resumo = Object.values(porCampanha).sort((a, b) => b.leads - a.leads);
    const deAnuncio = rows.filter(r => r.veioDeAnuncio).length;

    res.json({ rows, resumo, total: rows.length, deAnuncio, diretos: rows.length - deAnuncio });
  } catch (err) {
    console.error('[ADMIN ERROR /leads-origin]:', err);
    res.status(500).json({ error: 'Erro ao buscar origem dos leads.' });
  }
});

// ==========================================
// 1. MÉTRICAS & ANALYTICS
// ==========================================
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getGlobalMetrics();
    const analytics = await getAnalyticsMetrics();
    const allUsers = await getAllUsers();
    const allTx = await getAllTransactions();
    const pixStats = await getPixChargeStats();

    const pendingWithdrawalsAmount = allTx
      .filter(t => t.type === 'withdraw' && t.status === 'pending')
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

    // Contagem de liderança do plano de carreira
    const rankCounts = { bronze: 0, prata: 0, ouro: 0, rubi: 0, diamante: 0, black_diamond: 0 };
    for (const u of allUsers) {
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      if (evalRank && rankCounts[evalRank.id] !== undefined) rankCounts[evalRank.id]++;
    }

    res.json({
      totalDeposited: parseFloat(metrics.totalDeposits || 0),

      totalDistributed: parseFloat(metrics.totalWithdrawals || 0),
      pendingWithdrawalsCount: parseInt(metrics.pendingWithdrawalsCount || 0, 10),
      pendingWithdrawalsAmount: pendingWithdrawalsAmount,
      totalUsers: parseInt(metrics.totalUsers || 0, 10),
      activeContractsCount: parseInt(metrics.activeContracts || 0, 10),
      totalCustodyBalance: parseFloat(metrics.totalCustodyBalance || 0),
      withdrawFee: (await getMoneyLimits()).withdrawFee,
      pixGeneratedCount: pixStats.generatedCount,
      pixGeneratedAmount: parseFloat(pixStats.generatedAmount || 0),
      pixPaidCount: pixStats.paidCount,
      pixPaidAmount: parseFloat(pixStats.paidAmount || 0),
      todayUniqueVisitors: analytics.todayUniqueVisitors || 0,
      todayPresellViews: analytics.todayPresellViews || 0,
      todayAppViews: analytics.todayAppViews || 0,
      todayTotalViews: analytics.todayTotalViews || 0,
      rankCounts
    });
  } catch (err) {
    console.error('[ADMIN ERROR /metrics]:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas administrativas.' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const analytics = await getAnalyticsMetrics();
    res.json(analytics);
  } catch (err) {
    console.error('[ADMIN ERROR /analytics]:', err);
    res.status(500).json({ error: 'Erro ao carregar dados de analytics.' });
  }
});

// ==========================================
// 2. GESTÃO DE SAQUES (PIX)
// ==========================================
router.get('/withdrawals', async (req, res) => {
  try {
    const allTx = await getAllTransactions();
    const withdrawals = allTx.filter(t => t.type === 'withdraw');
    
    const enrichedWithdrawals = await Promise.all(withdrawals.map(async (t) => {
      const user = await findUserById(t.userId);
      const userContracts = user ? await getContractsByUserId(user.id) : [];
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      const totalDeposited = parseFloat(user ? user.totalDeposited || 0 : 0);
      const hasDeposited = Boolean(totalDeposited > 0 || activeContracts.length > 0);

      const commBal = user ? parseFloat(user.commissionBalance || 0) : 0;
      const dailyBal = user ? parseFloat(user.dailyReturnsBalance || 0) : 0;

      return {
        ...t,
        userName: user ? user.operatorName : 'Operador #' + t.userId,
        userPhone: user ? user.phone : 'Não informado',
        userBalance: user ? parseFloat(user.balance || 0) : 0,
        commissionBalance: commBal,
        dailyReturnsBalance: dailyBal,
        isLevel3: user ? (Boolean(user.isLevel3) || Boolean(user.forceLevel3Unlocked)) : false,
        totalDeposited: totalDeposited,
        activeContractsCount: activeContracts.length,
        hasDeposited: hasDeposited,
        activeContractsNames: activeContracts.map(c => c.productName).join(', ')
      };
    }));

    enrichedWithdrawals.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json(enrichedWithdrawals);
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals]:', err);
    res.status(500).json({ error: 'Erro ao listar saques.' });
  }
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  let payoutSent = false;
  try {
    const { id } = req.params;
    // Reserva atômica: só 1 aprovação avança (clique duplo não paga 2x)
    const tx = await claimWithdrawal(id);
    if (!tx) {
      const existing = await findTransactionById(id);
      if (!existing) return res.status(404).json({ error: 'Transação não encontrada.' });
      if (existing.type !== 'withdraw') return res.status(400).json({ error: 'Somente saques podem ser aprovados aqui.' });
      return res.status(409).json({ error: `Saque já está com status "${existing.status}".` });
    }

    // Controle manual: ao aprovar, envia o Pix seguindo a ordem configurada no admin
    const { withdrawFee } = await getMoneyLimits();
    const grossVal = Math.abs(parseFloat(tx.amount || 0));
    const feeVal = Math.round(grossVal * (withdrawFee / 100) * 100) / 100;
    const netVal = Math.round((grossVal - feeVal) * 100) / 100;
    const pixKey = tx.pixKey;
    if (!pixKey) return res.status(400).json({ error: 'Saque sem chave Pix cadastrada.' });

    const gatewaySenders = {
      misticpay: () => (isMisticEnabled() ? sendMisticPix({ amount: netVal, pixKey, pixKeyTypeHint: tx.pixKeyType, description: `Saque TruckAuto ${id}` }) : null),
      syncpay: () => null,
      asaas: () => (isAsaasEnabled() ? sendAsaasPix({ amount: netVal, pixKey, description: `Saque TruckAuto ${id}` }) : null),
      cartpanda: () => null
    };
    let transferId = null;
    let payoutError = null;
    for (const gwName of await getGatewayOrder()) {
      const sender = gatewaySenders[gwName];
      if (!sender) continue;
      try {
        const payout = await sender();
        // `success` do gateway e a verdade: o Pix JA SAIU da conta.
        // O id pode vir vazio -> nesse caso NUNCA reverte pra pendente (evita pagar 2x).
        if (payout && payout.success) { payoutSent = true; transferId = payout.transferId || null; break; }
        if (payout) payoutError = payout.error;
      } catch (e) {
        payoutError = e.message;
      }
    }
    if (!payoutSent) {
      await updateTransaction(id, { status: 'pending' });
      return res.status(502).json({ error: 'Falha ao enviar o Pix (' + (payoutError || 'gateway indisponível') + '). Saque continua pendente.' });
    }

    const updatedTx = await updateTransaction(id, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      ...(transferId ? { externalId: transferId } : {})
    });

    res.json({
      message: `Saque aprovado e Pix de R$ ${netVal.toFixed(2)} enviado!` + (transferId ? '' : ' (gateway nao retornou o id do Pix)'),
      tx: updatedTx
    });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/approve]:', err);
    // So reverte se o Pix NAO saiu; jamais reabrir um saque ja pago
    if (!payoutSent) { try { await updateTransaction(req.params.id, { status: 'pending' }); } catch (e) {} }
    res.status(500).json({ error: payoutSent ? 'Pix ja enviado, mas falhou ao salvar. Confira o status do saque.' : 'Erro ao aprovar saque. Status revertido para pendente.' });
  }
});

// Fecha um saque que o admin JA pagou na mao (Pix fora do gateway).
// Nao reenvia Pix e Nao mexe no saldo: o valor ja foi debitado no pedido do saque.
router.post('/withdrawals/:id/manual-paid', async (req, res) => {
  try {
    const { id } = req.params;
    // Aceita o saque normal (pending) E o que travou preso em processing
    const preso = (await claimWithdrawal(id, 'processing')) ? true : false;
    const tx = preso ? true : await claimWithdrawal(id, 'pending');
    if (!tx) {
      const existing = await findTransactionById(id);
      if (!existing) return res.status(404).json({ error: 'Transação não encontrada.' });
      if (existing.type !== 'withdraw') return res.status(400).json({ error: 'Somente saques podem ser fechados aqui.' });
      return res.status(409).json({ error: `Saque já está com status "${existing.status}".` });
    }
    const updatedTx = await updateTransaction(id, {
      status: 'approved',
      approvedAt: new Date().toISOString()
    });
    res.json({
      message: (preso ? 'Saque destravado e marcado como pago manualmente (estava preso em processing).' : 'Saque marcado como pago manualmente.'),
      wasStuck: preso,
      tx: updatedTx
    });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/manual-paid]:', err);
    res.status(500).json({ error: 'Erro ao fechar saque pago na mão.' });
  }
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    // Reserva atômica: evita estorno duplo em clique duplo
    const tx = await claimWithdrawal(id);
    if (!tx) {
      const existing = await findTransactionById(id);
      if (!existing) return res.status(404).json({ error: 'Transação não encontrada.' });
      return res.status(409).json({ error: `Saque já está com status "${existing.status}".` });
    }

    const updatedTx = await updateTransaction(id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    });

    const user = await findUserById(tx.userId);
    if (user) {
      const refundAmount = Math.abs(tx.amount);
      await updateUser(user.id, {
        earnBalanceInc: refundAmount,
        balanceInc: refundAmount,
        totalWithdrawn: Math.max(0, (user.totalWithdrawn || 0) - refundAmount)
      });
    }

    res.json({ message: 'Saque rejeitado e saldo estornado ao usuário!', tx: updatedTx });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/reject]:', err);
    res.status(500).json({ error: 'Erro ao rejeitar saque.' });
  }
});

// Consulta o estado REAL do saque na MisticPay (somente leitura, nao altera nada)
const MISTIC_STATE_PT = {
  PENDENTE: 'Na fila da MisticPay — ainda nao saiu',
  COMPLETO: 'Liquidado: o Pix caiu na conta',
  COMPLETA: 'Liquidado: o Pix caiu na conta',
  FALHA: 'FALHOU na MisticPay',
  CANCELADO: 'Cancelado na MisticPay',
  CANCELLED: 'Cancelado na MisticPay',
  QUEUED: 'Na fila da MisticPay — ainda nao saiu'
};
router.post('/withdrawals/:id/check-gateway', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);
    if (!tx || tx.type !== 'withdraw') return res.status(404).json({ error: 'Saque não encontrado.' });
    if (!tx.externalId) {
      return res.status(400).json({ error: 'Este saque não tem id da gateway — nenhum Pix foi enviado por nós. Se você pagou na mão, feche com "Já paguei".' });
    }
    if (!isMisticEnabled()) return res.status(400).json({ error: 'MisticPay não configurada (MISTIC_PK/SK).' });

    const r = await checkMisticTransaction(tx.externalId);
    if (!r.success) return res.status(502).json({ error: r.error });

    let msg = (MISTIC_STATE_PT[r.state] || ('Estado: ' + r.state));
    if (r.state === 'PENDENTE' || r.state === 'QUEUED') {
      msg += '. A Mistic ainda nao conseguiu enviar (chave Pix invalida/nao resolvida e o mais comum). ' +
             'O valor fica RESERVADO no saldo dela. Cancele esse saque no painel da MisticPay e peca uma chave CPF ou celular ao operador.';
    }
    res.json({
      message: msg,
      state: r.state,
      stateLabel: MISTIC_STATE_PT[r.state] || r.state,
      type: r.type,
      value: r.value,
      fee: r.fee,
      bank: r.bank,
      e2e: r.e2e,
      updatedAt: r.updatedAt,
      gatewayId: tx.externalId
    });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/check-gateway]:', err);
    res.status(500).json({ error: 'Erro ao consultar a gateway.' });
  }
});

// ==========================================
// 2b. GESTÃO DE DEPÓSITOS (auditoria do Total Depositado)
// ==========================================
router.get('/deposits', async (req, res) => {
  try {
    const allTx = await getAllTransactions();
    const deposits = allTx
      .filter(t => t.type === 'deposit')
      .map(t => ({
        id: t.id,
        userId: t.userId,
        userName: t.userName || null,
        userPhone: t.userPhone || null,
        amount: parseFloat(t.amount || 0),
        status: t.status,
        description: t.description || '',
        createdAt: t.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const approved = deposits.filter(d => d.status === 'approved');
    res.json({
      deposits,
      summary: {
        count: deposits.length,
        approvedCount: approved.length,
        approvedSum: approved.reduce((a, d) => a + d.amount, 0)
      }
    });
  } catch (err) {
    console.error('[ADMIN ERROR /deposits]:', err);
    res.status(500).json({ error: 'Erro ao listar depósitos.' });
  }
});

// Extrato de um usuário (suporte: ver bônus, saques, depósitos)
router.get('/users/:id/transactions', async (req, res) => {
  try {
    const txs = await getTransactionsByUserId(req.params.id);
    res.json(Array.isArray(txs) ? txs : []);
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/transactions]:', err);
    res.status(500).json({ error: 'Erro ao buscar extrato.' });
  }
});

// Excluir depósito (testes/duplicados): ajusta saldo e total do operador sem negativar
router.delete('/deposits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);
    if (!tx || tx.type !== 'deposit') {
      return res.status(404).json({ error: 'Depósito não encontrado.' });
    }
    const amount = Math.abs(parseFloat(tx.amount || 0));
    if (tx.status === 'approved') {
      const user = await findUserById(tx.userId);
      if (user) {
        const newInvest = Math.max(0, (user.investBalance || 0) - amount);
        await updateUser(user.id, {
          investBalance: newInvest,
          balance: Math.round((newInvest + (user.earnBalance || 0)) * 100) / 100,
          totalDeposited: Math.max(0, (user.totalDeposited || 0) - amount)
        });
      }
    }
    await deleteTransaction(id);
    res.json({ message: 'Depósito excluído e totais do operador ajustados!' });
  } catch (err) {
    console.error('[ADMIN ERROR /deposits/:id/delete]:', err);
    res.status(500).json({ error: 'Erro ao excluir depósito.' });
  }
});

// Excluir registro de saque (testes/limpeza). Se estava pendente, estorna o saldo.
router.delete('/withdrawals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tx = await findTransactionById(id);
    if (!tx || tx.type !== 'withdraw') {
      return res.status(404).json({ error: 'Saque não encontrado.' });
    }

    let refunded = false;
    if (tx.status === 'pending') {
      const user = await findUserById(tx.userId);
      if (user) {
        const refundAmount = Math.abs(tx.amount);
        await updateUser(user.id, {
          earnBalanceInc: refundAmount,
          balanceInc: refundAmount,
          totalWithdrawn: Math.max(0, (user.totalWithdrawn || 0) - refundAmount)
        });
        refunded = true;
      }
    }

    await deleteTransaction(id);
    res.json({ message: refunded ? 'Saque excluído e saldo estornado ao usuário!' : 'Saque excluído!' });
  } catch (err) {
    console.error('[ADMIN ERROR /withdrawals/:id/delete]:', err);
    res.status(500).json({ error: 'Erro ao excluir saque.' });
  }
});

// ==========================================
// 3. GESTÃO DE USUÁRIOS & PLANO DE CARREIRA
// ==========================================
router.get('/users', async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const allTx = await getAllTransactions();
    const usersList = await Promise.all(allUsers.map(async (u) => {
      const userContracts = await getContractsByUserId(u.id);
      const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
      const hasDeposited = Boolean((u.totalDeposited && u.totalDeposited > 0) || (u.balance && u.balance > 0) || activeContracts.length > 0);
      
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      const rank = evalRank || { id: 'bronze', name: 'Operador Bronze', badge: '🥉 Bronze', icon: '🥉' };

      let defaultStatus = 'new';
      if (activeContracts.length > 0) defaultStatus = 'active';

      const totalBal = parseFloat(u.balance || 0);
      const userCommTx = allTx
        .filter(t => t.userId === u.id && t.type === 'commission' && t.status === 'approved')
        .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

      let commBal = parseFloat(u.commissionBalance !== undefined && u.commissionBalance !== null ? u.commissionBalance : 0);
      let dailyBal = parseFloat(u.dailyReturnsBalance !== undefined && u.dailyReturnsBalance !== null ? u.dailyReturnsBalance : 0);
      if (commBal === 0 && dailyBal === 0) {
        const incomeTotal = allTx
          .filter(t => t.userId === u.id && t.type === 'income' && t.status === 'approved')
          .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);
        const wdTotal = allTx
          .filter(t => t.userId === u.id && t.type === 'withdraw' && t.status !== 'rejected')
          .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);
        dailyBal = Math.max(0, Math.min(totalBal, incomeTotal - wdTotal));
        commBal = Math.max(0, Math.min(totalBal - dailyBal, userCommTx));
        dailyBal = Math.round(dailyBal * 100) / 100;
        commBal = Math.round(commBal * 100) / 100;
      }

      return {
        id: u.id,
        operatorName: u.operatorName || `Operador #${u.id}`,
        phone: u.phone,
        balance: totalBal,
        investBalance: parseFloat(u.investBalance || 0),
        earnBalance: parseFloat(u.earnBalance || 0),
        commissionBalance: commBal,
        dailyReturnsBalance: dailyBal,
        totalDeposited: parseFloat(u.totalDeposited || 0),
        totalWithdrawn: parseFloat(u.totalWithdrawn || 0),
        vipLevel: u.vipLevel || 'VIP 1',
        careerRankId: rank.id,
        careerRankName: rank.name,
        careerRankBadge: rank.badge,
        careerRankIcon: rank.icon,
        isLevel3: Boolean(u.isLevel3) || Boolean(u.forceLevel3Unlocked) || (net.l1.length >= 5 && net.totalTeam >= 15),
        forceLevel3Unlocked: Boolean(u.forceLevel3Unlocked),
        totalDirects: net.l1.length,
        totalTeam: net.totalTeam,
        inviteCode: u.inviteCode,
        activeContractsCount: activeContracts.length,
        activeContractsNames: activeContracts.map(c => c.productName).join(', ') || 'Nenhuma frota ativa',
        hasDeposited: hasDeposited,
        crmStatus: u.crmStatus || defaultStatus,
        crmNotes: u.crmNotes || '',
        createdAt: u.createdAt || new Date().toISOString()
      };
    }));

    usersList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(usersList);
  } catch (err) {
    console.error('[ADMIN ERROR /users]:', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Ajuste Fino de Saldo (Geral, Comissão ou Rendimento)
router.post('/users/:id/adjust-balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type = 'general' } = req.body;
    const numAmount = parseFloat(amount);

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const newInvest = type === 'invest'
      ? Math.max(0, Math.round(((user.investBalance || 0) + numAmount) * 100) / 100)
      : Math.round(parseFloat(user.investBalance || 0) * 100) / 100;
    const newEarn = type === 'invest'
      ? Math.round(parseFloat(user.earnBalance || 0) * 100) / 100
      : Math.max(0, Math.round(((user.earnBalance || 0) + numAmount) * 100) / 100);
    const newTotalBalance = Math.round((newInvest + newEarn) * 100) / 100;
    // Ajuste manual: tipo invest vai p/ investir; demais (earn/saque/geral/comissão/diário) vão p/ saque
    const updatePayload = { investBalance: newInvest, earnBalance: newEarn, balance: newTotalBalance };

    if (type === 'commission') {
      updatePayload.commissionBalance = Math.max(0, (user.commissionBalance || 0) + numAmount);
    } else if (type === 'daily') {
      updatePayload.dailyReturnsBalance = Math.max(0, (user.dailyReturnsBalance || 0) + numAmount);
    }

    await updateUser(user.id, updatePayload);

    await createTransaction({
      id: `ADJ-${Date.now()}`,
      userId: user.id,
      type: 'adjustment',
      amount: numAmount,
      status: 'approved',
      description: `Ajuste Administrativo de Saldo (${type === 'invest' ? 'Investir' : 'Saque'}) (${numAmount > 0 ? '+' : ''} R$ ${numAmount.toFixed(2)})`,
      createdAt: new Date().toISOString()
    });

    res.json({ message: 'Saldo ajustado com sucesso!', newBalance: newTotalBalance });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/adjust-balance]:', err);
    res.status(500).json({ error: 'Erro ao ajustar saldo.' });
  }
});

// Contratos do usuário (para gestão de frotas)
router.get('/users/:id/contracts', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const contracts = await getContractsByUserId(req.params.id);
    res.json(contracts);
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/contracts]:', err);
    res.status(500).json({ error: 'Erro ao listar contratos.' });
  }
});

// Conceder drone/ponto (grátis, sem limites - ação administrativa)
router.post('/users/:id/grant-contract', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const product = await findProductById(req.body.productId);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    const now = new Date().toISOString();
    const contract = {
      id: newContractId(),
      userId: user.id,
      productId: product.id,
      productName: product.name,
      dailyReturn: product.dailyReturn,
      totalDays: product.periodDays,
      daysRemaining: product.periodDays,
      status: 'Em corrida',
      startDate: now,
      lastSettlement: now
    };
    await createContract(contract);
    await createTransaction({
      id: `TX-${Date.now()}`,
      userId: user.id,
      type: 'contract',
      amount: 0,
      status: 'approved',
      description: `Concessão administrativa de ${product.name}`,
      createdAt: now
    });
    res.status(201).json({ message: `${product.name} concedido!`, contract });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/grant-contract]:', err);
    res.status(500).json({ error: 'Erro ao conceder.' });
  }
});

// Retirar drone/ponto (sem reembolso - ajuste o saldo manualmente se precisar)
router.delete('/contracts/:contractId', async (req, res) => {
  try {
    const ok = await deleteContract(req.params.contractId);
    if (!ok) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }
    res.json({ message: 'Contrato retirado!' });
  } catch (err) {
    console.error('[ADMIN ERROR /contracts/:contractId]:', err);
    res.status(500).json({ error: 'Erro ao retirar.' });
  }
});

// Excluir Usuário (remove contratos e transações junto - CASCADE)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if ((user.balance || 0) > 0 || (user.totalDeposited || 0) > 0) {
      return res.status(400).json({ error: 'Usuário possui saldo ou depósitos. Zere antes de excluir.' });
    }
    const ok = await deleteUser(id);
    if (!ok) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    res.json({ message: 'Usuário excluído com sucesso!', id });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/delete]:', err);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

// Interruptor Individual da Trava Nível 3 (Liberar/Bloquear Saque Diário)
router.post('/users/:id/toggle-level3', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const currentLock = Boolean(user.forceLevel3Unlocked);
    const newStatus = !currentLock;

    await updateUser(user.id, { forceLevel3Unlocked: newStatus, isLevel3: newStatus });
    res.json({
      message: newStatus ? 'Trava Nível 3 LIBERADA para este operador!' : 'Trava Nível 3 ATIVADA (padrão de rede).',
      forceLevel3Unlocked: newStatus
    });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/toggle-level3]:', err);
    res.status(500).json({ error: 'Erro ao alterar trava Nível 3.' });
  }
});

// Promoção / Override Manual de Patente do Plano de Carreira
router.post('/users/:id/override-rank', async (req, res) => {
  try {
    const { id } = req.params;
    const { rankId, creditBonus = false } = req.body;

    const rank = RANKS.find(r => r.id === rankId);
    if (!rank) return res.status(400).json({ error: 'Patente inválida.' });

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const updateData = { careerRank: rank.id };
    if (rank.id === 'ouro' || rank.id === 'rubi' || rank.id === 'diamante' || rank.id === 'black_diamond') {
      updateData.forceLevel3Unlocked = true;
      updateData.isLevel3 = true;
    }

    if (creditBonus && rank.bonus > 0) {
      updateData.balance = (user.balance || 0) + rank.bonus;
      updateData.commissionBalance = (user.commissionBalance || 0) + rank.bonus;
      await createTransaction({
        id: `BONUS-${rank.id.toUpperCase()}-${Date.now()}`,
        userId: user.id,
        type: 'bonus',
        amount: rank.bonus,
        status: 'approved',
        description: `Bônus Administrativo de Promoção de Patente: ${rank.badge} (+ R$ ${rank.bonus.toFixed(2)})`,
        createdAt: new Date().toISOString()
      });
    }

    await updateUser(user.id, updateData);
    res.json({ message: `Usuário promovido com sucesso para ${rank.badge}!`, rank });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/override-rank]:', err);
    res.status(500).json({ error: 'Erro ao promover usuário.' });
  }
});

// Visão Geral do Plano de Carreira
router.get('/career/overview', async (req, res) => {
  try {
    const allUsers = await getAllUsers();
    const allTx = await getAllTransactions();

    const rankCounts = { bronze: 0, prata: 0, ouro: 0, rubi: 0, diamante: 0, black_diamond: 0 };
    const leaders = [];

    for (const u of allUsers) {
      const net = calculateUserNetwork(u.id, allUsers);
      const evalRank = (u.careerRank && u.careerRank !== 'bronze') 
        ? (RANKS.find(r => r.id === u.careerRank) || evaluateUserRank(net).currentRank) 
        : evaluateUserRank(net).currentRank;
      const rank = evalRank || { id: 'bronze', name: 'Operador Bronze', badge: '🥉 Bronze', icon: '🥉' };
      if (rankCounts[rank.id] !== undefined) rankCounts[rank.id]++;

      const downlineIds = [...net.l1, ...net.l2, ...net.l3, ...net.l4, ...net.l5].map(x => x.id);
      const teamDepositsVolume = allUsers
        .filter(x => downlineIds.includes(x.id))
        .reduce((acc, x) => acc + (parseFloat(x.totalDeposited) || 0), 0);

      const userCommEarned = allTx
        .filter(t => t.userId === u.id && t.type === 'commission' && t.status === 'approved')
        .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

      if (net.totalTeam > 0 || net.l1.length > 0 || u.careerRank || userCommEarned > 0) {
        leaders.push({
          id: u.id,
          name: u.operatorName || `Operador #${u.id}`,
          phone: u.phone,
          rank: rank.badge,
          rankId: rank.id,
          directs: net.l1.length,
          totalTeam: net.totalTeam,
          totalCommissionsEarned: userCommEarned,
          teamDepositsVolume: teamDepositsVolume,
          commissionBalance: userCommEarned > 0 ? userCommEarned : (u.commissionBalance || 0)
        });
      }
    }

    const totalBonusPaid = allTx
      .filter(t => t.type === 'bonus' && t.status === 'approved' && String(t.description || '').includes('Bônus'))
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);

    leaders.sort((a, b) => b.totalTeam - a.totalTeam || b.directs - a.directs);

    res.json({
      ranks: RANKS,
      rankCounts,
      totalBonusPaid,
      topLeaders: leaders
    });
  } catch (err) {
    console.error('[ADMIN ERROR /career/overview]:', err);
    res.status(500).json({ error: 'Erro ao carregar visão de carreira.' });
  }
});

// ==========================================
// 4. CENTRAL DE WEBHOOKS & CARTPANDA
// ==========================================
router.get('/webhooks', async (req, res) => {
  try {
    const logs = await getWebhookLogs(100);
    const enriched = await Promise.all(logs.map(async (l) => {
      const uid = l.matched_user_id || l.matchedUserId;
      if (!uid) return l;
      try {
        const u = await findUserById(uid);
        if (!u) return l;
        return { ...l, operatorName: u.operatorName, operatorPhone: u.phone };
      } catch (e) { return l; }
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks]:', err);
    res.status(500).json({ error: 'Erro ao listar webhooks.' });
  }
});

// Reprocessar Webhook
router.post('/webhooks/:id/reprocess', async (req, res) => {
  try {
    const { id } = req.params;
    const log = await findWebhookLogById(id);
    if (!log) return res.status(404).json({ error: 'Log de webhook não encontrado.' });
    const logType = String(log.event_type || log.eventType || '');
    if (logType === 'withdraw') {
      return res.status(400).json({ error: 'Este log é de SAQUE, não de pagamento. Reprocessar aqui creditaria valor indevido.' });
    }

    const raw = typeof log.raw_payload === 'string' ? JSON.parse(log.raw_payload) : (log.raw_payload || {});
    const phone = log.customer_phone || raw.phone || (raw.customer && raw.customer.phone);
    const amount = parseFloat(log.amount || raw.amount || raw.total || 0);

    if (!phone || amount <= 0) {
      return res.status(400).json({ error: 'Webhook sem telefone ou valor válido para processamento.' });
    }

    let user = await findUserByPhone(phone);
    if (!user) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const autoId = newUserId();
      const rawName = (log.customer_name && log.customer_name !== 'Cliente') ? String(log.customer_name) : '';
      const safeName = rawName.replace(/[<>"'`]/g, '').trim().slice(0, 60) || `Operador #${autoId.slice(-6).toUpperCase()}`;
      user = await createUser({
        id: autoId,
        inviteCode: await newInviteCode(),
        operatorName: safeName,
        phone: cleanPhone,
        password: '123',
        balance: 0,
        totalDeposited: 0,
        dailyReturnsBalance: 0,
        commissionBalance: 0,
        pixKey: cleanPhone
      });
    }

    const products = await getAllProducts();
    let matchedProduct = products.find(p => Math.abs(p.price - amount) < 0.01);
    const now = new Date().toISOString();

    await updateUser(user.id, { totalDepositedInc: amount });

    await createTransaction({
      id: `CP-REPROC-${Date.now()}`,
      userId: user.id,
      type: 'deposit',
      amount: amount,
      status: 'approved',
      description: `Pagamento Cartpanda Reprocessado (+ R$ ${amount.toFixed(2)})`,
      createdAt: now
    });

    if (matchedProduct) {
      const contractId = newContractId();
      await createContract({
        id: contractId,
        userId: user.id,
        productId: matchedProduct.id,
        productName: matchedProduct.name,
        dailyReturn: matchedProduct.dailyReturn,
        totalDays: matchedProduct.periodDays,
        daysRemaining: matchedProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -matchedProduct.price,
        status: 'approved',
        description: `Contratação Automática de ${matchedProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: matchedProduct.price,
        productName: matchedProduct.name
      });
    } else {
      await updateUser(user.id, { investBalanceInc: amount, balanceInc: amount });
    }

    await updateWebhookLog(id, {
      status: 'processed',
      matchedUserId: user.id,
      note: `Reprocessado com sucesso para ${user.operatorName} (${user.phone}).`
    });

    res.json({ message: `Webhook reprocessado! Ativado para ${user.operatorName} (${user.phone}).`, user });
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks/:id/reprocess]:', err);
    res.status(500).json({ error: 'Erro ao reprocessar webhook.' });
  }
});

// Vincular Manualmente Webhook a Qualquer Usuário
router.post('/webhooks/:id/link-user', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const log = await findWebhookLogById(id);
    if (!log) return res.status(404).json({ error: 'Log de webhook não encontrado.' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const linkType = String(log.event_type || log.eventType || '');
    if (linkType === 'withdraw') {
      return res.status(400).json({ error: 'Este log é de SAQUE, não de pagamento. Vincular aqui creditaria valor indevido.' });
    }

    const amount = parseFloat(log.amount || 0);
    const now = new Date().toISOString();

    await updateUser(user.id, { totalDepositedInc: amount });

    const products = await getAllProducts();
    const matchedProduct = products.find(p => Math.abs(p.price - amount) < 0.01);

    if (matchedProduct) {
      const contractId = newContractId();
      await createContract({
        id: contractId,
        userId: user.id,
        productId: matchedProduct.id,
        productName: matchedProduct.name,
        dailyReturn: matchedProduct.dailyReturn,
        totalDays: matchedProduct.periodDays,
        daysRemaining: matchedProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -matchedProduct.price,
        status: 'approved',
        description: `Contratação Vinculada de ${matchedProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: matchedProduct.price,
        productName: matchedProduct.name
      });
    } else {
      await updateUser(user.id, { investBalanceInc: amount, balanceInc: amount });
    }

    await updateWebhookLog(id, {
      status: 'processed',
      matchedUserId: user.id,
      note: `Vinculado manualmente pelo Admin ao operador ${user.operatorName} (${user.id}).`
    });

    res.json({ message: `Pagamento vinculado e ativado com sucesso para ${user.operatorName}!` });
  } catch (err) {
    console.error('[ADMIN ERROR /webhooks/:id/link-user]:', err);
    res.status(500).json({ error: 'Erro ao vincular webhook ao usuário.' });
  }
});

// Injetor de Depósito / Ativação de Frota Direta
router.post('/inject-deposit', async (req, res) => {
  try {
    const { phone, amount, productId, autoHire = true } = req.body;
    const numAmount = parseFloat(amount);
    if (!phone || numAmount <= 0) return res.status(400).json({ error: 'Telefone e valor são obrigatórios.' });

    let user = await findUserByPhone(phone);
    if (!user) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const autoId = newUserId();
      user = await createUser({
        id: autoId,
        operatorName: `Operador #${autoId.slice(-6).toUpperCase()}`,
        inviteCode: await newInviteCode(),
        phone: cleanPhone,
        password: '123',
        balance: 0,
        totalDeposited: 0,
        dailyReturnsBalance: 0,
        commissionBalance: 0,
        pixKey: cleanPhone
      });
    }

    const now = new Date().toISOString();
    await updateUser(user.id, { totalDepositedInc: numAmount });

    await createTransaction({
      id: `INJ-${Date.now()}`,
      userId: user.id,
      type: 'deposit',
      amount: numAmount,
      status: 'approved',
      description: `Depósito Injetado pelo Administrador (+ R$ ${numAmount.toFixed(2)})`,
      createdAt: now
    });

    const products = await getAllProducts();
    const targetProduct = productId ? products.find(p => p.id === productId) : products.find(p => Math.abs(p.price - numAmount) < 0.01);

    if (autoHire && targetProduct) {
      const contractId = newContractId();
      await createContract({
        id: contractId,
        userId: user.id,
        productId: targetProduct.id,
        productName: targetProduct.name,
        dailyReturn: targetProduct.dailyReturn,
        totalDays: targetProduct.periodDays,
        daysRemaining: targetProduct.periodDays,
        status: 'Em corrida',
        startDate: now,
        lastSettlement: now
      });

      await createTransaction({
        id: `TX-${Date.now()}`,
        userId: user.id,
        type: 'contract',
        amount: -targetProduct.price,
        status: 'approved',
        description: `Contratação Injetada de ${targetProduct.name}`,
        createdAt: now
      });

      await distributeCareerCommissions({
        buyerUser: user,
        amount: targetProduct.price,
        productName: targetProduct.name
      });
    } else {
      await updateUser(user.id, { investBalanceInc: numAmount, balanceInc: numAmount });
    }

    res.json({ message: `Depósito/Frota de R$ ${numAmount.toFixed(2)} injetado com sucesso para ${user.operatorName} (${user.phone})!`, user });
  } catch (err) {
    console.error('[ADMIN ERROR /inject-deposit]:', err);
    res.status(500).json({ error: 'Erro ao injetar depósito.' });
  }
});

// ==========================================
// 5. GESTÃO DE PRODUTOS / FROTAS
// ==========================================
router.get('/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('[ADMIN ERROR /products]:', err);
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, checkoutUrl, price, dailyReturn, periodDays, status, description,
      name_es, name_en, name_zh, description_es, description_en, description_zh,
      status_es, status_en, status_zh } = req.body;

    const updated = await updateProduct(id, { name, checkoutUrl, price, dailyReturn, periodDays, status, description,
      name_es, name_en, name_zh, description_es, description_en, description_zh,
      status_es, status_en, status_zh });
    if (!updated) return res.status(404).json({ error: 'Produto não encontrado.' });

    res.json({ message: 'Produto/Frota atualizado com sucesso!', product: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /products/:id]:', err);
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
});

// Troca o codigo de indicacao de um operador. Antes nao_existia forma de
// fazer isso: o inviteCode nascia em newInviteCode() e nunca mais mudava.
router.patch('/users/:id/invite-code', async (req, res) => {
  try {
    const { id } = req.params;
    const raw = String((req.body && req.body.inviteCode) || '').trim().toUpperCase();

    if (!/^NX[0-9A-F]{8}$/.test(raw)) {
      return res.status(400).json({ error: 'Codigo invalido. Use o formato NX seguido de 8 caracteres hex (ex: NX801C6FE8).' });
    }

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    // findUserByInviteCode busca o primeiro: sem esta checagem dois operadores
    // com o mesmo codigo fariam o cadastro creditar a alguém aleatório.
    const owner = await findUserByInviteCode(raw);
    if (owner && owner.id !== id) {
      return res.status(409).json({ error: `Este código já pertence a ${owner.operatorName || owner.id}.` });
    }

    const antigo = user.inviteCode;
    const updated = await updateUser(id, { inviteCode: raw });

    console.log(`[ADMIN] codigo de ${user.operatorName || id}: ${antigo} -> ${raw}`);
    res.json({ message: 'Código de indicação atualizado!', antigo, novo: raw, user: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/invite-code]:', err);
    res.status(500).json({ error: 'Erro ao atualizar o código de indicação.' });
  }
});

// ==========================================
// 6. CRM & EXPORTAÇÃO
// ==========================================
router.patch('/users/:id/crm', async (req, res) => {
  try {
    const { id } = req.params;
    const { crmStatus, crmNotes } = req.body;

    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const updated = await updateUser(id, {
      crmStatus: crmStatus !== undefined ? crmStatus : user.crmStatus,
      crmNotes: crmNotes !== undefined ? crmNotes : user.crmNotes
    });

    res.json({ message: 'Status do CRM atualizado!', user: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /users/:id/crm]:', err);
    res.status(500).json({ error: 'Erro ao atualizar CRM do operador.' });
  }
});

router.get('/users/export-csv', async (req, res) => {
  try {
    const users = await getAllUsers();
    const headers = ['ID', 'Nome', 'Telefone', 'Telefone_WhatsApp', 'Status_CRM', 'Saldo_Total', 'Saldo_Comissao', 'Saldo_Diario', 'Patente', 'Frotas_Ativas', 'Data_Cadastro'];
    const rows = await Promise.all(users.map(async (u) => {
      const contracts = await getContractsByUserId(u.id);
      const activeCount = contracts.filter(c => c.status === 'Em corrida').length;
      const cleanPhone = String(u.phone || '').replace(/\D/g, '');
      const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const status = u.crmStatus || (activeCount > 0 ? 'active' : 'new');
      const date = u.createdAt ? new Date(u.createdAt).toISOString() : '';

      return [
        `"${u.id}"`,
        `"${(u.operatorName || '').replace(/"/g, '""')}"`,
        `"${cleanPhone}"`,
        `"+${waPhone}"`,
        `"${status}"`,
        (u.balance || 0).toFixed(2),
        (u.commissionBalance || 0).toFixed(2),
        (u.dailyReturnsBalance || 0).toFixed(2),
        `"${u.careerRank || 'bronze'}"`,
        activeCount,
        `"${date}"`
      ].join(';');
    }));

    const csvContent = [headers.join(';'), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="truckauto_leads_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error('[ADMIN ERROR /users/export-csv]:', err);
    res.status(500).json({ error: 'Erro ao exportar CSV.' });
  }
});

router.post('/settle', async (req, res) => {
  try {
    console.log('[ADMIN] Gota manual acionada pelo Administrador...');
    const result = await processDripSlice();
    res.json(result);
  } catch (err) {
    console.error('[ADMIN ERROR /settle]:', err);
    res.status(500).json({ error: 'Erro ao executar liquidação manual.' });
  }
});

// Backup manual imediato (CSV usuarios + contratos -> Telegram do admin)
router.post('/backup/run', async (req, res) => {
  try {
    const { runBackup } = require('../services/backup');
    const result = await runBackup();
    res.json(result);
  } catch (err) {
    console.error('[ADMIN ERROR /backup/run]:', err);
    res.status(500).json({ error: 'Erro ao gerar backup.' });
  }
});

// Cupons bônus: listar
router.get('/bonus/codes', async (req, res) => {
  try {
    const list = await listPromoCodes();
    res.json(list);
  } catch (err) {
    console.error('[ADMIN ERROR /bonus/codes]:', err);
    res.status(500).json({ error: 'Erro ao listar cupons.' });
  }
});

// Cupons bônus: criar
router.post('/bonus/codes', async (req, res) => {
  try {
    const { code, amount, maxUses, expiresAt } = req.body || {};
    const promo = await createPromoCode({ code, amount, maxUses, expiresAt });
    res.status(201).json({ message: 'Cupom criado!', promo });
  } catch (err) {
    console.error('[ADMIN ERROR /bonus/codes POST]:', err.message);
    res.status(400).json({ error: err.message || 'Erro ao criar cupom.' });
  }
});

// Cupons bônus: ativar/desativar
router.patch('/bonus/codes/:code', async (req, res) => {
  try {
    const { active } = req.body || {};
    const promo = await setPromoActive(req.params.code, active !== false);
    if (!promo) {
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    }
    res.json({ message: 'Cupom atualizado!', promo });
  } catch (err) {
    console.error('[ADMIN ERROR /bonus/codes PATCH]:', err);
    res.status(500).json({ error: 'Erro ao atualizar cupom.' });
  }
});

// Cupons bônus: excluir
router.delete('/bonus/codes/:code', async (req, res) => {
  try {
    const ok = await deletePromoCode(req.params.code);
    if (!ok) {
      return res.status(404).json({ error: 'Cupom não encontrado.' });
    }
    res.json({ message: 'Cupom excluído!' });
  } catch (err) {
    console.error('[ADMIN ERROR /bonus/codes DELETE]:', err);
    res.status(500).json({ error: 'Erro ao excluir cupom.' });
  }
});

// Atendimento: lista de conversas (com não-lidas)
router.get('/support/threads', async (req, res) => {
  try {
    const list = await getSupportThreads();
    res.json(list);
  } catch (err) {
    console.error('[ADMIN ERROR /support/threads]:', err);
    res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
});

// Atendimento: conversa de um usuário (marca como lida)
router.get('/support/thread/:userId', async (req, res) => {
  try {
    const list = await getSupportMessages(req.params.userId, 200);
    await markSupportRead(req.params.userId);
    res.json(list);
  } catch (err) {
    console.error('[ADMIN ERROR /support/thread]:', err);
    res.status(500).json({ error: 'Erro ao abrir conversa.' });
  }
});

// Atendimento: responder usuário
router.post('/support/reply', async (req, res) => {
  try {
    const userId = String((req.body && req.body.userId) || '').trim();
    const text = String((req.body && req.body.text) || '');
    if (!userId || !text.trim()) {
      return res.status(400).json({ error: 'Usuário e mensagem obrigatórios.' });
    }
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const msg = await sendSupportMessage(userId, 'admin', text);
    res.status(201).json(msg);
  } catch (err) {
    console.error('[ADMIN ERROR /support/reply]:', err);
    res.status(400).json({ error: err.message || 'Erro ao responder.' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json(settings);
  } catch (err) {
    console.error('[ADMIN ERROR /settings]:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { nexusCrmUrl, whatsappNumber, metaPixelId, tiktokPixelId, gatewayOrder, gatewayDisabled, minDeposit, minWithdraw, withdrawFee, signupBonus,
      maxDepositTx, maxDepositDay, maxWithdrawTx, maxWithdrawDay, newAccountGraceH, newAccountCap7d,
      globalDailyWithdrawCap, payoutsPaused, depositsPaused } = req.body;
    if (nexusCrmUrl !== undefined) await updateSystemSetting('nexus_crm_url', nexusCrmUrl.trim());
    if (whatsappNumber !== undefined) await updateSystemSetting('whatsapp_number', whatsappNumber.trim());
    if (metaPixelId !== undefined) await updateSystemSetting('meta_pixel_id', metaPixelId.trim());
    if (tiktokPixelId !== undefined) await updateSystemSetting('tiktok_pixel_id', tiktokPixelId.trim());
    if (gatewayOrder !== undefined) await updateSystemSetting('gateway_order', normalizeGatewayOrder(gatewayOrder).join(','));
    if (gatewayDisabled !== undefined) await updateSystemSetting('gateway_disabled', normalizeGatewayDisabled(gatewayDisabled).join(','));
    if (minDeposit !== undefined) {
      const v = parseFloat(minDeposit);
      if (!isFinite(v) || v < 1 || v > 100000) return res.status(400).json({ error: 'Depósito mínimo inválido (1 a 100000).' });
      await updateSystemSetting('min_deposit', String(v));
    }
    if (minWithdraw !== undefined) {
      const v = parseFloat(minWithdraw);
      if (!isFinite(v) || v < 1 || v > 100000) return res.status(400).json({ error: 'Saque mínimo inválido (1 a 100000).' });
      await updateSystemSetting('min_withdraw', String(v));
    }
    if (withdrawFee !== undefined) {
      const v = parseFloat(withdrawFee);
      if (!isFinite(v) || v < 0 || v > 50) return res.status(400).json({ error: 'Taxa inválida (0 a 50%).' });
      await updateSystemSetting('withdraw_fee', String(v));
    }
    if (signupBonus !== undefined) {
      const v = parseFloat(signupBonus);
      if (!isFinite(v) || v < 0 || v > 1000) return res.status(400).json({ error: 'Bônus inválido (0 a 1000). Use 0 para desligar.' });
      await updateSystemSetting('signup_bonus', String(v));
    }
    // Fase 2 — limites nativos
    const numSetting = async (body, key, min, max, label) => {
      if (body === undefined) return;
      const v = parseFloat(body);
      if (!isFinite(v) || v < min || v > max) throw new Error(`${label} inválido (${min} a ${max}).`);
      await updateSystemSetting(key, String(v));
    };
    try {
      await numSetting(maxDepositTx, 'max_deposit_tx', 0, 1000000, 'Depósito máx/tx');
      await numSetting(maxDepositDay, 'max_deposit_day', 0, 10000000, 'Depósito máx/24h');
      await numSetting(maxWithdrawTx, 'max_withdraw_tx', 0, 1000000, 'Saque máx/tx');
      await numSetting(maxWithdrawDay, 'max_withdraw_day', 0, 10000000, 'Saque máx/24h');
      await numSetting(newAccountGraceH, 'new_account_grace_h', 0, 720, 'Carência conta nova (h)');
      await numSetting(newAccountCap7d, 'new_account_cap_7d', 0, 1000000, 'Teto 7 dias');
      await numSetting(globalDailyWithdrawCap, 'global_daily_withdraw_cap', 0, 100000000, 'Teto global 24h');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const boolSetting = async (body, key) => {
      if (body === undefined) return;
      const on = body === true || body === 1 || body === '1' || String(body).toLowerCase() === 'true';
      await updateSystemSetting(key, on ? '1' : '0');
    };
    await boolSetting(payoutsPaused, 'payouts_paused');
    await boolSetting(depositsPaused, 'deposits_paused');

    const updated = await getSystemSettings();
    res.json({ message: 'Configurações atualizadas com sucesso!', settings: updated });
  } catch (err) {
    console.error('[ADMIN ERROR /settings PUT]:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

// Zera o contador de deposito de todas as contas, para a exigencia de saque
// passar a valer so a partir de agora.
//
// Existe por causa de um detalhe: totalDeposited e acumulado e NUNCA expira.
// Quem depositou R$ 500 no ano passado continua com R$ 500 no contador para
// sempre, entao subir a regra para R$ 30 nao mudaria nada para essa pessoa --
// ela passaria a cumprir a regra sem nunca mais depositar. Zerar o contador e
// o que faz a regra valer "a partir de agora".
//
// O que este endpoint NAO toca: investBalance, earnBalance, balance,
// totalWithdrawn, contratos, transacoes, PIX, telefone, nome. Um campo so.
//
// Montado aqui de proposito: herda o adminAuthMiddleware da linha 129, entao
// nao existe rota nova sem chave de admin.
const CONTADOR_ZERADO_EM = 'deposit_counter_reset_at';

router.post('/zero-contador-deposito', async (req, res) => {
  try {
    // O corpo PRECISA chegar como objeto { aplicar: true }.
    //
    // O painel ja chamava adminFetch(..., JSON.stringify({...})) e o adminFetch
    // serializa de novo. O corpo saia dobrado ("{\"aplicar\":true}") e o
    // express.json() -- que roda em modo estrito -- REJEITA primitivo com 400 e
    // uma pagina de erro em HTML. O adminFetch quebrava ao ler aquilo como JSON
    // e a tela mostrava "Nao deu para simular". Por isso o painel passa objeto,
    // e o teste trava isso.
    const aplicar = !!(req.body && req.body.aplicar);
    const users = await getAllUsers();
    if (!Array.isArray(users) || !users.length) {
      return res.status(400).json({ error: 'Nenhuma conta encontrada. Nada foi feito.' });
    }

    const alvo = users
      .map(u => ({
        id: u.id, phone: u.phone, nome: u.operatorName || '',
        valor: parseFloat(u.totalDeposited || 0)
      }))
      .filter(x => x.valor !== 0);

    const total = alvo.length;
    const soma = Math.round(alvo.reduce((t, x) => t + x.valor, 0) * 100) / 100;
    const contas = users.length;

    // Se ja foi feito, nao refaz. Rodar duas vezes nao quebraria nada (o
    // segundo zero seria no-op), mas esconder que ja aconteceu e perigoso: a
    // pessoa acharia que zerou de novo e perderia a chance de restaurar.
    let jaFoi = null;
    try {
      jaFoi = (await getSystemSettings()).depositCounterResetAt || null;
    } catch (e) { /* sem flag: segue como se nunca tivesse sido feito */ }

    const resumo = {
      contas,
      aZerar: total,
      jaEmZero: contas - total,
      soma,
      jaFoiZeradoEm: jaFoi
    };

    if (!aplicar) {
      return res.json({ aplicado: false, ...resumo, maiores: alvo.slice().sort((a, b) => b.valor - a.valor).slice(0, 15) });
    }

    if (jaFoi) {
      return res.status(409).json({
        aplicado: false,
        ...resumo,
        error: 'O contador de deposito JA foi zerado em ' + jaFoi + '. Nao e preciso (e nao deve) rodar de novo.'
      });
    }

    // Backup com os valores de antes, gravado em disco antes de escrever.
    let backupPath = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = path.join(__dirname, '..', 'backups');
      fs.mkdirSync(dir, { recursive: true });
      backupPath = path.join(dir, 'contador-deposito-' + stamp + '.json');
      fs.writeFileSync(backupPath, JSON.stringify({
        geradoEm: new Date().toISOString(),
        motivo: 'zero do contador de deposito (regra de saque)',
        // Mesmo formato do scripts/zero-contador-deposito.js, para os dois
        // caminhos gerarem backup equivalente.
        contas: alvo.map(x => ({
          id: x.id, phone: x.phone,
          operatorName: x.nome,
          totalDepositedAntes: x.valor
        }))
      }, null, 2), 'utf-8');
    } catch (e) {
      // Sem backup nao da para aplicar. Prefere travar aqui.
      return res.status(500).json({
        aplicado: false,
        error: 'Nao consegui gravar o backup, entao NADA foi alterado: ' + e.message
      });
    }

    let ok = 0;
    const falhas = [];
    for (const x of alvo) {
      try {
        await updateUser(x.id, { totalDeposited: 0 });
        ok++;
      } catch (e) {
        falhas.push({ id: x.id, phone: x.phone, erro: e.message });
      }
    }

    const quando = new Date().toISOString();
    let marcado = true;
    try {
      await updateSystemSetting(CONTADOR_ZERADO_EM, quando);
    } catch (e) { marcado = false; }

    res.json({
      aplicado: true,
      zeradas: ok,
      falhas,
      backup: 'backup gravado em backups/',
      marcadoComoFeito: marcado,
      ...resumo,
      aviso: 'Agora suba "Deposito minimo" para 30 em Configuracoes. A comissao de indicacao sobe junto.'
    });
  } catch (err) {
    console.error('[ADMIN] zero contador deposito:', err.message);
    res.status(500).json({ error: 'Erro ao zerar o contador. Nada foi concluido.' });
  }
});

router.get('/zero-contador-deposito/estado', async (req, res) => {
  try {
    const users = await getAllUsers();
    const alvo = users.filter(u => parseFloat(u.totalDeposited || 0) !== 0);
    let jaFoi = null;
    try { jaFoi = (await getSystemSettings()).depositCounterResetAt || null; } catch (e) { }
    res.json({
      contas: users.length,
      aZerar: alvo.length,
      soma: Math.round(alvo.reduce((t, u) => t + parseFloat(u.totalDeposited || 0), 0) * 100) / 100,
      jaFoiZeradoEm: jaFoi
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Relatorios de saude da plataforma (obrigacao vs caixa, tendencia, concentracao).
// Montado aqui para herdar o adminAuthMiddleware acima - nao abrir rota nova
// sem chave de admin.
require('./reports').mountReports(router);

module.exports = router;
