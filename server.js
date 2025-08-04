const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const path = require('path');

// Configure puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server
}));
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

const rateLimiterMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.round(rejRes.msBeforeNext / 1000)
    });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main scraping endpoint
app.post('/api/scrape', rateLimiterMiddleware, async (req, res) => {
  const { url, maxProducts = 10 } = req.body;

  // Validate input
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!isValidUrl(url) || !url.includes('amawell.sk')) {
    return res.status(400).json({ error: 'Invalid Amawell URL' });
  }

  if (maxProducts < 1 || maxProducts > 50) {
    return res.status(400).json({ error: 'maxProducts must be between 1 and 50' });
  }

  let browser = null;
  const startTime = Date.now();

  try {
    console.log(`Starting scrape for URL: ${url}`);
    
    // Launch browser with Railway-optimized settings
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.NODE_ENV === 'production' ? '/usr/bin/chromium-browser' : undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--no-zygote',
        '--single-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--no-zygote',
        '--single-process'
      ],
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ['--disable-extensions'],
    });

    const page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport(getRandomViewport());

    // Block unnecessary requests
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const blockDomains = [
        'demdex.net', '1rx.io', 'agkn.com', 'criteo.com', 
        'adobe.com', 'doubleclick.net', 'google-analytics.com',
        'googletagmanager.com', 'facebook.com', 'twitter.com'
      ];
      if (blockDomains.some((domain) => request.url().includes(domain))) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate to the URL
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });

    // Handle cookie consent
    await handleCookieConsent(page);

    // Check for CAPTCHA
    if (await checkForCaptcha(page)) {
      throw new Error('CAPTCHA detected');
    }

    // Simulate human behavior
    await simulateHumanBehavior(page);

    // Scroll to load more content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);
    }

    // Scrape products
    const products = await scrapeAllPlaceholders(page, maxProducts);
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    res.json({
      success: true,
      data: {
        scrapedUrl: url,
        products: products,
        totalProducts: products.length,
        maxProducts: maxProducts,
        duration: `${duration}ms`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Utility functions
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getRandomViewport() {
  const viewports = [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleCookieConsent(page) {
  const cookieSelectors = [
    '#btn-cookie-allow',
    '.cookie-notice__btn--accept',
    'button.accept-cookies',
  ];

  try {
    await page.waitForSelector('.cookie-notice, .cookie-consent, #cookie-notice', { timeout: 3000 });
    console.log('Cookie notice detected.');
  } catch {
    console.log('No cookie notice detected.');
    return;
  }

  try {
    await page.evaluate(() => {
      const notice = document.querySelector('.cookie-notice, .cookie-consent, #cookie-notice');
      if (notice) notice.style.display = 'none';
      const button = document.querySelector('#btn-cookie-allow');
      if (button) {
        button.removeAttribute('disabled');
        button.click();
      }
    });
    await delay(1000);
  } catch (error) {
    console.warn(`Failed to handle cookie consent: ${error.message}`);
  }
}

async function checkForCaptcha(page) {
  const captchaSelectors = [
    'div.g-recaptcha[style*="visibility: visible"]',
    'div[class*="captcha"][style*="display: block"]',
    '#recaptcha[style*="visibility: visible"]',
  ];
  for (const selector of captchaSelectors) {
    if (await page.$(selector)) {
      console.warn(`CAPTCHA detected with selector: ${selector}`);
      return true;
    }
  }
  return false;
}

async function simulateHumanBehavior(page) {
  try {
    await page.mouse.move(Math.random() * 300, Math.random() * 300);
    await page.evaluate(() => window.scrollBy(0, 200));
    console.log('Simulated human behavior.');
  } catch (error) {
    console.warn(`Failed to simulate human behavior: ${error.message}`);
  }
}

async function detectPlaceholders(page) {
  const placeholders = [
    {
      type: 'main-list',
      selector: '#amasty-shopby-product-list > div.products.wrapper.grid.products-grid > ol',
      label: 'Main Product Grid',
    },
  ];

  const detectedPlaceholders = [];
  for (const placeholder of placeholders) {
    const elements = await page.$$(placeholder.selector);
    if (elements.length > 0) {
      const productCount = await page.$$eval(
        `${placeholder.selector} li.item.product`,
        (items) => items.length
      );
      if (productCount > 0) {
        detectedPlaceholders.push(placeholder);
      }
    }
  }

  return detectedPlaceholders;
}

async function scrapeProductDetails(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`Navigated to product page: ${productUrl}`);

    if (await checkForCaptcha(page)) {
      throw new Error(`CAPTCHA detected on product page: ${productUrl}`);
    }

    await handleCookieConsent(page);
    await simulateHumanBehavior(page);

    await page.waitForSelector('.additional-attributes-wrapper', { timeout: 5000 }).catch(() => {
      console.warn(`Additional attributes table not found on ${productUrl}`);
    });

    const html = await page.content();
    const $ = cheerio.load(html);

    const productDetails = {};

    productDetails['product-name'] = $('.page-title .base').text().trim() || '';
    productDetails.price = $('.price-final_price .price')
      .text()
      .trim()
      .replace(/\s*€\s*/, '') || '';
    productDetails['stock-status'] = $('.stock.available .stock-available-wrapper span')
      .text()
      .trim() || '';
    productDetails['delivery-info'] = $('.stock-available-info').text().trim() || '';
    productDetails.sku = $('.product.attribute.sku .value').text().trim() || '';

    const attributeTable = $('.additional-attributes-wrapper table tbody tr');
    attributeTable.each((index, element) => {
      const key = $(element).find('th').text().trim();
      const value = $(element).find('td').text().trim();
      if (key && value) {
        const safeKey = key
          .toLowerCase()
          .replace(/[\s()]/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        productDetails[safeKey] = value;
      }
    });

    return productDetails;
  } catch (error) {
    console.warn(`Failed to scrape product details from ${productUrl}: ${error.message}`);
    return {};
  }
}

async function scrapeProducts(page, html, structure, maxProducts) {
  const $ = cheerio.load(html);
  const products = [];

  const productItems = $(structure.selector)
    .find('li.item.product')
    .slice(0, maxProducts);

  if (productItems.length === 0) {
    return products;
  }

  for (let index = 0; index < productItems.length; index++) {
    const element = productItems[index];
    const product = { placeholder: structure.label };
    const productLink = $(element).find('a.product-item-link');
    const imageContainer = $(element).find('.hover-image-container.product-image-container');
    const image = $(element).find('.product-image-photo');

    product.product_id = imageContainer
      .attr('class')
      ?.match(/product-image-container-(\d+)/)?.[1] || '';
    product['product-name'] = productLink.text().trim() || '';
    product.url = productLink.attr('href') || '';
    product.price = $(element).find('.price').text().trim() || '';
    product.is_new = $(element).find('.prolabels-wrapper .label-new').length > 0 ? 'Nové' : '';

    product.image = {
      src: image.attr('src') || '',
      srcset: image.attr('srcset') || '',
      sizes: image.attr('sizes') || '',
      alt: image.attr('alt') || '',
      width: image.attr('width') || '',
      height: image.attr('height') || '',
    };

    if (!product.product_id && !product['product-name'] && !product.url) {
      continue;
    }

    if (product.url && isValidUrl(product.url)) {
      console.log(`Scraping details for product: ${product['product-name'] || product.product_id}`);
      const details = await scrapeProductDetails(page, product.url);
      Object.assign(product, details);
    }

    products.push(product);
    await delay(1000);

    if (products.length >= maxProducts) break;
  }

  return products;
}

async function scrapeAllPlaceholders(page, maxProducts) {
  const placeholders = await detectPlaceholders(page);
  if (placeholders.length === 0) {
    console.warn('No valid placeholders with products found.');
    return [];
  }

  let allProducts = [];

  for (const structure of placeholders) {
    console.log(`Processing placeholder: ${structure.label}`);
    let products = [];

    await page.waitForSelector(structure.selector, { timeout: 10000 }).catch(() => {
      console.warn(`Placeholder ${structure.label} not found within 10 seconds.`);
    });
    
    let html = await page.content();
    products = await scrapeProducts(page, html, structure, maxProducts);
    
    if (products.length >= maxProducts) {
      allProducts = [...allProducts, ...products.slice(0, maxProducts)];
      break;
    }

    allProducts = [...allProducts, ...products];
  }

  return allProducts.slice(0, maxProducts);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Amawell scraper server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Scrape endpoint: POST http://localhost:${PORT}/api/scrape`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
}); 