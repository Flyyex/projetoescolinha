const express = require('express');
const axios = require('axios');
const db = require('../services/crmDb');

module.exports = function(io) {
  const router = express.Router();

  // ================= SEGURANÇA DO CRM =================
  // Sem isso, qualquer pessoa na internet lia todos os leads (LGPD), via as
  // senhas do CRM em /settings e usava a conta de WhatsApp da empresa.
  // O login continua em /api/auth/login (a tela do CRM ja usava); aqui a gente
  // so passa a VERIFICAR a sessao que ele emite.
  const crmSession = require('../services/crmSession');
  const CRM_KEY = crmSession.secret();

  if (process.env.NODE_ENV === 'production' && !CRM_KEY) {
    throw new Error('[SECURITY] CRM sem ADMIN_KEY/CRM_SECRET — o CRM ficaria aberto.');
  }

  // Ingestão de leads de anúncio: exige segredo próprio (o outro é sessão de
  // navegador). Sem isso qualquer um injeta lead falso e polui o funil.
  function leadIngestAuth(req, res, next) {
    const s = String(req.get('x-crm-secret') || (req.query && req.query.secret) || '').trim();
    if (s && CRM_KEY && s === CRM_KEY) return next();
    return res.status(401).json({ error: 'Webhook do CRM: segredo invalido.' });
  }

  // Health: nao devolve segredo nenhum, so serve pra checar se o CRM esta de pe.
  router.get('/crm/health', (req, res) => res.json({ ok: true, authRequired: true }));

  // Daqui pra baixo: dado do CRM, exige sessao. O webhook de ingestao fica de
  // fora porque tem a propria checagem (leadIngestAuth).
  router.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/leads/webhook') return leadIngestAuth(req, res, next);
    return crmSession.middleware(req, res, next);
  });

  // Helper Evolution API client
  function getEvoClient() {
    const settings = db.getSettings();
    const baseURL = process.env.EVOLUTION_API_URL || settings.evolutionApiUrl || '';
    return axios.create({
      baseURL: baseURL,
      headers: {
        'apikey': settings.globalApiKey || process.env.GLOBAL_API_KEY || '',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  function getDefaultInstance() {
    const settings = db.getSettings();
    return process.env.DEFAULT_INSTANCE || settings.defaultInstance || 'principal';
  }

  // ---------------- WhatsApp Endpoints ----------------
  router.get('/whatsapp/status', async (req, res) => {
    const settings = db.getSettings();
    const instanceName = req.query.instance || getDefaultInstance();
    const evo = getEvoClient();

    try {
      const instancesRes = await evo.get('/instance/fetchInstances');
      const instanceList = Array.isArray(instancesRes.data) ? instancesRes.data : [];
      const inst = instanceList.find(i => (i.name === instanceName || i.instance?.instanceName === instanceName));

      let qrData = null;
      let connectionStatus = inst ? (inst.connectionStatus || inst.instance?.status || 'close') : 'not_created';

      if (inst && (connectionStatus === 'connecting' || connectionStatus === 'close')) {
        try {
          const qrRes = await evo.get(`/instance/connect/${instanceName}`);
          qrData = qrRes.data;
        } catch (err) {}
      }

      return res.json({
        success: true,
        instanceName,
        exists: Boolean(inst),
        connectionStatus: connectionStatus,
        ownerJid: inst ? (inst.ownerJid || inst.instance?.owner) : null,
        profileName: inst ? (inst.profileName || inst.instance?.profileName) : null,
        profilePicUrl: inst ? (inst.profilePicUrl || inst.instance?.profilePictureUrl) : null,
        qrcode: qrData
      });
    } catch (err) {
      return res.json({
        success: false,
        instanceName,
        exists: false,
        connectionStatus: 'offline',
        error: err.response?.data || err.message,
        message: 'Evolution API não conectada em ' + (process.env.EVOLUTION_API_URL || settings.evolutionApiUrl)
      });
    }
  });

  router.post('/whatsapp/connect', async (req, res) => {
    const { number, instanceName } = req.body;
    const settings = db.getSettings();
    const inst = getDefaultInstance();
    const evo = getEvoClient();

    try {
      let response;
      const url = number ? `/instance/connect/${inst}?number=${number}` : `/instance/connect/${inst}`;
      try {
        response = await evo.get(url);
      } catch (connectErr) {
        if (connectErr.response?.status === 404 || connectErr.response?.data?.status === 404) {
          // Instância não existe -> cria automaticamente
          await evo.post('/instance/create', {
            instanceName: inst,
            token: process.env.EVOLUTION_INSTANCE_TOKEN || 'minha_instancia_token',
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          });
          response = await evo.get(url);
        } else {
          throw connectErr;
        }
      }

      const resData = response.data || {};
      const base64 = resData.base64 || resData.qrcode?.base64 || (typeof resData.qrcode === 'string' ? resData.qrcode : null);
      const pairingCode = resData.pairingCode || resData.code;

      if (io && base64) io.emit('whatsapp:qrcode', base64);
      return res.json({
        success: true,
        data: resData,
        qrcode: base64 ? { base64 } : resData.qrcode,
        base64: base64,
        pairingCode: pairingCode
      });
    } catch (err) {
      console.error('[WHATSAPP CONNECT ERROR]:', err.response?.data || err.message);
      return res.status(500).json({ success: false, error: err.response?.data || err.message });
    }
  });

  router.post('/whatsapp/send', async (req, res) => {
    const { leadId, phone, text, instanceName } = req.body;
    if (!text || (!leadId && !phone)) {
      return res.status(400).json({ success: false, message: 'Dados insuficientes.' });
    }

    const settings = db.getSettings();
    const inst = getDefaultInstance();
    let targetPhone = phone;
    let targetLeadId = leadId;

    if (!targetPhone && targetLeadId) {
      const lead = db.getLead(targetLeadId);
      if (lead) targetPhone = lead.phone;
    }

    if (!targetLeadId && targetPhone) {
      const cleanPhone = String(targetPhone).replace(/\D/g, '');
      let lead = db.getLead(cleanPhone);
      if (!lead) {
        const created = db.createLead({ phone: cleanPhone, name: 'Lead ' + cleanPhone.slice(-4) });
        lead = created.lead;
      }
      targetLeadId = lead.id;
    }

    const cleanNumber = String(targetPhone).replace(/\D/g, '');
    const evo = getEvoClient();

    let cleanedText = text;
    const crmMatch = text.match(/<crm>([\s\S]*?)<\/crm>/);
    if (crmMatch) {
      try {
        const crmData = JSON.parse(crmMatch[1].trim());
        const updates = {};
        if (crmData.estagio_funil) updates.stage = crmData.estagio_funil;
        if (crmData.temperatura) updates.temperature = crmData.temperatura;
        if (crmData.score_lead) updates.leadScore = Number(crmData.score_lead);
        if (crmData.veiculo_interesse) updates.vehicleInterest = crmData.veiculo_interesse;
        if (crmData.valor_cota) updates.value = Number(crmData.valor_cota);
        if (crmData.tag_adicionada) {
          const currentLead = db.getLead(targetLeadId);
          updates.tags = Array.from(new Set([...(currentLead?.tags || []), crmData.tag_adicionada]));
        }
        db.updateLead(targetLeadId, updates);
      } catch (e) {}
      cleanedText = text.replace(/<crm>[\s\S]*?<\/crm>/g, '').trim();
    }

    try {
      const evoRes = await evo.post(`/message/sendText/${inst}`, {
        number: cleanNumber,
        text: cleanedText,
        delay: 1200
      });

      const msg = db.addMessage(targetLeadId, {
        fromMe: true,
        text: cleanedText,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });

      if (io) {
        io.emit('chat:message', { leadId: targetLeadId, message: msg });
        io.emit('leads:update', db.getLeads());
      }

      return res.json({ success: true, message: msg, evoResponse: evoRes.data });
    } catch (err) {
      const msg = db.addMessage(targetLeadId, {
        fromMe: true,
        text: text,
        timestamp: new Date().toISOString(),
        status: 'error'
      });
      if (io) io.emit('chat:message', { leadId: targetLeadId, message: msg });
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar via WhatsApp Evolution API',
        error: err.response?.data || err.message,
        savedLocally: msg
      });
    }
  });

  // ---------------- Webhook Evolution & Funil Automático de Atendimento ----------------
  router.post(['/webhook/evolution', '/api/webhook/evolution', '/webhook/evolution/*'], async (req, res, next) => {
    if (req.method !== 'POST' && req.url.includes('webhook')) return next();
    const { event, instance, data } = req.body || {};
    const whatsappQueue = require('../services/whatsappQueue');

    console.log(`[WEBHOOK EVOLUTION RECEIVED] Event: ${event}, Instance: ${instance}`);

    // Trata mensagens (Evolution envia como messages.upsert ou array de data)
    const msgObj = Array.isArray(data) ? data[0] : data;

    if ((event === 'messages.upsert' || event === 'MESSAGES_UPSERT') && msgObj) {
      const key = msgObj.key || {};
      const fromMe = Boolean(key.fromMe);
      const remoteJid = key.remoteJid || '';
      
      if (remoteJid.includes('status@broadcast') || remoteJid.includes('@g.us')) {
        return res.json({ received: true });
      }

      const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');
      if (!cleanPhone) return res.json({ received: true });

      const messageContent = msgObj.message?.conversation ||
        msgObj.message?.extendedTextMessage?.text ||
        msgObj.message?.imageMessage?.caption ||
        '';

      console.log(`[WHATSAPP MSG INCOMING] De: ${cleanPhone} | fromMe: ${fromMe} | Texto: "${messageContent}"`);

      let lead = db.getLead(cleanPhone);
      let isNewLead = false;

      if (!lead) {
        const pushName = msgObj.pushName || ('Operador #' + cleanPhone.slice(-4));
        const created = db.createLead({
          phone: cleanPhone,
          name: pushName,
          stage: 'novo',
          tags: ['WhatsApp Orgânico', 'Presell Dúvidas'],
          lastMessage: messageContent
        });
        lead = created.lead;
        isNewLead = true;
      }

      // Registra mensagem recebida
      const newMsg = db.addMessage(lead.id, {
        id: key.id || 'wa-' + Date.now(),
        fromMe,
        text: messageContent || 'Mensagem recebida',
        timestamp: new Date().toISOString(),
        status: 'read'
      });

      if (io) {
        io.emit('chat:message', { leadId: lead.id, message: newMsg });
        io.emit('leads:update', db.getLeads());
        if (isNewLead) {
          io.emit('leads:new', { lead, isNew: true });
        }
      }

      // Se a mensagem veio do cliente (!fromMe) e o bot NÃO está pausado
      if (!fromMe && messageContent && !lead.botPaused) {
        const aiSdrEngine = require('../services/aiSdrEngine');
        const history = db.getMessages(lead.id);
        const result = aiSdrEngine.processMessage({ text: messageContent, lead, history });

        console.log(`[AI SDR INTENT DETECTED] Lead: ${cleanPhone} | Intent: ${result.intent}`);

        if (result.pauseBot) {
          db.updateLead(lead.id, { botPaused: true });
          if (io) io.emit('leads:human_requested', { lead });
        }

        if (result.nextStage && lead.stage !== 'ganho') {
          db.updateLead(lead.id, { stage: result.nextStage });
        }
        if (io) io.emit('leads:update', db.getLeads());

        if (result.reply) {
          console.log(`[AI SDR DISPATCH] Disparando resposta (${result.intent}) para ${cleanPhone}...`);
          whatsappQueue.enqueue({
            leadId: lead.id,
            phone: cleanPhone,
            text: result.reply,
            instanceName: instance || getDefaultInstance()
          });
        }
      }
    }

    if ((event === 'qrcode.updated' || event === 'QRCODE_UPDATED') && data?.qrcode && io) {
      io.emit('whatsapp:qrcode', data.qrcode);
    }
    if ((event === 'connection.update' || event === 'CONNECTION_UPDATE') && io) {
      io.emit('whatsapp:connection', data);
    }

    return res.json({ received: true });
  });

  // Ingestão de leads de anúncio. A checagem de segredo foi aplicada no
  // middleware acima (POST /leads/webhook).
  // Meta Verification & Ads Ingestion
  router.get('/leads/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const settings = db.getSettings();

    if (mode === 'subscribe' && token && settings.webhookToken && token === settings.webhookToken) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send(challenge || 'Webhook active');
  });

  router.post('/leads/webhook', async (req, res) => {
    try {
      const payload = req.body || {};
      const rawName = payload.name || payload.full_name || payload.nome || payload.first_name || 'Lead Anúncio';
      const rawPhone = payload.phone || payload.whatsapp || payload.telefone || payload.phone_number || '';
      const rawEmail = payload.email || payload.mail || '';
      const campaignName = payload.campaign_name || payload.campanha || payload.ad_name || payload.utm_campaign || 'Meta Ads - Conversão';
      const utmSource = payload.utm_source || payload.source || 'meta_ads';
      const utmMedium = payload.utm_medium || 'cpc';
      const dealValue = Number(payload.value || payload.valor || 30.00);

      const cleanPhone = String(rawPhone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) {
        return res.status(400).json({ success: false, message: 'Telefone inválido.' });
      }

      const { lead, created } = db.createLead({
        name: rawName,
        phone: cleanPhone,
        email: rawEmail,
        stage: 'novo',
        value: dealValue,
        tags: [utmSource === 'meta_ads' ? 'Meta Ads' : utmSource.toUpperCase(), 'Novo Lead'],
        campaign: campaignName,
        utm_source: utmSource,
        utm_campaign: campaignName,
        utm_medium: utmMedium,
        notes: `Lead capturado em ${new Date().toLocaleString('pt-BR')}.`,
        lastMessage: `Lead cadastrado via ${campaignName}`
      });

      if (io) {
        io.emit('leads:new', { lead, isNew: created });
        io.emit('leads:update', db.getLeads());
      }

      return res.json({ success: true, message: 'Lead processado com sucesso!', leadId: lead.id, lead });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ---------------- Leads & CRM CRUD ----------------
  router.get('/leads', (req, res) => res.json(db.getLeads()));
  router.get('/leads/:id', (req, res) => {
    const lead = db.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(lead);
  });
  router.post('/leads', (req, res) => {
    const { lead } = db.createLead(req.body);
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(lead);
  });
  router.put('/leads/:id', (req, res) => {
    const updated = db.updateLead(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Lead não encontrado' });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(updated);
  });
  router.delete('/leads/:id', (req, res) => {
    const success = db.deleteLead(req.params.id);
    if (io) io.emit('leads:update', db.getLeads());
    return res.json({ success });
  });

  router.patch('/leads/:id/toggle-bot', (req, res) => {
    const lead = db.getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const updated = db.updateLead(req.params.id, { botPaused: !lead.botPaused });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(updated);
  });

  router.get('/messages/:leadId', (req, res) => {
    const messages = db.getMessages(req.params.leadId);
    db.updateLead(req.params.leadId, { unreadCount: 0 });
    if (io) io.emit('leads:update', db.getLeads());
    return res.json(messages);
  });

  router.get('/stages', (req, res) => res.json(db.getStages()));
  router.get('/automations', (req, res) => res.json(db.getAutomations()));
  router.post('/automations', (req, res) => {
    const auto = db.saveAutomation(req.body);
    return res.json(auto);
  });
  router.patch('/automations/:id/toggle', (req, res) => {
    const auto = db.toggleAutomation(req.params.id);
    return res.json(auto);
  });

  router.get('/analytics', (req, res) => res.json(db.getAnalytics()));
  // Mascarado: a tela de configuracao precisa mostrar os campos, mas devolver
  // a chave da API e a senha em texto puro pra quem so esta logado ainda
  // transformava um vazamento de sessao em vazamento de credencial.
  const MASK = '********';
  function safeSettings() {
    const s = db.getSettings() || {};
    return {
      ...s,
      globalApiKey: s.globalApiKey ? MASK : '',
      webhookToken: s.webhookToken ? MASK : '',
      adminPassword: ''
    };
  }
  router.get('/settings', (req, res) => res.json(safeSettings()));
  router.put('/settings', (req, res) => {
    const body = { ...(req.body || {}) };
    // campo mascarado no PUT = "nao mudou", senao a tela gravaria o asterisco
    for (const k of ['globalApiKey', 'webhookToken', 'adminPassword']) {
      if (body[k] === MASK) delete body[k];
    }
    const updated = db.updateSettings(body);
    return res.json(safeSettings.call(null, updated));
  });

  router.get('/leads/export', (req, res) => {
    const leads = db.getLeads();
    let csv = 'ID,Nome,WhatsApp,Email,Etapa,Valor,Campanha,UTM_Source,Criado_Em\n';
    leads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.phone}","${l.email}","${l.stage}","${l.value}","${l.campaign}","${l.utm_source}","${l.createdAt}"\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment(`leads-export-${Date.now()}.csv`);
    return res.send(csv);
  });

  
  // ---------------- Exportação de Leads (CSV & Lookalike Meta Ads) ----------------
  router.get('/leads/export/csv', (req, res) => {
    try {
      const leads = db.getLeads();
      let csv = '\uFEFFNome,Telefone,Email,Etapa,Valor,Campanha,UTM_Source,UTM_Campaign,Data_Cadastro\n';
      leads.forEach(l => {
        const phone = l.phone ? `+${l.phone}` : '';
        const name = (l.name || '').replace(/,/g, ' ');
        const email = l.email || '';
        const stage = l.stage || '';
        const value = l.value || 0;
        const campaign = (l.campaign || '').replace(/,/g, ' ');
        const source = l.utm_source || '';
        const utmCamp = (l.utm_campaign || '').replace(/,/g, ' ');
        const date = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : '';
        csv += `"${name}","${phone}","${email}","${stage}",${value},"${campaign}","${source}","${utmCamp}","${date}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leads_truckauto_export.csv"');
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao exportar leads.' });
    }
  });

  router.get('/leads/export/lookalike', (req, res) => {
    try {
      const leads = db.getLeads();
      // Formato otimizado para o Gerenciador de Anúncios do Facebook (Lookalike)
      let csv = 'phone,fn,email,value\n';
      leads.forEach(l => {
        if (l.phone) {
          const cleanPhone = l.phone.replace(/\D/g, '');
          const firstName = (l.name || '').split(' ')[0] || '';
          csv += `55${cleanPhone},${firstName},${l.email || ''},${l.value || 0}\n`;
        }
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="meta_lookalike_audiences.csv"');
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao exportar público Lookalike.' });
    }
  });

  return router;
};
