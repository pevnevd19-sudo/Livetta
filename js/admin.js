const API_URL = getApiUrl();

const loginSection = document.querySelector('#loginSection');
const adminPanel = document.querySelector('#adminPanel');
const loginForm = document.querySelector('#loginForm');
const productForm = document.querySelector('#productForm');
const stoneForm = document.querySelector('#stoneForm');
const adminProducts = document.querySelector('#adminProducts');
const adminStones = document.querySelector('#adminStones');
const carouselForm = document.querySelector('#carouselForm');
const carouselAdminPreview = document.querySelector('#carouselAdminPreview');

const PRODUCT_CATEGORIES = ['Ожерелье', 'Кольцо', 'Браслет', 'Серьги'];

init();

function getApiUrl() {
  if (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return 'http://localhost:3000/api';
  }

  return `${window.location.origin}/api`;
}

function init() {
  loginForm.addEventListener('submit', handleLogin);
  productForm.addEventListener('submit', handleProductCreate);
  stoneForm.addEventListener('submit', handleStoneCreate);

  if (carouselForm) {
    carouselForm.addEventListener('submit', handleCarouselUpdate);
  }

  if (carouselAdminPreview) {
    carouselAdminPreview.addEventListener('click', handleCarouselPreviewClick);
  }

  adminProducts.addEventListener('submit', handleProductEditSubmit);
  adminProducts.addEventListener('click', handleProductClick);

  adminStones.addEventListener('submit', handleStoneEditSubmit);
  adminStones.addEventListener('click', handleStoneClick);

  if (getToken()) {
    openAdmin();
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);

  try {
    const data = await apiFetch('/login', {
      method: 'POST',
      auth: false,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        login: getFormValue(formData, 'login'),
        password: getFormValue(formData, 'password')
      })
    });

    localStorage.setItem('admin_token', data.token);
    openAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function handleProductCreate(event) {
  event.preventDefault();

  const formData = new FormData(productForm);
  normalizeFileField(formData, productForm.querySelector('#productImage'));

  try {
    await apiFetch('/products', {
      method: 'POST',
      body: formData
    });

    productForm.reset();
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function handleStoneCreate(event) {
  event.preventDefault();

  const formData = new FormData(stoneForm);
  normalizeFileField(formData, stoneForm.querySelector('#stoneImage'));

  try {
    await apiFetch('/stones', {
      method: 'POST',
      body: formData
    });

    stoneForm.reset();
    document.querySelector('#stoneColor').value = '#b48a78';
    await loadStones();
  loadCarouselSlides();
  } catch (error) {
    alert(error.message);
  }
}





async function loadCarouselSlides() {
  if (!carouselAdminPreview) {
    return;
  }

  try {
    carouselAdminPreview.innerHTML = '<p class="muted-text">Загрузка фото карусели...</p>';

    const data = await apiFetch(`/carousel?cache=${Date.now()}`, {
      auth: false
    });

    const slides = normalizeCarouselSlides(data);

    if (!slides.length) {
      carouselAdminPreview.innerHTML = '<p class="muted-text">Фото для карусели пока не загружены. Рекомендуемый размер: 1420×620 px.</p>';
      return;
    }

    carouselAdminPreview.innerHTML = `
      <div class="carousel-order-toolbar">
        <strong>Порядок фото в карусели</strong>
        <span>Поставь нужный индекс: 1 — первый слайд, 2 — второй и так далее. Размер фото: 1420×620 px.</span>
        <button type="button" data-action="save-carousel-order">Сохранить порядок</button>
      </div>

      <div class="carousel-admin-grid">
        ${slides.map((slide, index) => renderCarouselPreview(slide, index, slides.length)).join('')}
      </div>
    `;
  } catch (error) {
    carouselAdminPreview.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function normalizeCarouselSlides(data) {
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

function renderCarouselPreview(slide, index, totalCount) {
  const image = typeof slide === 'string' ? slide : slide.image;
  const id = typeof slide === 'string' ? `slide-${index}` : slide.id;
  const src = resolveImage(image);

  return `
    <article class="carousel-admin-card">
      <strong>Фото ${index + 1}</strong>
      <span>Рекомендуемый размер: 1420×620 px</span>

      <label class="carousel-index-field">
        Индекс в карусели
        <input
          type="number"
          min="1"
          max="${totalCount}"
          value="${index + 1}"
          data-carousel-order-id="${escapeHtml(id)}"
        >
      </label>

      ${src ? `<img src="${escapeHtml(src)}" alt="Фото карусели ${index + 1}">` : '<p class="muted-text">Фото не найдено</p>'}

      <button type="button" class="carousel-delete-button" data-action="delete-carousel-slide" data-id="${escapeHtml(id)}">
        Удалить фото
      </button>
    </article>
  `;
}

async function handleCarouselUpdate(event) {
  event.preventDefault();

  const input = carouselForm.querySelector('#carouselImages');
  const files = Array.from(input?.files || []);

  if (!files.length) {
    alert('Выбери хотя бы одно фото для карусели. Рекомендуемый размер: 1420×620 px.');
    return;
  }

  const formData = new FormData();

  files.forEach((file) => {
    formData.append('slides', file);
  });

  try {
    await apiFetch('/carousel', {
      method: 'POST',
      body: formData
    });

    carouselForm.reset();
    await loadCarouselSlides();

    alert('Фото добавлены в карусель.');
  } catch (error) {
    alert(error.message);
  }
}

async function handleCarouselPreviewClick(event) {
  const deleteButton = event.target.closest('[data-action="delete-carousel-slide"]');
  const saveOrderButton = event.target.closest('[data-action="save-carousel-order"]');

  if (saveOrderButton) {
    await saveCarouselOrder();
    return;
  }

  if (!deleteButton) {
    return;
  }

  if (!confirm('Удалить это фото из карусели?')) {
    return;
  }

  try {
    await apiFetch(`/carousel/${deleteButton.dataset.id}`, {
      method: 'DELETE'
    });

    await loadCarouselSlides();
  } catch (error) {
    alert(error.message);
  }
}

async function saveCarouselOrder() {
  const inputs = Array.from(document.querySelectorAll('[data-carousel-order-id]'));

  if (!inputs.length) {
    return;
  }

  const orderedIds = inputs
    .map((input, currentIndex) => ({
      id: input.dataset.carouselOrderId,
      order: Number(input.value) || currentIndex + 1,
      currentIndex
    }))
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.currentIndex - b.currentIndex;
      }

      return a.order - b.order;
    })
    .map((item) => item.id);

  try {
    await apiFetch('/carousel/order', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderedIds })
    });

    await loadCarouselSlides();
    alert('Порядок фото в карусели сохранён.');
  } catch (error) {
    alert(error.message);
  }
}

function normalizeFileField(formData, input) {
  formData.delete('image');

  if (input && input.files && input.files[0]) {
    formData.append('image', input.files[0]);
  }
}

function openAdmin() {
  loginSection.hidden = true;
  adminPanel.hidden = false;

  createLogoutButton();
  loadProducts();
  loadStones();
  loadCarouselSlides();
}

function createLogoutButton() {
  if (document.querySelector('#logoutButton')) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'logoutButton';
  button.type = 'button';
  button.className = 'admin-logout-button';
  button.textContent = 'Выйти';

  button.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    adminPanel.hidden = true;
    loginSection.hidden = false;
  });

  adminPanel.prepend(button);
}

async function loadProducts() {
  try {
    adminProducts.innerHTML = '<p class="muted-text">Загрузка товаров...</p>';

    const products = await apiFetch(`/products?cache=${Date.now()}`, {
      auth: false
    });

    if (!Array.isArray(products) || !products.length) {
      adminProducts.innerHTML = '<p class="muted-text">Товаров пока нет</p>';
      return;
    }

    adminProducts.innerHTML = products.map(renderProduct).join('');
  } catch (error) {
    adminProducts.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderProduct(product) {
  const image = resolveImage(product.image);

  return `
    <article class="product-card admin-product-card">
      <div class="admin-product-image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : '<span>Нет фото</span>'}
      </div>

      <p class="product-card__category">${escapeHtml(product.category)}</p>
      <h3>${escapeHtml(product.title)}</h3>
      <p>${escapeHtml(product.description)}</p>
      <strong>${formatPrice(product.price)} ₽</strong>

      <form class="admin-inline-form product-edit-form" data-id="${product.id}" enctype="multipart/form-data">
        <input name="title" type="text" value="${escapeHtml(product.title)}" placeholder="Название" required>

        <select name="category" required>
          ${PRODUCT_CATEGORIES.map((category) => `
            <option value="${escapeHtml(category)}" ${category === product.category ? 'selected' : ''}>
              ${escapeHtml(category)}
            </option>
          `).join('')}
        </select>

        <input name="price" type="text" inputmode="decimal" value="${escapeHtml(product.price)}" placeholder="Цена" required>

        <textarea name="description" placeholder="Описание" required>${escapeHtml(product.description)}</textarea>

        <label class="file-field">
          Новое фото
          <input name="image" type="file" accept="image/*">
        </label>

        <button type="submit">Сохранить товар</button>
      </form>

      <button type="button" data-action="delete-product" data-id="${product.id}">
        Удалить товар
      </button>
    </article>
  `;
}

async function handleProductEditSubmit(event) {
  const form = event.target.closest('.product-edit-form');

  if (!form) {
    return;
  }

  event.preventDefault();

  const formData = new FormData(form);
  const fileInput = form.querySelector('input[type="file"]');
  normalizeFileField(formData, fileInput);

  try {
    await apiFetch(`/products/${form.dataset.id}`, {
      method: 'PUT',
      body: formData
    });

    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function handleProductClick(event) {
  const button = event.target.closest('[data-action="delete-product"]');

  if (!button) {
    return;
  }

  if (!confirm('Удалить товар?')) {
    return;
  }

  try {
    await apiFetch(`/products/${button.dataset.id}`, {
      method: 'DELETE'
    });

    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function loadStones() {
  try {
    adminStones.innerHTML = '<p class="muted-text">Загрузка камней...</p>';

    const stones = await apiFetch(`/stones?cache=${Date.now()}`, {
      auth: false
    });

    if (!Array.isArray(stones) || !stones.length) {
      adminStones.innerHTML = '<p class="muted-text">Камней пока нет</p>';
      return;
    }

    adminStones.innerHTML = stones.map(renderStone).join('');
  } catch (error) {
    adminStones.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderStone(stone) {
  const image = resolveImage(stone.image);
  const color = normalizeColor(stone.color);
  const size = stone.size_mm || '';

  return `
    <article class="product-card stone-admin-card">
      <div class="stone-admin-preview" style="--stone-color: ${escapeHtml(color)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(stone.name)}">` : '<span>Нет фото</span>'}
      </div>

      <h3>${escapeHtml(stone.name)}</h3>
      <p>${escapeHtml(stone.description)}</p>
      <strong>${formatPrice(stone.price)} ₽</strong>
      <p class="stone-meta">Размер: ${size ? `${formatNumber(size)} мм` : 'не задан'}</p>

      <form class="admin-inline-form stone-edit-form" data-id="${stone.id}" enctype="multipart/form-data">
        <input name="name" type="text" value="${escapeHtml(stone.name)}" placeholder="Название" required>

        <textarea name="description" placeholder="Описание" required>${escapeHtml(stone.description)}</textarea>

        <input name="price" type="text" inputmode="decimal" value="${escapeHtml(stone.price)}" placeholder="Цена" required>

        <input name="size_mm" type="text" inputmode="decimal" value="${escapeHtml(size)}" placeholder="Размер, мм" required>

        <label>
          Цвет
          <input name="color" type="color" value="${escapeHtml(color)}">
        </label>

        <label class="file-field">
          Новое фото
          <input name="image" type="file" accept="image/*">
        </label>

        <button type="submit">Сохранить камень</button>
      </form>

      <button type="button" data-action="delete-stone" data-id="${stone.id}">
        Удалить камень
      </button>
    </article>
  `;
}

async function handleStoneEditSubmit(event) {
  const form = event.target.closest('.stone-edit-form');

  if (!form) {
    return;
  }

  event.preventDefault();

  const formData = new FormData(form);
  const fileInput = form.querySelector('input[type="file"]');
  normalizeFileField(formData, fileInput);

  try {
    await apiFetch(`/stones/${form.dataset.id}`, {
      method: 'PUT',
      body: formData
    });

    await loadStones();
  loadCarouselSlides();
  } catch (error) {
    alert(error.message);
  }
}

async function handleStoneClick(event) {
  const button = event.target.closest('[data-action="delete-stone"]');

  if (!button) {
    return;
  }

  if (!confirm('Удалить камень?')) {
    return;
  }

  try {
    await apiFetch(`/stones/${button.dataset.id}`, {
      method: 'DELETE'
    });

    await loadStones();
  loadCarouselSlides();
  } catch (error) {
    alert(error.message);
  }
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.auth !== false) {
    const token = getToken();

    if (!token) {
      throw new Error('Сначала войди в админку');
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || text || 'Ошибка запроса');
  }

  return data;
}

function getToken() {
  return localStorage.getItem('admin_token');
}

function getFormValue(formData, name) {
  return String(formData.get(name) || '').trim();
}

function resolveImage(image) {
  if (!image) {
    return '';
  }

  const value = String(image);

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/uploads')) {
    return `${API_URL.replace('/api', '')}${value}`;
  }

  return value;
}

function normalizeColor(color) {
  const value = String(color || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return '#b48a78';
}

function formatPrice(value) {
  const number = parseNumber(value);

  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return number.toLocaleString('ru-RU');
}

function formatNumber(value) {
  const number = parseNumber(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return Number(number.toFixed(1)).toString();
}

function parseNumber(value) {
  return Number(String(value ?? '').replace(/\s+/g, '').replace(',', '.'));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}