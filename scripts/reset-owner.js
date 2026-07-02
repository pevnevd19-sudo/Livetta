const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config();

const login = String(process.env.ADMIN_LOGIN || 'owner').trim();
const password = String(process.env.ADMIN_PASSWORD || '').trim();

if (!password || password.length < 8) {
  console.error('Ошибка: укажите ADMIN_PASSWORD не короче 8 символов в .env');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
require('fs').mkdirSync(dataDir, { recursive: true });
const databasePath = path.join(dataDir, 'database.sqlite');
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .scryptSync(String(value), salt, 64)
    .toString('hex');

  return `${salt}:${hash}`;
}

const existingUser = db
  .prepare('SELECT id FROM users WHERE login = ?')
  .get(login);

if (existingUser) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        role = 'owner',
        active = 1
    WHERE login = ?
  `).run(hashPassword(password), login);
} else {
  db.prepare(`
    INSERT INTO users (
      login,
      password_hash,
      role,
      active
    )
    VALUES (?, ?, 'owner', 1)
  `).run(login, hashPassword(password));
}

const users = db
  .prepare('SELECT id, login, role, active FROM users')
  .all();

db.close();

console.log('Доступ владельца восстановлен.');
console.log(`Логин: ${login}`);
console.log('Пользователи в базе:', users);
