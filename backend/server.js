const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'livetta_dev_secret_change_me';
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const db = new Database(path.join(__dirname, 'database.sqlite'));
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.set('trust proxy', true);

function carouselAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Нет токена администратора' });
  }

  try {
    const secret = process.env.JWT_SECRET || process.env.SECRET_KEY || 'livetta_secret_key';
    req.admin = jwt.verify(token, secret);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Неверный токен администратора' });
  }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

const possibleFrontendDirs = [
  __dirname,
  path.resolve(__dirname, '..')
];

const frontendDir = possibleFrontendDirs.find((dir) => {
  return fs.existsSync(path.join(dir, 'admin.html'));
}) || __dirname;

app.use('/css', express.static(path.join(frontendDir, 'css')));
app.use('/js', express.static(path.join(frontendDir, 'js')));
app.use('/img', express.static(path.join(frontendDir, 'img')));

function sendFrontendFile(res, fileName) {
  const filePath = path.join(frontendDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send(`Файл ${fileName} не найден. Сервер ищет фронтенд здесь: ${frontendDir}`);
  }

  return res.sendFile(filePath);
}

app.get('/', (req, res) => sendFrontendFile(res, 'index.html'));
app.get('/index.html', (req, res) => sendFrontendFile(res, 'index.html'));
app.get('/catalog.html', (req, res) => sendFrontendFile(res, 'catalog.html'));
app.get('/constructor.html', (req, res) => sendFrontendFile(res, 'constructor.html'));
app.get('/admin.html', (req, res) => sendFrontendFile(res, 'admin.html'));



const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadsDir);
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const baseName = path
      .basename(file.originalname || 'image', ext)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, '')
      .slice(0, 80);

    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName || 'image'}${ext || '.jpg'}`;

    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new Error('Можно загружать только изображения'));
return;
    }

    cb(null, true);
  }
});


const carouselUpload = upload.array('slides', 50);

function addColumnIfMissing(tableName, columnName, definition) {
  const allowedTables = new Set(['products', 'stones']);
  const allowedColumns = new Set(['image', 'size_mm', 'color', 'created_at']);

  if (!allowedTables.has(tableName) || !allowedColumns.has(columnName)) {
    return;
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

addColumnIfMissing('products', 'image', "TEXT DEFAULT ''");
addColumnIfMissing('products', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

db.prepare(`
  CREATE TABLE IF NOT EXISTS stones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    size_mm REAL,
    color TEXT DEFAULT '#b48a78',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

addColumnIfMissing('stones', 'image', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('stones', 'size_mm', 'REAL');
addColumnIfMissing('stones', 'color', "TEXT DEFAULT '#b48a78'");
addColumnIfMissing('stones', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

db.prepare(`
  UPDATE stones
  SET color = '#b48a78'
  WHERE color IS NULL OR color = ''
`).run();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Нет токена. Войди в админку заново.' });
  }

  const token = authHeader.slice(7).trim();

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: 'Неверный или просроченный токен. Войди заново.' });
  }
}

function uploadMiddleware(req, res, next) {
  upload.any()(req, res, (error) => {
    if (error) {
      return next(error);
    }

    next();
  });
}

function getUploadedImage(req) {
  if (!Array.isArray(req.files) || !req.files.length) {
    return null;
  }

  return (
    req.files.find((file) => file.fieldname === 'image') ||
    req.files.find((file) => file.fieldname === 'productImage') ||
    req.files.find((file) => file.fieldname === 'stoneImage') ||
    req.files[0]
  );
}

function makeUploadUrl(req, file) {
  if (!file) {
    return '';
  }

  return `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
}

function deleteLocalFile(fileUrl) {
  if (!fileUrl) {
    return;
  }

  try {
    let fileName = '';

    try {
      fileName = path.basename(new URL(fileUrl).pathname);
    } catch {
      fileName = path.basename(String(fileUrl));
    }

    if (!fileName) {
      return;
    }

    const filePath = path.join(uploadsDir, fileName);

    if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Не удалось удалить файл:', error.message);
  }
}

function field(body, ...names) {
  for (const name of names) {
    const value = body[name];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function fieldWithFallback(body, fallback, ...names) {
  const value = field(body, ...names);

  if (value !== '') {
    return value;
  }

  if (fallback !== undefined && fallback !== null) {
    return String(fallback).trim();
  }

  return '';
}

function parseNumber(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  return Number(normalized);
}

function normalizeColor(value) {
  const color = String(value || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  return '#b48a78';
}

function validateProduct(body, existingProduct = null) {
  const title = fieldWithFallback(body, existingProduct?.title, 'title', 'productTitle', 'name');
  const description = fieldWithFallback(body, existingProduct?.description, 'description', 'productDescription');
  const category = fieldWithFallback(body, existingProduct?.category, 'category', 'productCategory');
  const rawPrice = fieldWithFallback(body, existingProduct?.price, 'price', 'productPrice');
  const price = parseNumber(rawPrice);

  if (!title) {
    return { error: 'Укажи название товара' };
  }

  if (!category) {
    return { error: 'Выбери категорию товара' };
  }

  if (!description) {
    return { error: 'Заполни описание товара' };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Укажи цену товара числом. Например: 2500' };
  }

  return {
    title,
    description,
    category,
    price
  };
}

function validateStone(body, existingStone = null) {
  const name = fieldWithFallback(body, existingStone?.name, 'name', 'stoneName');
  const description = fieldWithFallback(body, existingStone?.description, 'description', 'stoneDescription');
  const rawPrice = fieldWithFallback(body, existingStone?.price, 'price', 'stonePrice');
  const rawSize = fieldWithFallback(body, existingStone?.size_mm, 'size_mm', 'stoneSize', 'stone_size', 'size');
  const rawColor = fieldWithFallback(body, existingStone?.color, 'color', 'stoneColor');

  const price = parseNumber(rawPrice);
  const sizeMm = parseNumber(rawSize);
  const color = normalizeColor(rawColor);

  if (!name) {
    return { error: 'Укажи название камня' };
  }

  if (!description) {
    return { error: 'Заполни описание камня' };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Укажи цену камня числом. Например: 120' };
  }

  if (!Number.isFinite(sizeMm) || sizeMm <= 0) {
    return { error: 'Укажи размер камня в миллиметрах. Например: 8 или 8.5' };
  }

  return {
    name,
    description,
    price,
    size_mm: sizeMm,
    color
  };
}

app.get('/', (req, res) => {
  res.send('Livetta backend работает');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const login = field(req.body, 'login');
  const password = field(req.body, 'password');

  if (login !== ADMIN_LOGIN || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }

  const token = jwt.sign({ login }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ ok: true, login: req.admin.login });
});

app.get('/api/products', (req, res) => {
  const products = db.prepare(`
    SELECT *
    FROM products
    ORDER BY created_at DESC, id DESC
  `).all();

  res.json(products);
});

app.post('/api/products', authMiddleware, uploadMiddleware, (req, res) => {
  const product = validateProduct(req.body);
  const imageFile = getUploadedImage(req);

  if (product.error) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(400).json({ message: product.error });
  }

  const image = imageFile ? makeUploadUrl(req, imageFile) : '';

  const result = db.prepare(`
    INSERT INTO products (title, description, category, price, image)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    product.title,
    product.description,
    product.category,
    product.price,
    image
  );

  const createdProduct = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(createdProduct);
});

app.put('/api/products/:id', authMiddleware, uploadMiddleware, (req, res) => {
  const currentProduct = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
  `).get(req.params.id);

  const imageFile = getUploadedImage(req);

  if (!currentProduct) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(404).json({ message: 'Товар не найден' });
  }

  const product = validateProduct(req.body, currentProduct);

  if (product.error) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(400).json({ message: product.error });
  }

  const image = imageFile ? makeUploadUrl(req, imageFile) : currentProduct.image;

  db.prepare(`
    UPDATE products
    SET title = ?, description = ?, category = ?, price = ?, image = ?
    WHERE id = ?
  `).run(
    product.title,
    product.description,
    product.category,
    product.price,
    image,
    req.params.id
  );

  if (imageFile && currentProduct.image) {
    deleteLocalFile(currentProduct.image);
  }

  const updatedProduct = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
  `).get(req.params.id);

  res.json(updatedProduct);
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const product = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
  `).get(req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Товар не найден' });
  }

  db.prepare(`
    DELETE FROM products
    WHERE id = ?
  `).run(req.params.id);

  deleteLocalFile(product.image);

  res.json({ message: 'Товар удалён' });
});

app.get('/api/stones', (req, res) => {
  const stones = db.prepare(`
    SELECT *
    FROM stones
    ORDER BY created_at DESC, id DESC
  `).all();

  res.json(stones);
});

app.post('/api/stones', authMiddleware, uploadMiddleware, (req, res) => {
  const stone = validateStone(req.body);
  const imageFile = getUploadedImage(req);

  if (stone.error) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(400).json({ message: stone.error });
  }

  const image = imageFile ? makeUploadUrl(req, imageFile) : '';

  const result = db.prepare(`
    INSERT INTO stones (name, description, price, image, size_mm, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    stone.name,
    stone.description,
    stone.price,
    image,
    stone.size_mm,
    stone.color
  );

  const createdStone = db.prepare(`
    SELECT *
    FROM stones
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(createdStone);
});

app.put('/api/stones/:id', authMiddleware, uploadMiddleware, (req, res) => {
  const currentStone = db.prepare(`
    SELECT *
    FROM stones
    WHERE id = ?
  `).get(req.params.id);

  const imageFile = getUploadedImage(req);

  if (!currentStone) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(404).json({ message: 'Камень не найден' });
  }

  const stone = validateStone(req.body, currentStone);

  if (stone.error) {
    if (imageFile) {
      deleteLocalFile(makeUploadUrl(req, imageFile));
    }

    return res.status(400).json({ message: stone.error });
  }

  const image = imageFile ? makeUploadUrl(req, imageFile) : currentStone.image;

  db.prepare(`
    UPDATE stones
    SET name = ?, description = ?, price = ?, image = ?, size_mm = ?, color = ?
    WHERE id = ?
  `).run(
    stone.name,
    stone.description,
    stone.price,
    image,
    stone.size_mm,
    stone.color,
    req.params.id
  );

  if (imageFile && currentStone.image) {
    deleteLocalFile(currentStone.image);
  }

  const updatedStone = db.prepare(`
    SELECT *
    FROM stones
    WHERE id = ?
  `).get(req.params.id);

  res.json(updatedStone);
});

app.delete('/api/stones/:id', authMiddleware, (req, res) => {
  const stone = db.prepare(`
    SELECT *
    FROM stones
    WHERE id = ?
  `).get(req.params.id);

  if (!stone) {
    return res.status(404).json({ message: 'Камень не найден' });
  }

  db.prepare(`
    DELETE FROM stones
    WHERE id = ?
  `).run(req.params.id);

  deleteLocalFile(stone.image);

  res.json({ message: 'Камень удалён' });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      message: `Ошибка загрузки файла: ${error.message}`
    });
  }

  if (error.message === 'Можно загружать только изображения') {
    return res.status(400).json({
      message: error.message
    });
  }

  res.status(500).json({
    message: 'Ошибка сервера. Проверь консоль backend.'
  });
});



const carouselFilePath = path.join(__dirname, 'carousel.json');

function getDefaultCarouselSlides() {
  return [
    {
      id: 'default-slide-1',
      image: '/uploads/home-slide-1.jpg'
    },
    {
      id: 'default-slide-2',
      image: '/uploads/home-slide-2.jpg'
    }
  ];
}

function normalizeCarouselSlidesData(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.slides)) {
    return data.slides;
  }

  const slides = [];

  if (data?.slide1) {
    slides.push({
      id: 'legacy-slide-1',
      image: data.slide1
    });
  }

  if (data?.slide2) {
    slides.push({
      id: 'legacy-slide-2',
      image: data.slide2
    });
  }

  return slides;
}

function readCarouselSlides() {
  try {
    if (!fs.existsSync(carouselFilePath)) {
      return getDefaultCarouselSlides();
    }

    const data = JSON.parse(fs.readFileSync(carouselFilePath, 'utf8'));
    const slides = normalizeCarouselSlidesData(data);

    return slides.length ? slides : getDefaultCarouselSlides();
  } catch (error) {
    return getDefaultCarouselSlides();
  }
}

function saveCarouselSlides(slides) {
  fs.writeFileSync(carouselFilePath, JSON.stringify({ slides }, null, 2), 'utf8');
}

app.get('/api/carousel', (req, res) => {
  res.json({
    slides: readCarouselSlides()
  });
});

app.post('/api/carousel', carouselAuth, carouselUpload, (req, res) => {
  const slides = readCarouselSlides();

  const newSlides = (req.files || []).map((file) => ({
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image: `/uploads/${file.filename}`
  }));

  if (!newSlides.length) {
    return res.status(400).json({
      message: 'Загрузи хотя бы одно фото. Рекомендуемый размер: 1420×620 px.'
    });
  }

  const updatedSlides = [...slides, ...newSlides];

  saveCarouselSlides(updatedSlides);

  res.json({
    message: 'Фото добавлены в карусель. Рекомендуемый размер: 1420×620 px.',
    slides: updatedSlides
  });
});


app.put('/api/carousel/order', carouselAuth, (req, res) => {
  const orderedIdsSource = req.body?.orderedIds || req.body?.orderIds || [];

  const orderedIds = Array.isArray(orderedIdsSource)
    ? orderedIdsSource.map(String)
    : [];

  if (!orderedIds.length) {
    return res.status(400).json({
      message: 'Передай порядок фото для карусели'
    });
  }

  const slides = readCarouselSlides();
  const slidesById = new Map(slides.map((slide) => [String(slide.id), slide]));

  const orderedSlides = orderedIds
    .map((id) => slidesById.get(String(id)))
    .filter(Boolean);

  const missingSlides = slides.filter((slide) => !orderedIds.includes(String(slide.id)));
  const updatedSlides = [...orderedSlides, ...missingSlides];

  saveCarouselSlides(updatedSlides);

  res.json({
    message: 'Порядок фото карусели сохранён',
    slides: updatedSlides
  });
});

app.delete('/api/carousel/:id', carouselAuth, (req, res) => {
  const slides = readCarouselSlides();
  const slideToDelete = slides.find((slide) => String(slide.id) === String(req.params.id));

  if (!slideToDelete) {
    return res.status(404).json({
      message: 'Фото карусели не найдено'
    });
  }

  const updatedSlides = slides.filter((slide) => String(slide.id) !== String(req.params.id));

  saveCarouselSlides(updatedSlides);

  const imagePath = String(slideToDelete.image || '');

  if (
    imagePath.startsWith('/uploads/') &&
    !imagePath.includes('home-slide-1.jpg') &&
    !imagePath.includes('home-slide-2.jpg')
  ) {
    const filePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));

    fs.unlink(filePath, () => {});
  }

  res.json({
    message: 'Фото удалено из карусели',
    slides: updatedSlides
  });
});


app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});