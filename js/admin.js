const App = window.Livetta;
const API_URL = App.getApiUrl();

const loginSection = document.querySelector('#loginSection');
const adminPanel = document.querySelector('#adminPanel');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const productForm = document.querySelector('#productForm');
const stoneForm = document.querySelector('#stoneForm');
const categoryForm = document.querySelector('#categoryForm');

const adminProducts = document.querySelector('#adminProducts');
const adminStones = document.querySelector('#adminStones');
const adminCategories = document.querySelector('#adminCategories');
const adminOrders = document.querySelector('#adminOrders');
const productsStockSummary = document.querySelector('#productsStockSummary');
const stonesStockSummary = document.querySelector('#stonesStockSummary');

const carouselForm = document.querySelector('#carouselForm');
const carouselAdminPreview = document.querySelector('#carouselAdminPreview');
const popularProductsAdmin = document.querySelector('#popularProductsAdmin');

const categorySelect = document.querySelector('#category');
const adminUserBadge = document.querySelector('#adminUserBadge');
const ordersExportLink = document.querySelector('#ordersExportLink');
const backupButton = document.querySelector('#backupButton');
const userForm = document.querySelector('#userForm');
const adminUsers = document.querySelector('#adminUsers');
const adminTabs = document.querySelector('#adminTabs');
const adminToast = document.querySelector('#adminToast');
const logoutButton = document.querySelector('#logoutButton');
const loginSubmitButton = document.querySelector('#loginSubmitButton');
const ordersExcelSyncButton = document.querySelector('#ordersExcelSyncButton');
const ordersExcelImportButton = document.querySelector('#ordersExcelImportButton');
const ordersExcelImportInput = document.querySelector('#ordersExcelImportInput');
let currentUser = null;
let toastTimer = null;
let adminRefreshTimer = null;

let productCategories = ['Ожерелье', 'Колье', 'Кольцо', 'Браслет', 'Серьги'];

init();

function getApiUrl() {
  return App.getApiUrl();
}

function init() {
  loginForm?.addEventListener('submit', handleLogin);
  productForm?.addEventListener('submit', handleProductCreate);
  productForm?.addEventListener('click', handleProductStoneEditorClick);
  stoneForm?.addEventListener('submit', handleStoneCreate);
  categoryForm?.addEventListener('submit', handleCategoryCreate);
  adminCategories?.addEventListener('click', handleCategoryClick);
  carouselForm?.addEventListener('submit', handleCarouselUpdate);
  carouselAdminPreview?.addEventListener('click', handleCarouselPreviewClick);
  popularProductsAdmin?.addEventListener('click', handlePopularProductsClick);
  adminProducts?.addEventListener('submit', handleProductEditSubmit);
  adminProducts?.addEventListener('click', handleProductClick);
  adminProducts?.addEventListener('click', handleProductStoneEditorClick);
  adminStones?.addEventListener('submit', handleStoneEditSubmit);
  adminStones?.addEventListener('click', handleStoneClick);
  adminOrders?.addEventListener('click', handleOrderClick);
  adminOrders?.addEventListener('submit', handleOrderDetailsSubmit);
  userForm?.addEventListener('submit', handleUserCreate);
  adminUsers?.addEventListener('submit', handleUserEdit);
  adminTabs?.addEventListener('click', handleAdminTabClick);
  backupButton?.addEventListener('click', createBackup);
  logoutButton?.addEventListener('click', logoutAdmin);
  ordersExcelSyncButton?.addEventListener('click', syncOrdersExcel);
  ordersExcelImportButton?.addEventListener('click', importOrdersExcel);
  adminUsers?.addEventListener('click', handleUserClick);

  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    handleAdminError(event.reason, 'Не удалось выполнить действие');
  });

  if (getToken()) {
    openAdmin();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginMessage('');
  setButtonBusy(loginSubmitButton, true, 'Входим…');

  const formData = new FormData(loginForm);

  try {
    const data = await apiFetch('/login', {
      method: 'POST',
      auth: false,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: getFormValue(formData, 'login'),
        password: getFormValue(formData, 'password')
      })
    });

    localStorage.setItem('admin_token', data.token);
    await openAdmin();
    showAdminToast('Вход выполнен');
  } catch (error) {
    setLoginMessage(error.message || 'Не удалось войти. Проверьте логин и пароль.', true);
  } finally {
    setButtonBusy(loginSubmitButton, false);
  }
}

async function openAdmin() {
  try {
    const profile = await apiFetch('/me');
    currentUser = profile.user;
  } catch (error) {
    logoutAdmin(false);
    setLoginMessage(error.message || 'Сессия недействительна. Войдите заново.', true);
    return;
  }

  loginSection.hidden = true;
  adminPanel.hidden = false;
  setLoginMessage('');
  adminUserBadge.textContent = `${currentUser.login} · ${getRoleText(currentUser.role)}`;
  setupAdminPages();

  if (ordersExportLink) {
    ordersExportLink.hidden = !['owner', 'admin'].includes(currentUser.role);
    ordersExportLink.onclick = exportOrders;
  }

  if (backupButton) {
    backupButton.hidden = currentUser.role !== 'owner';
  }

  const tasks = [];
  if (['owner', 'admin'].includes(currentUser.role)) {
    tasks.push(loadCategories(), loadOrders(), loadProducts(), loadCarouselSlides(), loadPopularProducts());
  }
  tasks.push(loadStones());
  if (currentUser.role === 'owner') {
    tasks.push(loadUsers());
  }
  startAdminAutoRefresh();

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) {
    showAdminToast(`Часть данных не загрузилась: ${failed.length}`, 'error');
  }
}

function handleAdminTabClick(event) {
  const button = event.target.closest('[data-admin-tab]');
  if (!button || button.hidden) return;
  setActiveAdminPage(button.dataset.adminTab);
  if (button.dataset.adminTab === 'stones') loadStones().catch(() => {});
  if (button.dataset.adminTab === 'orders') loadOrders().catch(() => {});
}

function setupAdminPages() {
  const savedPage = localStorage.getItem('livetta_admin_tab');
  const allowedTabs = Array.from(document.querySelectorAll('[data-admin-tab]'))
    .filter((button) => isAllowedForCurrentRole(button));
  const pageName = allowedTabs.some((button) => button.dataset.adminTab === savedPage)
    ? savedPage
    : allowedTabs[0]?.dataset.adminTab || 'orders';

  setActiveAdminPage(pageName);
}

function setActiveAdminPage(pageName) {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const allowed = isAllowedForCurrentRole(button);
    button.hidden = !allowed;
    button.classList.toggle('is-active', allowed && button.dataset.adminTab === pageName);
    button.setAttribute('aria-selected', String(allowed && button.dataset.adminTab === pageName));
  });

  document.querySelectorAll('[data-admin-page]').forEach((page) => {
    const isActive = page.dataset.adminPage === pageName;
    page.hidden = !isActive || !isAllowedForCurrentRole(page);
  });

  document.querySelectorAll('[data-roles]:not([data-admin-tab]):not([data-admin-page])').forEach((section) => {
    section.hidden = !isAllowedForCurrentRole(section);
  });

  localStorage.setItem('livetta_admin_tab', pageName);
}

function isAllowedForCurrentRole(element) {
  const roles = element.dataset.roles;
  return !roles || roles.split(',').includes(currentUser?.role);
}

function logoutAdmin(showMessage = true) {
  localStorage.removeItem('admin_token');
  currentUser = null;
  window.clearInterval(adminRefreshTimer);
  adminPanel.hidden = true;
  loginSection.hidden = false;
  loginForm?.reset();
  if (showMessage) {
    setLoginMessage('Вы вышли из админки.');
  }
}

async function exportOrders(event) {
  event?.preventDefault();
  try {
    const response = await fetch(`${API_URL}/orders-export.xlsx`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) throw new Error((await response.text()) || 'Не удалось выгрузить заказы');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'livetta-orders.xlsx';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showAdminToast('Excel-файл сформирован');
  } catch (error) {
    handleAdminError(error, 'Не удалось выгрузить заказы');
  }
}

async function syncOrdersExcel() {
  setButtonBusy(ordersExcelSyncButton, true, 'Обновляем…');
  try {
    const result = await apiFetch('/orders-excel/sync', { method: 'POST' });
    showAdminToast(result?.message || 'Excel-файл обновлён');
  } catch (error) {
    handleAdminError(error, 'Не удалось обновить Excel-файл');
  } finally {
    setButtonBusy(ordersExcelSyncButton, false);
  }
}

async function importOrdersExcel() {
  const file = ordersExcelImportInput?.files?.[0];
  if (!file) {
    showAdminToast('Выберите Excel-файл', 'error');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  setButtonBusy(ordersExcelImportButton, true, 'Импортируем…');
  try {
    const result = await apiFetch('/orders-import.xlsx', { method: 'POST', body: formData });
    ordersExcelImportInput.value = '';
    await Promise.all([loadOrders(), loadStones(), loadProducts()]);
    showAdminToast(result?.message || 'Изменения из Excel применены');
  } catch (error) {
    handleAdminError(error, 'Не удалось импортировать Excel');
  } finally {
    setButtonBusy(ordersExcelImportButton, false);
  }
}

function startAdminAutoRefresh() {
  window.clearInterval(adminRefreshTimer);
  adminRefreshTimer = window.setInterval(async () => {
    if (document.hidden || document.activeElement?.matches('input, textarea, select')) return;
    const active = document.querySelector('[data-admin-tab].is-active')?.dataset.adminTab;
    try {
      if (active === 'orders' && ['owner', 'admin'].includes(currentUser?.role)) await loadOrders();
      if (active === 'stones') await loadStones();
    } catch {}
  }, 10000);
}

function showAdminToast(message, type = 'success', duration = 3200) {
  if (!adminToast || !message) return;
  clearTimeout(toastTimer);
  adminToast.textContent = message;
  adminToast.dataset.type = type;
  adminToast.classList.add('is-visible');
  toastTimer = setTimeout(() => adminToast.classList.remove('is-visible'), duration);
}

function handleAdminError(error, fallback = 'Произошла ошибка') {
  const message = error?.message || fallback;
  showAdminToast(message, 'error', 4800);
  console.error(error);
}

function setButtonBusy(button, busy, busyText = 'Сохраняем…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function requireSecondClick(button, message = 'Нажмите ещё раз для подтверждения') {
  if (!button) return false;
  const now = Date.now();
  if (Number(button.dataset.confirmUntil || 0) > now) {
    delete button.dataset.confirmUntil;
    if (button.dataset.originalDeleteText) {
      button.textContent = button.dataset.originalDeleteText;
      delete button.dataset.originalDeleteText;
    }
    return true;
  }

  button.dataset.confirmUntil = String(now + 3500);
  button.dataset.originalDeleteText = button.textContent;
  button.textContent = message;
  setTimeout(() => {
    if (Number(button.dataset.confirmUntil || 0) <= Date.now()) {
      delete button.dataset.confirmUntil;
      if (button.dataset.originalDeleteText) {
        button.textContent = button.dataset.originalDeleteText;
        delete button.dataset.originalDeleteText;
      }
    }
  }, 3600);
  return false;
}

function setLoginMessage(message, error = false) {
  if (!loginMessage) return;
  loginMessage.textContent = message;
  loginMessage.classList.toggle('is-error', error);
}


/* Orders */
async function loadOrders() {
  if (!adminOrders) {
    return;
  }

  try {
    adminOrders.innerHTML = '<p class="muted-text">Загрузка заявок...</p>';
    const orders = await apiFetch(`/orders?cache=${Date.now()}`);

    if (!Array.isArray(orders) || !orders.length) {
      adminOrders.innerHTML = '<p class="muted-text">Заявок пока нет</p>';
      return;
    }

    adminOrders.innerHTML = orders.map(renderOrder).join('');
  } catch (error) {
    adminOrders.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderOrder(order) {
  const items=Array.isArray(order.items)?order.items:[];
  const statusOptions=['new','awaiting_payment','awaiting_shipping_quote','paid','work','ready','shipped','delivered','cancelled','refund','expired'].map(status=>`<option value="${status}" ${order.status===status?'selected':''}>${getOrderStatusText(status)}</option>`).join('');
  return `<article class="admin-order-card"><div class="admin-order-card__head"><div><strong>Заказ №${order.id}</strong><span>${formatDateTime(order.created_at)}</span></div><em class="admin-order-status admin-order-status--${escapeHtml(order.status||'new')}">${escapeHtml(getOrderStatusText(order.status))}</em></div><div class="admin-order-client"><p><b>Имя:</b> ${escapeHtml(order.customer_name||'')}</p><p><b>Телефон:</b> ${escapeHtml(order.customer_phone||'')}</p><p><b>Email:</b> ${escapeHtml(order.customer_email||'')}</p><p><b>Telegram:</b> ${escapeHtml(order.customer_telegram||'—')}</p><p><b>Адрес:</b> ${escapeHtml([order.postal_code,order.country,order.city,order.address].filter(Boolean).join(', '))}</p><p><b>Доставка:</b> ${escapeHtml(order.delivery_method)} · ${formatPrice(order.shipping_cost)} ₽</p><p><b>Оплата:</b> ${escapeHtml(order.payment_method)} · ${escapeHtml(order.payment_status)}</p>${order.customer_comment?`<p><b>Комментарий:</b> ${escapeHtml(order.customer_comment)}</p>`:''}</div><div class="admin-order-items">${items.map(renderOrderItem).join('')}</div><div class="admin-order-total"><span>Итого</span><strong>${formatPrice(order.total)} ₽</strong></div>
  <form class="admin-order-details-form" data-id="${order.id}" data-payment-status="${escapeHtml(order.payment_status||'pending')}"><label>Статус<select name="status">${statusOptions}</select></label><label>Стоимость доставки<input name="shipping_cost" type="number" min="0" value="${Number(order.shipping_cost||0)}"></label><label>Трек-номер<input name="tracking_number" value="${escapeHtml(order.tracking_number||'')}"></label><label>Ссылка на чек «Мой налог»<input name="receipt_url" value="${escapeHtml(order.receipt_url||'')}"></label><label class="admin-check"><input name="receipt_sent" type="checkbox" ${order.receipt_sent_at?'checked':''}> Чек отправлен покупателю</label><label>Комментарий администратора<textarea name="admin_note">${escapeHtml(order.admin_note||'')}</textarea></label><button type="submit">Сохранить заказ</button></form>
  <details class="admin-order-history"><summary>История заказа</summary>${(order.history||[]).map(h=>`<p><b>${escapeHtml(h.event)}</b> · ${formatDateTime(h.created_at)}<br>${escapeHtml(h.details||'')}</p>`).join('')||'<p>История пуста</p>'}</details>${order.payment_method==='online' && order.payment_status!=='succeeded' && order.shipping_resolved ? `<button type="button" data-action="create-payment-link" data-id="${order.id}">Создать ссылку на оплату</button>` : ''}${currentUser?.role==='owner'?`<button type="button" data-action="delete-order" data-id="${order.id}">Удалить заказ</button>`:''}</article>`;
}

function renderOrderItem(item) {
  const quantity = Number(item.quantity || 1);
  const price = Number(item.price || 0);
  const design = item.design || null;
  const image = resolveImage(design?.preview_image || item.image || '');
  const composition = getOrderComposition(item);

  return `
    <div class="admin-order-item ${image ? 'admin-order-item--with-image' : ''}">
      ${image ? `<div class="admin-order-item__image"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.title || 'Украшение')}"></div>` : ''}

      <div>
        <strong>${escapeHtml(item.title || 'Украшение LiVetta')}</strong>
        <span>${escapeHtml(item.category || (item.custom ? 'Индивидуальная сборка' : 'Украшение'))}</span>
        ${design ? `<small>${renderOrderDesign(design)}</small>` : ''}
        ${composition.length ? `<small><b>Состав:</b> ${composition.map((part) => `${escapeHtml(part.name)} ×${Number(part.count || 0)}`).join(', ')}</small>` : ''}
      </div>

      <p>${quantity} × ${formatPrice(price)} ₽</p>
    </div>
  `;
}

function renderOrderDesign(design) {
  return [
    design.type ? `Тип: ${design.type}` : '',
    design.size_cm ? `Размер: ${design.size_cm} см` : '',
    design.clasp?.name ? `Замок: ${design.clasp.name}${design.clasp.material ? ` · ${design.clasp.material}` : ''}` : '',
    design.stones_count ? `Бусин: ${design.stones_count}` : '',
    !design.stones_count && Array.isArray(design.stones) ? `Бусин: ${design.stones.length}` : ''
  ].filter(Boolean).map(escapeHtml).join(' · ');
}

function getOrderComposition(item) {
  if (Array.isArray(item.composition) && item.composition.length) {
    return item.composition;
  }

  if (Array.isArray(item.design?.composition) && item.design.composition.length) {
    return item.design.composition;
  }

  if (Array.isArray(item.design?.stones) && item.design.stones.length) {
    const map = new Map();

    item.design.stones.forEach((stone) => {
      const key = `${stone.id || stone.name}-${stone.size_mm || ''}`;
      const current = map.get(key) || {
        name: stone.name || 'Камень',
        count: 0
      };

      current.count += 1;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  return [];
}

async function handleOrderClick(event) {
  const paymentButton = event.target.closest('[data-action="create-payment-link"]');
  if (paymentButton) {
    setButtonBusy(paymentButton, true, 'Создаём ссылку…');
    try {
      const orderId = paymentButton.dataset.id;
      const result = await apiFetch(`/orders/${orderId}/payment-link`, { method: 'POST' });
      if (!result?.payment_url) throw new Error('Платёжная ссылка не получена');

      try {
        await navigator.clipboard.writeText(result.payment_url);
        showAdminToast('Ссылка на оплату скопирована');
      } catch {
        const input = document.createElement('input');
        input.value = result.payment_url;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        showAdminToast('Ссылка на оплату скопирована');
      }
    } catch (error) {
      handleAdminError(error, 'Не удалось создать ссылку на оплату');
    } finally {
      setButtonBusy(paymentButton, false);
    }
    return;
  }

  const deleteButton = event.target.closest('[data-action="delete-order"]');
  if (!deleteButton || !requireSecondClick(deleteButton, 'Ещё раз — удалить заказ')) return;

  setButtonBusy(deleteButton, true, 'Удаляем…');
  try {
    await apiFetch(`/orders/${deleteButton.dataset.id}`, { method: 'DELETE' });
    await loadOrders();
    showAdminToast('Заказ удалён');
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить заказ');
  } finally {
    setButtonBusy(deleteButton, false);
  }
}


function getOrderStatusText(status) { return {new:'Новый',awaiting_payment:'Ожидает оплаты',awaiting_shipping_quote:'Расчёт доставки',paid:'Оплачен',work:'В работе',ready:'Готов',shipped:'Передан в доставку',delivered:'Доставлен',cancelled:'Отменён',refund:'Возврат',expired:'Резерв истёк'}[status]||status; }

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleString('ru-RU');
}


/* Categories */
async function loadCategories() {
  try {
    const data = await apiFetch(`/categories?cache=${Date.now()}`, {
      auth: false
    });

    productCategories = Array.isArray(data?.categories) && data.categories.length
      ? data.categories
      : productCategories;

    renderCategorySelect();
    renderAdminCategories();
  } catch (error) {
    renderCategorySelect();
    if (adminCategories) {
      adminCategories.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
    }
  }
}

function renderCategorySelect(selected = '') {
  if (!categorySelect) {
    return;
  }

  categorySelect.innerHTML = `
    <option value="">Категория</option>
    ${productCategories.map((category) => `
      <option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>
        ${escapeHtml(category)}
      </option>
    `).join('')}
  `;
}

function renderCategoryOptions(selected = '') {
  return productCategories.map((category) => `
    <option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>
      ${escapeHtml(category)}
    </option>
  `).join('');
}

function renderAdminCategories() {
  if (!adminCategories) {
    return;
  }

  adminCategories.innerHTML = productCategories.map((category) => `
    <article class="admin-category-pill">
      <span>${escapeHtml(category)}</span>
      <button type="button" data-action="delete-category" data-name="${escapeHtml(category)}">Удалить</button>
    </article>
  `).join('');
}

async function handleCategoryCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  const formData = new FormData(categoryForm);
  const name = getFormValue(formData, 'name');
  if (!name) {
    showAdminToast('Введите название категории', 'error');
    return;
  }

  setButtonBusy(button, true);
  try {
    await apiFetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    categoryForm.reset();
    await Promise.all([loadCategories(), loadProducts(), loadPopularProducts()]);
    showAdminToast('Категория добавлена');
  } catch (error) {
    handleAdminError(error, 'Не удалось добавить категорию');
  } finally {
    setButtonBusy(button, false);
  }
}


async function handleCategoryClick(event) {
  const button = event.target.closest('[data-action="delete-category"]');
  if (!button || !requireSecondClick(button, 'Ещё раз — удалить')) return;

  setButtonBusy(button, true, 'Удаляем…');
  try {
    await apiFetch(`/categories/${encodeURIComponent(button.dataset.name)}`, { method: 'DELETE' });
    await Promise.all([loadCategories(), loadProducts(), loadPopularProducts()]);
    showAdminToast('Категория удалена');
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить категорию');
  } finally {
    setButtonBusy(button, false);
  }
}

/* Products */
/* Products */
async function handleProductCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  const formData = new FormData(productForm);
  syncProductStonesField(productForm, formData);
  normalizeProductImagesField(formData, productForm.querySelector('#productImage'));

  setButtonBusy(button, true);
  try {
    await apiFetch('/products', { method: 'POST', body: formData });
    productForm.reset();
    resetProductStonesEditor(productForm);
    renderCategorySelect();
    await Promise.all([loadProducts(), loadPopularProducts()]);
    showAdminToast('Украшение добавлено');
  } catch (error) {
    handleAdminError(error, 'Не удалось добавить украшение');
  } finally {
    setButtonBusy(button, false);
  }
}


async function loadProducts() {
  try {
    adminProducts.innerHTML = '<p class="muted-text">Загрузка товаров...</p>';

    const products = await apiFetch(`/admin/products?cache=${Date.now()}`);
    renderProductsStockSummary(products);

    if (!Array.isArray(products) || !products.length) {
      adminProducts.innerHTML = '<p class="muted-text">Товаров пока нет</p>';
      return;
    }

    adminProducts.innerHTML = products.map(renderProduct).join('');
  } catch (error) {
    adminProducts.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderProductsStockSummary(products) {
  if (!productsStockSummary) {
    return;
  }

  const items = Array.isArray(products) ? products : [];
  const totalStock = sumBy(items, 'stock_qty');
  const reserved = sumBy(items, 'reserved_qty');
  const active = items.filter((product) => product.active).length;

  productsStockSummary.innerHTML = `
    ${renderMetric('Готовых изделий', totalStock)}
    ${renderMetric('В активных заказах', reserved)}
    ${renderMetric('Карточек в каталоге', active)}
  `;
}

function renderProduct(product) {
  const images = getProductImages(product);
  const mainImage = resolveImage(images[0] || product.image);
  const stock = Number(product.stock_qty || 0);
  const reserved = Number(product.reserved_qty || 0);
  const available = Math.max(0, stock - reserved);
  const sold = Number(product.sold_qty || 0);
  const productStones = getProductStones(product);

  return `
    <article class="product-card admin-product-card admin-catalog-card">
      <header class="admin-catalog-card__header">
        <div class="admin-product-image">
          ${mainImage ? `<img src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.title)}">` : '<span>Нет фото</span>'}
        </div>
        <div class="admin-catalog-card__heading">
          <span class="admin-chip">${escapeHtml(product.category)}</span>
          <h3>${escapeHtml(product.title)}</h3>
          <strong class="admin-price-badge">${formatPrice(product.price)} ₽</strong>
        </div>
      </header>

      <div class="admin-product-description">
        <span>Описание для карточки</span>
        <p>${formatAdminDescription(product.description)}</p>
      </div>

      ${productStones.length ? `
        <div class="admin-product-stones">
          <span>Камни в украшении</span>
          ${productStones.map(renderAdminProductStone).join('')}
        </div>
      ` : ''}

      <div class="admin-stock-chips">
        <span>Доступно: <b>${available}</b></span>
        <span>В активных заказах: <b>${reserved}</b></span>
        <span>Продано: <b>${sold}</b></span>
        ${product.is_child ? '<span>Детское изделие</span>' : ''}
      </div>

      <form class="admin-stock-form product-stock-form" data-id="${product.id}" data-current-stock="${stock}">
        <span>Быстро изменить общий остаток</span>
        <input name="delta" type="number" min="1" value="1" aria-label="Количество для пополнения или списания">
        <button type="submit" data-stock-action="increase">+ Пополнить</button>
        <button type="submit" data-stock-action="decrease">− Списать</button>
      </form>

      ${images.length ? `<div class="admin-product-gallery">${images.map((image, index) => `
        <div class="admin-product-gallery__item">
          <img src="${escapeHtml(resolveImage(image))}" alt="${escapeHtml(product.title)}">
          <button type="button" data-action="delete-product-image" data-id="${product.id}" data-index="${index}">Удалить</button>
        </div>
      `).join('')}</div>` : ''}

      <details class="admin-edit-details">
        <summary>Редактировать украшение</summary>
        <form class="admin-inline-form admin-edit-form product-edit-form" data-id="${product.id}" enctype="multipart/form-data">
          <div class="admin-edit-grid">
            <label class="admin-field admin-field--wide">
              <span>Название украшения</span>
              <input name="title" value="${escapeHtml(product.title)}" required>
            </label>
            <label class="admin-field">
              <span>Категория</span>
              <select name="category" required>${renderCategoryOptions(product.category)}</select>
            </label>
            <label class="admin-field">
              <span>Цена, ₽</span>
              <input name="price" inputmode="decimal" value="${escapeHtml(product.price)}" required>
            </label>
            <label class="admin-field">
              <span>Общий остаток</span>
              <input name="stock_qty" type="number" min="0" value="${stock}" required>
            </label>
            <label class="admin-field admin-field--wide">
              <span>Описание</span>
              <textarea name="description" required>${escapeHtml(product.description)}</textarea>
            </label>
            ${renderProductStonesEditor(productStones)}
            <label class="file-field admin-file-field admin-field--wide">
              <span>Добавить фотографии</span>
              <input name="images" type="file" accept="image/*" multiple>
            </label>
            <label class="admin-check">
              <input name="is_child" type="checkbox" value="1" ${product.is_child ? 'checked' : ''}>
              <span>Детское украшение</span>
            </label>
            <label class="admin-check">
              <input name="active" type="checkbox" value="true" ${product.active ? 'checked' : ''}>
              <span>Показывать на сайте</span>
            </label>
            <label class="admin-check admin-check--wide">
              <input name="replace_images" type="checkbox" value="1">
              <span>Заменить старые фотографии новыми</span>
            </label>
          </div>
          <div class="admin-form-actions">
            <button type="submit">Сохранить украшение</button>
          </div>
        </form>
      </details>

      <button class="admin-danger-button" type="button" data-action="delete-product" data-id="${product.id}">Удалить украшение</button>
    </article>
  `;
}

function formatAdminDescription(value) {
  return escapeHtml(value || '').replace(/\n/g, '<br>');
}

function getProductStones(product) {
  if (Array.isArray(product?.product_stones)) {
    return product.product_stones.map(normalizeProductStone).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(product?.stones_json || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeProductStone).filter(Boolean) : [];
  } catch {
    return [];
  }
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
    zodiac: String(stone.zodiac || '').trim(),
    stone_property: String(stone.stone_property || stone.property || '').trim()
  };
}

function renderAdminProductStone(stone) {
  const property = getProductStoneProperty(stone);

  return `
    <article>
      <strong>${escapeHtml(stone.name)}</strong>
      ${property ? `<p>${escapeHtml(stone.name)} — ${formatAdminDescription(property)}</p>` : ''}
      ${stone.zodiac ? `<small><b>Знаки зодиака:</b> ${escapeHtml(stone.zodiac)}</small>` : ''}
    </article>
  `;
}

function getProductStoneProperty(stone) {
  return String(stone?.stone_property || stone?.property || stone?.description || '').trim();
}

function renderProductStonesEditor(stones = []) {
  const normalized = (Array.isArray(stones) ? stones : []).map(normalizeProductStone).filter(Boolean);
  const rows = normalized.length ? normalized : [{}];

  return `
    <section class="admin-product-stone-editor admin-field--wide" data-product-stones-editor>
      <input name="product_stones" type="hidden" value="${escapeHtml(JSON.stringify(normalized))}">
      <header class="admin-product-stone-editor__head">
        <div>
          <span>Камни в украшении</span>
          <small>Название камня, его свойства и подходящие знаки зодиака</small>
        </div>
        <button type="button" data-add-product-stone>Добавить камень</button>
      </header>
      <div class="admin-product-stone-editor__list" data-product-stones-list>
        ${rows.map(renderProductStoneEditorRow).join('')}
      </div>
    </section>
  `;
}

function renderProductStoneEditorRow(stone = {}) {
  const property = getProductStoneProperty(stone);

  return `
    <article class="admin-product-stone-row" data-product-stone-row>
      <label>
        <span>Камень</span>
        <input data-product-stone-name value="${escapeHtml(stone.name || '')}" placeholder="Например: аметист">
      </label>
      <label>
        <span>Свойства</span>
        <textarea data-product-stone-property placeholder="Например: обладает мягкой успокаивающей энергией">${escapeHtml(property)}</textarea>
      </label>
      <label>
        <span>Знаки зодиака</span>
        <input data-product-stone-zodiac value="${escapeHtml(stone.zodiac || '')}" placeholder="Например: Рыбы, Водолей, Дева">
      </label>
      <button type="button" data-remove-product-stone>Удалить</button>
    </article>
  `;
}

function handleProductStoneEditorClick(event) {
  const addButton = event.target.closest('[data-add-product-stone]');
  const removeButton = event.target.closest('[data-remove-product-stone]');

  if (addButton) {
    event.preventDefault();
    addProductStoneRow(addButton.closest('[data-product-stones-editor]'));
    return;
  }

  if (removeButton) {
    event.preventDefault();
    const editor = removeButton.closest('[data-product-stones-editor]');
    const row = removeButton.closest('[data-product-stone-row]');
    const rows = editor ? Array.from(editor.querySelectorAll('[data-product-stone-row]')) : [];

    if (row && rows.length > 1) {
      row.remove();
    } else if (row) {
      row.querySelectorAll('input, textarea').forEach((field) => {
        field.value = '';
      });
    }

    syncProductStonesField(removeButton.closest('form'));
  }
}

function addProductStoneRow(editor, stone = {}) {
  const list = editor?.querySelector('[data-product-stones-list]');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', renderProductStoneEditorRow(stone));
}

function resetProductStonesEditor(form) {
  const editor = form?.querySelector('[data-product-stones-editor]');
  const list = editor?.querySelector('[data-product-stones-list]');
  if (!list) return;
  list.innerHTML = renderProductStoneEditorRow({});
  syncProductStonesField(form);
}

function syncProductStonesField(form, formData = null) {
  const stones = readProductStonesEditor(form);
  const value = JSON.stringify(stones);
  const hidden = form?.querySelector('[name="product_stones"]');

  if (hidden) {
    hidden.value = value;
  }

  if (formData) {
    formData.set('product_stones', value);
  }

  return stones;
}

function readProductStonesEditor(form) {
  return Array.from(form?.querySelectorAll('[data-product-stone-row]') || [])
    .map((row) => normalizeProductStone({
      name: row.querySelector('[data-product-stone-name]')?.value,
      stone_property: row.querySelector('[data-product-stone-property]')?.value,
      zodiac: row.querySelector('[data-product-stone-zodiac]')?.value
    }))
    .filter(Boolean);
}

async function handleProductEditSubmit(event) {
  const stockForm = event.target.closest('.product-stock-form');
  if (stockForm) {
    event.preventDefault();
    const button = event.submitter;
    setButtonBusy(button, true);
    try {
      await handleInventoryAdjust(stockForm, 'products', button);
      await Promise.all([loadProducts(), loadPopularProducts()]);
      showAdminToast('Остаток товара обновлён');
    } catch (error) {
      handleAdminError(error, 'Не удалось изменить остаток товара');
    } finally {
      setButtonBusy(button, false);
    }
    return;
  }

  const form = event.target.closest('.product-edit-form');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter;
  const formData = new FormData(form);
  syncProductStonesField(form, formData);
  normalizeProductImagesField(formData, form.querySelector('input[type="file"]'));
  if (form.querySelector('[name="active"]') && !form.querySelector('[name="active"]').checked) {
    formData.set('active', 'false');
  }

  setButtonBusy(button, true);
  try {
    await apiFetch(`/products/${form.dataset.id}`, { method: 'PUT', body: formData });
    await Promise.all([loadProducts(), loadPopularProducts()]);
    showAdminToast('Изменения товара сохранены');
  } catch (error) {
    handleAdminError(error, 'Не удалось сохранить товар');
  } finally {
    setButtonBusy(button, false);
  }
}


async function handleProductClick(event) {
  const imageButton = event.target.closest('[data-action="delete-product-image"]');
  if (imageButton) {
    if (!requireSecondClick(imageButton, 'Ещё раз — удалить фото')) return;
    setButtonBusy(imageButton, true, 'Удаляем…');
    try {
      await apiFetch(`/products/${imageButton.dataset.id}/images/${imageButton.dataset.index}`, { method: 'DELETE' });
      await Promise.all([loadProducts(), loadPopularProducts()]);
      showAdminToast('Фотография удалена');
    } catch (error) {
      handleAdminError(error, 'Не удалось удалить фотографию');
    } finally {
      setButtonBusy(imageButton, false);
    }
    return;
  }

  const productButton = event.target.closest('[data-action="delete-product"]');
  if (!productButton || !requireSecondClick(productButton, 'Ещё раз — удалить товар')) return;

  setButtonBusy(productButton, true, 'Удаляем…');
  try {
    await apiFetch(`/products/${productButton.dataset.id}`, { method: 'DELETE' });
    await Promise.all([loadProducts(), loadPopularProducts()]);
    showAdminToast('Товар удалён');
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить товар');
  } finally {
    setButtonBusy(productButton, false);
  }
}

/* Stones */
/* Stones */
async function handleStoneCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  const formData = new FormData(stoneForm);
  normalizeFileField(formData, stoneForm.querySelector('#stoneImage'));

  setButtonBusy(button, true);
  try {
    await apiFetch('/stones', { method: 'POST', body: formData });
    stoneForm.reset();
    const colorInput = document.querySelector('#stoneColor');
    if (colorInput) colorInput.value = '#b48a78';
    const shapeInput = document.querySelector('#stoneShape');
    if (shapeInput) shapeInput.value = 'round';
    await loadStones();
    showAdminToast('Камень добавлен');
  } catch (error) {
    handleAdminError(error, 'Не удалось добавить камень');
  } finally {
    setButtonBusy(button, false);
  }
}


async function loadStones() {
  try {
    adminStones.innerHTML = '<p class="muted-text">Загрузка камней...</p>';

    const stones = await apiFetch(`/admin/stones?cache=${Date.now()}`);
    renderStonesStockSummary(stones);

    if (!Array.isArray(stones) || !stones.length) {
      adminStones.innerHTML = '<p class="muted-text">Камней пока нет</p>';
      return;
    }

    adminStones.innerHTML = stones.map(renderStone).join('');
  } catch (error) {
    adminStones.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderStonesStockSummary(stones) {
  if (!stonesStockSummary) {
    return;
  }

  const items = Array.isArray(stones) ? stones : [];
  const totalStock = sumBy(items, 'stock_qty');
  const reserved = sumBy(items, 'reserved_qty');
  const active = items.filter((stone) => stone.active).length;

  stonesStockSummary.innerHTML = `
    ${renderMetric('Камней в остатке', totalStock)}
    ${renderMetric('В активных заказах', reserved)}
    ${renderMetric('В конструкторе', active)}
  `;
}

function renderStone(stone) {
  const image=resolveImage(stone.image),color=normalizeColor(stone.color),shape=normalizeStoneShape(stone.stone_shape),canEdit=currentUser?.role!=='master';
  const stock = Number(stone.stock_qty || 0);
  const reserved = Number(stone.reserved_qty || 0);
  const available = Math.max(0, stock - reserved);
  const sold = Number(stone.sold_qty || 0);

  return `
    <article class="stone-admin-card admin-stone-stock-card">
      <header class="admin-stone-stock-card__header">
        <div class="stone-preview">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(stone.name)}">` : `<span style="background:${escapeHtml(color)}"></span>`}
        </div>
        <div>
          <span class="admin-chip">${formatNumber(stone.size_mm)} мм</span>\n          <span class="admin-chip">${getStoneShapeLabel(shape)}</span>
          <h3>${escapeHtml(stone.name)}</h3>
          <strong class="admin-price-badge">${formatPrice(stone.price)} ₽ / шт.</strong>
        </div>
      </header>
      <div class="admin-product-description"><span>Описание камня</span><p>${formatAdminDescription(stone.description)}</p></div>
      ${stone.zodiac ? `<div class="admin-product-description"><span>Знак зодиака</span><p>${formatAdminDescription(stone.zodiac)}</p></div>` : ''}
      ${stone.stone_property ? `<div class="admin-product-description"><span>Свойство камня</span><p>${formatAdminDescription(stone.stone_property)}</p></div>` : ''}
      <div class="admin-stock-chips">
        <span>Доступно: <b>${available}</b></span>
        <span>В активных заказах: <b>${reserved}</b></span>
        <span>Продано камней: <b>${sold}</b></span>
      </div>

      <form class="admin-stock-form stone-stock-form" data-id="${stone.id}" data-current-stock="${stock}">
        <span>Изменить общий склад</span>
        <input name="delta" type="number" min="1" value="1" aria-label="Количество бусин для пополнения или списания">
        <button type="submit" data-stock-action="increase">+ Пополнить</button>
        <button type="submit" data-stock-action="decrease">− Списать</button>
      </form>

      ${canEdit ? `
        <details class="admin-edit-details">
          <summary>Редактировать камень</summary>
          <form class="admin-inline-form admin-edit-form stone-edit-form" data-id="${stone.id}" enctype="multipart/form-data">
            <div class="admin-edit-grid">
              <label class="admin-field admin-field--wide">
                <span>Название камня</span>
                <input name="name" value="${escapeHtml(stone.name)}" required>
              </label>
              <label class="admin-field admin-field--wide">
                <span>Описание</span>
                <textarea name="description" required>${escapeHtml(stone.description)}</textarea>
              </label>
              <label class="admin-field">
                <span>Знак зодиака</span>
                <input name="zodiac" value="${escapeHtml(stone.zodiac || '')}" placeholder="Например: Лев, Весы">
              </label>
              <label class="admin-field admin-field--wide">
                <span>Свойство камня</span>
                <textarea name="stone_property" placeholder="Короткое свойство камня">${escapeHtml(stone.stone_property || '')}</textarea>
              </label>
              <label class="admin-field">
                <span>Цена за одну бусину, ₽</span>
                <input name="price" inputmode="decimal" value="${escapeHtml(stone.price)}" required>
              </label>
              <label class="admin-field">
                <span>Размер бусины, мм</span>
                <input name="size_mm" inputmode="decimal" value="${escapeHtml(stone.size_mm)}" required>
              </label>
              <label class="admin-field">
                <span>Форма камня</span>
                <select name="stone_shape">
                  <option value="round" ${shape === 'round' ? 'selected' : ''}>Круг</option>
                  <option value="square" ${shape === 'square' ? 'selected' : ''}>Квадрат</option>
                  <option value="diamond" ${shape === 'diamond' ? 'selected' : ''}>Ромб</option>
                  <option value="rectangle" ${shape === 'rectangle' ? 'selected' : ''}>Прямоугольник</option>
                  <option value="triangle" ${shape === 'triangle' ? 'selected' : ''}>Треугольник</option>
                  <option value="faceted" ${shape === 'faceted' ? 'selected' : ''}>Многогранный</option>
                </select>
              </label>
              <label class="admin-field">
                <span>Общий остаток</span>
                <input name="stock_qty" type="number" min="0" value="${stock}" required>
              </label>
              <label class="admin-field admin-color-field">
                <span>Цвет камня</span>
                <input name="color" type="color" value="${escapeHtml(color)}">
              </label>
              <label class="file-field admin-file-field admin-field--wide">
                <span>Новое фото камня</span>
                <input name="image" type="file" accept="image/*">
              </label>
              <label class="admin-check admin-check--wide">
                <input name="active" type="checkbox" value="true" ${stone.active ? 'checked' : ''}>
                <span>Доступен в конструкторе</span>
              </label>
            </div>
            <div class="admin-form-actions">
              <button type="submit">Сохранить камень</button>
            </div>
          </form>
        </details>
        <button class="admin-danger-button" type="button" data-action="delete-stone" data-id="${stone.id}">Удалить камень</button>
      ` : ''}
    </article>
  `;
}

async function handleStoneEditSubmit(event) {
  const stockForm = event.target.closest('.stone-stock-form');
  if (stockForm) {
    event.preventDefault();
    const button = event.submitter;
    setButtonBusy(button, true);
    try {
      await handleInventoryAdjust(stockForm, 'stones', button);
      await loadStones();
      showAdminToast('Склад бусин обновлён');
    } catch (error) {
      handleAdminError(error, 'Не удалось изменить склад бусин');
    } finally {
      setButtonBusy(button, false);
    }
    return;
  }

  const form = event.target.closest('.stone-edit-form');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter;
  const formData = new FormData(form);
  normalizeFileField(formData, form.querySelector('input[type="file"]'));
  if (!form.querySelector('[name="active"]').checked) formData.set('active', 'false');

  setButtonBusy(button, true);
  try {
    await apiFetch(`/stones/${form.dataset.id}`, { method: 'PUT', body: formData });
    await loadStones();
    showAdminToast('Изменения камня сохранены');
  } catch (error) {
    handleAdminError(error, 'Не удалось сохранить камень');
  } finally {
    setButtonBusy(button, false);
  }
}


async function handleStoneClick(event) {
  const button = event.target.closest('[data-action="delete-stone"]');
  if (!button || !requireSecondClick(button, 'Ещё раз — удалить камень')) return;

  setButtonBusy(button, true, 'Удаляем…');
  try {
    await apiFetch(`/stones/${button.dataset.id}`, { method: 'DELETE' });
    await loadStones();
    showAdminToast('Камень удалён');
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить камень');
  } finally {
    setButtonBusy(button, false);
  }
}


async function handleInventoryAdjust(form, entity, submitter = null) {
  const formData = new FormData(form);
  const currentStock = Number(form.dataset.currentStock || 0);
  const delta = Math.max(1, Number(formData.get('delta') || 1));
  const action = submitter?.dataset.stockAction || 'increase';
  const nextStock = action === 'decrease'
    ? Math.max(0, currentStock - delta)
    : currentStock + delta;

  await apiFetch(`/inventory/${entity}/${form.dataset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_qty: nextStock })
  });
}

/* Carousel */
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
    slides.push({ id: 'legacy-slide-1', image: data.slide1 });
  }

  if (data?.slide2) {
    slides.push({ id: 'legacy-slide-2', image: data.slide2 });
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
        <input type="number" min="1" max="${totalCount}" value="${index + 1}" data-carousel-order-id="${escapeHtml(id)}">
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
  const button = event.submitter;
  const input = carouselForm.querySelector('#carouselImages');
  const files = Array.from(input?.files || []);

  if (!files.length) {
    showAdminToast('Выберите хотя бы одно изображение', 'error');
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append('slides', file));

  setButtonBusy(button, true, 'Загружаем…');
  try {
    await apiFetch('/carousel', { method: 'POST', body: formData });
    carouselForm.reset();
    await loadCarouselSlides();
    showAdminToast('Фотографии карусели добавлены');
  } catch (error) {
    handleAdminError(error, 'Не удалось загрузить карусель');
  } finally {
    setButtonBusy(button, false);
  }
}


async function handleCarouselPreviewClick(event) {
  const deleteButton = event.target.closest('[data-action="delete-carousel-slide"]');
  const saveOrderButton = event.target.closest('[data-action="save-carousel-order"]');

  if (saveOrderButton) {
    await saveCarouselOrder(saveOrderButton);
    return;
  }

  if (!deleteButton || !requireSecondClick(deleteButton, 'Ещё раз — удалить фото')) return;

  setButtonBusy(deleteButton, true, 'Удаляем…');
  try {
    await apiFetch(`/carousel/${deleteButton.dataset.id}`, { method: 'DELETE' });
    await loadCarouselSlides();
    showAdminToast('Фото карусели удалено');
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить фото');
  } finally {
    setButtonBusy(deleteButton, false);
  }
}


async function saveCarouselOrder(button = null) {
  const inputs = Array.from(document.querySelectorAll('[data-carousel-order-id]'));
  const orderedIds = inputs
    .map((input, currentIndex) => ({
      id: input.dataset.carouselOrderId,
      order: Number(input.value) || currentIndex + 1,
      currentIndex
    }))
    .sort((a, b) => a.order === b.order ? a.currentIndex - b.currentIndex : a.order - b.order)
    .map((item) => item.id);

  setButtonBusy(button, true);
  try {
    await apiFetch('/carousel/order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds })
    });
    await loadCarouselSlides();
    showAdminToast('Порядок карусели сохранён');
  } catch (error) {
    handleAdminError(error, 'Не удалось сохранить порядок карусели');
  } finally {
    setButtonBusy(button, false);
  }
}

/* Popular products */
/* Popular products */
async function loadPopularProducts() {
  if (!popularProductsAdmin) {
    return;
  }

  try {
    popularProductsAdmin.innerHTML = '<p class="muted-text">Загрузка товаров...</p>';

    const products = await apiFetch(`/admin/products?cache=${Date.now()}`);

    if (!Array.isArray(products) || !products.length) {
      popularProductsAdmin.innerHTML = '<p class="muted-text">Сначала добавь товары, потом их можно будет выбрать в популярные.</p>';
      return;
    }

    popularProductsAdmin.innerHTML = `
      <div class="popular-admin-toolbar">
        <strong>Выбор популярных товаров</strong>
        <span>Отметь товары, которые должны быть на главной, и задай порядок показа.</span>
        <button type="button" data-action="save-popular-products">Сохранить популярные товары</button>
      </div>

      <div class="popular-admin-grid">
        ${products.map((product, index) => renderPopularAdminProduct(product, index)).join('')}
      </div>
    `;
  } catch (error) {
    popularProductsAdmin.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderPopularAdminProduct(product, index) {
  const images = getProductImages(product);
  const image = resolveImage(images[0] || product.image);
  const isPopular = Number(product.is_popular) === 1;
  const order = Number(product.popular_order) > 0 ? Number(product.popular_order) : index + 1;

  return `
    <article class="popular-admin-card" data-popular-product-id="${product.id}">
      <div class="popular-admin-card__image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : '<span>Нет фото</span>'}
      </div>

      <div class="popular-admin-card__content">
        <strong>${escapeHtml(product.title)}</strong>
        <span>${escapeHtml(product.category)} · ${formatPrice(product.price)} ₽</span>

        <label class="popular-check">
          <input type="checkbox" data-popular-check ${isPopular ? 'checked' : ''}>
          Показывать на главной
        </label>

        <label class="popular-index-field">
          Индекс показа
          <input type="number" min="1" value="${escapeHtml(order)}" data-popular-order>
        </label>
      </div>
    </article>
  `;
}

async function handlePopularProductsClick(event) {
  const button = event.target.closest('[data-action="save-popular-products"]');
  if (!button) return;

  const items = Array.from(document.querySelectorAll('[data-popular-product-id]')).map((card, index) => ({
    id: card.dataset.popularProductId,
    is_popular: card.querySelector('[data-popular-check]')?.checked ? 1 : 0,
    popular_order: Number(card.querySelector('[data-popular-order]')?.value) || index + 1
  }));

  setButtonBusy(button, true);
  try {
    await apiFetch('/popular-products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    await Promise.all([loadProducts(), loadPopularProducts()]);
    showAdminToast('Популярные товары сохранены');
  } catch (error) {
    handleAdminError(error, 'Не удалось сохранить популярные товары');
  } finally {
    setButtonBusy(button, false);
  }
}

/* Helpers */
/* Helpers */
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.auth !== false) {
    const token = getToken();
    if (!token) throw new Error('Сначала войдите в админку');
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const responseText = await response.text();
  let data = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && options.auth !== false) {
      localStorage.removeItem('admin_token');
      currentUser = null;
      window.clearInterval(adminRefreshTimer);
      adminPanel.hidden = true;
      loginSection.hidden = false;
      setLoginMessage(data?.message || 'Сессия закончилась. Войдите заново.', true);
    }
    const error = new Error(data?.message || responseText || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }

  return data;
}


function getToken() {
  return localStorage.getItem('admin_token');
}

function getFormValue(formData, name) {
  return String(formData.get(name) || '').trim();
}

function normalizeProductImagesField(formData, input) {
  formData.delete('image');
  formData.delete('images');

  if (!input || !input.files || !input.files.length) {
    return;
  }

  Array.from(input.files).forEach((file) => {
    formData.append('images', file);
  });
}

function normalizeFileField(formData, input) {
  formData.delete('image');

  if (input && input.files && input.files[0]) {
    formData.append('image', input.files[0]);
  }
}

function getProductImages(product) {
  return App.getProductImages(product);
}

function resolveImage(image) {
  return App.resolveImageUrl(image);
}

function normalizeStoneShape(value) {
  const shape = String(value || 'round').trim();
  return ['round','square','diamond','rectangle','triangle','faceted'].includes(shape) ? shape : 'round';
}

function getStoneShapeLabel(shape) {
  return {
    round: 'Круг',
    square: 'Квадрат',
    diamond: 'Ромб',
    rectangle: 'Прямоугольник',
    triangle: 'Треугольник',
    faceted: 'Многогранный'
  }[normalizeStoneShape(shape)] || 'Круг';
}

function normalizeColor(color) {
  const value = String(color || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return '#b48a78';
}

function formatPrice(value) {
  return App.formatPrice(value);
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return number.toLocaleString('ru-RU', {
    maximumFractionDigits: 1
  });
}

function escapeHtml(value) {
  return App.escapeHtml(value);
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item[key] || 0)), 0);
}

function renderMetric(label, value) {
  return `
    <article class="admin-metric">
      <strong>${formatNumber(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function getRoleText(role) {
  return { owner: 'Владелец', admin: 'Администратор', master: 'Мастер' }[role] || role;
}

async function handleOrderDetailsSubmit(event) {
  const form = event.target.closest('.admin-order-details-form');
  if (!form) return;
  event.preventDefault();

  const button = event.submitter;
  const data = Object.fromEntries(new FormData(form));
  setButtonBusy(button, true);

  try {
    if (form.dataset.paymentStatus !== 'succeeded') {
      await apiFetch(`/orders/${form.dataset.id}/shipping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipping_cost: Number(data.shipping_cost || 0) })
      });
    }

    await apiFetch(`/orders/${form.dataset.id}/details`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_number: data.tracking_number,
        receipt_url: data.receipt_url,
        receipt_sent: form.querySelector('[name="receipt_sent"]').checked,
        admin_note: data.admin_note
      })
    });

    await apiFetch(`/orders/${form.dataset.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: data.status })
    });

    await loadOrders();
    showAdminToast('Заказ сохранён');
  } catch (error) {
    handleAdminError(error, 'Не удалось сохранить заказ');
  } finally {
    setButtonBusy(button, false);
  }
}

async function loadUsers() {
  if (!adminUsers) return;
  try {
    const users = await apiFetch('/users');
    adminUsers.innerHTML = users.map((user) => `
      <article class="admin-user-card">
        <form class="admin-inline-form user-edit-form" data-id="${user.id}">
          <div class="admin-user-card__title">
            <span class="admin-eyebrow">Пользователь</span>
            <strong>${escapeHtml(user.login)}</strong>
          </div>
          <label class="admin-field">
            <span>Роль</span>
            <select name="role">
              <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>Владелец</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
              <option value="master" ${user.role === 'master' ? 'selected' : ''}>Мастер</option>
            </select>
          </label>
          <label class="admin-field">
            <span>Новый пароль</span>
            <input name="password" type="password" minlength="8" placeholder="Оставьте пустым, если не меняете" autocomplete="new-password">
          </label>
          <label class="admin-check"><input name="active" type="checkbox" ${user.active ? 'checked' : ''}> <span>Активен</span></label>
          <button type="submit">Сохранить</button>
        </form>
        ${Number(user.id) === Number(currentUser?.id) ? '<small class="muted-text">Текущий пользователь — удаление недоступно</small>' : `<button class="admin-danger-button" type="button" data-action="delete-user" data-id="${user.id}" data-login="${escapeHtml(user.login)}">Удалить пользователя</button>`}
      </article>
    `).join('') || '<p class="muted-text">Пользователей пока нет</p>';
  } catch (error) {
    adminUsers.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
    throw error;
  }
}

async function handleUserCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  const data = Object.fromEntries(new FormData(userForm));
  setButtonBusy(button, true);

  try {
    await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    userForm.reset();
    await loadUsers();
    showAdminToast('Пользователь добавлен');
  } catch (error) {
    handleAdminError(error, 'Не удалось добавить пользователя');
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleUserEdit(event) {
  const form = event.target.closest('.user-edit-form');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter;
  const data = Object.fromEntries(new FormData(form));
  data.active = form.querySelector('[name="active"]').checked;
  setButtonBusy(button, true);

  try {
    await apiFetch(`/users/${form.dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    await loadUsers();
    showAdminToast('Пользователь обновлён');
  } catch (error) {
    handleAdminError(error, 'Не удалось изменить пользователя');
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleUserClick(event) {
  const button = event.target.closest('[data-action="delete-user"]');
  if (!button || !requireSecondClick(button, 'Ещё раз — удалить пользователя')) return;
  setButtonBusy(button, true, 'Удаляем…');
  try {
    await apiFetch(`/users/${button.dataset.id}`, { method: 'DELETE' });
    await loadUsers();
    showAdminToast(`Пользователь ${button.dataset.login || ''} удалён`);
  } catch (error) {
    handleAdminError(error, 'Не удалось удалить пользователя');
  } finally {
    setButtonBusy(button, false);
  }
}

async function createBackup() {
  setButtonBusy(backupButton, true, 'Создаём копию…');
  try {
    const result = await apiFetch('/admin/backup', { method: 'POST' });
    showAdminToast(result?.message || 'Резервная копия создана');
  } catch (error) {
    handleAdminError(error, 'Не удалось создать резервную копию');
  } finally {
    setButtonBusy(backupButton, false);
  }
}

