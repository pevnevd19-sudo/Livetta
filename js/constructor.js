const API_URL = getApiUrl();
const CART_KEY = 'livetta_cart';

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

const neckStage = document.querySelector('#neckStage');
const necklaceBeads = document.querySelector('#necklaceBeads');
const necklacePath = document.querySelector('#necklacePath');
const necklaceFullPath = document.querySelector('#necklaceFullPath');

const TYPE_CONFIG = {
  'Колье': {
    min: 35,
    max: 70,
    defaultSize: 45,
    claspRatio: 0.08,
    minClasp: 14,
    maxClasp: 30,
    title: 'Колье'
  },
  'Браслет': {
    min: 14,
    max: 24,
    defaultSize: 18,
    claspRatio: 0.08,
    minClasp: 8,
    maxClasp: 18,
    title: 'Браслет'
  }
};

const FALLBACK_STONES = [
  {
    id: 'fallback-garnet',
    name: 'Гранат',
    description: 'Тестовый камень',
    price: 123,
    sizeMm: 8,
    color: '#8b0614',
    image: ''
  }
];

// Чем меньше число, тем плотнее камни.
// Это физический зазор для расчёта занятости.
const PHYSICAL_GAP_MM = 0.01;

// Визуальный зазор между бусинами. Почти вплотную, но без налезания.
const VISUAL_GAP_PX = 0.08;

// Коэффициент размера бусин на экране.
// Если хочешь крупнее бусины, увеличивай.
const BEAD_VISUAL_SCALE = 2.35;

// Не даём слишком маленьким и слишком огромным бусинам ломать вид.
const MIN_BEAD_PX = 12;
const MAX_BEAD_PX = 36;

// Коэффициент расчёта вместимости. Не меняет реальный размер камней, только лимит добавления.
const VISUAL_CAPACITY_FACTOR = 0.82;

// Учетная ширина камня для вместимости. Меньше 1, чтобы конструктор не блокировал добавление слишком рано.
const BEAD_CAPACITY_SIZE_FACTOR = 0.44;

let stonesCatalog = [];
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

    stonesCatalog = await loadStonesCatalog();

    rebuildNecklace();
    renderStonesCatalog();
    updateSummary();

    sceneMessage.hidden = true;
  } catch (error) {
    console.error(error);
    sceneMessage.hidden = false;
    sceneMessage.textContent = 'Не удалось запустить конструктор. Проверь консоль браузера.';
  }
}

function getApiUrl() {
  if (
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return 'http://localhost:3000/api';
  }

  return `${window.location.origin}/api`;
}

async function loadStonesCatalog() {
  try {
    const response = await fetch(`${API_URL}/stones?cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error('Камни не загрузились');
    }

    const data = await response.json();
    const stones = Array.isArray(data) ? data.map(normalizeStone).filter(Boolean) : [];

    return stones.length ? stones : FALLBACK_STONES;
  } catch (error) {
    console.warn('Используется запасной камень:', error.message);
    capacityHint.textContent = 'Сервер с камнями не ответил, поэтому пока включён тестовый камень.';
    return FALLBACK_STONES;
  }
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
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    sizeMm,
    color: normalizeColor(stone.color),
    image: resolveImageUrl(stone.image)
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

  stonesList.addEventListener('click', (event) => {
    const card = event.target.closest('[data-stone-id]');

    if (!card || card.disabled) {
      return;
    }

    const stone = stonesCatalog.find((item) => item.id === card.dataset.stoneId);
    addStone(stone);
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

function renderStonesCatalog() {
  if (!stonesCatalog.length) {
    stonesList.innerHTML = '<p class="muted-text">Камней пока нет. Добавь их в админке.</p>';
    return;
  }

  stonesList.innerHTML = stonesCatalog.map((stone) => {
    const canAdd = getCanAddCount(stone);
    const disabled = canAdd <= 0;
    const image = stone.image ? `<img src="${escapeHtml(stone.image)}" alt="${escapeHtml(stone.name)}" loading="lazy">` : '';

    return `
      <button class="stone-card constructor-stone-card ${disabled ? 'stone-card--disabled' : ''}" type="button" data-stone-id="${escapeHtml(stone.id)}" ${disabled ? 'disabled' : ''}>
        <span class="stone-card__thumb" style="--stone-color:${escapeHtml(stone.color)}">
          ${image || '<span class="stone-card__gem"></span>'}
        </span>

        <span class="stone-card__content">
          <strong>${escapeHtml(stone.name)}</strong>
          <small>${escapeHtml(stone.description)}</small>
          <span class="stone-meta">${formatPrice(stone.price)} ₽ / ${formatNumber(stone.sizeMm)} мм</span>
          <b>${disabled ? 'Не помещается' : `Можно добавить: ${canAdd} шт.`}</b>
        </span>
      </button>
    `;
  }).join('');
}

function addStone(stone) {
  if (!stone) {
    return;
  }

  updateNecklaceShape();

  if (getCanAddCount(stone) <= 0) {
    alert('Камень не помещается по видимой траектории ожерелья.');
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

  const sizeProgress = jewelryType.value === 'Браслет'
    ? clamp((sizeCm - 14) / (24 - 14), 0, 1)
    : clamp((sizeCm - 35) / (70 - 35), 0, 1);

  /*
    Натуральное изменение размера:
    ВЕРХ НЕ ТРОГАЕМ ВООБЩЕ.
    Точки захода за шею, верхняя ширина и центр остаются такими,
    как ты уже отстроил в этом архиве.

    Меняются только средняя и нижняя часть:
    - 35 см: середина и низ поднимаются и сужаются ближе к шее;
    - 45 см: средняя посадка;
    - 70 см: середина и низ становятся ниже и шире.
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

  // Нижняя часть: для 35 см почти у шеи, для 70 см ниже.
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

  const beadModels = stones.map((stone, originalIndex) => {
    const diameter = getBeadDiameter(stone.sizeMm);

    return {
      stone,
      originalIndex,
      diameter,
      radius: diameter / 2
    };
  });

  const totalBeads = beadModels.reduce((sum, bead) => sum + bead.diameter, 0);
  const totalGaps = Math.max(beadModels.length - 1, 0) * VISUAL_GAP_PX;
  const totalLength = totalBeads + totalGaps;

  const usableLength = pathLength * 0.99;

  const compression = totalLength > usableLength
    ? clamp(usableLength / totalLength, 0.78, 1)
    : 1;

  const visualLength = totalLength * compression;
  let cursor = (pathLength - visualLength) / 2;

  const items = beadModels.map((bead) => {
    const radius = bead.radius * compression;
    let desiredCenter;

    if (Number.isFinite(Number(bead.stone._pathRatio))) {
      desiredCenter = clamp(Number(bead.stone._pathRatio), 0, 1) * pathLength;
    } else {
      desiredCenter = cursor + radius;
      cursor += bead.diameter * compression + VISUAL_GAP_PX * compression;
    }

    return {
      ...bead,
      radius,
      desiredCenter: clamp(desiredCenter, radius, pathLength - radius),
      center: clamp(desiredCenter, radius, pathLength - radius)
    };
  });

  applyPathCollisions(items, pathLength);

  return items.map((item) => {
    const point = necklacePath.getPointAtLength(item.center);
    const nextPoint = necklacePath.getPointAtLength(Math.min(item.center + 2, pathLength));
    const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI;

    return {
      stone: item.stone,
      originalIndex: item.originalIndex,
      x: point.x / 1000 * stageRect.width,
      y: point.y / 1000 * stageRect.height,
      diameter: item.radius * 2,
      angle,
      pathLength: item.center,
      pathRatio: pathLength > 0 ? item.center / pathLength : 0
    };
  });
}

function applyPathCollisions(items, pathLength) {
  if (!items.length) {
    return;
  }

  const gap = Math.max(VISUAL_GAP_PX, 0);

  const sorted = [...items].sort((a, b) => {
    if (a.desiredCenter === b.desiredCenter) {
      return a.originalIndex - b.originalIndex;
    }

    return a.desiredCenter - b.desiredCenter;
  });

  // Проход слева направо: каждый следующий камень не может залезть на предыдущий.
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];

    current.center = clamp(current.desiredCenter, current.radius, pathLength - current.radius);

    if (i > 0) {
      const previous = sorted[i - 1];
      const minCenter = previous.center + previous.radius + gap + current.radius;
      current.center = Math.max(current.center, minCenter);
    }
  }

  // Если ряд вылез за конец пути, сдвигаем справа налево.
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

  // Финальный короткий проход, чтобы после обратного сдвига не появилось новых наложений.
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
  const style = [
    `left:${item.x}px`,
    `top:${item.y}px`,
    `width:${item.diameter}px`,
    `height:${item.diameter}px`,
    `--stone-color:${escapeHtml(item.stone.color)}`,
    `--bead-rotate:${item.angle}deg`
  ].join(';');

  const image = item.stone.image
    ? `<img src="${escapeHtml(item.stone.image)}" alt="${escapeHtml(item.stone.name)}" loading="lazy">`
    : '<span></span>';

  return `
    <button
      class="necklace-bead ${animate ? 'necklace-bead--new' : ''}"
      type="button"
      data-bead-index="${index}"
      title="Удалить ${escapeHtml(item.stone.name)}"
      style="${style}">
      ${image}
    </button>
  `;
}

function getBeadDiameter(sizeMm) {
  return clamp(Number(sizeMm || 8) * BEAD_VISUAL_SCALE, MIN_BEAD_PX, MAX_BEAD_PX);
}

function getCanAddCount(stone) {
  updateNecklaceShape();

  const availablePathPx = getAvailableNecklacePathPx();
  const usedPathPx = getVisualUsedLengthPx(selectedStones);
  const freePathPx = Math.max(availablePathPx - usedPathPx, 0);

  const stoneDiameterPx = getBeadDiameter(stone.sizeMm) * VISUAL_CAPACITY_FACTOR;
  const oneStonePx = stoneDiameterPx + (selectedStones.length ? VISUAL_GAP_PX : 0);

  if (oneStonePx <= 0 || freePathPx < stoneDiameterPx) {
    return 0;
  }

  return Math.floor((freePathPx + VISUAL_GAP_PX) / (stoneDiameterPx + VISUAL_GAP_PX));
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

  selectedType.textContent = jewelryType.value;
  selectedSize.textContent = jewelrySize.value;
  totalPrice.textContent = `${formatPrice(total)} ₽`;
  usedLength.textContent = formatNumber(used);
  maxLength.textContent = formatNumber(max);

  undoStone.disabled = selectedStones.length === 0;
  clearConstructor.disabled = selectedStones.length === 0;
  addCustomToCart.disabled = selectedStones.length === 0;

  if (!selectedStones.length) {
    capacityHint.textContent = `Нить свободна. Доступно ${formatNumber(max)} мм под камни.`;
  } else {
    capacityHint.textContent = `На ожерелье: ${selectedStones.length} шт. Свободно ${formatNumber(free)} мм. Камни можно перетаскивать. Двойной клик удаляет камень.`;
  }
}

function addDesignToCart() {
  if (!selectedStones.length) {
    alert('Сначала надень хотя бы один камень.');
    return;
  }

  const cart = readCart();
  const title = `${jewelryType.value} Livetta custom`;
  const total = selectedStones.reduce((sum, stone) => sum + stone.price, 0);

  cart.push({
    id: `custom-necklace-${Date.now()}`,
    custom: true,
    title,
    category: 'Конструктор',
    description: selectedStones.map((stone) => `${stone.name} ${formatNumber(stone.sizeMm)} мм`).join(', '),
    price: total,
    image: selectedStones[0]?.image || '',
    quantity: 1,
    design: {
      type: jewelryType.value,
      size_cm: Number(jewelrySize.value),
      used_mm: getPhysicalUsedLength(selectedStones),
      max_mm: getMaxLength(),
      stones: selectedStones.map((stone) => ({
        id: stone.id,
        name: stone.name,
        price: stone.price,
        size_mm: stone.sizeMm,
        color: stone.color,
        image: stone.image,
        path_ratio: Number.isFinite(Number(stone._pathRatio)) ? Number(stone._pathRatio) : null
      }))
    }
  });

  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  alert('Сборка добавлена в корзину.');
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
  bead.classList.add('necklace-bead--dragging');
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
    draggedBead.bead.classList.remove('necklace-bead--dragging');
    draggedBead.bead.style.left = '';
    draggedBead.bead.style.top = '';
  }

  neckStage?.classList.remove('neck-constructor-stage--dragging');
  draggedBead = null;
}

function moveDraggedBeadToPointer(event) {
  if (!draggedBead?.bead) {
    return;
  }

  const position = getClosestPathPositionFromPointer(event);

  draggedBead.bead.style.left = `${position.x}px`;
  draggedBead.bead.style.top = `${position.y}px`;
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
  const stonesLength = stones.reduce((sum, stone) => sum + stone.sizeMm * BEAD_CAPACITY_SIZE_FACTOR, 0);
  const gaps = Math.max(stones.length - 1, 0) * PHYSICAL_GAP_MM;
  return stonesLength + gaps;
}

function getMaxLength() {
  const fullLength = Number(jewelrySize.value) * 10;
  const config = getTypeConfig();
  const clasp = Math.min(config.maxClasp, Math.max(config.minClasp, fullLength * config.claspRatio));
  return Math.max(fullLength - clasp, 0);
}

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function resolveImageUrl(image) {
  if (!image) {
    return '';
  }

  const value = String(image).trim();

  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value;
  }

  if (value.startsWith('/uploads')) {
    return `${API_URL.replace('/api', '')}${value}`;
  }

  return value;
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
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatNumber(value) {
  const number = Number(value) || 0;

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: number % 1 === 0 ? 0 : 1
  }).format(number);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
