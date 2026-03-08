// src/routes/posts.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// ── GET /api/posts ──────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const { channel_id, limit=20, offset=0 } = req.query;
  const vals = [];
  const conds = [];
  if (channel_id) conds.push(`p.channel_id=$${vals.push(channel_id)}`);
  vals.push(parseInt(limit), parseInt(offset));

  const { rows } = await pool.query(`
    SELECT p.*, c.name ch_name, c.avatar ch_avatar, c.color ch_color,
           TO_CHAR(p.created_at,'DD.MM.YYYY') ago
    FROM posts p JOIN channels c ON c.id=p.channel_id
    ${conds.length?'WHERE '+conds.join(' AND '):''}
    ORDER BY p.created_at DESC
    LIMIT $${vals.length-1} OFFSET $${vals.length}
  `, vals);

  res.json(rows.map(p => ({
    id: p.id, text: p.text, likes: p.likes, ago: p.ago, createdAt: p.created_at,
    channel: { id: p.channel_id, name: p.ch_name, avatar: p.ch_avatar, color: p.ch_color }
  })));
});

// ── POST /api/posts ─────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Пустой пост' });

  const chRes = await pool.query('SELECT * FROM channels WHERE owner_id=$1 LIMIT 1',[req.user.id]);
  if (!chRes.rows.length) return res.status(400).json({ error: 'Сначала создайте канал (загрузите видео)' });

  const { rows } = await pool.query(
    'INSERT INTO posts(channel_id,text) VALUES($1,$2) RETURNING *',
    [chRes.rows[0].id, text.trim()]
  );
  const ch = chRes.rows[0];
  res.status(201).json({
    id: rows[0].id, text: rows[0].text, likes: 0, ago: 'только что',
    channel: { id: ch.id, name: ch.name, avatar: ch.avatar, color: ch.color }
  });
});

// ── POST /api/posts/:id/like ────────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE posts SET likes=likes+1 WHERE id=$1 RETURNING likes', [req.params.id]
  );
  res.json({ likes: rows[0]?.likes });
});

// ── DELETE /api/posts/:id ───────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id FROM posts p
    JOIN channels c ON c.id=p.channel_id
    WHERE p.id=$1 AND c.owner_id=$2
  `, [req.params.id, req.user.id]);
  if (!rows.length) return res.status(403).json({ error: 'Нет прав' });
  await pool.query('DELETE FROM posts WHERE id=$1',[req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
