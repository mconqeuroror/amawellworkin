const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request validation
app.use((req, res, next) => {
  if (req.method === 'POST' && req.is('application/json')) {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
  }
  next();
});

// Chrome executable finder
const findChromeExecutable = () => {
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN
  ];

  for (const chromePath of possiblePaths) {
    if (chromePath && fs.existsSync(chromePath)) {
      console.log(`✅ Found Chrome at: ${chromePath}`);
      return chromePath;
    }
  }

  // Check Puppeteer cache
  const cacheDir = '/app/.cache/puppeteer';
  if (fs.existsSync(cacheDir)) {
    try {
      const findChrome = (dir) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const result = findChrome(fullPath);
            if (result) return result;
          } else if (item === 'chrome' || item === 'chromium') {
            return fullPath;
          }
        }
        return null;
      };
      
      const chromeInCache = findChrome(cacheDir);
      if (chromeInCache) {
        console.log(`✅ Found Chrome in cache: ${chromeInCache}`);
        return chromeInCache;
      }
    } catch (error) {
      console.warn('⚠️ Error searching cache:', error.message);
    }
  }

  console.warn('⚠️ Chrome executable not found, using system default');
  return null;
};

// Puppeteer configuration
const getPuppeteerConfig = () => {
  const executablePath = findChromeExecutable();
  
  return {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
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
      '--disable-blink-features=AutomationControlled'
    ],
    executablePath: executablePath || undefined,
    ignoreHTTPSErrors: true,
    timeout: 30000
  };
};

// Global browser management
let globalBrowser = null;

const getBrowser = async () => {
  if (globalBrowser && globalBrowser.connected) {
    return globalBrowser;
  }
  
  console.log('🚀 Launching browser...');
  const config = getPuppeteerConfig();
  console.log('🔧 Browser config:', { 
    executablePath: config.executablePath,
    headless: config.headless 
  });
  
  globalBrowser = await puppeteer.launch(config);
  
  globalBrowser.on('disconnected', () => {
    console.log('🔌 Browser disconnected');
    globalBrowser = null;
  });
  
  console.log('✅ Browser launched successfully');
  return globalBrowser;
};

// Utility functions
const getRandomUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isValidUrl = (url) => {
  try {
    new URL(url);
    return url.includes('glamira.sk');
  } catch {
    return false;
  }
};

// Cookie consent handler
const handleCookieConsent = async (page) => {
  try {
    await page.waitForSelector('aside[data-role="gdpr-cookie-container"]', { timeout: 3000 });
    console.log('🍪 Cookie bar detected, handling...');
    
    await page.evaluate(() => {
      const button = document.querySelector('button[data-amgdprcookie-js="accept"]');
      if (button) {
        button.click();
        return true;
      }
      return false;
    });
    
    await delay(1000);
    console.log('✅ Cookie consent handled');
  } catch {
    console.log('ℹ️ No cookie bar detected');
  }
};

// Product detection and scraping
const detectProductStructures = async (page) => {
  const structures = [
    { 
      type: 'main-grid', 
      selector: '.products.list.items .product-item',
      label: 'Main Product Grid' 
    },
    { 
      type: 'carousel', 
      selector: '.slick-slider .product-item',
      label: 'Product Carousel' 
    },
    { 
      type: 'featured', 
      selector: '[data-content-type="products"] .product-item',
      label: 'Featured Products' 
    }
  ];
  
  const detected = [];
  
  for (const structure of structures) {
    try {
      const elements = await page.$$(structure.selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} products in ${structure.label}`);
        detected.push(structure);
      }
    } catch (error) {
      console.warn(`⚠️ Error checking ${structure.label}:`, error.message);
    }
  }
  
  return detected;
};

const scrapeProducts = (html, structure, maxProducts = 20) => {
  const $ = cheerio.load(html);
  const products = [];
  const productItems = $(structure.selector).slice(0, maxProducts);
  
  console.log(`🔍 Scraping ${productItems.length} products from ${structure.label}`);
  
  productItems.each((index, element) => {
    try {
      const $element = $(element);
      
      // Basic product info
      const titleElement = $element.find('.product-item-name a, .product-name a, a[title]').first();
      const title = titleElement.attr('title') || titleElement.text().trim();
      const url = titleElement.attr('href') || '';
      
      if (!title && !url) return; // Skip if no basic info
      
      const product = {
        title: title,
        url: url,
        placeholder: structure.label
      };
      
      // Product ID
      product.product_id = $element.find('[data-product-id]').data('product-id') || 
                          titleElement.data('product-id') || '';
      
      // Price information
      const priceElement = $element.find('.price, .price-box .price').first();
      product.price = priceElement.text().trim() || '';
      
      // Image
      const imageElement = $element.find('.product-image-photo, img.product-image').first();
      product.image = {
        src: imageElement.attr('src') || '',
        alt: imageElement.attr('alt') || '',
        srcset: imageElement.attr('srcset') || ''
      };
      
      // Additional info
      product.description = $element.find('.product-item-description, .short-description').text().trim() || '';
      product.is_new = $element.find('.badge, .new-label').length > 0;
      
      // Carat info if available
      product.carat = $element.find('.carat, .info_stone_total').text().trim() || '';
      
      // Variants/options
      const moreLink = $element.find('.option-more a, .view-more').first();
      product.more_variants = {
        count: moreLink.find('span').text().trim() || '',
        url: moreLink.attr('href') || ''
      };
      
      products.push(product);
      
    } catch (error) {
      console.warn(`⚠️ Error scraping product ${index}:`, error.message);
    }
  });
  
  return products;
};

// Main scraping function
const scrapeGlamira = async (targetUrl) => {
  if (!isValidUrl(targetUrl)) {
    throw new Error('Invalid Glamira URL provided');
  }
  
  let page = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    
    // Configure page
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const blockTypes = ['image', 'stylesheet', 'font', 'media'];
      const blockDomains = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net'];
      
      if (blockTypes.includes(resourceType) || 
          blockDomains.some(domain => request.url().includes(domain))) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    console.log(`🌐 Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 30000 
    });
    
    // Handle cookie consent
    await handleCookieConsent(page);
    
    // Wait for products to load
    console.log('⏳ Waiting for products to load...');
    await page.waitForSelector('.product-item, .product', { timeout: 15000 });
    
    // Scroll to load more content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);
    }
    
    // Detect and scrape products
    const structures = await detectProductStructures(page);
    
    if (structures.length === 0) {
      throw new Error('No product structures detected on the page');
    }
    
    const html = await page.content();
    let allProducts = [];
    
    for (const structure of structures) {
      const products = scrapeProducts(html, structure, 20);
      allProducts = [...allProducts, ...products];
    }
    
    // Remove duplicates based on URL or title
    const uniqueProducts = allProducts.filter((product, index, arr) => 
      arr.findIndex(p => p.url === product.url || p.title === product.title) === index
    );
    
    console.log(`✅ Successfully scraped ${uniqueProducts.length} unique products`);
    
    return {
      scraped_url: targetUrl,
      total_products: uniqueProducts.length,
      products: uniqueProducts,
      timestamp: new Date().toISOString(),
      success: true
    };
    
  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    throw error;
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
  }
};

// API Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Glamira Scraper API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      debug: 'GET /debug',
      scrape: 'POST /scrape'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    chrome_path: findChromeExecutable(),
    node_version: process.version
  });
});

app.get('/debug', (req, res) => {
  const chromePath = findChromeExecutable();
  const cacheDir = '/app/.cache/puppeteer';
  let cacheInfo = { exists: false, contents: [] };
  
  if (fs.existsSync(cacheDir)) {
    try {
      cacheInfo = {
        exists: true,
        contents: fs.readdirSync(cacheDir)
      };
    } catch (error) {
      cacheInfo.error = error.message;
    }
  }
  
  res.json({
    chrome_executable: chromePath,
    cache_directory: cacheInfo,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_BIN: process.env.CHROME_BIN,
      PORT: process.env.PORT
    },
    puppeteer_config: getPuppeteerConfig()
  });
});

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL is required in request body',
        example: { url: 'https://www.glamira.sk/sperky-zvyk/' }
      });
    }
    
    console.log(`🎯 Scraping request for: ${url}`);
    
    const result = await scrapeGlamira(url);
    const duration = Date.now() - startTime;
    
    res.json({
      ...result,
      duration_ms: duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Scraping error:', error.message);
    
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      success: false
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available_endpoints: ['/', '/health', '/debug', '/scrape']
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`📴 Received ${signal}, shutting down gracefully...`);
  
  if (globalBrowser) {
    try {
      await globalBrowser.close();
      console.log('✅ Browser closed successfully');
    } catch (error) {
      console.error('❌ Error closing browser:', error.message);
    }
  }
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(port, () => {
  console.log(`🚀 Glamira Scraper API running on port ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎯 Chrome executable: ${findChromeExecutable() || 'system default'}`);
  console.log(`📱 Health check: http://localhost:${port}/health`);
  console.log(`🔍 Debug info: http://localhost:${port}/debug`);
});