// Saldo real na conta da gateway de pagamento.
// Separado de services/reports.js de proposito: e a UNICA parte do relatorio
// que fala com rede. A projecao de caixa nao depende daqui - se a API cair,
// o relatorio ainda mostra tendencia historica, so sem o gap.
//
// Docs Asaas: GET /v3/finance/balance -> { balance: number }
// Docs MisticPay/SyncPay/Cartpanda: sem endpoint de saldo documentado, entao
// devolvem unsupported em vez de fingir que funcionam.

const asaas = require('./asaas');

// Motivos de recusa sao texto legivel porque aparecem na tela do admin.
const UNSUPPORTED = {
  misticpay: 'MisticPay nao documenta endpoint de saldo. Autexpiration da auth legada em 30/09/2026.',
  syncpay: 'SyncPay nao documenta endpoint de saldo na API publica.',
  cartpanda: 'Cartpanda nao documenta endpoint de saldo na API publica.'
};

async function readAsaas() {
  const r = await asaas.fetchAccountBalance();
  if (!r.success) return { ok: false, gateway: 'asaas', error: r.error };
  return { ok: true, gateway: 'asaas', balance: r.balance, currency: r.currency || 'BRL' };
}

const READERS = { asaas: readAsaas };

// Contract: { ok, gateway, balance?, currency?, error? }
// Nunca lanca. Falha e sempre um valor de retorno, para o relatorio degradar
// em vez de quebrar inteiro.
async function getGatewayBalance(gateway) {
  const id = String(gateway || '').trim().toLowerCase();
  const reader = READERS[id];
  if (!reader) {
    return {
      ok: false,
      gateway: id,
      error: UNSUPPORTED[id] || ('Gateway "' + id + '" nao suporta leitura de saldo.')
    };
  }
  try {
    return await reader();
  } catch (err) {
    return { ok: false, gateway: id, error: err.message };
  }
}

// Uma leitura por gateway, em paralelo. Falha individual nao derruba as outras.
async function getGatewayBalances(gateways) {
  const list = (Array.isArray(gateways) ? gateways : []).filter(Boolean);
  const results = await Promise.all(list.map(getGatewayBalance));
  const byGateway = {};
  for (const r of results) byGateway[r.gateway] = r;
  return byGateway;
}

function supportsBalanceRead(gateway) {
  return Object.prototype.hasOwnProperty.call(READERS, String(gateway || '').toLowerCase());
}

module.exports = { getGatewayBalance, getGatewayBalances, supportsBalanceRead };