const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findUserByPhone, findUserByInviteCode, createUser, getSystemSettings, newUserId, newInviteCode, updateUser, createTransaction, getMoneyLimits, countUsersByIpSince } = require('../database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// Cadastro
router.post('/register', async (req, res) => {
  try {
    const { phone, password, inviteCode, utmSource, utmCampaign, utmMedium, fbclid, utmContent, utmTerm, ttp } = req.body;
    let operatorName = String(req.body.operatorName || req.body.name || '').replace(/[<>"'`]/g, '').trim().slice(0, 60);

    if (!operatorName || operatorName.length < 2) {
      return res.status(400).json({ error: 'Informe seu nome para criar a conta.' });
    }

    if (!phone || !password) {
      return res.status(400).json({ error: 'Telefone e senha são obrigatórios.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    if (!req.body.confirmPassword || req.body.confirmPassword !== password) {
      return res.status(400).json({ error: 'As senhas não coincidem.' });
    }

    const rawDigits = String(phone).replace(/\D/g, '');
    let national = rawDigits;
    if (national.length > 11 && national.startsWith('55')) national = national.substring(2);
    const ddd = parseInt(national.substring(0, 2), 10);
    const numberPart = national.substring(2);
    const allSame = /^(\d)\1+$/.test(national);
    const longRepeat = /(\d)\1{6,}/.test(numberPart);
    const validLen = national.length === 10 || national.length === 11;
    const validDdd = ddd >= 11 && ddd <= 99;
    const validStart = national.length === 11 ? national[2] === '9' : /^[2-5]/.test(numberPart);
    if (!validLen || !validDdd || allSame || longRepeat || !validStart) {
      return res.status(400).json({ error: 'Informe um número de WhatsApp válido com DDD.' });
    }
    const cleanPhone = national;
    const existing = await findUserByPhone(cleanPhone);
    if (existing) {
      return res.status(400).json({ error: 'Este número de telefone já está cadastrado.' });
    }

    // Verifica quem indicou (código do link ou padrão da casa quando veio direto)
    // Conta "casa": recebe a indicação de quem se cadastrou sem invite válido.
    const DEFAULT_INVITE_CODE = process.env.DEFAULT_INVITE_CODE || 'NX801C6FE8';
    let referredBy = null;
    if (inviteCode) {
      const upline = await findUserByInviteCode(inviteCode);
      if (upline) referredBy = upline.id;
    }
    if (!referredBy) {
      try {
        const house = await findUserByInviteCode(DEFAULT_INVITE_CODE);
        if (house) referredBy = house.id;
      } catch (e) {}
    }

    const randomSuffix = crypto.randomBytes(2).toString('hex');
    const userId = newUserId();
    // Fase 2: hash do IP de cadastro (mesmo padrão do analytics em server.js)
    let registerIpHash = null;
    try {
      const fwd = req.headers['x-forwarded-for'];
      const clientIp = (fwd ? String(fwd).split(',')[0] : (req.socket && req.socket.remoteAddress)) || '127.0.0.1';
      registerIpHash = crypto.createHash('sha256').update(String(clientIp).trim() + '_truckauto_salt').digest('hex').substring(0, 16);
    } catch (e) { registerIpHash = null; }
    const newUser = {
      id: userId,
      operatorName: operatorName || `Operador #${randomSuffix.toUpperCase()}`,
      phone: cleanPhone,
      passwordHash: bcrypt.hashSync(password, 10),
      inviteCode: await newInviteCode(),
      referredBy: referredBy,
      registerIpHash: registerIpHash,
      balance: 0.00,
      totalDeposited: 0.00,
      totalWithdrawn: 0.00,
      vipLevel: 'VIP 1',
      lastCheckinDate: null,
      utmSource: utmSource || 'direto',
      utmCampaign: utmCampaign || '',
      utmMedium: utmMedium || '',
      createdAt: new Date().toISOString()
    };

    await createUser(newUser);

    // Fase 2: velocidade anti-farm — 4ª+ conta em 24h rolantes no mesmo IP vira suspeita
    try {
      if (registerIpHash) {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const ipCount = await countUsersByIpSince(registerIpHash, since);
        if (ipCount >= 4) {
          await updateUser(newUser.id, { crmStatus: 'suspeito' });
          console.log(`[ANTI-FARM] conta ${newUser.id} marcada suspeita (IP ${registerIpHash}, ${ipCount}/24h).`);
          try {
            const { notifyAdminSecurityAlert } = require('../services/telegramBot');
            notifyAdminSecurityAlert({
              title: 'Conta suspeita (possível farm)',
              detail: `${newUser.operatorName} (${cleanPhone}) — ${ipCount}ª conta em 24h no mesmo IP. Bônus em revisão.`
            }).catch(e => console.error('[ANTI-FARM] notify:', e.message));
          } catch (e) { console.error('[ANTI-FARM NOTIFY ERROR]:', e.message); }
        }
      }
    } catch (e) { console.error('[ANTI-FARM ERROR]:', e.message); }

    // Bônus de boas-vindas (valor configurável no admin; 0 = desligado)
    let signupBonusGranted = 0;
    try {
      const { signupBonus } = await getMoneyLimits();
      if (signupBonus > 0) {
        signupBonusGranted = Math.round(signupBonus * 100) / 100;
        await updateUser(newUser.id, { earnBalance: signupBonusGranted, balance: signupBonusGranted });
        await createTransaction({
          id: `BNS-SIGNUP-${Date.now()}`,
          userId: newUser.id,
          type: 'bonus',
          amount: signupBonusGranted,
          status: 'approved',
          description: `Bônus de boas-vindas (+ R$ ${signupBonusGranted.toFixed(2)})`,
          createdAt: new Date().toISOString()
        });
        newUser.balance = signupBonusGranted;
      }
    } catch (e) { console.error('[AUTH BONUS ERROR]:', e.message); }
// Lead automatico no funil local (primeira etapa) se ainda nao existir
try {
const crmDb = require('../services/crmDb');
const existingLead = crmDb.getLead ? crmDb.getLead(cleanPhone) : null;
if (!existingLead) {
    const leadFbc = String(fbclid || '').trim().slice(0, 100);
    const leadTtp = String(ttp || '').trim().slice(0, 100);
    const leadContent = String(utmContent || '').trim().slice(0, 100);
    const leadTerm = String(utmTerm || '').trim().slice(0, 100);
    // Veio de anuncio de verdade? So se veio parametro de campanha OU o id do
    // clique (Meta fbclid / TikTok ttp). Sem isso, o lead e de origem direta
    // (indicacao, link direto) e precisa dizer isso — nunca fingir que foi anuncio.
    const veioDeAnuncio = !!leadFbc || !!leadTtp || !!leadContent || !!leadTerm;
    crmDb.createLead({
      name: newUser.operatorName,
      phone: cleanPhone,
      email: '',
      stage: 'novo',
      value: 0,
      tags: [veioDeAnuncio ? String(utmSource || 'facebook').toUpperCase() : 'Direto', 'Cadastro App'],
      campaign: utmCampaign || '',
      utm_source: utmSource || 'direto',
      utm_campaign: utmCampaign || '',
      utm_medium: utmMedium || '',
      utm_content: leadContent || undefined,
      utm_term: leadTerm || undefined,
      fbclid: leadFbc || undefined,
      // id do clique do TikTok: amarra a conversao ao anuncio do TikTok
      ttp: leadTtp || undefined,
      notes: veioDeAnuncio ? 'Lead veio de anuncio.' : 'Lead sem parametro de campanha (origem direta).'
});
}
} catch (e) {
console.error('[CRM AUTO-LEAD ERROR]:', e.message);
}

    // Sincroniza novo lead com o Nexus CRM (WhatsApp & SDR) - usa o proprio APP_URL se configurado
    getSystemSettings().then(settings => {
      const crmUrl = settings.nexusCrmUrl || process.env.NEXUS_CRM_URL || '';
      if (!crmUrl) return;
      // segredo: o webhook de ingestao do CRM exige (senao qualquer um injeta lead)
      const crmSecret = String(process.env.CRM_SECRET || process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || '').trim();
      fetch(`${crmUrl}/api/leads/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(crmSecret ? { 'x-crm-secret': crmSecret } : {}) },
        body: JSON.stringify({
          name: newUser.operatorName,
          phone: cleanPhone,
          campaign: utmCampaign || '',
          utm_source: utmSource || 'direto',
          utm_campaign: utmCampaign || '',
          utm_medium: utmMedium || '',
          value: 30.00
        })
      }).catch(e => console.warn('[NEXUS CRM SYNC WARNING]:', e.message));
    }).catch(() => {});

    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: {
        id: newUser.id,
        operatorName: newUser.operatorName,
        phone: newUser.phone,
        inviteCode: newUser.inviteCode,
        balance: newUser.balance,
        investBalance: 0,
        earnBalance: signupBonusGranted,
        vipLevel: newUser.vipLevel
      }
    });
  } catch (err) {
    console.error('[AUTH ERROR /register]:', err);
    res.status(500).json({ error: 'Erro interno ao processar cadastro.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Se login for do Nexus CRM (apenas senha)
    if (!phone && password) {
      const correctPass = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD;
      if (correctPass && password === correctPass) {
        // Antes devolvia um token que ninguem validava: a tela abria, mas a API
        // ficava aberta pra internet. Agora o cookie httpOnly e assinado e
        // verificado a cada chamada (services/crmSession.js).
        try { require('../services/crmSession').setCookie(res); } catch (e) { console.error('[CRM SESSION ERROR]:', e.message); }
        return res.json({
          success: true,
          message: 'Acesso autorizado ao TRUCKAUTO CRM!'
        });
      }
      return res.status(401).json({ success: false, message: 'Senha incorreta do CRM!' });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');

    const user = await findUserByPhone(cleanPhone);

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Telefone ou senha incorretos.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });


    res.json({
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id: user.id,
        operatorName: user.operatorName,
        phone: user.phone,
        inviteCode: user.inviteCode,
        balance: user.balance,
        investBalance: parseFloat(user.investBalance || 0),
        earnBalance: parseFloat(user.earnBalance || 0),
        vipLevel: user.vipLevel
      }
    });
  } catch (err) {
    console.error('[AUTH ERROR /login]:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

// Dados do Usuário Logado
router.get('/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    operatorName: u.operatorName,
    phone: u.phone,
    inviteCode: u.inviteCode,
    balance: u.balance,
    investBalance: parseFloat(u.investBalance || 0),
    earnBalance: parseFloat(u.earnBalance || 0),
    totalDeposited: parseFloat(u.totalDeposited || 0),
    vipLevel: u.vipLevel,
    createdAt: u.createdAt
  });
});

module.exports = router;

