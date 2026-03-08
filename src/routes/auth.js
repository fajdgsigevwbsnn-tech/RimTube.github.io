// src/routes/auth.js  — регистрация и вход
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');

// ── POST /api/auth/register ─────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, name } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (username.length < 3 || username.length > 40) {
    return res.status(400).json({ error: 'Логин: от 3 до 40 символов' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Логин: только буквы, цифры, _ . -' });
  }

  const client = await pool.connect();
  try {
    // Проверяем уникальность
    const exists = await client.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Имя пользователя уже занято' });
    }

    const hash   = await bcrypt.hash(password, 10);
    const avatar = name[0].toUpperCase();
    const colors = ['#3ea6ff','#ff6b35','#9c27b0','#4caf50','#f44336','#ff9800','#00bcd4'];
    const color  = colors[Math.floor(Math.random() * colors.length)];

    const { rows } = await client.query(
      `INSERT INTO users (username, password, name, avatar, color)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, avatar, color`,
      [username, hash, name, avatar, color]
    );
    const user  = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );
    res.status(201).json({ token, user });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const user = rows[0];
    const ok   = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Подтягиваем канал
    const chRes = await client.query(
      'SELECT id FROM channels WHERE owner_id = $1 LIMIT 1', [user.id]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );
    res.json({
      token,
      user: {
        id:        user.id,
        username:  user.username,
        name:      user.name,
        avatar:    user.avatar,
        color:     user.color,
        channelId: chRes.rows[0]?.id || null,
      }
    });
  } finally {
    client.release();
  }
});

// ── GET /api/auth/me ────────────────────────────────
const { requireAuth } = require('../middleware/auth');
router.get('/me', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, username, name, avatar, color FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    const chRes = await client.query(
      'SELECT id FROM channels WHERE owner_id = $1 LIMIT 1', [req.user.id]
    );
    res.json({ ...rows[0], channelId: chRes.rows[0]?.id || null });
  } finally {
    client.release();
  }
});

module.exports = router;
