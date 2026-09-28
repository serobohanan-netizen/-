#!/usr/bin/env node
/*
 * Снимки экранов демонстрационного просмотра.
 * node tools/screenshot.js <preview.html> <папка> <вид> [тема] [логин] [ширина]
 * вид: login | summary | tasks | products | templates | calc
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [file, outDir, view, theme = 'dark', login = 'vladelec', width = '1440'] = process.argv.slice(2);
  const mobile = Number(width) < 800;
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy });
  const page = await browser.newPage({
    viewport: { width: Number(width), height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 2 : 1
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((t) => localStorage.setItem('hl_theme', t), theme);
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(600);
  await page.evaluate(() => document.fonts.ready);
  if (view !== 'login') {
    await page.fill('#lg', login);
    await page.fill('#pw', 'demo');
    await page.click('#loginForm .btn');
    await page.waitForSelector('.nav');
    await page.click(`.nav button[data-view="${view}"]`);
    await page.waitForTimeout(900);
    if (process.env.CLICK) { await page.click(process.env.CLICK); await page.waitForTimeout(500); }
    if (process.env.FILL) {
      for (const [sel, value] of Object.entries(JSON.parse(process.env.FILL))) await page.fill(sel, value);
      await page.waitForTimeout(300);
    }
  }
  const name = `${view}-${theme}-${login}-${width}${process.env.CLICK ? '-click' : ''}${process.env.FILL ? '-fill' : ''}.png`;
  await page.screenshot({ path: path.join(outDir, name), fullPage: !mobile && !process.env.VIEWPORT });
  if (errors.length) console.error('Ошибки страницы:', errors);
  console.log(name);
  await browser.close();
})();
