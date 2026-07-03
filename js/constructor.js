const App = window.Livetta;

if (!App) {
  const startupMessage = document.querySelector('#sceneMessage');
  if (startupMessage) {
    startupMessage.hidden = false;
    startupMessage.textContent = 'Не удалось запустить конструктор: не загрузился common.js.';
  }
  throw new Error('Livetta common.js is not loaded');
}

const API_URL = App.getApiUrl();

const sceneMessage = document.querySelector('#sceneMessage');
const stonesList = document.querySelector('#stonesList');
const totalPrice = document.querySelector('#totalPrice');
const usedLength = document.querySelector('#usedLength');
const maxLength = document.querySelector('#maxLength');
const capacityHint = document.querySelector('#capacityHint');
const undoStone = document.querySelector('#undoStone');
const clearConstructor = document.querySelector('#clearConstructor');
const addCustomToCart = document.querySelector('#addCustomToCart');
const jewelryType = document.querySelector('#jewelryType');
const jewelrySize = document.querySelector('#jewelrySize');
const selectedType = document.querySelector('#selectedType');
const selectedSize = document.querySelector('#selectedSize');
const claspType = document.querySelector('#claspType');
const selectedClasp = document.querySelector('#selectedClasp');
const claspMaterial = document.querySelector('#claspMaterial');
const selectedClaspMaterial = document.querySelector('#selectedClaspMaterial');
const stoneSearch = document.querySelector('#stoneSearch');
const clearStoneSearch = document.querySelector('#clearStoneSearch');
const selectedStonesList = document.querySelector('#selectedStonesList');
const openStonesCatalog = document.querySelector('#openStonesCatalog');
const closeStoneCatalog = document.querySelector('#closeStoneCatalog');
const stoneCatalogModal = document.querySelector('#stoneCatalogModal');
const stoneCatalogList = document.querySelector('#stoneCatalogList');

const neckStage = document.querySelector('#neckStage');
const necklaceBeads = document.querySelector('#necklaceBeads');
const necklacePath = document.querySelector('#necklacePath');
const necklaceFullPath = document.querySelector('#necklaceFullPath');

const TYPE_CONFIG = {
  'Колье': {
    min: 30,
    max: 50,
    defaultSize: 45,
    claspRatio: 0.08,
    minClasp: 14,
    maxClasp: 30,
    title: 'Колье'
  }
};

// Чем меньше число, тем плотнее камни.
// Это физический зазор для расчёта занятости.
const PHYSICAL_GAP_MM = 0;

// Визуальный зазор между бусинами. Почти вплотную, но без налезания.
const VISUAL_GAP_PX = 0.08;

// Коэффициент размера бусин на экране.
// Если хочешь крупнее бусины, увеличивай.
const BEAD_VISUAL_SCALE = 2.35;

// Не даём слишком маленьким и слишком огромным бусинам ломать вид.
const MIN_BEAD_PX = 10;
const MAX_BEAD_PX = 120;

// Коэффициент расчёта вместимости. Не меняет реальный размер камней, только лимит добавления.
const VISUAL_CAPACITY_FACTOR = 0.82;

// Учетная ширина камня для вместимости. Меньше 1, чтобы конструктор не блокировал добавление слишком рано.
const BEAD_CAPACITY_SIZE_FACTOR = 1;

// Недрагоценные варианты замков. reserveMm — часть общей длины,
// которую занимает сам замок и соединительные элементы.
const CLASP_OPTIONS = {
  'lobster-steel': { id: 'lobster-steel', name: 'Карабин', material: 'Нержавеющая сталь', reserveMm: 18 },
  'toggle-steel': { id: 'toggle-steel', name: 'Тоггл', material: 'Нержавеющая сталь', reserveMm: 24 },
  'magnetic-steel': { id: 'magnetic-steel', name: 'Магнитный замок', material: 'Нержавеющая сталь', reserveMm: 20 },
  'screw-steel': { id: 'screw-steel', name: 'Винтовой замок', material: 'Нержавеющая сталь', reserveMm: 16 },
  'hook-steel': { id: 'hook-steel', name: 'Замок-крючок', material: 'Нержавеющая сталь', reserveMm: 18 }
};

const CLASP_MATERIALS = {
  steel: { id: 'steel', name: 'Нержавеющая сталь' },
  brass: { id: 'brass', name: 'Латунь' },
  rhodium: { id: 'rhodium', name: 'Родий' }
};
const DEFAULT_CLASP_RESERVE_MM = 20;

let stonesCatalog = [];
let favoriteStones = [];
let selectedStones = [];
let draggedBead = null;
let currentBeadLayout = [];

init();

async function init() {
  try {
    sceneMessage.hidden = false;
    sceneMessage.textContent = 'Загрузка конструктора...';

    createSizeOptions();
    bindEvents();

    // Сначала запускаем сам конструктор. Загрузка каталога не может
    // заблокировать нить, кнопки и перемещение уже добавленных камней.
    stonesCatalog = [];
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
    sceneMessage.hidden = true;
    window.__livettaConstructorReady = true;

    // Камни подгружаются отдельно с тайм-аутом. Даже если API недоступен,
    // вечной надписи «Загрузка конструктора...» больше не будет.
    stonesCatalog = await loadStonesCatalog();
    renderStonesCatalog();
    updateSummary();
  } catch (error) {
    console.error(error);
    window.__livettaConstructorReady = false;
    sceneMessage.hidden = false;
    sceneMessage.textContent = 'Не удалось запустить конструктор. Обновите страницу через Ctrl + F5.';
  }
}

async function loadStonesCatalog() {
  try {
    const response = await fetchWithTimeout(`${API_URL}/stones?cache=${Date.now()}`, 6000);

    if (!response.ok) {
      throw new Error('Камни не загрузились');
    }

    const data = await response.json();
    const stones = Array.isArray(data) ? data.map(normalizeStone).filter(Boolean) : [];

    if (!stones.length) {
      capacityHint.textContent = 'Камни пока не добавлены. Добавьте их в админке, чтобы конструктор стал доступен.';
    }

    return stones;
  } catch (error) {
    console.warn('Камни не загрузились:', error.message);
    capacityHint.textContent = 'Камни не загрузились. Проверьте сервер или добавьте их в админке.';
    return [];
  }
}


function fetchWithTimeout(url, timeoutMs = 6000) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, { cache: 'no-store' });
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    cache: 'no-store',
    signal: controller.signal
  }).finally(() => {
    window.clearTimeout(timer);
  });
}

function normalizeStone(stone) {
  const sizeMm = parseNumber(stone.size_mm ?? stone.sizeMm ?? stone.size);
  const price = parseNumber(stone.price);
  const name = String(stone.name || 'Камень').trim();

  if (!name || !Number.isFinite(sizeMm) || sizeMm <= 0) {
    return null;
  }

  return {
    id: String(stone.id ?? name),
    name,
    description: String(stone.description || 'Камень для сборки').trim(),
    property: String(stone.stone_property || stone.property || '').trim(),
    zodiac: String(stone.zodiac || '').trim(),
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    sizeMm,
    color: normalizeColor(stone.color),
    image: resolveImageUrl(stone.image),
    available: stone.available !== false
  };
}

function createSizeOptions() {
  const config = getTypeConfig();
  const oldSize = Number(jewelrySize.value || config.defaultSize);
  const safeSize = clamp(oldSize, config.min, config.max);
  const options = [];

  for (let size = config.min; size <= config.max; size += 1) {
    options.push(`<option value="${size}">${size} см</option>`);
  }

  jewelrySize.innerHTML = options.join('');
  jewelrySize.value = String(Number.isFinite(safeSize) ? safeSize : config.defaultSize);
  selectedType.textContent = jewelryType.value;
  selectedSize.textContent = jewelrySize.value;
}

function bindEvents() {
  jewelryType.addEventListener('change', () => {
    createSizeOptions();
    trimToCapacity();
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  claspType?.addEventListener('change', () => {
    claspType.classList.remove('is-invalid');
    trimToCapacity();
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  claspMaterial?.addEventListener('change', () => {
    claspMaterial.classList.remove('is-invalid');
    updateSummary();
  });

  jewelrySize.addEventListener('change', () => {
    selectedSize.textContent = jewelrySize.value;
    trimToCapacity();
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  undoStone.addEventListener('click', () => {
    selectedStones.pop();
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  clearConstructor.addEventListener('click', () => {
    selectedStones = [];
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  addCustomToCart.addEventListener('click', addDesignToCart);

  stoneSearch?.addEventListener('input', renderStoneCatalogModal);

  clearStoneSearch?.addEventListener('click', () => {
    if (stoneSearch) stoneSearch.value = '';
    renderStoneCatalogModal();
  });

  openStonesCatalog?.addEventListener('click', openStoneCatalog);
  closeStoneCatalog?.addEventListener('click', closeStoneCatalogModal);

  stoneCatalogModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-stone-catalog]')) closeStoneCatalogModal();
  });

  stoneCatalogList?.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-favorite-stone]');
    if (!favorite) return;
    addFavoriteStone(favorite.dataset.favoriteStone);
  });

  selectedStonesList?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-selected-stone]');
    if (!remove) return;

    const index = Number(remove.dataset.removeSelectedStone);
    if (!Number.isInteger(index)) return;

    selectedStones.splice(index, 1);
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  stonesList.addEventListener('click', (event) => {
    const wear = event.target.closest('[data-wear-favorite]');
    const remove = event.target.closest('[data-remove-favorite]');

    if (wear) {
      const stone = favoriteStones.find((item) => String(item.id) === String(wear.dataset.wearFavorite));
      addStone(stone);
      return;
    }

    if (remove) {
      removeFavoriteStone(remove.dataset.removeFavorite);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStoneCatalogModal();
  });

  necklaceBeads.addEventListener('pointerdown', handleBeadPointerDown);
  necklaceBeads.addEventListener('pointermove', handleBeadPointerMove);
  necklaceBeads.addEventListener('pointerup', handleBeadPointerUp);
  necklaceBeads.addEventListener('pointercancel', handleBeadPointerCancel);

  necklaceBeads.addEventListener('dblclick', (event) => {
    const bead = event.target.closest('[data-bead-index]');

    if (!bead) {
      return;
    }

    const index = Number(bead.dataset.beadIndex);

    if (!Number.isInteger(index)) {
      return;
    }

    selectedStones.splice(index, 1);
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });

  window.addEventListener('resize', () => {
    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();
  });
}

function getTypeConfig() {
  return TYPE_CONFIG[jewelryType.value] || TYPE_CONFIG['Колье'];
}

function openStoneCatalog() {
  if (!stoneCatalogModal) return;
  stoneCatalogModal.hidden = false;
  document.body.classList.add('is-stone-catalog-open');
  renderStoneCatalogModal();
  window.setTimeout(() => stoneSearch?.focus(), 0);
}

function closeStoneCatalogModal() {
  if (!stoneCatalogModal || stoneCatalogModal.hidden) return;
  stoneCatalogModal.hidden = true;
  document.body.classList.remove('is-stone-catalog-open');
}

function addFavoriteStone(stoneId) {
  const stone = stonesCatalog.find((item) => String(item.id) === String(stoneId));
  if (!stone) return;

  if (!favoriteStones.some((item) => String(item.id) === String(stone.id))) {
    favoriteStones.push(stone);
  }

  renderStonesCatalog();
}

function removeFavoriteStone(stoneId) {
  favoriteStones = favoriteStones.filter((item) => String(item.id) !== String(stoneId));
  renderStonesCatalog();
}

function isFavoriteStone(stone) {
  return favoriteStones.some((item) => String(item.id) === String(stone.id));
}

function getStoneSearchQuery() {
  return String(stoneSearch?.value || '').trim().toLowerCase();
}

function getFilteredStones() {
  const query = getStoneSearchQuery();
  if (!query) return stonesCatalog;

  return stonesCatalog.filter((stone) => {
    return [stone.name, stone.description, stone.property, stone.zodiac, stone.color]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function renderStonesCatalog() {
  if (!stonesList) return;

  if (!favoriteStones.length) {
    stonesList.innerHTML = '<p class="muted-text">В избранном пока пусто. Открой каталог камней и добавь нужные камни.</p>';
    renderStoneCatalogModal();
    return;
  }

  stonesList.innerHTML = favoriteStones.map((stone) => {
    const canAdd = getCanAddCount(stone);
    const disabled = stone.available === false || canAdd <= 0;
    const image = stone.image ? `<img src="${escapeHtml(stone.image)}" alt="${escapeHtml(stone.name)}" loading="lazy">` : '<span class="stone-card__gem"></span>';

    return `
      <article class="favorite-stone-card">
        <span class="favorite-stone-card__thumb" style="--stone-color:${escapeHtml(stone.color)}">${image}</span>
        <span class="favorite-stone-card__body">
          <strong>${escapeHtml(stone.name)}</strong>
          ${stone.description ? `<small>${escapeHtml(stone.description)}</small>` : ''}
          ${stone.property ? `<small>${escapeHtml(stone.property)}</small>` : ''}
          ${stone.zodiac ? `<small>Зодиак: ${escapeHtml(stone.zodiac)}</small>` : ''}
          <span class="favorite-stone-card__size">Размер: ${formatNumber(stone.sizeMm)} мм</span>
        </span>
        <span class="favorite-stone-card__actions">
          <button type="button" data-wear-favorite="${escapeHtml(stone.id)}" ${disabled ? 'disabled' : ''}>Надеть</button>
          <button type="button" data-remove-favorite="${escapeHtml(stone.id)}" aria-label="Убрать из избранного">×</button>
        </span>
        <strong class="favorite-stone-card__price">${formatPrice(stone.price)} ₽</strong>
      </article>
    `;
  }).join('');

  renderStoneCatalogModal();
}

function renderStoneCatalogModal() {
  if (!stoneCatalogList) return;

  if (!stonesCatalog.length) {
    stoneCatalogList.innerHTML = '<p class="muted-text">Камней пока нет. Добавь их в админке.</p>';
    return;
  }

  const visibleStones = getFilteredStones();

  if (!visibleStones.length) {
    stoneCatalogList.innerHTML = '<p class="muted-text">По такому запросу камней нет.</p>';
    return;
  }

  stoneCatalogList.innerHTML = visibleStones.map((stone) => {
    const added = isFavoriteStone(stone);
    const image = stone.image ? `<img src="${escapeHtml(stone.image)}" alt="${escapeHtml(stone.name)}" loading="lazy">` : '<span class="stone-card__gem"></span>';

    return `
      <article class="stone-catalog-card">
        <div class="stone-catalog-card__image" style="--stone-color:${escapeHtml(stone.color)}">${image}</div>
        <div class="stone-catalog-card__body">
          <h3>${escapeHtml(stone.name)}</h3>
          ${stone.description ? `<p>${escapeHtml(stone.description)}</p>` : ''}
          ${stone.property ? `<p><b>Свойства:</b> ${escapeHtml(stone.property)}</p>` : ''}
          ${stone.zodiac ? `<p><b>Зодиак:</b> ${escapeHtml(stone.zodiac)}</p>` : ''}
          <span class="stone-catalog-card__size">Размер: ${formatNumber(stone.sizeMm)} мм</span>
        </div>
        <div class="stone-catalog-card__bottom">
          <strong class="stone-catalog-card__price">${formatPrice(stone.price)} ₽</strong>
          <button type="button" data-favorite-stone="${escapeHtml(stone.id)}" ${added ? 'disabled' : ''}>${added ? 'В избранном' : 'В избранное'}</button>
        </div>
      </article>
    `;
  }).join('');
}

function getSelectedStoneGroups() {
  const map = new Map();

  selectedStones.forEach((stone, index) => {
    const key = `${stone.id || stone.name}-${stone.sizeMm || ''}`;
    const current = map.get(key) || {
      stone,
      firstIndex: index,
      count: 0,
      totalPrice: 0
    };

    current.count += 1;
    current.totalPrice += Number(stone.price || 0);
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.stone.name.localeCompare(b.stone.name, 'ru'));
}

function renderSelectedStones() {
  if (!selectedStonesList) return;

  if (!selectedStones.length) {
    selectedStonesList.innerHTML = '<p class="muted-text">Камни пока не выбраны.</p>';
    return;
  }

  selectedStonesList.innerHTML = getSelectedStoneGroups().map((item) => {
    const stone = item.stone;
    const image = stone.image ? `<img src="${escapeHtml(stone.image)}" alt="">` : '<span></span>';

    return `
      <article class="selected-stone-row selected-stone-row--stacked">
        <span class="selected-stone-row__thumb" style="--stone-color:${escapeHtml(stone.color)}">${image}</span>
        <span class="selected-stone-row__body">
          <strong>${escapeHtml(stone.name)}</strong>
          <small>${formatNumber(stone.sizeMm)} мм · ${formatPrice(item.totalPrice)} ₽</small>
          ${stone.property ? `<small>${escapeHtml(stone.property)}</small>` : ''}
          ${stone.zodiac ? `<small>Зодиак: ${escapeHtml(stone.zodiac)}</small>` : ''}
        </span>
        <span class="selected-stone-row__count">${item.count} шт</span>
        <button type="button" data-remove-selected-stone="${item.firstIndex}" aria-label="Убрать один камень">×</button>
      </article>
    `;
  }).join('');
}

function addStone(stone) {
  if (!stone || stone.available === false) {
    return;
  }

  updateNecklaceShape();

  const realCapacity = canAddStoneByRealLength(stone);

  if (!realCapacity.canAdd) {
    showRealCapacityMessage(realCapacity);
    updateRealCapacitySummary();
    renderStonesCatalog();
    return;
  }

  selectedStones.push({ ...stone });
  rebuildNecklace(true);
  renderStonesCatalog();
  updateSummary();
}

function rebuildNecklace(animateLast = false) {
  updateNecklaceShape();
  const layout = buildBeadLayout(selectedStones);
  currentBeadLayout = layout;

  necklaceBeads.innerHTML = layout.map((item, index) => renderBead(item, item.originalIndex, animateLast && index === layout.length - 1)).join('');
}


function updateNecklaceShape() {
  if (!necklacePath) {
    return;
  }

  const sizeCm = Number(jewelrySize.value) || getTypeConfig().defaultSize;

  const sizeProgress = clamp((sizeCm - 30) / (50 - 30), 0, 1);

  /*
    Натуральное изменение размера:
    ВЕРХ НЕ ТРОГАЕМ ВООБЩЕ.
    Точки захода за шею, верхняя ширина и центр остаются такими,
    как ты уже отстроил в этом архиве.

    Меняются только средняя и нижняя часть:
    - 30 см: середина и низ ближе к шее;
    - 40–45 см: средняя посадка;
    - 50 см: середина и низ становятся ниже и шире.
  */

  const centerX = 506.5;

  // Фиксируем верх по твоей текущей посадке.
  const fixedFitProgress = clamp((45 - 35) / (70 - 35), 0, 1);

  // ВЕРХ: не зависит от выбранного размера.
  const topHalf = lerp(150, 270, fixedFitProgress);
  const topY = lerp(330, 260, fixedFitProgress);

  const fullLeftTop = centerX - topHalf;
  const fullRightTop = centerX + topHalf;

  /*
    Естественная посадка:
    Двигаем не верх, а только управляющие точки середины и нижнюю часть.
    Используем easing, чтобы изменение не выглядело механическим.
  */
  const naturalProgress = easeInOut(sizeProgress);

  // Средняя часть: для короткого размера выше и ближе к шее, для длинного ниже.
  const sideY = lerp(425, 655, naturalProgress);

  // Нижняя часть: для 30 см ближе к шее, для 50 см ниже.
  const bottomY = lerp(515, 835, naturalProgress);

  // Сужение средней части и низа. Верхняя ширина не меняется.
  const middleHalf = lerp(230, 370, naturalProgress);
  const bottomHalf = lerp(145, 370, naturalProgress);

  const fullLeftControl = centerX - middleHalf - 88;
  const fullRightControl = centerX + middleHalf + 88;
  const fullLeftBottom = centerX - bottomHalf * 0.58;
  const fullRightBottom = centerX + bottomHalf * 0.58;

  const fullD = [
    `M ${fullLeftTop} ${topY}`,
    `C ${fullLeftControl} ${sideY}, ${fullLeftBottom} ${bottomY}, ${centerX} ${bottomY}`,
    `C ${fullRightBottom} ${bottomY}, ${fullRightControl} ${sideY}, ${fullRightTop} ${topY}`
  ].join(' ');

  if (necklaceFullPath) {
    necklaceFullPath.setAttribute('d', fullD);
  }

  /*
    Камни должны идти строго по траектории ожерелья.
    Поэтому путь для камней берём из той же актуальной формы, что и видимая цепочка.
    Координаты посадки при этом не меняются.
  */
  const exactBeadPathD = fullD;

  /*
    Камни идут по той же натуральной посадке.
    Верх камней не поднимаем к зоне за шеей, чтобы за шеей оставалась цепочка/замок.
  */
  const stoneTopGap = lerp(38, 58, fixedFitProgress);
  const stoneTopY = topY + stoneTopGap;
  const stoneTopHalf = topHalf + lerp(18, 36, fixedFitProgress);

  const beadLeftTop = centerX - stoneTopHalf;
  const beadRightTop = centerX + stoneTopHalf;

  const beadLeftControl = fullLeftControl + 22;
  const beadRightControl = fullRightControl - 22;

  const beadLeftBottom = fullLeftBottom;
  const beadRightBottom = fullRightBottom;

  const beadSideY = sideY + 14;
  const beadBottomY = bottomY;

  const beadD = [
    `M ${beadLeftTop} ${stoneTopY}`,
    `C ${beadLeftControl} ${beadSideY}, ${beadLeftBottom} ${beadBottomY}, ${centerX} ${beadBottomY}`,
    `C ${beadRightBottom} ${beadBottomY}, ${beadRightControl} ${beadSideY}, ${beadRightTop} ${stoneTopY}`
  ].join(' ');

  necklacePath.setAttribute('d', exactBeadPathD);

  const stage = document.querySelector('#neckStage');

  if (stage) {
    stage.dataset.necklaceSize = String(sizeCm);
    stage.style.setProperty('--necklace-size-progress', sizeProgress.toFixed(3));
  }
}

function buildBeadLayout(stones) {
  if (!stones.length || !necklacePath || !neckStage) {
    return [];
  }

  const stageRect = neckStage.getBoundingClientRect();
  const pathLength = necklacePath.getTotalLength();

  const scaleX = stageRect.width / 1000;
  const scaleY = stageRect.height / 1000;
  const averageScale = Math.max((scaleX + scaleY) / 2, 0.001);
  const visualGapSvg = VISUAL_GAP_PX / averageScale;

  const beadModels = stones.map((stone, originalIndex) => {
    const diameterPx = getBeadDiameter(stone.sizeMm);
    const diameterSvg = diameterPx / averageScale;

    return {
      stone,
      originalIndex,
      diameterPx,
      diameterSvg,
      radiusSvg: diameterSvg / 2
    };
  });

  const totalBeadsSvg = beadModels.reduce((sum, bead) => sum + bead.diameterSvg, 0);
  const totalGapsSvg = Math.max(beadModels.length - 1, 0) * visualGapSvg;
  const totalLengthSvg = totalBeadsSvg + totalGapsSvg;

  const usableLength = pathLength * 0.995;

  const compression = totalLengthSvg > usableLength
    ? clamp(usableLength / totalLengthSvg, 0.72, 1)
    : 1;

  const visualLengthSvg = totalLengthSvg * compression;
  let cursor = (pathLength - visualLengthSvg) / 2;

  const items = beadModels.map((bead) => {
    const radiusSvg = bead.radiusSvg * compression;
    let desiredCenter;

    if (Number.isFinite(Number(bead.stone._pathRatio))) {
      desiredCenter = clamp(Number(bead.stone._pathRatio), 0, 1) * pathLength;
    } else {
      desiredCenter = cursor + radiusSvg;
      cursor += bead.diameterSvg * compression + visualGapSvg * compression;
    }

    return {
      ...bead,
      radius: radiusSvg,
      radiusPx: radiusSvg * averageScale,
      desiredCenter: clamp(desiredCenter, radiusSvg, pathLength - radiusSvg),
      center: clamp(desiredCenter, radiusSvg, pathLength - radiusSvg)
    };
  });

  applyPathCollisions(items, pathLength, visualGapSvg * compression);

  return items.map((item) => {
    const point = necklacePath.getPointAtLength(item.center);
    const nextPoint = necklacePath.getPointAtLength(Math.min(item.center + 2, pathLength));
    const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;

    return {
      stone: item.stone,
      originalIndex: item.originalIndex,
      svgX: point.x,
      svgY: point.y,
      diameterSvg: item.radius * 2,
      x: point.x / 1000 * stageRect.width,
      y: point.y / 1000 * stageRect.height,
      diameter: item.radiusPx * 2,
      angle,
      pathLength: item.center,
      pathRatio: pathLength > 0 ? item.center / pathLength : 0
    };
  });
}

function applyPathCollisions(items, pathLength, customGap = VISUAL_GAP_PX) {
  if (!items.length) {
    return;
  }

  const gap = Math.max(customGap, 0);

  const sorted = [...items].sort((a, b) => {
    if (a.desiredCenter === b.desiredCenter) {
      return a.originalIndex - b.originalIndex;
    }

    return a.desiredCenter - b.desiredCenter;
  });

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];

    current.center = clamp(current.desiredCenter, current.radius, pathLength - current.radius);

    if (i > 0) {
      const previous = sorted[i - 1];
      const minCenter = previous.center + previous.radius + gap + current.radius;
      current.center = Math.max(current.center, minCenter);
    }
  }

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const current = sorted[i];

    current.center = Math.min(current.center, pathLength - current.radius);

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const maxCenter = next.center - next.radius - gap - current.radius;
      current.center = Math.min(current.center, maxCenter);
    }

    current.center = Math.max(current.center, current.radius);
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const minCenter = previous.center + previous.radius + gap + current.radius;

    if (current.center < minCenter) {
      current.center = minCenter;
    }
  }
}
function renderBead(item, index, animate) {
  const radius = item.diameterSvg / 2;
  const safeIndex = String(index).replace(/[^\w-]/g, '');
  const clipId = `necklaceStoneClip-${safeIndex}`;
  const gradientId = `necklaceStoneGradient-${safeIndex}`;
  const style = `--stone-color:${escapeHtml(item.stone.color)}`;
  const image = item.stone.image
    ? `<image class="necklace-svg-bead__image" href="${escapeHtml(item.stone.image)}" x="${-radius}" y="${-radius}" width="${item.diameterSvg}" height="${item.diameterSvg}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"></image>`
    : '';

  return `
    <g
      class="necklace-svg-bead ${animate ? 'necklace-svg-bead--new' : ''}"
      data-bead-index="${index}"
      transform="translate(${item.svgX} ${item.svgY}) rotate(${item.angle})"
      style="${style}">
      <title>Удалить ${escapeHtml(item.stone.name)}</title>
      <defs>
        <radialGradient id="${gradientId}" cx="32%" cy="25%" r="76%">
          <stop offset="0%" stop-color="#fff" stop-opacity=".96"></stop>
          <stop offset="42%" stop-color="${escapeHtml(item.stone.color)}"></stop>
          <stop offset="100%" stop-color="${escapeHtml(item.stone.color)}" stop-opacity=".72"></stop>
        </radialGradient>
        <clipPath id="${clipId}">
          <circle cx="0" cy="0" r="${radius}"></circle>
        </clipPath>
      </defs>
      <g class="necklace-svg-bead__visual">
        <circle class="necklace-svg-bead__base" cx="0" cy="0" r="${radius}" fill="url(#${gradientId})"></circle>
        ${image}
        <circle class="necklace-svg-bead__stroke" cx="0" cy="0" r="${radius}"></circle>
        <ellipse class="necklace-svg-bead__shine" cx="${-radius * 0.28}" cy="${-radius * 0.34}" rx="${radius * 0.22}" ry="${radius * 0.14}"></ellipse>
      </g>
    </g>
  `;
}
function getBeadDiameter(sizeMm) {
  const realSizeMm = Number(sizeMm || 8);
  const necklaceLengthMm = getMaxLength();
  const availablePathPx = getAvailableNecklacePathPx();

  if (
    Number.isFinite(realSizeMm) &&
    realSizeMm > 0 &&
    Number.isFinite(necklaceLengthMm) &&
    necklaceLengthMm > 0 &&
    Number.isFinite(availablePathPx) &&
    availablePathPx > 0
  ) {
    const diameterPx = (realSizeMm / necklaceLengthMm) * availablePathPx * 1.03;
    return clamp(diameterPx, MIN_BEAD_PX, MAX_BEAD_PX);
  }

  return clamp(realSizeMm * BEAD_VISUAL_SCALE, MIN_BEAD_PX, MAX_BEAD_PX);
}

function getCanAddCount(stone) {
  const stoneSizeMm = getStoneSizeMm(stone);
  const freeMm = Math.max(getMaxLength() - getPhysicalUsedLength(selectedStones), 0);

  if (!Number.isFinite(stoneSizeMm) || stoneSizeMm <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor((freeMm + 0.0001) / stoneSizeMm));
}

function trimToCapacity() {
  while (selectedStones.length && getPhysicalUsedLength(selectedStones) > getMaxLength()) {
    selectedStones.pop();
  }
}

function updateSummary() {
  const total = selectedStones.reduce((sum, stone) => sum + stone.price, 0);
  const used = getPhysicalUsedLength(selectedStones);
  const max = getMaxLength();
  const free = Math.max(max - used, 0);

  const clasp = getSelectedClasp();
  const material = getSelectedClaspMaterial();
  selectedType.textContent = jewelryType.value;
  selectedSize.textContent = jewelrySize.value;
  if (selectedClasp) selectedClasp.textContent = clasp ? `${clasp.name}` : 'Не выбран';
  totalPrice.textContent = `${formatPrice(total)} ₽`;
  usedLength.textContent = formatNumber(used);
  maxLength.textContent = formatNumber(max);

  undoStone.disabled = selectedStones.length === 0;
  clearConstructor.disabled = selectedStones.length === 0;
  addCustomToCart.disabled = selectedStones.length === 0 || !clasp || !material;

  if (!clasp) {
    capacityHint.textContent = selectedStones.length
      ? `Выберите тип замка. Сейчас расчёт выполнен с запасом ${DEFAULT_CLASP_RESERVE_MM} мм.`
      : `Сначала выберите замок, затем добавляйте камни. Под камни доступно ${formatNumber(max)} мм.`;
  } else if (!material) {
    capacityHint.textContent = 'Выберите материал застежки.';
  } else if (!selectedStones.length) {
    capacityHint.textContent = `Нить свободна. С учётом замка «${clasp.name}» доступно ${formatNumber(max)} мм под камни.`;
  } else {
    capacityHint.textContent = `Бусин: ${selectedStones.length}. Занято ${formatNumber(used)} из ${formatNumber(max)} мм, свободно ${formatNumber(free)} мм. Двойной клик удаляет камень.`;
  }

  updateRealCapacitySummary();
  renderSelectedStones();
}

async function addDesignToCart() {
  if (!selectedStones.length) return;

  const clasp = getSelectedClasp();
  const material = getSelectedClaspMaterial();
  if (!clasp) {
    claspType?.classList.add('is-invalid');
    claspType?.focus();
    capacityHint.textContent = 'Выберите тип замка — без него сборку нельзя добавить в корзину.';
    return;
  }
  claspType?.classList.remove('is-invalid');

  if (!material) {
    claspMaterial?.classList.add('is-invalid');
    claspMaterial?.focus();
    capacityHint.textContent = 'Выберите материал застежки.';
    return;
  }

  claspMaterial?.classList.remove('is-invalid');
  addCustomToCart.disabled = true;

  try {
    rebuildNecklace(false);

    const cart = readCart();
    const title = `${jewelryType.value} Livetta custom`;
    const total = selectedStones.reduce((sum, stone) => sum + stone.price, 0);
    const composition = getDesignComposition(selectedStones);
    const previewImage = await createDesignPreviewImage();

    cart.push({
      id: `custom-necklace-${Date.now()}`,
      custom: true,
      title,
      category: 'Конструктор',
      description: getCompositionText(composition),
      price: total,
      image: previewImage,
      quantity: 1,
      composition,
      design: {
        type: jewelryType.value,
        size_cm: Number(jewelrySize.value),
        clasp: { ...clasp, material: material.name },
        clasp_type: clasp.id,
        clasp_material: material.id,
        clasp_material_name: material.name,
        used_mm: getPhysicalUsedLength(selectedStones),
        max_mm: getMaxLength(),
        preview_image: previewImage,
        composition,
        stones_count: selectedStones.length,
        stones: selectedStones.map((stone) => ({
          id: stone.id,
          name: stone.name,
          description: stone.description,
          property: stone.property,
          zodiac: stone.zodiac,
          price: stone.price,
          size_mm: stone.sizeMm,
          color: stone.color,
          image: stone.image,
          path_ratio: Number.isFinite(Number(stone._pathRatio)) ? Number(stone._pathRatio) : null
        }))
      }
    });

    App.writeCart(cart);
    animateConstructorCartButton(addCustomToCart);
  } finally {
    window.setTimeout(() => {
      addCustomToCart.disabled = selectedStones.length === 0 || !getSelectedClasp() || !getSelectedClaspMaterial();
    }, 1250);
  }
}

function handleBeadPointerDown(event) {
  const bead = event.target.closest('[data-bead-index]');

  if (!bead || !necklacePath || !neckStage) {
    return;
  }

  const index = Number(bead.dataset.beadIndex);

  if (!Number.isInteger(index)) {
    return;
  }

  event.preventDefault();

  draggedBead = {
    index,
    pointerId: event.pointerId,
    bead,
    moved: false
  };

  bead.setPointerCapture?.(event.pointerId);
  bead.classList.add('necklace-svg-bead--dragging');
  neckStage.classList.add('neck-constructor-stage--dragging');

  moveDraggedBeadToPointer(event);
}

function handleBeadPointerMove(event) {
  if (!draggedBead || draggedBead.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  draggedBead.moved = true;
  moveDraggedBeadToPointer(event);
}

function handleBeadPointerUp(event) {
  if (!draggedBead || draggedBead.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();

  const fromIndex = draggedBead.index;
  const position = getClosestPathPositionFromPointer(event);
  const pathLength = necklacePath.getTotalLength();
  const pathRatio = pathLength > 0 ? clamp(position.length / pathLength, 0, 1) : 0;

  finishBeadDrag();

  if (
    Number.isInteger(fromIndex) &&
    selectedStones[fromIndex]
  ) {
    selectedStones[fromIndex]._pathRatio = pathRatio;
  }

  rebuildNecklace();

  /*
    После rebuild срабатывает коллизия.
    Сохраняем уже исправленную позицию, чтобы камень не залезал на соседние
    и при следующей перерисовке оставался в ближайшем свободном месте.
  */
  const placedItem = currentBeadLayout.find((item) => item.originalIndex === fromIndex);

  if (placedItem && selectedStones[fromIndex]) {
    selectedStones[fromIndex]._pathRatio = placedItem.pathRatio;
    rebuildNecklace();
  }

  renderStonesCatalog();
  updateSummary();
}
function handleBeadPointerCancel(event) {
  if (!draggedBead || draggedBead.pointerId !== event.pointerId) {
    return;
  }

  finishBeadDrag();
  rebuildNecklace();
}

function finishBeadDrag() {
  if (draggedBead?.bead) {
    draggedBead.bead.classList.remove('necklace-svg-bead--dragging');
    draggedBead.bead.style.left = '';
    draggedBead.bead.style.top = '';
    draggedBead.bead.removeAttribute('data-dragging');
  }

  neckStage?.classList.remove('neck-constructor-stage--dragging');
  draggedBead = null;
}

function moveDraggedBeadToPointer(event) {
  if (!draggedBead?.bead) {
    return;
  }

  const position = getClosestPathPositionFromPointer(event);

  draggedBead.bead.setAttribute('transform', `translate(${position.svgX} ${position.svgY})`);
  draggedBead.bead.setAttribute('data-dragging', 'true');
}

function getDropIndexFromPointer(event) {
  if (!selectedStones.length) {
    return 0;
  }

  const position = getClosestPathPositionFromPointer(event);
  const centers = currentBeadLayout
    .map((item) => item.pathLength)
    .filter((value) => Number.isFinite(value));

  if (!centers.length) {
    return 0;
  }

  if (centers.length === 1) {
    return 0;
  }

  const first = centers[0];
  const last = centers[centers.length - 1];

  if (position.length <= first) {
    return 0;
  }

  if (position.length >= last) {
    return centers.length - 1;
  }

  const ratio = (position.length - first) / Math.max(last - first, 1);
  return clamp(
    Math.round(ratio * (centers.length - 1)),
    0,
    centers.length - 1
  );
}

function getClosestPathPositionFromPointer(event) {
  const stageRect = neckStage.getBoundingClientRect();
  const svgX = (event.clientX - stageRect.left) / Math.max(stageRect.width, 1) * 1000;
  const svgY = (event.clientY - stageRect.top) / Math.max(stageRect.height, 1) * 1000;

  const pathLength = necklacePath.getTotalLength();
  const samples = 180;

  let bestLength = 0;
  let bestDistance = Infinity;
  let bestPoint = necklacePath.getPointAtLength(0);

  for (let i = 0; i <= samples; i += 1) {
    const currentLength = pathLength * (i / samples);
    const point = necklacePath.getPointAtLength(currentLength);
    const dx = point.x - svgX;
    const dy = point.y - svgY;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestLength = currentLength;
      bestPoint = point;
    }
  }

  return {
    svgX: bestPoint.x,
    svgY: bestPoint.y,
    x: bestPoint.x / 1000 * stageRect.width,
    y: bestPoint.y / 1000 * stageRect.height,
    length: bestLength
  };
}

function getAvailableNecklacePathPx() {
  if (!necklacePath || !neckStage) {
    return getMaxLength();
  }

  const stageRect = neckStage.getBoundingClientRect();
  const pathLength = necklacePath.getTotalLength();

  // viewBox 1000x1000, stage квадратный, поэтому переводим SVG-длину в реальные CSS-пиксели.
  const scaleX = stageRect.width / 1000;
  const scaleY = stageRect.height / 1000;
  const averageScale = (scaleX + scaleY) / 2;

  // 0.985 оставляет небольшой запас, чтобы последняя бусина не залезала в зону цепочки/замка.
  return pathLength * averageScale * 0.995;
}

function getVisualUsedLengthPx(stones) {
  if (!stones.length) {
    return 0;
  }

  const stonesLength = stones.reduce((sum, stone) => {
    return sum + getBeadDiameter(stone.sizeMm) * VISUAL_CAPACITY_FACTOR;
  }, 0);

  const gaps = Math.max(stones.length - 1, 0) * VISUAL_GAP_PX;

  return stonesLength + gaps;
}

function getPhysicalUsedLength(stones) {
  if (!Array.isArray(stones) || !stones.length) {
    return 0;
  }

  const stonesLength = stones.reduce((sum, stone) => {
    return sum + getStoneSizeMm(stone);
  }, 0);

  const gaps = Math.max(stones.length - 1, 0) * PHYSICAL_GAP_MM;
  return stonesLength + gaps;
}

function getMaxLength() {
  return getAvailableBeadLengthMm();
}

function readCart() {
  return App.readCart();
}

function resolveImageUrl(image) {
  return App.resolveImageUrl(image);
}

function normalizeColor(color) {
  const value = String(color || '').trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    return value;
  }

  return '#b48a78';
}

function parseNumber(value) {
  if (value === undefined || value === null) {
    return NaN;
  }

  return Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''));
}

function formatPrice(value) {
  return App.formatPrice(value);
}

function formatNumber(value) {
  const number = Number(value) || 0;

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: number % 1 === 0 ? 0 : 1
  }).format(number);
}

function escapeHtml(value) {
  return App.escapeHtml(value);
}

function easeInOut(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function animateConstructorCartButton(button) {
  if (!button) return;
  const originalText = button.dataset.originalText || button.textContent.trim() || 'Купить';
  button.dataset.originalText = originalText;
  button.classList.add('is-added-to-cart');
  button.textContent = '✓';
  window.clearTimeout(button._buyAnimationTimer);
  button._buyAnimationTimer = window.setTimeout(() => {
    button.classList.remove('is-added-to-cart');
    button.textContent = originalText;
  }, 1200);
}


/* Real stone capacity fix: расчёт вместимости по миллиметрам */
function getSelectedNecklaceLengthMm() {
  const sizeCm = Number(jewelrySize?.value) || getTypeConfig().defaultSize;
  return Math.max(1, sizeCm * 10);
}

function getSelectedClasp() {
  return CLASP_OPTIONS[String(claspType?.value || '')] || null;
}

function getSelectedClaspMaterial() {
  const id = String(claspMaterial?.value || '');
  return CLASP_MATERIALS[id] || null;
}

function getClaspReserveMm() {
  return getSelectedClasp()?.reserveMm || DEFAULT_CLASP_RESERVE_MM;
}

function getAvailableBeadLengthMm() {
  return Math.max(1, getSelectedNecklaceLengthMm() - getClaspReserveMm());
}

function getStoneSizeMm(stone) {
  if (!stone) {
    return 8;
  }

  const candidates = [
    stone.size_mm,
    stone.sizeMm,
    stone.size,
    stone.diameter_mm,
    stone.diameterMm,
    stone.diameter,
    stone.width_mm,
    stone.widthMm,
    stone.width
  ];

  for (const candidate of candidates) {
    const value = parseFloat(String(candidate ?? '').replace(',', '.'));

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 8;
}

function getLargestSelectedStoneSizeMm() {
  const selected = getSelectedConstructorStones();

  if (!selected.length) {
    return 8;
  }

  return selected.reduce((max, stone) => {
    return Math.max(max, getStoneSizeMm(stone));
  }, 1);
}

function getSelectedConstructorStones() {
  const possibleArrays = [
    typeof necklaceStones !== 'undefined' ? necklaceStones : null,
    typeof selectedStones !== 'undefined' ? selectedStones : null,
    typeof placedStones !== 'undefined' ? placedStones : null,
    typeof currentStones !== 'undefined' ? currentStones : null,
    typeof constructorStones !== 'undefined' ? constructorStones : null
  ];

  for (const array of possibleArrays) {
    if (Array.isArray(array) && array.length) {
      return array;
    }
  }

  return [];
}

function getRealMaxStonesByMm(stone = null) {
  const lengthMm = getAvailableBeadLengthMm();
  const stoneSizeMm = stone ? getStoneSizeMm(stone) : getLargestSelectedStoneSizeMm();

  if (!Number.isFinite(lengthMm) || lengthMm <= 0 || !Number.isFinite(stoneSizeMm) || stoneSizeMm <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(lengthMm / stoneSizeMm));
}

function canAddStoneByRealLength(stone) {
  const selectedLength = selectedStones.length;
  const stoneSizeMm = getStoneSizeMm(stone);
  const usedMm = getPhysicalUsedLength(selectedStones);
  const necklaceLengthMm = getMaxLength();
  const freeMm = Math.max(necklaceLengthMm - usedMm, 0);
  const maxStones = Math.floor((necklaceLengthMm + 0.0001) / stoneSizeMm);

  return {
    canAdd: stoneSizeMm > 0 && usedMm + stoneSizeMm <= necklaceLengthMm + 0.0001,
    selectedLength,
    maxStones,
    stoneSizeMm,
    usedMm,
    freeMm,
    necklaceLengthMm
  };
}

function showRealCapacityMessage(capacity) {
  const message = `На нить ${Math.round(capacity.necklaceLengthMm)} мм можно надеть максимум ${capacity.maxStones} камн. по ${capacity.stoneSizeMm} мм.`;

  if (capacityHint) {
    capacityHint.textContent = message;
  }

  const target =
    document.querySelector('#constructorMessage') ||
    document.querySelector('#capacityMessage') ||
    document.querySelector('#summaryMessage') ||
    document.querySelector('.constructor-message');

  if (target) {
    target.textContent = message;
    target.classList.add('is-visible');
  }

  return message;
}

function updateRealCapacitySummary() {
  const selected = selectedStones;
  const lengthMm = getMaxLength();
  const usedMm = getPhysicalUsedLength(selected);
  const freeMm = Math.max(lengthMm - usedMm, 0);
  const largestStone = getLargestSelectedStoneSizeMm();
  const maxStones = largestStone > 0 ? Math.floor(lengthMm / largestStone) : 0;

  const targets = [
    document.querySelector('#capacityInfo'),
    document.querySelector('#stonesCapacity'),
    document.querySelector('[data-capacity-info]')
  ].filter(Boolean);

  targets.forEach((target) => {
    target.textContent = `Занято: ${selected.length} / ${maxStones}. Нить: ${Math.round(lengthMm)} мм. Свободно: ${formatNumber(freeMm)} мм.`;
  });

  return { selected, largestStone, lengthMm, maxStones, usedMm, freeMm };
}



/* Constructor cart preview + composition */
function getDesignComposition(stones) {
  const map = new Map();

  stones.forEach((stone) => {
    const key = `${stone.id || stone.name}-${stone.sizeMm || ''}`;
    const current = map.get(key) || {
      id: stone.id,
      name: stone.name || 'Камень',
      count: 0,
      size_mm: stone.sizeMm,
      price: stone.price || 0,
      description: stone.description || '',
      property: stone.property || '',
      zodiac: stone.zodiac || '',
      color: stone.color || '#ee9ac5',
      image: stone.image || ''
    };

    current.count += 1;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function getCompositionText(composition) {
  if (!Array.isArray(composition) || !composition.length) {
    return '';
  }

  return composition.map((item) => `${item.name} ×${item.count}`).join(', ');
}

async function createDesignPreviewImage() {
  if (!selectedStones.length || !necklacePath || !neckStage) {
    return selectedStones[0]?.image || '';
  }

  try {
    const canvas = document.createElement('canvas');
    const size = 760;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    const stageRect = neckStage.getBoundingClientRect();
    const pathLength = necklacePath.getTotalLength();

    ctx.fillStyle = '#fff7fb';
    ctx.fillRect(0, 0, size, size);

    const gradient = ctx.createRadialGradient(size * .25, size * .16, 0, size * .5, size * .48, size * .72);
    gradient.addColorStop(0, 'rgba(238, 154, 197, .22)');
    gradient.addColorStop(.55, 'rgba(184, 138, 223, .12)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(184, 138, 223, .35)';
    ctx.lineWidth = 7;
    ctx.beginPath();

    const samples = 220;

    for (let i = 0; i <= samples; i += 1) {
      const point = necklacePath.getPointAtLength(pathLength * (i / samples));
      const x = point.x / 1000 * size;
      const y = point.y / 1000 * size;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    const layout = currentBeadLayout.length ? currentBeadLayout : buildBeadLayout(selectedStones);
    const scale = size / Math.max(stageRect.width || 1, 1);

    for (const item of layout) {
      const pathPoint = necklacePath.getPointAtLength(pathLength * item.pathRatio);
      const x = pathPoint.x / 1000 * size;
      const y = pathPoint.y / 1000 * size;
      const diameter = clamp(item.diameter * scale, 12, 120);
      const radius = diameter / 2;

      await drawPreviewBead(ctx, item.stone, x, y, radius);
    }

    return canvas.toDataURL('image/jpeg', .88);
  } catch (error) {
    console.warn('Не удалось сделать canvas-превью, используется SVG:', error);
    return createFallbackSvgPreviewImage();
  }
}

async function drawPreviewBead(ctx, stone, x, y, radius) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  const image = await loadPreviewImage(stone.image);

  if (image) {
    const size = radius * 2;
    ctx.drawImage(image, x - radius, y - radius, size, size);
  } else {
    const gradient = ctx.createRadialGradient(x - radius * .35, y - radius * .35, radius * .08, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.75)');
    gradient.addColorStop(.35, stone.color || '#ee9ac5');
    gradient.addColorStop(1, shadeColor(stone.color || '#ee9ac5', -28));

    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.72)';
  ctx.lineWidth = Math.max(1, radius * .08);
  ctx.stroke();
}

function loadPreviewImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function createFallbackSvgPreviewImage() {
  const composition = getDesignComposition(selectedStones);
  const beads = selectedStones.map((stone, index) => {
    const x = 130 + (index % 8) * 70;
    const y = 360 + Math.sin(index / Math.max(selectedStones.length - 1, 1) * Math.PI) * 150;
    const color = stone.color || '#ee9ac5';

    return `<circle cx="${x}" cy="${y}" r="30" fill="${color}" stroke="rgba(255,255,255,.8)" stroke-width="4"/>`;
  }).join('');

  const text = escapeXml(getCompositionText(composition));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 760 760">
      <rect width="760" height="760" fill="#fff7fb"/>
      <circle cx="190" cy="120" r="170" fill="rgba(238,154,197,.18)"/>
      <circle cx="620" cy="150" r="190" fill="rgba(184,138,223,.14)"/>
      <path d="M120 315 C150 610 610 610 640 315" fill="none" stroke="rgba(184,138,223,.35)" stroke-width="8" stroke-linecap="round"/>
      ${beads}
      <text x="380" y="690" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="rgba(28,20,32,.72)">${text}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function shadeColor(color, percent) {
  const value = String(color || '#ee9ac5').replace('#', '');

  if (!/^[0-9a-f]{6}$/i.test(value)) {
    return color || '#ee9ac5';
  }

  const amount = Math.round(2.55 * percent);
  const r = clamp(parseInt(value.slice(0, 2), 16) + amount, 0, 255);
  const g = clamp(parseInt(value.slice(2, 4), 16) + amount, 0, 255);
  const b = clamp(parseInt(value.slice(4, 6), 16) + amount, 0, 255);

  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
