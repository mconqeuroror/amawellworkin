const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request body validation middleware
app.use((req, res, next) => {
  if (req.method === 'POST' && req.is('application/json')) {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
  }
  next();
});

// Puppeteer config for Railway (and local)
const getPuppeteerConfig = () => {
  const config = {
    headless: 'new',
    defaultViewport: null,
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
      '--memory-pressure-off',
      '--max_old_space_size=4096'
    ],
    ignoreHTTPSErrors: true,
    timeout: 30000
  };
  // Prefer an explicit override, otherwise use Puppeteer’s downloaded Chromium
  config.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
  return config;
};

// Global browser management
let globalBrowser = null;
let browserInitializing = false;

const getBrowser = async () => {
  if (globalBrowser && globalBrowser.isConnected()) {
    console.log('Re‑using existing browser instance');
    return globalBrowser;
  }
  if (browserInitializing) {
    // Wait for takeover by the initializing call
    while (!globalBrowser || !globalBrowser.isConnected()) {
      await new Promise(r => setTimeout(r, 100));
    }
    return globalBrowser;
  }
  browserInitializing = true;
  try {
    console.log('Launching new browser instance…');
    globalBrowser = await puppeteer.launch(getPuppeteerConfig());
    globalBrowser.on('disconnected', () => {
      console.warn('⚠️ Browser disconnected');
      globalBrowser = null;
    });
    console.log('Browser launched successfully');
    return globalBrowser;
  } catch (err) {
    console.error('Failed to launch browser:', err);
    throw err;
  } finally {
    browserInitializing = false;
  }
};

// Simple delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

// Helper functions (unchanged from your original code)
// — isValidUrl, getRandomUserAgent, getRandomViewport,
// — handleCookieConsent, checkForCaptcha, detectPlaceholders,
// — scrapeAllPlaceholders

const isValidUrl = url => {
  try { new URL(url); return true; }
  catch { return false; }
};

const getRandomUserAgent = () => {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '\
+ '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '\
+ '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
};

const getRandomViewport = () => {
  const viewports = [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 }
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

async function handleCookieConsent(page) {
  try {
    const btn = await page.$('button.accept-cookies, button#onetrust-accept-btn-handler');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(500);
      console.log('🍪 Cookie consent accepted');
    }
  } catch (e) {
    console.warn('No cookie banner found:', e.message);
  }
}

async function checkForCaptcha(page) {
  const selectors = [
    'div[class*="captcha"][style*="display: block"]',
    '#recaptcha[style*="visibility: visible"]'
  ];
  for (let sel of selectors) {
    try {
      if (await page.$(sel)) {
        console.warn('🚨 CAPTCHA detected:', sel);
        return true;
      }
    } catch (e) { /* ignore */ }
  }
  return false;
}

function detectPlaceholders(html) {
  const $ = cheerio.load(html);
  const placeholders = [];
  $('.loading-placeholder').each((i, el) => {
    placeholders.push({
      html: $.html(el),
      url: $(el).attr('data-src')
    });
  });
  return placeholders;
}

async function scrapeAllPlaceholders(browser, placeholders) {
  const results = [];
  for (let ph of placeholders) {
    const p = await browser.newPage();
    await p.setContent(ph.html, { waitUntil: 'networkidle2' });
    const $$ = cheerio.load(await p.content());
    $$('.product-item').each((i, el) => {
      // extract product fields...
      const link = $$(el).find('a.product-link').attr('href');
      results.push({ url: new URL(link, 'https://glamira.sk').href });
    });
    await p.close();
  }
  return results;
}

// Main scrape logic
const scrapeFromUrl = async (targetUrl) => {
  if (!isValidUrl(targetUrl) || !targetUrl.includes('glamira.sk')) {
    throw new Error(`Invalid Glamira URL: ${targetUrl}`);
  }
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());
  await page.setViewport(getRandomViewport());
  await page.setRequestInterception(true);

  page.on('request', req => {
    const blockedTypes = ['image','stylesheet','font','media'];
    const blockedDomains = ['doubleclick.net','googletagmanager.com','google-analytics.com'];
    if (blockedTypes.includes(req.resourceType()) ||
        blockedDomains.some(d => req.url().includes(d))) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await handleCookieConsent(page);
  if (await checkForCaptcha(page)) {
    throw new Error('CAPTCHA encountered');
  }

  const html = await page.content();
  let products = [];
  const placeholders = detectPlaceholders(html);
  if (placeholders.length) {
    console.log(`Found ${placeholders.length} placeholders — scraping each…`);
    products = await scrapeAllPlaceholders(browser, placeholders);
  } else {
    console.log('No placeholders — parsing inline HTML');
    const $ = cheerio.load(html);
    $('.product-item').each((i, el) => {
      const a = $(el).find('a.product-link');
      const href = a.attr('href');
      products.push({ url: new URL(href, 'https://glamira.sk').href });
    });
  }

  await page.close();
  return {
    url: targetUrl,
    count: products.length,
    products
  };
};

// Health check
app.get('/health', (req, res) => {
  console.log('❤️ Health check hit');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

// Scrape endpoint
app.post('/scrape', async (req, res) => {
  const start = Date.now();
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const data = await scrapeFromUrl(url);
    const duration = Date.now() - start;
    res.json({ ...data, duration });
  } catch (err) {
    const duration = Date.now() - start;
    console.error('Error in /scrape:', err);
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString(),
      duration
    });
  }
});

// Graceful shutdown
async function shutdown() {
  if (globalBrowser) await globalBrowser.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
app.listen(port, () => {
  console.log(`🚀 Glamira scraper API running on port ${port}`);
});
