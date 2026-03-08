// src/routes/notifications.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/notifications ──────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT n.*, TO_CHAR(n.created_at,'HH24:MI DD.MM') ago
    FROM notifications n
    WHERE n.user_id=$1
    ORDER BY n.created_at DESC LIMIT 50
  `, [req.user.id]);
  res.json(rows.map(n => ({
    id: n.id, text: n.text, videoId: n.video_id,
    thumbUrl: n.thumb_url, type: n.type,
    isRead: n.is_read, ago: n.ago
  })));
});

// ── POST /api/notifications/read-all ───────────────
router.post('/read-all', requireAuth, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1',[req.user.id]);
  res.json({ ok: true });
});

// ── DELETE /api/notifications ───────────────────────
router.delete('/', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM notifications WHERE user_id=$1',[req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
