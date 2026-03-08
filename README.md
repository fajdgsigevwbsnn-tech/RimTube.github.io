# 🎬 RimTube — Бэкенд сервер

Node.js + Express + PostgreSQL

---

## 📋 Что нужно установить

1. **Node.js** v18+  → https://nodejs.org
2. **PostgreSQL** 14+ → https://www.postgresql.org/download/

---

## 🚀 Установка за 5 шагов

### Шаг 1 — Установить зависимости
```bash
cd rimtube-server
npm install
```

### Шаг 2 — Создать базу данных PostgreSQL
Откройте терминал и войдите в PostgreSQL:
```bash
# Windows (через psql)
psql -U postgres

# Mac / Linux
sudo -u postgres psql
```

Создайте базу данных:
```sql
CREATE DATABASE rimtube;
\q
```

### Шаг 3 — Настроить .env
Скопируйте файл с настройками:
```bash
cp .env.example .env
```

Откройте `.env` и заполните:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rimtube
DB_USER=postgres
DB_PASSWORD=ВАШ_ПАРОЛЬ_POSTGRESQL

JWT_SECRET=придумайте_длинную_строку_например_abc123xyz789qwerty
JWT_EXPIRES=7d

PORT=3000
CLIENT_URL=http://localhost:5500
```

### Шаг 4 — Создать таблицы
```bash
npm run db:init
```

Вы увидите:
```
🔌 Подключение к PostgreSQL...
✅ Все таблицы созданы
  📋 channels
  📋 comments
  📋 notifications
  📋 playlist_videos
  📋 playlists
  📋 posts
  📋 subscriptions
  📋 users
  📋 video_likes
  📋 videos
```

### Шаг 5 — Запустить сервер
```bash
# Обычный запуск
npm start

# Режим разработки (перезапускается при изменениях)
npm run dev
```

Сервер запустится на http://localhost:3000

---

## 🗂️ Структура проекта

```
rimtube-server/
├── src/
│   ├── index.js              ← главный файл (точка входа)
│   ├── db/
│   │   ├── pool.js           ← подключение к PostgreSQL
│   │   └── init.js           ← создание таблиц
│   ├── middleware/
│   │   ├── auth.js           ← проверка JWT токена
│   │   └── upload.js         ← загрузка файлов (multer)
│   └── routes/
│       ├── auth.js           ← /api/auth/*
│       ├── videos.js         ← /api/videos/*
│       ├── channels.js       ← /api/channels/*
│       ├── comments.js       ← /api/comments/*
│       ├── playlists.js      ← /api/playlists/*
│       ├── posts.js          ← /api/posts/*
│       └── notifications.js  ← /api/notifications/*
├── uploads/
│   ├── videos/               ← видеофайлы
│   └── thumbs/               ← превью картинки
├── .env                      ← настройки (НЕ публикуйте!)
├── .env.example              ← пример настроек
└── package.json
```

---

## 📡 API — все эндпоинты

### Авторизация
| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| GET  | `/api/auth/me` | Текущий пользователь |

**Пример регистрации:**
```json
POST /api/auth/register
{
  "username": "vasya",
  "password": "1234",
  "name": "Василий"
}
```

**Ответ:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "username": "vasya", "name": "Василий" }
}
```

> Токен нужно передавать во всех запросах:
> `Authorization: Bearer ВАШ_ТОКЕН`

---

### Видео
| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/videos?type=video&category=Игры` | Лента |
| GET | `/api/videos/search?q=текст` | Поиск |
| GET | `/api/videos/:id` | Одно видео |
| POST | `/api/videos` | Загрузить видео (multipart) |
| DELETE | `/api/videos/:id` | Удалить видео |
| POST | `/api/videos/:id/like` | Лайк/дизлайк |

**Загрузка видео (form-data):**
```
video  → файл .mp4
thumb  → файл .jpg (опционально)
title  → "Моё видео"
category → "Игры"
type   → "video" | "short" | "live"
```

---

### Каналы
| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/channels/:id` | Инфо о канале |
| PATCH | `/api/channels/:id` | Редактировать канал |
| POST | `/api/channels/:id/subscribe` | Подписаться/отписаться |

---

### Комментарии
| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/comments?video_id=uuid` | Все комментарии |
| POST | `/api/comments` | Добавить |
| DELETE | `/api/comments/:id` | Удалить (свой) |
| POST | `/api/comments/:id/like` | Лайк |

---

### Плейлисты
| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/playlists` | Мои плейлисты |
| POST | `/api/playlists` | Создать |
| DELETE | `/api/playlists/:id` | Удалить |
| POST | `/api/playlists/:id/videos` | Добавить/убрать видео |

---

## 🗄️ Схема базы данных

```
users ─────────── channels ─────────── videos
  │                   │                   │
  │              subscriptions        video_likes
  │                                       │
  └── comments ─────────────────────── (video_id)
  │
  └── playlists ── playlist_videos
  │
  └── notifications
  └── posts
```

---

## 🔒 Безопасность

- Пароли хранятся как **bcrypt** хэши (никогда в открытом виде)
- Авторизация через **JWT** токены (истекают через 7 дней)
- Нельзя подписаться на свой канал
- Удалять/редактировать можно только свои данные
- Файлы фильтруются по типу (только видео и картинки)

---

## 🌐 Как подключить к RimTube фронтенду

В начале файла `rimtube.html` установите:
```javascript
const API = 'http://localhost:3000/api';
```

Вместо IndexedDB все запросы пойдут на сервер.

---

## ❓ Частые проблемы

**Ошибка "password authentication failed"**
→ Проверьте DB_PASSWORD в файле .env

**Ошибка "database rimtube does not exist"**
→ Выполните `CREATE DATABASE rimtube;` в psql

**Порт 3000 занят**
→ Поменяйте PORT=3001 в .env

**CORS ошибка в браузере**
→ Убедитесь что CLIENT_URL совпадает с адресом фронтенда
