// src/middleware/auth.js
const jwt = require('jsonwebtoken');

// Обязательная авторизация
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен не передан' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

// Опциональная авторизация (не блокирует запрос)
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {}
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
