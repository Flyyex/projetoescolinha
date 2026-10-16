const express = require('express');
const router = express.Router();
const {
  findUserById,
  findUserByPhone,
  findUserByInviteCode,
  getAllUsers,
  updateUser,
  getContractsByUserId,
  getTransactionsByUserId,
  getApprovedWithdrawalsTotal,
  getUnreportedDeposits,
  markDepositsReported,
  getAllTransactions,
createTransaction,
findTransactionById,
findTransactionByExternalId,
updateTransaction,
getGatewayOrder,
getMoneyLimits,
getAllProducts,
findProductById,
createContract,
recordWebhookLog,
getSystemSettings,
normPromoCode,
redeemPromo,
savePixCharge,
findPixCharge,
markPixChargeUsed
} = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { createCartpandaPix } = require('../services/cartpanda');
const { isAsaasEnabled, createPixCharge, sendPixTransfer, isPaymentConfirmed, ASAAS_WEBHOOK_TOKEN } = require('../services/asaas');
const { isSyncPayEnabled, createPixCharge: createSyncPayPix, lookupCharge: lookupSyncCharge, forgetCharge: forgetSyncCharge, isCashinCompleted, SYNCPAY_WEBHOOK_TOKEN } = require('../services/syncpay');
const { isMisticEnabled, createPixCharge: createMisticPix, checkTransactionPaid: checkMisticPaid, isDepositEvent: isMisticDeposit, validatePixKey, PIX_TYPES } = require('../services/misticpay');
const { notifyAdminWithdrawal, notifyAdminDeposit, notifyAdminSecurityAlert } = require('../services/telegramBot');
const crmDb = require('../services/crmDb');
const { distributeCareerCommissions } = require('../services/careerEngine');

// Resumo da Carteira
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    const contracts = await getContractsByUserId(req.user.id);
    const myContracts = contracts.filter(c => c.status === 'Em corrida');
    
    const dailyIncome = myContracts.reduce((acc, c) => acc + c.dailyReturn, 0);

    const transactions = await getTransactionsByUserId(req.user.id);
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);

    const totalCommissionsEarned = transactions
      .filter(t => t.type === 'commission')
      .reduce((acc, t) => acc + t.amount, 0);

    const previousWithdrawals = transactions
      .filter(t => t.type === 'withdraw' && t.status !== 'rejected')
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const currentBalance = user ? user.balance : 0;
    const availableCommissionBalance = Math.max(0, Math.min(currentBalance, totalCommissionsEarned - previousWithdrawals));
    const dailyReturnsBalance = Math.max(0, currentBalance - availableCommissionBalance);

    const allUsers = await getAllUsers();
    const l1Users = allUsers.filter(u => u.referredBy === req.user.id);
    const l1Ids = l1Users.map(u => u.id);
    const l2Users = allUsers.filter(u => l1Ids.includes(u.referredBy));
    const l2Ids = l2Users.map(u => u.id);
    const l3Users = allUsers.filter(u => l2Ids.includes(u.referredBy));
    const isLevel3 = l3Users.length > 0;

    res.json({
      balance: currentBalance,
      investBalance: user ? parseFloat(user.investBalance || 0) : 0,
      earnBalance: user ? parseFloat(user.earnBalance || 0) : 0,
      totalDeposited: user ? parseFloat(user.totalDeposited || 0) : 0,
      dailyIncome: dailyIncome,
      totalIncome: totalIncome,
      commissionBalance: availableCommissionBalance,
      dailyReturnsBalance: dailyReturnsBalance,
      totalCommissionsEarned: totalCommissionsEarned,
      isLevel3: isLevel3,
      canWithdrawCommission: availableCommissionBalance >= 30,
      activeContractsCount: myContracts.length
    });
  } catch (err) {
    console.error('[WALLET ERROR /summary]:', err);
    res.status(500).json({ error: 'Erro ao buscar resumo da carteira.' });
  }
});

// Gerar Pix de Depósito (Integrado com Cartpanda Pay)
router.post('/deposit/pix', authMiddleware, async (req, res) => {
  try {
    const { amount, cpfCnpj } = req.body;
    const numAmount = parseFloat(amount);
    const moneyLimits = await getMoneyLimits();
    const { minDeposit } = moneyLimits;
    const { parseLimitSettings, checkDepositLimits, sumInWindow, DAY } = require('../services/limits');
    const depLimits = parseLimitSettings(moneyLimits);

    if (!numAmount || numAmount < minDeposit) {
      return res.status(400).json({ error: `O valor mínimo para recarga Pix é R$ ${minDeposit.toFixed(2)}.` });
    }

    const user = req.user;
    // Fase 2: pausa de emergência + tetos de depósito (janela rolante 24h)
    if (depLimits.depositsPaused) {
      return res.status(403).json({ error: 'Recargas pausadas temporariamente. Tente mais tarde.' });
    }
    try {
      const myTx = await getTransactionsByUserId(user.id);
      const deposits24h = sumInWindow(
        myTx.filter(t => t.type === 'deposit' && t.status === 'approved'),
        DAY, Date.now()
      );
      const depCheck = checkDepositLimits({ amount: numAmount, deposits24h, limits: depLimits });
      if (!depCheck.ok) return res.status(depCheck.status).json({ error: depCheck.error });
    } catch (e) { console.error('[WALLET] deposit limits check:', e.message); }
    const cleanDoc = String(cpfCnpj || user.cpfCnpj || '').replace(/\D/g, '');
    if (isAsaasEnabled() && !(cleanDoc.length === 11 || cleanDoc.length === 14)) {
      return res.status(400).json({ error: 'Informe um CPF (11 digitos) ou CNPJ (14 digitos) valido para gerar o Pix.' });
    }
    if (cleanDoc && cleanDoc !== user.cpfCnpj) {
      try { await updateUser(user.id, { cpfCnpj: cleanDoc }); } catch (e) { console.error('[WALLET] salvar cpf:', e.message); }
    }
    const depositArgs = {
      amount: numAmount,
      customerName: user.operatorName,
      customerPhone: user.phone,
      customerEmail: `${user.phone}@truckauto.com`,
      customerCpfCnpj: cleanDoc || undefined,
      referenceId: user.id,
      webhookUrl: process.env.APP_URL ? (process.env.APP_URL + '/api/wallet/webhook/syncpay') : undefined
    };
    // Ordem das gateways configurável no admin (1ª tenta primeiro, resto é fallback)
    const gatewayCreators = {
      misticpay: () => (isMisticEnabled() ? createMisticPix({ ...depositArgs, webhookUrl: process.env.APP_URL ? (process.env.APP_URL + '/api/wallet/webhook/mistic') : undefined }) : null),
      syncpay: () => (isSyncPayEnabled() ? createSyncPayPix(depositArgs) : null),
      asaas: () => (isAsaasEnabled() ? createPixCharge(depositArgs) : null),
      cartpanda: () => createCartpandaPix(depositArgs)
    };
    let pixResult = null;
    for (const gwName of await getGatewayOrder()) {
      const creator = gatewayCreators[gwName];
      if (!creator) continue;
      try {
        const attempt = await creator();
        if (attempt && attempt.success) { pixResult = attempt; break; }
        if (attempt) console.error(`[WALLET] ${gwName} falhou, tentando proxima:`, attempt.error);
      } catch (e) {
        console.error(`[WALLET] ${gwName} excecao, tentando proxima:`, e.message);
      }
    }

    if (!pixResult || !pixResult.success) {
      if (!pixResult) return res.status(503).json({ error: 'Nenhuma gateway de pagamento ativa no momento. Tente novamente em instantes.' });
      return res.status(500).json({ error: pixResult.error || 'Erro ao gerar cobranca Pix.' });
    }

    if (pixResult.txId) {
      savePixCharge({ provider: pixResult.provider || '', identifier: pixResult.txId, userId: user.id, amount: numAmount }).catch(e => console.error('[WALLET] savePixCharge:', e.message));
    }
    crmDb.moveLeadByPhone(user.phone, 'proposta', 'QR Pix gerado', numAmount);
    res.json(pixResult);
  } catch (err) {
    console.error('[WALLET ERROR /deposit/pix]:', err);
    res.status(500).json({ error: 'Erro ao gerar cobrança Pix.' });
  }
});

const CARTPANDA_WEBHOOK_SECRET = process.env.CARTPANDA_WEBHOOK_SECRET || '';

// Webhook Oficial do Cartpanda Pay (Chamado quando o Pix / Pedido é pago)
router.post('/webhook/cartpanda', async (req, res) => {
  const token = req.query.token || req.headers['x-cartpanda-token'] || req.headers['x-webhook-token'] || req.headers['x-webhook-secret'] || req.headers['authorization'];

  console.log('[CARTPANDA WEBHOOK RECEIVED]');
  const rawBody = req.body || {};

  // Exige token configurado e conferido (sem bypass)
  const given = String(token || '').replace('Bearer ', '').trim();
  if (!CARTPANDA_WEBHOOK_SECRET || given !== CARTPANDA_WEBHOOK_SECRET) {
    console.warn('[SECURITY ALERT] Chamada de webhook rejeitada.', req.ip);
    return res.status(401).json({ error: 'Webhook não autorizado.' });
  }

  try {
    // 1. Extração flexível de Status
    const status = String(
      rawBody.status ||
      rawBody.order_status ||
      rawBody.financial_status ||
      (rawBody.order && (rawBody.order.status || rawBody.order.financial_status)) ||
      (rawBody.event === 'order.paid' ? 'paid' : '')
    ).toLowerCase();

    // 2. Extração de Valor
    const amount = parseFloat(
      rawBody.amount ||
      rawBody.total ||
      (rawBody.order && (rawBody.order.total || rawBody.order.total_price || rawBody.order.subtotal_price)) ||
      0
    );

    // 3. Extração de Dados do Cliente (Telefone, Nome, Email, ID de Referência)
    const phoneCandidates = [
      rawBody.phone,
      rawBody.customer_phone,
      rawBody.buyer_phone,
      rawBody.customer && rawBody.customer.phone,
      rawBody.order && rawBody.order.phone,
      rawBody.order && rawBody.order.customer && rawBody.order.customer.phone,
      rawBody.order && rawBody.order.shipping_address && rawBody.order.shipping_address.phone,
      rawBody.order && rawBody.order.billing_address && rawBody.order.billing_address.phone,
      rawBody.metadata && rawBody.metadata.reference_id
    ].filter(Boolean);

    const customerName = 
      rawBody.customer_name ||
      rawBody.name ||
      (rawBody.customer && (rawBody.customer.name || `${rawBody.customer.first_name || ''} ${rawBody.customer.last_name || ''}`.trim())) ||
      (rawBody.order && rawBody.order.customer && (rawBody.order.customer.name || `${rawBody.order.customer.first_name || ''} ${rawBody.order.customer.last_name || ''}`.trim())) ||
      'Cliente';

    const customerEmail = 
      rawBody.customer_email ||
      rawBody.email ||
      (rawBody.customer && rawBody.customer.email) ||
      (rawBody.order && rawBody.order.customer && rawBody.order.customer.email) ||
      '';

    const isPaid = ['paid', 'completed', 'approved', 'authorized', 'paid_pending_review', 'succeeded'].includes(status);

    if (!isPaid) {
      await recordWebhookLog({
        provider: 'cartpanda',
        eventType: rawBody.event || 'status_update',
        amount: amount,
        customerPhone: phoneCandidates[0] || null,
        customerName: customerName,
        customerEmail: customerEmail,
        matchedUserId: null,
        status: 'ignored',
        note: `Status não pago: "${status}"`,
        rawPayload: rawBody
      });
      return res.status(200).json({ received: true, note: `Status "${status}" ignorado.` });
    }

    // 4. Localização do Usuário/Operador
    let user = null;
    for (const p of phoneCandidates) {
      if (String(p).startsWith('usr_')) {
        user = await findUserById(p);
        if (user) break;
      }
      user = await findUserByPhone(p);
      if (user) break;
    }

    // 4.1 Auto-criação do usuário caso tenha comprado direto pelo Cartpanda sem cadastro prévio
    if (!user) {
      const cleanPhone = phoneCandidates[0] ? String(phoneCandidates[0]).replace(/\D/g, '') : null;
      if (cleanPhone && cleanPhone.length >= 8) {
        const newUserId = `usr_${Math.floor(1000 + Math.random() * 9000)}`;
        const opNum = newUserId.replace('usr_', '');
        user = await createUser({
          id: newUserId,
          operatorName: customerName && customerName !== 'Cliente' ? customerName : `Operador #${opNum}`,
          phone: cleanPhone,
          password: '123',
          balance: 0,
          totalDeposited: 0,
          dailyReturnsBalance: 0,
          commissionBalance: 0,
          pixKey: cleanPhone,
          invitedBy: (rawBody.metadata && (rawBody.metadata.ref || rawBody.metadata.inviteCode)) || null
        });
        console.log(`[CARTPANDA WEBHOOK] Operador criado automaticamente a partir do pagamento Cartpanda: ${user.id} (${cleanPhone})`);
      }
    }

    if (!user) {
      console.warn('[CARTPANDA WEBHOOK] Usuário não localizado e sem telefone válido para criação:', phoneCandidates);
      await recordWebhookLog({
        provider: 'cartpanda',
        eventType: rawBody.event || 'order.paid',
        amount: amount,
        customerPhone: phoneCandidates[0] || null,
        customerName: customerName,
        customerEmail: customerEmail,
        matchedUserId: null,
        status: 'user_not_found',
        note: `Pagamento de R$ ${amount.toFixed(2)} aprovado, mas nenhum telefone foi informado no checkout.`,
        rawPayload: rawBody
      });
      return res.status(200).json({ received: true, warning: 'Usuário não encontrado e sem telefone.' });
    }

    const txId = `CP-${rawBody.id || (rawBody.order && rawBody.order.id) || Date.now()}`;
    const now = new Date().toISOString();

    // Idempotência: retry do webhook não pode duplicar saldo/total depositado
    const existingTx = await findTransactionById(txId);
    if (existingTx) {
      return res.status(200).json({ received: true, note: 'Pagamento ja processado.' });
    }

    // 6. Depósito vai para o saldo INVESTIR (atômico contra webhooks concorrentes)
    await updateUser(user.id, {
      totalDepositedInc: amount,
      investBalanceInc: amount,
      balanceInc: amount
    });

    // 7. Criar Transação de Depósito
    await createTransaction({
      id: txId,
      userId: user.id,
      type: 'deposit',
      amount: amount,
      status: 'approved',
      description: `Pagamento Pix Confirmado (+ R$ ${amount.toFixed(2)})`,
      createdAt: now
    });
    // Marca o QR gerado como pago (base da conversão Pix no admin)
    try {
      const rawOrderId = String(rawBody.id || (rawBody.order && rawBody.order.id) || '');
      if (rawOrderId) await markPixChargeUsed(rawOrderId, 'used');
      await markPixChargeUsed(txId, 'used');
    } catch (e) { console.error('[WALLET] markPixChargeUsed:', e.message); }

    const autoHired = false;
    const hiredProductName = null;

    // 8. Sem ativacao automatica: credita tudo no saldo investir para escolha livre
    // (já creditado no passo 6)

    // 10. Notificação Privada ao Administrador via Telegram
    crmDb.moveLeadByPhone(user.phone, 'ganho', 'Pix confirmado', amount);
    notifyAdminDeposit({
      operatorName: user.operatorName,
      phone: user.phone,
      amount: amount,
      productName: hiredProductName,
      txId: txId,
      isAutoHire: autoHired
    }).catch(e => console.error('[TELEGRAM NOTIFY DEPOSIT ERROR]:', e.message));

    // 10.1 Sincroniza Pagamento / Contrato com o Nexus CRM
    getSystemSettings().then(settings => {
      const crmUrl = settings.nexusCrmUrl || process.env.NEXUS_CRM_URL || '';
      if (!crmUrl) return;
      fetch(`${crmUrl}/api/leads/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.operatorName,
          phone: user.phone,
          campaign: `TruckAuto - ${hiredProductName || 'Recarga Pix'}`,
          utm_source: 'cartpanda_checkout',
          value: amount
        })
      }).catch(e => console.warn('[NEXUS CRM PAYMENT SYNC WARNING]:', e.message));
    }).catch(() => {});

    // 11. Registrar no Log de Auditoria de Webhooks
    await recordWebhookLog({
      provider: 'cartpanda',
      eventType: rawBody.event || 'order.paid',
      amount: amount,
      customerPhone: phoneCandidates[0] || user.phone,
      customerName: customerName,
      customerEmail: customerEmail,
      matchedUserId: user.id,
      status: 'processed',
      note: autoHired ? `Frota ${hiredProductName} ativada com sucesso!` : `Saldo de R$ ${amount.toFixed(2)} creditado.`,
      rawPayload: rawBody
    });

    console.log(`[CARTPANDA] Sucesso! Operador ${user.operatorName} processado (+ R$ ${amount.toFixed(2)}, autoHire: ${autoHired})`);
    res.status(200).json({ success: true, user: user.id, autoHired });
  } catch (err) {
    console.error('[CARTPANDA WEBHOOK ERROR]:', err);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

// Webhook Oficial da Asaas (PAYMENT_CONFIRMED / PAYMENT_RECEIVED)
router.post('/webhook/asaas', async (req, res) => {
  try {
    const rawBody = req.body || {};
    const gotAsaas = String(req.headers['asaas-access-token'] || req.query.token || '').trim();
    if (!ASAAS_WEBHOOK_TOKEN || gotAsaas !== ASAAS_WEBHOOK_TOKEN) {
      console.warn('[SECURITY ALERT] Webhook Asaas rejeitado.', req.ip);
      return res.status(401).json({ error: 'Token invalido.' });
    }
    const event = rawBody.event || '';
    const payment = rawBody.payment || {};
    const amount = parseFloat(payment.value || 0);
    const paymentId = payment.id || '';
    console.log('[ASAAS WEBHOOK]', event, paymentId, amount);
    if (!isPaymentConfirmed(event) || !paymentId || !(amount > 0)) {
      await recordWebhookLog({ provider: 'asaas', eventType: event || 'unknown', amount, customerPhone: null, customerName: '', customerEmail: '', matchedUserId: null, status: 'ignored', note: 'Evento nao confirmado ou sem valor.', rawPayload: rawBody });
      return res.status(200).json({ received: true });
    }
    const userId = payment.externalReference || '';
    let user = null;
    if (userId) {
      try { user = await findUserById(userId); } catch (e) { user = null; }
    }
    if (!user && paymentId) {
      try {
        const saved = await findPixCharge(paymentId);
        if (saved && saved.userId) user = await findUserById(saved.userId);
      } catch (e) { user = null; }
    }
    if (!user) {
      await recordWebhookLog({ provider: 'asaas', eventType: event, amount, customerPhone: null, customerName: '', customerEmail: '', matchedUserId: null, status: 'user_not_found', note: 'Usuario nao localizado (externalReference).', rawPayload: rawBody });
      return res.status(200).json({ received: true, warning: 'Usuario nao encontrado.' });
    }
    const txId = `ASAAS-${paymentId}`;
    const userTx = await getTransactionsByUserId(user.id);
    if (userTx.some(t => t.id === txId)) {
      return res.status(200).json({ received: true, note: 'Pagamento ja processado.' });
    }
    await updateUser(user.id, { totalDepositedInc: amount, investBalanceInc: amount, balanceInc: amount });
    await createTransaction({ id: txId, userId: user.id, type: 'deposit', amount, status: 'approved', description: `Pagamento Pix Confirmado (+ R$ ${amount.toFixed(2)})`, createdAt: new Date().toISOString() });
    const autoHired = false;
    const hiredProductName = null;
    // Sem ativacao automatica: fica no saldo investir para escolha livre (creditado acima)
    crmDb.moveLeadByPhone(user.phone, 'ganho', 'Pix confirmado', amount);
    markPixChargeUsed(paymentId, 'used').catch(() => {});
    notifyAdminDeposit({ operatorName: user.operatorName, phone: user.phone, amount, productName: hiredProductName, txId, isAutoHire: autoHired }).catch(e => console.error('[ASAAS] notify:', e.message));
    await recordWebhookLog({ provider: 'asaas', eventType: event, amount, customerPhone: user.phone, customerName: user.operatorName, customerEmail: '', matchedUserId: user.id, status: 'processed', note: autoHired ? `Frota ${hiredProductName} ativada (Asaas).` : `Saldo de R$ ${amount.toFixed(2)} creditado (Asaas).`, rawPayload: rawBody });
    return res.status(200).json({ success: true, user: user.id, autoHired });
  } catch (err) {
    console.error('[ASAAS WEBHOOK ERROR]:', err.message);
    return res.status(500).json({ error: 'Erro ao processar webhook Asaas.' });
  }
});

// Webhook Oficial da MisticPay (DEPOSITO via Pix)
// A Mistic nao assina o webhook: antes de creditar, confirma server-side via /transactions/check.
router.post('/webhook/mistic', async (req, res) => {
  try {
    const rawBody = req.body || {};
    const txType = String(rawBody.transactionType || '').toUpperCase();
    // Acompanhamento de saque (RETIRADA): correlaciona pelo id externo gravado na aprovação
    if (txType === 'RETIRADA') {
      const theirId = String(rawBody.transactionId || '');
      const wdStatus = String(rawBody.status || '').toUpperCase();
      let wd = theirId ? await findTransactionByExternalId(theirId) : null;
      // Sem id gravado na aprovacao: cai para o saque aberto de MESMO valor.
      // So aceita quando existe exatamente 1 candidato, para nunca cruzar saques.
      if (!wd) {
        try {
          const val = Math.abs(parseFloat(rawBody.value || 0));
          if (val > 0) {
            const open = (await getAllTransactions()).filter(t =>
              t.type === 'withdraw' &&
              ['pending', 'processing', 'approved'].includes(t.status) &&
              !t.externalId &&
              Math.abs(Math.abs(parseFloat(t.amount || 0)) - val) < 0.01
            );
            if (open.length === 1) wd = open[0];
          }
        } catch (e) { /* fallback opcional */ }
      }
      if (!wd) {
        await recordWebhookLog({ provider: 'misticpay', eventType: 'withdraw', amount: parseFloat(rawBody.value || 0), customerPhone: null, customerName: String(rawBody.clientName || ''), customerEmail: '', matchedUserId: null, status: 'ignored', note: 'Retirada sem saque correspondente.', rawPayload: rawBody });
        return res.status(200).json({ received: true });
      }
      if (wdStatus === 'COMPLETO' || wdStatus === 'COMPLETA' || wdStatus === 'PAID' || wdStatus === 'APPROVED') {
        let opName = String(rawBody.clientName || '');
        let opPhone = null;
        try {
          const opUser = await findUserById(wd.userId);
          if (opUser) { opName = opUser.operatorName || opName; opPhone = opUser.phone || null; }
        } catch (e) {}
        await recordWebhookLog({ provider: 'misticpay', eventType: 'withdraw', amount: Math.abs(parseFloat(wd.amount || 0)), customerPhone: opPhone, customerName: opName, customerEmail: '', matchedUserId: wd.userId, status: 'processed', note: `Saque ${wd.id} liquidado na MisticPay.`, rawPayload: rawBody });
        return res.status(200).json({ received: true, note: 'Saque liquidado.' });
      }
      if (wdStatus === 'FALHA' || wdStatus === 'FAILED' || wdStatus === 'CANCELADO' || wdStatus === 'CANCELLED') {
        // Falhou lá: volta para pendente para o admin decidir (o saldo segue reservado)
        await updateTransaction(wd.id, { status: 'pending', externalId: null });
        await recordWebhookLog({ provider: 'misticpay', eventType: 'withdraw', amount: Math.abs(parseFloat(wd.amount || 0)), customerPhone: null, customerName: '', customerEmail: '', matchedUserId: wd.userId, status: 'failed', note: `Saque ${wd.id} falhou na MisticPay e voltou para pendente.`, rawPayload: rawBody });
        notifyAdminWithdrawal({ operatorName: wd.userId, phone: '', amount: Math.abs(parseFloat(wd.amount || 0)), pixKey: wd.pixKey || '', txId: wd.id, totalDeposited: 0, activeContractsCount: 0 }).catch(() => {});
        return res.status(200).json({ received: true, note: 'Saque revertido para pendente.' });
      }
      return res.status(200).json({ received: true });
    }
    if (!isMisticDeposit(rawBody)) {
      await recordWebhookLog({ provider: 'misticpay', eventType: 'deposit', amount: parseFloat(rawBody.value || 0), customerPhone: null, customerName: String(rawBody.clientName || ''), customerEmail: '', matchedUserId: null, status: 'ignored', note: 'Evento nao e deposito confirmado.', rawPayload: rawBody });
      return res.status(200).json({ received: true });
    }
    const theirId = String(rawBody.transactionId || '');
    if (!theirId) return res.status(200).json({ received: true, warning: 'Sem transactionId.' });
    const txId = `MISTIC-${theirId}`;
    if (await findTransactionById(txId)) {
      return res.status(200).json({ received: true, note: 'Pagamento ja processado.' });
    }
    // Confirmação server-side (evita crédito por webhook forjado)
    let check;
    try {
      check = await checkMisticPaid(theirId);
    } catch (e) {
      console.error('[MISTIC WEBHOOK] falha ao conferir na API, retry mais tarde:', e.message);
      return res.status(500).json({ error: 'Verificacao indisponivel, tente novamente.' });
    }
    if (!check.confirmed) {
      return res.status(200).json({ received: true, note: 'Transacao ainda nao confirmada na MisticPay.' });
    }
    // Valor autoritativo vem da API (nunca do corpo do webhook, que pode ser forjado)
    const amount = parseFloat(check.value || 0);
    if (!(amount > 0)) return res.status(200).json({ received: true, warning: 'Valor invalido.' });

    let user = null;
    try {
      const saved = await findPixCharge(theirId);
      if (saved && saved.userId) user = await findUserById(saved.userId);
    } catch (e) { user = null; }
    if (!user) {
      const doc = String(rawBody.clientDocument || '').replace(/\D/g, '');
      if (doc.length === 11) {
        try {
          const all = await getAllUsers();
          user = all.find(u => String(u.cpfCnpj || '').replace(/\D/g, '') === doc) || null;
        } catch (e) { user = null; }
      }
    }
    if (!user) {
      await recordWebhookLog({ provider: 'misticpay', eventType: 'deposit', amount, customerPhone: null, customerName: String(rawBody.clientName || ''), customerEmail: '', matchedUserId: null, status: 'user_not_found', note: 'Usuario nao localizado (pixCharge/CPF).', rawPayload: rawBody });
      return res.status(200).json({ received: true, warning: 'Usuario nao encontrado.' });
    }

    const now = new Date().toISOString();
    await updateUser(user.id, { totalDepositedInc: amount, investBalanceInc: amount, balanceInc: amount });
    await createTransaction({ id: txId, userId: user.id, type: 'deposit', amount, status: 'approved', description: `Pagamento Pix Confirmado (+ R$ ${amount.toFixed(2)})`, createdAt: now });
    markPixChargeUsed(theirId, 'used').catch(() => {});
    crmDb.moveLeadByPhone(user.phone, 'ganho', 'Pix confirmado', amount);
    notifyAdminDeposit({ operatorName: user.operatorName, phone: user.phone, amount, productName: null, txId, isAutoHire: false }).catch(e => console.error('[MISTIC] notify:', e.message));
    await recordWebhookLog({ provider: 'misticpay', eventType: 'deposit', amount, customerPhone: user.phone, customerName: user.operatorName, customerEmail: '', matchedUserId: user.id, status: 'processed', note: `Saldo de R$ ${amount.toFixed(2)} creditado (MisticPay).`, rawPayload: rawBody });
    console.log(`[MISTIC] Sucesso! Operador ${user.operatorName} processado (+ R$ ${amount.toFixed(2)})`);
    return res.status(200).json({ success: true, user: user.id });
  } catch (err) {
    console.error('[MISTIC WEBHOOK ERROR]:', err.message);
    return res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
});

// Webhook Oficial da SyncPay (cash-in created/updated)
router.post('/webhook/syncpay', async (req, res) => {
  try {
    const rawBody = req.body || {};
    if (SYNCPAY_WEBHOOK_TOKEN) {
      const got = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
        || String(req.query.token || '').trim();
      if (got !== SYNCPAY_WEBHOOK_TOKEN) {
        return res.status(401).json({ error: 'Token invalido.' });
      }
    }
    const txIdentifier = rawBody.id || rawBody.identifier || (rawBody.data && (rawBody.data.id || rawBody.data.identifier)) || '';
    const pay = (rawBody.data && typeof rawBody.data === 'object') ? rawBody.data : rawBody;
    const amount = parseFloat(pay.amount || pay.final_amount || 0);
    const status = String(pay.status || '');
    const payClient = (pay.client && typeof pay.client === 'object') ? pay.client : {};
    console.log('[SYNCPAY WEBHOOK]', status, txIdentifier, amount);
    const confirmed = status.toLowerCase() === 'completed' || status.toLowerCase() === 'paid' || status.toLowerCase() === 'approved';
    const logPhone = (() => {
      const em = String(payClient.email || '').split('@')[0].replace(/\D/g, '');
      return em.length >= 10 ? em : null;
    })();
    if (!confirmed || !txIdentifier || !(amount > 0)) {
      let dispId = null, dispName = '', dispPhone = null;
      try {
        const remembered0 = lookupSyncCharge(txIdentifier);
        const saved0 = remembered0 || await findPixCharge(txIdentifier);
        if (saved0 && saved0.userId) {
          const du = await findUserById(saved0.userId);
          if (du) { dispId = du.id; dispName = du.operatorName || ''; dispPhone = du.phone || null; }
        }
      } catch (e) {}
      await recordWebhookLog({ provider: 'syncpay', eventType: 'cashin.' + (status || 'unknown'), amount, customerPhone: dispPhone || logPhone, customerName: dispName || String(payClient.name || ''), customerEmail: String(payClient.email || ''), matchedUserId: dispId, status: 'ignored', note: 'Status nao confirmado ou sem valor.', rawPayload: rawBody });
      return res.status(200).json({ received: true });
    }
    let user = null;
    const remembered = lookupSyncCharge(txIdentifier);
    if (remembered && remembered.userId) {
      try { user = await findUserById(remembered.userId); } catch (e) { user = null; }
    }
    if (!user && txIdentifier) {
      try {
        const saved = await findPixCharge(txIdentifier);
        if (saved && saved.userId) user = await findUserById(saved.userId);
      } catch (e) { user = null; }
    }
    if (!user) {
      const doc = String(payClient.document || '').replace(/\D/g, '');
      if (doc) {
        try {
          const all = await getAllUsers();
          user = all.find(u => String(u.cpfCnpj || '').replace(/\D/g, '') === doc) || null;
        } catch (e) { user = null; }
      }
    }
    if (!user) {
      const cliEmail = String(payClient.email || '');
      const phoneFromEmail = cliEmail.split('@')[0].replace(/\D/g, '');
      if (phoneFromEmail.length >= 10) {
        try { user = await findUserByPhone(phoneFromEmail); } catch (e) { user = null; }
      }
    }
    if (!user) {
      const cliName = String(payClient.name || '').trim();
      if (cliName) {
        try {
          const all = await getAllUsers();
          user = all.find(u => String(u.operatorName || '').trim().toLowerCase() === cliName.toLowerCase()) || null;
        } catch (e) { user = null; }
      }
    }
    if (!user) {
      await recordWebhookLog({ provider: 'syncpay', eventType: 'cashin.' + status, amount, customerPhone: null, customerName: String(payClient.name || ''), customerEmail: String(payClient.email || ''), matchedUserId: null, status: 'user_not_found', note: 'Usuario nao localizado (identifier/CPF/email/nome).', rawPayload: rawBody });
      return res.status(200).json({ received: true, warning: 'Usuario nao encontrado.' });
    }
    const txId = `SYNC-${txIdentifier}`;
    const userTx = await getTransactionsByUserId(user.id);
    if (userTx.some(t => t.id === txId)) {
      return res.status(200).json({ received: true, note: 'Pagamento ja processado.' });
    }
    await updateUser(user.id, { totalDepositedInc: amount, investBalanceInc: amount, balanceInc: amount });
    await createTransaction({ id: txId, userId: user.id, type: 'deposit', amount, status: 'approved', description: `Pagamento Pix Confirmado (+ R$ ${amount.toFixed(2)})`, createdAt: new Date().toISOString() });
    const autoHired = false;
    const hiredProductName = null;
    // Sem ativacao automatica: fica no saldo investir para escolha livre (creditado acima)
    forgetSyncCharge(txIdentifier);
    markPixChargeUsed(txIdentifier, 'used').catch(() => {});
    crmDb.moveLeadByPhone(user.phone, 'ganho', 'Pix confirmado', amount);
    notifyAdminDeposit({ operatorName: user.operatorName, phone: user.phone, amount, productName: hiredProductName, txId, isAutoHire: autoHired }).catch(e => console.error('[SYNCPAY] notify:', e.message));
    await recordWebhookLog({ provider: 'syncpay', eventType: 'cashin.' + status, amount, customerPhone: user.phone, customerName: user.operatorName, customerEmail: '', matchedUserId: user.id, status: 'processed', note: autoHired ? `Frota ${hiredProductName} ativada (SyncPay).` : `Saldo de R$ ${amount.toFixed(2)} creditado (SyncPay).`, rawPayload: rawBody });
    return res.status(200).json({ success: true, user: user.id, autoHired });
  } catch (err) {
    console.error('[SYNCPAY WEBHOOK ERROR]:', err.message);
    return res.status(500).json({ error: 'Erro ao processar webhook SyncPay.' });
  }
});

// Solicitar Saque
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, pixKey, pixKeyType } = req.body;
    const numAmount = parseFloat(amount);
    const { minWithdraw, withdrawFee, minDeposit } = await getMoneyLimits();

    if (!pixKey) {
      return res.status(400).json({ error: 'A Chave Pix é obrigatória.' });
    }
    // O operador escolhe o tipo da chave. Sem escolha, detectamos — mas NUNCA
    // chutamos "CPF": chave invalida在这里 travava dinheiro na fila da gateway.
    const rawKey = String(pixKey).trim().slice(0, 77);
    const chosenType = pixKeyType ? String(pixKeyType).toUpperCase() : null;
    if (chosenType && PIX_TYPES.indexOf(chosenType) < 0) {
      return res.status(400).json({ error: 'Tipo de chave Pix inválido.' });
    }
    const keyCheck = validatePixKey(rawKey, chosenType);
    if (!keyCheck.ok) {
      return res.status(400).json({ error: keyCheck.error });
    }
    const cleanPixKey = keyCheck.normalized;
    const pixKeyTypeFinal = keyCheck.type;
if (!numAmount || numAmount < minWithdraw) {
return res.status(400).json({ error: `O valor mínimo de saque é R$ ${minWithdraw.toFixed(2)}.` });
}

    let user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const wdLimitsLib = require('../services/limits');

    // O bônus de boas-vindas foi DESATIVADO (settings.signup_bonus = 0), e a
    // expiração preguiçosa que existia aqui foi removida.
    //
    // Ela era um perigo real depois do reset do contador de depósitos: o teste
    // era "totalDeposited == 0 e o bonus tem mais de 7 dias", então zerar o
    // contador fazia toda conta antiga que ainda tivesse o valor parado no
    // saldo de saque ser descontada em silêncio na proxima tentativa de saque,
    // sem a pessoa ter feito nada de errado.
    //
    // Quem já recebeu o bônus continua com o dinheiro. Não há estorno.

    // Fase 2: limites rolantes 24h (contador, não virada 23:59 → 00:00)
    try {
      const moneyLimits = await getMoneyLimits();
      const wdLimits = wdLimitsLib.parseLimitSettings(moneyLimits);
      const userTx = await getTransactionsByUserId(user.id);
      const wdTx = userTx.filter(t => t.type === 'withdraw' && (t.status === 'pending' || t.status === 'approved' || t.status === 'processing'));
      const sorted = wdTx.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const lastWithdrawAt = sorted.length ? sorted[0].createdAt : null;
      const withdraws24h = wdLimitsLib.sumInWindow(wdTx, wdLimitsLib.DAY, Date.now());
      let globalWithdraws24h = 0;
      try {
        const allTx = await getAllTransactions();
        globalWithdraws24h = wdLimitsLib.sumInWindow(
          allTx.filter(t => t.type === 'withdraw' && (t.status === 'pending' || t.status === 'approved' || t.status === 'processing')),
          wdLimitsLib.DAY, Date.now()
        );
      } catch (e) { console.error('[WALLET] global withdraw sum:', e.message); }
      const wdCheck = wdLimitsLib.checkWithdrawLimits({
        amount: numAmount, user, withdraws24h, globalWithdraws24h,
        lastWithdrawAt, limits: wdLimits, now: Date.now()
      });
      if (!wdCheck.ok) {
        const body = { error: wdCheck.error };
        if (wdCheck.retryAfterMs) {
          body.retryAfterMs = wdCheck.retryAfterMs;
          body.retryIn = wdLimitsLib.formatRetryMs(wdCheck.retryAfterMs);
        }
        if (wdCheck.code === 'GLOBAL_CAP') {
          notifyAdminSecurityAlert({
            title: 'Teto global de saques atingido (24h)',
            detail: `Pedido de R$ ${numAmount.toFixed(2)} por ${user.operatorName} (${user.phone}) bloqueado (429). Soma 24h: R$ ${globalWithdraws24h.toFixed(2)}.`
          }).catch(e => console.error('[WALLET] global cap notify:', e.message));
        }
        return res.status(wdCheck.status).json(body);
      }
    } catch (e) { console.error('[WALLET] withdraw limits check:', e.message); }

    // Saque sai SOMENTE do saldo de saque (ganhos); conferir valor cheio num bucket
    const earnBal = Math.round(parseFloat(user.earnBalance || 0) * 100) / 100;
    if (numAmount > earnBal) {
      return res.status(400).json({ error: 'Saldo de saque insuficiente. Rendimentos e bônus ficam no saldo de saque.' });
    }

    // Regra de saque: conta precisa ter ao menos 1 depósito mínimo (sem exigir drone)
    const userContracts = await getContractsByUserId(user.id);
    const activeContracts = userContracts.filter(c => c.status === 'Em corrida');
    const totalDeposited = parseFloat(user.totalDeposited || 0);

    if (totalDeposited < minDeposit) {
      // toFixed devolvia "20.00". Com ponto, em portugues, parece erro.
      const brl = Number(minDeposit).toFixed(2).replace('.', ',');
      const faltaBruta = Number(minDeposit) - totalDeposited;
      const falta = Math.round(faltaBruta * 100) / 100;
      return res.status(403).json({
        error: `Para sacar, sua conta precisa ter ao menos R$ ${brl} em depósitos.`,
        faltaDeposito: falta,
        depositoMinimo: Number(minDeposit)
      });
    }

    const newEarn = Math.round((earnBal - numAmount) * 100) / 100;
    const newWithdrawn = Math.round(((user.totalWithdrawn || 0) + numAmount) * 100) / 100;

    await updateUser(user.id, {
      earnBalance: newEarn,
      balance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100,
      totalWithdrawn: newWithdrawn
    });

    const WITHDRAW_FEE_RATE = withdrawFee / 100;
    const feeAmount = Math.round(numAmount * WITHDRAW_FEE_RATE * 100) / 100;
    const netAmount = Math.round((numAmount - feeAmount) * 100) / 100;

    const txId = `WD-${Date.now()}`;
    // Controle manual pelo admin: saque nasce pendente; o Pix é enviado ao aprovar no painel.
    const withdrawStatus = 'pending';
    const withdrawMessage = `Solicitacao de saque enviada com sucesso! Aguarde a aprovacao do administrador para receber R$ ${netAmount.toFixed(2)} (taxa ${withdrawFee}%).`;
    const asaasTransferId = null;
    await createTransaction({
      id: txId,
      userId: user.id,
      type: 'withdraw',
      amount: -numAmount,
      status: withdrawStatus,
      pixKey: cleanPixKey,
      pixKeyType: pixKeyTypeFinal,
      description: `Saque Pix (${cleanPixKey}) | Taxa ${withdrawFee}%: R$ ${feeAmount.toFixed(2)} | Liquido: R$ ${netAmount.toFixed(2)}`,
      createdAt: new Date().toISOString()
    });

    // Quanto essa pessoa JA sacou de verdade. Soma só dos saques APROVADOS
    // (ver getApprovedWithdrawalsTotal): o campo user.totalWithdrawn contava a
    // solicitação pendente e tinha divergência antiga, o que contaminaria o
    // alerta de abuso. Se falhar, avisa 0 em vez de quebrar o saque.
    let alreadyWithdrawn = 0;
    let alreadyCount = 0;
    try {
      const tot = await getApprovedWithdrawalsTotal(user.id);
      alreadyWithdrawn = tot.total;
      alreadyCount = tot.count;
    } catch (e) {
      console.error('[WITHDRAW] nao deu para calcular o total ja sacado:', e.message);
    }

    // Dispara notificação imediata e detalhada para o Telegram do Administrador
    notifyAdminWithdrawal({
      operatorName: user.operatorName,
      phone: user.phone,
      amount: numAmount,
      pixKey: cleanPixKey,
      txId: txId,
      totalDeposited: totalDeposited,
      activeContractsCount: activeContracts.length,
      alreadyWithdrawn,
      alreadyCount
    }).catch(err => console.error('[ADMIN NOTIFY WITHDRAW ERROR]:', err));

    res.json({
      message: withdrawMessage,
      txId,
      amount: numAmount,
      feeAmount,
      netAmount,
      newBalance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100,
      newEarnBalance: newEarn,
      asaasTransferId
    });

  } catch (err) {
    console.error('[WALLET ERROR /withdraw]:', err);
    res.status(500).json({ error: 'Erro ao solicitar saque.' });
  }
});

// Check-in Diário
router.post('/checkin', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    const today = new Date().toDateString();

    if (user.lastCheckinDate === today) {
      return res.status(400).json({ error: 'Você já resgatou o bônus de hoje!' });
    }

    // Check-in: R$ 0,10-0,60 (90%) ou R$ 0,61-0,89 (10% - raro, mas possível)
    const roll = Math.random();
    const cents = roll < 0.9
      ? 10 + Math.floor(Math.random() * 51)
      : 61 + Math.floor(Math.random() * 29);
    const bonus = cents / 100;
    const newEarn = Math.round(((user.earnBalance || 0) + bonus) * 100) / 100;

    await updateUser(user.id, {
      earnBalance: newEarn,
      balance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100,
      lastCheckinDate: today
    });

    await createTransaction({
      id: `CK-${Date.now()}`,
      userId: user.id,
      type: 'bonus',
      amount: bonus,
      status: 'approved',
      description: 'Bônus de Check-in Diário',
      createdAt: new Date().toISOString()
    });

    res.json({
      message: 'Check-in realizado com sucesso!',
      bonus,
      newBalance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100,
      newEarnBalance: newEarn
    });
  } catch (err) {
    console.error('[WALLET ERROR /checkin]:', err);
    res.status(500).json({ error: 'Erro ao realizar check-in.' });
  }
});

// Resgatar Código Bônus (cupom)
router.post('/bonus/redeem', authMiddleware, async (req, res) => {
  try {
    const code = normPromoCode(req.body && req.body.code);
    if (!code) {
      return res.status(400).json({ error: 'Informe o código do bônus.' });
    }
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const result = await redeemPromo(code, user.id);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    const amount = parseFloat(result.promo.amount || 0);
    const newEarn = Math.round(((user.earnBalance || 0) + amount) * 100) / 100;
    await updateUser(user.id, {
      earnBalance: newEarn,
      balance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100
    });
    await createTransaction({
      id: `BN-${Date.now()}`,
      userId: user.id,
      type: 'bonus',
      amount,
      status: 'approved',
      description: `Bônus código ${code} resgatado`,
      createdAt: new Date().toISOString()
    });
    res.json({ message: `Bônus de R$ ${amount.toFixed(2)} creditado!`, amount, newBalance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100, newEarnBalance: newEarn });
  } catch (err) {
    console.error('[WALLET ERROR /bonus/redeem]:', err);
    res.status(500).json({ error: 'Erro ao resgatar bônus.' });
  }
});

// Histórico de Transações
// Recargas confirmadas (leve). O app consulta de tempos em tempos para
// disparar o evento Purchase no Meta sem depender de o operador abrir o Extrato.
// Recargas aprovadas que ainda NAO foram reportadas para Meta/TikTok.
// O cliente dispara os eventos e depois chama /purchases/reported para marcar.
// Sem isso, o app repetia o Purchase a cada 30s (ver updateSupportBadge).
router.get('/purchases', authMiddleware, async (req, res) => {
  try {
    const list = await getUnreportedDeposits(req.user.id);
    res.json(list);
  } catch (err) {
    console.error('[WALLET ERROR /purchases]:', err);
    res.status(500).json({ error: 'Erro ao buscar recargas.' });
  }
});

// Marca as recargas como ja reportadas para as plataformas de anuncio.
router.post('/purchases/reported', authMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.json({ ok: true, marked: 0 });
    // So marca recargas DELE: um id de outro usuario nao pode ser confirmado.
    const doUsuario = await getUnreportedDeposits(req.user.id);
    const permitidos = new Set(doUsuario.map(t => String(t.id)));
    const validos = ids.map(String).filter(id => permitidos.has(id)).slice(0, 200);
    if (!validos.length) return res.json({ ok: true, marked: 0 });
    const marked = await markDepositsReported(validos);
    res.json({ ok: true, marked });
  } catch (err) {
    console.error('[WALLET ERROR /purchases/reported]:', err);
    res.status(500).json({ error: 'Erro ao marcar recargas como reportadas.' });
  }
});

router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const userTx = await getTransactionsByUserId(req.user.id);
    res.json(userTx);
  } catch (err) {
    console.error('[WALLET ERROR /transactions]:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de transações.' });
  }
});

module.exports = router;

