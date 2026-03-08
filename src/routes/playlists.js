// src/routes/playlists.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/playlists  —  мои плейлисты ───────────
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM playlists WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  // подтягиваем видео
  for (const pl of rows) {
    const vr = await pool.query(`
      SELECT v.id, v.title, v.thumb_path, v.duration, v.bg
      FROM playlist_videos pv
      JOIN videos v ON v.id = pv.video_id
      WHERE pv.playlist_id=$1 ORDER BY pv.position, pv.added_at
    `, [pl.id]);
    pl.videos = vr.rows.map(v => ({
      ...v, thumbUrl: v.thumb_path ? `/uploads/thumbs/${require('path').basename(v.thumb_path)}` : null
    }));
    pl.videoIds = pl.videos.map(v => v.id);
  }
  res.json(rows);
});

// ── POST /api/playlists ─────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, emoji='📋', is_private=false } = req.body;
  if (!name) return res.status(400).json({ error: 'Введите название' });
  const { rows } = await pool.query(
    'INSERT INTO playlists(user_id,name,emoji,is_private) VALUES($1,$2,$3,$4) RETURNING *',
    [req.user.id, name, emoji, is_private]
  );
  res.status(201).json({ ...rows[0], videos: [], videoIds: [] });
});

// ── DELETE /api/playlists/:id ───────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT user_id FROM playlists WHERE id=$1',[req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  await pool.query('DELETE FROM playlists WHERE id=$1',[req.params.id]);
  res.json({ ok: true });
});

// ── POST /api/playlists/:id/videos ─────────────────
router.post('/:id/videos', requireAuth, async (req, res) => {
  const { video_id } = req.body;
  const pl = await pool.query('SELECT user_id FROM playlists WHERE id=$1',[req.params.id]);
  if (!pl.rows.length) return res.status(404).json({ error: 'Плейлист не найден' });
  if (pl.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const exists = await pool.query(
    'SELECT 1 FROM playlist_videos WHERE playlist_id=$1 AND video_id=$2',
    [req.params.id, video_id]
  );
  if (exists.rows.length) {
    // Удалить
    await pool.query('DELETE FROM playlist_videos WHERE playlist_id=$1 AND video_id=$2',
      [req.params.id, video_id]);
    return res.json({ added: false });
  }
  const cnt = await pool.query('SELECT COUNT(*) FROM playlist_videos WHERE playlist_id=$1',[req.params.id]);
  await pool.query('INSERT INTO playlist_videos(playlist_id,video_id,position) VALUES($1,$2,$3)',
    [req.params.id, video_id, parseInt(cnt.rows[0].count)]);
  res.json({ added: true });
});

module.exports = router;
