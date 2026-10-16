const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sendSupportMessage, getSupportMessages, countUnreadSupport, markSupportRepliesRead, getOpenSupportThread, closeSupportThread, getLastClosedSupportThread } = require('../database');

// Anti-spam do aviso ao admin: 1 Telegram a cada 3 min por usuário
const lastSupportNotify = new Map();

// Não-lidas do admin para o usuário logado
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const unread = await countUnreadSupport(req.user.id);
    res.json({ unread });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar mensagens.' });
  }
});

// Marca respostas do admin como lidas
router.post('/read', authMiddleware, async (req, res) => {
  try {
    await markSupportRepliesRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar como lidas.' });
  }
});

// Historico da conversa do usuario logado (+ ticket atual)
router.get('/messages', authMiddleware, async (req, res) => {
  try {
    const [thread, list, lastClosed] = await Promise.all([
      getOpenSupportThread(req.user.id),
      getSupportMessages(req.user.id, 100),
      getLastClosedSupportThread(req.user.id)
    ]);
    res.json({ thread, messages: list, lastClosed });
  } catch (err) {
    console.error('[SUPPORT ERROR /messages]:', err.message);
    res.status(500).json({ error: 'Erro ao carregar mensagens.' });
  }
});

// Encerrar atendimento atual (reabrir começa outro ticket)
router.post('/close', authMiddleware, async (req, res) => {
  try {
    const closed = await closeSupportThread(req.user.id);
    if (!closed) return res.status(404).json({ error: 'Nenhum atendimento aberto.' });
    res.json({ ok: true, thread: closed });
  } catch (err) {
    console.error('[SUPPORT ERROR /close]:', err.message);
    res.status(500).json({ error: 'Erro ao encerrar atendimento.' });
  }
});

// Usuario envia mensagem ao suporte
router.post('/messages', authMiddleware, async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '');
    if (!text.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }
    const msg = await sendSupportMessage(req.user.id, 'user', text);
    // Avisa o admin no Telegram (com throttle anti-spam)
    try {
      const last = lastSupportNotify.get(req.user.id) || 0;
      if (Date.now() - last > 3 * 60 * 1000) {
        lastSupportNotify.set(req.user.id, Date.now());
        const { notifyAdminSupportMessage } = require('../services/telegramBot');
        notifyAdminSupportMessage({
          operatorName: req.user.operatorName,
          phone: req.user.phone,
          text
        }).catch(() => {});
      }
    } catch (e) {}
    res.status(201).json(msg);
  } catch (err) {
    console.error('[SUPPORT ERROR POST]:', err.message);
    res.status(400).json({ error: err.message || 'Erro ao enviar mensagem.' });
  }
});

module.exports = router;
