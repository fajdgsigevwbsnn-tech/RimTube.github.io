// src/db/init.js  — создаёт все таблицы в PostgreSQL
// Запуск: npm run db:init
require('dotenv').config();
const pool = require('./pool');

const SQL = `

-- ═══════════════════════════════════════
-- РАСШИРЕНИЯ
-- ═══════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════
-- ПОЛЬЗОВАТЕЛИ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(40) UNIQUE NOT NULL,
  password    TEXT        NOT NULL,          -- bcrypt hash
  name        VARCHAR(80) NOT NULL,
  avatar      VARCHAR(4)  NOT NULL DEFAULT '?',
  color       VARCHAR(20) NOT NULL DEFAULT '#3ea6ff',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- КАНАЛЫ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS channels (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  handle      VARCHAR(50)  UNIQUE NOT NULL,
  description TEXT         DEFAULT '',
  avatar      VARCHAR(4)   NOT NULL DEFAULT '?',
  color       VARCHAR(20)  NOT NULL DEFAULT '#3ea6ff',
  banner_bg   TEXT         DEFAULT 'linear-gradient(135deg,#1a237e,#0288d1)',
  subs_count  INTEGER      DEFAULT 0,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- ПОДПИСКИ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID  NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

-- ═══════════════════════════════════════
-- ВИДЕО
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS videos (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  description  TEXT         DEFAULT '',
  category     VARCHAR(40)  DEFAULT 'Разное',
  type         VARCHAR(10)  DEFAULT 'video'   CHECK (type IN ('video','short','live')),
  video_path   TEXT,           -- путь к файлу на диске
  thumb_path   TEXT,           -- путь к превью
  duration     VARCHAR(20),    -- "12:34"
  views        INTEGER      DEFAULT 0,
  likes        INTEGER      DEFAULT 0,
  dislikes     INTEGER      DEFAULT 0,
  bg           TEXT         DEFAULT 'linear-gradient(135deg,#1a237e,#0288d1)',
  is_live      BOOLEAN      DEFAULT FALSE,
  viewers_count INTEGER     DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_channel   ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_type      ON videos(type);
CREATE INDEX IF NOT EXISTS idx_videos_category  ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_created   ON videos(created_at DESC);

-- ═══════════════════════════════════════
-- ЛАЙКИ ВИДЕО
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS video_likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  is_like    BOOLEAN NOT NULL,   -- true = лайк, false = дизлайк
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

-- ═══════════════════════════════════════
-- КОММЕНТАРИИ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS comments (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID  NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID  REFERENCES comments(id) ON DELETE CASCADE,  -- NULL = корневой
  text        TEXT  NOT NULL,
  likes       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_video  ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- ═══════════════════════════════════════
-- ПЛЕЙЛИСТЫ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS playlists (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  emoji       VARCHAR(4)   DEFAULT '📋',
  is_private  BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_videos (
  playlist_id UUID    NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id    UUID    NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position    INTEGER DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (playlist_id, video_id)
);

-- ═══════════════════════════════════════
-- ПОСТЫ СООБЩЕСТВА
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS posts (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID  NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  text        TEXT  NOT NULL,
  likes       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- УВЕДОМЛЕНИЯ
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT  NOT NULL,
  video_id    UUID  REFERENCES videos(id) ON DELETE SET NULL,
  thumb_url   TEXT,
  type        VARCHAR(10) DEFAULT 'video',
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, created_at DESC);

`;

async function init() {
  const client = await pool.connect();
  try {
    console.log('🔌 Подключение к PostgreSQL...');
    await client.query(SQL);
    console.log('✅ Все таблицы созданы (или уже существуют)');
    console.log('\nТаблицы:');
    const res = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' ORDER BY tablename
    `);
    res.rows.forEach(r => console.log('  📋', r.tablename));
  } catch(e) {
    console.error('❌ Ошибка инициализации БД:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
