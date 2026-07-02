const {
  escapeHtml,
  formatPrice,
  getApiUrl,
  getProductImages,
  resolveImageUrl
} = window.Livetta;

const carouselTrack = document.querySelector('#homeCarouselTrack');
const carouselPrev = document.querySelector('#homeCarouselPrev');
const carouselNext = document.querySelector('#homeCarouselNext');
const carouselDotsWrap = document.querySelector('#homeCarouselDots');
const homePopularGrid = document.querySelector('#homePopularGrid');

const fallbackCarouselSlides = [
  {
    image: '',
    alt: 'Подарочный сертификат LiVetta'
  },
  {
    image: '',
    alt: 'Летняя коллекция украшений LiVetta'
  }
];

let carouselSlidesData = [...fallbackCarouselSlides];
let currentSlide = 0;
let carouselTimer = null;

initHomePage();

function initHomePage() {
  loadHomeCarouselImages();
  loadHomePopularProducts();

  carouselPrev?.addEventListener('click', () => {
    showHomeSlide(currentSlide - 1);
    startHomeCarousel();
  });

  carouselNext?.addEventListener('click', () => {
    nextHomeSlide();
    startHomeCarousel();
  });

  carouselTrack?.addEventListener('mouseenter', stopHomeCarousel);
  carouselTrack?.addEventListener('mouseleave', startHomeCarousel);
}

function normalizeCarouselSlides(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.slides)) return data.slides;

  const slides = [];
  if (data?.slide1) slides.push({ image: data.slide1, alt: 'Фото карусели 1' });
  if (data?.slide2) slides.push({ image: data.slide2, alt: 'Фото карусели 2' });

  return slides;
}

function renderHomeCarousel(slides) {
  if (!carouselTrack || !carouselDotsWrap) return;

  carouselSlidesData = slides.length ? slides : [...fallbackCarouselSlides];

  carouselTrack.innerHTML = carouselSlidesData.map((slide, index) => {
    const image = typeof slide === 'string' ? slide : slide.image;
    const alt = typeof slide === 'string'
      ? `Фото карусели ${index + 1}`
      : (slide.alt || `Фото карусели ${index + 1}`);
    const media = image
      ? `<img src="${escapeHtml(resolveImageUrl(image))}" alt="${escapeHtml(alt)}">`
      : '<span class="home-slide__monogram">LiVetta</span>';

    return `
      <article class="home-carousel__slide ${index === 0 ? 'is-active' : ''}">
        ${media}
      </article>
    `;
  }).join('');

  carouselDotsWrap.innerHTML = carouselSlidesData.map((_, index) => `
    <button class="${index === 0 ? 'is-active' : ''}" type="button" aria-label="Показать слайд ${index + 1}"></button>
  `).join('');

  Array.from(carouselDotsWrap.querySelectorAll('button')).forEach((dot, index) => {
    dot.addEventListener('click', () => {
      showHomeSlide(index);
      startHomeCarousel();
    });
  });

  const hasManySlides = carouselSlidesData.length > 1;
  if (carouselPrev) carouselPrev.hidden = !hasManySlides;
  if (carouselNext) carouselNext.hidden = !hasManySlides;
  carouselDotsWrap.hidden = !hasManySlides;

  showHomeSlide(0);
}

function showHomeSlide(index) {
  const carouselSlides = Array.from(document.querySelectorAll('.home-carousel__slide'));
  const carouselDots = Array.from(document.querySelectorAll('#homeCarouselDots button'));

  if (!carouselSlides.length || !carouselTrack) return;

  currentSlide = (index + carouselSlides.length) % carouselSlides.length;
  carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;

  carouselSlides.forEach((slide, slideIndex) => {
    slide.classList.toggle('is-active', slideIndex === currentSlide);
  });

  carouselDots.forEach((dot, dotIndex) => {
    dot.classList.toggle('is-active', dotIndex === currentSlide);
  });
}

function nextHomeSlide() {
  showHomeSlide(currentSlide + 1);
}

function startHomeCarousel() {
  stopHomeCarousel();
  if (carouselSlidesData.length > 1) {
    carouselTimer = window.setInterval(nextHomeSlide, 4500);
  }
}

function stopHomeCarousel() {
  if (!carouselTimer) return;
  window.clearInterval(carouselTimer);
  carouselTimer = null;
}

async function loadHomeCarouselImages() {
  try {
    const response = await fetch(`${getApiUrl('/carousel')}?cache=${Date.now()}`);

    if (!response.ok) {
      renderHomeCarousel(fallbackCarouselSlides);
      return;
    }

    const data = await response.json();
    renderHomeCarousel(normalizeCarouselSlides(data));
  } catch (error) {
    console.warn('Не удалось загрузить фото карусели:', error);
    renderHomeCarousel(fallbackCarouselSlides);
  }

  startHomeCarousel();
}

async function loadHomePopularProducts() {
  if (!homePopularGrid) return;

  try {
    const response = await fetch(`${getApiUrl('/popular-products')}?cache=${Date.now()}`);

    if (!response.ok) throw new Error('Ошибка загрузки популярных товаров');

    const products = await response.json();

    if (!Array.isArray(products) || !products.length) {
      homePopularGrid.innerHTML = '<p class="muted-text">Популярные товары пока не выбраны.</p>';
      return;
    }

    homePopularGrid.innerHTML = products.map(renderHomePopularProduct).join('');
  } catch (error) {
    console.warn(error);
    homePopularGrid.innerHTML = '<p class="muted-text">Не удалось загрузить популярные товары.</p>';
  }
}

function renderHomePopularProduct(product) {
  const images = getProductImages(product);
  const image = resolveImageUrl(images[0] || product.image);
  const productUrl = `product.html?id=${encodeURIComponent(product.id)}`;
  const category = product.category || 'Украшение';

  return `
    <article class="home-popular-card">
      <a href="${productUrl}" class="home-popular-card__image" aria-label="Открыть товар ${escapeHtml(product.title)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : '<span>Фото скоро будет</span>'}
        <span class="home-popular-card__favorite" aria-hidden="true">♡</span>
        <div class="home-popular-card__dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </a>
      <div class="home-popular-card__info">
        <p>${escapeHtml(category)}</p>
        <h3>${escapeHtml(product.title)}</h3>
        <strong>${formatPrice(product.price)} ₽</strong>
      </div>
    </article>
  `;
}
