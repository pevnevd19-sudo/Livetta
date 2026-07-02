# Публикация Livetta на Majordomo

## 1. Что нужно до загрузки

- Домен, например `livettajew.ru`.
- Тариф/сервер с Node.js и SSH.
- Доступ к панели Majordomo.
- Доступ к файлам сайта по SFTP/FTP или через файловый менеджер.

Сайт Livetta нельзя публиковать как полностью статический сайт: ему нужен Node.js, потому что используются `server.js`, API, корзина, заказы, база SQLite и админ-панель.

## 2. Какие файлы загружать

Загружайте всю папку сайта, кроме:

- `node_modules/`
- старых архивов из `backups/`, если они не нужны на сервере
- локальных временных файлов

Обязательные папки и файлы:

- `server.js`
- `package.json`
- `package-lock.json`
- `pages/`
- `css/`
- `js/`
- `img/`
- `data/`
- `uploads/`
- `robots.txt`
- `sitemap.xml`
- `.env`

## 3. Настроить `.env` на сервере

Скопируйте `.env.production.example` в `.env` и замените значения:

```env
NODE_ENV=production
SITE_URL=https://YOUR_DOMAIN.ru
PORT=3000
JWT_SECRET=PASTE_LONG_RANDOM_SECRET_32_PLUS_CHARS
ADMIN_LOGIN=owner
ADMIN_PASSWORD=PASTE_STRONG_ADMIN_PASSWORD
SELLER_INN=781165194751
SELLER_EMAIL=livettajewerly@yandex.ru
SELLER_PHONE=+79062281944
PAYMENT_DEMO_MODE=false
```

Важно: `SELLER_INN` должен быть реальным, без заглушки.

## 4. Установить зависимости

В папке сайта на сервере:

```bash
npm install --omit=dev
```

## 5. Запустить Node.js

Если доступен PM2:

```bash
npm install -g pm2
pm2 start server.js --name livetta
pm2 save
```

Если Majordomo даёт отдельную настройку Node.js-приложения, укажите:

- стартовый файл: `server.js`
- команду запуска: `npm start`
- порт: значение из `.env`, обычно `3000`

## 6. Подключить домен и HTTPS

В панели Majordomo:

1. Привяжите домен к сайту.
2. Включите SSL/Let's Encrypt.
3. Проверьте, что сайт открывается по `https://YOUR_DOMAIN.ru`.

## 7. Проверить страницы

Откройте:

```text
https://YOUR_DOMAIN.ru/
https://YOUR_DOMAIN.ru/catalog.html
https://YOUR_DOMAIN.ru/cart.html
https://YOUR_DOMAIN.ru/checkout.html
https://YOUR_DOMAIN.ru/constructor.html
https://YOUR_DOMAIN.ru/admin.html
https://YOUR_DOMAIN.ru/robots.txt
https://YOUR_DOMAIN.ru/sitemap.xml
```

## 8. Проверить заказ

1. Добавьте товар в корзину.
2. Перейдите к оформлению.
3. Заполните данные.
4. Оформите тестовый заказ.
5. Проверьте заказ в `admin.html`.

## 9. Добавить сайт в Яндекс

1. Откройте `https://webmaster.yandex.ru/`.
2. Добавьте сайт `https://YOUR_DOMAIN.ru`.
3. Подтвердите права через DNS, HTML-файл или meta-тег.
4. Добавьте sitemap:

```text
https://YOUR_DOMAIN.ru/sitemap.xml
```

## 10. После публикации

- Подключите Яндекс Метрику и добавьте ID в `YANDEX_METRIKA_ID`.
- Подключите ЮKassa и добавьте `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`.
- В ЮKassa укажите webhook:

```text
https://YOUR_DOMAIN.ru/api/payments/yookassa/webhook
```
