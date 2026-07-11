const App = window.Livetta;
const API_URL = App.getApiUrl();
const EMPTY_LIGHTBOX_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const productDetail = document.querySelector('#productDetail');
const lightbox = document.querySelector('#productLightbox');
const lightboxImage = document.querySelector('#productLightboxImage');
const lightboxClose = document.querySelector('#productLightboxClose');

let currentProduct = null;
let currentImages = [];
let selectedProductSize = null;

loadProduct();

async function loadProduct() {
  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    document.title = 'Товар не найден — Livetta';
    productDetail.innerHTML = `
      <div class="premium-product-info">
        <div class="premium-product-info__top">
          <span class="premium-product-eyebrow">Каталог</span>
          <h1>Товар не найден</h1>
        </div>
        <p class="muted-text">Откройте карточку из каталога или вернитесь к списку украшений.</p>
        <a class="premium-secondary-link" href="catalog.html">Вернуться в каталог</a>
      </div>
    `;
    return;
  }

  try {
    const response = await fetch(`${API_URL}/products/${encodeURIComponent(id)}?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error('Товар не найден');
    }

    currentProduct = await response.json();
    currentImages = getProductImages(currentProduct);

    selectedProductSize = getDefaultProductSize(currentProduct);
    renderProductDetail(currentProduct);
  } catch (error) {
    console.error(error);
    document.title = 'Товар не найден — Livetta';
    productDetail.innerHTML = `
      <div class="premium-product-info">
        <div class="premium-product-info__top">
          <span class="premium-product-eyebrow">Каталог</span>
          <h1>Не удалось загрузить товар</h1>
        </div>
        <p class="muted-text">Похоже, карточка удалена или ссылка устарела.</p>
        <a class="premium-secondary-link" href="catalog.html">Вернуться в каталог</a>
      </div>
    `;
  }
}

function renderProductDetail(product) {
  const images = currentImages.length ? currentImages : [];
  const mainImage = resolveImageUrl(images[0] || product.image);
  const canBuy = product.purchasable !== false;

  document.title = `${product.title} — Livetta`;

  productDetail.innerHTML = `
    <div class="premium-product-gallery">
      <button class="premium-product-gallery__main" type="button" data-action="open-lightbox" data-image="${escapeHtml(mainImage)}">
        ${mainImage ? `<img id="productMainImage" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.title)}">` : '<span>Фото скоро будет</span>'}
        <span class="premium-product-gallery__zoom">Нажми, чтобы увеличить</span>
      </button>

      ${images.length > 1 ? `
        <div class="premium-product-gallery__thumbs">
          ${images.map((image, index) => {
            const src = resolveImageUrl(image);

            return `
              <button class="${index === 0 ? 'is-active' : ''}" type="button" data-action="change-main-image" data-image="${escapeHtml(src)}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(product.title)} ${index + 1}">
              </button>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    <aside class="premium-product-info">
      <div class="premium-product-info__top">
        <span class="premium-product-eyebrow">${escapeHtml(product.category)}</span>
        <h1>${escapeHtml(product.title)}</h1>
        <strong class="premium-product-price">${formatPrice(product.price)} ₽</strong>
      </div>

      <div class="premium-product-description">
        <h2>Об украшении</h2>
        <p>${escapeHtml(product.description)}</p>
      </div>

      ${renderProductSizeSelector(product)}

      <div class="premium-product-benefits">
        <div>
          <strong>Подарочная подача</strong>
          <span>аккуратно и эстетично</span>
        </div>
        <div>
          <strong>Фото перед отправкой</strong>
          <span>покажем украшение до покупки</span>
        </div>
        <div>
          <strong>Ручной подбор</strong>
          <span>камни, форма и настроение</span>
        </div>
      </div>

      <div class="premium-product-actions">
        <button class="premium-buy-button ${canBuy ? '' : 'is-disabled'}" type="button" data-action="buy-product" ${canBuy ? '' : 'disabled'}>
          ${canBuy ? 'Купить' : (product.is_child && !product.child_sale_enabled ? 'Продажа скоро' : 'Нет в наличии')}
        </button>

        <a class="premium-secondary-link" href="catalog.html">
          Вернуться в каталог
        </a>
      </div>

      <div class="premium-product-meta">
        <div>
          <span>Категория</span>
          <strong>${escapeHtml(product.category)}</strong>
        </div>

        <div>
          <span>Фото</span>
          <strong>${images.length || 1}</strong>
        </div>
      </div>
    </aside>
  `;

  productDetail.removeEventListener('click', handleProductDetailClick);
  productDetail.addEventListener('click', handleProductDetailClick);
}

function handleProductDetailClick(event) {
  const thumb = event.target.closest('[data-action="change-main-image"]');
  const lightboxButton = event.target.closest('[data-action="open-lightbox"]');
  const buyButton = event.target.closest('[data-action="buy-product"]');
  const sizeButton = event.target.closest('[data-action="select-product-size"]');

  if (sizeButton) {
    selectedProductSize = { label: sizeButton.dataset.sizeLabel, cm: Number(sizeButton.dataset.sizeCm) };
    document.querySelectorAll('[data-action="select-product-size"]').forEach((button) => {
      button.classList.toggle('is-active', button === sizeButton);
    });
    return;
  }

  if (thumb) {
    const src = thumb.dataset.image;
    const mainImage = document.querySelector('#productMainImage');
    const mainButton = document.querySelector('[data-action="open-lightbox"]');

    if (mainImage) {
      mainImage.src = src;
    }

    if (mainButton) {
      mainButton.dataset.image = src;
    }

    document.querySelectorAll('.premium-product-gallery__thumbs button').forEach((button) => {
      button.classList.toggle('is-active', button === thumb);
    });

    return;
  }

  if (lightboxButton) {
    openLightbox(lightboxButton.dataset.image);
    return;
  }

  if (buyButton) {
    addToCart(currentProduct, buyButton);
  }
}

function openLightbox(src) {
  if (!src) {
    return;
  }

  lightboxImage.src = src;
  lightbox.hidden = false;
  document.body.classList.add('is-lightbox-open');
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.src = EMPTY_LIGHTBOX_IMAGE;
  document.body.classList.remove('is-lightbox-open');
}

lightboxClose.addEventListener('click', closeLightbox);

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !lightbox.hidden) {
    closeLightbox();
  }
});

function addToCart(product, button = null) {
  if (!product || product.purchasable === false) {
    return;
  }

  const productForCart = { ...product, selected_size: selectedProductSize || getDefaultProductSize(product) };
  App.addProductToCart(productForCart);
  animateBuyButton(button);
}

function animateBuyButton(button) {
  App.flashButton(button);
}

function getProductImages(product) {
  return App.getProductImages(product);
}


function getProductSizes(product) {
  return Array.isArray(product?.size_options) ? product.size_options : [];
}

function getDefaultProductSize(product) {
  const sizes = getProductSizes(product);
  return sizes[0] || null;
}

function renderProductSizeSelector(product) {
  const sizes = getProductSizes(product);
  if (!sizes.length) return '';
  const selected = selectedProductSize || sizes[0];
  return `
    <div class="premium-product-sizes">
      <h2>Размер</h2>
      <div class="product-size-selector" role="radiogroup" aria-label="Выбор размера украшения">
        ${sizes.map((size) => `
          <button type="button" data-action="select-product-size" data-size-label="${escapeHtml(size.label)}" data-size-cm="${escapeHtml(size.cm)}" class="${selected?.label === size.label ? 'is-active' : ''}">
            <b>${escapeHtml(size.label)}</b>
            <span>${escapeHtml(formatSizeCm(size.cm))} см</span>
          </button>
        `).join('')}
      </div>
      <p class="product-size-note">${escapeHtml(product.carabiner_extension_note || 'При заказе украшения с замком карабин есть удлинение 4 см.')}</p>
    </div>
  `;
}

function formatSizeCm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace('.', ',') : value;
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
