'use strict';
// Regras do Programa Social. Sem acesso a banco: aqui so valida, normaliza e
// calcula o hash.
//
// O premio e uma constante de 1,00 e NUNCA vem do corpo da requisicao. Se o
// admin mandasse o valor, qualquer um com a chave do admin creditaria o quanto
// quisesse. Ver Ruling 2 no ledger.

const crypto = require('crypto');

const REWARD_AMOUNT = 1.0;
const NETWORKS = ['tiktok', 'instagram', 'reels'];

// Comparacao por igualdade do hostname inteiro, nunca por 'includes' -- e o que
// barra youtube.com.evil.com, que contem 'youtube.com' mas nao E o site.
const HOSTS_PERMITIDOS = [
  'tiktok.com', 'vm.tiktok.com',
  'instagram.com',
  'youtube.com', 'youtu.be',
  'facebook.com', 'fb.watch'
];

const MIN_ANTIGUIDADE_H = 24;
const MIN_DEPOSITO = 0.01;
const MAX_URL = 500;

// Chave de dedupe: a MESMA video em grafias diferentes tem que gerar o mesmo
// hash, senao a pessoa manda o mesmo video duas vezes e recebe R$ 2.
//
// O que precisa ser normalizado, porque o TikTok/Instagram entregam o mesmo
// video de varias formas:
//   - www.tiktok.com  == tiktok.com
//   - @Maria         == @maria  (usuario e case-insensitive)
//   - %40maria       == @maria  (percent-encoding)
//   - http:// == https://
//   - barra final, query de rastreio e fragmento
//
// Para o link curto (vm.tiktok.com/CODE) nao da para saber qual video e sem
// resolver o redirecionamento, entao ele fica com a propria chave. Ver Ruling.
function chaveDedupe(u) {
  let host = u.hostname.toLowerCase();
  if (host.indexOf('www.') === 0) host = host.slice(4);

  // Decodifica %40 e companhia antes de comparar, senão o mesmo @ vira dois.
  let path;
  try {
    path = decodeURIComponent(u.pathname);
  } catch (e) {
    path = u.pathname;
  }
  path = path.replace(/\/+$/, '').toLowerCase();

  // Link curto do TikTok: guarda o codigo como caminho do host principal, para
  // que vm.tiktok.com/ZM123 e qualquer outra forma do mesmo link colidam.
  if (host === 'vm.tiktok.com') {
    const codigo = path.replace(/^\/+/, '');
    if (codigo) return 'tiktok.com/' + codigo.toLowerCase();
  }

  return host + path;
}

function normalizeUrl(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return { error: 'Informe o link do vídeo.' };
  if (!/^https?:\/\//i.test(txt)) {
    return { error: 'O link precisa começar com http:// ou https://' };
  }
  if (txt.length > MAX_URL) return { error: 'Link muito longo.' };

  let u;
  try {
    u = new URL(txt);
  } catch (e) {
    return { error: 'Link inválido.' };
  }
  // O parser normaliza barras invertidas (\) para '/', entao
  // https://tiktok.com\@evil.com vira host evil.com e cai na checagem de host.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Link inválido.' };
  }

  u.hash = '';
  const chave = chaveDedupe(u);
  if (chave.length < 12) return { error: 'Link inválido.' };

  return {
    // URL exibida ao admin: a que o operador de fato mandou.
    url: txt,
    hash: crypto.createHash('sha256').update(chave).digest('hex')
  };
}

function isAllowedHost(url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  // TikTok, Instagram e Facebook entregam link com 'www.' (www.tiktok.com/...).
  // Tirar o prefixo antes de comparar e o que faz o link real passar; a
  // comparacao continua sendo por igualdade do host inteiro, entao
  // www.tiktok.com.evil.com vira tiktok.com.evil.com e NAO passa.
  if (host.indexOf('www.') === 0) host = host.slice(4);
  return HOSTS_PERMITIDOS.includes(host);
}

function isEligibleToPost({ createdAt, totalDeposited, pendingCount }) {
  const ts = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'Não foi possível validar sua conta.' };
  }
  const horas = (Date.now() - ts) / (3600 * 1000);
  if (horas < MIN_ANTIGUIDADE_H) {
    return { ok: false, reason: 'Sua conta precisa ter 24h para participar. Tente daqui a pouco.' };
  }
  if (!(parseFloat(totalDeposited || 0) > MIN_DEPOSITO)) {
    return { ok: false, reason: 'É preciso ter ao menos um depósito confirmado para participar.' };
  }
  if ((pendingCount || 0) > 0) {
    return { ok: false, reason: 'Você já tem um vídeo pendente de análise. Aguarde o admin responder.' };
  }
  return { ok: true };
}

module.exports = {
  REWARD_AMOUNT,
  NETWORKS,
  HOSTS_PERMITIDOS,
  normalizeUrl,
  isAllowedHost,
  isEligibleToPost
};