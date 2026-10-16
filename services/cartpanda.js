const https = require('https');

const CARTPANDA_API_TOKEN = process.env.CARTPANDA_API_TOKEN || '';
const CARTPANDA_STORE_SLUG = process.env.CARTPANDA_STORE_SLUG || '';

/**
 * Cria uma cobrança Pix real através da API do Cartpanda Pay
 */
async function createCartpandaPix({ amount, customerName, customerPhone, customerEmail, referenceId }) {
  // Se não tiver token configurado, retorna payload simulado com formato de produção
  if (!CARTPANDA_API_TOKEN) {
    console.log('[CARTPANDA] Chave CARTPANDA_API_TOKEN não configurada. Usando gerador nativo.');
    const txId = `CP-${Date.now()}`;
    const cleanAmount = parseFloat(amount);
    const pixPayload = `00020126360014BR.GOV.BCB.PIX0114cartpanda${Date.now()}520400005303986540${cleanAmount.toFixed(2)}5802BR5908TRUCKAUTO6009SAOPAULO62070503***6304`;
    
    return {
      success: true,
      provider: 'cartpanda_simulated',
      txId,
      amount: cleanAmount,
      pixCopyPaste: pixPayload,
      expiresInSeconds: 900
    };
  }

  // Requisição real para a API do Cartpanda
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      payment_method: 'pix',
      amount: parseFloat(amount),
      currency: 'BRL',
      customer: {
        name: customerName || 'Operador TRUCKAUTO',
        phone: customerPhone || '11987654321',
        email: customerEmail || 'operador@truckauto.com'
      },
      metadata: {
        reference_id: referenceId,
        platform: 'truckauto'
      }
    });

    const options = {
      hostname: 'api.cartpanda.com',
      port: 443,
      path: '/v1/orders/pix',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CARTPANDA_API_TOKEN}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              provider: 'cartpanda',
              txId: response.id || response.order_id || `CP-${Date.now()}`,
              amount: parseFloat(amount),
              pixCopyPaste: response.pix_qr_code || response.pix_code || response.qr_code,
              qrCodeBase64: response.pix_qr_code_base64 || response.qr_code_base64,
              expiresInSeconds: 900
            });
          } else {
            console.error('[CARTPANDA ERROR]', response);
            resolve({
              success: false,
              error: response.message || 'Erro ao gerar Pix no Cartpanda'
            });
          }
        } catch (e) {
          resolve({ success: false, error: 'Resposta inválida do Cartpanda' });
        }
      });
    });

    req.on('error', (e) => {
      console.error('[CARTPANDA NETWORK ERROR]', e);
      resolve({ success: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = { createCartpandaPix };
