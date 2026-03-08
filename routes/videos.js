// src/routes/videos.js
const router = require('express').Router();
const pool   = require('../db/pool');
const path   = require('path');
const fs     = require('fs');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { uploadVideoAndThumb }       = require('../middleware/upload');

// helpers
const UPLOADS = process.env.UPLOADS_DIR || './uploads';
function videoUrl(p)  { return p ? `/uploads/videos/${path.basename(p)}` : null; }
function thumbUrl(p)  { return p ? `/uploads/thumbs/${path.basename(p)}` : null; }
function fmtSec(s) {
  if (!s || isNaN(s)) return null;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}

// ── GET /api/videos  —  лента (с фильтром по категории / типу) ──
router.get('/', optionalAuth, async (req, res) => {
  const { category, type = 'video', limit = 30, offset = 0, channel_id } = req.query;
  const values = [];
  const conds  = [`v.type = $${values.push(type)}`];
  if (category)   conds.push(`v.category = $${values.push(category)}`);
  if (channel_id) conds.push(`v.channel_id = $${values.push(channel_id)}`);
  values.push(parseInt(limit), parseInt(offset));

  const sql = `
    SELECT v.*, c.name ch_name, c.avatar ch_avatar, c.color ch_color,
           c.handle ch_handle,
           TO_CHAR(v.created_at,'DD.MM.YYYY') ago
    FROM videos v
    JOIN channels c ON c.id = v.channel_id
    WHERE ${conds.join(' AND ')}
    ORDER BY v.created_at DESC
    LIMIT $${values.length-1} OFFSET $${values.length}
  `;
  const { rows } = await pool.query(sql, values);
  res.json(rows.map(r => ({
    id: r.id, title: r.title, description: r.description,
    category: r.category, type: r.type,
    videoUrl: videoUrl(r.video_path), thumbUrl: thumbUrl(r.thumb_path),
    duration: r.duration, views: r.views, likes: r.likes, dislikes: r.dislikes,
    bg: r.bg, isLive: r.is_live, viewers: r.viewers_count,
    createdAt: r.created_at, ago: r.ago,
    channel: { id: r.channel_id, name: r.ch_name, avatar: r.ch_avatar, color: r.ch_color, handle: r.ch_handle }
  })));
});

// ── GET /api/videos/search ──────────────────────────
router.get('/search', optionalAuth, async (req, res) => {
  const { q = '', type, limit = 20 } = req.query;
  const values = [`%${q.toLowerCase()}%`];
  const conds  = [`(LOWER(v.title) LIKE $1 OR LOWER(v.description) LIKE $1)`];
  if (type && type !== 'all') conds.push(`v.type = $${values.push(type)}`);
  values.push(parseInt(limit));

  const { rows } = await pool.query(`
    SELECT v.*, c.name ch_name, c.avatar ch_avatar, c.color ch_color
    FROM videos v JOIN channels c ON c.id = v.channel_id
    WHERE ${conds.join(' AND ')}
    ORDER BY v.views DESC LIMIT $${values.length}
  `, values);

  res.json(rows.map(r => ({
    id: r.id, title: r.title, description: r.description,
    type: r.type, thumbUrl: thumbUrl(r.thumb_path), videoUrl: videoUrl(r.video_path),
    duration: r.duration, views: r.views, bg: r.bg,
    channel: { id: r.channel_id, name: r.ch_name, avatar: r.ch_avatar, color: r.ch_color }
  })));
});

// ── GET /api/videos/:id ─────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT v.*, c.name ch_name, c.avatar ch_avatar, c.color ch_color,
             c.handle ch_handle, c.subs_count ch_subs, c.description ch_desc,
             c.owner_id ch_owner
      FROM videos v JOIN channels c ON c.id = v.channel_id
      WHERE v.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Видео не найдено' });
    const v = rows[0];

    // +1 просмотр
    await client.query('UPDATE videos SET views = views + 1 WHERE id = $1', [v.id]);

    // лайкнул ли текущий юзер?
    let userLike = null;
    if (req.user) {
      const lr = await client.query(
        'SELECT is_like FROM video_likes WHERE user_id=$1 AND video_id=$2',
        [req.user.id, v.id]
      );
      if (lr.rows.length) userLike = lr.rows[0].is_like;
    }

    // подписан ли?
    let isSubscribed = false;
    if (req.user) {
      const sr = await client.query(
        'SELECT 1 FROM subscriptions WHERE user_id=$1 AND channel_id=$2',
        [req.user.id, v.channel_id]
      );
      isSubscribed = sr.rows.length > 0;
    }

    res.json({
      id: v.id, title: v.title, description: v.description,
      category: v.category, type: v.type,
      videoUrl: videoUrl(v.video_path), thumbUrl: thumbUrl(v.thumb_path),
      duration: v.duration, views: v.views + 1, likes: v.likes, dislikes: v.dislikes,
      bg: v.bg, isLive: v.is_live, viewers: v.viewers_count, createdAt: v.created_at,
      userLike, isSubscribed,
      channel: {
        id: v.channel_id, name: v.ch_name, avatar: v.ch_avatar, color: v.ch_color,
        handle: v.ch_handle, subs: v.ch_subs, description: v.ch_desc, ownerId: v.ch_owner
      }
    });
  } finally {
    client.release();
  }
});

// ── POST /api/videos  —  загрузить видео ───────────
router.post('/', requireAuth, (req, res) => {
  uploadVideoAndThumb(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { title, description = '', category = 'Разное', type = 'video' } = req.body;
    if (!title) return res.status(400).json({ error: 'Введите название' });
    if (!req.files?.video) return res.status(400).json({ error: 'Выберите видеофайл' });

    const client = await pool.connect();
    try {
      // Получаем канал пользователя
      let chRes = await client.query(
        'SELECT * FROM channels WHERE owner_id = $1 LIMIT 1', [req.user.id]
      );

      // Создаём канал автоматически если нет
      if (!chRes.rows.length) {
        const userRes = await client.query('SELECT * FROM users WHERE id=$1',[req.user.id]);
        const u = userRes.rows[0];
        const grads = ['linear-gradient(135deg,#1a237e,#0288d1)','linear-gradient(135deg,#4a148c,#7b1fa2)','linear-gradient(135deg,#006064,#00bcd4)'];
        chRes = await client.query(`
          INSERT INTO channels (owner_id, name, handle, avatar, color, banner_bg)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        `, [
          u.id, u.name + ' — Канал', '@' + u.username,
          u.avatar, u.color, grads[Math.floor(Math.random()*grads.length)]
        ]);
      }
      const ch = chRes.rows[0];

      const videoPath = req.files.video[0].path;
      const thumbPath = req.files.thumb?.[0]?.path || null;
      const bgs = ['linear-gradient(135deg,#1a237e,#0288d1)','linear-gradient(135deg,#4a148c,#9c27b0)','linear-gradient(135deg,#006064,#00bcd4)'];
      const bg  = bgs[Math.floor(Math.random()*bgs.length)];

      const { rows } = await client.query(`
        INSERT INTO videos (channel_id, title, description, category, type, video_path, thumb_path, bg, is_live)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
      `, [ch.id, title, description, category, type, videoPath, thumbPath, bg, type==='live']);

      const videoId = rows[0].id;

      // Уведомляем подписчиков
      const subs = await client.query(
        'SELECT user_id FROM subscriptions WHERE channel_id=$1', [ch.id]
      );
      for (const sub of subs.rows) {
        await client.query(`
          INSERT INTO notifications (user_id, text, video_id, thumb_url, type)
          VALUES ($1,$2,$3,$4,$5)
        `, [sub.user_id, `<strong>${ch.name}</strong> загрузил: «${title}»`,
            videoId, thumbUrl(thumbPath), type==='live'?'live':'video']);
      }

      res.status(201).json({
        id: videoId, channelId: ch.id,
        videoUrl: videoUrl(videoPath), thumbUrl: thumbUrl(thumbPath)
      });
    } finally {
      client.release();
    }
  });
});

// ── DELETE /api/videos/:id ──────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT v.*, c.owner_id FROM videos v
      JOIN channels c ON c.id = v.channel_id
      WHERE v.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
    if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

    // Удаляем файлы
    [rows[0].video_path, rows[0].thumb_path].forEach(p => {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    });

    await client.query('DELETE FROM videos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

// ── POST /api/videos/:id/like ───────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  const { isLike } = req.body; // true = лайк, false = дизлайк
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT is_like FROM video_likes WHERE user_id=$1 AND video_id=$2',
      [req.user.id, req.params.id]
    );
    if (existing.rows.length) {
      if (existing.rows[0].is_like === isLike) {
        // Снять лайк/дизлайк
        await client.query('DELETE FROM video_likes WHERE user_id=$1 AND video_id=$2',
          [req.user.id, req.params.id]);
        await client.query(
          isLike ? 'UPDATE videos SET likes=GREATEST(0,likes-1) WHERE id=$1'
                 : 'UPDATE videos SET dislikes=GREATEST(0,dislikes-1) WHERE id=$1',
          [req.params.id]);
      } else {
        // Переключить
        await client.query('UPDATE video_likes SET is_like=$1 WHERE user_id=$2 AND video_id=$3',
          [isLike, req.user.id, req.params.id]);
        await client.query(
          isLike ? 'UPDATE videos SET likes=likes+1, dislikes=GREATEST(0,dislikes-1) WHERE id=$1'
                 : 'UPDATE videos SET dislikes=dislikes+1, likes=GREATEST(0,likes-1) WHERE id=$1',
          [req.params.id]);
      }
    } else {
      await client.query('INSERT INTO video_likes(user_id,video_id,is_like) VALUES($1,$2,$3)',
        [req.user.id, req.params.id, isLike]);
      await client.query(
        isLike ? 'UPDATE videos SET likes=likes+1 WHERE id=$1'
               : 'UPDATE videos SET dislikes=dislikes+1 WHERE id=$1',
        [req.params.id]);
    }
    const { rows } = await client.query('SELECT likes,dislikes FROM videos WHERE id=$1',[req.params.id]);
    res.json(rows[0]);
  } finally {
    client.release();
  }
});

module.exports = router;
