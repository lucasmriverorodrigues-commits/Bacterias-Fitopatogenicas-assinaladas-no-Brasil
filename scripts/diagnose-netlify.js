require('module').Module._initPaths();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const page = await browser.newPage();
  const logs = [];

  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message, stack: err.stack }));
  page.on('requestfailed', req => logs.push({
    type: 'requestfailed',
    url: req.url(),
    failure: req.failure() && req.failure().errorText
  }));

  const response = await page.goto('https://musical-kringle-2a564d.netlify.app/', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => ({
    title: document.title,
    body: document.body.innerText.slice(0, 1000),
    hasApp: !!window.app,
    appKeys: window.app ? Object.keys(window.app).slice(0, 20) : [],
    dbHosts: window.DATABASE && window.DATABASE.hosts ? window.DATABASE.hosts.length : null,
    photoDbKeys: window.PHOTO_DATABASE ? Object.keys(window.PHOTO_DATABASE).length : null,
    search: !!document.getElementById('smartSearch'),
    buttons: [...document.querySelectorAll('button')].slice(0, 10).map(b => b.innerText)
  }));

  let searchResult;
  try {
    await page.fill('#smartSearch', 'alface');
    await page.getByRole('button', { name: /^Buscar$/ }).click();
    await page.waitForTimeout(1000);
    searchResult = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  } catch (error) {
    searchResult = `SEARCH_ERROR ${error.message}`;
  }

  console.log(JSON.stringify({
    status: response.status(),
    state,
    logs,
    searchResult
  }, null, 2));

  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
