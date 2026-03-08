// src/index.js  —  главный файл сервера RimTube
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const pool    = require('./db/pool');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Статика: загруженные файлы
app.use('/uploads', express.static(
  path.resolve(process.env.UPLOADS_DIR || './uploads')
));

// ─── API Routes ────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/videos',        require('./routes/videos'));
app.use('/api/channels',      require('./routes/channels'));
app.use('/api/comments',      require('./routes/comments'));
app.use('/api/playlists',     require('./routes/playlists'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/notifications', require('./routes/notifications'));

// ─── Health check ─────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: e.message });
  }
});

// ─── Карта всех эндпоинтов ────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'RimTube API',
    version: '1.0.0',
    endpoints: {
      auth:          ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/me'],
      videos:        ['GET /api/videos', 'GET /api/videos/search', 'GET /api/videos/:id',
                      'POST /api/videos', 'DELETE /api/videos/:id', 'POST /api/videos/:id/like'],
      channels:      ['GET /api/channels/:id', 'PATCH /api/channels/:id', 'POST /api/channels/:id/subscribe'],
      comments:      ['GET /api/comments?video_id=', 'POST /api/comments',
                      'DELETE /api/comments/:id', 'POST /api/comments/:id/like'],
      playlists:     ['GET /api/playlists', 'POST /api/playlists', 'DELETE /api/playlists/:id',
                      'POST /api/playlists/:id/videos'],
      posts:         ['GET /api/posts', 'POST /api/posts', 'DELETE /api/posts/:id', 'POST /api/posts/:id/like'],
      notifications: ['GET /api/notifications', 'POST /api/notifications/read-all', 'DELETE /api/notifications'],
    }
  });
});

// ─── Глобальная обработка ошибок ──────────────────
app.use((err, req, res, next) => {
  console.error('❌', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Маршрут ${req.method} ${req.path} не найден` });
});

// ─── Запуск ───────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ▶  RimTube сервер запущен!');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  📡  API: http://localhost:${PORT}/api`);
  console.log(`  🗄️   БД:  ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log('');
});

module.exports = app;
