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

// Railway-compatible Puppeteer configuration
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
  return config;
};

// Global browser instance management
let globalBrowser = null;
let browserInitializing = false;

const getBrowser = async () => {
  if (globalBrowser && globalBrowser.connected) {
    return globalBrowser;
  }

  if (browserInitializing) {
    while (browserInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return globalBrowser;
  }

  browserInitializing = true;
  try {
    console.log('Launching new browser instance...');
    globalBrowser = await puppeteer.launch(getPuppeteerConfig());
    
    globalBrowser.on('disconnected', () => {
      console.log('Browser disconnected');
      globalBrowser = null;
    });

    console.log('Browser launched successfully');
    return globalBrowser;
  } catch (error) {
    console.error('Failed to launch browser:', error);
    throw error;
  } finally {
    browserInitializing = false;
  }
};

const getSubcategory = (url) => {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes('glamira.sk')) {
      return 'unknown';
    }
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    return pathParts[0].split('-')[0] || 'unknown';
  } catch {
    return 'unknown';
  }
};

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const delay = (ms, condition = null) => new Promise((resolve) => {
  if (!condition) return setTimeout(resolve, ms);
  const start = Date.now();
  const check = async () => {
    try {
      if (await condition()) resolve();
      else if (Date.now() - start < ms) setTimeout(check, 100);
      else resolve();
    } catch (error) {
      resolve(); // Resolve on error to avoid hanging
    }
  };
  check();
});

const getRandomUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

const getRandomViewport = () => {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

const handleCookieConsent = async (page) => {
  try {
    await page.waitForSelector('aside[data-role="gdpr-cookie-container"], .cookie-notice, #cookie-notice', { timeout: 3000 });
    
    await page.evaluate(() => {
      const notices = document.querySelectorAll('aside[data-role="gdpr-cookie-container"], .cookie-notice, #cookie-notice');
      notices.forEach(notice => notice.style.display = 'none');
      
      const button = document.querySelector('button[data-amgdprcookie-js="accept"], .amgdprcookie-button.-allow.-save');
      if (button) {
        button.removeAttribute('disabled');
        button.click();
      }
    });
    
    await delay(1000);
    console.log('Cookie consent handled');
  } catch (error) {
    console.log('No cookie notice found or already handled');
  }
};

const checkForCaptcha = async (page) => {
  try {
    const captchaSelectors = [
      'div.g-recaptcha[style*="visibility: visible"]',
      'div[class*="captcha"][style*="display: block"]',
      '#recaptcha[style*="visibility: visible"]',
      '.captcha-container'
    ];
    
    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) {
        console.log(`CAPTCHA detected with selector: ${selector}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn('Error checking for CAPTCHA:', error.message);
    return false;
  }
};

const simulateHumanBehavior = async (page) => {
  try {
    if (page.isClosed()) {
      console.warn('Page is closed, skipping human behavior simulation');
      return;
    }
    
    await page.mouse.move(Math.random() * 300 + 100, Math.random() * 300 + 100);
    await page.evaluate(() => window.scrollBy(0, 200));
    await delay(500);
  } catch (error) {
    console.warn(`Failed to simulate human behavior: ${error.message}`);
  }
};

const detectPlaceholders = async (page) => {
  try {
    const placeholders = [
      {
        type: 'main-list',
        selector: '#maincontent > div.columns > div.column.main > div.products.wrapper.grid.products-grid > ol.products.list.items',
        label: 'Main Product Grid',
      },
      {
        type: 'carousel',
        selector: 'div[data-content-type="products"].slick-slider, div.slider-products',
        label: 'Product Carousel',
      },
    ];

    const detectedPlaceholders = [];
    for (const placeholder of placeholders) {
      try {
        const elements = await page.$$(placeholder.selector);
        if (elements.length > 0) {
          const productCount = await page.$$eval(
            `${placeholder.selector} li.item.product, ${placeholder.selector} .product-item-info`,
            (items) => items.length
          ).catch(() => 0);
          
          if (productCount > 0) {
            detectedPlaceholders.push(placeholder);
            console.log(`Found ${productCount} products in ${placeholder.label}`);
          }
        }
      } catch (error) {
        console.warn(`Error checking placeholder ${placeholder.label}:`, error.message);
      }
    }
    return detectedPlaceholders;
  } catch (error) {
    console.error('Error detecting placeholders:', error);
    return [];
  }
};

const scrapeProducts = async (page, html, structure, maxProducts = 10) => {
  try {
    const $ = cheerio.load(html);
    const products = [];
    const productIds = new Set();

    const productItems = $(structure.selector).find('li.item.product, .product-item-info').slice(0, maxProducts);
    console.log(`Found ${productItems.length} product items to scrape in ${structure.label}`);

    for (let index = 0; index < productItems.length; index++) {
      try {
        const element = productItems[index];
        const product = { placeholder: structure.label };
        const productLink = $(element).find('a.product-item-link, a[href*="/product/"]');
        const image = $(element).find('.product-image-photo, img.product-image');

        product.product_id = $(element).data('product-id') || productLink.data('product_id') || '';
        product['product-name'] = productLink.text().trim() || $(element).find('.product-item-name').text().trim() || '';
        product.url = productLink.attr('href') || '';
        product.price = $(element).find('.price-box .price').text().trim() || '';
        product.is_new = $(element).find('.badge.is_new_msg').length > 0 ? 'Nové' : '';

        const uniqueKey = product.product_id || product.url;
        if (productIds.has(uniqueKey)) {
          console.log(`Skipping duplicate product: ${product['product-name'] || uniqueKey}`);
          continue;
        }
        productIds.add(uniqueKey);

        product.image = {
          src: image.attr('src') || '',
          srcset: image.attr('srcset') || '',
          sizes: image.attr('sizes') || '',
          alt: image.attr('alt') || '',
          width: image.attr('width') || '',
          height: image.attr('height') || '',
        };

        if (product.product_id || product['product-name'] || product.url) {
          products.push(product);
          console.log(`Scraped product ${products.length}: ${product['product-name'] || product.product_id}`);
        } else {
          console.log(`Skipping product ${index + 1} - no essential data`);
        }

        await delay(800);
      } catch (error) {
        console.warn(`Error scraping product ${index + 1}:`, error.message);
        continue;
      }
    }

    console.log(`Successfully scraped ${products.length} products from ${structure.label}`);
    return products;
  } catch (error) {
    console.error('Error in scrapeProducts:', error);
    return [];
  }
};

const scrapeAllPlaceholders = async (page) => {
  try {
    const placeholders = await detectPlaceholders(page);
    if (placeholders.length === 0) {
      console.log('No placeholders detected');
      return [];
    }

    let allProducts = [];
    const maxProducts = 10;

    for (const structure of placeholders) {
      try {
        console.log(`Processing placeholder: ${structure.label}`);
        
        await page.waitForSelector(structure.selector, { timeout: 10000 }).catch(() => {
          console.log(`Selector ${structure.selector} not found within timeout`);
        });
        
        let html = await page.content();
        let products = await scrapeProducts(page, html, structure, maxProducts);
        
        if (products.length >= maxProducts) {
          allProducts = [...allProducts, ...products.slice(0, maxProducts)];
          continue;
        }

        if (structure.type === 'main-list' && products.length < maxProducts) {
          console.log(`Trying to load more products. Current count: ${products.length}`);
          
          let pageCount = 0;
          const maxPages = 2;
          
          while (pageCount < maxPages && products.length < maxProducts) {
            try {
              const nextButton = await page.$('.action.next, .pages-item-next a');
              if (!nextButton) {
                console.log('No next button found');
                break;
              }
              
              const isClickable = await page.evaluate(() => {
                const button = document.querySelector('.action.next, .pages-item-next a');
                return button && !button.disabled && button.offsetParent !== null;
              });
              
              if (!isClickable) {
                console.log('Next button not clickable');
                break;
              }
              
              console.log(`Clicking next button (page ${pageCount + 1})`);
              await page.click('.action.next, .pages-item-next a');
              
              await delay(3000);
              
              html = await page.content();
              const newProducts = await scrapeProducts(page, html, structure, maxProducts - products.length);
              
              const existingUrls = new Set(products.map(p => p.url));
              const uniqueNewProducts = newProducts.filter(p => !existingUrls.has(p.url));
              
              products = [...products, ...uniqueNewProducts];
              pageCount++;
              
              console.log(`Page ${pageCount} loaded. Total products: ${products.length}`);
              
              if (uniqueNewProducts.length === 0) {
                console.log('No new products found, breaking');
                break;
              }
            } catch (error) {
              console.warn(`Error loading page ${pageCount + 1}:`, error.message);
              break;
            }
          }
        }

        if (structure.type === 'carousel' && products.length < maxProducts) {
          let clickCount = 0;
          const maxClicks = 3;
          const nextButtonSelectors = ['.slick-next:not(.slick-disabled)', '.nav__button-next', '[data-snap-slider-goto="next"]'];
          
          for (const selector of nextButtonSelectors) {
            let nextButton = await page.$(selector);
            while (nextButton && clickCount < maxClicks && products.length < maxProducts) {
              try {
                const buttonVisible = await page.evaluate((sel) => {
                  const button = document.querySelector(sel);
                  if (!button || button.disabled) return false;
                  const rect = button.getBoundingClientRect();
                  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
                }, selector);
                
                if (!buttonVisible) {
                  await page.evaluate((sel) => {
                    const button = document.querySelector(sel);
                    if (button) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, selector);
                  await delay(1000);
                }
                
                await page.click(selector);
                await delay(3000);
                
                html = await page.content();
                const newProducts = await scrapeProducts(page, html, structure, maxProducts - products.length);
                
                const existingUrls = new Set(products.map(p => p.url));
                const uniqueNewProducts = newProducts.filter(p => !existingUrls.has(p.url));
                
                products = [...products, ...uniqueNewProducts];
                clickCount++;
                
                console.log(`Carousel click ${clickCount} for ${structure.label}. Total products: ${products.length}`);
                
                nextButton = await page.$(selector);
              } catch (error) {
                console.warn(`Failed to click carousel button (${selector}): ${error.message}`);
                break;
              }
            }
            if (products.length >= maxProducts) break;
          }
        }

        allProducts = [...allProducts, ...products.slice(0, maxProducts)];
        console.log(`Total products collected: ${allProducts.length}`);
        
      } catch (error) {
        console.error(`Error processing placeholder ${structure.label}:`, error);
        continue;
      }
    }

    return allProducts;
  } catch (error) {
    console.error('Error in scrapeAllPlaceholders:', error);
    return [];
  }
};

const scrapeFromUrl = async (targetUrl) => {
  if (!isValidUrl(targetUrl) || !targetUrl.includes('glamira.sk')) {
    throw new Error(`Invalid Glamira URL: ${targetUrl}`);
  }

  let page = null;
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Scraping attempt ${attempt + 1}/${maxRetries} for: ${targetUrl}`);
      
      const browser = await getBrowser();
      page = await browser.newPage();

      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport(getRandomViewport());

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const blockDomains = [
          'demdex.net', '1rx.io', 'agkn.com', 'criteo.com', 
          'adobe.com', 'doubleclick.net', 'facebook.com',
          'google-analytics.com', 'googletagmanager.com'
        ];
        const resourceType = request.resourceType();
        
        if (blockDomains.some(domain => request.url().includes(domain)) ||
            ['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      console.log(`Navigating to: ${targetUrl}`);
      await page.goto(targetUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      });

      if (await checkForCaptcha(page)) {
        throw new Error('CAPTCHA detected');
      }

      await handleCookieConsent(page);
      await simulateHumanBehavior(page);

      console.log('Waiting for products to load...');
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);
        
        const productCount = await page.$$eval('li.item.product, .product-item-info', items => items.length).catch(() => 0);
        console.log(`Products found: ${productCount}`);
        
        if (productCount >= 5) break;
      }

      const products = await scrapeAllPlaceholders(page);
      
      const outputData = {
        scrapedurl: targetUrl,
        products: products,
        timestamp: new Date().toISOString(),
        success: true
      };

      console.log(`Scraping completed successfully. Found ${products.length} products.`);
      return outputData;
      
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt === maxRetries - 1) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      await delay(2000 * (attempt + 1));
      
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
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

    console.log(`Starting scraping for: ${url}`);
    const outputData = await scrapeFromUrl(url);
    
    const duration = Date.now() - startTime;
    console.log(`Scraping completed in ${duration}ms`);
    
    res.json({
      ...outputData,
      duration: duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Scraping failed after ${duration}ms:`, error.message);
    
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (globalBrowser) {
    await globalBrowser.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (globalBrowser) {
    await globalBrowser.close();
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Glamira scraper API running at http://localhost:${port}`);
});
