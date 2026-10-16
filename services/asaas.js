// Integracao Asaas - Cobranca Pix + Transferencia Pix + Webhook
// Docs: https://docs.asaas.com
// Sandbox: https://sandbox.asaas.com (ASAAS_ENV=sandbox)
// Producao: https://api.asaas.com (ASAAS_ENV=production)

const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_ENV = String(process.env.ASAAS_ENV || 'sandbox').toLowerCase();
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || (ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3');
const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

function isAsaasEnabled() {
  return ASAAS_API_KEY.length > 10;
}

async function asaasRequest(method, path, body) {
  const res = await fetch(ASAAS_BASE_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const firstErr = data && Array.isArray(data.errors) && data.errors[0];
    const msg = (firstErr && (firstErr.description || firstErr.code)) || ('HTTP ' + res.status);
    throw new Error('Asaas ' + method + ' ' + path + ': ' + msg);
  }
  return data;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function findOrCreateCustomer({ name, phone, email, cpfCnpj }) {
  const cleanDoc = String(cpfCnpj || '').replace(/\D/g, '');
  try {
    if (email) {
      const found = await asaasRequest('GET', '/customers?email=' + encodeURIComponent(email));
      if (found && Array.isArray(found.data) && found.data.length > 0) {
        const existing = found.data[0];
        if (cleanDoc && !existing.cpfCnpj) {
          try {
            return await asaasRequest('PUT', '/customers/' + existing.id, { cpfCnpj: cleanDoc });
          } catch (e) {
            console.error('[ASAAS] atualizar cpfCnpj falhou:', e.message);
          }
        }
        return existing;
      }
    }
  } catch (e) {
    console.error('[ASAAS] busca de cliente falhou, criando novo:', e.message);
  }
  const created = await asaasRequest('POST', '/customers', {
    name: name || 'Operador TruckAuto',
    email: email || undefined,
    mobilePhone: phone || undefined,
    cpfCnpj: cleanDoc || undefined
  });
  return created;
}

// Gera cobranca Pix e devolve QR copia-e-cola no mesmo formato do app
async function createPixCharge({ amount, customerName, customerPhone, customerEmail, customerCpfCnpj, referenceId }) {
  try {
    if (!isAsaasEnabled()) throw new Error('ASAAS_API_KEY nao configurada.');
    const value = parseFloat(amount);
    if (!value || value <= 0) throw new Error('Valor invalido.');
    const digits = String(customerPhone || '').replace(/\D/g, '');
    const mobilePhone = digits ? (digits.length <= 11 ? '55' + digits : digits) : undefined;
    const customer = await findOrCreateCustomer({ name: customerName, phone: mobilePhone, email: customerEmail, cpfCnpj: customerCpfCnpj });
    const payment = await asaasRequest('POST', '/payments', {
      customer: customer.id,
      billingType: 'PIX',
      value,
      dueDate: todayISO(),
      description: 'Recarga TruckAuto - ' + (customerName || referenceId || ''),
      externalReference: String(referenceId || '')
    });
    const qr = await asaasRequest('GET', '/payments/' + payment.id + '/pixQrCode');
    let expiresInSeconds = 3600;
    if (qr.expirationDate) {
      expiresInSeconds = Math.max(60, Math.floor((new Date(qr.expirationDate).getTime() - Date.now()) / 1000));
    }
    return {
      success: true,
      provider: 'asaas',
      txId: payment.id,
      amount: value,
      pixCopyPaste: qr.payload,
      qrImage: qr.encodedImage || null,
      expiresInSeconds
    };
  } catch (err) {
    console.error('[ASAAS] createPixCharge:', err.message);
    return { success: false, error: err.message };
  }
}

// Detecta o tipo da chave Pix (CPF, CNPJ, EMAIL, PHONE, EVP)
// 11 dígitos com checksum CPF inválido e cara de telefone vão como PHONE
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
function detectPixKeyType(key) {
  const k = String(key || '').trim();
  const digits = k.replace(/\D/g, '');
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(k)) return 'EVP';
  if (k.indexOf('@') >= 0) return 'EMAIL';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length === 11) {
    const ddd = parseInt(digits.substring(0, 2), 10);
    if (!isValidCpf(digits) && ddd >= 11 && ddd <= 99 && digits[2] === '9') return 'PHONE';
    return 'CPF';
  }
  if (digits.length === 10) return 'PHONE';
  return 'EVP';
}

// Envia Pix para a chave do cliente (saques)
async function sendPixTransfer({ amount, pixKey, description }) {
  try {
    if (!isAsaasEnabled()) throw new Error('ASAAS_API_KEY nao configurada.');
    const value = parseFloat(amount);
    if (!value || value <= 0) throw new Error('Valor invalido.');
    const pixAddressKeyType = detectPixKeyType(pixKey);
    console.log('[ASAAS] transferencia Pix', JSON.stringify({ value, pixAddressKeyType }));
    const tr = await asaasRequest('POST', '/transfers', {
      value,
      pixAddressKey: String(pixKey).trim(),
      pixAddressKeyType,
      description: description || 'Saque TruckAuto'
    });
    return { success: true, transferId: tr.id, status: tr.status || 'PENDING' };
  } catch (err) {
    console.error('[ASAAS] sendPixTransfer:', err.message);
    return { success: false, error: err.message };
  }
}

// Saldo real da conta na gateway. Usado pelo relatorio de gap de caixa:
// o saldo que a plataforma tem na gateway vs a obrigacao com os usuarios.
// Docs: GET /v3/finance/balance -> { balance: number }
async function fetchAccountBalance() {
  try {
    if (!isAsaasEnabled()) throw new Error('ASAAS_API_KEY nao configurada.');
    const data = await asaasRequest('GET', '/finance/balance');
    const balance = parseFloat(data && data.balance);
    if (!isFinite(balance)) throw new Error('Resposta sem campo balance numerico.');
    return { success: true, balance, currency: 'BRL' };
  } catch (err) {
    console.error('[ASAAS] fetchAccountBalance:', err.message);
    return { success: false, error: err.message };
  }
}

function isPaymentConfirmed(event) {
  return event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED';
}

module.exports = {
  isAsaasEnabled,
  createPixCharge,
  sendPixTransfer,
  fetchAccountBalance,
  detectPixKeyType,
  isPaymentConfirmed,
  ASAAS_WEBHOOK_TOKEN,
  ASAAS_ENV,
  ASAAS_BASE_URL
};
