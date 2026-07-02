const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

dotenv.config();

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SITE_URL = String(process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-before-production';
const OWNER_LOGIN = process.env.ADMIN_LOGIN || 'owner';
const OWNER_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const CHILD_PRODUCTS_ENABLED = String(process.env.CHILD_PRODUCTS_ENABLED || 'false') === 'true';
const FREE_SHIPPING_MIN = Number(process.env.FREE_SHIPPING_MIN || 10000);
const VOLUME_DISCOUNT_TIERS = [
  { minItems: 5, percent: 15, label: 'Скидка 15% за комплект от 5 украшений' },
  { minItems: 3, percent: 10, label: 'Скидка 10% за комплект от 3 украшений' },
  { minItems: 2, percent: 5, label: 'Скидка 5% за 2 украшения' }
];
const GIFT_WRAP_PRICE = Number(process.env.GIFT_WRAP_PRICE || 300);
const GIFT_CARD_PRICE = Number(process.env.GIFT_CARD_PRICE || 150);
const RESERVATION_MINUTES = Number(process.env.RESERVATION_MINUTES || 30);
const SELLER_INN = process.env.SELLER_INN || '';
const SELLER_EMAIL = process.env.SELLER_EMAIL || 'livettajewerly@yandex.ru';
const SELLER_PHONE = process.env.SELLER_PHONE || '+79062281944';
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || '';
const PAYMENT_DEMO_MODE = String(process.env.PAYMENT_DEMO_MODE || 'false') === 'true';
const CDEK_CLIENT_ID = process.env.CDEK_CLIENT_ID || '';
const CDEK_CLIENT_SECRET = process.env.CDEK_CLIENT_SECRET || '';
const CDEK_FROM_POSTAL_CODE = process.env.CDEK_FROM_POSTAL_CODE || '193091';
const YANDEX_METRIKA_ID = String(process.env.YANDEX_METRIKA_ID || '').trim();

if (NODE_ENV === 'production') {
  const errors = [];
  if (JWT_SECRET === 'change-me-before-production' || JWT_SECRET.length < 32) errors.push('задайте JWT_SECRET длиной не менее 32 символов');
  if (OWNER_PASSWORD === 'change-me-now' || OWNER_PASSWORD.length < 10) errors.push('задайте сильный ADMIN_PASSWORD');
  if (!SELLER_INN || !/^\d{10,12}$/.test(SELLER_INN)) errors.push('задайте SELLER_INN');
  if (!SITE_URL.startsWith('https://')) errors.push('SITE_URL должен начинаться с https://');
  if (errors.length) throw new Error(`Production не запущен: ${errors.join('; ')}`);
}

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const ORDERS_EXCEL_PATH = path.resolve(process.env.ORDERS_EXCEL_PATH || path.join(dataDir, 'livetta-orders.xlsx'));

const db = new Database(path.join(dataDir, 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const uploadsDir = path.join(__dirname, 'uploads');
const backupsDir = path.join(__dirname, 'backups');
for (const dir of [uploadsDir, backupsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

const allowedOrigins = new Set([SITE_URL, 'http://localhost:3000', 'http://127.0.0.1:3000']);
try {
  const site = new URL(SITE_URL);
  const hostname = site.hostname.startsWith('www.') ? site.hostname.slice(4) : `www.${site.hostname}`;
  allowedOrigins.add(`${site.protocol}//${hostname}${site.port ? `:${site.port}` : ''}`);
} catch {}
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Источник запроса не разрешён'));
  }
}));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: NODE_ENV === 'production' ? '7d' : 0 }));

const frontendDir = __dirname;
const pagesDir = path.join(frontendDir, 'pages');
app.use('/css', express.static(path.join(frontendDir, 'css')));
app.use('/js', express.static(path.join(frontendDir, 'js')));
app.use('/img', express.static(path.join(frontendDir, 'img')));

function sendFrontendFile(res, fileName, status = 200) {
  const filePath = path.join(pagesDir, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Страница не найдена');
  return res.status(status).sendFile(filePath);
}

function sendRootFile(res, fileName, status = 200) {
  const filePath = path.join(frontendDir, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Страница не найдена');
  return res.status(status).sendFile(filePath);
}

const pages = ['catalog','constructor','product','cart','checkout','faq','delivery','about','offer','privacy','user-agreement','personal-data-consent','marketing-consent','returns','warranty','payment','contacts','payment-success','payment-failed','admin'];
app.get('/', (req, res) => sendRootFile(res, 'index.html'));
app.get(['/index.html', '/index.html/'], (req, res) => res.redirect(301, '/'));
for (const page of pages) {
  app.get(`/${page}`, (req, res) => sendFrontendFile(res, `${page}.html`));
  app.get(`/${page}.html`, (req, res) => res.redirect(301, `/${page}${getRequestQuery(req)}`));
  app.get(`/${page}.html/`, (req, res) => res.redirect(301, `/${page}${getRequestQuery(req)}`));
}
app.get('/robots.txt', (req, res) => res.type('text/plain').sendFile(path.join(frontendDir, 'robots.txt')));
app.get('/yandex_a9411ca51ebb3cea.html', (req, res) => res.type('text/html').sendFile(path.join(frontendDir, 'yandex_a9411ca51ebb3cea.html')));
app.get('/favicon.svg', (req, res) => res.type('image/svg+xml').sendFile(path.join(frontendDir, 'favicon.svg')));
app.get('/favicon.ico', (req, res) => res.type('image/x-icon').sendFile(path.join(frontendDir, 'favicon.ico')));
app.get('/apple-touch-icon.png', (req, res) => res.type('image/png').sendFile(path.join(frontendDir, 'img', 'apple-touch-icon.png')));
app.get('/favicon-32x32.png', (req, res) => res.type('image/png').sendFile(path.join(frontendDir, 'img', 'favicon-32x32.png')));
app.get('/favicon-16x16.png', (req, res) => res.type('image/png').sendFile(path.join(frontendDir, 'img', 'favicon-16x16.png')));
app.get('/site.webmanifest', (req, res) => res.type('application/manifest+json').sendFile(path.join(frontendDir, 'site.webmanifest')));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').sendFile(path.join(frontendDir, 'sitemap.xml')));

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function getRequestQuery(req) {
  const url = String(req.originalUrl || '');
  const queryStart = url.indexOf('?');
  return queryStart >= 0 ? url.slice(queryStart) : '';
}

function initDatabase() {
  db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT DEFAULT '',
    product_images TEXT DEFAULT '[]',
    stones_json TEXT DEFAULT '[]',
    is_popular INTEGER DEFAULT 0,
    popular_order INTEGER DEFAULT 0,
    stock_qty INTEGER DEFAULT 0,
    reserved_qty INTEGER DEFAULT 0,
    sold_qty INTEGER DEFAULT 0,
    is_child INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  for (const [column, definition] of Object.entries({
    image:"TEXT DEFAULT ''", product_images:"TEXT DEFAULT '[]'", stones_json:"TEXT DEFAULT '[]'", is_popular:'INTEGER DEFAULT 0', popular_order:'INTEGER DEFAULT 0',
    stock_qty:'INTEGER DEFAULT 0', reserved_qty:'INTEGER DEFAULT 0', sold_qty:'INTEGER DEFAULT 0', is_child:'INTEGER DEFAULT 0', active:'INTEGER DEFAULT 1', created_at:'DATETIME DEFAULT CURRENT_TIMESTAMP'
  })) addColumnIfMissing('products', column, definition);

  db.prepare(`CREATE TABLE IF NOT EXISTS stones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    zodiac TEXT DEFAULT '',
    stone_property TEXT DEFAULT '',
    stone_shape TEXT DEFAULT 'round',
    price REAL NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    size_mm REAL,
    color TEXT DEFAULT '#b48a78',
    stock_qty INTEGER DEFAULT 0,
    reserved_qty INTEGER DEFAULT 0,
    sold_qty INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  for (const [column, definition] of Object.entries({
    image:"TEXT NOT NULL DEFAULT ''", zodiac:"TEXT DEFAULT ''", stone_property:"TEXT DEFAULT ''", stone_shape:"TEXT DEFAULT 'round'", size_mm:'REAL', color:"TEXT DEFAULT '#b48a78'", stock_qty:'INTEGER DEFAULT 0', reserved_qty:'INTEGER DEFAULT 0', sold_qty:'INTEGER DEFAULT 0', active:'INTEGER DEFAULT 1', created_at:'DATETIME DEFAULT CURRENT_TIMESTAMP'
  })) addColumnIfMissing('stones', column, definition);

  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_token TEXT NOT NULL UNIQUE,
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    customer_telegram TEXT DEFAULT '',
    customer_email TEXT DEFAULT '',
    country TEXT DEFAULT 'Россия',
    city TEXT DEFAULT '',
    postal_code TEXT DEFAULT '',
    address TEXT DEFAULT '',
    delivery_method TEXT DEFAULT '',
    delivery_comment TEXT DEFAULT '',
    shipping_cost REAL DEFAULT 0,
    shipping_resolved INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT 'online',
    payment_id TEXT DEFAULT '',
    payment_status TEXT DEFAULT 'pending',
    payment_url TEXT DEFAULT '',
    receipt_url TEXT DEFAULT '',
    receipt_sent_at DATETIME,
    tracking_number TEXT DEFAULT '',
    customer_comment TEXT DEFAULT '',
    admin_note TEXT DEFAULT '',
    legal_consent INTEGER DEFAULT 0,
    marketing_consent INTEGER DEFAULT 0,
    items_json TEXT NOT NULL,
    inventory_json TEXT DEFAULT '{}',
    subtotal REAL DEFAULT 0,
    discount_total REAL DEFAULT 0,
    promo_label TEXT DEFAULT '',
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'new',
    reserved_until DATETIME,
    inventory_finalized INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const orderColumns = {
    public_token:"TEXT DEFAULT ''", customer_phone:"TEXT DEFAULT ''", customer_telegram:"TEXT DEFAULT ''", customer_email:"TEXT DEFAULT ''",
    country:"TEXT DEFAULT 'Россия'", city:"TEXT DEFAULT ''", postal_code:"TEXT DEFAULT ''", address:"TEXT DEFAULT ''", delivery_method:"TEXT DEFAULT ''",
    delivery_comment:"TEXT DEFAULT ''", shipping_cost:'REAL DEFAULT 0', shipping_resolved:'INTEGER DEFAULT 0', payment_method:"TEXT DEFAULT 'online'",
    payment_id:"TEXT DEFAULT ''", payment_status:"TEXT DEFAULT 'pending'", payment_url:"TEXT DEFAULT ''", receipt_url:"TEXT DEFAULT ''", receipt_sent_at:'DATETIME',
    tracking_number:"TEXT DEFAULT ''", admin_note:"TEXT DEFAULT ''", legal_consent:'INTEGER DEFAULT 0', marketing_consent:'INTEGER DEFAULT 0', inventory_json:"TEXT DEFAULT '{}'",
    subtotal:'REAL DEFAULT 0', discount_total:'REAL DEFAULT 0', promo_label:"TEXT DEFAULT ''", reserved_until:'DATETIME', inventory_finalized:'INTEGER DEFAULT 0', updated_at:'DATETIME DEFAULT CURRENT_TIMESTAMP'
  };
  for (const [column, definition] of Object.entries(orderColumns)) addColumnIfMissing('orders', column, definition);
  addColumnIfMissing('orders', 'customer_contact', "TEXT DEFAULT ''");

  db.prepare(`CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    details TEXT DEFAULT '',
    actor TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    blocked_until DATETIME
  )`).run();

  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    db.prepare('INSERT INTO users (login, password_hash, role) VALUES (?, ?, ?)').run(OWNER_LOGIN, hashPassword(OWNER_PASSWORD), 'owner');
    console.log(`Создан владелец панели управления: ${OWNER_LOGIN}. Смените пароль в .env перед запуском.`);
  }

  db.prepare("UPDATE products SET stock_qty = 1 WHERE stock_qty IS NULL OR stock_qty < 0").run();
  db.prepare("UPDATE stones SET stock_qty = 0 WHERE stock_qty IS NULL OR stock_qty < 0").run();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function randomToken(bytes = 24) { return crypto.randomBytes(bytes).toString('hex'); }
function bool(value) { return value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === 'on'; }
function num(value, fallback = 0) { const n = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : fallback; }
function int(value, fallback = 0) { return Math.max(0, Math.round(num(value, fallback))); }
function text(value) { return String(value ?? '').trim(); }
function normalizeColor(value) { return /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : '#b48a78'; }
function safeJson(value, fallback) { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed ?? fallback; } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function plusMinutes(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function addHistory(orderId, event, details = '', actor = 'system') {
  db.prepare('INSERT INTO order_history (order_id, event, details, actor) VALUES (?, ?, ?, ?)').run(orderId, event, details, actor);
}

initDatabase();

if (NODE_ENV !== 'production') {
  const configuredOwner=db.prepare('SELECT password_hash FROM users WHERE login=?').get(OWNER_LOGIN);
  if(configuredOwner && !verifyPassword(OWNER_PASSWORD, configuredOwner.password_hash)) {
    console.warn('Пароль владельца в базе не совпадает с ADMIN_PASSWORD из .env. Выполните: npm run reset-owner');
  }
}

const loginRate = new Map();
function loginRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const state = loginRate.get(key) || { count: 0, reset: Date.now() + 15 * 60_000 };
  if (Date.now() > state.reset) { state.count = 0; state.reset = Date.now() + 15 * 60_000; }
  state.count += 1; loginRate.set(key, state);
  if (state.count > 10) return res.status(429).json({ message: 'Слишком много попыток входа. Повторите позже.' });
  next();
}
const orderRate = new Map();
function orderRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const state = orderRate.get(key) || { count: 0, reset: Date.now() + 60 * 60_000 };
  if (Date.now() > state.reset) { state.count = 0; state.reset = Date.now() + 60 * 60_000; }
  state.count += 1; orderRate.set(key, state);
  if (state.count > 20) return res.status(429).json({ message: 'Слишком много заказов с одного адреса. Повторите позже.' });
  next();
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Нужно войти в панель управления' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id, login, role, active FROM users WHERE id = ?').get(payload.id);
    if (!user || !user.active) return res.status(403).json({ message: 'Доступ отключён' });
    req.admin = user; next();
  } catch { return res.status(403).json({ message: 'Сессия истекла. Войдите заново.' }); }
}
function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.admin?.role) ? next() : res.status(403).json({ message: 'Недостаточно прав' });
}

app.post('/api/login', loginRateLimit, (req, res) => {
  const login = text(req.body?.login);
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }
  loginRate.delete(req.ip || 'unknown');
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, login: user.login, role: user.role } });
});
app.get('/api/me', authMiddleware, (req, res) => res.json({ user: req.admin }));

const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, uploadsDir); },
  filename(req, file, cb) {
    const extensionByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif'
    };
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'image', originalExt)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, '')
      .slice(0, 70);
    const safeExt = extensionByMime[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${base || 'image'}${safeExt}`);
  }});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 50 },
  fileFilter(req, file, cb) {
    const allowed = new Set(['image/jpeg','image/png','image/webp','image/gif']);
    if (!allowed.has(file.mimetype)) return cb(new Error('Разрешены JPG, PNG, WEBP и GIF'));
    cb(null, true);
  }
});
function uploadAny(req, res, next) { upload.any()(req, res, (error) => error ? next(error) : next()); }
function uploadUrl(req, file) { return file ? `${req.protocol}://${req.get('host')}/uploads/${file.filename}` : ''; }
function uploaded(req, fields) { return (req.files || []).filter(file => fields.includes(file.fieldname)); }
function deleteLocalFile(value) {
  if (!value) return;
  try { const fileName = path.basename(new URL(value, SITE_URL).pathname); const filePath = path.join(uploadsDir, fileName); if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function productImages(product) {
  const images = safeJson(product?.product_images, []);
  const result = Array.isArray(images) ? images.filter(Boolean).map(String) : [];
  if (product?.image && !result.includes(product.image)) result.unshift(product.image);
  return [...new Set(result)];
}
function productStones(product) {
  const raw = safeJson(product?.stones_json, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeProductStone).filter(Boolean);
}
function normalizeProductStone(stone) {
  if (!stone || typeof stone !== 'object') return null;
  const name = text(stone.name);
  if (!name) return null;
  return {
    name,
    description: text(stone.description),
    zodiac: text(stone.zodiac),
    stone_property: text(stone.stone_property ?? stone.property)
  };
}
function parseProductStones(value) {
  const raw = text(value);
  if (!raw) return [];

  if (raw.startsWith('[')) {
    const items = safeJson(raw, []);
    return Array.isArray(items) ? items.map(normalizeProductStone).filter(Boolean) : [];
  }

  return raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', description = '', zodiac = '', stone_property = ''] = line.split('|').map((part) => text(part));
      return normalizeProductStone({ name, description, zodiac, stone_property });
    })
    .filter(Boolean);
}
function publicProduct(product, admin = false) {
  const images = productImages(product);
  const available = Math.max(0, int(product.stock_qty) - int(product.reserved_qty));
  const purchasable = Boolean(product.active) && available > 0 && (!product.is_child || CHILD_PRODUCTS_ENABLED);
  const stones = productStones(product);
  const result = { ...product, image: images[0] || '', product_images: images, product_stones: stones, available_qty: available, in_stock: available > 0, purchasable, child_sale_enabled: CHILD_PRODUCTS_ENABLED };
  if (!admin) { delete result.stock_qty; delete result.reserved_qty; delete result.sold_qty; delete result.available_qty; }
  return result;
}
function normalizeStoneShape(value) {
  const shape = text(value || 'round');
  return ['round','square','diamond','rectangle','triangle','faceted'].includes(shape) ? shape : 'round';
}

function publicStone(stone, admin = false) {
  const available = Math.max(0, int(stone.stock_qty) - int(stone.reserved_qty));
  const result = { ...stone, available_qty: available, available: Boolean(stone.active) && available > 0 };
  if (!admin) { delete result.stock_qty; delete result.reserved_qty; delete result.sold_qty; delete result.available_qty; }
  return result;
}

const categoriesFile = path.join(dataDir, 'categories.json');
function readCategories() { try { const d = safeJson(fs.readFileSync(categoriesFile,'utf8'), {}); return Array.isArray(d) ? d : (Array.isArray(d.categories) ? d.categories : []); } catch { return ['Ожерелье','Колье','Кольцо','Браслет','Серьги','Детские украшения']; } }
function writeCategories(categories) { fs.writeFileSync(categoriesFile, JSON.stringify({ categories:[...new Set(categories.map(text).filter(Boolean))] }, null, 2)); }
app.get('/api/categories', (req,res)=>res.json({categories:readCategories()}));
app.post('/api/categories', authMiddleware, requireRoles('owner','admin'), (req,res)=>{ const name=text(req.body?.name); if(!name) return res.status(400).json({message:'Укажите название'}); const c=readCategories(); if(!c.some(x=>x.toLowerCase()===name.toLowerCase())) c.push(name); writeCategories(c); res.status(201).json({categories:c}); });
app.delete('/api/categories/:name', authMiddleware, requireRoles('owner','admin'), (req,res)=>{
  const name=decodeURIComponent(req.params.name);
  const used=db.prepare('SELECT COUNT(*) AS count FROM products WHERE LOWER(category)=LOWER(?)').get(name);
  if(int(used?.count)>0) return res.status(409).json({message:'Сначала перенесите товары из этой категории'});
  const categories=readCategories();
  if(!categories.some(item=>item.toLowerCase()===name.toLowerCase())) return res.status(404).json({message:'Категория не найдена'});
  const next=categories.filter(item=>item.toLowerCase()!==name.toLowerCase());
  writeCategories(next);
  res.json({categories:next});
});

app.get('/api/products', (req,res)=>{ cleanupExpiredReservations(); const rows=db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC, id DESC').all(); res.json(rows.map(row=>publicProduct(row))); });
app.get('/api/products/:id', (req,res)=>{ cleanupExpiredReservations(); const row=db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id); if(!row) return res.status(404).json({message:'Товар не найден'}); res.json(publicProduct(row)); });
app.get('/api/admin/products', authMiddleware, requireRoles('owner','admin'), (req,res)=>res.json(db.prepare('SELECT * FROM products ORDER BY created_at DESC,id DESC').all().map(row=>publicProduct(row,true))));

function parseProductBody(body, current={}) {
  const title=text(body.title ?? current.title), description=text(body.description ?? current.description), category=text(body.category ?? current.category);
  const price=num(body.price ?? current.price, -1), stock_qty=int(body.stock_qty ?? current.stock_qty), is_child=bool(body.is_child ?? current.is_child)?1:0, active=(body.active===undefined ? int(current.active,1) : (bool(body.active)?1:0));
  const stones_json = JSON.stringify(parseProductStones(body.product_stones ?? body.stones_json ?? current.stones_json));
  if(!title || !description || !category || price<0) return {error:'Заполните название, описание, категорию и цену'};
  return {title,description,category,price,stock_qty,is_child,active,stones_json};
}
app.post('/api/products', authMiddleware, requireRoles('owner','admin'), uploadAny, (req,res)=>{
  const p=parseProductBody(req.body); if(p.error) return res.status(400).json({message:p.error});
  const files=uploaded(req,['image','images','productImage','productImages']); const images=files.map(f=>uploadUrl(req,f));
  const popular=bool(req.body.is_popular)?1:0, order=int(req.body.popular_order);
  const result=db.prepare('INSERT INTO products (title,description,category,price,image,product_images,stones_json,is_popular,popular_order,stock_qty,is_child,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(p.title,p.description,p.category,p.price,images[0]||'',JSON.stringify(images),p.stones_json,popular,order,p.stock_qty,p.is_child,p.active);
  res.status(201).json(publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid),true));
});
app.put('/api/products/:id', authMiddleware, requireRoles('owner','admin'), uploadAny, (req,res)=>{
  const current=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id); if(!current) return res.status(404).json({message:'Товар не найден'});
  const p=parseProductBody(req.body,current); if(p.error) return res.status(400).json({message:p.error});
  const old=productImages(current), fresh=uploaded(req,['image','images','productImage','productImages']).map(f=>uploadUrl(req,f));
  const replace=bool(req.body.replace_images); const images=fresh.length ? (replace?fresh:[...old,...fresh]) : old;
  if(replace) old.forEach(deleteLocalFile);
  const popular=req.body.is_popular===undefined?current.is_popular:(bool(req.body.is_popular)?1:0), order=int(req.body.popular_order ?? current.popular_order);
  if(p.stock_qty<int(current.reserved_qty)) return res.status(409).json({message:`Остаток не может быть меньше резерва (${int(current.reserved_qty)})`});
  db.prepare('UPDATE products SET title=?,description=?,category=?,price=?,image=?,product_images=?,stones_json=?,is_popular=?,popular_order=?,stock_qty=?,is_child=?,active=? WHERE id=?').run(p.title,p.description,p.category,p.price,images[0]||'',JSON.stringify([...new Set(images)]),p.stones_json,popular,order,p.stock_qty,p.is_child,p.active,req.params.id);
  res.json(publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id),true));
});
app.delete('/api/products/:id/images/:index', authMiddleware, requireRoles('owner','admin'), (req,res)=>{ const p=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id); if(!p) return res.status(404).json({message:'Товар не найден'}); const images=productImages(p); const index=int(req.params.index,-1); if(index<0||index>=images.length) return res.status(400).json({message:'Фото не найдено'}); const [removed]=images.splice(index,1); deleteLocalFile(removed); db.prepare('UPDATE products SET image=?,product_images=? WHERE id=?').run(images[0]||'',JSON.stringify(images),req.params.id); res.json(publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id),true)); });
app.delete('/api/products/:id', authMiddleware, requireRoles('owner','admin'), (req,res)=>{
  const product=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if(!product) return res.status(404).json({message:'Товар не найден'});
  if(int(product.reserved_qty)>0) return res.status(409).json({message:`Нельзя удалить товар: в резерве ${int(product.reserved_qty)} шт.`});
  productImages(product).forEach(deleteLocalFile);
  db.prepare('DELETE FROM products WHERE id=?').run(product.id);
  res.json({message:'Товар удалён'});
});
app.get('/api/popular-products', (req,res)=>res.json(db.prepare('SELECT * FROM products WHERE active=1 AND is_popular=1 ORDER BY CASE WHEN popular_order<=0 THEN 999999 ELSE popular_order END,id DESC').all().map(row=>publicProduct(row))));
app.put('/api/popular-products', authMiddleware, requireRoles('owner','admin'), (req,res)=>{ const items=Array.isArray(req.body?.items)?req.body.items:[]; const tx=db.transaction(()=>{db.prepare('UPDATE products SET is_popular=0,popular_order=0').run(); const q=db.prepare('UPDATE products SET is_popular=?,popular_order=? WHERE id=?'); items.forEach((x,i)=>q.run(bool(x.is_popular)?1:0,int(x.popular_order,i+1),int(x.id)));}); tx(); res.json({message:'Сохранено'}); });

app.get('/api/stones', (req,res)=>{ cleanupExpiredReservations(); res.json(db.prepare('SELECT * FROM stones WHERE active=1 ORDER BY created_at DESC,id DESC').all().map(row=>publicStone(row))); });
app.get('/api/admin/stones', authMiddleware, requireRoles('owner','admin','master'), (req,res)=>res.json(db.prepare('SELECT * FROM stones ORDER BY created_at DESC,id DESC').all().map(row=>publicStone(row,true))));
function parseStoneBody(body, current = {}) {
  const name = text(body.name ?? current.name);
  const description = text(body.description ?? current.description);
  const zodiac = text(body.zodiac ?? current.zodiac ?? '');
  const stone_property = text(body.stone_property ?? current.stone_property ?? '');
  const stone_shape = normalizeStoneShape(body.stone_shape ?? current.stone_shape ?? 'round');
  const price = num(body.price ?? current.price, -1);
  const size_mm = num(body.size_mm ?? current.size_mm, -1);
  const color = normalizeColor(body.color ?? current.color);
  const stock_qty = int(body.stock_qty ?? current.stock_qty);
  const active = (body.active === undefined ? int(current.active, 1) : (bool(body.active) ? 1 : 0));
  if (!name || !description || price < 0 || size_mm <= 0) return { error: 'Заполните название, описание, цену и размер' };
  return { name, description, zodiac, stone_property, stone_shape, price, size_mm, color, stock_qty, active };
}
app.post('/api/stones', authMiddleware, requireRoles('owner','admin'), uploadAny, (req,res)=>{ const s=parseStoneBody(req.body); if(s.error)return res.status(400).json({message:s.error}); const f=uploaded(req,['image','stoneImage'])[0]; const result=db.prepare('INSERT INTO stones (name,description,zodiac,stone_property,stone_shape,price,image,size_mm,color,stock_qty,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(s.name,s.description,s.zodiac,s.stone_property,s.stone_shape,s.price,uploadUrl(req,f),s.size_mm,s.color,s.stock_qty,s.active); res.status(201).json(publicStone(db.prepare('SELECT * FROM stones WHERE id=?').get(result.lastInsertRowid),true)); });
app.put('/api/stones/:id', authMiddleware, requireRoles('owner','admin'), uploadAny, (req,res)=>{
  const current=db.prepare('SELECT * FROM stones WHERE id=?').get(req.params.id);
  if(!current) return res.status(404).json({message:'Камень не найден'});
  const stone=parseStoneBody(req.body,current);
  if(stone.error) return res.status(400).json({message:stone.error});
  if(stone.stock_qty<int(current.reserved_qty)) return res.status(409).json({message:`Остаток не может быть меньше резерва (${int(current.reserved_qty)})`});
  const file=uploaded(req,['image','stoneImage'])[0];
  const image=file?uploadUrl(req,file):current.image;
  if(file) deleteLocalFile(current.image);
  db.prepare('UPDATE stones SET name=?,description=?,zodiac=?,stone_property=?,stone_shape=?,price=?,image=?,size_mm=?,color=?,stock_qty=?,active=? WHERE id=?')
    .run(stone.name,stone.description,stone.zodiac,stone.stone_property,stone.stone_shape,stone.price,image,stone.size_mm,stone.color,stone.stock_qty,stone.active,current.id);
  res.json(publicStone(db.prepare('SELECT * FROM stones WHERE id=?').get(current.id),true));
});
app.put('/api/inventory/stones/:id', authMiddleware, requireRoles('owner','admin','master'), (req,res)=>{
  const stone=db.prepare('SELECT * FROM stones WHERE id=?').get(req.params.id);
  if(!stone) return res.status(404).json({message:'Камень не найден'});
  const stock=int(req.body?.stock_qty);
  if(stock<int(stone.reserved_qty)) return res.status(409).json({message:`Остаток не может быть меньше резерва (${int(stone.reserved_qty)})`});
  db.prepare('UPDATE stones SET stock_qty=? WHERE id=?').run(stock,stone.id);
  res.json(publicStone(db.prepare('SELECT * FROM stones WHERE id=?').get(stone.id),true));
});
app.put('/api/inventory/products/:id', authMiddleware, requireRoles('owner','admin'), (req,res)=>{
  const product=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if(!product) return res.status(404).json({message:'Товар не найден'});
  const stock=int(req.body?.stock_qty);
  if(stock<int(product.reserved_qty)) return res.status(409).json({message:`Остаток не может быть меньше резерва (${int(product.reserved_qty)})`});
  db.prepare('UPDATE products SET stock_qty=? WHERE id=?').run(stock,product.id);
  res.json(publicProduct(db.prepare('SELECT * FROM products WHERE id=?').get(product.id),true));
});
app.delete('/api/stones/:id', authMiddleware, requireRoles('owner','admin'), (req,res)=>{
  const stone=db.prepare('SELECT * FROM stones WHERE id=?').get(req.params.id);
  if(!stone) return res.status(404).json({message:'Камень не найден'});
  if(int(stone.reserved_qty)>0) return res.status(409).json({message:`Нельзя удалить камень: в резерве ${int(stone.reserved_qty)} шт.`});
  deleteLocalFile(stone.image);
  db.prepare('DELETE FROM stones WHERE id=?').run(stone.id);
  res.json({message:'Камень удалён'});
});

function calculateInventory(items) {
  const products = new Map(), stones = new Map();
  for (const item of items) {
    const quantity=Math.max(1,int(item.quantity,1));
    if(item.custom && Array.isArray(item.design?.stones)) {
      for(const stone of item.design.stones) { const id=int(stone.id); if(id) stones.set(id,(stones.get(id)||0)+quantity); }
    } else { const id=int(item.id); if(id) products.set(id,(products.get(id)||0)+quantity); }
  }
  return { products:Object.fromEntries(products), stones:Object.fromEntries(stones) };
}

const ALLOWED_CLASPS = {
  'lobster-steel': { id:'lobster-steel', name:'Карабин', material:'Нержавеющая сталь', reserveMm:18 },
  'toggle-steel': { id:'toggle-steel', name:'Тоггл', material:'Нержавеющая сталь', reserveMm:24 },
  'magnetic-steel': { id:'magnetic-steel', name:'Магнитный замок', material:'Нержавеющая сталь', reserveMm:20 },
  'screw-steel': { id:'screw-steel', name:'Винтовой замок', material:'Нержавеющая сталь', reserveMm:16 },
  'hook-steel': { id:'hook-steel', name:'Замок-крючок', material:'Нержавеющая сталь', reserveMm:18 }
};

function priceOrderItems(requestItems) {
  const normalized=[];
  for(const raw of requestItems) {
    const quantity=Math.max(1,int(raw.quantity,1));
    if(raw.custom) {
      const requested=Array.isArray(raw.design?.stones)?raw.design.stones:[];
      if(!requested.length) throw new Error('В индивидуальном украшении нет бусин');
      const claspId=text(raw.design?.clasp?.id || raw.design?.clasp_type);
      const clasp=ALLOWED_CLASPS[claspId];
      if(!clasp) throw new Error('Выберите тип замка в конструкторе');
      const designType=text(raw.design?.type)||'Колье';
      if(designType!=='Колье') throw new Error('В конструкторе доступен только тип украшения «Колье»');
      const sizeCm=num(raw.design?.size_cm);
      const validSize=sizeCm>=30&&sizeCm<=50;
      if(!validSize) throw new Error('Длина колье должна быть от 30 до 50 см');
      const priced=[]; let unit=0;
      for(const requestedStone of requested) {
        const stone=db.prepare('SELECT * FROM stones WHERE id=? AND active=1').get(int(requestedStone.id));
        if(!stone) throw new Error('Один из камней больше недоступен');
        unit += num(stone.price);
        priced.push({ id:stone.id,name:stone.name,price:num(stone.price),size_mm:num(stone.size_mm),color:stone.color,image:stone.image,path_ratio:requestedStone.path_ratio??null });
      }
      const usedMm=priced.reduce((sum,stone)=>sum+num(stone.size_mm),0);
      const availableMm=sizeCm*10-clasp.reserveMm;
      if(usedMm>availableMm+0.001) throw new Error(`Бусины не помещаются на выбранную длину с замком «${clasp.name}»`);
      const compositionMap=new Map(); priced.forEach(s=>{const key=s.id;const x=compositionMap.get(key)||{id:s.id,name:s.name,count:0,size_mm:s.size_mm};x.count++;compositionMap.set(key,x);});
      const description=[...compositionMap.values()].map(x=>`${x.name} ×${x.count}`).join(', ')+`; замок: ${clasp.name}`;
      normalized.push({ id:text(raw.id)||`custom-${Date.now()}`, custom:true, title:text(raw.title)||'Индивидуальное украшение LiVetta', category:'Конструктор', description, image:text(raw.design?.preview_image||raw.image), quantity, price:unit, sum:unit*quantity, composition:[...compositionMap.values()], design:{...raw.design,type:designType,size_cm:sizeCm,clasp,clasp_type:clasp.id,used_mm:usedMm,max_mm:availableMm,stones:priced,composition:[...compositionMap.values()],stones_count:priced.length} });
    } else {
      const product=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(int(raw.id));
      if(!product) throw new Error('Один из товаров больше недоступен');
      if(product.is_child && !CHILD_PRODUCTS_ENABLED) throw new Error('Продажа детских украшений будет доступна после оформления документов о соответствии');
      normalized.push({ id:product.id,custom:false,title:product.title,category:product.category,description:product.description,product_stones:productStones(product),image:productImages(product)[0]||'',product_images:productImages(product),quantity,price:num(product.price),sum:num(product.price)*quantity });
    }
  }
  return normalized;
}

function getOrderItemsCount(items) {
  return items.reduce((sum, item) => sum + Math.max(1, int(item.quantity, 1)), 0);
}

function calculateVolumeDiscount(subtotal, itemsCount) {
  const tier = VOLUME_DISCOUNT_TIERS.find((item) => itemsCount >= item.minItems);
  if (!tier || subtotal <= 0) return { amount: 0, label: '', percent: 0 };
  return {
    amount: Math.round((subtotal * tier.percent) / 100),
    label: tier.label,
    percent: tier.percent
  };
}

function calculateGiftOptions(body) {
  const wrap = bool(body?.gift_wrap);
  const card = bool(body?.gift_card);
  const message = card ? text(body?.gift_message).slice(0, 500) : '';
  const total = (wrap ? GIFT_WRAP_PRICE : 0) + (card ? GIFT_CARD_PRICE : 0);
  const labels = [];
  if (wrap) labels.push(`Подарочная упаковка +${GIFT_WRAP_PRICE} ₽`);
  if (card) labels.push(`Открытка +${GIFT_CARD_PRICE} ₽${message ? `: ${message}` : ''}`);
  return { wrap, card, message, total, labels };
}

function requirementsAvailable(inventory) {
  for(const [id,qty] of Object.entries(inventory.products)) { const p=db.prepare('SELECT stock_qty,reserved_qty FROM products WHERE id=?').get(id); if(!p || int(p.stock_qty)-int(p.reserved_qty)<qty) return false; }
  for(const [id,qty] of Object.entries(inventory.stones)) { const s=db.prepare('SELECT stock_qty,reserved_qty FROM stones WHERE id=?').get(id); if(!s || int(s.stock_qty)-int(s.reserved_qty)<qty) return false; }
  return true;
}
function reserveInventory(inventory, sign=1) {
  for(const [id,qty] of Object.entries(inventory.products)) db.prepare('UPDATE products SET reserved_qty=MAX(0,reserved_qty+?) WHERE id=?').run(sign*qty,id);
  for(const [id,qty] of Object.entries(inventory.stones)) db.prepare('UPDATE stones SET reserved_qty=MAX(0,reserved_qty+?) WHERE id=?').run(sign*qty,id);
}
function finalizeInventory(order) {
  if(order.inventory_finalized) return;
  const inventory=safeJson(order.inventory_json,{products:{},stones:{}});
  const tx=db.transaction(()=>{
    for(const [id,qty] of Object.entries(inventory.products)) db.prepare('UPDATE products SET stock_qty=MAX(0,stock_qty-?), reserved_qty=MAX(0,reserved_qty-?), sold_qty=sold_qty+? WHERE id=?').run(qty,qty,qty,id);
    for(const [id,qty] of Object.entries(inventory.stones)) db.prepare('UPDATE stones SET stock_qty=MAX(0,stock_qty-?), reserved_qty=MAX(0,reserved_qty-?), sold_qty=sold_qty+? WHERE id=?').run(qty,qty,qty,id);
    db.prepare('UPDATE orders SET inventory_finalized=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(order.id);
  }); tx();
}
function releaseOrderReservation(order) {
  if(order.inventory_finalized || !order.reserved_until) return;
  const inventory=safeJson(order.inventory_json,{products:{},stones:{}});
  const tx=db.transaction(()=>{ reserveInventory(inventory,-1); db.prepare("UPDATE orders SET reserved_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id); }); tx();
}
function cleanupExpiredReservations() {
  const rows=db.prepare("SELECT * FROM orders WHERE inventory_finalized=0 AND reserved_until IS NOT NULL AND reserved_until < ? AND payment_status!='succeeded' AND status NOT IN ('cancelled','delivered')").all(nowIso());
  rows.forEach(order=>{ releaseOrderReservation(order); db.prepare("UPDATE orders SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id); addHistory(order.id,'reservation_expired','Резерв товаров истёк'); });
}

let cdekTokenCache={token:'',expires:0};
async function getCdekToken() {
  if(!CDEK_CLIENT_ID||!CDEK_CLIENT_SECRET) return '';
  if(cdekTokenCache.token && Date.now()<cdekTokenCache.expires) return cdekTokenCache.token;
  const params=new URLSearchParams({grant_type:'client_credentials',client_id:CDEK_CLIENT_ID,client_secret:CDEK_CLIENT_SECRET});
  const response=await fetch(`https://api.cdek.ru/v2/oauth/token?${params}`,{method:'POST'});
  if(!response.ok) throw new Error('Не удалось подключиться к СДЭК');
  const data=await response.json(); cdekTokenCache={token:data.access_token,expires:Date.now()+(Number(data.expires_in||3600)-60)*1000}; return data.access_token;
}
async function quoteCdek({postal_code,country_code='RU'}) {
  const token=await getCdekToken(); if(!token) return null;
  const response=await fetch('https://api.cdek.ru/v2/calculator/tarifflist',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({type:1,currency:1,lang:'rus',from_location:{postal_code:CDEK_FROM_POSTAL_CODE,country_code:'RU'},to_location:{postal_code,country_code},packages:[{weight:300,length:20,width:15,height:5}]})});
  if(!response.ok) throw new Error('СДЭК не смог рассчитать доставку');
  const data=await response.json(); const tariffs=Array.isArray(data.tariff_codes)?data.tariff_codes.filter(x=>Number.isFinite(Number(x.delivery_sum))):[]; tariffs.sort((a,b)=>a.delivery_sum-b.delivery_sum); if(!tariffs[0]) return null;
  return {cost:Number(tariffs[0].delivery_sum),days_min:tariffs[0].period_min,days_max:tariffs[0].period_max,tariff_code:tariffs[0].tariff_code,tariff_name:tariffs[0].tariff_name};
}
async function calculateShipping(body, subtotal) {
  const country=text(body.country)||'Россия', city=text(body.city), method=text(body.delivery_method)||'spb_courier', withinKad=bool(body.within_kad);
  if(subtotal>=FREE_SHIPPING_MIN && /россия/i.test(country)) return {resolved:true,cost:0,label:'Бесплатная доставка от 10 000 ₽'};
  if(method==='spb_courier' && /санкт[- ]?петербург|спб/i.test(city) && withinKad) return {resolved:true,cost:700,label:'Курьер LiVetta в пределах КАД'};
  if(method==='cdek') {
    const postal=text(body.postal_code); if(!postal) return {resolved:false,cost:0,label:'Для расчёта СДЭК нужен индекс'};
    const countryCodes={Россия:'RU',Казахстан:'KZ',Беларусь:'BY'};
    const countryCode=text(body.country_code)||countryCodes[country];
    if(!countryCode) return {resolved:false,cost:0,label:'Для этой страны стоимость доставки подтверждается вручную'};
    try { const quote=await quoteCdek({postal_code:postal,country_code:countryCode}); if(quote) return {resolved:true,cost:quote.cost,label:`СДЭК: ${quote.tariff_name}`,meta:quote}; } catch(error) { return {resolved:false,cost:0,label:error.message}; }
    return {resolved:false,cost:0,label:'Добавьте ключи СДЭК в .env или согласуйте доставку вручную'};
  }
  if(method==='russian_post') return {resolved:false,cost:0,label:'Стоимость Почты России подтверждается после проверки адреса'};
  return {resolved:false,cost:0,label:'Стоимость доставки рассчитывается индивидуально'};
}
app.post('/api/shipping/quote', async (req,res)=>{ try { const subtotal=num(req.body?.subtotal); const quote=await calculateShipping(req.body,subtotal); res.json(quote); } catch(error) { res.status(400).json({message:error.message}); } });

function orderResponse(order, includePrivate=true) {
  const items=safeJson(order.items_json,[]), history=includePrivate?db.prepare('SELECT * FROM order_history WHERE order_id=? ORDER BY id DESC').all(order.id):[];
  const data={id:order.id,public_token:order.public_token,customer_name:order.customer_name,customer_phone:order.customer_phone,customer_telegram:order.customer_telegram,customer_email:order.customer_email,country:order.country,city:order.city,postal_code:order.postal_code,address:order.address,delivery_method:order.delivery_method,delivery_comment:order.delivery_comment,shipping_cost:order.shipping_cost,shipping_resolved:Boolean(order.shipping_resolved),payment_method:order.payment_method,payment_status:order.payment_status,payment_url:order.payment_url,receipt_url:order.receipt_url,receipt_sent_at:order.receipt_sent_at,tracking_number:order.tracking_number,customer_comment:order.customer_comment,items,subtotal:order.subtotal,discount_total:order.discount_total||0,promo_label:order.promo_label||'',total:order.total,status:order.status,reserved_until:order.reserved_until,created_at:order.created_at,updated_at:order.updated_at};
  if(includePrivate){data.admin_note=order.admin_note;data.history=history;data.marketing_consent=Boolean(order.marketing_consent);} else {delete data.customer_phone;delete data.customer_telegram;delete data.customer_email;delete data.address;}
  return data;
}

async function createYooPayment(order) {
  if(!YOOKASSA_SHOP_ID||!YOOKASSA_SECRET_KEY) {
    if(PAYMENT_DEMO_MODE && NODE_ENV!=='production') {
      const url=`${SITE_URL}/payment-success.html?order=${order.id}&token=${order.public_token}&demo=1`;
      db.prepare("UPDATE orders SET payment_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(url,order.id); return url;
    }
    throw new Error('ЮKassa ещё не подключена. Добавьте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env');
  }
  const idempotence=randomToken(16);
  const response=await fetch('https://api.yookassa.ru/v3/payments',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64')}`,'Idempotence-Key':idempotence,'Content-Type':'application/json'},body:JSON.stringify({amount:{value:Number(order.total).toFixed(2),currency:'RUB'},confirmation:{type:'redirect',return_url:`${SITE_URL}/payment-success.html?order=${order.id}&token=${order.public_token}`},capture:true,description:`Заказ LiVetta №${order.id}`,metadata:{order_id:String(order.id),public_token:order.public_token}})});
  const data=await response.json(); if(!response.ok) throw new Error(data.description||'Не удалось создать платёж ЮKassa');
  const url=data.confirmation?.confirmation_url||'';
  db.prepare("UPDATE orders SET payment_id=?,payment_status=?,payment_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(data.id,data.status||'pending',url,order.id);
  addHistory(order.id,'payment_created',`Платёж ${data.id} создан`);
  return url;
}
async function fetchYooPayment(paymentId) {
  const response=await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Basic ${Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64')}`}});
  const data=await response.json(); if(!response.ok) throw new Error('Не удалось проверить платёж'); return data;
}
function markPaid(order,paymentId,actor='system',details='Оплата подтверждена') {
  let current=db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
  if(!current || (current.payment_status==='succeeded' && int(current.inventory_finalized)===1)) return current;
  if(!current.inventory_finalized && !current.reserved_until) {
    const inventory=safeJson(current.inventory_json,{products:{},stones:{}});
    if(!requirementsAvailable(inventory)) throw new Error('Нельзя отметить заказ оплаченным: части товаров или камней уже нет на складе');
    reserveInventory(inventory,1);
    db.prepare('UPDATE orders SET reserved_until=? WHERE id=?').run(plusMinutes(RESERVATION_MINUTES),current.id);
    current=db.prepare('SELECT * FROM orders WHERE id=?').get(current.id);
  }
  finalizeInventory(current);
  db.prepare("UPDATE orders SET payment_id=?,payment_status='succeeded',status='paid',reserved_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(paymentId||current.payment_id||`manual-${Date.now()}`,current.id);
  addHistory(current.id,'payment_succeeded',details,actor);
  sendOrderEmail(current.id,'Оплачен новый заказ LiVetta');
  scheduleOrdersExcelSync();
  return db.prepare('SELECT * FROM orders WHERE id=?').get(current.id);
}

app.post('/api/orders', orderRateLimit, async (req,res)=>{
  cleanupExpiredReservations();
  try {
    if(!bool(req.body?.legal_consent)) return res.status(400).json({message:'Необходимо принять оферту и согласие на обработку данных'});
    const customer_name=text(req.body.customer_name), customer_phone=text(req.body.customer_phone), customer_email=text(req.body.customer_email);
    if(!customer_name||!customer_phone||!customer_email) return res.status(400).json({message:'Укажите имя, телефон и email'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) return res.status(400).json({message:'Проверьте правильность email'});
    if(customer_phone.replace(/\D/g,'').length < 10) return res.status(400).json({message:'Проверьте номер телефона'});
    const rawItems=Array.isArray(req.body?.items)?req.body.items:[]; if(!rawItems.length)return res.status(400).json({message:'Корзина пустая'});
    const items=priceOrderItems(rawItems), subtotal=items.reduce((s,x)=>s+x.sum,0), itemsCount=getOrderItemsCount(items), discount=calculateVolumeDiscount(subtotal,itemsCount), gift=calculateGiftOptions(req.body), shipping=await calculateShipping(req.body,subtotal), total=Math.max(0,subtotal-discount.amount)+gift.total+shipping.cost;
    const payment_method=text(req.body.payment_method)||'online';
    if(['cash_on_delivery','sbp_on_delivery'].includes(payment_method) && !(text(req.body.delivery_method)==='spb_courier' && bool(req.body.within_kad))) return res.status(400).json({message:'Оплата при получении доступна только для доставки LiVetta в пределах КАД'});
    const inventory=calculateInventory(items); if(!requirementsAvailable(inventory)) return res.status(409).json({message:'Некоторых товаров или бусин уже недостаточно на складе'});
    const token=randomToken(); const reservedUntil=plusMinutes(!shipping.resolved ? 1440 : (payment_method==='online'?RESERVATION_MINUTES:1440));
    const initialStatus=!shipping.resolved?'awaiting_shipping_quote':(payment_method==='online'?'awaiting_payment':'new');
    const customerComment=[text(req.body.customer_comment), ...gift.labels].filter(Boolean).join('\n');
    const insert=db.transaction(()=>{
      reserveInventory(inventory,1);
      const result=db.prepare(`INSERT INTO orders (public_token,customer_name,customer_phone,customer_telegram,customer_email,country,city,postal_code,address,delivery_method,delivery_comment,shipping_cost,shipping_resolved,payment_method,payment_status,customer_comment,legal_consent,marketing_consent,items_json,inventory_json,subtotal,discount_total,promo_label,total,status,reserved_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(token,customer_name,customer_phone,text(req.body.customer_telegram),customer_email,text(req.body.country)||'Россия',text(req.body.city),text(req.body.postal_code),text(req.body.address),text(req.body.delivery_method),text(req.body.delivery_comment),shipping.cost,shipping.resolved?1:0,payment_method,'pending',customerComment,1,bool(req.body.marketing_consent)?1:0,JSON.stringify(items),JSON.stringify(inventory),subtotal+gift.total,discount.amount,discount.label,total,initialStatus,reservedUntil);
      addHistory(result.lastInsertRowid,'order_created','Заказ создан','customer'); return result.lastInsertRowid;
    });
    const id=insert(); let order=db.prepare('SELECT * FROM orders WHERE id=?').get(id); let payment_url='';
    if(payment_method==='online' && shipping.resolved) { try { payment_url=await createYooPayment(order); } catch(error) { addHistory(id,'payment_error',error.message); } }
    order=db.prepare('SELECT * FROM orders WHERE id=?').get(id); sendOrderEmail(id,'Новый заказ LiVetta'); scheduleOrdersExcelSync();
    res.status(201).json({message:shipping.resolved?'Заказ создан':'Заказ создан. Доставка требует подтверждения',order:orderResponse(order,false),payment_url,payment_error:payment_method==='online'&&shipping.resolved&&!payment_url?'Платёжный модуль ещё не настроен':''});
  } catch(error) { res.status(400).json({message:error.message||'Не удалось оформить заказ'}); }
});
app.get('/api/orders/public/:id', (req,res)=>{ const order=db.prepare('SELECT * FROM orders WHERE id=? AND public_token=?').get(req.params.id,text(req.query.token)); if(!order)return res.status(404).json({message:'Заказ не найден'}); res.json(orderResponse(order,false)); });
app.post('/api/orders/:id/pay', async (req,res)=>{ const order=db.prepare('SELECT * FROM orders WHERE id=? AND public_token=?').get(req.params.id,text(req.body?.token)); if(!order)return res.status(404).json({message:'Заказ не найден'}); if(!order.shipping_resolved)return res.status(409).json({message:'Сначала нужно подтвердить стоимость доставки'}); try { const url=await createYooPayment(order); res.json({payment_url:url}); } catch(error){res.status(400).json({message:error.message});} });
app.post('/api/payments/yookassa/webhook', async (req,res)=>{
  try {
    const paymentId=text(req.body?.object?.id);
    if(!paymentId) return res.status(400).end();
    const payment=await fetchYooPayment(paymentId);
    const order=db.prepare('SELECT * FROM orders WHERE payment_id=? OR id=?').get(paymentId,int(payment.metadata?.order_id));
    if(!order) return res.status(404).end();
    const paidAmount=Number(payment.amount?.value||0);
    if(payment.amount?.currency!=='RUB' || Math.abs(paidAmount-Number(order.total))>0.01) return res.status(400).end();
    if(payment.status==='succeeded' && payment.paid) {
      markPaid(order,payment.id);
    } else if(payment.status==='canceled') {
      const fresh=db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      if(!fresh.inventory_finalized) releaseOrderReservation(fresh);
      db.prepare("UPDATE orders SET payment_status='canceled',status='cancelled',reserved_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
      addHistory(order.id,'payment_cancelled','Платёж отменён');
    } else {
      db.prepare('UPDATE orders SET payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(text(payment.status)||'pending',order.id);
    }
    res.status(200).end();
  } catch(error) {
    console.error(error);
    res.status(500).end();
  }
});
app.post('/api/demo/pay/:id', (req,res)=>{ if(NODE_ENV==='production'||!PAYMENT_DEMO_MODE)return res.status(404).end(); const order=db.prepare('SELECT * FROM orders WHERE id=? AND public_token=?').get(req.params.id,text(req.body?.token)); if(!order)return res.status(404).json({message:'Заказ не найден'}); markPaid(order,'demo'); res.json({ok:true}); });

app.get('/api/orders', authMiddleware, requireRoles('owner','admin'), (req,res)=>{ cleanupExpiredReservations(); res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(x=>orderResponse(x,true))); });
const allowedStatuses=new Set(['new','awaiting_payment','awaiting_shipping_quote','paid','work','ready','shipped','delivered','cancelled','refund','expired']);
app.put('/api/orders/:id/status', authMiddleware, requireRoles('owner','admin'), (req,res)=>{
  cleanupExpiredReservations();
  const status=text(req.body?.status);
  if(!allowedStatuses.has(status)) return res.status(400).json({message:'Некорректный статус'});
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if(!order) return res.status(404).json({message:'Заказ не найден'});
  try {
    if(status==='paid') {
      const paid=markPaid(order,order.payment_id||`manual-${Date.now()}`,req.admin.login,'Оплата подтверждена вручную в панели управления');
      return res.json(orderResponse(paid,true));
    }
    if(status==='cancelled'&&order.payment_status!=='succeeded') releaseOrderReservation(order);
    db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,order.id);
    addHistory(order.id,'status_changed',`Статус: ${status}`,req.admin.login);
    scheduleOrdersExcelSync();
    res.json(orderResponse(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id),true));
  } catch(error) { res.status(409).json({message:error.message}); }
});
app.put('/api/orders/:id/details', authMiddleware, requireRoles('owner','admin'), async (req,res)=>{ const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); if(!order)return res.status(404).json({message:'Заказ не найден'}); const tracking=text(req.body.tracking_number), receipt=text(req.body.receipt_url), receiptSent=bool(req.body.receipt_sent); db.prepare('UPDATE orders SET admin_note=?,tracking_number=?,receipt_url=?,receipt_sent_at=CASE WHEN ? THEN COALESCE(receipt_sent_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(text(req.body.admin_note),tracking,receipt,receiptSent?1:0,order.id); addHistory(order.id,'details_updated','Обновлены данные заказа',req.admin.login); if(receiptSent&&receipt&&!order.receipt_sent_at)await sendCustomerEmail(order.id,'Чек по заказу LiVetta',`<p>Чек по заказу №${order.id}: <a href="${receipt}">открыть чек</a>.</p>`); if(tracking&&tracking!==order.tracking_number)await sendCustomerEmail(order.id,'Заказ LiVetta передан в доставку',`<p>Трек-номер заказа №${order.id}: <b>${tracking}</b>.</p>`); scheduleOrdersExcelSync(); res.json(orderResponse(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id),true)); });
app.put('/api/orders/:id/shipping', authMiddleware, requireRoles('owner','admin'), async (req,res)=>{
  const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if(!order) return res.status(404).json({message:'Заказ не найден'});
  if(order.payment_status==='succeeded') return res.status(409).json({message:'Нельзя менять стоимость уже оплаченного заказа'});
  const cost=Math.max(0,num(req.body.shipping_cost));
  const total=Math.max(0,num(order.subtotal)-num(order.discount_total))+cost;
  const resettable=new Set(['awaiting_shipping_quote','awaiting_payment','new']);
  const nextStatus=resettable.has(order.status) ? (order.payment_method==='online'?'awaiting_payment':'new') : order.status;
  db.prepare('UPDATE orders SET shipping_cost=?,shipping_resolved=1,total=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(cost,total,nextStatus,order.id);
  addHistory(order.id,'shipping_confirmed',`Доставка: ${cost} ₽`,req.admin.login);
  scheduleOrdersExcelSync();
  res.json(orderResponse(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id),true));
});
app.post('/api/orders/:id/payment-link', authMiddleware, requireRoles('owner','admin'), async (req,res)=>{ const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); if(!order)return res.status(404).json({message:'Заказ не найден'}); if(order.payment_status==='succeeded')return res.status(409).json({message:'Заказ уже оплачен'}); if(!order.shipping_resolved)return res.status(409).json({message:'Сначала подтвердите стоимость доставки'}); try{const payment_url=await createYooPayment(order); await sendCustomerEmail(order.id,'Ссылка на оплату заказа LiVetta',`Оплатить заказ можно по ссылке: <a href="${payment_url}">перейти к оплате</a>`);res.json({payment_url});}catch(error){res.status(400).json({message:error.message});} });
app.delete('/api/orders/:id', authMiddleware, requireRoles('owner'), (req,res)=>{ const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); if(!order)return res.status(404).json({message:'Заказ не найден'}); if(!order.inventory_finalized)releaseOrderReservation(order); db.prepare('DELETE FROM orders WHERE id=?').run(order.id); scheduleOrdersExcelSync(); res.json({message:'Заказ удалён'}); });
const ORDER_STATUS_LABELS={new:'Новый',awaiting_payment:'Ожидает оплаты',awaiting_shipping_quote:'Расчёт доставки',paid:'Оплачен',work:'В работе',ready:'Готов',shipped:'Передан в доставку',delivered:'Доставлен',cancelled:'Отменён',refund:'Возврат',expired:'Резерв истёк'};
const ORDER_STATUS_BY_LABEL=Object.fromEntries(Object.entries(ORDER_STATUS_LABELS).flatMap(([code,label])=>[[code,code],[label.toLowerCase(),code]]));
let excelSyncTimer=null;
let excelSyncPromise=Promise.resolve();

function getExcelOrders(){return db.prepare('SELECT * FROM orders ORDER BY id DESC').all();}
function orderItemsText(order){return safeJson(order.items_json,[]).map(item=>`${item.title||'Украшение'} ×${int(item.quantity,1)}${item.design?.clasp?.name?` · замок ${item.design.clasp.name}`:''}`).join('; ');}
async function buildOrdersWorkbook(){
  const workbook=new ExcelJS.Workbook(); workbook.creator='LiVetta'; workbook.modified=new Date();
  const sheet=workbook.addWorksheet('Заказы',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[
    {header:'ID',key:'id',width:9},{header:'Дата',key:'created_at',width:21},{header:'Статус',key:'status',width:23},{header:'Статус оплаты',key:'payment_status',width:18},
    {header:'Имя',key:'customer_name',width:24},{header:'Телефон',key:'customer_phone',width:18},{header:'Email',key:'customer_email',width:28},{header:'Telegram',key:'customer_telegram',width:20},
    {header:'Страна',key:'country',width:16},{header:'Город',key:'city',width:18},{header:'Индекс',key:'postal_code',width:12},{header:'Адрес',key:'address',width:34},
    {header:'Доставка',key:'delivery_method',width:22},{header:'Стоимость доставки',key:'shipping_cost',width:20},{header:'Сумма заказа',key:'total',width:17},{header:'Трек-номер',key:'tracking_number',width:22},
    {header:'Служебный комментарий',key:'admin_note',width:34},{header:'Ссылка на чек',key:'receipt_url',width:34},{header:'Чек отправлен',key:'receipt_sent',width:16},{header:'Состав заказа',key:'items',width:55}
  ];
  for(const order of getExcelOrders()) sheet.addRow({id:order.id,created_at:order.created_at,status:ORDER_STATUS_LABELS[order.status]||order.status,payment_status:order.payment_status,customer_name:order.customer_name,customer_phone:order.customer_phone,customer_email:order.customer_email,customer_telegram:order.customer_telegram,country:order.country,city:order.city,postal_code:order.postal_code,address:order.address,delivery_method:order.delivery_method,shipping_cost:Number(order.shipping_cost||0),total:Number(order.total||0),tracking_number:order.tracking_number,admin_note:order.admin_note,receipt_url:order.receipt_url,receipt_sent:order.receipt_sent_at?'Да':'Нет',items:orderItemsText(order)});
  const header=sheet.getRow(1); header.height=28; header.font={bold:true,color:{argb:'FFFFFFFF'}}; header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEE9AC5'}}; header.alignment={vertical:'middle',horizontal:'center'};
  sheet.autoFilter={from:'A1',to:'T1'};
  sheet.eachRow((row,index)=>{if(index>1){row.alignment={vertical:'top',wrapText:true}; if(index%2===0) row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF7FB'}}; row.height=34;}});
  for(let row=2;row<=sheet.rowCount;row++) sheet.getCell(`C${row}`).dataValidation={type:'list',allowBlank:false,formulae:['"Новый,Ожидает оплаты,Расчёт доставки,Оплачен,В работе,Готов,Передан в доставку,Доставлен,Отменён,Возврат,Резерв истёк"']};
  sheet.getColumn('shipping_cost').numFmt='#,##0.00 ₽'; sheet.getColumn('total').numFmt='#,##0.00 ₽';
  const itemsSheet=workbook.addWorksheet('Состав',{views:[{state:'frozen',ySplit:1}]}); itemsSheet.columns=[{header:'ID заказа',key:'order_id',width:12},{header:'Украшение',key:'title',width:30},{header:'Количество',key:'quantity',width:12},{header:'Цена',key:'price',width:14},{header:'Тип',key:'type',width:16},{header:'Размер, см',key:'size',width:13},{header:'Замок',key:'clasp',width:28},{header:'Состав',key:'composition',width:55}];
  for(const order of getExcelOrders()) for(const item of safeJson(order.items_json,[])) itemsSheet.addRow({order_id:order.id,title:item.title,quantity:int(item.quantity,1),price:num(item.price),type:item.design?.type||item.category,size:item.design?.size_cm||'',clasp:item.design?.clasp?.name||'',composition:(item.composition||[]).map(x=>`${x.name} ×${x.count}`).join(', ')});
  const h2=itemsSheet.getRow(1); h2.font={bold:true,color:{argb:'FFFFFFFF'}}; h2.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB88ADF'}}; h2.alignment={vertical:'middle',horizontal:'center'}; itemsSheet.autoFilter={from:'A1',to:'H1'}; itemsSheet.eachRow((row,index)=>{if(index>1)row.alignment={vertical:'top',wrapText:true};});
  return workbook;
}
async function writeOrdersExcelFile(){
  const workbook=await buildOrdersWorkbook(); fs.mkdirSync(path.dirname(ORDERS_EXCEL_PATH),{recursive:true});
  const temp=`${ORDERS_EXCEL_PATH}.tmp-${process.pid}`; await workbook.xlsx.writeFile(temp);
  try{fs.renameSync(temp,ORDERS_EXCEL_PATH);}catch(error){try{fs.copyFileSync(temp,ORDERS_EXCEL_PATH);fs.unlinkSync(temp);}catch{throw new Error('Excel-файл занят. Закройте его в Excel и повторите синхронизацию.');}}
  return ORDERS_EXCEL_PATH;
}
function scheduleOrdersExcelSync(){clearTimeout(excelSyncTimer);excelSyncTimer=setTimeout(()=>{excelSyncPromise=excelSyncPromise.then(()=>writeOrdersExcelFile()).catch(error=>console.warn('Excel заказов не обновлён:',error.message));},250);}

app.get('/api/orders-export.xlsx',authMiddleware,requireRoles('owner','admin'),async(req,res)=>{try{const workbook=await buildOrdersWorkbook();res.setHeader('Content-Disposition','attachment; filename=livetta-orders.xlsx');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');await workbook.xlsx.write(res);res.end();}catch(error){res.status(500).json({message:error.message});}});
app.post('/api/orders-excel/sync',authMiddleware,requireRoles('owner','admin'),async(req,res)=>{try{const target=await writeOrdersExcelFile();res.json({message:'Excel-файл заказов обновлён',file:target});}catch(error){res.status(409).json({message:error.message});}});
const excelUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024},fileFilter(req,file,cb){if(!/\.xlsx$/i.test(file.originalname||''))return cb(new Error('Выберите файл .xlsx'));cb(null,true);}});
app.post('/api/orders-import.xlsx',authMiddleware,requireRoles('owner','admin'),excelUpload.single('file'),async(req,res)=>{
  try {
    if(!req.file) return res.status(400).json({message:'Excel-файл не выбран'});
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet=workbook.getWorksheet('Заказы')||workbook.worksheets[0];
    if(!sheet) return res.status(400).json({message:'Лист «Заказы» не найден'});

    const headers={};
    sheet.getRow(1).eachCell((cell,col)=>{headers[String(cell.value||'').trim()]=col;});
    if(!headers.ID||!headers['Статус']) return res.status(400).json({message:'В файле нет обязательных колонок ID и Статус'});

    let updated=0;
    const errors=[];
    const tx=db.transaction(()=>{
      for(let rowIndex=2;rowIndex<=sheet.rowCount;rowIndex++){
        const row=sheet.getRow(rowIndex);
        const id=int(row.getCell(headers.ID).value);
        if(!id) continue;

        let order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if(!order){errors.push(`Строка ${rowIndex}: заказ ${id} не найден`);continue;}

        const statusValue=text(row.getCell(headers['Статус']).text).toLowerCase();
        const status=ORDER_STATUS_BY_LABEL[statusValue]||statusValue;
        if(!allowedStatuses.has(status)){errors.push(`Строка ${rowIndex}: неизвестный статус`);continue;}

        const shipping=headers['Стоимость доставки']?Math.max(0,num(row.getCell(headers['Стоимость доставки']).value,order.shipping_cost)):num(order.shipping_cost);
        const tracking=headers['Трек-номер']?text(row.getCell(headers['Трек-номер']).text):order.tracking_number;
        const noteHeader=headers['Служебный комментарий'];
        const note=noteHeader?text(row.getCell(noteHeader).text):order.admin_note;
        const receipt=headers['Ссылка на чек']?text(row.getCell(headers['Ссылка на чек']).text):order.receipt_url;
        const receiptSent=headers['Чек отправлен']?/^(да|yes|true|1)$/i.test(text(row.getCell(headers['Чек отправлен']).text)):Boolean(order.receipt_sent_at);

    if(order.payment_status!=='succeeded'&&shipping!==Number(order.shipping_cost)){
      db.prepare('UPDATE orders SET shipping_cost=?,shipping_resolved=1,total=MAX(0,subtotal-COALESCE(discount_total,0))+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(shipping,shipping,id);
        }
        db.prepare('UPDATE orders SET tracking_number=?,admin_note=?,receipt_url=?,receipt_sent_at=CASE WHEN ? THEN COALESCE(receipt_sent_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(tracking,note,receipt,receiptSent?1:0,id);

        order=db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if(status==='paid'){
          markPaid(order,order.payment_id||`excel-${Date.now()}`,req.admin.login,'Оплата подтверждена через импорт Excel');
        } else {
          if(status==='cancelled'&&order.payment_status!=='succeeded') releaseOrderReservation(order);
          db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,id);
          addHistory(id,'excel_import','Заказ обновлён из Excel',req.admin.login);
        }
        updated++;
      }
    });
    tx();
    scheduleOrdersExcelSync();
    res.json({message:`Обновлено заказов: ${updated}${errors.length?`. Ошибок: ${errors.length}`:''}`,updated,errors});
  } catch(error) {
    res.status(400).json({message:error.message});
  }
});

app.get('/api/orders-export.csv', authMiddleware, requireRoles('owner','admin'), (req,res)=>{ const orders=getExcelOrders(); const q=v=>`"${String(v??'').replaceAll('"','""')}"`; const lines=[['ID','Дата','Статус','Оплата','Имя','Телефон','Email','Город','Адрес','Сумма','Доставка','Трек'].map(q).join(';')]; orders.forEach(o=>lines.push([o.id,o.created_at,o.status,o.payment_status,o.customer_name,o.customer_phone,o.customer_email,o.city,o.address,o.total,o.shipping_cost,o.tracking_number].map(q).join(';'))); res.setHeader('Content-Disposition','attachment; filename=livetta-orders.csv');res.type('text/csv; charset=utf-8').send('\ufeff'+lines.join('\n')); });

app.get('/api/users' , authMiddleware, requireRoles('owner'), (req,res)=>res.json(db.prepare('SELECT id,login,role,active,created_at FROM users ORDER BY id').all()));
app.post('/api/users', authMiddleware, requireRoles('owner'), (req,res)=>{ const login=text(req.body.login),password=String(req.body.password||''),role=text(req.body.role); if(!login||password.length<8||!['owner','admin','master'].includes(role))return res.status(400).json({message:'Укажите логин, роль и пароль не короче 8 символов'}); try{const r=db.prepare('INSERT INTO users (login,password_hash,role) VALUES (?,?,?)').run(login,hashPassword(password),role);res.status(201).json({id:r.lastInsertRowid,login,role});}catch{return res.status(409).json({message:'Такой логин уже существует'});} });
app.put('/api/users/:id', authMiddleware, requireRoles('owner'), (req,res)=>{
  const current=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if(!current) return res.status(404).json({message:'Пользователь не найден'});
  const role=['owner','admin','master'].includes(text(req.body.role))?text(req.body.role):current.role;
  const active=req.body.active===undefined?current.active:(bool(req.body.active)?1:0);
  const password=String(req.body.password||'');
  if(password && password.length<8) return res.status(400).json({message:'Новый пароль должен быть не короче 8 символов'});
  if(current.role==='owner' && current.active && (role!=='owner' || !active)) {
    const owners=db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND active=1").get();
    if(int(owners?.count)<=1) return res.status(409).json({message:'Нельзя отключить или понизить последнего активного владельца'});
  }
  if(password) db.prepare('UPDATE users SET role=?,active=?,password_hash=? WHERE id=?').run(role,active,hashPassword(password),current.id);
  else db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(role,active,current.id);
  res.json({ok:true});
});
app.delete('/api/users/:id',authMiddleware,requireRoles('owner'),(req,res)=>{
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if(!user)return res.status(404).json({message:'Пользователь не найден'});
  if(int(user.id)===int(req.admin.id))return res.status(409).json({message:'Нельзя удалить пользователя, под которым вы сейчас вошли'});
  if(user.role==='owner'&&user.active){const owners=db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND active=1").get();if(int(owners?.count)<=1)return res.status(409).json({message:'В системе должен остаться минимум один активный владелец'});}
  db.prepare('DELETE FROM users WHERE id=?').run(user.id);res.json({message:'Пользователь удалён'});
});

const carouselFile=path.join(dataDir,'carousel.json');
function readCarousel(){try{const d=safeJson(fs.readFileSync(carouselFile,'utf8'),{});return Array.isArray(d)?d:(Array.isArray(d.slides)?d.slides:[]);}catch{return[{id:'default-1',image:''},{id:'default-2',image:''}];}}
function writeCarousel(slides){fs.writeFileSync(carouselFile,JSON.stringify({slides},null,2));}
app.get('/api/carousel',(req,res)=>res.json({slides:readCarousel()}));
app.post('/api/carousel',authMiddleware,requireRoles('owner','admin'),upload.array('slides',50),(req,res)=>{const slides=[...readCarousel(),...(req.files||[]).map(f=>({id:`slide-${Date.now()}-${randomToken(4)}`,image:`/uploads/${f.filename}`}))];writeCarousel(slides);res.json({slides});});
app.put('/api/carousel/order',authMiddleware,requireRoles('owner','admin'),(req,res)=>{const ids=Array.isArray(req.body?.orderedIds)?req.body.orderedIds.map(String):[];const old=readCarousel(),map=new Map(old.map(x=>[String(x.id),x]));const slides=[...ids.map(id=>map.get(id)).filter(Boolean),...old.filter(x=>!ids.includes(String(x.id)))];writeCarousel(slides);res.json({slides});});
app.delete('/api/carousel/:id',authMiddleware,requireRoles('owner','admin'),(req,res)=>{const old=readCarousel(),target=old.find(x=>String(x.id)===String(req.params.id)),slides=old.filter(x=>String(x.id)!==String(req.params.id));if(!target)return res.status(404).json({message:'Слайд не найден'});writeCarousel(slides);if(String(target.image).startsWith('/uploads/'))deleteLocalFile(target.image);res.json({slides});});

app.get('/api/health',(req,res)=>res.json({ok:true,time:new Date().toISOString()}));
app.get('/api/public-config',(req,res)=>res.json({site_url:SITE_URL,metrika_id:YANDEX_METRIKA_ID,child_products_enabled:CHILD_PRODUCTS_ENABLED,free_shipping_min:FREE_SHIPPING_MIN,volume_discount_tiers:VOLUME_DISCOUNT_TIERS,gift_wrap_price:GIFT_WRAP_PRICE,gift_card_price:GIFT_CARD_PRICE,telegram:'https://t.me/livettastore',seller_email:SELLER_EMAIL,seller_phone:SELLER_PHONE}));

function getMailer(){ if(!nodemailer||!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD)return null; return nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:String(process.env.SMTP_SECURE||'true')==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}); }
async function sendCustomerEmail(orderId, subject, content='') { const transporter=getMailer(); if(!transporter)return; try{const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);if(!order?.customer_email)return;await transporter.sendMail({from:process.env.SMTP_FROM||SELLER_EMAIL,to:order.customer_email,subject,html:`<h2>LiVetta · заказ №${order.id}</h2><p>Здравствуйте, ${order.customer_name||''}!</p>${content||`<p>Ваш заказ сохранён. Сумма: ${order.total} ₽.</p>`}<p>По вопросам: ${SELLER_PHONE}, ${SELLER_EMAIL}</p>`});}catch(error){console.warn('Письмо покупателю не отправлено:',error.message);} }
async function sendOrderEmail(orderId, subject) {
  const transporter=getMailer(); if(!transporter)return;
  try{const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);await transporter.sendMail({from:process.env.SMTP_FROM||SELLER_EMAIL,to:SELLER_EMAIL,subject,html:`<h2>Заказ №${order.id}</h2><p>${order.customer_name}, ${order.customer_phone}</p><p>Сумма: ${order.total} ₽</p><p><a href="${SITE_URL}/admin.html">Открыть панель заказов</a></p>`});await sendCustomerEmail(orderId,`LiVetta: заказ №${order.id}`,order.payment_status==='succeeded'?'<p>Оплата подтверждена. Мы приступаем к подготовке украшения.</p>':'<p>Заказ получен. Мы сообщим о следующих шагах.</p>');}catch(error){console.warn('Email не отправлен:',error.message);}
}

app.post('/api/admin/backup',authMiddleware,requireRoles('owner'),(req,res)=>{const stamp=new Date().toISOString().replace(/[:.]/g,'-');const target=path.join(backupsDir,`database-${stamp}.sqlite`);db.backup(target).then(()=>res.json({message:'Резервная копия создана',file:path.basename(target)})).catch(error=>res.status(500).json({message:error.message}));});

app.use((error,req,res,next)=>{console.error(error);if(error instanceof multer.MulterError)return res.status(400).json({message:`Ошибка загрузки: ${error.message}`});res.status(500).json({message:error.message||'Ошибка сервера'});});
app.use((req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({message:'API-метод не найден'});sendFrontendFile(res,'404.html',404);});

if (require.main === module) {
  scheduleOrdersExcelSync();
  app.listen(PORT, () => console.log(`LiVetta server: http://localhost:${PORT}`));
}

module.exports = app;
