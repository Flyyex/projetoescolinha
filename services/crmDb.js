const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_FILE = path.join(__dirname, '..', 'crm_data.json');

const INITIAL_DATA = {
  settings: {
    evolutionApiUrl: '',
    globalApiKey: '',
    defaultInstance: 'principal',
    aiEnabled: false,
    aiModel: 'gpt-4o-mini',
    autoReplyNewLeads: false,
    welcomeMessageTemplate: 'Olá {{primeiro_nome}}! Seja muito bem-vindo 🚕.\n\nComo posso te ajudar hoje?',
    webhookToken: '',
    adminPassword: ''
  },
  stages: [
    { id: 'novo', title: 'Novos Leads (Anúncios)', color: '#38bdf8', order: 1 },
    { id: 'contato', title: 'Primeiro Contato / Simulação', color: '#818cf8', order: 2 },
    { id: 'qualificado', title: 'Interesse em Cota / Frota', color: '#c084fc', order: 3 },
    { id: 'proposta', title: 'Pix Gerado / Aguardando', color: '#fbbf24', order: 4 },
    { id: 'ganho', title: 'Operador Ativo (Cota Adquirida)', color: '#34d399', order: 5 },
    { id: 'perdido', title: 'Desqualificado / Sem Contato', color: '#f87171', order: 6 }
  ],
  products: [
    { id: 'NX-030', name: 'TruckAuto Pulse', price: 30.00, dailyReturn: 3.80, periodDays: 15 },
    { id: 'NX-101', name: 'TruckAuto Zephyr', price: 150.00, dailyReturn: 11.20, periodDays: 30 },
    { id: 'NX-202', name: 'TruckAuto Dash', price: 350.00, dailyReturn: 30.00, periodDays: 30 },
    { id: 'NX-707', name: 'TruckAuto Swift', price: 600.00, dailyReturn: 68.00, periodDays: 40 },
    { id: 'NX-404', name: 'TruckAuto Falcon', price: 900.00, dailyReturn: 75.00, periodDays: 45 },
    { id: 'NX-303', name: 'TruckAuto Stratus', price: 1500.00, dailyReturn: 150.00, periodDays: 45 },
    { id: 'NX-505', name: 'TruckAuto Titan', price: 2800.00, dailyReturn: 150.00, periodDays: 60 },
    { id: 'NX-606', name: 'TruckAuto Apex', price: 5000.00, dailyReturn: 250.00, periodDays: 60 },
    { id: 'CH-050', name: 'Estacao Solar Urbana 50kW', price: 50.00, dailyReturn: 4.50, periodDays: 15 },
    { id: 'CH-200', name: 'Supercharger Hub 250kW', price: 200.00, dailyReturn: 19.00, periodDays: 30 },
    { id: 'CH-500', name: 'Estacao de Troca de Bateria Automatica', price: 500.00, dailyReturn: 52.00, periodDays: 30 },
    { id: 'CH-1200', name: 'Hub Grid Central Metropolitano', price: 1200.00, dailyReturn: 140.00, periodDays: 45 }
  ],
  leads: [],
  messages: {},
  automations: [],
  campaigns: []
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
      return INITIAL_DATA;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Erro ao ler DB:', err);
    return INITIAL_DATA;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao escrever DB:', err);
  }
}

const db = {
  getSettings: () => readDb().settings,
  updateSettings: (newSettings) => {
    const data = readDb();
    data.settings = { ...data.settings, ...newSettings };
    writeDb(data);
    return data.settings;
  },

  getStages: () => readDb().stages,
  getProducts: () => readDb().products || [],

  getLeads: () => {
    const data = readDb();
    return data.leads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  getLead: (id) => {
    const data = readDb();
    return data.leads.find(l => l.id === id || l.phone === id);
  },

  createLead: (leadData) => {
    const data = readDb();
    const cleanPhone = String(leadData.phone || '').replace(/\D/g, '');
    if (!cleanPhone) return { lead: null, created: false };

    const existing = data.leads.find(l => l.phone === cleanPhone);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      if (leadData.name && leadData.name !== 'Operador #Lead') existing.name = leadData.name;
      if (leadData.email) existing.email = leadData.email;
      if (leadData.campaign) existing.campaign = leadData.campaign;
      if (leadData.value) existing.value = Math.max(Number(existing.value || 0), Number(leadData.value));
      if (leadData.stage) {
        // Se já está ganho, não rebaixa para novo
        if (existing.stage !== 'ganho' || leadData.stage === 'ganho') {
          existing.stage = leadData.stage;
        }
      }
      if (leadData.utm_source) existing.utm_source = leadData.utm_source;
      if (leadData.utm_campaign) existing.utm_campaign = leadData.utm_campaign;
      if (leadData.utm_content) existing.utm_content = leadData.utm_content;
      if (leadData.utm_term) existing.utm_term = leadData.utm_term;
      if (leadData.fbclid) existing.fbclid = leadData.fbclid;
      if (leadData.ttp) existing.ttp = leadData.ttp;
      if (leadData.tags) {
        existing.tags = Array.from(new Set([...(existing.tags || []), ...leadData.tags]));
      }
      if (leadData.notes) {
        existing.notes = (existing.notes ? existing.notes + ' | ' : '') + leadData.notes;
      }
      writeDb(data);
      return { lead: existing, created: false };
    }

const newLeadValue = Number(leadData.value);
const newLead = {
id: 'lead-' + uuidv4().substring(0, 8),
name: leadData.name || 'Operador #Lead',
phone: cleanPhone,
email: leadData.email || '',
stage: leadData.stage || 'novo',
value: isNaN(newLeadValue) ? 350.00 : newLeadValue,
      tags: leadData.tags || ['Meta Ads', 'TRUCKAUTO'],
      campaign: leadData.campaign || 'Meta Ads - Frotas Autônomas',
      utm_source: leadData.utm_source || 'direto',
      utm_campaign: leadData.utm_campaign || '',
      utm_medium: leadData.utm_medium || '',
      utm_content: leadData.utm_content || '',
      utm_term: leadData.utm_term || '',
      // id do clique no anuncio do Meta: o que amarra a conversao ao anuncio
      fbclid: leadData.fbclid || '',
      // id do clique do TikTok: o que amarra a conversao ao anuncio do TikTok
      ttp: leadData.ttp || '',
      notes: leadData.notes || 'Lead capturado automaticamente via anúncio TRUCKAUTO.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
      lastMessage: leadData.lastMessage || 'Novo lead TRUCKAUTO cadastrado.'
    };

    data.leads.unshift(newLead);
    writeDb(data);
    return { lead: newLead, created: true };
  },

updateLead: (id, updates) => {
const data = readDb();
const lead = data.leads.find(l => l.id === id || l.phone === id);
if (!lead) return null;
Object.assign(lead, updates, { updatedAt: new Date().toISOString() });
writeDb(data);
return lead;
},
// Move (ou cria) lead pelo telefone - usado pelas automacoes de Pix
moveLeadByPhone: (phone, stage, note, value) => {
try {
const data = readDb();
const digits = String(phone || '').replace(/\D/g, '');
if (!digits) return null;
const variants = [digits];
if (digits.startsWith('55') && digits.length > 10) variants.push(digits.substring(2));
if (!digits.startsWith('55')) variants.push('55' + digits);
let lead = data.leads.find(l => variants.includes(String(l.phone || '').replace(/\D/g, '')));
if (lead) {
lead.stage = stage;
if (value > 0) lead.value = Number(value);
if (note) lead.notes = (lead.notes ? lead.notes + ' | ' : '') + note;
lead.updatedAt = new Date().toISOString();
writeDb(data);
} else {
const { lead: created } = db.createLead({
name: 'Operador App',
phone: digits,
stage,
value: Number(value) || 0,
tags: ['App', 'Automatico'],
notes: note || ''
});
lead = created;
}
return lead;
} catch (e) {
console.error('[CRM AUTO-MOVE ERROR]:', e.message);
return null;
}
},

  deleteLead: (id) => {
    const data = readDb();
    const idx = data.leads.findIndex(l => l.id === id);
    if (idx === -1) return false;
    data.leads.splice(idx, 1);
    delete data.messages[id];
    writeDb(data);
    return true;
  },

  getMessages: (leadId) => {
    const data = readDb();
    const lead = data.leads.find(l => l.id === leadId || l.phone === leadId);
    if (lead) {
      const msgs = data.messages[lead.id] || data.messages[lead.phone] || [];
      return msgs;
    }
    return data.messages[leadId] || [];
  },

  addMessage: (leadId, msg) => {
    const data = readDb();
    if (!data.messages[leadId]) {
      data.messages[leadId] = [];
    }
    const newMsg = {
      id: msg.id || 'msg-' + uuidv4().substring(0, 8),
      fromMe: Boolean(msg.fromMe),
      text: msg.text || '',
      mediaType: msg.mediaType || null,
      mediaUrl: msg.mediaUrl || null,
      timestamp: msg.timestamp || new Date().toISOString(),
      status: msg.status || 'sent'
    };
    data.messages[leadId].push(newMsg);

    const lead = data.leads.find(l => l.id === leadId);
    if (lead) {
      lead.lastMessage = msg.text || 'Mídia enviada';
      lead.updatedAt = newMsg.timestamp;
      if (!msg.fromMe) {
        lead.unreadCount = (lead.unreadCount || 0) + 1;
      }
    }

    writeDb(data);
    return newMsg;
  },

  getAutomations: () => readDb().automations || [],
  
  saveAutomation: (auto) => {
    const data = readDb();
    if (!data.automations) data.automations = [];
    if (auto.id) {
      const idx = data.automations.findIndex(a => a.id === auto.id);
      if (idx !== -1) {
        data.automations[idx] = { ...data.automations[idx], ...auto };
        writeDb(data);
        return data.automations[idx];
      }
    }
    const newAuto = { id: 'auto-' + uuidv4().substring(0, 8), enabled: true, ...auto };
    data.automations.push(newAuto);
    writeDb(data);
    return newAuto;
  },

  toggleAutomation: (id) => {
    const data = readDb();
    const auto = (data.automations || []).find(a => a.id === id);
    if (auto) {
      auto.enabled = !auto.enabled;
      writeDb(data);
      return auto;
    }
    return null;
  },

  getAnalytics: () => {
    const data = readDb();
    const leads = data.leads || [];
    const totalLeads = leads.length;
    const wonLeads = leads.filter(l => l.stage === 'ganho');
    const totalWonValue = wonLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    const pipelineValue = leads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
    const conversionRate = totalLeads > 0 ? ((wonLeads.length / totalLeads) * 100).toFixed(1) : '0';

    const sourceMap = {};
    leads.forEach(l => {
      // "Meta Ads" aqui significava "ninguem informou a origem" — enganava.
      const tagAntigo = (l.tags && l.tags[0]) || '';
      const src = (tagAntigo && tagAntigo !== 'Meta Ads' && tagAntigo !== 'META_ADS')
        ? tagAntigo
        : (l.utm_source && l.utm_source !== 'meta_ads' ? l.utm_source : 'Direto');
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const leadsBySource = Object.keys(sourceMap).map(name => ({
      name,
      value: sourceMap[name]
    }));

    return {
      totalLeads,
      wonCount: wonLeads.length,
      totalWonValue,
      pipelineValue,
      conversionRate: Number(conversionRate),
      leadsBySource,
      campaigns: data.campaigns || []
    };
  }
};

module.exports = db;
