// glamira_scraper.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');
const { URL } = require('url');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ————————————————
// Validate incoming JSON
// ————————————————
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/scrape') {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request: `url` must be a non-empty string',
        timestamp: new Date().toISOString(),
      });
    }
  }
  next();
});

// ————————————————
// Puppeteer configuration
// ————————————————
const getPuppeteerConfig = () => {
  return {
    headless: true,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--memory-pressure-off'
    ],
    // Point at system-installed Chromium when running in production
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium'
  };
};

// ————————————————
// Global browser singleton
// ————————————————
let globalBrowser = null;
let browserInitializing = false;

const getBrowser = async () => {
  if (globalBrowser && globalBrowser.isConnected()) {
    return globalBrowser;
  }
  if (browserInitializing) {
    // wait for the in-flight launch
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (!browserInitializing) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
    return globalBrowser;
  }
  browserInitializing = true;
  try {
    console.log('▶️  Launching browser...');
    globalBrowser = await puppeteer.launch(getPuppeteerConfig());
    globalBrowser.on('disconnected', () => {
      console.log('⚠️  Browser disconnected');
      globalBrowser = null;
    });
    console.log('✅ Browser launched');
    return globalBrowser;
  } catch (err) {
    console.error('❌ Launch error:', err);
    throw err;
  } finally {
    browserInitializing = false;
  }
};

// ————————————————
// Helpers (random UA, viewport, delay, etc.)
// ————————————————
const getRandomUserAgent = () => {
  const list = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)…Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)…Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0)…Firefox/89.0',
  ];
  return list[Math.floor(Math.random() * list.length)];
};

const getRandomViewport = () => {
  const viewports = [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

const delay = ms => new Promise(res => setTimeout(res, ms));

const isValidUrl = str => {
  try { new URL(str); return true; }
  catch { return false; }
};

// (You can keep your existing handleCookieConsent, checkForCaptcha,
// simulateHumanBehavior, detectPlaceholders implementations here…)

// ————————————————
// Scrape and normalize products
// ————————————————
const scrapeProducts = (html, structure, maxProducts = 10, baseUrl) => {
  const $ = cheerio.load(html);
  const products = [];
  const seen = new Set();
  const items = $(structure.selector).slice(0, maxProducts);

  items.each((_, el) => {
    const $el = $(el);
    const link = $el
      .find('a.product-item-link, .product-link.img-product, a[href*="/product/"]')
      .first();

    const rawHref = link.attr('href') || '';
    const absoluteUrl = rawHref.startsWith('http')
      ? rawHref
      : `${baseUrl}${rawHref}`;

    const id = link.attr('data-product-id') || '';
    const paramRaw = link.attr('data-param') || $el.attr('data-param') || '{}';
    let dataParam;
    try { dataParam = JSON.parse(paramRaw); }
    catch { dataParam = {}; }

    const title = link.attr('title') ||
      $el.find('.product-item-name, h2, h3, a.product-item-name').text().trim();

    const key = id || absoluteUrl;
    if (seen.has(key)) return;
    seen.add(key);

    products.push({
      placeholder: structure.label,
      product_id: id,
      title,
      url: absoluteUrl,
      alloy: dataParam.alloy || '',
      data_param: dataParam,
      short_description: $el.find('.short-description, .product-description').text().trim(),
      carat: $el.find('.info_stone_total .carat, .carat').text().trim(),
      price: $el.find('.price, .price-box .price').text().trim(),
      price_range: $el.find('.price-range span, .price-range').text().trim(),
      is_new: $el.find('.badge.is_new_msg, .new-label').length > 0 ? 'Nové' : '',
      image: {
        src: $el.find('.product-image-photo, img.product-image, img:not(.skeleton)').first().attr('src') || '',
        alt: $el.find('.product-image-photo, img.product-image').first().attr('alt') || '',
      },
      more_variants: {
        count: $el.find('.option_box.option-more a span').text().trim(),
        url: $el.find('.option_box.option-more a').attr('href') || ''
      },
    });
  });

  return products;
};

// ————————————————
// Orchestrate placeholders ➔ scrapeProducts
// ————————————————
const scrapeAllPlaceholders = async (page, baseUrl) => {
  const placeholders = await detectPlaceholders(page);
  let all = [];
  for (const structure of placeholders) {
    // … your retry/scroll logic …
    const html = await page.content();
    const items = scrapeProducts(html, structure, 10, baseUrl);
    all = all.concat(items);
  }
  return all;
};

// ————————————————
// Main scrape flow
// ————————————————
const scrapeFromUrl = async (targetUrl) => {
  if (!isValidUrl(targetUrl) || !targetUrl.includes('glamira.sk')) {
    throw new Error(`Invalid Glamira URL: ${targetUrl}`);
  }

  const baseUrl = new URL(targetUrl).origin;
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(getRandomUserAgent());
  await page.setViewport(getRandomViewport());
  await page.setRequestInterception(true);

  // (your request block domains / resourceType logic…)

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (await checkForCaptcha(page)) throw new Error('CAPTCHA detected');
  await handleCookieConsent(page);
  await simulateHumanBehavior(page);

  // (your scroll-to-load loop…)

  const products = await scrapeAllPlaceholders(page, baseUrl);
  return {
    scraped_url: targetUrl,
    total_products: products.length,
    products,
    timestamp: new Date().toISOString(),
    success: true
  };
};

// ————————————————
// Express endpoint & shutdown
// ————————————————
app.post('/scrape', async (req, res) => {
  const t0 = Date.now();
  try {
    const result = await scrapeFromUrl(req.body.url);
    res.json({ ...result, duration: Date.now() - t0 });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString(),
      duration: Date.now() - t0
    });
  }
});

process.on('SIGTERM', async () => {
  if (globalBrowser) await globalBrowser.close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`🚀 Glamira scraper API running on port ${port}`);
});
