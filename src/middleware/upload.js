// src/middleware/upload.js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
require('dotenv').config();

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';

// Создаём папки при старте
['videos', 'thumbs'].forEach(sub => {
  const dir = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Хранилище
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const isVideo = file.fieldname === 'video';
    cb(null, path.join(UPLOADS_DIR, isVideo ? 'videos' : 'thumbs'));
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

// Фильтр типов
function fileFilter(req, file, cb) {
  const videoTypes = /mp4|mov|webm|avi|mkv|m4v/;
  const imageTypes = /jpg|jpeg|png|gif|webp/;
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  if (file.fieldname === 'video' && videoTypes.test(ext)) return cb(null, true);
  if (file.fieldname === 'thumb' && imageTypes.test(ext)) return cb(null, true);
  cb(new Error(`Недопустимый тип файла: ${file.mimetype}`));
}

const MAX_VIDEO = parseInt(process.env.MAX_VIDEO_MB || 2048) * 1024 * 1024;
const MAX_THUMB = parseInt(process.env.MAX_THUMB_MB  || 10)   * 1024 * 1024;

// Для загрузки видео + превью одновременно
const uploadVideoAndThumb = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_VIDEO },
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

// Только превью
const uploadThumbOnly = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_THUMB },
}).single('thumb');

module.exports = { uploadVideoAndThumb, uploadThumbOnly };
