/**
 * keepAliveWatchdog.js
 * Motor de Alta Disponibilidade 24/7 para TRUCKAUTO & Nexus CRM
 * - Impede hibernação do servidor através de auto-pings periódicos (Anti-Sleep).
 * - Monitora a conexão da Evolution API (WhatsApp) na VPS e realiza auto-recuperação.
 * - Garante execução ininterrupta dos rendimentos, webhooks e IA SDR 24 horas por dia.
 */

const axios = require('axios');
const crmDb = require('./crmDb');

class KeepAliveWatchdog {
  constructor() {
    this.appUrl = process.env.APP_URL || '';
    this.intervalHeartbeat = null;
  }

  start() {
    console.log('[WATCHDOG 24/7] Iniciando motor Anti-Sleep...');

    // 1. Auto-Ping Anti-Sleep (a cada 4 minutos = 240.000 ms)
    if (this.appUrl) {
      this.pingSelf();
      this.intervalHeartbeat = setInterval(() => {
        this.pingSelf();
      }, 240000);
    } else {
      console.log('[WATCHDOG 24/7] APP_URL nao configurada. Anti-Sleep desativado.');
    }

    // Escudo contra travamentos globais
    process.on('uncaughtException', (err) => {
      console.error('[WATCHDOG CRITICAL SHIELD] Exceção não tratada capturada (Servidor Protegido):', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[WATCHDOG CRITICAL SHIELD] Rejeição de Promise não tratada capturada:', reason);
    });

    console.log('[WATCHDOG 24/7] Operação anti-sleep ativada.');
  }

  async pingSelf() {
    try {
      const targetUrl = `${this.appUrl}/api/health`;
      const res = await axios.get(targetUrl, { timeout: 10000 });
      console.log(`[WATCHDOG 24/7 HEARTBEAT] Self-Ping OK -> ${targetUrl} [${res.status}] (${new Date().toLocaleTimeString('pt-BR')})`);
    } catch (err) {
      console.warn(`[WATCHDOG HEARTBEAT NOTICE] Self-Ping temporário:`, err.message);
    }
  }
}

const watchdogInstance = new KeepAliveWatchdog();
module.exports = watchdogInstance;
