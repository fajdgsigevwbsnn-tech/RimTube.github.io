// src/routes/channels.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// ── GET /api/channels/:id ───────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM channels WHERE id=$1', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Канал не найден' });
  const ch = rows[0];

  let isSubscribed = false;
  if (req.user) {
    const sr = await pool.query(
      'SELECT 1 FROM subscriptions WHERE user_id=$1 AND channel_id=$2',
      [req.user.id, ch.id]
    );
    isSubscribed = sr.rows.length > 0;
  }
  const isOwn = req.user?.id === ch.owner_id;

  res.json({ ...ch, isSubscribed, isOwn });
});

// ── PATCH /api/channels/:id ─────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const { name, description, banner_bg } = req.body;
  const { rows } = await pool.query('SELECT * FROM channels WHERE id=$1',[req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Не найдено' });
  if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const updated = await pool.query(`
    UPDATE channels SET
      name       = COALESCE($1, name),
      description= COALESCE($2, description),
      banner_bg  = COALESCE($3, banner_bg)
    WHERE id=$4 RETURNING *
  `, [name||null, description||null, banner_bg||null, req.params.id]);
  res.json(updated.rows[0]);
});

// ── POST /api/channels/:id/subscribe ───────────────
router.post('/:id/subscribe', requireAuth, async (req, res) => {
  const chId = req.params.id;
  // запрет подписки на свой канал
  const { rows } = await pool.query('SELECT owner_id FROM channels WHERE id=$1',[chId]);
  if (!rows.length) return res.status(404).json({ error: 'Канал не найден' });
  if (rows[0].owner_id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя подписаться на свой канал' });
  }

  const existing = await pool.query(
    'SELECT 1 FROM subscriptions WHERE user_id=$1 AND channel_id=$2',
    [req.user.id, chId]
  );
  if (existing.rows.length) {
    // Отписаться
    await pool.query('DELETE FROM subscriptions WHERE user_id=$1 AND channel_id=$2',
      [req.user.id, chId]);
    await pool.query('UPDATE channels SET subs_count=GREATEST(0,subs_count-1) WHERE id=$1',[chId]);
    return res.json({ subscribed: false });
  } else {
    await pool.query('INSERT INTO subscriptions(user_id,channel_id) VALUES($1,$2)',
      [req.user.id, chId]);
    await pool.query('UPDATE channels SET subs_count=subs_count+1 WHERE id=$1',[chId]);
    return res.json({ subscribed: true });
  }
});

module.exports = router;
