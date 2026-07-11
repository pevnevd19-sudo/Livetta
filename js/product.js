const App = window.Livetta;
const API_URL = App.getApiUrl();
const PRODUCT_LENGTH_MIN = 25;
const PRODUCT_LENGTH_MAX = 50;
const PRODUCT_LENGTH_DEFAULT = 45;

const EMPTY_LIGHTBOX_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const productDetail = document.querySelector('#productDetail');
const lightbox = document.querySelector('#productLightbox');
const lightboxImage = document.querySelector('#productLightboxImage');
const lightboxClose = document.querySelector('#productLightboxClose');

let currentProduct = null;
let currentImages = [];

loadProduct();

async function loadProduct() {
  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    document.title = 'Товар не найден — LiVetta';
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

    renderProductDetail(currentProduct);
  } catch (error) {
    console.error(error);
    document.title = 'Товар не найден — LiVetta';
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

  document.title = `${product.title} — LiVetta`;

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
        ${renderProductLengthSelector(product)}
      </div>

      <div class="premium-product-description">
        <h2>Об украшении</h2>
        <p>${formatTextBlock(product.description)}</p>
      </div>

      ${renderProductStones(product)}

      <div class="premium-product-benefits">
        <div>
          <strong>Подарочная подача</strong>
          <span>При желании мы можем упаковать украшение сразу на подарок вашему близкому и не очень человеку, дайте нам только знать об этом.</span>
        </div>
        <div>
          <strong>Фото перед отправкой</strong>
          <span>Покажем украшения до отправки, если вам что то не понравится, переделаем бесплатно.</span>
        </div>
        <div>
          <strong>Ручной подбор</strong>
          <span>Каждое наше украшение, камень, форма и настроение подбирается под конкретного человека, знак зодиака или характер, у нас вы точно сможете найти, то украшение, которое подойдет именно вам.</span>
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

function renderProductStones(product) {
  const stones = getProductStones(product);

  if (!stones.length) {
    return '';
  }

  return `
    <div class="premium-product-stones">
      <h2>Камни в украшении</h2>
      <div class="premium-product-stones__list">
        ${stones.map((stone) => {
          const property = String(stone.stone_property || stone.description || '').trim();
          return `
          <article class="premium-product-stone">
            <h3>${escapeHtml(stone.name)}</h3>
            ${property ? `<p><b>${escapeHtml(stone.name)}</b> — ${formatTextBlock(property)}</p>` : ''}
            ${stone.zodiac ? `<p><b>Знаки зодиака:</b> ${escapeHtml(stone.zodiac)}</p>` : ''}
          </article>
        `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderProductLengthSelector(product) {
  if (product.purchasable === false) {
    return '';
  }

  const options = [];
  for (let length = PRODUCT_LENGTH_MIN; length <= PRODUCT_LENGTH_MAX; length += 1) {
    const selected = length === PRODUCT_LENGTH_DEFAULT ? ' selected' : '';
    options.push(`<option value="${length}"${selected}>${length} см</option>`);
  }

  return `
    <label class="premium-product-length" for="productLength">
      <span>Длина украшения</span>
      <select id="productLength" name="productLength">${options.join('')}</select>
    </label>
  `;
}

function getSelectedProductLength() {
  const field = document.querySelector('#productLength');
  const value = Number(field?.value || PRODUCT_LENGTH_DEFAULT);
  return Math.min(PRODUCT_LENGTH_MAX, Math.max(PRODUCT_LENGTH_MIN, Number.isFinite(value) ? value : PRODUCT_LENGTH_DEFAULT));
}

function getProductStones(product) {
  if (Array.isArray(product?.product_stones)) {
    return product.product_stones.map(normalizeProductStone).filter(Boolean);
  }

  return [];
}

function normalizeProductStone(stone) {
  if (!stone || typeof stone !== 'object') {
    return null;
  }

  const name = String(stone.name || '').trim();

  if (!name) {
    return null;
  }

  return {
    name,
    description: String(stone.description || '').trim(),
    stone_property: String(stone.stone_property || stone.property || '').trim(),
    zodiac: String(stone.zodiac || '').trim()
  };
}

function formatTextBlock(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function handleProductDetailClick(event) {
  const thumb = event.target.closest('[data-action="change-main-image"]');
  const lightboxButton = event.target.closest('[data-action="open-lightbox"]');
  const buyButton = event.target.closest('[data-action="buy-product"]');

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

  const lengthCm = getSelectedProductLength();
  const cart = App.readCart();
  const productId = product.id ?? product.slug ?? product.title;
  const existing = cart.find((item) => String(item.id) === String(productId) && !item.custom && Number(item.design?.size_cm || 0) === lengthCm);
  const images = getProductImages(product);

  if (existing) {
    existing.quantity = Number(existing.quantity || 1) + 1;
    existing.design = { ...(existing.design || {}), type: product.category || 'Украшение', size_cm: lengthCm };
  } else {
    cart.push({
      id: productId,
      product_id: product.id,
      custom: false,
      title: product.title,
      category: product.category,
      description: product.description,
      product_stones: product.product_stones || [],
      image: resolveImageUrl(images[0] || product.image),
      product_images: images,
      price: Number(product.price || 0),
      quantity: 1,
      design: {
        type: product.category || 'Украшение',
        size_cm: lengthCm
      }
    });
  }

  App.writeCart(cart);
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
