const App = window.Livetta;
const $ = (selector) => document.querySelector(selector);

const cartList = $('#cartList');
const cartItemsCount = $('#cartItemsCount');
const cartSubtotal = $('#cartSubtotal');
const cartDiscountRow = $('#cartDiscountRow');
const cartDiscountLabel = $('#cartDiscountLabel');
const cartDiscount = $('#cartDiscount');
const cartShipping = $('#cartShipping');
const cartTotal = $('#cartTotal');
const cartPromoPanel = $('#cartPromoPanel');
const cartClearButton = $('#cartClearButton');
const cartOrderForm = $('#cartOrderForm');
const cartOrderMessage = $('#cartOrderMessage');
const submitButton = $('#cartSubmitButton');

const DEFAULT_VOLUME_DISCOUNT_TIERS = [
  { minItems: 2, percent: 5, label: 'Скидка 5% за 2 украшения' },
  { minItems: 3, percent: 10, label: 'Скидка 10% за комплект от 3 украшений' },
  { minItems: 5, percent: 15, label: 'Скидка 15% за комплект от 5 украшений' }
];
const DEFAULT_FREE_SHIPPING_MIN = 10000;

let promoConfig = {
  freeShippingMin: DEFAULT_FREE_SHIPPING_MIN,
  volumeDiscountTiers: DEFAULT_VOLUME_DISCOUNT_TIERS
};
let shippingQuote = {
  resolved: false,
  cost: 0,
  label: 'Укажите город и способ доставки'
};
let quoteTimer = null;

initCart();

function initCart() {
  renderCart();
  loadPromoConfig();

  cartList?.addEventListener('click', handleCartClick);
  cartOrderForm?.addEventListener('submit', handleOrderSubmit);
  cartClearButton?.addEventListener('click', () => {
    App.writeCart([]);
    renderCart();
  });

  ['#cartCountry', '#cartCity', '#cartPostalCode', '#cartDeliveryMethod', '#cartWithinKad']
    .map($)
    .filter(Boolean)
    .forEach((field) => {
      field.addEventListener('input', scheduleQuote);
      field.addEventListener('change', scheduleQuote);
    });

  $('#cartDeliveryMethod')?.addEventListener('change', updatePaymentAvailability);
  $('#cartCity')?.addEventListener('input', updatePaymentAvailability);
  $('#cartWithinKad')?.addEventListener('change', updatePaymentAvailability);

  updatePaymentAvailability();
}

async function loadPromoConfig() {
  try {
    const response = await fetch(`${App.getApiUrl('/public-config')}?cache=${Date.now()}`);
    if (!response.ok) return;

    const data = await response.json();
    const tiers = Array.isArray(data.volume_discount_tiers)
      ? data.volume_discount_tiers.map(normalizeDiscountTier).filter(Boolean)
      : [];

    promoConfig = {
      freeShippingMin: Number(data.free_shipping_min) || DEFAULT_FREE_SHIPPING_MIN,
      volumeDiscountTiers: tiers.length ? sortDiscountTiers(tiers) : DEFAULT_VOLUME_DISCOUNT_TIERS
    };
    GIFT_WRAP_PRICE = Number(data.gift_wrap_price) || GIFT_WRAP_PRICE;
    GIFT_CARD_PRICE = Number(data.gift_card_price) || GIFT_CARD_PRICE;
    refreshGiftOptionLabels();
    renderCart();
  } catch (error) {
    console.warn('Не удалось загрузить условия акции:', error);
  }
}

function handleCartClick(event) {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;

  const index = Number(button.dataset.index);
  const cart = App.readCart();
  const item = cart[index];
  if (!item) return;

  if (button.dataset.cartAction === 'minus') {
    item.quantity = Math.max(1, Number(item.quantity || 1) - 1);
  }

  if (button.dataset.cartAction === 'plus') {
    item.quantity = Number(item.quantity || 1) + 1;
  }

  if (button.dataset.cartAction === 'remove') {
    cart.splice(index, 1);
  }

  App.writeCart(cart);
  renderCart();
  scheduleQuote();
}

function updatePaymentAvailability() {
  const deliveryMethod = $('#cartDeliveryMethod');
  const city = $('#cartCity');
  const withinKad = $('#cartWithinKad');
  const withinKadLabel = $('#withinKadLabel');
  const paymentMethod = $('#cartPaymentMethod');
  if (!deliveryMethod || !city || !withinKad || !paymentMethod) return;

  const courier = deliveryMethod.value === 'spb_courier';
  const spb = /санкт|спб/i.test(city.value);
  const insideKad = withinKad.checked;
  const canPayOnDelivery = courier && spb && insideKad;

  if (withinKadLabel) withinKadLabel.hidden = !courier;

  for (const option of paymentMethod.options) {
    if (option.value !== 'online') {
      option.disabled = !canPayOnDelivery;
    }
  }

  if (paymentMethod.selectedOptions[0]?.disabled) {
    paymentMethod.value = 'online';
  }
}

function scheduleQuote() {
  window.clearTimeout(quoteTimer);
  quoteTimer = window.setTimeout(loadShippingQuote, 350);
}

async function loadShippingQuote() {
  const cart = App.readCart();
  const subtotal = getCartSubtotal(cart);

  if (!cart.length) {
    updateSummary(cart);
    return;
  }

  const body = {
    subtotal,
    country: $('#cartCountry')?.value || '',
    city: $('#cartCity')?.value.trim() || '',
    postal_code: $('#cartPostalCode')?.value.trim() || '',
    delivery_method: $('#cartDeliveryMethod')?.value || '',
    within_kad: Boolean($('#cartWithinKad')?.checked)
  };

  try {
    const response = await fetch('/api/shipping/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    shippingQuote = data;
    setShippingMessage(data.label || '');
  } catch {
    shippingQuote = {
      resolved: false,
      cost: 0,
      label: 'Не удалось рассчитать доставку'
    };
    setShippingMessage(shippingQuote.label);
  }

  updateSummary(cart);
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  showMessage('');

  const cart = App.readCart();
  if (!cart.length) {
    showMessage('Корзина пустая', true);
    return;
  }

  if (!validateOrderForm()) {
    showMessage('Заполните обязательные поля и примите условия', true);
    return;
  }

  setSubmitState(true);

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOrderPayload(cart))
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Не удалось оформить заказ');
    }

    App.writeCart([]);

    if (data.payment_url) {
      location.href = data.payment_url;
      return;
    }

    const order = data.order;
    location.href = `payment-success.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.public_token)}`;
  } catch (error) {
    showMessage(error.message, true);
    setSubmitState(false);
  }
}

function validateOrderForm() {
  const requiredSelectors = [
    '#cartCustomerName',
    '#cartCustomerPhone',
    '#cartCustomerEmail',
    '#cartCity',
    '#cartAddress'
  ];
  let isValid = true;

  requiredSelectors.forEach((selector) => {
    const field = $(selector);
    const invalid = !field?.value.trim();
    field?.classList.toggle('is-invalid', invalid);
    if (invalid) isValid = false;
  });

  const legalConsent = $('#cartLegalConsent');
  const legalLabel = legalConsent?.closest('.cart-check');
  const legalInvalid = !legalConsent?.checked;
  legalLabel?.classList.toggle('is-invalid', legalInvalid);

  return isValid && !legalInvalid;
}

function buildOrderPayload(cart) {
  return {
    customer_name: $('#cartCustomerName').value.trim(),
    customer_phone: $('#cartCustomerPhone').value.trim(),
    customer_telegram: $('#cartCustomerTelegram').value.trim(),
    customer_email: $('#cartCustomerEmail').value.trim(),
    country: $('#cartCountry').value,
    city: $('#cartCity').value.trim(),
    postal_code: $('#cartPostalCode').value.trim(),
    address: $('#cartAddress').value.trim(),
    delivery_method: $('#cartDeliveryMethod').value,
    within_kad: $('#cartWithinKad').checked,
    delivery_comment: $('#cartDeliveryComment').value.trim(),
    payment_method: $('#cartPaymentMethod').value,
    customer_comment: $('#cartCustomerComment').value.trim(),
    legal_consent: $('#cartLegalConsent').checked,
    marketing_consent: $('#cartMarketingConsent').checked,
    items: cart
  };
}

function renderCart() {
  const cart = App.readCart();

  if (!cart.length) {
    cartList.innerHTML = `
      <div class="cart-empty">
        <h2>Корзина пустая</h2>
        <p>Добавьте украшения из каталога или соберите своё изделие в конструкторе.</p>
        <a href="catalog.html">Перейти в каталог</a>
      </div>
    `;
    shippingQuote = { resolved: false, cost: 0, label: '' };
    setShippingMessage('');
    updateSummary(cart);
    return;
  }

  cartList.innerHTML = cart.map(renderCartItem).join('');
  updateSummary(cart);
  scheduleQuote();
}

function renderCartItem(item, index) {
  const quantity = Number(item.quantity || 1);
  const price = Number(item.price || 0);
  const image = App.resolveImageUrl(item.design?.preview_image || item.image || firstImage(item));
  const title = item.title || 'Украшение LiVetta';
  const category = item.category || (item.custom ? 'Индивидуальная сборка' : 'Украшение');

  return `
    <article class="cart-item">
      <div class="cart-item__image">
        ${image ? `<img src="${App.escapeHtml(image)}" alt="${App.escapeHtml(title)}">` : '<span>Фото</span>'}
      </div>
      <div class="cart-item__info">
        <p>${App.escapeHtml(category)}</p>
        <h2>${App.escapeHtml(title)}</h2>
        ${item.description ? `<span>${App.escapeHtml(item.description)}</span>` : ''}
        ${renderDesignInfo(item)}
        <strong>${App.formatPrice(price)} ₽</strong>
      </div>
      <div class="cart-item__controls">
        <div class="cart-qty">
          <button type="button" data-cart-action="minus" data-index="${index}">−</button>
          <span>${quantity}</span>
          <button type="button" data-cart-action="plus" data-index="${index}">+</button>
        </div>
        <p>${App.formatPrice(price * quantity)} ₽</p>
        <button class="cart-remove-button" type="button" data-cart-action="remove" data-index="${index}">Удалить</button>
      </div>
    </article>
  `;
}

function renderDesignInfo(item) {
  const design = item.design || null;
  const composition = getCartComposition(item);

  if (!design && !composition.length) return '';

  const designInfo = [
    design?.type ? `<small>Тип: ${App.escapeHtml(design.type)}</small>` : '',
    design?.size_cm ? `<small>Размер: ${App.escapeHtml(design.size_cm)} см</small>` : '',
    design?.clasp?.name ? `<small>Замок: ${App.escapeHtml(design.clasp.name)}${design.clasp.material ? ` · ${App.escapeHtml(design.clasp.material)}` : ''}</small>` : '',
    design?.stones_count ? `<small>Бусин: ${App.escapeHtml(design.stones_count)}</small>` : ''
  ].join('');

  const compositionInfo = composition.length
    ? `<div class="cart-composition"><b>Состав:</b><span>${composition.map(renderCompositionItem).join(', ')}</span></div>`
    : '';

  return `<div class="cart-design-info">${designInfo}</div>${compositionInfo}`;
}

function renderCompositionItem(item) {
  return `${App.escapeHtml(item.name)} ×${Number(item.count || 0)}`;
}

function getCartComposition(item) {
  if (Array.isArray(item.composition) && item.composition.length) return item.composition;
  if (Array.isArray(item.design?.composition) && item.design.composition.length) return item.design.composition;

  if (Array.isArray(item.design?.stones)) {
    const map = new Map();
    item.design.stones.forEach((stone) => {
      const key = stone.id || stone.name;
      const current = map.get(key) || { name: stone.name || 'Камень', count: 0 };
      current.count += 1;
      map.set(key, current);
    });
    return [...map.values()];
  }

  return [];
}

function updateSummary(cart) {
  const subtotal = getCartSubtotal(cart);
  const shipping = shippingQuote.resolved ? Number(shippingQuote.cost || 0) : 0;
  const itemsCount = cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const discount = calculateVolumeDiscount(subtotal, itemsCount);
  const totalAfterDiscount = Math.max(0, subtotal - discount.amount);

  cartItemsCount.textContent = itemsCount;
  cartSubtotal.textContent = `${App.formatPrice(subtotal)} ₽`;
  if (cartDiscountRow && cartDiscount && cartDiscountLabel) {
    cartDiscountRow.hidden = discount.amount <= 0;
    cartDiscountLabel.textContent = discount.label || 'Скидка';
    cartDiscount.textContent = `−${App.formatPrice(discount.amount)} ₽`;
  }
  cartShipping.textContent = shippingQuote.resolved
    ? (shipping ? `${App.formatPrice(shipping)} ₽` : 'Бесплатно')
    : 'После расчёта';
  cartTotal.textContent = `${App.formatPrice(totalAfterDiscount + shipping)} ₽`;
  renderPromoPanel(cart, subtotal, itemsCount, discount);
}

function getCartSubtotal(cart) {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function calculateVolumeDiscount(subtotal, itemsCount) {
  const tier = getActiveDiscountTier(itemsCount);
  if (!tier || subtotal <= 0) return { amount: 0, label: '', percent: 0 };

  return {
    amount: Math.round((subtotal * tier.percent) / 100),
    label: tier.label || `Скидка ${tier.percent}%`,
    percent: tier.percent
  };
}

function getActiveDiscountTier(itemsCount) {
  return sortDiscountTiers(promoConfig.volumeDiscountTiers)
    .reverse()
    .find((tier) => itemsCount >= tier.minItems) || null;
}

function getNextDiscountTier(itemsCount) {
  return sortDiscountTiers(promoConfig.volumeDiscountTiers)
    .find((tier) => itemsCount < tier.minItems) || null;
}

function sortDiscountTiers(tiers) {
  return [...tiers].sort((a, b) => a.minItems - b.minItems);
}

function normalizeDiscountTier(tier) {
  const minItems = Number(tier.minItems ?? tier.min_items);
  const percent = Number(tier.percent);
  if (!Number.isFinite(minItems) || !Number.isFinite(percent) || minItems <= 0 || percent <= 0) return null;
  return {
    minItems,
    percent,
    label: String(tier.label || `Скидка ${percent}%`).trim()
  };
}

function renderPromoPanel(cart, subtotal, itemsCount, discount) {
  if (!cartPromoPanel) return;

  if (!cart.length) {
    cartPromoPanel.hidden = true;
    cartPromoPanel.innerHTML = '';
    return;
  }

  const nextTier = getNextDiscountTier(itemsCount);
  const freeShippingMin = Number(promoConfig.freeShippingMin) || DEFAULT_FREE_SHIPPING_MIN;
  const shippingLeft = Math.max(freeShippingMin - subtotal, 0);
  const shippingProgress = freeShippingMin > 0 ? Math.min(100, Math.round((subtotal / freeShippingMin) * 100)) : 100;
  const tierMessage = nextTier
    ? `Добавьте ещё ${nextTier.minItems - itemsCount} ${pluralizeJewelry(nextTier.minItems - itemsCount)} — получите скидку ${nextTier.percent}%.`
    : `Максимальная скидка ${discount.percent || getActiveDiscountTier(itemsCount)?.percent || 0}% уже применена.`;
  const shippingMessage = shippingLeft > 0
    ? `До бесплатной доставки по России осталось ${App.formatPrice(shippingLeft)} ₽.`
    : 'Бесплатная доставка по России применится автоматически.';

  cartPromoPanel.hidden = false;
  cartPromoPanel.innerHTML = `
    <div class="cart-promo-panel__top">
      <span>Акция</span>
      <strong>${discount.amount > 0 ? `${discount.label}: −${App.formatPrice(discount.amount)} ₽` : 'Скидка за комплект применится автоматически'}</strong>
      <p>${tierMessage}</p>
    </div>
    <div class="cart-promo-progress" aria-label="Прогресс до бесплатной доставки">
      <span style="width:${shippingProgress}%"></span>
    </div>
    <small>${shippingMessage}</small>
    <div class="cart-promo-panel__actions">
      <a href="catalog.html">В каталог</a>
      <a href="constructor.html">Собрать колье</a>
    </div>
  `;
}

function pluralizeJewelry(value) {
  const number = Math.abs(Number(value));
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return 'украшение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'украшения';
  return 'украшений';
}

function firstImage(item) {
  return Array.isArray(item.product_images) && item.product_images[0] ? item.product_images[0] : '';
}

function setShippingMessage(message) {
  const target = $('#cartShippingMessage');
  if (target) target.textContent = message;
}

function showMessage(message, error = false) {
  cartOrderMessage.textContent = message;
  cartOrderMessage.classList.toggle('is-error', error);
}

function setSubmitState(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? 'Создаём заказ…' : 'Оформить заказ';
}

/* Gift upsell: wrapping and postcard */
let GIFT_WRAP_PRICE = 300;
let GIFT_CARD_PRICE = 150;

let giftOptions = {
  wrap: false,
  card: false,
  message: ''
};

const originalGiftUpdateSummary = updateSummary;
const originalGiftBuildOrderPayload = buildOrderPayload;

updateSummary = function updateSummaryWithGiftOptions(cart) {
  originalGiftUpdateSummary(cart);
  updateGiftServicesSummary(cart);
};

buildOrderPayload = function buildOrderPayloadWithGiftOptions(cart) {
  const payload = originalGiftBuildOrderPayload(cart);
  payload.gift_wrap = giftOptions.wrap;
  payload.gift_card = giftOptions.card;
  payload.gift_message = giftOptions.card ? giftOptions.message : '';
  return payload;
};

initGiftOptions();

function initGiftOptions() {
  ensureGiftSummaryRow();
  ensureGiftOptionsBlock();
  bindGiftOptions();
  renderCart();
}

function ensureGiftSummaryRow() {
  if ($('#cartServicesRow')) return;

  const shippingRow = $('#cartShipping')?.closest('.cart-summary-row');
  if (!shippingRow) return;

  const row = document.createElement('div');
  row.className = 'cart-summary-row';
  row.id = 'cartServicesRow';
  row.hidden = true;
  row.innerHTML = '<p>Подарочные опции</p><strong id="cartServices">0 ₽</strong>';
  shippingRow.before(row);
}

function ensureGiftOptionsBlock() {
  if ($('#cartGiftOptions')) return;

  const paymentMethod = $('#cartPaymentMethod');
  if (!paymentMethod) return;

  const title = document.createElement('h3');
  title.className = 'cart-gift-title';
  title.textContent = 'Подарок';

  const block = document.createElement('div');
  block.className = 'cart-gift-options';
  block.id = 'cartGiftOptions';
  block.innerHTML = `
    <label class="cart-check cart-gift-option">
      <input id="cartGiftWrap" type="checkbox">
      <span><b>Подарочная упаковка</b><small>Фирменная подача LiVetta +${GIFT_WRAP_PRICE} ₽</small></span>
    </label>
    <label class="cart-check cart-gift-option">
      <input id="cartGiftCard" type="checkbox">
      <span><b>Открытка с вашим текстом</b><small>Аккуратная карточка к заказу +${GIFT_CARD_PRICE} ₽</small></span>
    </label>
    <textarea id="cartGiftMessage" class="cart-gift-message" placeholder="Текст для открытки" hidden></textarea>
  `;

  paymentMethod.after(block);
  block.before(title);
}

function refreshGiftOptionLabels() {
  const wrapText = $('#cartGiftWrap')?.closest('.cart-gift-option')?.querySelector('small');
  const cardText = $('#cartGiftCard')?.closest('.cart-gift-option')?.querySelector('small');
  if (wrapText) wrapText.textContent = `Фирменная подача LiVetta +${App.formatPrice(GIFT_WRAP_PRICE)} ₽`;
  if (cardText) cardText.textContent = `Аккуратная карточка к заказу +${App.formatPrice(GIFT_CARD_PRICE)} ₽`;
  updateSummary(App.readCart());
}

function bindGiftOptions() {
  $('#cartGiftWrap')?.addEventListener('change', syncGiftOptions);
  $('#cartGiftCard')?.addEventListener('change', syncGiftOptions);
  $('#cartGiftMessage')?.addEventListener('input', syncGiftOptions);
  syncGiftOptions();
}

function syncGiftOptions() {
  const wrap = $('#cartGiftWrap');
  const card = $('#cartGiftCard');
  const message = $('#cartGiftMessage');

  giftOptions = {
    wrap: Boolean(wrap?.checked),
    card: Boolean(card?.checked),
    message: message?.value.trim() || ''
  };

  if (message) {
    message.hidden = !giftOptions.card;
  }

  updateSummary(App.readCart());
}

function getGiftServicesTotal() {
  return (giftOptions.wrap ? GIFT_WRAP_PRICE : 0) + (giftOptions.card ? GIFT_CARD_PRICE : 0);
}

function updateGiftServicesSummary(cart) {
  const servicesTotal = getGiftServicesTotal();
  const row = $('#cartServicesRow');
  const value = $('#cartServices');

  if (row) row.hidden = servicesTotal <= 0 || !cart.length;
  if (value) value.textContent = `${App.formatPrice(servicesTotal)} ₽`;

  const total = $('#cartTotal');
  if (!total || !cart.length) return;

  const current = Number(total.textContent.replace(/[^\d.-]/g, '')) || 0;
  total.textContent = `${App.formatPrice(current + servicesTotal)} ₽`;
}

/* Cart page now stays lightweight; full form lives on checkout.html */
const isCheckoutPage = /checkout\.html$/i.test(window.location.pathname);
const originalSplitRenderCart = renderCart;

renderCart = function renderCartWithSplitCheckout() {
  originalSplitRenderCart();
  syncCheckoutSplit();
};

initCheckoutSplit();

function initCheckoutSplit() {
  document.body.classList.toggle('is-checkout-page', isCheckoutPage);
  document.body.classList.toggle('is-cart-preview-page', !isCheckoutPage);
  syncCheckoutSplit();
}

function syncCheckoutSplit() {
  const form = $('#cartOrderForm');
  const clearButton = $('#cartClearButton');
  const cart = App.readCart();

  if (!isCheckoutPage) {
    if (form) form.hidden = true;
    ensureCheckoutLink(cart);
    return;
  }

  if (form) form.hidden = false;
  if (clearButton) clearButton.textContent = 'Очистить корзину';
}

function ensureCheckoutLink(cart) {
  const summary = document.querySelector('.cart-summary');
  const clearButton = $('#cartClearButton');
  const existing = $('#cartCheckoutLink');
  if (existing) {
    existing.classList.toggle('is-disabled', !cart.length);
    existing.setAttribute('aria-disabled', cart.length ? 'false' : 'true');
    return;
  }
  if (!summary) return;

  const link = document.createElement('a');
  link.id = 'cartCheckoutLink';
  link.className = 'cart-checkout-link';
  link.href = 'checkout.html';
  link.textContent = 'Оформить заказ';
  link.setAttribute('aria-disabled', cart.length ? 'false' : 'true');
  link.classList.toggle('is-disabled', !cart.length);
  link.addEventListener('click', (event) => {
    if (!App.readCart().length) event.preventDefault();
  });

  if (clearButton) {
    clearButton.before(link);
  } else {
    summary.append(link);
  }
}
