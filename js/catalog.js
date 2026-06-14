const API_URL = getApiUrl();
const catalogGrid = document.querySelector('#catalogGrid');
const CART_KEY = 'livetta_cart';

loadProducts();

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

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error('Ошибка загрузки товаров');
    }

    const products = await response.json();

    if (!products.length) {
      catalogGrid.innerHTML = '<p class="muted-text">Товаров пока нет</p>';
      return;
    }

    catalogGrid.innerHTML = products.map(renderProduct).join('');

    document.querySelectorAll('.buy-button').forEach((button) => {
      button.addEventListener('click', () => {
        const product = products.find((item) => String(item.id) === String(button.dataset.id));
        addToCart(product);
      });
    });
  } catch (error) {
    console.error(error);
    catalogGrid.innerHTML = '<p class="muted-text">Ошибка загрузки товаров. Проверь, запущен ли сервер.</p>';
  }
}

function renderProduct(product) {
  const image = resolveImageUrl(product.image);

  return `
    <article class="product-card catalog-product-card">
      <div class="product-card__image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : '<span>Фото скоро будет</span>'}
      </div>

      <p class="product-card__category">${escapeHtml(product.category)}</p>
      <h3 class="product-card__title">${escapeHtml(product.title)}</h3>
      <p class="product-card__description">${escapeHtml(product.description)}</p>
      <strong class="product-card__price">${formatPrice(product.price)} ₽</strong>

      <button class="product-card__button buy-button" type="button" data-id="${product.id}">
        Купить
      </button>
    </article>
  `;
}

function addToCart(product) {
  if (!product) {
    return;
  }

  const cart = readCart();
  const existingItem = cart.find((item) => String(item.id) === String(product.id) && !item.custom);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      title: product.title,
      category: product.category,
      description: product.description,
      price: Number(product.price) || 0,
      image: product.image,
      quantity: 1
    });
  }

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  alert(`Добавлено в корзину: ${product.title}`);
}

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function resolveImageUrl(image) {
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

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return number.toLocaleString('ru-RU');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}