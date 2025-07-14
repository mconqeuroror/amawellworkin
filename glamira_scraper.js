const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

const getDomain = (url) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace(/\./g, '_');
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
    if (await condition()) resolve();
    else if (Date.now() - start < ms) setTimeout(check, 50);
    else resolve();
  };
  check();
});

const getRandomUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

const getRandomViewport = () => {
  const viewports = [
    { width: 1280, height: 800 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

const loadCookies = async (page) => {
  // Cookie loading not needed for API context
  return true;
};

const saveCookies = async (page) => {
  // Cookie saving not needed for API context
};

const handleCookieConsent = async (page) => {
  const cookieSelectors = [
    'button[data-amgdprcookie-js="accept"]',
    '.amgdprcookie-button.-allow.-save',
  ];

  try {
    await page.waitForSelector('aside[data-role="gdpr-cookie-container"]', { timeout: 3000 });
    console.log('Cookie bar detected.');
  } catch {
    console.log('No cookie bar detected.');
    return true;
  }

  try {
    await page.evaluate(() => {
      const bar = document.querySelector('aside[data-role="gdpr-cookie-container"]');
      if (bar) bar.style.display = 'none';
      const button = document.querySelector('button[data-amgdprcookie-js="accept"]');
      if (button) {
        button.removeAttribute('disabled');
        button.click();
      }
    });
    await delay(1000);
    if (!await page.$('aside[data-role="gdpr-cookie-container"]')) {
      console.log('Cookie bar dismissed successfully.');
      await saveCookies(page);
      return true;
    }
  } catch (error) {
    console.warn(`Failed to force-dismiss cookie popup: ${error.message}`);
  }

  for (const selector of cookieSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      await delay(1000);
      if (!await page.$('aside[data-role="gdpr-cookie-container"]')) {
        console.log(`Cookie consent accepted with selector: ${selector}`);
        await saveCookies(page);
        return true;
      }
    } catch (error) {
      console.warn(`Failed to handle cookie consent with selector ${selector}`);
    }
  }

  console.log('Proceeding despite cookie popup.');
  return true;
};

const checkForCaptcha = async (page) => {
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
  console.log('No visible CAPTCHA detected.');
  return false;
};

const simulateHumanBehavior = async (page) => {
  try {
    await page.mouse.move(Math.random() * 300, Math.random() * 300);
    await page.evaluate(() => window.scrollBy(0, 200));
    console.log('Simulated human behavior.');
  } catch (error) {
    console.warn(`Failed to simulate human behavior: ${error.message}`);
  }
};

const detectPlaceholders = async (page) => {
  const placeholders = [
    { type: 'new-arrivals', selector: 'div[data-content-type="products"].slick-slider, div[data-content-type="products"][data-appearance="carousel"], div.slider-products', label: 'New Arrivals' },
    { type: 'best-sellers', selector: 'div[data-content-type="products"].snap-slider .product-item-info, div.item.product.product-item.snap-slider-item .product-item-info, div.product-item-media .product-item-info', label: 'Best Sellers' },
    { type: 'main-list', selector: '#maincontent > div.columns > div.column.main > div.products.wrapper.grid.products-grid > ol.products.list.items > li.item.product.product-item', label: 'Main List' },
    { type: 'standalone', selector: 'div[data-content-type="products"] .product-item-media .product-item-info, div[data-content-type="product"] .product-item-info, .product-item:not(.snap-slider-item):not(.products-grid .product-item) .product-item-info', label: 'Standalone Product' }
  ];

  const detectedPlaceholders = [];
  for (const placeholder of placeholders) {
    const elements = await page.$$(placeholder.selector);
    if (elements.length > 0) {
      const productCount = await page.$$eval(`${placeholder.selector} .product-item-info, ${placeholder.selector}`, items => items.length);
      console.log(`Detected placeholder: ${placeholder.label} with selector: ${placeholder.selector} (${elements.length} elements, ${productCount} potential products)`);
      if (productCount > 0) {
        detectedPlaceholders.push(placeholder);
      } else {
        console.warn(`No potential products found in ${placeholder.label}. Skipping.`);
      }
    }
  }

  if (detectedPlaceholders.length === 0) {
    console.warn('No product placeholders with products detected.');
    const potentialContainers = await page.$$eval('div[class*="product"], div[class*="item"], div[class*="slider"]', containers => containers.map(c => c.outerHTML.substring(0, 200)));
    console.log('Potential product containers:', potentialContainers);
  }
  return detectedPlaceholders;
};

const scrapeProducts = (html, structure, maxProducts = 10) => {
  const $ = cheerio.load(html);
  const products = [];
  const productIds = new Set(); // Track unique product IDs or URLs

  const productItems = $(structure.selector).slice(0, maxProducts);
  console.log(`Found ${productItems.length} product items in ${structure.label} (limited to ${maxProducts}).`);

  if (productItems.length === 0) {
    console.warn(`No product items found in ${structure.label}. Selector: ${structure.selector}`);
    return products;
  }

  productItems.each((index, element) => {
    const product = { placeholder: structure.label };
    const productLink = $(element).find('.product-link.img-product, a.product-link, a[href*="/product/"], a.product-item-link').first();
    product.product_id = productLink.data('product_id') || $(element).data('product_id') || $(element).find('[data-product-id]').data('product_id') || '';
    product.title = productLink.attr('title') || $(element).find('.product-name, .product-item-name, h2, h3, a.product-item-name').text().trim() || '';
    product.url = productLink.attr('href') || '';
    product.alloy = productLink.data('param')?.alloy || $(element).data('param')?.alloy || '';

    // Skip duplicates based on product_id or url
    const uniqueKey = product.product_id || product.url;
    if (productIds.has(uniqueKey)) {
      console.log(`Skipping duplicate product at index ${index} in ${structure.label}: ${product.title || uniqueKey}`);
      return;
    }
    productIds.add(uniqueKey);

    product.short_description = $(element).find('.short-description, .product-description').text().trim() || '';
    product.carat = $(element).find('.info_stone_total .carat, .carat').text().trim() || '';
    product.price = $(element).find('.price, .price-box .price').text().trim() || '';
    product.price_range = $(element).find('.price-range span, .price-range').text().trim() || '';
    product.is_new = $(element).find('.badge.is_new_msg, .new-label').length > 0 ? 'Nové' : '';

    try {
      product.data_param = productLink.data('param') || $(element).data('param') || {};
    } catch (error) {
      console.warn(`Failed to parse data-param for product at index ${index} in ${structure.label}: ${error.message}`);
      product.data_param = {};
    }

    const image = $(element).find('.product-image-photo, img.product-image, img:not(.skeleton)').first();
    product.image = {
      src: image.attr('src') || '',
      srcset: image.attr('srcset') || '',
      sizes: image.attr('sizes') || '',
      alt: image.attr('alt') || '',
      width: image.attr('width') || '',
      height: image.attr('height') || '',
    };

    const moreLink = $(element).find('.option_box.option-more a, a.view-more');
    product.more_variants = {
      count: moreLink.find('span').text().trim() || '',
      url: moreLink.attr('href') || '',
    };

    if (product.product_id || product.title || product.url) {
      products.push(product);
      console.log(`Scraped product ${products.length} in ${structure.label}: ${product.title || product.product_id || 'Unnamed'}`);
    } else {
      console.warn(`Skipping empty product at index ${index} in ${structure.label}`);
      const isSkeleton = $(element).find('img.skeleton').length > 0;
      console.log(`Skipped element is skeleton: ${isSkeleton}`);
    }
  });

  console.log(`Scraped ${products.length} valid products from ${structure.label}.`);
  return products;
};

const scrapeAllPlaceholders = async (page) => {
  const placeholders = await detectPlaceholders(page);
  if (placeholders.length === 0) {
    console.warn('No valid placeholders with products found. Stopping.');
    return [];
  }

  let allProducts = [];
  const maxProducts = 10;

  for (const structure of placeholders) {
    console.log(`Processing placeholder: ${structure.label}`);
    let products = [];
    let attempt = 0;
    const maxAttempts = 3;

    // Initial scroll for Best Sellers to trigger loading
    if (structure.type === 'best-sellers') {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(3000);
      await page.waitForSelector(`${structure.selector} img:not(.skeleton)`, { timeout: 10000 }).catch(() => {
        console.warn(`No non-skeleton images found in ${structure.label} after initial scroll.`);
      });
    }

    // Scrape with retries
    while (attempt < maxAttempts && products.length < maxProducts) {
      await page.waitForSelector(structure.selector, { timeout: 10000 }).catch(() => {
        console.warn(`Placeholder ${structure.label} not found within 10 seconds.`);
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(3000);
      await page.evaluate(() => {
        const event = new Event('scroll');
        window.dispatchEvent(event);
      });
      await page.waitForSelector(`${structure.selector} img:not(.skeleton)`, { timeout: 10000 }).catch(() => {
        console.warn(`No non-skeleton images found in ${structure.label}.`);
      });
      let html = await page.content();
      products = scrapeProducts(html, structure, maxProducts);
      if (products.length > 0) {
        console.log(`Found ${products.length} products in ${structure.label} on attempt ${attempt + 1}.`);
        break;
      }
      console.log(`No valid products found in ${structure.label} on attempt ${attempt + 1}. Retrying...`);
      attempt++;
    }

    // Handle carousel navigation for New Arrivals and Best Sellers
    if ((structure.type === 'new-arrivals' || structure.type === 'best-sellers') && products.length < maxProducts) {
      const nextButtonSelectors = structure.type === 'new-arrivals' 
        ? ['.nav__button-next', '[data-snap-slider-goto="next"]', '.slick-next:not(.slick-disabled)', '.carousel-next', 'button[aria-label*="next"]']
        : ['.snap-slider-nav [data-snap-slider-goto="next"]', '.nav__button-next', '.slick-next:not(.slick-disabled)', '.snap-slider-nav button:not([disabled])', 'button[aria-label*="next"]'];
      let clickCount = 0;
      const maxClicks = 5;

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
            console.log(`Button ${selector} for ${structure.label} visible: ${buttonVisible}`);
            if (!buttonVisible) {
              await page.evaluate((sel) => {
                const button = document.querySelector(sel);
                if (button) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, selector);
              await delay(1000);
            }
            await page.evaluate((sel) => {
              const button = document.querySelector(sel);
              if (button && !button.disabled) button.click();
            }, selector);
            await delay(3000);
            await page.waitForSelector(`${structure.selector} img:not(.skeleton)`, { timeout: 10000 }).catch(() => {
              console.warn(`No non-skeleton images found after click in ${structure.label}.`);
            });
            html = await page.content();
            const newProducts = scrapeProducts(html, structure, maxProducts - products.length);
            const productIds = new Set(products.map(p => p.product_id || p.url));
            products = [
              ...products,
              ...newProducts.filter(p => !productIds.has(p.product_id || p.url))
            ];
            // Clear and rebuild productIds set - THIS WAS THE CRITICAL FIX
            productIds.clear();
            products.forEach(p => productIds.add(p.product_id || p.url));
            if (products.length >= maxProducts) break;
            nextButton = await page.$(selector);
            clickCount++;
            console.log(`Attempted click on ${selector} for ${structure.label}, click ${clickCount}`);
          } catch (error) {
            console.warn(`Failed to click next button (${selector}) for ${structure.label}: ${error.message}`);
            break;
          }
        }
        if (products.length >= maxProducts) break;
      }
      console.log(`Clicked 'Next' button ${clickCount} times for ${structure.label}.`);
    }

    // Handle pagination for Main List
    if (structure.type === 'main-list' && products.length < maxProducts) {
      let nextButton = await page.$('.action.next, .pages-item-next a, .next-page');
      let pageCount = 0;
      const maxPages = 3;
      while (nextButton && pageCount < maxPages && products.length < maxProducts) {
        try {
          const buttonVisible = await page.evaluate(() => {
            const button = document.querySelector('.action.next, .pages-item-next a, .next-page');
            if (!button || button.disabled) return false;
            const rect = button.getBoundingClientRect();
            return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
          });
          console.log(`Button .action.next, .pages-item-next a, .next-page for ${structure.label} visible: ${buttonVisible}`);
          if (!buttonVisible) {
            await page.evaluate(() => {
              const button = document.querySelector('.action.next, .pages-item-next a, .next-page');
              if (button) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            await delay(1000);
          }
          await page.evaluate(() => {
            const button = document.querySelector('.action.next, .pages-item-next a, .next-page');
            if (button && !button.disabled) button.click();
          });
          await delay(3000);
          await page.waitForSelector(`${structure.selector} img:not(.skeleton)`, { timeout: 10000 }).catch(() => {
            console.warn(`No non-skeleton images found after pagination in ${structure.label}.`);
          });
          html = await page.content();
          const newProducts = scrapeProducts(html, structure, maxProducts - products.length);
          const productIds = new Set(products.map(p => p.product_id || p.url));
          products = [
            ...products,
            ...newProducts.filter(p => !productIds.has(p.product_id || p.url))
          ];
          // Clear and rebuild productIds set - THIS WAS THE CRITICAL FIX
          productIds.clear();
          products.forEach(p => productIds.add(p.product_id || p.url));
          if (products.length >= maxProducts) break;
          nextButton = await page.$('.action.next, .pages-item-next a, .next-page');
          pageCount++;
        } catch (error) {
          console.warn(`Failed to click next button for ${structure.label}: ${error.message}`);
          break;
        }
      }
      console.log(`Navigated ${pageCount} additional pages for ${structure.label}.`);
    }

    allProducts = [...allProducts, ...products.slice(0, maxProducts)];
  }

  return allProducts;
};

const scrapeFromUrl = async (targetUrl, browser = null) => {
  if (!isValidUrl(targetUrl) || !targetUrl.includes('glamira.sk')) {
    throw new Error(`Invalid Glamira URL: ${targetUrl}`);
  }

  let localBrowser;
  let attempt = 0;
  const retries = 2;

  while (attempt <= retries) {
    try {
      console.log(`Attempt ${attempt + 1}: Navigating to ${targetUrl}`);
      if (!browser) {
        localBrowser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      }
      const page = await (browser || localBrowser).newPage();

      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport(getRandomViewport());

      // Block resource-heavy requests to improve performance
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const blockDomains = [
          'demdex.net',
          '1rx.io',
          'agkn.com',
          'criteo.com',
          'adobe.com',
          'doubleclick.net',
          'googletagmanager.com',
          'google-analytics.com',
        ];
        if (blockDomains.some((domain) => request.url().includes(domain))) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await loadCookies(page);
      let finalUrl = targetUrl;
      page.on('response', (response) => {
        if (response.status() >= 300 && response.status() <= 399) {
          finalUrl = response.headers().location || finalUrl;
        }
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!finalUrl.includes('glamira.sk')) {
        throw new Error('Navigation ended on incorrect domain');
      }

      if (await checkForCaptcha(page)) {
        throw new Error('CAPTCHA detected');
      }

      await handleCookieConsent(page);
      await simulateHumanBehavior(page);
      await delay(4000);

      // Simulate scrolling to load more products
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(3000, async () => (await page.$$('.product-item-info, .product-item, li.item.product.product-item, .product-item-media, div[data-content-type="product"], .product, .item.product')).length >= 10);
        await page.evaluate(() => {
          const event = new Event('scroll');
          window.dispatchEvent(event);
        });
        await page.waitForSelector('.product-item-info img:not(.skeleton)', { timeout: 10000 }).catch(() => {
          console.warn('No non-skeleton images found after scroll.');
        });
        if ((await page.$$('.product-item-info img:not(.skeleton)')).length >= 10) break;
      }

      const products = await scrapeAllPlaceholders(page);
      console.log(`Scraping completed. Found ${products.length} products.`);

      const outputData = {
        scraped_url: targetUrl,
        total_products: products.length,
        products: products,
      };

      await page.close();
      return outputData;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
      attempt++;
      if (attempt > retries) {
        throw new Error(`Failed after ${retries + 1} attempts: ${error.message}`);
      }
      await delay(2000);
    } finally {
      if (localBrowser) {
        await localBrowser.close();
      }
    }
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`Starting scraping for ${url}`);
    const outputData = await scrapeFromUrl(url);
    res.json(outputData);
  } catch (error) {
    console.error(`Scraping failed for ${url}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Glamira scraper API running at http://localhost:${port}`);
});
