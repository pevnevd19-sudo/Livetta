const fs = require('fs');
const path = require('path');
const inn = String(process.argv[2] || '').trim();
if (!/^\d{10,12}$/.test(inn)) {
  console.error('Использование: node scripts/set-inn.js 123456789012');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
const pagesDir = path.join(root, 'pages');
for (const file of fs.readdirSync(pagesDir)) {
  if (!file.endsWith('.html')) continue;
  const full = path.join(pagesDir, file);
  const source = fs.readFileSync(full, 'utf8');
  const updated = source
    .replaceAll('ВСТАВИТЬ ИНН ПЕРЕД ЗАПУСКОМ', inn)
    .replaceAll('ВСТАВИТЬ ИНН', inn);
  fs.writeFileSync(full, updated, 'utf8');
}
console.log('ИНН добавлен в HTML-страницы. Проверьте документы перед публикацией.');
