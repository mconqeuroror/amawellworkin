const { join } = require('path');
module.exports = {
  cacheDirectory: process.env.NODE_ENV === 'production' ? '/app/.cache/puppeteer' : join(__dirname, '.cache', 'puppeteer'),
};
