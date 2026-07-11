const App = window.Livetta;
const API_URL = App.getApiUrl();
const catalogGrid = document.querySelector('#catalogGrid');
const catalogCategorySelect = document.querySelector('#catalogCategorySelect');

let allProducts = [];
let activeCategory = 'Категории';

initCatalog();

async function initCatalog() {
  if (catalogCategorySelect) {
    catalogCategorySelect.addEventListener('change', () => {
      activeCategory = catalogCategorySelect.value || 'Категории';
      renderProducts();
    });
  }

  await Promise.all([
    loadCategories(),
    loadProducts()
  ]);
}

async function loadCategories() {
  if (!catalogCategorySelect) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/categories?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error('Ошибка загрузки категорий');
    }

    const data = await response.json();
    const categories = Array.isArray(data?.categories) ? data.categories : [];

    renderCategorySelect(['Категории', ...categories]);
  } catch (error) {
    console.warn(error);
    renderCategorySelect(['Категории', 'Ожерелье', 'Колье', 'Кольцо', 'Браслет', 'Серьги']);
  }
}

function renderCategorySelect(categories) {
  const uniqueCategories = Array.from(new Set(categories.filter(Boolean)));

  catalogCategorySelect.innerHTML = uniqueCategories.map((category) => `
    <option value="${escapeHtml(category)}" ${category === activeCategory ? 'selected' : ''}>
      ${escapeHtml(category)}
    </option>
  `).join('');

  if (!uniqueCategories.includes(activeCategory)) {
    activeCategory = 'Категории';
    catalogCategorySelect.value = 'Категории';
  }
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error('Ошибка загрузки товаров');
    }

    allProducts = await response.json();
    renderProducts();
  } catch (error) {
    console.error(error);
    catalogGrid.innerHTML = '<p class="muted-text">Ошибка загрузки товаров. Проверь, запущен ли сервер.</p>';
  }
}

function renderProducts() {
  const products = activeCategory === 'Категории'
    ? allProducts
    : allProducts.filter((product) => String(product.category) === String(activeCategory));

  if (!products.length) {
    catalogGrid.innerHTML = '<p class="muted-text">В этом разделе пока нет товаров</p>';
    return;
  }

  catalogGrid.innerHTML = products.map(renderProduct).join('');

  document.querySelectorAll('.buy-button').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const product = allProducts.find((item) => String(item.id) === String(button.dataset.id));
      addToCart(product, button);
    });
  });
}

function renderProduct(product) {
  const images = getProductImages(product);
  const image = resolveImageUrl(images[0] || product.image);
  const productUrl = `product.html?id=${encodeURIComponent(product.id)}`;
  const canBuy = product.purchasable !== false;

  return `
    <article class="product-card catalog-product-card">
      <a class="product-card__image" href="${productUrl}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : '<span>Фото скоро будет</span>'}
      </a>

      <div class="catalog-product-card__body">
        <p class="product-card__category">${escapeHtml(product.category)}</p>

        <h3 class="product-card__title">
          <a href="${productUrl}">${escapeHtml(product.title)}</a>
        </h3>

        <p class="product-card__description">${escapeHtml(product.description)}</p>
        ${renderProductSizes(product)}

        <div class="catalog-product-card__bottom">
          <strong class="product-card__price">${formatPrice(product.price)} ₽</strong>

          <div class="product-card__actions">
            <a class="product-card__button product-card__button--secondary" href="${productUrl}">
              Подробнее
            </a>

            <button class="product-card__button buy-button ${canBuy ? '' : 'is-disabled'}" type="button" data-id="${product.id}" ${canBuy ? '' : 'disabled'}>
              ${canBuy ? 'Купить' : (product.is_child && !product.child_sale_enabled ? 'Скоро' : 'Нет в наличии')}
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}


function renderProductSizes(product) {
  const sizes = Array.isArray(product.size_options) ? product.size_options : [];
  if (!sizes.length) return '';
  return `
    <div class="product-size-badges" aria-label="Доступные размеры">
      ${sizes.map((size) => `<span>${escapeHtml(size.label)} · ${escapeHtml(formatSizeCm(size.cm))} см</span>`).join('')}
    </div>
    <p class="product-size-note">${escapeHtml(product.carabiner_extension_note || 'При заказе украшения с замком карабин есть удлинение 4 см.')}</p>
  `;
}

function formatSizeCm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace('.', ',') : value;
}

function addToCart(product, button = null) {
  if (!product || product.purchasable === false) {
    return;
  }

  App.addProductToCart(product);
  animateBuyButton(button);
}

function animateBuyButton(button) {
  App.flashButton(button);
}

function getProductImages(product) {
  return App.getProductImages(product);
}

function resolveImageUrl(image) {
  return App.resolveImageUrl(image);
}

function formatPrice(value) {
  return App.formatPrice(value);
}

function escapeHtml(value) {
  return App.escapeHtml(value);
}
