(function () {
  const App = window.Livetta;
  const SIZE_MIN = 30;
  const SIZE_MAX = 50;
  const DEFAULT_SIZE = 45;
  const FIT_KEY = 'livetta_clean_constructor_fit_v1';
  const MAX_STONES = 48;

  const CLASPS = {
    'lobster-steel': { id: 'lobster-steel', name: 'Карабин', material: 'Нержавеющая сталь', reserveMm: 18 },
    'toggle-steel': { id: 'toggle-steel', name: 'Тоггл', material: 'Нержавеющая сталь', reserveMm: 24 },
    'magnetic-steel': { id: 'magnetic-steel', name: 'Магнитный замок', material: 'Нержавеющая сталь', reserveMm: 20 },
    'screw-steel': { id: 'screw-steel', name: 'Винтовой замок', material: 'Нержавеющая сталь', reserveMm: 16 },
    'hook-steel': { id: 'hook-steel', name: 'Замок-крючок', material: 'Нержавеющая сталь', reserveMm: 18 }
  };

  const MATERIALS = {
    brass: 'Латунь',
    rhodium: 'Родий'
  };

  const DEFAULT_FIT = {
    centerX: 500,
    topY: 430,
    topHalf: 170,
    sideY: 585,
    sideHalf: 285,
    bottomY: 760,
    bottomHalf: 115,
    sizeDepth: 6,
    stoneScale: 2.45,
    stoneSpread: 86
  };

  const state = {
    stones: [],
    filtered: [],
    selected: [],
    fit: loadFit()
  };

  ready(init);

  function init() {
    buildSizeOptions();
    bindControls();
    syncFitControls();
    updateThread();
    renderAll();
    loadStones();
    window.__livettaConstructorReady = true;
  }

  function bindControls() {
    qs('#builderSize')?.addEventListener('change', () => {
      trimToCapacity();
      renderAll();
    });

    qs('#builderClasp')?.addEventListener('change', () => {
      trimToCapacity();
      renderAll();
    });

    qs('#builderMaterial')?.addEventListener('change', renderSummary);
    qs('#builderUndo')?.addEventListener('click', removeLastStone);
    qs('#builderClear')?.addEventListener('click', clearStones);
    qs('#addCustomToCart')?.addEventListener('click', addToCart);
    qs('#builderResetFit')?.addEventListener('click', resetFit);

    qs('#builderStoneSearch')?.addEventListener('input', (event) => {
      filterStones(event.target.value);
    });

    qs('#builderStoneCatalog')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-stone]');
      if (!button) return;
      addStone(Number(button.dataset.addStone));
    });

    qs('#builderSelectedList')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-selected]');
      const move = event.target.closest('[data-move-selected]');

      if (remove) {
        removeStone(Number(remove.dataset.removeSelected));
      }

      if (move) {
        moveStone(Number(move.dataset.moveSelected), Number(move.dataset.direction));
      }
    });

    qs('#builderStoneLayer')?.addEventListener('click', (event) => {
      const stone = event.target.closest('[data-selected-stone]');
      if (!stone) return;
      removeStone(Number(stone.dataset.selectedStone));
    });

    document.querySelectorAll('[data-fit]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.fit;
        state.fit[key] = Number(input.value);
        saveFit();
        syncFitLabels();
        renderAll();
      });
    });

    window.addEventListener('resize', renderNecklace);
  }

  async function loadStones() {
    const catalog = qs('#builderStoneCatalog');
    if (catalog) catalog.innerHTML = '<p class="lv-empty">Загружаем камни...</p>';

    try {
      const response = await fetch(App.getApiUrl('/stones?cache=' + Date.now()), { cache: 'no-store' });
      if (!response.ok) throw new Error('Не удалось загрузить камни');
      const data = await response.json();
      state.stones = Array.isArray(data) ? data.map(normalizeStone).filter(Boolean) : [];
      state.filtered = state.stones;
      renderCatalog();
    } catch (error) {
      if (catalog) catalog.innerHTML = '<p class="lv-empty">Камни пока не загрузились.</p>';
      setMessage(error.message || 'Не удалось загрузить камни');
    }
  }

  function buildSizeOptions() {
    const select = qs('#builderSize');
    if (!select) return;

    select.innerHTML = Array.from({ length: SIZE_MAX - SIZE_MIN + 1 }, (_, index) => {
      const size = SIZE_MIN + index;
      return '<option value="' + size + '"' + (size === DEFAULT_SIZE ? ' selected' : '') + '>' + size + ' см</option>';
    }).join('');
  }

  function filterStones(query) {
    const search = String(query || '').trim().toLowerCase();
    state.filtered = !search
      ? state.stones
      : state.stones.filter((stone) => {
          return [stone.name, stone.description, stone.zodiac, stone.property]
            .join(' ')
            .toLowerCase()
            .includes(search);
        });
    renderCatalog();
  }

  function addStone(index) {
    const stone = state.filtered[index];
    if (!stone) return;

    const capacity = getCapacityAfter(stone);

    if (!capacity.canAdd) {
      setMessage('Этот камень не помещается на выбранную длину.');
      renderCatalog();
      return;
    }

    state.selected.push({ ...stone, uid: Date.now() + '-' + Math.random().toString(16).slice(2) });
    renderAll();
  }

  function removeStone(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.selected.length) return;
    state.selected.splice(index, 1);
    renderAll();
  }

  function removeLastStone() {
    state.selected.pop();
    renderAll();
  }

  function clearStones() {
    state.selected = [];
    renderAll();
  }

  function moveStone(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.selected.length) return;
    const [stone] = state.selected.splice(index, 1);
    state.selected.splice(target, 0, stone);
    renderAll();
  }

  function trimToCapacity() {
    while (state.selected.length && getUsedMm() > getAvailableMm() + 0.0001) {
      state.selected.pop();
    }
  }

  function renderAll() {
    updateThread();
    renderNecklace();
    renderSelected();
    renderCatalog();
    renderSummary();
  }

  function updateThread() {
    const path = qs('#builderThreadPath');
    if (!path) return;
    path.setAttribute('d', getPathD());
  }

  function renderNecklace() {
    const layer = qs('#builderStoneLayer');
    const path = qs('#builderThreadPath');
    if (!layer || !path) return;

    const pathLength = path.getTotalLength();
    const count = state.selected.length;

    if (!count) {
      layer.innerHTML = '';
      return;
    }

    const usedRatio = clamp(getUsedMm() / Math.max(getAvailableMm(), 1), 0, 1);
    const maxSpread = clamp(state.fit.stoneSpread / 100, 0.35, 0.96);
    const spread = clamp(0.18 + usedRatio * maxSpread, 0.22, maxSpread);
    const start = (1 - spread) / 2;

    layer.innerHTML = state.selected.map((stone, index) => {
      const ratio = count === 1 ? 0.5 : start + spread * (index / Math.max(count - 1, 1));
      const point = path.getPointAtLength(pathLength * ratio);
      const next = path.getPointAtLength(Math.min(pathLength * ratio + 2, pathLength));
      const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
      const diameter = clamp(stone.sizeMm * state.fit.stoneScale, 16, 78);
      stone.path_ratio = Number(ratio.toFixed(4));
      return renderSvgStone(stone, index, point.x, point.y, angle, diameter);
    }).join('');
  }

  function renderSvgStone(stone, index, x, y, angle, diameter) {
    const radius = diameter / 2;
    const clipId = 'cleanStoneClip' + index;
    const gradientId = 'cleanStoneGradient' + index;
    const image = stone.image
      ? '<image href="' + escapeHtml(stone.image) + '" x="' + (-radius) + '" y="' + (-radius) + '" width="' + diameter + '" height="' + diameter + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clipId + ')"></image>'
      : '';

    return '<g class="lv-svg-stone" data-selected-stone="' + index + '" transform="translate(' + x + ' ' + y + ') rotate(' + angle + ')">' +
      '<title>Убрать ' + escapeHtml(stone.name) + '</title>' +
      '<defs>' +
      '<radialGradient id="' + gradientId + '" cx="32%" cy="25%" r="76%"><stop offset="0%" stop-color="#fff" stop-opacity=".96"></stop><stop offset="44%" stop-color="' + escapeHtml(stone.color) + '"></stop><stop offset="100%" stop-color="' + escapeHtml(stone.color) + '" stop-opacity=".72"></stop></radialGradient>' +
      '<clipPath id="' + clipId + '"><circle cx="0" cy="0" r="' + radius + '"></circle></clipPath>' +
      '</defs>' +
      '<circle class="lv-svg-stone__base" cx="0" cy="0" r="' + radius + '" fill="url(#' + gradientId + ')"></circle>' +
      image +
      '<circle class="lv-svg-stone__ring" cx="0" cy="0" r="' + radius + '"></circle>' +
      '<ellipse class="lv-svg-stone__shine" cx="' + (-radius * 0.3) + '" cy="' + (-radius * 0.35) + '" rx="' + (radius * 0.22) + '" ry="' + (radius * 0.14) + '"></ellipse>' +
      '</g>';
  }

  function renderCatalog() {
    const catalog = qs('#builderStoneCatalog');
    if (!catalog) return;

    if (!state.filtered.length) {
      catalog.innerHTML = '<p class="lv-empty">Камни не найдены.</p>';
      return;
    }

    catalog.innerHTML = state.filtered.map((stone, index) => {
      const capacity = getCapacityAfter(stone);
      const image = stone.image
        ? '<img src="' + escapeHtml(stone.image) + '" alt="' + escapeHtml(stone.name) + '" loading="lazy">'
        : '<span></span>';

      return '<article class="lv-stone-card">' +
        '<div class="lv-stone-card__image" style="--stone-color:' + escapeHtml(stone.color) + '">' + image + '</div>' +
        '<div class="lv-stone-card__body">' +
        '<div class="lv-stone-card__meta"><span>' + formatPrice(stone.price) + ' ₽</span><span>' + formatNumber(stone.sizeMm) + ' мм</span></div>' +
        '<h3>' + escapeHtml(stone.name) + '</h3>' +
        (stone.description ? '<p>' + escapeHtml(stone.description) + '</p>' : '') +
        (stone.property ? '<small>' + escapeHtml(stone.property) + '</small>' : '') +
        (stone.zodiac ? '<small>Зодиак: ' + escapeHtml(stone.zodiac) + '</small>' : '') +
        '</div>' +
        '<button type="button" data-add-stone="' + index + '"' + (capacity.canAdd ? '' : ' disabled') + '>' + (capacity.canAdd ? 'Добавить' : 'Не помещается') + '</button>' +
        '</article>';
    }).join('');
  }

  function renderSelected() {
    const list = qs('#builderSelectedList');
    if (!list) return;

    if (!state.selected.length) {
      list.innerHTML = '<p class="lv-empty">Состав пуст.</p>';
      return;
    }

    list.innerHTML = state.selected.map((stone, index) => {
      return '<article class="lv-selected-stone">' +
        '<span style="--stone-color:' + escapeHtml(stone.color) + '">' + (stone.image ? '<img src="' + escapeHtml(stone.image) + '" alt="">' : '') + '</span>' +
        '<div><strong>' + escapeHtml(stone.name) + '</strong><small>' + formatNumber(stone.sizeMm) + ' мм · ' + formatPrice(stone.price) + ' ₽</small></div>' +
        '<button type="button" data-move-selected="' + index + '" data-direction="-1" aria-label="Выше">↑</button>' +
        '<button type="button" data-move-selected="' + index + '" data-direction="1" aria-label="Ниже">↓</button>' +
        '<button type="button" data-remove-selected="' + index + '" aria-label="Удалить">×</button>' +
        '</article>';
    }).join('');
  }

  function renderSummary() {
    setText('#builderTotal', formatPrice(getTotalPrice()) + ' ₽');
    setText('#builderCount', String(state.selected.length));
    setText('#builderUsed', formatNumber(getUsedMm()));
    setText('#builderMax', formatNumber(getAvailableMm()));

    const undo = qs('#builderUndo');
    const clear = qs('#builderClear');
    const cart = qs('#addCustomToCart');
    const canCart = state.selected.length > 0 && Boolean(getSelectedClasp()) && Boolean(getSelectedMaterial());

    if (undo) undo.disabled = !state.selected.length;
    if (clear) clear.disabled = !state.selected.length;
    if (cart) cart.disabled = !canCart;

    if (!state.selected.length) {
      setMessage('Добавьте камни из каталога.');
    } else if (!getSelectedClasp() || !getSelectedMaterial()) {
      setMessage('Выберите замок и материал.');
    } else {
      setMessage('Сборка готова к добавлению в корзину.');
    }
  }

  function addToCart() {
    const clasp = getSelectedClasp();
    const material = getSelectedMaterial();

    if (!state.selected.length || !clasp || !material) {
      renderSummary();
      return;
    }

    const composition = getComposition(state.selected);
    const item = {
      id: 'custom-necklace-' + Date.now(),
      custom: true,
      title: 'Колье LiVetta custom',
      category: 'Конструктор',
      description: composition.map((part) => part.name + ' ×' + part.count).join(', '),
      price: getTotalPrice(),
      image: state.selected[0]?.image || '',
      quantity: 1,
      composition,
      design: {
        type: 'Колье',
        size_cm: getSizeCm(),
        clasp,
        clasp_type: clasp.id,
        clasp_material: material.id,
        clasp_material_name: material.name,
        used_mm: getUsedMm(),
        max_mm: getAvailableMm(),
        stones_count: state.selected.length,
        composition,
        preview_image: createPreviewImage(),
        stones: state.selected.map((stone) => ({
          id: stone.id,
          name: stone.name,
          description: stone.description,
          property: stone.property,
          zodiac: stone.zodiac,
          price: stone.price,
          size_mm: stone.sizeMm,
          color: stone.color,
          image: stone.image,
          path_ratio: stone.path_ratio ?? null
        }))
      }
    };

    const cart = App.readCart();
    cart.push(item);
    App.writeCart(cart);
    App.flashButton(qs('#addCustomToCart'), '✓');
    setMessage('Сборка добавлена в корзину.');
  }

  function createPreviewImage() {
    if (!state.selected.length) return '';
    const pathD = getPathD();
    const path = qs('#builderThreadPath');
    const pathLength = path?.getTotalLength?.() || 0;
    const beads = state.selected.map((stone) => {
      let x = 500;
      let y = 760;
      if (path && pathLength && Number.isFinite(stone.path_ratio)) {
        const point = path.getPointAtLength(pathLength * stone.path_ratio);
        x = point.x;
        y = point.y;
      }
      return '<circle cx="' + x + '" cy="' + y + '" r="18" fill="' + escapeHtml(stone.color) + '" stroke="#fff" stroke-width="4"></circle>';
    }).join('');

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 1000 1000">' +
      '<rect width="1000" height="1000" fill="#fff7fb"></rect>' +
      '<path d="' + pathD + '" fill="none" stroke="#b9b2ad" stroke-width="9" stroke-linecap="round"></path>' +
      beads +
      '</svg>';

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function getPathD() {
    const fit = state.fit;
    const sizeDelta = getSizeCm() - DEFAULT_SIZE;
    const centerX = fit.centerX;
    const topY = fit.topY;
    const topHalf = fit.topHalf;
    const sideY = fit.sideY + sizeDelta * fit.sizeDepth * 0.42;
    const sideHalf = fit.sideHalf + sizeDelta * fit.sizeDepth * 0.28;
    const bottomY = fit.bottomY + sizeDelta * fit.sizeDepth;
    const bottomHalf = fit.bottomHalf + sizeDelta * fit.sizeDepth * 0.24;
    const leftTop = centerX - topHalf;
    const rightTop = centerX + topHalf;

    return [
      'M ' + leftTop + ' ' + topY,
      'C ' + (centerX - sideHalf) + ' ' + sideY + ', ' + (centerX - bottomHalf) + ' ' + bottomY + ', ' + centerX + ' ' + bottomY,
      'C ' + (centerX + bottomHalf) + ' ' + bottomY + ', ' + (centerX + sideHalf) + ' ' + sideY + ', ' + rightTop + ' ' + topY
    ].join(' ');
  }

  function getCapacityAfter(stone) {
    const used = getUsedMm();
    const next = used + getStoneSizeMm(stone);
    return {
      canAdd: state.selected.length < MAX_STONES && next <= getAvailableMm() + 0.0001,
      used,
      next
    };
  }

  function getAvailableMm() {
    const clasp = getSelectedClasp();
    const reserve = clasp?.reserveMm ?? 20;
    return Math.max(1, getSizeCm() * 10 - reserve);
  }

  function getUsedMm() {
    return state.selected.reduce((sum, stone) => sum + getStoneSizeMm(stone), 0);
  }

  function getTotalPrice() {
    return state.selected.reduce((sum, stone) => sum + Number(stone.price || 0), 0);
  }

  function getSizeCm() {
    return Number(qs('#builderSize')?.value || DEFAULT_SIZE);
  }

  function getSelectedClasp() {
    return CLASPS[qs('#builderClasp')?.value] || null;
  }

  function getSelectedMaterial() {
    const id = qs('#builderMaterial')?.value;
    return id && MATERIALS[id] ? { id, name: MATERIALS[id] } : null;
  }

  function getStoneSizeMm(stone) {
    const value = Number(String(stone?.sizeMm ?? stone?.size_mm ?? stone?.size ?? 8).replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 8;
  }

  function getComposition(stones) {
    const map = new Map();
    stones.forEach((stone) => {
      const key = String(stone.id || stone.name);
      const current = map.get(key) || {
        id: stone.id,
        name: stone.name,
        count: 0,
        size_mm: stone.sizeMm,
        price: stone.price,
        description: stone.description,
        property: stone.property,
        zodiac: stone.zodiac,
        color: stone.color,
        image: stone.image
      };
      current.count += 1;
      map.set(key, current);
    });
    return Array.from(map.values());
  }

  function normalizeStone(stone) {
    const name = String(stone?.name || '').trim();
    if (!name) return null;
    return {
      id: String(stone.id ?? name),
      name,
      description: String(stone.description || '').trim(),
      zodiac: String(stone.zodiac || '').trim(),
      property: String(stone.stone_property || stone.property || '').trim(),
      price: Number(stone.price || 0),
      sizeMm: getStoneSizeMm(stone),
      color: normalizeColor(stone.color),
      image: App.resolveImageUrl(stone.image || '')
    };
  }

  function normalizeColor(value) {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : '#b48a78';
  }

  function loadFit() {
    try {
      const saved = JSON.parse(localStorage.getItem(FIT_KEY) || '{}');
      return Object.keys(DEFAULT_FIT).reduce((fit, key) => {
        const value = Number(saved[key]);
        fit[key] = Number.isFinite(value) ? value : DEFAULT_FIT[key];
        return fit;
      }, {});
    } catch {
      return { ...DEFAULT_FIT };
    }
  }

  function saveFit() {
    try {
      localStorage.setItem(FIT_KEY, JSON.stringify(state.fit));
    } catch {}
  }

  function resetFit() {
    state.fit = { ...DEFAULT_FIT };
    try {
      localStorage.removeItem(FIT_KEY);
    } catch {}
    syncFitControls();
    renderAll();
  }

  function syncFitControls() {
    document.querySelectorAll('[data-fit]').forEach((input) => {
      const key = input.dataset.fit;
      input.value = state.fit[key];
    });
    syncFitLabels();
  }

  function syncFitLabels() {
    document.querySelectorAll('[data-fit-value]').forEach((label) => {
      const key = label.dataset.fitValue;
      const value = state.fit[key];
      label.textContent = Number.isInteger(value) ? String(value) : String(Number(value).toFixed(2));
    });
  }

  function setMessage(value) {
    setText('#builderMessage', value);
  }

  function setText(selector, value) {
    const element = qs(selector);
    if (element) element.textContent = value;
  }

  function formatPrice(value) {
    return App.formatPrice(value);
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return number.toLocaleString('ru-RU', { maximumFractionDigits: Number.isInteger(number) ? 0 : 1 });
  }

  function escapeHtml(value) {
    return App.escapeHtml(value);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }
})();
