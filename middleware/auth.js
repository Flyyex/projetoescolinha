const jwt = require('jsonwebtoken');
const { findUserById } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_apenas_jwt_secret_inseguro';

// Em produção o segredo precisa vir do ambiente: fallback público permitiria forjar tokens.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('[SECURITY] JWT_SECRET não definido. Configure a variável de ambiente JWT_SECRET no painel do Render.');
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuário inválido ou não encontrado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };

