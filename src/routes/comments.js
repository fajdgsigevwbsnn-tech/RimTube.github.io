// src/routes/comments.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// ── GET /api/comments?video_id=xxx ─────────────────
router.get('/', optionalAuth, async (req, res) => {
  const { video_id } = req.query;
  if (!video_id) return res.status(400).json({ error: 'Нужен video_id' });

  // Корневые комментарии
  const { rows: cmts } = await pool.query(`
    SELECT c.*, u.name u_name, u.avatar u_avatar, u.color u_color
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.video_id=$1 AND c.parent_id IS NULL
    ORDER BY c.created_at DESC
  `, [video_id]);

  // Ответы
  const { rows: replies } = await pool.query(`
    SELECT c.*, u.name u_name, u.avatar u_avatar, u.color u_color
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.video_id=$1 AND c.parent_id IS NOT NULL
    ORDER BY c.created_at ASC
  `, [video_id]);

  const replyMap = {};
  replies.forEach(r => {
    if (!replyMap[r.parent_id]) replyMap[r.parent_id] = [];
    replyMap[r.parent_id].push(fmt(r));
  });

  res.json(cmts.map(c => ({ ...fmt(c), replies: replyMap[c.id] || [] })));
});

function fmt(c) {
  return {
    id: c.id, videoId: c.video_id, parentId: c.parent_id,
    text: c.text, likes: c.likes, createdAt: c.created_at,
    user: { id: c.user_id, name: c.u_name, avatar: c.u_avatar, color: c.u_color }
  };
}

// ── POST /api/comments ──────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { video_id, text, parent_id } = req.body;
  if (!video_id || !text?.trim()) {
    return res.status(400).json({ error: 'Нужны video_id и text' });
  }
  const { rows } = await pool.query(`
    INSERT INTO comments (video_id, user_id, parent_id, text)
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `, [video_id, req.user.id, parent_id || null, text.trim()]);

  const c = rows[0];
  const userRes = await pool.query('SELECT name,avatar,color FROM users WHERE id=$1',[req.user.id]);
  const u = userRes.rows[0];
  res.status(201).json({ ...fmt({...c,u_name:u.name,u_avatar:u.avatar,u_color:u.color}), replies:[] });
});

// ── DELETE /api/comments/:id ────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM comments WHERE id=$1',[req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  await pool.query('DELETE FROM comments WHERE id=$1',[req.params.id]);
  res.json({ ok: true });
});

// ── POST /api/comments/:id/like ─────────────────────
router.post('/:id/like', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE comments SET likes=likes+1 WHERE id=$1 RETURNING likes',[req.params.id]
  );
  res.json({ likes: rows[0]?.likes });
});

module.exports = router;
