const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request body validation middleware
app.use((req, res, next) => {
  if (req.is('application/json') && (!req.body || typeof req.body !== 'object')) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next();
});

// Puppeteer config for Railway
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
  // Prefer environment variable, otherwise use Puppeteer's bundled executable
  config.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
  return config;
};

// Global browser management
let globalBrowser = null;
let browserInitializing = false;

const initBrowser = async () => {
  if (globalBrowser && globalBrowser.isConnected()) {
    console.log('Re-using existing browser instance');
    return globalBrowser;
  }
  if (browserInitializing) {
    // Wait until initialization finishes
    while (!globalBrowser || !globalBrowser.isConnected()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return globalBrowser;
  }

  browserInitializing = true;
  console.log('Launching new browser instance...');
  globalBrowser = await puppeteer.launch(getPuppeteerConfig());
  console.log('Browser launched successfully');
  browserInitializing = false;
  return globalBrowser;
};

// Utility function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Cookie dismissal, captcha detection, placeholder detection, scraping logic...
// (Keep existing implementations for handleCookieConsent, checkForCaptcha, detectPlaceholders,
// scrapeAllPlaceholders, scrapeFromUrl, etc., unchanged.)

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('❤️ Health check hit');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        timestamp: new Date().toISOString()
      });
    }
    const outputData = await scrapeFromUrl(url);
    const duration = Date.now() - startTime;
    res.json({
      ...outputData,
      duration
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
      duration
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (globalBrowser) {
    await globalBrowser.close();
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Glamira scraper API running on port ${port}`);
});
