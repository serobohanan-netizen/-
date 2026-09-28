#!/usr/bin/env node
/*
 * Собирает один файл preview.html для просмотра дизайна без Google:
 * подставляет Styles.html и App.html в Index.html и добавляет демонстрационный сервер.
 * Запуск: node tools/build-preview.js <папка_для_результата>
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'apps-script');
const outDir = process.argv[2] || path.join(__dirname, '..', 'preview');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('Index.html').replace(/<\?!=\s*include\('(\w+)'\)\s*\?>/g, (_, name) => {
  if (name === 'App') {
    const mock = fs.readFileSync(path.join(__dirname, 'preview-mock.js'), 'utf8');
    return '<script>' + mock + '</script>\n' + read('App.html');
  }
  return read(name + '.html');
});
html = html.replace('<body>',
  '<body>\n<div style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99;background:#b3372a;color:#fff;' +
  'font:600 11px Montserrat,sans-serif;letter-spacing:.12em;padding:4px 12px;border-radius:0 0 8px 8px">' +
  'ДЕМОНСТРАЦИЯ ДИЗАЙНА · ЦИФРЫ ВЫМЫШЛЕННЫЕ</div>');

// Для просмотра без интернета шрифты встраиваются в файл (на настоящем сайте они грузятся из Google Fonts)
const { execSync } = require('child_process');
try {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
  const cssUrl = (html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/) || [])[1].replace(/&amp;/g, '&');
  let css = execSync(`curl -s -A "${ua}" "${cssUrl}"`).toString();
  css = css.replace(/url\((https:[^)]+)\)/g, (_, u) =>
    'url(data:font/woff2;base64,' + execSync(`curl -s "${u}"`).toString('base64') + ')');
  html = html.replace('</head>', '<style>' + css + '</style>\n</head>');
} catch (e) { console.warn('Шрифты не встроены: ' + e.message); }

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'preview.html'), html);
console.log('Готово: ' + path.join(outDir, 'preview.html'));
