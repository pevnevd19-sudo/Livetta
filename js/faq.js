const faqSearch = document.querySelector('#faqSearch');
const faqStatus = document.querySelector('#faqSearchStatus');
const faqItems = Array.from(document.querySelectorAll('[data-faq-item]'));
const faqSections = Array.from(document.querySelectorAll('.faq-section'));

faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) {
      return;
    }

    const currentList = item.closest('.faq-list');

    currentList?.querySelectorAll('[data-faq-item][open]').forEach((otherItem) => {
      if (otherItem !== item) {
        otherItem.open = false;
      }
    });
  });
});

faqSearch?.addEventListener('input', () => {
  const query = faqSearch.value.trim().toLocaleLowerCase('ru');
  let visibleCount = 0;

  faqItems.forEach((item) => {
    const text = item.textContent.toLocaleLowerCase('ru');
    const isVisible = !query || text.includes(query);

    item.hidden = !isVisible;

    if (isVisible) {
      visibleCount += 1;
    } else {
      item.open = false;
    }
  });

  faqSections.forEach((section) => {
    const visibleItems = Array.from(section.querySelectorAll('[data-faq-item]'))
      .filter((item) => !item.hidden);

    section.hidden = visibleItems.length === 0;
  });

  if (!query) {
    faqStatus.textContent = '';
    return;
  }

  faqStatus.textContent = visibleCount
    ? `Найдено вопросов: ${visibleCount}`
    : 'По вашему запросу ничего не найдено. Попробуйте изменить формулировку.';
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
