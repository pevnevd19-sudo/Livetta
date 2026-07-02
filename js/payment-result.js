const { escapeHtml, formatPrice } = window.Livetta;

const params = new URLSearchParams(location.search);
const orderId = params.get('order');
const token = params.get('token');
const resultText = document.querySelector('#paymentResultText');
const resultDetails = document.querySelector('#paymentResultDetails');

initPaymentResult();

function initPaymentResult() {
  if (!orderId || !token) {
    setResultText('Заказ оформлен. Мы свяжемся с вами.');
    return;
  }

  loadPaymentResult();
}

async function loadPaymentResult() {
  try {
    if (params.get('demo') === '1') {
      await fetch(`/api/demo/pay/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
    }

    const response = await fetch(`/api/orders/public/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`);
    const order = await response.json();

    if (!response.ok) {
      throw new Error(order.message || 'Заказ не найден');
    }

    renderPaymentStatus(order);
  } catch (error) {
    setResultText(error.message);
  }
}

function renderPaymentStatus(order) {
  if (order.payment_status === 'succeeded') {
    setResultText('Оплата подтверждена. Мы приступаем к заказу.');
  } else if (order.status === 'awaiting_shipping_quote') {
    setResultText('Заказ сохранён. Мы рассчитаем доставку и свяжемся с вами.');
  } else {
    setResultText('Заказ сохранён. Статус оплаты обновится после подтверждения платёжным сервисом.');
  }

  if (!resultDetails) return;

  resultDetails.innerHTML = `
    <div class="payment-result__card">
      <span>Заказ №${escapeHtml(order.id)}</span>
      <strong>${formatPrice(order.total)} ₽</strong>
      ${Number(order.discount_total) > 0 ? `<small>${escapeHtml(order.promo_label || 'Скидка')}: −${formatPrice(order.discount_total)} ₽</small>` : ''}
      <small>Статус: ${escapeHtml(order.status)}</small>
    </div>
  `;
}

function setResultText(message) {
  if (resultText) {
    resultText.textContent = message;
  }
}
