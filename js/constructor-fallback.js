(function () {
  const SIZE_MIN = 30;
  const SIZE_MAX = 50;
  const DEFAULT_SIZE = 45;
  const DEFAULT_CLASP_RESERVE_MM = 20;
  const CART_KEY = 'livetta_cart';

  const THREAD_FIT_STORAGE_KEY = 'livetta_constructor_thread_fit_v4';
  const MAX_VISUAL_STONES = 36;

  /*
    Базовая посадка нити. Верх и бока чуть шире предыдущей версии,
    чтобы линия естественнее лежала на шее.
  */
  const DEFAULT_NECKLACE_FIT = {
    centerX: 500,
    topY: 430,
    topHalf: 168,
    sideY30: 530,
    sideY50: 620,
    sideHalf30: 252,
    sideHalf50: 318,
    bottomY30: 665,
    bottomY50: 790,
    bottomHalf30: 96,
    bottomHalf50: 156,
    stoneOffsetX: 0,
    stoneOffsetY: 0,
    stoneTopGap: 0,
    stoneTopHalfAdd: 0,
    stoneSideYOffset: 0,
    stoneSideHalfAdd: 0,
    stoneBottomYOffset: 0,
    stoneBottomHalfAdd: 0
  };

  let NECKLACE_FIT = loadNecklaceFit();

  const state = {
    allStones: [],
    favorites: [],
    necklace: []
  };

  onReady(boot);

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function boot() {
    qs('#sceneMessage')?.setAttribute('hidden', '');
    ensureSizeSelect();
    setupThreadSettings();
    updateNecklaceShape();
    bindControls();
    renderFavorites();
    renderNecklace();
    renderSummary();
    loadStones();
    window.__livettaConstructorFallbackReady = true;
  }

  function bindControls() {
    qs('#jewelrySize')?.addEventListener('change', () => {
      trimNecklaceToCapacity();
      updateNecklaceShape();
      renderNecklace();
      renderFavorites();
      renderSummary();
    });

    qs('#claspType')?.addEventListener('change', () => {
      trimNecklaceToCapacity();
      renderNecklace();
      renderFavorites();
      renderSummary();
    });

    qs('#claspMaterial')?.addEventListener('change', renderSummary);

    qs('#clearConstructor')?.addEventListener('click', () => {
      state.necklace = [];
      renderNecklace();
      renderFavorites();
      renderSummary();
    });

    qs('#undoStone')?.addEventListener('click', () => {
      state.necklace.pop();
      renderNecklace();
      renderFavorites();
      renderSummary();
    });

    qs('#stonesList')?.addEventListener('click', (event) => {
      const add = event.target.closest('[data-wear-favorite]');
      const remove = event.target.closest('[data-remove-favorite]');

      if (add) {
        wearFavorite(Number(add.dataset.wearFavorite));
      }

      if (remove) {
        state.favorites.splice(Number(remove.dataset.removeFavorite), 1);
        renderFavorites();
        renderCatalog();
      }
    });

    qs('#stoneCatalogList')?.addEventListener('click', (event) => {
      const favorite = event.target.closest('[data-favorite-stone]');
      if (!favorite) return;
      addFavorite(Number(favorite.dataset.favoriteStone));
    });

    qs('#necklaceBeads')?.addEventListener('click', (event) => {
      const bead = event.target.closest('[data-necklace-index]');
      if (!bead) return;
      const index = Number(bead.dataset.necklaceIndex);
      if (!Number.isInteger(index)) return;
      state.necklace.splice(index, 1);
      renderNecklace();
      renderFavorites();
      renderSummary();
    });

    qs('#openStonesCatalog')?.addEventListener('click', openCatalog);
    qs('#closeStoneCatalog')?.addEventListener('click', closeCatalog);
    qs('#addCustomToCart')?.addEventListener('click', addDesignToCart);

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-stones-catalog]')) closeCatalog();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCatalog();
    });

    window.addEventListener('resize', () => {
      renderNecklace();
    });
  }

  async function loadStones() {
    renderCatalogLoading();

    try {
      const response = await fetchWithTimeout('/api/stones?cache=' + Date.now(), 6000);
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      state.allStones = Array.isArray(data) ? data.map(normalizeStone).filter(Boolean) : [];
    } catch (error) {
      console.warn('Stones failed:', error.message);
      state.allStones = [];
    }

    renderCatalog();
    renderFavorites();
  }

  function addFavorite(index) {
    const stone = state.allStones[index];
    if (!stone) return;

    if (!state.favorites.some((item) => String(item.id) === String(stone.id))) {
      state.favorites.push(stone);
    }

    renderFavorites();
    renderCatalog();
    closeCatalog();
  }

  function wearFavorite(index) {
    const stone = state.favorites[index];
    if (!stone) return;

    if (!canWearStone(stone)) {
      if (state.necklace.length >= getVisualStoneLimit()) {
        setHint('На модели уже максимальное количество камней для выбранного размера.');
      } else {
        const free = Math.max(getAvailableLengthMm() - getUsedLengthMm(), 0);
        setHint('Этот камень уже не помещается: свободно ' + formatNumber(free) + ' мм.');
      }
      renderFavorites();
      return;
    }

    state.necklace.push({ ...stone });
    renderNecklace();
    renderFavorites();
    renderSummary();
  }

  function canWearStone(stone) {
    return state.necklace.length < getVisualStoneLimit()
      && getUsedLengthMm() + getStoneSizeMm(stone) <= getAvailableLengthMm() + 0.0001;
  }

  function getVisualStoneLimit() {
    return Math.min(MAX_VISUAL_STONES, Math.max(18, Math.round(getSizeCm() * 0.76)));
  }

  function trimNecklaceToCapacity() {
    while (state.necklace.length && getUsedLengthMm() > getAvailableLengthMm()) {
      state.necklace.pop();
    }
  }

  function ensureSizeSelect() {
    const select = qs('#jewelrySize');
    if (!select) return;

    if (!select.options.length) {
      const options = [];
      for (let size = SIZE_MIN; size <= SIZE_MAX; size += 1) {
        options.push('<option value="' + size + '">' + size + ' см</option>');
      }
      select.innerHTML = options.join('');
    }

    if (!select.value) select.value = String(DEFAULT_SIZE);
  }


  function setupThreadSettings() {
    const panel = qs('#threadSettingsPanel');
    if (!panel) return;

    panel.querySelectorAll('[data-thread-setting]').forEach((input) => {
      const key = input.dataset.threadSetting;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_NECKLACE_FIT, key)) return;
      input.value = String(NECKLACE_FIT[key]);
      input.addEventListener('input', () => {
        NECKLACE_FIT = {
          ...NECKLACE_FIT,
          [key]: Number(input.value)
        };
        saveNecklaceFit();
        syncThreadSettingLabels();
        updateNecklaceShape();
        renderNecklace();
      });
    });

    qs('#resetThreadSettings')?.addEventListener('click', () => {
      NECKLACE_FIT = { ...DEFAULT_NECKLACE_FIT };
      try {
        localStorage.removeItem(THREAD_FIT_STORAGE_KEY);
      } catch {}
      panel.querySelectorAll('[data-thread-setting]').forEach((input) => {
        const key = input.dataset.threadSetting;
        if (Object.prototype.hasOwnProperty.call(NECKLACE_FIT, key)) {
          input.value = String(NECKLACE_FIT[key]);
        }
      });
      syncThreadSettingLabels();
      updateNecklaceShape();
      renderNecklace();
    });

    syncThreadSettingLabels();
  }

  function loadNecklaceFit() {
    try {
      const saved = JSON.parse(localStorage.getItem(THREAD_FIT_STORAGE_KEY) || '{}');
      return Object.keys(DEFAULT_NECKLACE_FIT).reduce((fit, key) => {
        const value = Number(saved[key]);
        fit[key] = Number.isFinite(value) ? value : DEFAULT_NECKLACE_FIT[key];
        return fit;
      }, {});
    } catch {
      return { ...DEFAULT_NECKLACE_FIT };
    }
  }

  function saveNecklaceFit() {
    try {
      localStorage.setItem(THREAD_FIT_STORAGE_KEY, JSON.stringify(NECKLACE_FIT));
    } catch {}
  }

  function syncThreadSettingLabels() {
    document.querySelectorAll('[data-thread-setting-value]').forEach((label) => {
      const key = label.dataset.threadSettingValue;
      if (Object.prototype.hasOwnProperty.call(NECKLACE_FIT, key)) {
        label.textContent = String(Math.round(NECKLACE_FIT[key]));
      }
    });
  }

  function updateNecklaceShape() {
    const path = qs('#necklacePath');
    const fullPath = qs('#necklaceFullPath');
    if (!path) return;

    const t = clamp((getSizeCm() - SIZE_MIN) / (SIZE_MAX - SIZE_MIN), 0, 1);
    const easedSize = easeInOut(t);
    const fit = NECKLACE_FIT;

    /*
      The upper landing points stay locked on the neck. Size changes only move
      the side and bottom curve, so the necklace grows without deforming the top.
    */
    const sideY = lerp(fit.sideY30, fit.sideY50, easedSize);
    const sideHalf = lerp(fit.sideHalf30, fit.sideHalf50, easedSize);
    const bottomY = lerp(fit.bottomY30, fit.bottomY50, easedSize);
    const bottomHalf = lerp(fit.bottomHalf30, fit.bottomHalf50, easedSize);
    const leftTop = fit.centerX - fit.topHalf;
    const rightTop = fit.centerX + fit.topHalf;
    const fullD = [
      'M ' + leftTop + ' ' + fit.topY,
      'C ' + (fit.centerX - sideHalf) + ' ' + sideY + ', ' + (fit.centerX - bottomHalf) + ' ' + bottomY + ', ' + fit.centerX + ' ' + bottomY,
      'C ' + (fit.centerX + bottomHalf) + ' ' + bottomY + ', ' + (fit.centerX + sideHalf) + ' ' + sideY + ', ' + rightTop + ' ' + fit.topY
    ].join(' ');

    const stoneCenterX = fit.centerX + fit.stoneOffsetX;
    const beadTopY = fit.topY + fit.stoneTopGap + fit.stoneOffsetY;
    const beadTopHalf = Math.max(20, fit.topHalf + fit.stoneTopHalfAdd);
    const beadSideY = sideY + fit.stoneSideYOffset + fit.stoneOffsetY;
    const beadSideHalf = Math.max(20, sideHalf + fit.stoneSideHalfAdd);
    const beadBottomY = bottomY + fit.stoneBottomYOffset + fit.stoneOffsetY;
    const beadBottomHalf = Math.max(20, bottomHalf + fit.stoneBottomHalfAdd);
    const beadLeftTop = stoneCenterX - beadTopHalf;
    const beadRightTop = stoneCenterX + beadTopHalf;
    const beadD = [
      'M ' + beadLeftTop + ' ' + beadTopY,
      'C ' + (stoneCenterX - beadSideHalf) + ' ' + beadSideY + ', ' + (stoneCenterX - beadBottomHalf) + ' ' + beadBottomY + ', ' + stoneCenterX + ' ' + beadBottomY,
      'C ' + (stoneCenterX + beadBottomHalf) + ' ' + beadBottomY + ', ' + (stoneCenterX + beadSideHalf) + ' ' + beadSideY + ', ' + beadRightTop + ' ' + beadTopY
    ].join(' ');

    path.setAttribute('d', beadD);
    fullPath?.setAttribute('d', fullD);
    qs('#neckStage')?.style.setProperty('--necklace-size-progress', String(t));
  }

  function renderFavorites() {
    const list = qs('#stonesList');
    if (!list) return;

    if (!state.favorites.length) {
      list.innerHTML = '<p class="muted-text">Здесь появятся избранные камни из каталога.</p>';
      return;
    }

    list.innerHTML = state.favorites.map((stone, index) => {
      const image = stone.image ? '<img src="' + escapeHtml(stone.image) + '" alt="' + escapeHtml(stone.name) + '" loading="lazy">' : '<span class="stone-card__gem"></span>';
      const disabled = !canWearStone(stone);
      return '<article class="favorite-stone-card' + (disabled ? ' is-disabled' : '') + '">' +
        '<div class="favorite-stone-card__thumb" style="--stone-color:' + escapeHtml(stone.color) + '">' + image + '</div>' +
        '<div class="favorite-stone-card__body">' +
        '<strong>' + escapeHtml(stone.name) + '</strong>' +
        '<small>' + formatNumber(stone.sizeMm) + ' мм</small>' +
        (stone.zodiac ? '<small class="stone-card-detail"><b>Знак зодиака:</b> ' + escapeHtml(stone.zodiac) + '</small>' : '') +
        (stone.stoneProperty ? '<small class="stone-card-detail"><b>Свойство камня:</b> ' + escapeHtml(stone.stoneProperty) + '</small>' : '') +
        '<div class="favorite-stone-card__actions">' +
        '<button type="button" data-wear-favorite="' + index + '"' + (disabled ? ' disabled' : '') + '>Надеть</button>' +
        '<button type="button" data-remove-favorite="' + index + '" aria-label="Убрать из избранного">×</button>' +
        '</div>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderCatalogLoading() {
    const target = qs('#stoneCatalogList');
    if (target) target.innerHTML = '<p class="muted-text">Загружаем каталог камней...</p>';
  }

  function renderCatalog() {
    const target = qs('#stoneCatalogList');
    if (!target) return;

    if (!state.allStones.length) {
      target.innerHTML = '<p class="muted-text">Камни пока не загрузились. Обновите страницу чуть позже.</p>';
      return;
    }

    target.innerHTML = state.allStones.map((stone, index) => {
      const isFavorite = state.favorites.some((item) => String(item.id) === String(stone.id));
      const image = stone.image ? '<img src="' + escapeHtml(stone.image) + '" alt="' + escapeHtml(stone.name) + '" loading="lazy">' : '<span class="stone-card__gem"></span>';
      return '<article class="constructor-catalog-stone">' +
        '<div class="constructor-catalog-stone__image" style="--stone-color:' + escapeHtml(stone.color) + '">' + image + '</div>' +
        '<div class="constructor-catalog-stone__body">' +
        '<div class="constructor-catalog-stone__meta"><span>' + formatPrice(stone.price) + ' ₽</span><span>' + formatNumber(stone.sizeMm) + ' мм</span></div>' +
        '<h3>' + escapeHtml(stone.name) + '</h3>' +
        '<p>' + escapeHtml(stone.description || 'Камень для сборки') + '</p>' +
        (stone.zodiac ? '<div class="constructor-catalog-stone__detail"><b>Знак зодиака</b><p>' + escapeHtml(stone.zodiac) + '</p></div>' : '') +
        (stone.stoneProperty ? '<div class="constructor-catalog-stone__detail"><b>Свойство камня</b><p>' + escapeHtml(stone.stoneProperty) + '</p></div>' : '') +
        '</div>' +
        '<button type="button" data-favorite-stone="' + index + '"' + (isFavorite ? ' disabled' : '') + '>' + (isFavorite ? 'В избранном' : 'В избранное') + '</button>' +
        '</article>';
    }).join('');
  }

  function renderNecklace() {
    updateNecklaceShape();
    const layer = qs('#necklaceBeads');
    const path = qs('#necklacePath');
    if (!layer || !path) return;

    const pathLength = path.getTotalLength();
    const count = state.necklace.length;
    const usedRatio = Math.min(getUsedLengthMm() / Math.max(getAvailableLengthMm(), 1), 1);
    const spread = clamp(0.28 + usedRatio * 0.56, 0.28, 0.86);
    const start = (1 - spread) / 2;

    layer.innerHTML = state.necklace.map((stone, index) => {
      const ratio = count === 1 ? 0.5 : start + spread * (index / Math.max(count - 1, 1));
      const point = path.getPointAtLength(pathLength * ratio);
      const next = path.getPointAtLength(Math.min(pathLength * ratio + 2, pathLength));
      const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
      const diameter = clamp(getStoneSizeMm(stone) * 2.45, 14, 68);
      const shape = normalizeStoneShape(stone.shape);

      return buildSvgStoneMarkup(stone, index, point.x, point.y, angle, diameter, shape);
    }).join('');
  }

  function buildSvgStoneMarkup(stone, index, x, y, angle, diameter, shape) {
    const r = diameter / 2;
    const clipId = 'necklaceStoneClip' + index;
    const gradientId = 'necklaceStoneGradient' + index;
    const color = getSafeStoneColor(stone.color);
    const title = 'Удалить ' + stone.name;
    const image = stone.image
      ? '<image class="necklace-svg-stone__image" href="' + escapeHtml(stone.image) + '" x="' + (-r) + '" y="' + (-r) + '" width="' + diameter + '" height="' + diameter + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clipId + ')" />'
      : '';

    return '<g class="necklace-svg-stone necklace-svg-stone--' + shape + '" data-necklace-index="' + index + '" tabindex="0" role="button" aria-label="' + escapeHtml(title) + '" transform="translate(' + x + ' ' + y + ') rotate(' + angle + ')">' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<defs>' +
      '<radialGradient id="' + gradientId + '" cx="32%" cy="26%" r="74%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".96"/><stop offset="42%" stop-color="' + color + '" stop-opacity=".95"/><stop offset="100%" stop-color="' + color + '" stop-opacity=".68"/></radialGradient>' +
      '<clipPath id="' + clipId + '">' + getSvgStoneShape(shape, r, '') + '</clipPath>' +
      '</defs>' +
      '<g class="necklace-svg-stone__visual">' +
      getSvgStoneShape(shape, r, 'class="necklace-svg-stone__base" fill="url(#' + gradientId + ')"') +
      image +
      getSvgStoneShape(shape, r, 'class="necklace-svg-stone__stroke"') +
      '<ellipse class="necklace-svg-stone__shine" cx="' + (-r * 0.28) + '" cy="' + (-r * 0.34) + '" rx="' + (r * 0.22) + '" ry="' + (r * 0.14) + '" />' +
      '</g>' +
      '</g>';
  }

  function getSvgStoneShape(shape, r, attrs) {
    const diameter = r * 2;
    const attr = attrs ? ' ' + attrs : '';

    if (shape === 'square') {
      return '<rect x="' + (-r) + '" y="' + (-r) + '" width="' + diameter + '" height="' + diameter + '" rx="' + (diameter * 0.18) + '"' + attr + ' />';
    }

    if (shape === 'diamond') {
      return '<polygon points="0,' + (-r) + ' ' + r + ',0 0,' + r + ' ' + (-r) + ',0"' + attr + ' />';
    }

    if (shape === 'rectangle') {
      const w = diameter * 1.24;
      const h = diameter * 0.78;
      return '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + (h * 0.18) + '"' + attr + ' />';
    }

    if (shape === 'triangle') {
      return '<polygon points="0,' + (-r) + ' ' + r + ',' + r + ' ' + (-r) + ',' + r + '"' + attr + ' />';
    }

    if (shape === 'faceted') {
      return '<polygon points="0,' + (-r) + ' ' + (r * 0.72) + ',' + (-r * 0.72) + ' ' + r + ',0 ' + (r * 0.72) + ',' + (r * 0.72) + ' 0,' + r + ' ' + (-r * 0.72) + ',' + (r * 0.72) + ' ' + (-r) + ',0 ' + (-r * 0.72) + ',' + (-r * 0.72) + '"' + attr + ' />';
    }

    return '<circle cx="0" cy="0" r="' + r + '"' + attr + ' />';
  }

  function getSafeStoneColor(color) {
    const value = String(color || '').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
    if (/^rgba?\([0-9\s,%.]+\)$/i.test(value)) return value;
    return '#d7a5ba';
  }

  function renderSummary() {
    const size = qs('#jewelrySize');
    const selectedSize = qs('#selectedSize');
    const usedLength = qs('#usedLength');
    const maxLength = qs('#maxLength');
    const totalPrice = qs('#totalPrice');
    const selectedType = qs('#selectedType');
    const selectedClasp = qs('#selectedClasp');
    const selectedClaspMaterial = qs('#selectedClaspMaterial');
    const undo = qs('#undoStone');
    const clear = qs('#clearConstructor');
    const addToCart = qs('#addCustomToCart');
    const clasp = qs('#claspType');
    const material = qs('#claspMaterial');

    if (selectedType) selectedType.textContent = 'Колье';
    if (selectedSize) selectedSize.textContent = String(getSizeCm());
    if (usedLength) usedLength.textContent = formatNumber(getUsedLengthMm());
    if (maxLength) maxLength.textContent = formatNumber(getAvailableLengthMm());
    if (totalPrice) totalPrice.textContent = formatPrice(getTotalPrice()) + ' ₽';
    if (selectedClasp) selectedClasp.textContent = clasp?.selectedOptions?.[0]?.textContent || 'Не выбран';
    if (selectedClaspMaterial) selectedClaspMaterial.textContent = material?.selectedOptions?.[0]?.textContent || 'Не выбран';

    if (undo) undo.disabled = !state.necklace.length;
    if (clear) clear.disabled = !state.necklace.length;
    if (addToCart) addToCart.disabled = !state.necklace.length || !clasp?.value || !material?.value;

    if (!state.necklace.length) {
      setHint('Добавьте камни в избранное, затем нажмите «Надеть». Доступно ' + formatNumber(getAvailableLengthMm()) + ' мм.');
    } else {
      setHint('На нити ' + state.necklace.length + ' камн. Занято ' + formatNumber(getUsedLengthMm()) + ' из ' + formatNumber(getAvailableLengthMm()) + ' мм.');
    }
  }

  function addDesignToCart() {
    if (!state.necklace.length) return;
    const clasp = qs('#claspType');
    const material = qs('#claspMaterial');
    if (!clasp?.value || !material?.value) {
      renderSummary();
      setHint('Выберите тип и материал замка.');
      return;
    }

    const cart = readCart();
    cart.push({
      id: 'custom-necklace-' + Date.now(),
      custom: true,
      title: 'Колье LiVetta custom',
      category: 'Конструктор',
      description: state.necklace.map((stone) => stone.name).join(', '),
      price: getTotalPrice(),
      image: state.necklace[0]?.image || '',
      quantity: 1,
      design: {
        type: 'Колье',
        size_cm: getSizeCm(),
        clasp_type: clasp.value,
        clasp_material: material.value,
        used_mm: getUsedLengthMm(),
        max_mm: getAvailableLengthMm(),
        stones_count: state.necklace.length,
        stones: state.necklace
      }
    });
    writeCart(cart);
    setHint('Сборка добавлена в корзину.');
  }

  function openCatalog() {
    const modal = qs('#stoneCatalogModal');
    if (!modal) return;
    renderCatalog();
    modal.hidden = false;
    document.body.classList.add('is-stone-catalog-open');
  }

  function closeCatalog() {
    const modal = qs('#stoneCatalogModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('is-stone-catalog-open');
  }

  function getAvailableLengthMm() {
    return Math.max(1, getSizeCm() * 10 - DEFAULT_CLASP_RESERVE_MM);
  }

  function getUsedLengthMm() {
    return state.necklace.reduce((sum, stone) => sum + getStoneSizeMm(stone), 0);
  }

  function getTotalPrice() {
    return state.necklace.reduce((sum, stone) => sum + Number(stone.price || 0), 0);
  }

  function getSizeCm() {
    return Number(qs('#jewelrySize')?.value || DEFAULT_SIZE);
  }

  function getStoneSizeMm(stone) {
    const value = Number(String(stone?.sizeMm ?? stone?.size_mm ?? stone?.size ?? 8).replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 8;
  }

  function normalizeStone(stone) {
    const name = String(stone.name || 'Камень').trim();
    if (!name) return null;

    return {
      id: String(stone.id ?? name),
      name,
      description: String(stone.description || 'Камень для сборки').trim(),
      zodiac: String(stone.zodiac || stone.zodiac_sign || '').trim(),
      stoneProperty: String(stone.stone_property || stone.stoneProperty || stone.property || '').trim(),
      shape: normalizeStoneShape(stone.stone_shape || stone.shape),
      price: Number(stone.price || 0),
      sizeMm: getStoneSizeMm(stone),
      color: normalizeColor(stone.color),
      image: resolveImageUrl(stone.image)
    };
  }

  function fetchWithTimeout(url, timeoutMs) {
    if (typeof AbortController === 'undefined') return fetch(url, { cache: 'no-store' });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => window.clearTimeout(timer));
  }

  function readCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function resolveImageUrl(image) {
    const value = String(image || '').trim();
    if (!value) return '';
    if (/^(https?:|data:|\/)/i.test(value)) return value;
    return '/uploads/' + value.replace(/^uploads\//, '');
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
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? value : '#b48a78';
  }

  function setHint(text) {
    const target = qs('#capacityHint');
    if (target) target.textContent = text;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: number % 1 === 0 ? 0 : 1 }).format(number);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function easeInOut(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }
}());
