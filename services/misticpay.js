// Integracao MisticPay - CashIn Pix (recebimento) + CashOut Pix (saques) + Webhook
// Docs: https://docs.misticpay.com/
// Base: https://api.misticpay.com/api
// Auth: Chave de acesso pk_/sk_ via HTTP Basic (ci/cs legado morre em 30/09/2026)

const MISTIC_PK = String(process.env.MISTIC_PK || '').trim();
const MISTIC_SK = String(process.env.MISTIC_SK || '').trim();
const MISTIC_BASE_URL = process.env.MISTIC_BASE_URL || 'https://api.misticpay.com/api';

function isMisticEnabled() {
  return MISTIC_PK.length > 5 && MISTIC_SK.length > 5;
}

function misticHeaders() {
  const basic = Buffer.from(`${MISTIC_PK}:${MISTIC_SK}`).toString('base64');
  return { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Basic ' + basic };
}

// Último erro (sem segredos) para diagnóstico no painel admin
let lastError = null;
function noteError(where, err) {
  lastError = { where, message: String((err && err.message) || err || 'erro').slice(0, 200), at: new Date().toISOString() };
}
function getMisticStatus() {
  return { enabled: isMisticEnabled(), lastError };
}

// Sem timeout a requisicao trava eternamente quando o gateway enrola, e o
// saque fica preso em "processing" sem ninguem pra destravar. 30s padrao.
const MISTIC_TIMEOUT_MS = Math.max(1000, parseInt(process.env.MISTIC_TIMEOUT_MS || '30000', 10) || 30000);

async function misticRequest(method, path, body) {
  let res;
  try {
    res = await fetch(MISTIC_BASE_URL + path, {
      method,
      headers: misticHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(MISTIC_TIMEOUT_MS)
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new Error('MisticPay ' + method + ' ' + path + ': ' + (timedOut ? 'tempo esgotado (' + MISTIC_TIMEOUT_MS + 'ms)' : (err.message || 'falha de rede')));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || ('HTTP ' + res.status);
    throw new Error('MisticPay ' + method + ' ' + path + ': ' + msg);
  }
  return data;
}

// Gera cobranca Pix e devolve QR copia-e-cola no formato do app
async function createPixCharge({ amount, customerName, customerPhone, customerCpfCnpj, referenceId, webhookUrl }) {
  try {
    if (!isMisticEnabled()) throw new Error('MISTIC_PK/SK nao configurados.');
    const value = parseFloat(amount);
    if (!value || value <= 0) throw new Error('Valor invalido.');
    // Mistic exige CPF do pagador (11 digitos). CNPJ cai para o proximo gateway da fila.
    const doc = String(customerCpfCnpj || '').replace(/\D/g, '');
    if (doc.length !== 11) throw new Error('MisticPay exige CPF (11 digitos) do pagador.');
    const ourId = String(referenceId || ('truckauto-' + Date.now())) + '-' + Date.now();
    const data = await misticRequest('POST', '/transactions/create', {
      amount: value,
      payerName: String(customerName || 'Operador TruckAuto').slice(0, 80),
      payerDocument: doc,
      transactionId: ourId,
      description: ('Recarga TruckAuto ' + (referenceId || '')).slice(0, 140),
      projectWebhook: webhookUrl || undefined
    });
    const d = data.data || {};
    const theirId = String(d.transactionId || '');
    if (!d.copyPaste || !theirId) throw new Error('Resposta inesperada da MisticPay.');
    return {
      success: true,
      provider: 'misticpay',
      txId: theirId,
      ourTransactionId: ourId,
      amount: value,
      pixCopyPaste: d.copyPaste,
      qrImage: d.qrCodeBase64 || null,
      qrUrl: d.qrcodeUrl || null,
      expiresInSeconds: null
    };
  } catch (err) {
    console.error('[MISTIC] createPixCharge:', err.message);
    noteError('createPixCharge', err);
    return { success: false, error: err.message };
  }
}

// CPF válido pelo dígito verificador (evita mandar telefone como CPF)
function isValidCpf(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10], 10);
}

function looksLikePhone(cleanKey, digits) {
  const ddd = parseInt(digits.substring(0, 2), 10);
  if (!(ddd >= 11 && ddd <= 99)) return false;
  if (/^\+?\d{10,13}$/.test(cleanKey.replace(/[\s.\-()]/g, ''))) {
    if (digits.length === 11) return digits[2] === '9';
    return digits.length === 10;
  }
  return false;
}

const PIX_TYPES = ['CPF', 'TELEFONE', 'EMAIL', 'CHAVE_ALEATORIA'];
const DDD_VALIDOS = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Valida a chave contra o tipo escolhido. Retorna { ok, type, normalized, error }.
// Sem chosenType, detecta o tipo (so aceita se for inequivoco e valido).
function validatePixKey(pixKey, chosenType) {
  const raw = String(pixKey || '').trim();
  if (!raw) return { ok: false, error: 'Informe a chave Pix.' };
  const digits = raw.replace(/\D/g, '');

  if (chosenType === 'EMAIL') {
    if (raw.indexOf('@') < 0) return { ok: false, error: 'E-mail invalido. Use o formato nome@dominio.com' };
    const at = raw.indexOf('@');
    const domain = raw.slice(at + 1);
    if (domain.indexOf('.') < 0 || /\s/.test(raw) || raw.indexOf('@', at + 1) >= 0) {
      return { ok: false, error: 'E-mail invalido. Use o formato nome@dominio.com' };
    }
    return { ok: true, type: 'EMAIL', normalized: raw.toLowerCase() };
  }

  if (chosenType === 'CHAVE_ALEATORIA') {
    if (!UUID_RE.test(raw)) return { ok: false, error: 'Chave aleatoria invalida. Sao 36 caracteres no formato 12345678-1234-1234-1234-123456789012' };
    return { ok: true, type: 'CHAVE_ALEATORIA', normalized: raw.toLowerCase() };
  }

  if (chosenType === 'CPF') {
    if (!/^\d{11}$/.test(digits)) return { ok: false, error: 'CPF deve ter 11 digitos.' };
    if (!isValidCpf(digits)) return { ok: false, error: 'CPF invalido (digitos verificadores nao conferem). Confira e digite novamente.' };
    return { ok: true, type: 'CPF', normalized: digits };
  }

  if (chosenType === 'TELEFONE') {
    if (!/^\d{11}$/.test(digits)) return { ok: false, error: 'Celular deve ter DDD + 9 digitos (11 digitos no total).' };
    const ddd = digits.slice(0, 2), num = digits.slice(2);
    if (DDD_VALIDOS.indexOf(ddd) < 0) return { ok: false, error: 'DDD ' + ddd + ' nao existe no Brasil.' };
    if (num[0] !== '9') return { ok: false, error: 'Celular invalido: depois do DDD o numero precisa comecar com 9.' };
    return { ok: true, type: 'TELEFONE', normalized: digits };
  }

  // Sem tipo escolhido: detecta. NUNCA adivinha "CPF" por fallback (isso travava
  // dinheiro na gateway com chave inexistente).
  if (UUID_RE.test(raw)) return { ok: true, type: 'CHAVE_ALEATORIA', normalized: raw.toLowerCase() };
  if (raw.indexOf('@') >= 0) return validatePixKey(raw, 'EMAIL');
  if (digits.length === 11) {
    if (isValidCpf(digits)) return { ok: true, type: 'CPF', normalized: digits };
    if (DDD_VALIDOS.indexOf(digits.slice(0, 2)) >= 0 && digits[2] === '9') return { ok: true, type: 'TELEFONE', normalized: digits };
    return { ok: false, error: 'Chave Pix invalida. Nao parece CPF valido nem celular com DDD. Escolha o tipo da chave e digite novamente.' };
  }
  return { ok: false, error: 'Chave Pix invalida. Escolha o tipo (CPF, Celular, E-mail ou Chave aleatoria).' };
}

// Mapeia para os tipos da Mistic (so pra uso interno/legado)
function mapPixKeyType(pixKey) {
  const v = validatePixKey(pixKey);
  return v.ok ? v.type : null;
}

// Envia Pix (saques automaticos)
async function sendPixTransfer({ amount, pixKey, description, pixKeyTypeHint }) {
  try {
    if (!isMisticEnabled()) throw new Error('MISTIC_PK/SK nao configurados.');
    const value = Math.round(parseFloat(amount) * 100) / 100;
    if (!value || value <= 0) throw new Error('Valor invalido.');
    // Valida de novo na hora de pagar (defesa em profundidade: a chave pode ter
    // sido salva antes desta validacao existir)
    const check = validatePixKey(pixKey, pixKeyTypeHint);
    if (!check.ok) throw new Error('Chave Pix invalida: ' + check.error);
    const pixKeyType = check.type;
    const keyToSend = check.normalized;
    const data = await misticRequest('POST', '/transactions/withdraw', {
      amount: value,
      pixKey: keyToSend,
      pixKeyType,
      description: String(description || 'Saque TruckAuto').slice(0, 140)
    });
    const d = data.data || {};
    // Sem id na resposta NAO e falha: o Pix ja saiu. Devolve null (nao '')
    // para o caller nunca confundir "sem id" com "falhou".
    const tid = String(d.transactionId || d.jobId || d.id || '');
    return { success: true, transferId: tid || null, status: d.status || 'QUEUED' };
  } catch (err) {
    console.error('[MISTIC] sendPixTransfer:', err.message);
    noteError('sendPixTransfer', err);
    return { success: false, error: err.message };
  }
}

// Consulta o estado real de uma transação (saque OU depósito) na MisticPay.
// Usado pelo botão "Ver na Mistic" no admin. Somente leitura.
async function checkTransaction(theirId) {
  try {
    if (!isMisticEnabled()) return { success: false, error: 'MISTIC_PK/SK nao configurados.' };
    const data = await misticRequest('POST', '/transactions/check', { transactionId: String(theirId) });
    const t = data.transaction || data.data || {};
    if (!t || (!t.transactionState && !t.transactionType)) {
      return { success: false, error: 'A MisticPay nao encontrou essa transacao (' + theirId + ').' };
    }
    return {
      success: true,
      state: String(t.transactionState || '').toUpperCase() || 'DESCONHECIDO',
      type: String(t.transactionType || '').toUpperCase() || '-',
      value: parseFloat(t.value || 0),
      fee: parseFloat(t.fee || 0),
      e2e: t.endToEndId || null,
      bank: t.bankName || null,
      createdAt: t.createdAt || null,
      updatedAt: t.updatedAt || null
    };
  } catch (err) {
    noteError('checkTransaction', err);
    return { success: false, error: err.message };
  }
}

// Confere server-side se a transacao foi paga (usado na verificacao do webhook)
async function checkTransactionPaid(theirId) {
  const data = await misticRequest('POST', '/transactions/check', { transactionId: String(theirId) });
  const t = data.transaction || data.data || {};
  const state = String(t.transactionState || '').toUpperCase();
  const type = String(t.transactionType || '').toUpperCase();
  return {
    confirmed: (state === 'COMPLETO' || state === 'COMPLETA' || state === 'PAID' || state === 'APPROVED') && (type === '' || type === 'DEPOSITO'),
    value: parseFloat(t.value || 0),
    state
  };
}

// Webhook da Mistic nao tem assinatura: vale o que a API confirma (checkTransactionPaid)
function isDepositEvent(body) {
  const type = String((body && body.transactionType) || '').toUpperCase();
  const status = String((body && body.status) || '').toUpperCase();
  return type === 'DEPOSITO' && (status === 'COMPLETO' || status === 'COMPLETA' || status === 'PAID' || status === 'APPROVED');
}

module.exports = {
  isMisticEnabled,
  getMisticStatus,
  createPixCharge,
  sendPixTransfer,
  checkTransaction,
  checkTransactionPaid,
  isDepositEvent,
    mapPixKeyType,
  validatePixKey,
  PIX_TYPES,
  MISTIC_BASE_URL
};
