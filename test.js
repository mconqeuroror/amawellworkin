const http = require('http');

// Test health endpoint
function testHealth() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ Health check passed:', response);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Test scrape endpoint
function testScrape() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      url: 'https://www.amawell.sk/prstene/',
      maxProducts: 1
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/scrape',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            console.log('✅ Scrape test passed:', {
              totalProducts: response.data.totalProducts,
              duration: response.data.duration
            });
          } else {
            console.log('❌ Scrape test failed:', response.error);
          }
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('🧪 Running server tests...\n');
  
  try {
    await testHealth();
    console.log('');
    await testScrape();
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running
testHealth().then(() => {
  runTests();
}).catch((error) => {
  console.error('❌ Server not running. Please start the server first:');
  console.error('   npm start');
  process.exit(1);
}); 