// Backup automatico: CSV de usuarios + contratos enviado ao Telegram do admin.
// Requer: TELEGRAM_BOT_TOKEN e (ADMIN_TELEGRAM_CHAT_ID ou TELEGRAM_CHAT_ID).
// Sem essas vars, o job apenas registra no log (sem quebrar nada).

const cron = require('node-cron');

function csvCell(v) {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

async function buildBackupCSV() {
  const { getAllUsers, getContractsByUserId, getAllTransactions } = require('../database');
  const users = await getAllUsers();
  const uLines = ['id;nome;telefone;saldo;total_depositado;total_sacado;contratos_ativos;cadastro'];
  for (const u of users) {
    let active = 0;
    try {
      const contracts = await getContractsByUserId(u.id);
      active = contracts.filter(c => c.status === 'Em corrida').length;
    } catch (e) { active = ''; }
    uLines.push([
      csvCell(u.id),
      csvCell(u.operatorName || ''),
      csvCell(u.phone || ''),
      parseFloat(u.balance || 0).toFixed(2),
      parseFloat(u.totalDeposited || 0).toFixed(2),
      parseFloat(u.totalWithdrawn || 0).toFixed(2),
      active,
      csvCell(u.createdAt || '')
    ].join(';'));
  }
  const cLines = ['contrato;usuario;produto;produto_id;dias_restantes;status;inicio'];
  for (const u of users) {
    try {
      const { getContractsByUserId: getC } = require('../database');
      const contracts = await getC(u.id);
      for (const c of contracts) {
        cLines.push([
          csvCell(c.id), csvCell(u.id), csvCell(c.productName || ''),
          csvCell(c.productId || ''), (c.daysRemaining ?? ''), csvCell(c.status || ''),
          csvCell(c.startDate || c.created_at || '')
        ].join(';'));
      }
    } catch (e) { /* ignora */ }
  }
  let txCount = 0;
  try {
    const { getAllTransactions } = require('./database');
    const txs = await getAllTransactions();
    txCount = Array.isArray(txs) ? txs.length : 0;
  } catch (e) { /* ignora */ }
  let leadLines = ['nome;telefone;etapa;valor'];
  try {
    const crmDb = require('./crmDb');
    const leads = crmDb.getLeads ? crmDb.getLeads() : [];
    for (const l of leads) {
      leadLines.push([csvCell(l.name || ''), csvCell(l.phone || ''), csvCell(l.stage || ''), (l.value ?? '')].join(';'));
    }
  } catch (e) { /* ignora */ }
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `truckauto_backup_${stamp}.csv`,
    content: '\uFEFF' + uLines.join('\r\n') + '\r\n\r\nCONTRATOS\r\n' + cLines.join('\r\n') + '\r\n\r\nLEADS\r\n' + leadLines.join('\r\n') + '\r\n',
    userCount: users.length,
    txCount
  };
}

async function sendBackupViaTelegram({ filename, content, userCount, txCount }) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
  if (!token || !chatId) {
    console.log('[BACKUP] Telegram nao configurado (TELEGRAM_BOT_TOKEN/ADMIN_TELEGRAM_CHAT_ID). Backup gerado localmente apenas.');
    return { sent: false, reason: 'telegram-nao-configurado', userCount, txCount };
  }
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `Backup TruckAuto ${new Date().toLocaleString('pt-BR')} — ${userCount} usuarios, ${txCount} transacoes.`);
  form.append('document', new Blob([content], { type: 'text/csv' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error('Telegram: ' + (data.description || ('HTTP ' + res.status)));
  }
  return { sent: true, userCount, txCount };
}

async function runBackup() {
  const pack = await buildBackupCSV();
  try {
    const r = await sendBackupViaTelegram(pack);
    console.log('[BACKUP] concluido:', JSON.stringify(r));
    return { ok: true, ...r, filename: pack.filename };
  } catch (err) {
    console.error('[BACKUP ERROR]:', err.message);
    return { ok: false, error: err.message, userCount: pack.userCount, filename: pack.filename };
  }
}

let scheduled = false;
function scheduleBackup() {
  if (scheduled) return;
  scheduled = true;
  // Todo dia as 04:00 (horario do servidor)
  cron.schedule('0 4 * * *', () => {
    runBackup().catch(e => console.error('[BACKUP SCHED ERROR]:', e.message));
  });
  console.log('[BACKUP] agendado: todo dia as 04:00.');
}

module.exports = { buildBackupCSV, sendBackupViaTelegram, runBackup, scheduleBackup };
