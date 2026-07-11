const App = window.Livetta;
const $ = (selector) => document.querySelector(selector);

const cartList = $('#cartList');
const cartItemsCount = $('#cartItemsCount');
const cartSubtotal = $('#cartSubtotal');
const cartShipping = $('#cartShipping');
const cartTotal = $('#cartTotal');
const cartClearButton = $('#cartClearButton');
const cartOrderForm = $('#cartOrderForm');
const cartOrderMessage = $('#cartOrderMessage');
const submitButton = $('#cartSubmitButton');

let shippingQuote = {
  resolved: false,
  cost: 0,
  label: 'Укажите город и способ доставки'
};
let quoteTimer = null;

initCart();

function initCart() {
  renderCart();

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
  const title = item.title || 'Украшение Livetta';
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
        ${renderProductSizeInfo(item)}
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


function renderProductSizeInfo(item) {
  if (item.custom || !item.selected_size) return '';
  const size = item.selected_size;
  const note = item.carabiner_extension_note || 'При заказе украшения с замком карабин есть удлинение 4 см.';
  return `<div class="cart-product-size"><small>Размер: ${App.escapeHtml(size.label)} · ${App.escapeHtml(formatSizeCm(size.cm))} см</small><small>${App.escapeHtml(note)}</small></div>`;
}

function renderDesignInfo(item) {
  const design = item.design || null;
  const composition = getCartComposition(item);

  if (!design && !composition.length) return '';

  const designInfo = [
    design?.type ? `<small>Тип: ${App.escapeHtml(design.type)}</small>` : '',
    design?.size_cm ? `<small>Размер: ${design.size_label ? `${App.escapeHtml(design.size_label)} · ` : ''}${App.escapeHtml(formatSizeCm(design.size_cm))} см</small>` : '',
    design?.clasp?.name ? `<small>Замок: ${App.escapeHtml(design.clasp.name)}${design.clasp.material ? ` · ${App.escapeHtml(design.clasp.material)}` : ''}${design.clasp.id === 'lobster-steel' ? ' · удлинение 4 см' : ''}</small>` : '',
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

  cartItemsCount.textContent = itemsCount;
  cartSubtotal.textContent = `${App.formatPrice(subtotal)} ₽`;
  cartShipping.textContent = shippingQuote.resolved
    ? (shipping ? `${App.formatPrice(shipping)} ₽` : 'Бесплатно')
    : 'После расчёта';
  cartTotal.textContent = `${App.formatPrice(subtotal + shipping)} ₽`;
}

function getCartSubtotal(cart) {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
}

function formatSizeCm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace('.', ',') : value;
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
