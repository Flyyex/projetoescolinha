// Sessao do CRM: o login ja existia (routes/auth.js) mas devolvia um token de
//menos que ninguem validava — a tela pedia senha e a API ficava aberta pra
// qualquer um. Aqui a assinatura passa a ter validade real, num cookie httpOnly.
//
// Por que cookie e nao token no header: o bundle do CRM ja faz fetch com
// credentials:include, entao o navegador manda o cookie sozinho em toda
// chamada. Nao precisa rebuildar o React (que nem tem build no repo).
const crypto = require('crypto');

const COOKIE_NAME = 'truckauto_crm_session';
const TTL_MS = 1000 * 60 * 60 * 12; // 12h

function secret() {
  return String(process.env.CRM_SECRET || process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || '').trim();
}

function sign(id, exp) {
  return crypto.createHmac('sha256', secret()).update(String(id) + '.' + exp).digest('hex');
}

// "id.expiracao.assinatura" — os 3 precisao bater, senao invalido
function make() {
  const id = crypto.randomBytes(24).toString('hex');
  const exp = Date.now() + TTL_MS;
  return id + '.' + exp + '.' + sign(id, exp);
}

function isValid(value) {
  if (!value || typeof value !== 'string') return false;
  if (!secret()) return false; // sem chave, nada e valido (fail seguro)
  const p = value.split('.');
  if (p.length !== 3) return false;
  const exp = Number(p[1]);
  if (!exp || !Number.isFinite(exp) || Date.now() > exp) return false;
  const esperado = sign(p[0], p[1]);
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(p[2], 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function setCookie(res) {
  res.cookie(COOKIE_NAME, make(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_MS
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function middleware(req, res, next) {
  const t = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (isValid(t)) return next();
  return res.status(401).json({ error: 'CRM: autenticacao necessaria.' });
}

module.exports = { COOKIE_NAME, TTL_MS, secret, make, isValid, setCookie, clearCookie, middleware };
