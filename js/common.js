(function initLivettaCommon(window) {
  const CART_KEY = 'livetta_cart';

  function getSiteBaseUrl() {
    const { protocol, hostname, origin } = window.location;
    const isLocal = protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:3000' : origin;
  }

  function getApiUrl(path = '') {
    const base = `${getSiteBaseUrl()}/api`;
    if (!path) return base;
    return `${base}${String(path).startsWith('/') ? path : `/${path}`}`;
  }

  function readCart() {
    try {
      const cart = JSON.parse(window.localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    window.localStorage.setItem(CART_KEY, JSON.stringify(Array.isArray(cart) ? cart : []));
  }

  function getProductImages(product) {
    if (!product) return [];
    if (Array.isArray(product.product_images)) return product.product_images.filter(Boolean);

    try {
      const parsed = JSON.parse(product.product_images || '[]');
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}

    return product.image ? [product.image] : [];
  }

  function createCartProduct(product) {
    const images = getProductImages(product);
    return {
      id: product.id,
      title: product.title,
      category: product.category,
      description: product.description,
      price: Number(product.price) || 0,
      image: images[0] || product.image || '',
      product_images: images,
      quantity: 1
    };
  }

  function addProductToCart(product) {
    if (!product || product.purchasable === false) return readCart();

    const cart = readCart();
    const existingItem = cart.find((item) => String(item.id) === String(product.id) && !item.custom);

    if (existingItem) {
      existingItem.quantity = Number(existingItem.quantity || 1) + 1;
    } else {
      cart.push(createCartProduct(product));
    }

    writeCart(cart);
    return cart;
  }

  function resolveImageUrl(image) {
    if (!image) return '';
    const value = String(image).trim();
    if (/^(https?:|data:)/i.test(value)) return value;
    if (value.startsWith('/uploads')) return `${getSiteBaseUrl()}${value}`;
    return value;
  }

  function formatPrice(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('ru-RU') : escapeHtml(value);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function flashButton(button, text = '✓', duration = 1200) {
    if (!button) return;
    const originalText = button.dataset.originalText || button.textContent.trim() || 'Купить';
    button.dataset.originalText = originalText;
    button.classList.add('is-added-to-cart');
    button.textContent = text;
    window.clearTimeout(button._livettaFeedbackTimer);
    button._livettaFeedbackTimer = window.setTimeout(() => {
      button.classList.remove('is-added-to-cart');
      button.textContent = originalText;
    }, duration);
  }

  window.Livetta = {
    CART_KEY,
    addProductToCart,
    escapeHtml,
    flashButton,
    formatPrice,
    getApiUrl,
    getProductImages,
    getSiteBaseUrl,
    readCart,
    resolveImageUrl,
    writeCart
  };
})(window);
