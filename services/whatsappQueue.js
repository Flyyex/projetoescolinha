const axios = require('axios');
const crmDb = require('./crmDb');

class WhatsAppQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue({ leadId, phone, text, instanceName }) {
    this.queue.push({
      leadId,
      phone,
      text,
      instanceName,
      enqueuedAt: Date.now()
    });
    console.log(`[WHATSAPP QUEUE] Mensagem enfileirada para ${phone}. Total na fila: ${this.queue.length}`);
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        await this.sendMessageWithEvo(item);
      } catch (err) {
        console.error(`[WHATSAPP QUEUE ERROR] Falha ao enviar para ${item.phone}:`, err.response?.data || err.message);
      }

      // Delay humanizado aleatório entre 2 e 4 segundos para proteção anti-ban
      if (this.queue.length > 0) {
        const randomDelay = Math.floor(Math.random() * 2000) + 2000;
        console.log(`[WHATSAPP QUEUE] Aguardando ${randomDelay}ms (Anti-Ban)...`);
        await new Promise(res => setTimeout(res, randomDelay));
      }
    }

    this.isProcessing = false;
  }

  async sendMessageWithEvo({ leadId, phone, text, instanceName }) {
    const settings = crmDb.getSettings();
    const baseURL = process.env.EVOLUTION_API_URL || settings.evolutionApiUrl || '';
    const apiKey = settings.globalApiKey || process.env.GLOBAL_API_KEY || '';
    const inst = instanceName || settings.defaultInstance || process.env.DEFAULT_INSTANCE || 'principal';

    if (!baseURL || !apiKey) {
      console.warn('[EVOLUTION OFF] Evolution API nao configurada. Mensagem nao enviada.', { phone });
      if (leadId) {
        crmDb.addMessage(leadId, {
          fromMe: true,
          text,
          timestamp: new Date().toISOString(),
          status: 'error'
        });
      }
      throw new Error('EVOLUTION nao configurada');
    }

    const cleanPhone = String(phone).replace(/\D/g, '');

    const client = axios.create({
      baseURL,
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      timeout: 12000
    });

    console.log(`[EVOLUTION V2 SEND] Enviando para ${cleanPhone} via ${baseURL}/message/sendText/${inst}...`);

    const response = await client.post(`/message/sendText/${inst}`, {
      number: cleanPhone,
      text: text,
      delay: 1200
    });

    console.log(`[EVOLUTION V2 SUCCESS] Enviado para ${cleanPhone}:`, response.data?.key?.id || 'OK');

    if (leadId) {
      crmDb.addMessage(leadId, {
        fromMe: true,
        text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      });
    }

    return response.data;
  }
}

const queueInstance = new WhatsAppQueue();
module.exports = queueInstance;
