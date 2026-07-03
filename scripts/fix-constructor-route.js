const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const serverPath = path.join(projectRoot, 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('Не найден server.js. Запустите скрипт из папки проекта.');
  process.exit(1);
}

let source = fs.readFileSync(serverPath, 'utf8');

if (/app\.get\(\s*['\"]\/constructor['\"]/.test(source) || source.includes("app.get(['/constructor'")) {
  console.log('Маршрут /constructor уже существует. Изменения не нужны.');
  process.exit(0);
}

const route = `\n// Livetta: extensionless constructor route\napp.get(['/constructor', '/constructor/'], (req, res) => {\n  const pagesFile = path.join(pagesDir, 'constructor.html');\n  const rootFile = path.join(frontendDir, 'constructor.html');\n  const target = fs.existsSync(pagesFile) ? pagesFile : rootFile;\n\n  if (!fs.existsSync(target)) {\n    return res.status(404).send('Страница конструктора не найдена');\n  }\n\n  return res.sendFile(target);\n});\n`;

const markers = [
  "app.get('/robots.txt'",
  'app.get("/robots.txt"',
  "app.use((req,res)=>{if(req.path.startsWith('/api/'))",
  "app.use((req, res) => {\n  if (req.path.startsWith('/api/'))"
];

let inserted = false;
for (const marker of markers) {
  const index = source.indexOf(marker);
  if (index >= 0) {
    source = source.slice(0, index) + route + '\n' + source.slice(index);
    inserted = true;
    break;
  }
}

if (!inserted) {
  console.error('Не удалось определить место вставки маршрута. server.js не изменён.');
  process.exit(1);
}

const backupPath = `${serverPath}.before-constructor-fix`;
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(serverPath, backupPath);
}
fs.writeFileSync(serverPath, source, 'utf8');
console.log('Готово: маршрут http://localhost:3000/constructor добавлен.');
console.log(`Резервная копия: ${path.basename(backupPath)}`);
