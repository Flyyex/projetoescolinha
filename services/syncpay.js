// Integracao SyncPay - CashIn Pix (recebimento) + Webhook
// Docs: https://syncpay.apidog.io/llms.txt
// Base: https://api.syncpayments.com.br

const SYNCPAY_CLIENT_ID = process.env.SYNCPAY_CLIENT_ID || '';
const SYNCPAY_CLIENT_SECRET = process.env.SYNCPAY_CLIENT_SECRET || '';
const SYNCPAY_WEBHOOK_TOKEN = process.env.SYNCPAY_WEBHOOK_TOKEN || '';
const SYNCPAY_BASE_URL = process.env.SYNCPAY_BASE_URL || 'https://api.syncpayments.com.br';

function isSyncPayEnabled() {
  return SYNCPAY_CLIENT_ID.length > 5 && SYNCPAY_CLIENT_SECRET.length > 5;
}

let cachedToken = null;
let cachedTokenExp = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExp - 60000) return cachedToken;
  const res = await fetch(SYNCPAY_BASE_URL + '/api/partner/v1/auth-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: SYNCPAY_CLIENT_ID, client_secret: SYNCPAY_CLIENT_SECRET })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error('SyncPay auth: ' + (data.message || ('HTTP ' + res.status)));
  }
  cachedToken = data.access_token;
  const expMs = data.expires_at ? (new Date(data.expires_at).getTime() - Date.now()) : ((data.expires_in || 3600) * 1000);
  cachedTokenExp = Date.now() + Math.max(60000, expMs);
  return cachedToken;
}

async function syncPayRequest(method, path, body) {
  const token = await getToken();
  const res = await fetch(SYNCPAY_BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || ('HTTP ' + res.status);
    throw new Error('SyncPay ' + method + ' ' + path + ': ' + msg);
  }
  return data;
}

// Mapa identifier -> { userId, amount } (caminho rapido; fallback e por CPF)
const pendingCharges = new Map();

function rememberCharge(identifier, userId, amount) {
  if (identifier) pendingCharges.set(String(identifier), { userId: String(userId), amount: parseFloat(amount) });
}

function lookupCharge(identifier) {
  return pendingCharges.get(String(identifier)) || null;
}

function forgetCharge(identifier) {
  pendingCharges.delete(String(identifier));
}

// Gera cobranca Pix e devolve QR copia-e-cola no formato do app
async function createPixCharge({ amount, customerName, customerPhone, customerEmail, customerCpfCnpj, referenceId, webhookUrl }) {
  try {
    if (!isSyncPayEnabled()) throw new Error('SYNCPAY_CLIENT_ID/SECRET nao configurados.');
    const value = parseFloat(amount);
    if (!value || value <= 0) throw new Error('Valor invalido.');
    const cpf = String(customerCpfCnpj || '').replace(/\D/g, '');
    if (cpf.length !== 11) throw new Error('SyncPay exige CPF (11 digitos) do pagador.');
    let phone = String(customerPhone || '').replace(/\D/g, '');
    if (phone.length > 11 && phone.startsWith('55')) phone = phone.substring(2);
    if (!(phone.length === 10 || phone.length === 11)) throw new Error('Telefone invalido para SyncPay.');
    const email = String(customerEmail || '').trim();
    if (!email || email.indexOf('@') < 0) throw new Error('E-mail invalido para SyncPay.');
    const data = await syncPayRequest('POST', '/api/partner/v1/cash-in', {
      amount: value,
      description: 'Recarga TruckAuto ' + (referenceId || ''),
      webhook_url: webhookUrl || undefined,
      client: {
        name: customerName || 'Operador TruckAuto',
        cpf,
        email,
        phone
      }
    });
    if (!data.pix_code || !data.identifier) throw new Error('Resposta inesperada da SyncPay.');
    rememberCharge(data.identifier, referenceId, value);
    return {
      success: true,
      provider: 'syncpay',
      txId: data.identifier,
      amount: value,
      pixCopyPaste: data.pix_code,
      qrImage: null,
      expiresInSeconds: null
    };
  } catch (err) {
    console.error('[SYNCPAY] createPixCharge:', err.message);
    return { success: false, error: err.message };
  }
}

function isCashinCompleted(body) {
  const status = String((body && body.status) || '').toLowerCase();
  return status === 'completed' || status === 'paid' || status === 'approved';
}

module.exports = {
  isSyncPayEnabled,
  createPixCharge,
  lookupCharge,
  forgetCharge,
  isCashinCompleted,
  SYNCPAY_WEBHOOK_TOKEN,
  SYNCPAY_BASE_URL
};
