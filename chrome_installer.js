const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Installing Chrome for Puppeteer...');

try {
  // Install Chrome browser
  console.log('📦 Installing Chrome browser...');
  execSync('npx puppeteer browsers install chrome', { 
    stdio: 'inherit',
    timeout: 300000 // 5 minutes timeout
  });
  
  console.log('✅ Chrome installation completed successfully!');
  
  // Verify installation
  const cacheDir = path.join(process.cwd(), '.cache', 'puppeteer');
  if (fs.existsSync(cacheDir)) {
    console.log('📁 Cache directory exists:', cacheDir);
    const contents = fs.readdirSync(cacheDir);
    console.log('📂 Cache contents:', contents);
  }
  
} catch (error) {
  console.error('❌ Chrome installation failed:', error.message);
  
  // Try alternative installation
  try {
    console.log('🔄 Trying alternative installation method...');
    execSync('npm install puppeteer --force', { stdio: 'inherit' });
    console.log('✅ Alternative installation completed!');
  } catch (altError) {
    console.error('❌ Alternative installation also failed:', altError.message);
    process.exit(1);
  }
}